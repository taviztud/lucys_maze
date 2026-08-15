import { spawnSync } from 'node:child_process';
import { readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ffmpegPath from 'ffmpeg-static';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const audioDirectory = path.resolve(scriptDirectory, '../src/assets/audio/bg');
const command = process.argv[2];
const force = process.argv.includes('--force');

async function listFiles(extension) {
    const entries = await readdir(audioDirectory, { withFileTypes: true });
    return entries
        .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === extension)
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
}

function stem(filename) {
    return path.basename(filename, path.extname(filename));
}

async function isMp3(filename) {
    const data = await readFile(path.join(audioDirectory, filename));
    const hasId3Header = data.subarray(0, 3).toString('ascii') === 'ID3';
    const hasFrameSync = data.length >= 2 && data[0] === 0xff && (data[1] & 0xe0) === 0xe0;
    return data.length > 0 && (hasId3Header || hasFrameSync);
}

async function isOpusOgg(filename) {
    const data = await readFile(path.join(audioDirectory, filename));
    return data.length > 0
        && data.subarray(0, 4).toString('ascii') === 'OggS'
        && data.indexOf(Buffer.from('OpusHead')) >= 0;
}

async function verify() {
    const entries = await readdir(audioDirectory, { withFileTypes: true });
    const temporaryFiles = entries.filter((entry) => entry.isFile() && entry.name.includes('.tmp.'));
    if (temporaryFiles.length > 0) {
        throw new Error(`Temporary audio files found: ${temporaryFiles.map((entry) => entry.name).join(', ')}`);
    }

    const mp3Files = await listFiles('.mp3');
    const oggFiles = await listFiles('.ogg');
    if (mp3Files.length === 0) {
        throw new Error(`No MP3 source files found in ${audioDirectory}`);
    }

    const mp3Stems = new Set(mp3Files.map(stem));
    const oggStems = new Set(oggFiles.map(stem));
    const missingOgg = [...mp3Stems].filter((name) => !oggStems.has(name));
    const missingMp3 = [...oggStems].filter((name) => !mp3Stems.has(name));

    if (missingOgg.length > 0 || missingMp3.length > 0) {
        throw new Error([
            missingOgg.length > 0 ? `Missing Ogg: ${missingOgg.join(', ')}` : '',
            missingMp3.length > 0 ? `Missing MP3: ${missingMp3.join(', ')}` : ''
        ].filter(Boolean).join('\n'));
    }

    for (const filename of mp3Files) {
        if (!(await isMp3(filename))) {
            throw new Error(`Invalid MP3 header: ${filename}`);
        }
    }
    for (const filename of oggFiles) {
        if (!(await isOpusOgg(filename))) {
            throw new Error(`Invalid Ogg/Opus header: ${filename}`);
        }
    }

    const mp3Bytes = (await Promise.all(mp3Files.map(async (filename) => (await stat(path.join(audioDirectory, filename))).size)))
        .reduce((total, size) => total + size, 0);
    const oggBytes = (await Promise.all(oggFiles.map(async (filename) => (await stat(path.join(audioDirectory, filename))).size)))
        .reduce((total, size) => total + size, 0);

    console.log(`Audio verified: ${mp3Files.length} MP3/Ogg pairs`);
    console.log(`MP3: ${(mp3Bytes / 1024 / 1024).toFixed(2)} MiB`);
    console.log(`Opus/Ogg: ${(oggBytes / 1024 / 1024).toFixed(2)} MiB`);
}

async function convert() {
    if (!ffmpegPath) {
        throw new Error('ffmpeg-static did not provide an executable for this platform');
    }

    const mp3Files = await listFiles('.mp3');
    if (mp3Files.length === 0) {
        throw new Error(`No MP3 source files found in ${audioDirectory}`);
    }

    let converted = 0;
    for (const filename of mp3Files) {
        const name = stem(filename);
        const inputPath = path.join(audioDirectory, filename);
        const outputPath = path.join(audioDirectory, `${name}.ogg`);
        const temporaryPath = path.join(audioDirectory, `${name}.tmp.ogg`);

        try {
            if (!force) {
                await stat(outputPath);
                continue;
            }
        } catch {
            // Missing output: convert it.
        }

        await rm(temporaryPath, { force: true });
        console.log(`Converting ${filename} -> ${name}.ogg`);
        const result = spawnSync(ffmpegPath, [
            '-hide_banner',
            '-loglevel', 'error',
            '-y',
            '-i', inputPath,
            '-map', '0:a:0',
            '-vn',
            '-map_metadata', '-1',
            '-c:a', 'libopus',
            '-b:a', '48k',
            '-vbr', 'on',
            '-compression_level', '10',
            '-application', 'audio',
            '-ac', '2',
            temporaryPath
        ], { stdio: 'inherit' });

        if (result.error || result.status !== 0) {
            await rm(temporaryPath, { force: true });
            throw result.error ?? new Error(`FFmpeg failed for ${filename} with exit code ${result.status}`);
        }

        await rename(temporaryPath, outputPath);
        converted++;
    }

    console.log(`Conversion complete: ${converted} generated, ${mp3Files.length - converted} already present`);
    await verify();
}

try {
    if (command === 'convert') {
        await convert();
    } else if (command === 'verify') {
        await verify();
    } else {
        throw new Error('Usage: node scripts/audio-assets.mjs <convert|verify> [--force]');
    }
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
