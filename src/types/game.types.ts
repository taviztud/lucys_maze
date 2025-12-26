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
    pointA: Position;
    pointB: Position;
    currentTarget: Position;
    state: SpiderState;
    waitStartTime: number;
}

/**
 * Move calculation result
 */
export interface MoveResult extends Position {
    distance: number;
}

/**
 * Final destination for player movement with step count
 */
export interface FinalDestination extends Position {
    step: number;
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
 * Event listener cleanup entry
 */
export interface EventListenerEntry {
    element: HTMLElement;
    event: string;
    handler: EventListener;
}

/**
 * Game configuration structure
 */
export interface GameConfig {
    GAME_WIDTH: number;
    GAME_HEIGHT: number;
    BOARD_SIZE: number;
    CELL_SIZE: number;
    MAZE_GENERATION: {
        OBSTACLE_PROBABILITY: number;
        COIN_PROBABILITY: number;
        TRAP_PROBABILITY: number;
        MAX_ATTEMPTS: number;
        MIN_FREE_SPACES: number;
    };
    AUDIO: {
        DEFAULT_VOLUME: number;
        MAX_BG_TRACKS: number;
    };
    UI: {
        GAME_OVER_FONT_SIZE: string;
        RESTART_FONT_SIZE: string;
        RESTART_OFFSET_Y: number;
        EXIT_BLINK_ALPHA_HIGH: number;
        EXIT_BLINK_ALPHA_LOW: number;
        EXIT_BLINK_INTERVAL: number;
        FONT_FAMILY: string;
        MAIN_BACKGROUND_COLOR: string;
    };
    BACKGROUND_COLORS: number[];
    GRID_ALPHA: number;
    ENEMIES: {
        MIN_LEVEL_FOR_TWO: number;
        SINGLE_COUNT: number;
        DOUBLE_COUNT: number;
        MOVE_TWEEN_DURATION_MS: number;
        FIRST_SPAWN_LEVEL: number;
        SECOND_ENEMY_INTERVAL: number;
        MAX_COUNT: number;
    };
    SPIDER: {
        MIN_PATROL_DISTANCE: number;
        WAIT_DURATION_MS: number;
        MOVE_SPEED: number;
        FIRST_SPAWN_LEVEL: number;
        SECOND_SPAWN_LEVEL: number;
        THIRD_SPAWN_LEVEL: number;
    };
    POWERUPS: {
        SPAWN_COIN_RATIO: number;
        SHIELD_PROBABILITY: number;
        SHIELD_INVINCIBILITY_MS: number;
    };
    PERFORMANCE: {
        INPUT_THROTTLE_MS: number;
        ENEMY_UPDATE_THROTTLE_MS: number;
        PLAYER_MIN_STEP_DURATION_MS: number;
        PLAYER_BASE_DURATION_MS: number;
        PLAYER_STEP_DEC_PER_LEVEL: number;
        PLAYER_STEP_DEC_SLOW: number;
        PLAYER_STEP_DEC_TINY: number;
        PLAYER_PHASE1_MAX_LEVEL: number;
        PLAYER_PHASE2_MAX_LEVEL: number;
    };
    DEBUG: boolean;
}

export interface GridSprite extends Phaser.GameObjects.Sprite {
    gridX?: number;
    gridY?: number;
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
