import Phaser from 'phaser';
import { ANIMATED_ASSETS, getFirstFrame } from '../visuals/assetRegistry';
import { calculateAnimatedScale } from '../visuals/animations';

export const PLAYER_IDLE_TEXTURE_KEY = ANIMATED_ASSETS.lucy_idle.textureKey;
export const PLAYER_IDLE_ANIMATION_KEY = ANIMATED_ASSETS.lucy_idle.defaultAnimationKey;

export function getFirstIdleFrame(_scene: Phaser.Scene): string | number {
    return getFirstFrame('lucy_idle');
}

export function playPlayerIdle(sprite: Phaser.GameObjects.Sprite): void {
    if (sprite.anims.currentAnim?.key !== PLAYER_IDLE_ANIMATION_KEY || !sprite.anims.isPlaying) {
        sprite.play(PLAYER_IDLE_ANIMATION_KEY, true);
    }
}

export function calculatePlayerVisualScale(
    scene: Phaser.Scene,
    textureKey: string,
    targetSize: number,
    frameName?: string | number
): number {
    if (textureKey === PLAYER_IDLE_TEXTURE_KEY) {
        return calculateAnimatedScale(scene, 'lucy_idle', targetSize, frameName);
    }
    const frame = scene.textures.getFrame(textureKey, frameName);
    if (!frame) return 1;
    return Math.min(targetSize / frame.width, targetSize / frame.height);
}
