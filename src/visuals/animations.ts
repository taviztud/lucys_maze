import Phaser from 'phaser';
import { calculateSpriteScale } from '../utils/Utils';
import type { AnimatedAssetId, PhaserAnimationJSON } from '../types/animation.types';
import { ANIMATED_ASSETS, BOARD_BACKGROUNDS, STATIC_ASSETS, getAnimation, getFirstFrame } from './assetRegistry';

export interface ConfigureAnimatedSpriteOptions {
    startFrame?: number;
    scaleMultiplier?: number;
    restart?: boolean;
}

export function preloadVisualAssets(scene: Phaser.Scene): void {
    Object.values(ANIMATED_ASSETS).forEach((definition) => {
        if (!scene.textures.exists(definition.textureKey)) {
            scene.load.atlas(definition.textureKey, definition.imageUrl, definition.atlas);
        }
    });
    Object.values(STATIC_ASSETS).forEach((definition) => {
        if (!scene.textures.exists(definition.textureKey)) {
            scene.load.image(definition.textureKey, definition.imageUrl);
        }
    });
    Object.values(BOARD_BACKGROUNDS).forEach((definition) => {
        if (!scene.textures.exists(definition.textureKey)) {
            scene.load.image(definition.textureKey, definition.imageUrl);
        }
    });
}

export function registerVisualAnimations(scene: Phaser.Scene): void {
    Object.values(ANIMATED_ASSETS).forEach((definition) => {
        definition.atlas.anims?.forEach((animation) => {
            if (scene.anims.exists(animation.key)) return;
            scene.anims.create(toPhaserAnimation(animation));
        });
    });
}

export function createAnimatedSprite(
    scene: Phaser.Scene,
    x: number,
    y: number,
    id: AnimatedAssetId,
    targetSize: number,
    options: ConfigureAnimatedSpriteOptions = {}
): Phaser.GameObjects.Sprite {
    const definition = ANIMATED_ASSETS[id];
    const sprite = scene.add.sprite(x, y, definition.textureKey, getFirstFrame(id));
    configureAnimatedSprite(scene, sprite, id, targetSize, options);
    return sprite;
}

export function configureAnimatedSprite(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    id: AnimatedAssetId,
    targetSize: number,
    options: ConfigureAnimatedSpriteOptions = {}
): void {
    const definition = ANIMATED_ASSETS[id];
    const firstFrame = getFirstFrame(id);
    if (sprite.texture.key !== definition.textureKey) {
        sprite.setTexture(definition.textureKey, firstFrame);
    }

    const animation = getAnimation(id);
    const isAlreadyPlaying = sprite.anims.currentAnim?.key === animation.key && sprite.anims.isPlaying;
    if (!isAlreadyPlaying || options.restart) {
        const frameCount = animation.frames.length;
        const startFrame = Phaser.Math.Clamp(
            options.startFrame ?? animation.startFrame ?? 0,
            0,
            Math.max(0, frameCount - 1)
        );
        sprite.play({ key: animation.key, startFrame }, true);
    }

    const scale = calculateSpriteScale(
        definition.textureKey,
        targetSize * definition.targetCellRatio,
        scene,
        sprite.frame.name
    ) * (options.scaleMultiplier ?? 1);
    sprite.setScale(scale).setDepth(definition.depth);
}

export function calculateAnimatedScale(
    scene: Phaser.Scene,
    id: AnimatedAssetId,
    targetSize: number,
    frameName?: string | number
): number {
    const definition = ANIMATED_ASSETS[id];
    return calculateSpriteScale(
        definition.textureKey,
        targetSize * definition.targetCellRatio,
        scene,
        frameName ?? getFirstFrame(id)
    );
}

function toPhaserAnimation(animation: PhaserAnimationJSON): Phaser.Types.Animations.Animation {
    return {
        ...animation,
        frames: animation.frames.map(({ key, frame, duration, visible }) => ({
            key,
            frame,
            ...(duration === undefined ? {} : { duration }),
            ...(visible === undefined ? {} : { visible })
        }))
    };
}
