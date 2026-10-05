import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { SFX_CATALOG, SFX_IDS } from '../src/audio/sfxCatalog';
import { encodeWav, getSfxDuration, renderSfx } from '../src/audio/sfxSynth';

// Writes every synthesized effect as a WAV file so it can be auditioned
// without playing the game. The game itself never loads these files.
const outputDirectory = path.resolve(process.argv[2] ?? 'test-results/sfx');

await mkdir(outputDirectory, { recursive: true });
for (const id of SFX_IDS) {
    const definition = SFX_CATALOG[id];
    const file = path.join(outputDirectory, `${id}.wav`);
    await writeFile(file, Buffer.from(encodeWav(renderSfx(definition))));
    console.log(`${id.padEnd(10)} ${(getSfxDuration(definition) * 1000).toFixed(0).padStart(5)} ms  ${file}`);
}
