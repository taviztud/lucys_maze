import Phaser from 'phaser';
import { CONFIG } from './Config';
import { SceneKeys } from './events';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { musicManager } from './managers/MusicManager';

declare global {
    interface Window {
        render_game_to_text: () => string;
    }
}

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    backgroundColor: CONFIG.UI.MAIN_BACKGROUND_COLOR,
    pixelArt: true,
    scale: {
        // EXPAND keeps the base area fully visible and grows the canvas on the
        // other axis, so it always covers the whole parent (and every touch).
        mode: Phaser.Scale.EXPAND,
        parent: 'game-container',
        fullscreenTarget: 'game-container',
        width: CONFIG.GAME_WIDTH,
        height: CONFIG.GAME_HEIGHT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        autoRound: true
    },
    input: {
        activePointers: CONFIG.INPUT.ACTIVE_TOUCH_POINTERS
    },
    scene: [BootScene, MenuScene, GameScene, UIScene]
};

const game = new Phaser.Game(config);

// Al rotar, Phaser 3.90 recalcula la escala antes de releer el tamaño del
// contenedor y ya no detecta el cambio después. Un segundo refresh usa el
// tamaño correcto; si el contenedor aún no cambió, el evento resize lo cubre.
game.scale.on(Phaser.Scale.Events.ORIENTATION_CHANGE, () => game.scale.refresh());

window.render_game_to_text = (): string => {
    // UIScene runs on top of GameScene, so ask for each scene by key.
    if (game.scene.isActive(SceneKeys.GAME) || game.scene.isPaused(SceneKeys.GAME)) {
        return (game.scene.getScene(SceneKeys.GAME) as GameScene).renderGameToText();
    }

    if (game.scene.isActive(SceneKeys.MENU)) {
        return (game.scene.getScene(SceneKeys.MENU) as MenuScene).renderGameToText();
    }

    return JSON.stringify({
        mode: 'loading',
        scene: null,
        music: {
            state: musicManager.getState(),
            track: musicManager.getCurrentTrackId(),
            format: musicManager.getCurrentFormat(),
            volume: musicManager.getVolume()
        }
    });
};
