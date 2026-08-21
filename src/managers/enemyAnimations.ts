import Phaser from 'phaser';
import wormWalkAtlas from '../assets/sprites/enemies/worm_walk.json';
import wormWalkSheetUrl from '../assets/sprites/enemies/worm_walk.png?url';
import lelarIdleAtlas from '../assets/sprites/enemies/lelar_idle.json';
import lelarIdleSheetUrl from '../assets/sprites/enemies/lelar_idle.png?url';
import type { PhaserAnimationJSON, PhaserAtlasJSON } from '../types/animation.types';
import { calculateSpriteScale } from '../utils/Utils';

export type AnimatedEnemyKind = 'worm' | 'lelar';

interface StudioAtlasDefinition {
    atlas: PhaserAtlasJSON & { anims: PhaserAnimationJSON[] };
    imageUrl: string;
    textureKey: string;
    animationKey: string;
    firstFrame: string | number;
}

function createDefinition(
    atlas: PhaserAtlasJSON,
    imageUrl: string,
    label: string
): StudioAtlasDefinition {
    const animations = atlas.anims ?? [];
    const animation = animations[0];
    const firstAnimationFrame = animation?.frames[0];

    if (!animation || !firstAnimationFrame) {
        throw new Error(`${label} atlas has no Studio animation frames.`);
    }

    if (!atlas.frames[String(firstAnimationFrame.frame)]) {
        throw new Error(`${label} animation references a missing atlas frame.`);
    }

    return {
        atlas: { ...atlas, anims: animations },
        imageUrl,
        textureKey: firstAnimationFrame.key,
        animationKey: animation.key,
        firstFrame: firstAnimationFrame.frame
    };
}

const DEFINITIONS: Record<AnimatedEnemyKind, StudioAtlasDefinition> = {
    worm: createDefinition(wormWalkAtlas, wormWalkSheetUrl, 'Worm walk'),
    lelar: createDefinition(lelarIdleAtlas, lelarIdleSheetUrl, 'Lelar idle')
};

export function preloadEnemyAnimations(scene: Phaser.Scene): void {
    Object.values(DEFINITIONS).forEach((definition) => {
        if (!scene.textures.exists(definition.textureKey)) {
            scene.load.atlas(
                definition.textureKey,
                definition.imageUrl,
                definition.atlas
            );
        }
    });
}

export function registerEnemyAnimations(scene: Phaser.Scene): void {
    Object.values(DEFINITIONS).forEach((definition) => {
        definition.atlas.anims.forEach((animation) => {
            if (scene.anims.exists(animation.key)) return;

            scene.anims.create({
                ...animation,
                frames: animation.frames.map((frame) => ({
                    key: frame.key,
                    frame: frame.frame
                }))
            });
        });
    });
}

export function createAnimatedEnemySprite(
    scene: Phaser.Scene,
    x: number,
    y: number,
    kind: AnimatedEnemyKind,
    targetSize: number
): Phaser.GameObjects.Sprite {
    const definition = DEFINITIONS[kind];
    const sprite = scene.add.sprite(
        x,
        y,
        definition.textureKey,
        definition.firstFrame
    );

    configureAnimatedEnemySprite(scene, sprite, kind, targetSize);
    return sprite;
}

export function configureAnimatedEnemySprite(
    scene: Phaser.Scene,
    sprite: Phaser.GameObjects.Sprite,
    kind: AnimatedEnemyKind,
    targetSize: number
): void {
    const definition = DEFINITIONS[kind];

    if (sprite.texture.key !== definition.textureKey) {
        sprite.setTexture(definition.textureKey, definition.firstFrame);
    }

    sprite.play(definition.animationKey, true);
    sprite.setScale(calculateSpriteScale(
        definition.textureKey,
        targetSize,
        scene,
        sprite.frame.name
    ));
}
