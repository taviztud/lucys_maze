import Phaser from 'phaser';
import type { AnimatedAssetId } from '../types/animation.types';
import {
    configureAnimatedSprite,
    createAnimatedSprite,
    type ConfigureAnimatedSpriteOptions
} from '../visuals/animations';

export type AnimatedEnemyKind = 'worm' | 'lelar' | 'spider';

const ASSET_BY_KIND: Record<AnimatedEnemyKind, AnimatedAssetId> = {
    worm: 'worm_walk',
    lelar: 'lelar_idle',
    spider: 'spider_walk'
};

export function createAnimatedEnemySprite(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: AnimatedEnemyKind,
    targetSize: number,
    options: ConfigureAnimatedSpriteOptions = {}
): Phaser.GameObjects.Sprite {
    return createAnimatedSprite(scene, x, y, ASSET_BY_KIND[kind], targetSize, options);
}

export function configureAnimatedEnemySprite(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    kind: AnimatedEnemyKind,
    targetSize: number,
    options: ConfigureAnimatedSpriteOptions = {}
): void {
    configureAnimatedSprite(scene, sprite, ASSET_BY_KIND[kind], targetSize, options);
}
