import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { GameEvents, RegistryKeys, SceneKeys, type GameOverPayload } from '../events';
import { musicManager, type MusicPlaybackState } from '../managers/MusicManager';
import { UIButton } from '../ui/UIButton';
import { computeLayout, toPagePoint, type GameLayout } from '../ui/layout';

type Overlay = 'none' | 'pause' | 'game-over';

export interface UIDebugState {
    overlay: Overlay;
    fullscreenAvailable: boolean;
    /** Centre of every visible button, in page CSS pixels. */
    buttons: Record<string, { x: number; y: number }>;
}

const PANEL_WIDTH = 420;
const BUTTON_WIDTH = 360;
const BUTTON_HEIGHT = 56;
const HALF_BUTTON_WIDTH = 174;
const ROW_GAP = 70;

const COLORS = {
    resume: 0x4ade80,
    music: 0x60a5fa,
    neutral: 0x4cc9f0,
    restart: 0xfb923c,
    menu: 0xa78bfa,
    continue: 0x2dd4bf
} as const;

/**
 * HUD, pausa y game over. Corre en paralelo sobre GameScene: sus botones
 * capturan el toque antes de que llegue al reconocimiento de gestos.
 */
export class UIScene extends Phaser.Scene {
    private layout!: GameLayout;
    private overlay: Overlay = 'none';
    private leaving = false;
    private resumeMusicOnVisible = false;
    private unsubscribeMusic: (() => void) | null = null;

    private backdrop!: Phaser.GameObjects.Rectangle;
    private hud!: Phaser.GameObjects.Container;
    private scoreText!: Phaser.GameObjects.Text;
    private levelText!: Phaser.GameObjects.Text;
    private shieldText!: Phaser.GameObjects.Text;
    private continueText!: Phaser.GameObjects.Text;
    private pausePanel!: Phaser.GameObjects.Container;
    private gameOverPanel!: Phaser.GameObjects.Container;
    private newRecordText!: Phaser.GameObjects.Text;
    private volumeText!: Phaser.GameObjects.Text;
    private musicButton!: UIButton;
    private sfxButton!: UIButton;
    private continueButton!: UIButton;
    private readonly buttons = new Map<string, UIButton>();

    constructor() {
        super(SceneKeys.UI);
    }

