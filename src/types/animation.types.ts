export interface PhaserRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PhaserFrameData {
    frame: PhaserRect;
    rotated: boolean;
    trimmed: boolean;
    spriteSourceSize: PhaserRect;
    sourceSize: {
        w: number;
        h: number;
    };
    pivot?: {
        x: number;
        y: number;
    };
}

export interface PhaserAtlasMeta {
    app: string;
    version: string;
    image: string;
    format: string;
    size: {
        w: number;
        h: number;
    };
    scale: string;
}

export interface PhaserAtlasJSON {
    frames: Record<string, PhaserFrameData>;
    meta: PhaserAtlasMeta;
    anims?: PhaserAnimationJSON[];
}

export interface PhaserAnimationFrameConfig {
    key: string;
    frame: string | number;
    duration?: number;
    visible?: boolean;
}

export interface PhaserAnimationJSON {
    key: string;
    type?: string;
    frames: PhaserAnimationFrameConfig[];
    frameRate: number;
    duration?: number;
    skipMissedFrames?: boolean;
    delay?: number;
    repeat?: number;
    repeatDelay?: number;
    yoyo?: boolean;
    showOnStart?: boolean;
    hideOnComplete?: boolean;
}

export interface SpriteAssetConfig {
    id: string;
    name: string;
    category: 'player' | 'enemy' | 'obstacle' | 'powerup' | 'trap' | 'tile';
    imagePath: string;
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
    spacing: number;
    margin: number;
    pivot: {
        x: number;
        y: number;
    };
    targetCellRatio: number;
    animations: {
        key: string;
        frames: number[];
        frameRate: number;
        repeat: number;
        yoyo?: boolean;
    }[];
}
