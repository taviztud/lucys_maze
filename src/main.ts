import Phaser from 'phaser';
import { CONFIG } from './Config';
import { MenuScene } from './scenes/MenuScene';
import { GameScene } from './scenes/GameScene';
import { musicManager } from './managers/MusicManager';

declare global {
    interface Window {
        render_game_to_text: () => string;
    }
}

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: CONFIG.GAME_WIDTH,
    height: CONFIG.GAME_HEIGHT,
    backgroundColor: CONFIG.UI.MAIN_BACKGROUND_COLOR,
    parent: 'game-container',
    pixelArt: true,
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [MenuScene, GameScene]
};

const game = new Phaser.Game(config);

window.render_game_to_text = (): string => {
    const activeScenes = game.scene.getScenes(true);
    const activeScene = activeScenes[activeScenes.length - 1];

    if (activeScene instanceof GameScene) {
        return activeScene.renderGameToText();
    }

    if (activeScene instanceof MenuScene) {
        return activeScene.renderGameToText();
    }

    return JSON.stringify({
        mode: 'loading',
        scene: activeScene?.scene.key ?? null,
        music: {
            state: musicManager.getState(),
            track: musicManager.getCurrentTrackId(),
            format: musicManager.getCurrentFormat(),
            volume: musicManager.getVolume()
        }
    });
};
