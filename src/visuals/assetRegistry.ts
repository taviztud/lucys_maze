import lucyIdleAtlas from '../assets/sprites/player/lucy-idle.json';
import lucyIdleSheetUrl from '../assets/sprites/player/lucy-idle.png?url';
import wormWalkAtlas from '../assets/sprites/enemies/worm_walk.json';
import wormWalkSheetUrl from '../assets/sprites/enemies/worm_walk.png?url';
import lelarIdleAtlas from '../assets/sprites/enemies/lelar_idle.json';
import lelarIdleSheetUrl from '../assets/sprites/enemies/lelar_idle.png?url';
import spiderWalkAtlas from '../assets/sprites/enemies/spider_walk.json';
import spiderWalkSheetUrl from '../assets/sprites/enemies/spider_walk.png?url';
import type {
    AnimatedAssetDefinition,
    AnimatedAssetId,
    PhaserAnimationJSON,
    PhaserAtlasJSON,
    StaticAssetDefinition
} from '../types/animation.types';

const PLAYER_IDLE_ANIMATION: PhaserAnimationJSON = {
    key: 'player:idle',
    frames: Object.keys(lucyIdleAtlas.frames).sort().map((frame) => ({
        key: 'player:idle-texture',
        frame
    })),
    frameRate: 6,
    repeat: -1,
    yoyo: false
};

function withAnimation(
    atlas: PhaserAtlasJSON,
    fallback?: PhaserAnimationJSON
): PhaserAtlasJSON & { anims: PhaserAnimationJSON[] } {
    const animations = atlas.anims?.length ? atlas.anims : (fallback ? [fallback] : []);
    if (animations.length === 0) throw new Error(`${atlas.meta.image} has no animation definitions.`);
    return { ...atlas, anims: animations };
}

function animated(
    definition: Omit<AnimatedAssetDefinition, 'atlas'> & { atlas: PhaserAtlasJSON },
    fallback?: PhaserAnimationJSON
): AnimatedAssetDefinition {
    const atlas = withAnimation(definition.atlas, fallback);
    const animation = atlas.anims.find(({ key }) => key === definition.defaultAnimationKey);
    if (!animation?.frames.length) {
        throw new Error(`${definition.id} is missing animation ${definition.defaultAnimationKey}.`);
    }
    for (const frame of animation.frames) {
        if (frame.key !== definition.textureKey || !atlas.frames[String(frame.frame)]) {
            throw new Error(`${definition.id} animation references invalid frame ${String(frame.frame)}.`);
        }
    }
    return { ...definition, atlas };
}

export const ANIMATED_ASSETS: Record<AnimatedAssetId, AnimatedAssetDefinition> = {
    lucy_idle: animated({
        id: 'lucy_idle',
        name: 'Lucy Idle',
        category: 'player',
        textureKey: 'player:idle-texture',
        imageUrl: lucyIdleSheetUrl,
        atlas: lucyIdleAtlas,
        defaultAnimationKey: 'player:idle',
        targetCellRatio: getTargetCellRatio(lucyIdleAtlas),
        depth: 10
    }, PLAYER_IDLE_ANIMATION),
    worm_walk: animated({
        id: 'worm_walk',
        name: 'Worm Walk',
        category: 'enemy',
        textureKey: 'worm_walk',
        imageUrl: wormWalkSheetUrl,
        atlas: wormWalkAtlas,
        defaultAnimationKey: 'worm_walk:idle',
        targetCellRatio: getTargetCellRatio(wormWalkAtlas),
        depth: 8
    }),
    lelar_idle: animated({
        id: 'lelar_idle',
        name: 'Lelar Idle',
        category: 'trap',
        textureKey: 'lelar_idle',
        imageUrl: lelarIdleSheetUrl,
        atlas: lelarIdleAtlas,
        defaultAnimationKey: 'lelar_idle:idle',
        targetCellRatio: getTargetCellRatio(lelarIdleAtlas),
        depth: 6
    }),
    spider_walk: animated({
        id: 'spider_walk',
        name: 'Spider Walk',
        category: 'enemy',
        textureKey: 'spider_walk',
        imageUrl: spiderWalkSheetUrl,
        atlas: spiderWalkAtlas,
        defaultAnimationKey: 'spider_walk:idle',
        targetCellRatio: getTargetCellRatio(spiderWalkAtlas),
        depth: 8
    })
};

export const STATIC_ASSETS: Record<StaticAssetDefinition['id'], StaticAssetDefinition> = {
    spin: {
        id: 'spin',
        name: 'Spin',
        category: 'trap',
        textureKey: 'spin',
        imageUrl: `${import.meta.env.BASE_URL}sping.png`,
        targetCellRatio: 1,
        depth: 6,
        rotationDurationMs: 1200
    }
};

export function getAnimation(id: AnimatedAssetId): PhaserAnimationJSON {
    const definition = ANIMATED_ASSETS[id];
    const animation = definition.atlas.anims?.find(({ key }) => key === definition.defaultAnimationKey);
    if (!animation) throw new Error(`${id} has no default animation.`);
    return animation;
}

export function getFirstFrame(id: AnimatedAssetId): string | number {
    const frame = getAnimation(id).frames[0]?.frame;
    if (frame === undefined) throw new Error(`${id} has no frames.`);
    return frame;
}

function getTargetCellRatio(atlas: PhaserAtlasJSON): number {
    return atlas.meta.lucysMaze?.targetCellRatio ?? 1;
}
