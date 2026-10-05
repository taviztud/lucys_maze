/** Scene keys shared by `scene.start`, `scene.launch` and `scene.get`. */
export const SceneKeys = {
    BOOT: 'BootScene',
    MENU: 'MenuScene',
    GAME: 'GameScene',
    UI: 'UIScene'
} as const;

/**
 * Events emitted on the GameScene emitter. UIScene listens to the `state:*`
 * ones and emits the `ui:*` ones back.
 */
export const GameEvents = {
    INPUT_DIRECTION: 'input:direction',
    GAME_OVER: 'state:gameOver',
    GAME_ACTIVE: 'state:active',
    UI_RESTART: 'ui:restart',
    UI_CONTINUE: 'ui:continue',
    UI_MENU: 'ui:menu'
} as const;

/** Registry keys that feed the HUD. */
export const RegistryKeys = {
    SCORE: 'hud:score',
    LEVEL: 'hud:level',
    SHIELDS: 'hud:shields',
    CONTINUES: 'hud:continues'
} as const;

export interface GameOverPayload {
    score: number;
    continues: number;
    isNewRecord: boolean;
}
