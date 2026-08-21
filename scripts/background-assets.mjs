import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetDirectory = path.resolve(scriptDirectory, '../src/assets/sprites/tiles/backgrounds');
const expectedFiles = ['forest_entrance.png', 'maze_approach.png', 'temple_floor.png'];
const actualFiles = (await readdir(assetDirectory)).filter((name) => name.toLowerCase().endsWith('.png')).sort();

if (actualFiles.join('|') !== [...expectedFiles].sort().join('|')) {
    throw new Error(`Background set mismatch. Expected ${expectedFiles.join(', ')}; found ${actualFiles.join(', ')}.`);
}

for (const fileName of expectedFiles) {
    const metadata = await sharp(path.join(assetDirectory, fileName)).metadata();
    if (metadata.format !== 'png' || !metadata.width || !metadata.height) {
        throw new Error(`${fileName}: expected a decodable PNG.`);
    }
    if (metadata.width !== metadata.height || metadata.width < 960) {
        throw new Error(`${fileName}: expected a square image at least 960 px wide.`);
    }
    if ((metadata.channels ?? 0) < 3) {
        throw new Error(`${fileName}: expected an RGB or RGBA image.`);
    }
    console.log(`${fileName}: valid ${metadata.width}x${metadata.height} ${metadata.space ?? 'unknown'} PNG`);
}
