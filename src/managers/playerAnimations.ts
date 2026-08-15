import Phaser from 'phaser';
import idleAtlasUrl from '../assets/sprites/player/lucy-idle.json?url';
import idleSheetUrl from '../assets/sprites/player/lucy-idle.png?url';
import { calculateSpriteScale } from '../utils/Utils';

export const PLAYER_IDLE_TEXTURE_KEY = 'player:idle-texture';
export const PLAYER_IDLE_ANIMATION_KEY = 'player:idle';
export const PLAYER_IDLE_FRAME_RATE = 6;

const IDLE_FRAME_PREFIX = 'idle_';

export function preloadPlayerAnimations(scene: Phaser.Scene): void {
    if (!scene.textures.exists(PLAYER_IDLE_TEXTURE_KEY)) {
        scene.load.atlas(PLAYER_IDLE_TEXTURE_KEY, idleSheetUrl, idleAtlasUrl);
    }
}

export function registerPlayerAnimations(scene: Phaser.Scene): void {
    if (scene.anims.exists(PLAYER_IDLE_ANIMATION_KEY)) return;

    scene.anims.create({
        key: PLAYER_IDLE_ANIMATION_KEY,
        frames: getIdleFrameNames(scene).map((frame) => ({
            key: PLAYER_IDLE_TEXTURE_KEY,
            frame
        })),
        frameRate: PLAYER_IDLE_FRAME_RATE,
        repeat: -1
    });
}

export function getFirstIdleFrame(scene: Phaser.Scene): string {
    return getIdleFrameNames(scene)[0];
}

export function playPlayerIdle(sprite: Phaser.GameObjects.Sprite): void {
    sprite.play(PLAYER_IDLE_ANIMATION_KEY, true);
}

export function calculatePlayerVisualScale(
    scene: Phaser.Scene,
    textureKey: string,
    targetSize: number,
    frameName?: string | number
): number {
    return calculateSpriteScale(textureKey, targetSize, scene, frameName);
}

function getIdleFrameNames(scene: Phaser.Scene): string[] {
    const frames = scene.textures
        .get(PLAYER_IDLE_TEXTURE_KEY)
        .getFrameNames()
        .filter((frame) => frame.startsWith(IDLE_FRAME_PREFIX))
        .sort((left, right) => left.localeCompare(right));

    if (frames.length === 0) throw new Error('The Lucy idle atlas has no animation frames.');
    return frames;
}
