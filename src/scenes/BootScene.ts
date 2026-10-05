import Phaser from 'phaser';
import pressStartFontUrl from '../assets/fonts/PressStart2P-Regular.ttf?url';
import { registerSfx } from '../audio/sfx';
import { SceneKeys } from '../events';
import { preloadVisualAssets, registerVisualAnimations } from '../visuals/animations';

// Must match the family named in CONFIG.UI.FONT_FAMILY.
const UI_FONT_FAMILY = 'Press Start 2P';

/**
 * Carga única de fuente, texturas y animaciones antes del menú, para que
 * ningún texto de Phaser se dibuje con la fuente de respaldo.
 */
export class BootScene extends Phaser.Scene {
    constructor() {
        super(SceneKeys.BOOT);
    }

    preload(): void {
        this.load.font(UI_FONT_FAMILY, pressStartFontUrl, 'truetype');

        preloadVisualAssets(this);
        this.load.image('player_run', 'lucy_run.png');
        this.load.image('player_die', 'lucy_die.png');
        this.load.image('coin', 'coin_tuto.png');
        this.load.image('obstacle_brick', 'brick_1.png');
        this.load.image('obstacle_rock', 'rock_1.png');
        this.load.image('obstacle_tree', 'tree_1.png');
        this.load.image('exit', 'exit.png');
        this.load.image('power_continue', 'power_continue.png');
        this.load.image('power_shield', 'power_shield.png');
    }

    create(): void {
        registerVisualAnimations(this);
        // Los efectos se decodifican en segundo plano; el menú no espera por ellos.
        registerSfx(this);
        this.scene.start(SceneKeys.MENU);
    }
}
