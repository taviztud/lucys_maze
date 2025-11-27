import { CONFIG } from './Config.js';
import { GameScene } from './scenes/GameScene.js';

const config = {
    type: Phaser.AUTO,
    width: CONFIG.GAME_WIDTH,
    height: CONFIG.GAME_HEIGHT,
    backgroundColor: CONFIG.UI.MAIN_BACKGROUND_COLOR,
    parent: 'game-container',
    pixelArt: true,
    scene: [GameScene]
};

const game = new Phaser.Game(config);
