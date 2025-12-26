import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { ScoreManager } from '../managers/ScoreManager';

export interface DevModeData {
    enabled: boolean;
    level: number;
    shields: number;
    continues: number;
    score: number;
}

export class MenuScene extends Phaser.Scene {
    private devModeData: DevModeData = {
        enabled: false,
        level: 1,
        shields: 0,
        continues: 0,
        score: 0
    };

    private devPanel: Phaser.GameObjects.Container | null = null;
    private devTexts: { [key: string]: Phaser.GameObjects.Text } = {};

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

        // Dev Mode button (small, in corner)
        const devButton = this.add.text(CONFIG.GAME_WIDTH - 10, 10, 'DEV', {
            fontSize: '12px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#666666',
            backgroundColor: '#222222',
            padding: { x: 8, y: 4 }
        });
        devButton.setOrigin(1, 0);
        devButton.setInteractive({ useHandCursor: true });
        devButton.on('pointerover', () => devButton.setStyle({ color: '#ffffff' }));
        devButton.on('pointerout', () => devButton.setStyle({ color: '#666666' }));
        devButton.on('pointerdown', () => this.toggleDevPanel());

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

    private toggleDevPanel(): void {
        if (this.devPanel) {
            this.devPanel.destroy();
            this.devPanel = null;
            return;
        }

        const panelX = CONFIG.GAME_WIDTH / 2;
        const panelY = CONFIG.GAME_HEIGHT / 2;

        this.devPanel = this.add.container(panelX, panelY);

        // Panel background
        const bg = this.add.graphics();
        bg.fillStyle(0x1a1a2e, 0.95);
        bg.fillRoundedRect(-150, -130, 300, 260, 10);
        bg.lineStyle(2, 0x4CC9F0);
        bg.strokeRoundedRect(-150, -130, 300, 260, 10);
        this.devPanel.add(bg);

        // Title
        const title = this.add.text(0, -110, 'DEV MODE', {
            fontSize: '16px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#4CC9F0'
        });
        title.setOrigin(0.5);
        this.devPanel.add(title);

        // Create value rows
        const rows = [
            { key: 'level', label: 'Nivel', min: 1, max: 50 },
            { key: 'shields', label: 'Shields', min: 0, max: 10 },
            { key: 'continues', label: 'Continues', min: 0, max: 10 },
            { key: 'score', label: 'Puntaje', min: 0, max: 10000, step: 100 }
        ];

        rows.forEach((row, index) => {
            const y = -60 + index * 45;

            // Label
            const label = this.add.text(-120, y, row.label, {
                fontSize: '12px',
                fontFamily: CONFIG.UI.FONT_FAMILY,
                color: '#ffffff'
            });
            this.devPanel!.add(label);

            // Minus button
            const minus = this.add.text(30, y, '-', {
                fontSize: '20px',
                fontFamily: CONFIG.UI.FONT_FAMILY,
                color: '#ff6666',
                backgroundColor: '#330000',
                padding: { x: 10, y: 2 }
            });
            minus.setInteractive({ useHandCursor: true });
            minus.on('pointerdown', () => {
                const step = row.step || 1;
                (this.devModeData as any)[row.key] = Math.max(row.min, (this.devModeData as any)[row.key] - step);
                this.updateDevText(row.key);
            });
            this.devPanel!.add(minus);

            // Value
            const value = this.add.text(75, y, String((this.devModeData as any)[row.key]), {
                fontSize: '14px',
                fontFamily: CONFIG.UI.FONT_FAMILY,
                color: '#00ff00'
            });
            value.setOrigin(0.5, 0);
            this.devTexts[row.key] = value;
            this.devPanel!.add(value);

            // Plus button
            const plus = this.add.text(100, y, '+', {
                fontSize: '20px',
                fontFamily: CONFIG.UI.FONT_FAMILY,
                color: '#66ff66',
                backgroundColor: '#003300',
                padding: { x: 10, y: 2 }
            });
            plus.setInteractive({ useHandCursor: true });
            plus.on('pointerdown', () => {
                const step = row.step || 1;
                (this.devModeData as any)[row.key] = Math.min(row.max, (this.devModeData as any)[row.key] + step);
                this.updateDevText(row.key);
            });
            this.devPanel!.add(plus);
        });

        // Apply button
        const applyBtn = this.add.text(0, 100, '✓ INICIAR CON ESTOS VALORES', {
            fontSize: '12px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#00ff00',
            backgroundColor: '#004400',
            padding: { x: 15, y: 8 }
        });
        applyBtn.setOrigin(0.5);
        applyBtn.setInteractive({ useHandCursor: true });
        applyBtn.on('pointerover', () => applyBtn.setStyle({ backgroundColor: '#006600' }));
        applyBtn.on('pointerout', () => applyBtn.setStyle({ backgroundColor: '#004400' }));
        applyBtn.on('pointerdown', () => {
            this.devModeData.enabled = true;
            this.startGame();
        });
        this.devPanel.add(applyBtn);

        this.devPanel.setDepth(100);
    }

    private updateDevText(key: string): void {
        if (this.devTexts[key]) {
            this.devTexts[key].setText(String((this.devModeData as any)[key]));
        }
    }

    startGame() {
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => {
            this.scene.start('GameScene', this.devModeData.enabled ? this.devModeData : null);
        });
    }
}
