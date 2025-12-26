import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { ScoreManager } from './ScoreManager';

/**
 * Gestor del estado del juego (game over, score, level, power-ups)
 */
export class GameStateManager {
    private scene: Phaser.Scene;
    private _gameOver: boolean = false;
    private _level: number = 1;
    private _score: number = 0;
    private _initialCoinCount: number = 0;

    // Power-ups
    private _shieldCount: number = 0;
    private _continueCount: number = 0;

    // Game Over UI
    private gameOverText: Phaser.GameObjects.Text | null = null;
    private restartText: Phaser.GameObjects.Text | null = null;
    private continueText: Phaser.GameObjects.Text | null = null;
    private newRecordText: Phaser.GameObjects.Text | null = null;
    private menuText: Phaser.GameObjects.Text | null = null;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
    }

    /**
     * Crea los textos de UI del game over
     */
    createGameOverUI(): void {
        this.gameOverText = this.scene.add.text(
            CONFIG.GAME_WIDTH / 2,
            CONFIG.GAME_HEIGHT / 2,
            'GAME OVER',
            {
                fontSize: CONFIG.UI.GAME_OVER_FONT_SIZE,
                fontFamily: CONFIG.UI.FONT_FAMILY,
                color: '#ff0000',
                stroke: '#ffffff',
                strokeThickness: 4
            }
        );
        this.gameOverText.setOrigin(0.5);
        this.gameOverText.setDepth(100);
        this.gameOverText.setVisible(false);

        this.restartText = this.scene.add.text(
            CONFIG.GAME_WIDTH / 2,
            CONFIG.GAME_HEIGHT / 2 + CONFIG.UI.RESTART_OFFSET_Y,
            'PRESS R TO RESTART',
            {
                fontSize: CONFIG.UI.RESTART_FONT_SIZE,
                fontFamily: CONFIG.UI.FONT_FAMILY,
                color: '#ffff00',
                align: 'center'
            }
        );
        this.restartText.setOrigin(0.5);
        this.restartText.setDepth(100);
        this.restartText.setVisible(false);
    }

    /**
     * Muestra la pantalla de game over
     */
    showGameOver(): void {
        this._gameOver = true;
        const isNewRecord = ScoreManager.setHighScore(this._score);

        this.gameOverText?.setVisible(true);
        this.restartText?.setVisible(true);

        // Show continue option if player has continues
        if (this._continueCount > 0) {
            if (!this.continueText) {
                this.continueText = this.scene.add.text(
                    CONFIG.GAME_WIDTH / 2,
                    CONFIG.GAME_HEIGHT / 2 + CONFIG.UI.RESTART_OFFSET_Y + 25,
                    '',
                    {
                        fontSize: '14px',
                        fontFamily: CONFIG.UI.FONT_FAMILY,
                        color: '#00ff00'
                    }
                );
                this.continueText.setOrigin(0.5);
                this.continueText.setDepth(100);
            }
            this.continueText.setText(`C PARA CONTINUAR (${this._continueCount}❤)`);
            this.continueText.setVisible(true);
        } else {
            this.continueText?.setVisible(false);
        }

        if (isNewRecord && this._score > 0) {
            if (!this.newRecordText) {
                this.newRecordText = this.scene.add.text(
                    CONFIG.GAME_WIDTH / 2,
                    CONFIG.GAME_HEIGHT / 2 - 60,
                    '¡NUEVO RÉCORD!',
                    {
                        fontSize: '20px',
                        fontFamily: CONFIG.UI.FONT_FAMILY,
                        color: '#ffff00',
                        stroke: '#ff6600',
                        strokeThickness: 3
                    }
                );
                this.newRecordText.setOrigin(0.5);
                this.newRecordText.setDepth(100);
            }
            this.newRecordText.setVisible(true);

            this.scene.tweens.add({
                targets: this.newRecordText,
                scaleX: 1.2,
                scaleY: 1.2,
                duration: 400,
                yoyo: true,
                repeat: -1
            });
        }

        // Adjust menu text position based on whether continue is shown
        const menuOffsetY = this._continueCount > 0
            ? CONFIG.UI.RESTART_OFFSET_Y + 55
            : CONFIG.UI.RESTART_OFFSET_Y + 30;

        if (!this.menuText) {
            this.menuText = this.scene.add.text(
                CONFIG.GAME_WIDTH / 2,
                CONFIG.GAME_HEIGHT / 2 + menuOffsetY,
                'PRESIONA M PARA MENÚ',
                {
                    fontSize: '14px',
                    fontFamily: CONFIG.UI.FONT_FAMILY,
                    color: '#888888'
                }
            );
            this.menuText.setOrigin(0.5);
            this.menuText.setDepth(100);
        } else {
            this.menuText.setY(CONFIG.GAME_HEIGHT / 2 + menuOffsetY);
        }
        this.menuText.setVisible(true);
    }

    /**
     * Oculta la UI de game over
     */
    hideGameOverUI(): void {
        this.gameOverText?.setVisible(false);
        this.restartText?.setVisible(false);
        this.continueText?.setVisible(false);
        this.newRecordText?.setVisible(false);
        this.menuText?.setVisible(false);
    }

    /**
     * Añade puntos al score
     */
    addScore(points: number): void {
        this._score += points;
    }

    /**
     * Avanza al siguiente nivel
     */
    nextLevel(): void {
        this._score += 100;
        this._level += 1;
    }

    // ========== POWER-UPS ==========

    /**
     * Añade un shield
     */
    addShield(): void {
        this._shieldCount++;
    }

    /**
     * Consume un shield si está disponible
     * @returns true si se consumió, false si no había
     */
    useShield(): boolean {
        if (this._shieldCount > 0) {
            this._shieldCount--;
            return true;
        }
        return false;
    }

    /**
     * Añade un continue
     */
    addContinue(): void {
        this._continueCount++;
    }

    /**
     * Consume un continue si está disponible
     * @returns true si se consumió, false si no había
     */
    useContinue(): boolean {
        if (this._continueCount > 0) {
            this._continueCount--;
            return true;
        }
        return false;
    }

    /**
     * Verifica si tiene shield disponible
     */
    hasShield(): boolean {
        return this._shieldCount > 0;
    }

    /**
     * Verifica si tiene continue disponible
     */
    hasContinue(): boolean {
        return this._continueCount > 0;
    }

    // ========== RESET ==========

    /**
     * Resetea el estado del juego
     */
    reset(fullReset: boolean): void {
        if (fullReset) {
            this._level = 1;
            this._score = 0;
            this._shieldCount = 0;
            this._continueCount = 0;
        }
        this._gameOver = false;
        this.hideGameOverUI();
    }

    /**
     * Retorna al menú principal
     */
    returnToMenu(): void {
        this.scene.cameras.main.fadeOut(300, 0, 0, 0);
        this.scene.time.delayedCall(300, () => {
            this.scene.scene.start('MenuScene');
        });
    }

    // ========== GETTERS/SETTERS ==========

    get isGameOver(): boolean {
        return this._gameOver;
    }

    set isGameOver(value: boolean) {
        this._gameOver = value;
    }

    get level(): number {
        return this._level;
    }

    get score(): number {
        return this._score;
    }

    get shieldCount(): number {
        return this._shieldCount;
    }

    get continueCount(): number {
        return this._continueCount;
    }

    get initialCoinCount(): number {
        return this._initialCoinCount;
    }

    set initialCoinCount(value: number) {
        this._initialCoinCount = value;
    }

    /**
     * Destructor
     */
    destroy(): void {
        if (this.gameOverText) this.gameOverText.destroy();
        if (this.restartText) this.restartText.destroy();
        if (this.continueText) this.continueText.destroy();
        if (this.newRecordText) this.newRecordText.destroy();
        if (this.menuText) this.menuText.destroy();
    }
}
