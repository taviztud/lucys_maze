import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const assetDirectory = path.resolve(scriptDirectory, '../src/assets/sprites/enemies');
const assetNames = ['worm_walk', 'lelar_idle', 'spider_walk'];

for (const name of assetNames) {
    const imagePath = path.join(assetDirectory, `${name}.png`);
    const atlasPath = path.join(assetDirectory, `${name}.json`);
    const atlas = JSON.parse(await readFile(atlasPath, 'utf8'));
    const image = await sharp(imagePath).metadata();
    if (!image.width || !image.height || !image.hasAlpha) {
        throw new Error(`${name}: expected a transparent PNG.`);
    }
    if (atlas.meta?.image !== `${name}.png`) throw new Error(`${name}: meta.image mismatch.`);
    if (atlas.meta?.size?.w !== image.width || atlas.meta?.size?.h !== image.height) {
        throw new Error(`${name}: atlas dimensions do not match its PNG.`);
    }

    const frameNames = Object.keys(atlas.frames ?? {});
    if (frameNames.length !== 8) throw new Error(`${name}: expected 8 frames, found ${frameNames.length}.`);
    for (let index = 0; index < 8; index++) {
        const frameName = `frame_${String(index).padStart(2, '0')}`;
        const frame = atlas.frames[frameName]?.frame;
        if (!frame) throw new Error(`${name}: missing ${frameName}.`);
        if (frame.x < 0 || frame.y < 0 || frame.w <= 0 || frame.h <= 0
            || frame.x + frame.w > image.width || frame.y + frame.h > image.height) {
            throw new Error(`${name}: ${frameName} is outside the PNG.`);
        }
    }

    const animation = atlas.anims?.[0];
    if (!animation || animation.frames?.length !== 8) throw new Error(`${name}: invalid animation sequence.`);
    if (!(animation.frameRate > 0) || animation.repeat < -1) throw new Error(`${name}: invalid playback configuration.`);
    for (const frame of animation.frames) {
        if (frame.key !== name || !atlas.frames[String(frame.frame)]) {
            throw new Error(`${name}: animation references ${frame.key}/${String(frame.frame)}.`);
        }
    }
    console.log(`${name}: 8 valid frames in ${image.width}x${image.height}, ${animation.frameRate} FPS`);
}
