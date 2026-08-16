import { createHash } from 'node:crypto';
import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const playerAssetDirectory = path.resolve(scriptDirectory, '../src/assets/sprites/player');
const sourcePath = path.join(playerAssetDirectory, 'source/lucy-idle-source.png');
const outputImagePath = path.join(playerAssetDirectory, 'lucy-idle.png');
const outputAtlasPath = path.join(playerAssetDirectory, 'lucy-idle.json');
const command = process.argv[2];

const layout = Object.freeze({
    columns: 4,
    rows: 2,
    bottomPadding: 4,
    minimumTopPadding: 2,
    horizontalPadding: 4,
    cellAlignment: 16,
    animationPrefix: 'idle_'
});

function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}

async function decodeRgba(input) {
    const metadata = await sharp(input).metadata();
    if (metadata.format !== 'png' || !metadata.hasAlpha) {
        throw new Error('The player source must be a PNG with an alpha channel.');
    }

    const { data, info } = await sharp(input)
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

    if (info.channels !== 4) throw new Error(`Expected RGBA input, received ${info.channels} channels.`);
    return { data, width: info.width, height: info.height };
}

function findAlphaBounds(image, left, top, right, bottom) {
    let minX = right;
    let minY = bottom;
    let maxX = -1;
    let maxY = -1;

    for (let y = top; y < bottom; y++) {
        for (let x = left; x < right; x++) {
            const alpha = image.data[((y * image.width + x) * 4) + 3];
            if (alpha === 0) continue;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        }
    }

    if (maxX < minX || maxY < minY) throw new Error(`No visible pixels found in source cell ${left},${top}.`);
    return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function copyFrame(source, target, bounds, destinationX, destinationY, targetWidth) {
    for (let y = 0; y < bounds.height; y++) {
        const sourceStart = (((bounds.y + y) * source.width + bounds.x) * 4);
        const sourceEnd = sourceStart + (bounds.width * 4);
        const targetStart = (((destinationY + y) * targetWidth + destinationX) * 4);
        source.data.copy(target, targetStart, sourceStart, sourceEnd);
    }
}

function roundUp(value, alignment) {
    return Math.ceil(value / alignment) * alignment;
}

function createAtlas(frameCount, frameSize) {
    const frames = {};
    for (let index = 0; index < frameCount; index++) {
        const name = `${layout.animationPrefix}${index.toString().padStart(2, '0')}`;
        frames[name] = {
            frame: {
                x: (index % layout.columns) * frameSize,
                y: Math.floor(index / layout.columns) * frameSize,
                w: frameSize,
                h: frameSize
            },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: frameSize, h: frameSize },
            sourceSize: { w: frameSize, h: frameSize }
        };
    }

    return {
        frames,
        meta: {
            app: 'lucys-maze player sprite pipeline',
            version: '1.0',
            image: path.basename(outputImagePath),
            format: 'RGBA8888',
            size: {
                w: layout.columns * frameSize,
                h: layout.rows * frameSize
            },
            scale: '1'
        }
    };
}

async function createNormalizedAssets() {
    const source = await decodeRgba(sourcePath);
    const frameCount = layout.columns * layout.rows;
    const sourceFrames = [];

    for (let row = 0; row < layout.rows; row++) {
        const sourceTop = Math.round(row * source.height / layout.rows);
        const sourceBottom = Math.round((row + 1) * source.height / layout.rows);

        for (let column = 0; column < layout.columns; column++) {
            const sourceLeft = Math.round(column * source.width / layout.columns);
            const sourceRight = Math.round((column + 1) * source.width / layout.columns);
            sourceFrames.push(findAlphaBounds(source, sourceLeft, sourceTop, sourceRight, sourceBottom));
        }
    }

    const requiredWidth = Math.max(...sourceFrames.map(({ width }) => width)) + (layout.horizontalPadding * 2);
    const requiredHeight = Math.max(...sourceFrames.map(({ height }) => height)) + layout.bottomPadding + layout.minimumTopPadding;
    const frameSize = roundUp(Math.max(requiredWidth, requiredHeight), layout.cellAlignment);
    const outputWidth = layout.columns * frameSize;
    const outputHeight = layout.rows * frameSize;
    const output = Buffer.alloc(outputWidth * outputHeight * 4, 0);
    const diagnostics = [];

    for (let row = 0; row < layout.rows; row++) {
        for (let column = 0; column < layout.columns; column++) {
            const index = row * layout.columns + column;
            const bounds = sourceFrames[index];

            const frameLeft = column * frameSize;
            const frameTop = row * frameSize;
            const destinationX = frameLeft + Math.floor((frameSize - bounds.width) / 2);
            const destinationY = frameTop + frameSize - layout.bottomPadding - bounds.height;
            copyFrame(source, output, bounds, destinationX, destinationY, outputWidth);

            diagnostics.push({
                frame: index,
                source: bounds,
                destination: {
                    x: destinationX - frameLeft,
                    y: destinationY - frameTop,
                    baseline: frameSize - layout.bottomPadding - 1
                }
            });
        }
    }

    const image = await sharp(output, {
        raw: { width: outputWidth, height: outputHeight, channels: 4 }
    }).png({ compressionLevel: 9, palette: false }).toBuffer();
    const atlas = Buffer.from(`${JSON.stringify(createAtlas(frameCount, frameSize), null, 2)}\n`);
    return { image, atlas, diagnostics, frameSize };
}

async function writeAtomically(filePath, contents) {
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, contents);
    try {
        await rename(temporaryPath, filePath);
    } catch (error) {
        throw new Error(`Could not activate ${path.basename(filePath)}: ${error instanceof Error ? error.message : error}`);
    }
}

async function build() {
    const generated = await createNormalizedAssets();
    await writeAtomically(outputImagePath, generated.image);
    await writeAtomically(outputAtlasPath, generated.atlas);
    console.table(generated.diagnostics);
    await verify();
}

async function verify() {
    const temporaryFiles = (await readdir(playerAssetDirectory)).filter((name) => name.endsWith('.tmp'));
    if (temporaryFiles.length > 0) throw new Error(`Temporary sprite files found: ${temporaryFiles.join(', ')}`);

    const [actualImage, actualAtlasBuffer] = await Promise.all([
        readFile(outputImagePath),
        readFile(outputAtlasPath)
    ]);

    const actualAtlas = JSON.parse(actualAtlasBuffer.toString('utf8'));
    const metadata = await sharp(actualImage).metadata();
    const frameSize = 288;
    const expectedWidth = layout.columns * frameSize;
    const expectedHeight = layout.rows * frameSize;
    if (metadata.width !== expectedWidth || metadata.height !== expectedHeight || !metadata.hasAlpha) {
        throw new Error(`Invalid normalized sheet: expected transparent ${expectedWidth}x${expectedHeight} PNG.`);
    }

    for (let index = 0; index < layout.columns * layout.rows; index++) {
        const name = `${layout.animationPrefix}${index.toString().padStart(2, '0')}`;
        if (!actualAtlas.frames || !actualAtlas.frames[name]) {
            throw new Error(`Missing frame ${name} in ${path.basename(outputAtlasPath)}`);
        }
    }

    console.log(`Player sprites verified: ${layout.columns * layout.rows} frames, ${frameSize}x${frameSize}`);
    console.log(`Sheet SHA-256: ${sha256(actualImage)}`);
}

try {
    if (command === 'build') await build();
    else if (command === 'verify') await verify();
    else throw new Error('Usage: node scripts/player-sprites.mjs <build|verify>');
} catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
}
