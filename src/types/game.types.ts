/**
 * Position on the game board
 */
export interface Position {
    x: number;
    y: number;
}

/**
 * Direction vector for movement
 */
export interface Direction {
    dx: number;
    dy: number;
}

/**
 * Obstacle with position and type
 */
export interface Obstacle extends Position {
    type: 'brick' | 'rock' | 'tree';
}

/**
 * Enemy entity with position, direction, movement state, and sprite reference
 */
export interface Enemy extends Position {
    direction: Direction;
    moving: boolean;
    /** Cell reserved while the move tween runs; x/y follow the sprite. */
    target: Position | null;
    sprite: Phaser.GameObjects.Sprite | null;
}

/**
 * Spider enemy state
 */
export type SpiderState = 'MOVING' | 'WAITING';

/**
 * Spider entity
 */
export interface Spider extends Position {
    sprite: Phaser.GameObjects.Sprite | null;
    webGraphics: Phaser.GameObjects.Graphics | null;
    pointA: Position;
    pointB: Position;
    currentTarget: Position;
    state: SpiderState;
    waitElapsedMs: number;
    contactActive: boolean;
}

/**
 * Sprite cache for object pooling
 */
export interface SpriteCache {
    coins: Phaser.GameObjects.Sprite[];
    obstacles: Phaser.GameObjects.Sprite[];
    traps: Phaser.GameObjects.Sprite[];
}

/**
 * Game configuration structure
 */
export interface GameConfig {
    GAME_WIDTH: number;
    GAME_HEIGHT: number;
    BOARD_WIDTH: number;
    BOARD_HEIGHT: number;
    CELL_SIZE: number;
    LAYOUT: {
        HUD_HEIGHT: number;
    };
    INPUT: {
        SWIPE_THRESHOLD_CSS_PX: number;
        SWIPE_AXIS_DOMINANCE: number;
        ACTIVE_TOUCH_POINTERS: number;
    };
    MAZE_GENERATION: {
        OBSTACLE_PROBABILITY: number;
        COIN_PROBABILITY: number;
        TRAP_PROBABILITY: number;
        MAX_ATTEMPTS: number;
        MIN_FREE_SPACES: number;
    };
    AUDIO: {
        DEFAULT_VOLUME: number;
        VOLUME_STEP: number;
    };
    UI: {
        FONT_FAMILY: string;
        MAIN_BACKGROUND_COLOR: string;
    };
    BACKGROUND_COLORS: number[];
    GRID_ALPHA: number;
    ENEMIES: {
        MOVE_TWEEN_DURATION_MS: number;
        FIRST_SPAWN_LEVEL: number;
        SECOND_ENEMY_INTERVAL: number;
        MAX_COUNT: number;
        SAFE_SPAWN_RADIUS: number;
    };
    SPIDER: {
        MIN_PATROL_DISTANCE: number;
        WAIT_DURATION_MS: number;
        CELLS_PER_SECOND: number;
        WEB_COLOR: number;
        WEB_WIDTH: number;
    };
    POWERUPS: {
        SPAWN_COIN_RATIO: number;
        SHIELD_PROBABILITY: number;
        SHIELD_INVINCIBILITY_MS: number;
    };
    PERFORMANCE: {
        PLAYER_MIN_STEP_DURATION_MS: number;
        PLAYER_BASE_DURATION_MS: number;
        PLAYER_STEP_DEC_PER_LEVEL: number;
        PLAYER_STEP_DEC_SLOW: number;
        PLAYER_STEP_DEC_TINY: number;
        PLAYER_PHASE1_MAX_LEVEL: number;
        PLAYER_PHASE2_MAX_LEVEL: number;
    };
}

export interface GridSprite extends Phaser.GameObjects.Sprite {
    gridX?: number;
    gridY?: number;
    trapVariant?: 'lelar' | 'spin';
    visualScaleMultiplier?: number;
    spinTween?: Phaser.Tweens.Tween | null;
}

/**
 * Sprite de obstáculo con propiedades adicionales
 */
export interface ObstacleSprite extends Phaser.GameObjects.Sprite {
    gridX?: number;
    gridY?: number;
    obstacleType?: 'brick' | 'rock' | 'tree';
    isSwaying?: boolean;
}
