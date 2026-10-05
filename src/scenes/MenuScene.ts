import Phaser from 'phaser';
import packageMetadata from '../../package.json';
import { playSfx } from '../audio/sfx';
import { CONFIG } from '../Config';
import { SceneKeys } from '../events';
import { ScoreManager } from '../managers/ScoreManager';
import { musicManager } from '../managers/MusicManager';
import {
    calculatePlayerVisualScale,
    getFirstIdleFrame,
    PLAYER_IDLE_TEXTURE_KEY,
    playPlayerIdle
} from '../managers/playerAnimations';
import { computeLayout, toPagePoint } from '../ui/layout';

const GAME_INFO = {
    version: packageMetadata.version,
    credits: `Desarrollado por ${packageMetadata.author}`
} as const;

export interface DevModeData {
    enabled: boolean;
    level: number;
    shields: number;
    continues: number;
    score: number;
}

type DevModeField = 'level' | 'shields' | 'continues' | 'score';

interface DevModeRow {
    key: DevModeField;
    label: string;
    min: number;
    max: number;
    step?: number;
}

/** Dev Mode is a development tool: always on in `vite dev`, opt-in with `?dev` elsewhere. */
function isDevModeAvailable(): boolean {
    return import.meta.env.DEV || new URLSearchParams(window.location.search).has('dev');
}

export class MenuScene extends Phaser.Scene {
    private devModeData: DevModeData = {
        enabled: false,
        level: 1,
        shields: 0,
        continues: 0,
        score: 0
    };

    // Todo el menú cuelga de un contenedor centrado; sus hijos usan
    // coordenadas relativas al centro de la pantalla.
    private root!: Phaser.GameObjects.Container;
    private devPanel: Phaser.GameObjects.Container | null = null;
    private devTexts: Partial<Record<DevModeField, Phaser.GameObjects.Text>> = {};
    private playerLogo: Phaser.GameObjects.Sprite | null = null;
    private starting = false;
    // Botones expuestos a las pruebas automatizadas mediante render_game_to_text.
    private readonly debugButtons = new Map<string, Phaser.GameObjects.Text>();

    constructor() {
        super(SceneKeys.MENU);
    }

