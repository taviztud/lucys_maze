import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { ScoreManager } from '../managers/ScoreManager';

export class MenuScene extends Phaser.Scene {
    constructor() {
        super('MenuScene');
    }

    preload() {
        // Load player image for logo
        this.load.image('player_stand', 'lucy_stand.png');
    }

    create() {
        const centerX = CONFIG.GAME_WIDTH / 2;
        const centerY = CONFIG.GAME_HEIGHT / 2;

        // Background
        this.cameras.main.setBackgroundColor(CONFIG.UI.MAIN_BACKGROUND_COLOR);

        // Title - neon theme colors matching the game
        const title = this.add.text(centerX, centerY - 180, "LUCY'S MAZE", {
            fontSize: '32px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#F72585',
            stroke: '#ff6600',
            strokeThickness: 3
        });
        title.setOrigin(0.5);

        // Subtitle with neon cyan
        const subtitle = this.add.text(centerX, centerY - 130, '¡Ayuda a Lucy a encontrar la salida!', {
            fontSize: '14px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#4CC9F0'
        });
        subtitle.setOrigin(0.5);

        // Player sprite as logo
        const playerLogo = this.add.sprite(centerX, centerY + 60, 'player_stand');
        playerLogo.setScale(3);
        playerLogo.setOrigin(0.5, 1);  // Origin at feet so animation scales from bottom

        // Subtle breathing/idle animation - feet stay grounded
        this.tweens.add({
            targets: playerLogo,
            scaleY: 3.08,         // Slight vertical stretch (breathing in)
            scaleX: 2.95,         // Slight horizontal compress
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Play button
        const playButton = this.add.text(centerX, centerY + 80, '▶ JUGAR', {
            fontSize: '24px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#00ff00',
            backgroundColor: '#003300',
            padding: { x: 30, y: 15 }
        });
        playButton.setOrigin(0.5);
        playButton.setInteractive({ useHandCursor: true });

        // Hover effects
        playButton.on('pointerover', () => {
            playButton.setStyle({ color: '#ffffff', backgroundColor: '#006600' });
            playButton.setScale(1.1);
        });
        playButton.on('pointerout', () => {
            playButton.setStyle({ color: '#00ff00', backgroundColor: '#003300' });
            playButton.setScale(1);
        });
        playButton.on('pointerdown', () => {
            this.startGame();
        });

        // High score display
        const highScore = ScoreManager.getHighScore();
        const highScoreText = this.add.text(centerX, centerY + 160, `RÉCORD: ${highScore}`, {
            fontSize: '16px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#ff00ff'
        });
        highScoreText.setOrigin(0.5);

        // Instructions
        const instructions = this.add.text(centerX, centerY + 220, 'Usa las flechas ← ↑ → ↓ o desliza', {
            fontSize: '12px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#888888'
        });
        instructions.setOrigin(0.5);

        // Allow starting with Enter or Space
        this.input.keyboard.on('keydown-ENTER', () => this.startGame());
        this.input.keyboard.on('keydown-SPACE', () => this.startGame());

        // Touch to start
        this.input.on('pointerdown', (pointer) => {
            // Only start if not clicking the button
            if (pointer.y < centerY + 50 || pointer.y > centerY + 120) {
                // Do nothing, let button handle it
            }
        });
    }

    startGame() {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => {
            this.scene.start('GameScene');
        });
    }
}
