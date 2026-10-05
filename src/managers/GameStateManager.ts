import { ScoreManager } from './ScoreManager';

/**
 * Estado de la partida (game over, score, level, power-ups).
 * No dibuja nada: la UI vive en UIScene.
 */
export class GameStateManager {
    private _gameOver: boolean = false;
    private _level: number = 1;
    private _score: number = 0;
    private _initialCoinCount: number = 0;

    // Power-ups
    private _shieldCount: number = 0;
    private _continueCount: number = 0;

    /**
     * Marca la partida como terminada y registra el récord.
     * @returns true si el puntaje es un nuevo récord
     */
    registerGameOver(): boolean {
        this._gameOver = true;
        return ScoreManager.setHighScore(this._score) && this._score > 0;
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
     * Consume un continue si la partida terminó y queda alguno
     * @returns true si se consumió y la partida sigue
     */
    useContinue(): boolean {
        if (this._gameOver && this._continueCount > 0) {
            this._continueCount--;
            this._gameOver = false;
            return true;
        }
        return false;
    }

    // ========== RESET ==========

    /**
     * Vuelve al estado inicial de una partida nueva
     */
    reset(): void {
        this._level = 1;
        this._score = 0;
        this._shieldCount = 0;
        this._continueCount = 0;
        this._gameOver = false;
    }

    /**
     * Aplica valores de dev mode
     */
    applyDevMode(level: number, shields: number, continues: number, score: number): void {
        this._level = level;
        this._shieldCount = shields;
        this._continueCount = continues;
        this._score = score;
    }

    // ========== GETTERS/SETTERS ==========

    get isGameOver(): boolean {
        return this._gameOver;
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
}
