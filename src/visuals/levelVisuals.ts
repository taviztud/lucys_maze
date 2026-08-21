import { CONFIG } from '../Config';
import { BOARD_BACKGROUNDS } from './assetRegistry';
import type { BoardBackgroundAssetDefinition, BoardBackgroundAssetId } from '../types/animation.types';

export interface BoardTheme {
    id: string;
    name: string;
    gridColor: number;
    background: BoardBackgroundAssetDefinition;
}

export interface SpiderLevelProfile {
    count: number;
    maxPatrolDistance: number;
}

export interface LevelVisualProfile {
    theme: BoardTheme;
    spinRatio: number;
    spider: SpiderLevelProfile;
}

const BACKGROUND_SEQUENCE: readonly BoardBackgroundAssetId[] = [
    'forest_entrance',
    'maze_approach',
    'temple_floor'
];

export function getLevelVisualProfile(level: number): LevelVisualProfile {
    const safeLevel = Math.max(1, Math.floor(level));
    const themeBand = Math.floor((safeLevel - 1) / 10);
    const background = BOARD_BACKGROUNDS[BACKGROUND_SEQUENCE[themeBand % BACKGROUND_SEQUENCE.length]];
    const colorIndex = themeBand % CONFIG.BACKGROUND_COLORS.length;
    return {
        theme: {
            id: `${background.id}-neon-${colorIndex + 1}`,
            name: background.name,
            gridColor: CONFIG.BACKGROUND_COLORS[colorIndex],
            background
        },
        spinRatio: safeLevel <= 10 ? 0 : safeLevel <= 20 ? 0.1 : safeLevel <= 30 ? 0.2 : 0.3,
        spider: getSpiderProfile(safeLevel)
    };
}

function getSpiderProfile(level: number): SpiderLevelProfile {
    if (level < 10) return { count: 0, maxPatrolDistance: 3 };
    if (level < 20) return { count: 1, maxPatrolDistance: 3 };
    if (level < 30) return { count: 2, maxPatrolDistance: 5 };
    return { count: 3, maxPatrolDistance: 7 };
}

export function deterministicUnit(level: number, x: number, y: number, index: number, salt = 0): number {
    let value = Math.imul(level + 17, 0x45d9f3b)
        ^ Math.imul(x + 31, 0x119de1f3)
        ^ Math.imul(y + 47, 0x3449f9)
        ^ Math.imul(index + 59, 0x27d4eb2d)
        ^ salt;
    value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
    value ^= value >>> 16;
    return (value >>> 0) / 0x100000000;
}