    create() {
        this.starting = false;
        this.devPanel = null;
        this.devTexts = {};
        this.debugButtons.clear();
        // Los valores de Dev Mode se conservan entre visitas, pero JUGAR siempre inicia una partida normal.
        this.devModeData.enabled = false;

        // Background
        this.cameras.main.setBackgroundColor(CONFIG.UI.MAIN_BACKGROUND_COLOR);
        this.root = this.add.container(0, 0);

        // Title - neon theme colors matching the game
        const title = this.add.text(0, -180, "LUCY'S MAZE", {
            fontSize: '32px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#F72585',
            stroke: '#ff6600',
            strokeThickness: 3
        });
        title.setOrigin(0.5);

        // Subtitle with neon cyan
        const subtitle = this.add.text(0, -130, '¡Ayuda a Lucy a encontrar la salida!', {
            fontSize: '12px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#4CC9F0'
        });
        subtitle.setOrigin(0.5);

        // Player sprite as logo
        const playerLogo = this.playerLogo = this.add.sprite(
            0,
            60,
            PLAYER_IDLE_TEXTURE_KEY,
            getFirstIdleFrame(this)
        );
        const logoScale = calculatePlayerVisualScale(
            this,
            PLAYER_IDLE_TEXTURE_KEY,
            CONFIG.CELL_SIZE * 3,
            playerLogo.frame.name
        );
        playerLogo.setScale(logoScale);
        playerLogo.setOrigin(0.5, 1);  // Origin at feet so animation scales from bottom
        playPlayerIdle(playerLogo);

        // Subtle breathing/idle animation - feet stay grounded
        this.tweens.add({
            targets: playerLogo,
            scaleY: logoScale * 1.025,
            scaleX: logoScale * 0.985,
            duration: 1200,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.InOut'
        });

        // Play button
        const playButton = this.add.text(0, 80, '▶ JUGAR', {
            fontSize: '24px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#00ff00',
            backgroundColor: '#003300',
            padding: { x: 30, y: 15 }
        });
        playButton.setOrigin(0.5);
        playButton.setInteractive({ useHandCursor: true });
        this.debugButtons.set('play', playButton);

        // Hover effects
        playButton.on('pointerover', () => {
            playButton.setStyle({ color: '#ffffff', backgroundColor: '#006600' });
            playButton.setScale(1.1);
        });
        playButton.on('pointerout', () => {
            playButton.setStyle({ color: '#00ff00', backgroundColor: '#003300' });
            playButton.setScale(1);
        });
        // Releasing (not pressing) is what counts as a user gesture for audio on touch screens.
        playButton.on('pointerup', () => {
            this.startGame();
        });

        // High score display
        const highScore = ScoreManager.getHighScore();
        const highScoreText = this.add.text(0, 160, `RÉCORD: ${highScore}`, {
            fontSize: '16px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#ff00ff'
        });
        highScoreText.setOrigin(0.5);

        // Instructions
        const instructions = this.add.text(0, 220, 'Usa las flechas ← ↑ → ↓ o desliza', {
            fontSize: '12px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#888888'
        });
        instructions.setOrigin(0.5);

        // Version and credits share the package metadata as their single source of truth.
        const gameInfo = this.add.text(
            0,
            265,
            `VERSIÓN ${GAME_INFO.version}\n${GAME_INFO.credits.toUpperCase()}`,
            {
                fontSize: '9px',
                fontFamily: CONFIG.UI.FONT_FAMILY,
                color: '#7a7a8c',
                align: 'center',
                lineSpacing: 6
            }
        );
        gameInfo.setOrigin(0.5);

        this.root.add([title, subtitle, playerLogo, playButton, highScoreText, instructions, gameInfo]);

        if (isDevModeAvailable()) this.createDevButton();

        // Allow starting with Enter or Space
        this.input.keyboard?.on('keydown-ENTER', () => this.startGame());
        this.input.keyboard?.on('keydown-SPACE', () => this.startGame());

        this.applyLayout();
        this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
        });
    }

    renderGameToText(): string {
        return JSON.stringify({
            mode: 'menu',
            scene: 'MenuScene',
            player: {
                visualState: 'idle',
                frame: this.playerLogo?.frame.name ?? null,
                animation: this.playerLogo?.anims.currentAnim?.key ?? null
            },
            info: GAME_INFO,
            devMode: isDevModeAvailable() ? { ...this.devModeData, panelOpen: this.devPanel !== null } : null,
            buttons: this.getDebugButtons(),
            music: {
                state: musicManager.getState(),
                track: musicManager.getCurrentTrackId(),
                format: musicManager.getCurrentFormat(),
                volume: musicManager.getVolume()
            }
        });
    }

    /** Centre of every live button, in page CSS pixels. */
    private getDebugButtons(): Record<string, { x: number; y: number }> {
        const buttons: Record<string, { x: number; y: number }> = {};
        this.debugButtons.forEach((button, name) => {
            if (!button.active) return;
            const bounds = button.getBounds();
            buttons[name] = toPagePoint(this.scale, bounds.centerX, bounds.centerY);
        });
        return buttons;
    }

    private applyLayout(): void {
        const layout = computeLayout(this.scale.width, this.scale.height);
        this.root.setPosition(layout.centerX, layout.centerY);
    }

    /** Dev Mode button, anchored to the top-right corner of the base area. */
    private createDevButton(): void {
        const devButton = this.add.text(CONFIG.GAME_WIDTH / 2 - 10, -CONFIG.GAME_HEIGHT / 2 + 10, 'DEV', {
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
        this.root.add(devButton);
        this.debugButtons.set('dev', devButton);
    }

    private toggleDevPanel(): void {
        if (this.devPanel) {
            this.devPanel.destroy();
            this.devPanel = null;
            return;
        }

        const devPanel = this.devPanel = this.add.container(0, 0);
        this.root.add(devPanel);

        // Panel background
        const bg = this.add.graphics();
        bg.fillStyle(0x1a1a2e, 0.95);
        bg.fillRoundedRect(-150, -130, 300, 260, 10);
        bg.lineStyle(2, 0x4CC9F0);
        bg.strokeRoundedRect(-150, -130, 300, 260, 10);
        devPanel.add(bg);

        // Title
        const title = this.add.text(0, -110, 'DEV MODE', {
            fontSize: '16px',
            fontFamily: CONFIG.UI.FONT_FAMILY,
            color: '#4CC9F0'
        });
        title.setOrigin(0.5);
        devPanel.add(title);

        // Create value rows
        const rows: DevModeRow[] = [
            { key: 'level', label: 'Nivel', min: 1, max: 50 },
            { key: 'shields', label: 'Shields', min: 0, max: 10 },
            { key: 'continues', label: 'Continues', min: 0, max: 10 },
            { key: 'score', label: 'Puntaje', min: 0, max: 10000, step: 100 }
        ];

        rows.forEach((row, index) => {
            const y = -60 + index * 45;
            const step = row.step ?? 1;

            // Label
            const label = this.add.text(-120, y, row.label, {
                fontSize: '12px',
                fontFamily: CONFIG.UI.FONT_FAMILY,
                color: '#ffffff'
            });
            devPanel.add(label);

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
                this.devModeData[row.key] = Math.max(row.min, this.devModeData[row.key] - step);
                this.updateDevText(row.key);
            });
            devPanel.add(minus);
            this.debugButtons.set(`${row.key}Minus`, minus);

            // Value
            const value = this.add.text(75, y, String(this.devModeData[row.key]), {
                fontSize: '14px',
                fontFamily: CONFIG.UI.FONT_FAMILY,
                color: '#00ff00'
            });
            value.setOrigin(0.5, 0);
            this.devTexts[row.key] = value;
            devPanel.add(value);

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
                this.devModeData[row.key] = Math.min(row.max, this.devModeData[row.key] + step);
                this.updateDevText(row.key);
            });
            devPanel.add(plus);
            this.debugButtons.set(`${row.key}Plus`, plus);
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
        applyBtn.on('pointerup', () => {
            this.devModeData.enabled = true;
            this.startGame();
        });
        devPanel.add(applyBtn);
        this.debugButtons.set('devApply', applyBtn);
    }

    private updateDevText(key: DevModeField): void {
        this.devTexts[key]?.setText(String(this.devModeData[key]));
    }

    startGame() {
        if (this.starting) return;
        this.starting = true;

        playSfx(this, 'ui');
        // Start from the trusted user gesture. Audio loading never blocks the scene transition.
        void musicManager.start();
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => {
            this.scene.start(SceneKeys.GAME, this.devModeData.enabled ? { ...this.devModeData } : undefined);
        });
    }
}
