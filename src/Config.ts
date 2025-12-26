import type { GameConfig } from './types/game.types';

export const CONFIG: GameConfig = {
    // Configuración del juego
    GAME_WIDTH: 480,
    GAME_HEIGHT: 720,
    BOARD_WIDTH: 8,
    BOARD_HEIGHT: 12,
    CELL_SIZE: 60,

    // Configuraciones de gameplay
    MAZE_GENERATION: {
        OBSTACLE_PROBABILITY: 0.2,
        COIN_PROBABILITY: 0.1,
        TRAP_PROBABILITY: 0.05,
        MAX_ATTEMPTS: 100,
        MIN_FREE_SPACES: 4
    },

    // Configuración de música y audio
    AUDIO: {
        DEFAULT_VOLUME: 0.5,
        MAX_BG_TRACKS: 26
    },

    // UI y efectos visuales
    UI: {
        GAME_OVER_FONT_SIZE: '48px',
        RESTART_FONT_SIZE: '24px',
        RESTART_OFFSET_Y: 80,
        EXIT_BLINK_ALPHA_HIGH: 1,
        EXIT_BLINK_ALPHA_LOW: 0.3,
        EXIT_BLINK_INTERVAL: 200,
        FONT_FAMILY: '"Press Start 2P", cursive',
        MAIN_BACKGROUND_COLOR: '#1e1e2e'
    },

    // Colores de NEÓN por nivel
    BACKGROUND_COLORS: [0x4CC9F0, 0xF72585, 0x4AD66D, 0xF4D35E, 0x7209B7],
    GRID_ALPHA: 0.15,

    // Configuración de enemigos
    ENEMIES: {
        MIN_LEVEL_FOR_TWO: 10,
        SINGLE_COUNT: 1,
        DOUBLE_COUNT: 2,
        MOVE_TWEEN_DURATION_MS: 1000,
        FIRST_SPAWN_LEVEL: 5,
        SECOND_ENEMY_INTERVAL: 7,
        MAX_COUNT: 4
    },

    // Configuración de arañas
    SPIDER: {
        MIN_PATROL_DISTANCE: 3,
        WAIT_DURATION_MS: 2000,
        MOVE_SPEED: 0.05,
        FIRST_SPAWN_LEVEL: 10,
        SECOND_SPAWN_LEVEL: 15,
        THIRD_SPAWN_LEVEL: 20
    },

    // Configuración de power-ups
    POWERUPS: {
        SPAWN_COIN_RATIO: 0.8,
        SHIELD_PROBABILITY: 0.8,
        SHIELD_INVINCIBILITY_MS: 500 // Invincibility window after shield use
    },

    PERFORMANCE: {
        INPUT_THROTTLE_MS: 16,
        ENEMY_UPDATE_THROTTLE_MS: 16,
        PLAYER_MIN_STEP_DURATION_MS: 60,      // Velocidad máxima absoluta
        PLAYER_BASE_DURATION_MS: 400,         // Velocidad inicial
        PLAYER_STEP_DEC_PER_LEVEL: 20,        // Fase 1: -20ms por nivel (1-10)
        PLAYER_STEP_DEC_SLOW: 5,              // Fase 2: -5ms por nivel (11-34)
        PLAYER_STEP_DEC_TINY: 1,              // Fase 3: -1ms por nivel (35+)
        PLAYER_PHASE1_MAX_LEVEL: 10,          // Fase 1 termina en nivel 10
        PLAYER_PHASE2_MAX_LEVEL: 34           // Fase 2 termina en nivel 34
    },

    DEBUG: false
};