    create(): void {
        this.overlay = 'none';
        this.leaving = false;
        this.resumeMusicOnVisible = false;
        this.buttons.clear();

        this.buildHud();
        this.backdrop = this.add.rectangle(0, 0, 1, 1, 0x000000, 0.7)
            .setOrigin(0)
            .setInteractive()
            .setVisible(false);
        this.buildPausePanel();
        this.buildGameOverPanel();
        this.applyLayout();
        this.refreshHud();
        this.refreshVolume();
        this.refreshSfx();

        const gameEvents = this.scene.get(SceneKeys.GAME).events;
        gameEvents.on(GameEvents.GAME_OVER, this.showGameOver, this);
        gameEvents.on(GameEvents.GAME_ACTIVE, this.hideGameOver, this);
        this.registry.events.on(Phaser.Data.Events.SET_DATA, this.refreshHud, this);
        this.registry.events.on(Phaser.Data.Events.CHANGE_DATA, this.refreshHud, this);
        this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
        this.game.events.on(Phaser.Core.Events.HIDDEN, this.handleHidden, this);
        this.game.events.on(Phaser.Core.Events.VISIBLE, this.handleVisible, this);
        this.input.keyboard?.on(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, this.handleKeyDown, this);
        this.unsubscribeMusic = musicManager.subscribe((state) => this.refreshMusic(state));

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);
    }

    getDebugState(): UIDebugState {
        const buttons: UIDebugState['buttons'] = {};
        this.buttons.forEach((button, name) => {
            if (!this.isShown(button)) return;
            const matrix = button.getWorldTransformMatrix();
            buttons[name] = toPagePoint(this.scale, matrix.tx, matrix.ty);
        });
        return {
            overlay: this.overlay,
            fullscreenAvailable: this.scale.fullscreen.available,
            buttons
        };
    }

    // ========== Construcción ==========

    private buildHud(): void {
        const textStyle = { fontFamily: CONFIG.UI.FONT_FAMILY, fontSize: '14px', color: '#ffcc00' };

        this.scoreText = this.add.text(10, 14, '', textStyle);
        this.levelText = this.add.text(396, 14, '', textStyle).setOrigin(1, 0);

        const shieldIcon = this.add.image(22, 56, 'power_shield').setDisplaySize(28, 28);
        this.shieldText = this.add.text(42, 49, '', { ...textStyle, color: '#00bfff' });
        const continueIcon = this.add.image(132, 56, 'power_continue').setDisplaySize(28, 28);
        this.continueText = this.add.text(152, 49, '', { ...textStyle, color: '#ff6b9d' });

        const pauseButton = this.registerButton('pause', new UIButton(this, 440, 40, {
            width: 64,
            height: 64,
            label: 'II',
            fontSize: 18,
            color: COLORS.menu,
            onClick: () => this.openPause()
        }));

        this.hud = this.add.container(0, 0, [
            this.scoreText,
            this.levelText,
            shieldIcon,
            this.shieldText,
            continueIcon,
            this.continueText,
            pauseButton
        ]);
    }

    private buildPausePanel(): void {
        const rows: Phaser.GameObjects.GameObject[] = [];
        const hasFullscreen = this.scale.fullscreen.available;
        const rowCount = hasFullscreen ? 7 : 6;
        const panelHeight = 110 + rowCount * ROW_GAP;
        const top = -panelHeight / 2;
        let y = top + 110;
        const nextRow = (): number => {
            const current = y;
            y += ROW_GAP;
            return current;
        };

        rows.push(this.createPanelBackground(panelHeight));
        rows.push(this.createTitle(top + 48, 'PAUSA', '#4cc9f0', 24));

        rows.push(this.registerButton('resume', new UIButton(this, 0, nextRow(), {
            width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'REANUDAR', color: COLORS.resume,
            onClick: () => this.closePause()
        })));

        const musicY = nextRow();
        this.musicButton = this.registerButton('music', new UIButton(this, -93, musicY, {
            width: HALF_BUTTON_WIDTH, height: BUTTON_HEIGHT, label: '', fontSize: 12, color: COLORS.music,
            onClick: () => void musicManager.togglePlayPause()
        }));
        rows.push(this.musicButton);
        rows.push(this.registerButton('nextTrack', new UIButton(this, 93, musicY, {
            width: HALF_BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'SIGUIENTE', fontSize: 12, color: COLORS.music,
            onClick: () => void musicManager.playNext()
        })));

        const volumeY = nextRow();
        rows.push(this.registerButton('volumeDown', new UIButton(this, -144, volumeY, {
            width: 72, height: BUTTON_HEIGHT, label: '-', fontSize: 20, color: COLORS.music,
            onClick: () => this.changeVolume(-CONFIG.AUDIO.VOLUME_STEP)
        })));
        this.volumeText = this.add.text(0, volumeY, '', {
            fontFamily: CONFIG.UI.FONT_FAMILY, fontSize: '14px', color: '#93c5fd'
        }).setOrigin(0.5);
        rows.push(this.volumeText);
        rows.push(this.registerButton('volumeUp', new UIButton(this, 144, volumeY, {
            width: 72, height: BUTTON_HEIGHT, label: '+', fontSize: 20, color: COLORS.music,
            onClick: () => this.changeVolume(CONFIG.AUDIO.VOLUME_STEP)
        })));

        this.sfxButton = this.registerButton('sfx', new UIButton(this, 0, nextRow(), {
            width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: '', color: COLORS.music,
            onClick: () => this.toggleSfx()
        }));
        rows.push(this.sfxButton);

        if (hasFullscreen) {
            rows.push(this.registerButton('fullscreen', new UIButton(this, 0, nextRow(), {
                width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'PANTALLA COMPLETA', color: COLORS.neutral,
                onClick: () => this.scale.toggleFullscreen()
            })));
        }

        rows.push(this.registerButton('pauseRestart', new UIButton(this, 0, nextRow(), {
            width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'REINICIAR', color: COLORS.restart,
            onClick: () => this.requestRestart()
        })));
        rows.push(this.registerButton('pauseMenu', new UIButton(this, 0, nextRow(), {
            width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'MENU', color: COLORS.menu,
            onClick: () => this.requestMenu()
        })));

        this.pausePanel = this.add.container(0, 0, rows).setVisible(false);
    }

    private buildGameOverPanel(): void {
        const title = this.add.text(0, -150, 'GAME OVER', {
            fontFamily: CONFIG.UI.FONT_FAMILY,
            fontSize: '40px',
            color: '#ff0000',
            stroke: '#ffffff',
            strokeThickness: 4
        }).setOrigin(0.5);

        this.newRecordText = this.add.text(0, -90, '¡NUEVO RÉCORD!', {
            fontFamily: CONFIG.UI.FONT_FAMILY,
            fontSize: '20px',
            color: '#ffff00',
            stroke: '#ff6600',
            strokeThickness: 3
        }).setOrigin(0.5).setVisible(false);

        this.continueButton = this.registerButton('continue', new UIButton(this, 0, -20, {
            width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: '', color: COLORS.continue,
            onClick: () => this.requestContinue()
        }));
        const restart = this.registerButton('restart', new UIButton(this, 0, -20 + ROW_GAP, {
            width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'REINICIAR', color: COLORS.restart,
            onClick: () => this.requestRestart()
        }));
        const menu = this.registerButton('menu', new UIButton(this, 0, -20 + ROW_GAP * 2, {
            width: BUTTON_WIDTH, height: BUTTON_HEIGHT, label: 'MENU', color: COLORS.menu,
            onClick: () => this.requestMenu()
        }));

        this.gameOverPanel = this.add.container(0, 0, [
            title,
            this.newRecordText,
            this.continueButton,
            restart,
            menu
        ]).setVisible(false);
    }

    private createPanelBackground(height: number): Phaser.GameObjects.Graphics {
        const graphics = this.add.graphics();
        graphics.fillStyle(0x1a1a2e, 0.97);
        graphics.fillRoundedRect(-PANEL_WIDTH / 2, -height / 2, PANEL_WIDTH, height, 12);
        graphics.lineStyle(2, 0x4cc9f0);
        graphics.strokeRoundedRect(-PANEL_WIDTH / 2, -height / 2, PANEL_WIDTH, height, 12);
        return graphics;
    }

    private createTitle(y: number, text: string, color: string, size: number): Phaser.GameObjects.Text {
        return this.add.text(0, y, text, {
            fontFamily: CONFIG.UI.FONT_FAMILY,
            fontSize: `${size}px`,
            color
        }).setOrigin(0.5);
    }

    private registerButton(name: string, button: UIButton): UIButton {
        this.buttons.set(name, button);
        return button;
    }

    // ========== Layout y refresco ==========

    private applyLayout(): void {
        this.layout = computeLayout(this.scale.width, this.scale.height);
        this.hud.setPosition(this.layout.boardX, this.layout.hudY);
        this.backdrop.setSize(this.layout.width, this.layout.height);
        this.backdrop.input?.hitArea.setSize(this.layout.width, this.layout.height);
        this.pausePanel.setPosition(this.layout.centerX, this.layout.centerY);
        this.gameOverPanel.setPosition(this.layout.centerX, this.layout.centerY);
    }

    private refreshHud(): void {
        const read = (key: string): number => Number(this.registry.get(key) ?? 0);
        const shields = read(RegistryKeys.SHIELDS);
        const continues = read(RegistryKeys.CONTINUES);

        this.scoreText.setText(`PUNTOS ${read(RegistryKeys.SCORE)}`);
        this.levelText.setText(`NIVEL ${read(RegistryKeys.LEVEL) || 1}`);
        this.shieldText.setText(`x${shields}`).setAlpha(shields > 0 ? 1 : 0.4);
        this.continueText.setText(`x${continues}`).setAlpha(continues > 0 ? 1 : 0.4);
    }

    private refreshMusic(state: MusicPlaybackState): void {
        const isPlaying = state === 'loading' || state === 'playing';
        this.musicButton.setLabel(isPlaying ? 'MUSICA ON' : 'MUSICA OFF');
    }

    private refreshVolume(): void {
        this.volumeText.setText(`VOL ${Math.round(musicManager.getVolume() * 100)}%`);
    }

    private changeVolume(delta: number): void {
        // Trabaja en décimas para que varios pasos no acumulen error de coma flotante.
        const next = Math.round((musicManager.getVolume() + delta) * 10) / 10;
        musicManager.setVolume(next);
        // Un solo volumen para la música y los efectos.
        this.sound.volume = musicManager.getVolume();
        this.refreshVolume();
    }

    private toggleSfx(): void {
        this.sound.mute = !this.sound.mute;
        this.refreshSfx();
    }

    private refreshSfx(): void {
        this.sfxButton.setLabel(this.sound.mute ? 'EFECTOS OFF' : 'EFECTOS ON');
    }

    private isShown(object: Phaser.GameObjects.GameObject & { visible: boolean }): boolean {
        let current: (Phaser.GameObjects.GameObject & { visible: boolean }) | null = object;
        while (current) {
            if (!current.visible) return false;
            current = current.parentContainer;
        }
        return true;
    }

    // ========== Overlays ==========

    private setOverlay(overlay: Overlay): void {
        this.overlay = overlay;
        this.backdrop.setVisible(overlay !== 'none');
        this.pausePanel.setVisible(overlay === 'pause');
        this.gameOverPanel.setVisible(overlay === 'game-over');
        this.buttons.get('pause')?.setVisible(overlay === 'none');
    }

    private openPause(): void {
        if (this.leaving || this.overlay !== 'none' || !this.scene.isActive(SceneKeys.GAME)) return;
        this.scene.pause(SceneKeys.GAME);
        this.setOverlay('pause');
    }

    private closePause(): void {
        if (this.overlay !== 'pause') return;
        this.scene.resume(SceneKeys.GAME);
        this.setOverlay('none');
    }

    private showGameOver(payload: GameOverPayload): void {
        this.newRecordText.setVisible(payload.isNewRecord);
        this.continueButton
            .setLabel(`CONTINUAR (${payload.continues})`)
            .setVisible(payload.continues > 0);
        this.setOverlay('game-over');
    }

    private hideGameOver(): void {
        if (this.overlay === 'game-over') this.setOverlay('none');
    }

    private requestRestart(): void {
        if (this.leaving) return;
        this.closePause();
        this.emitToGame(GameEvents.UI_RESTART);
    }

    private requestContinue(): void {
        if (this.leaving || this.overlay !== 'game-over') return;
        this.emitToGame(GameEvents.UI_CONTINUE);
    }

    private requestMenu(): void {
        if (this.leaving) return;
        this.leaving = true;
        this.closePause();
        this.setOverlay('none');
        this.emitToGame(GameEvents.UI_MENU);
    }

    private emitToGame(event: string): void {
        this.scene.get(SceneKeys.GAME).events.emit(event);
    }

    // ========== Entrada y ciclo de vida ==========

    private handleKeyDown(event: KeyboardEvent): void {
        if (event.repeat) return;
        switch (event.code) {
            case 'KeyR':
                this.requestRestart();
                break;
            case 'KeyM':
                this.requestMenu();
                break;
            case 'KeyC':
                this.requestContinue();
                break;
            case 'KeyP':
            case 'Escape':
                if (this.overlay === 'pause') this.closePause();
                else this.openPause();
                break;
        }
    }

    private handleHidden(): void {
        this.openPause();
        if (musicManager.isPlaying()) {
            this.resumeMusicOnVisible = true;
            void musicManager.togglePlayPause();
        }
    }

    private handleVisible(): void {
        if (!this.resumeMusicOnVisible) return;
        this.resumeMusicOnVisible = false;
        void musicManager.start();
    }

    private handleShutdown(): void {
        const gameEvents = this.scene.get(SceneKeys.GAME).events;
        gameEvents.off(GameEvents.GAME_OVER, this.showGameOver, this);
        gameEvents.off(GameEvents.GAME_ACTIVE, this.hideGameOver, this);
        this.registry.events.off(Phaser.Data.Events.SET_DATA, this.refreshHud, this);
        this.registry.events.off(Phaser.Data.Events.CHANGE_DATA, this.refreshHud, this);
        this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
        this.game.events.off(Phaser.Core.Events.HIDDEN, this.handleHidden, this);
        this.game.events.off(Phaser.Core.Events.VISIBLE, this.handleVisible, this);
        this.unsubscribeMusic?.();
        this.unsubscribeMusic = null;
        this.buttons.clear();
    }
}
