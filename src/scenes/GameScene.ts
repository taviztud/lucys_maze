import Phaser from 'phaser';
import { CONFIG } from '../Config';

// Managers
import { InputManager } from '../managers/InputManager';
import { AudioManager } from '../managers/AudioManager';
import { PlayerController } from '../managers/PlayerController';
import { EnemyManager } from '../managers/EnemyManager';
import { SpiderManager } from '../managers/SpiderManager';
import { UIManager } from '../managers/UIManager';
import { GameStateManager } from '../managers/GameStateManager';

// Systems
import { CollisionSystem } from '../systems/CollisionSystem';
import { MazeGenerator, type MazeData } from '../systems/MazeGenerator';
import { GridRenderer } from '../systems/GridRenderer';

import type { Position, Direction } from '../types/game.types';

/**
 * Escena principal del juego - Actúa como orquestador de todos los managers
 */
export class GameScene extends Phaser.Scene {
    // Configuration
    private boardSize: number;
    private cellSize: number;

    // Managers
    private inputManager!: InputManager;
    private audioManager!: AudioManager;
    private playerController!: PlayerController;
    private enemyManager!: EnemyManager;
    private spiderManager!: SpiderManager;
    private uiManager!: UIManager;
    private gameState!: GameStateManager;

    // Systems
    private collision!: CollisionSystem;
    private mazeGenerator!: MazeGenerator;
    private gridRenderer!: GridRenderer;

    // Game Data
    private mazeData!: MazeData;
    private saves: Position[] = [];      // Continue power-ups
    private shields: Position[] = [];    // Shield power-ups
    private playerStartPosition: Position = { x: 0, y: 0 };
    private shieldSpawned: boolean = false;   // Track if shield already spawned this level
    private continueSpawned: boolean = false; // Track if continue already spawned this level

    // Optimization
    private lastEnemyUpdateTime: number = 0;
    private requireFreshPressAfterReset: boolean = false;

    constructor() {
        super('GameScene');
        this.boardSize = CONFIG.BOARD_SIZE;
        this.cellSize = CONFIG.CELL_SIZE;
    }

    preload(): void {
        try {
            // Load images
            this.load.image('player_stand', 'lucy_stand.png');
            this.load.image('player_run', 'lucy_run.png');
            this.load.image('player_die', 'lucy_die.png');
            this.load.image('coin', 'coin_tuto.png');
            this.load.image('obstacle_brick', 'brick_1.png');
            this.load.image('obstacle_rock', 'rock_1.png');
            this.load.image('obstacle_tree', 'tree_1.png');
            this.load.image('trap', 'sping.png');
            this.load.image('exit', 'exit.png');
            this.load.image('enemy', 'enemy.png');
            this.load.image('spider', 'enemy_spider.png');
            this.load.image('power_continue', 'power_continue.png');
            this.load.image('power_shield', 'power_shield.png');

            // Initialize audio manager early for preload
            this.audioManager = new AudioManager(this);
            this.audioManager.detectAndLoadMusic();
        } catch (error) {
            console.error('Critical error in preload:', error);
        }
    }

    create(): void {
        // Initialize all managers and systems
        this.initializeManagers();

        // Setup event listeners
        this.setupEvents();

        // Generate initial maze
        this.startNewGame();

        // Initialize audio
        this.audioManager.initMusic();

        // Setup UI event listeners
        this.uiManager.setupEventListeners({
            onMusicToggle: () => this.audioManager.togglePlayPause(),
            onVolumeChange: (vol) => this.audioManager.setVolume(vol),
            onNextMusic: () => this.audioManager.playNext(),
            onPrevMusic: () => this.audioManager.playPrevious(),
            onRestart: () => this.handleRestartButton()
        });

        // Update initial UI
        this.uiManager.updateScoreAndLevel(this.gameState.score, this.gameState.level);
    }

    update(time: number, _delta: number): void {
        // Handle game over input
        if (this.gameState.isGameOver) {
            // R = Full restart (reset everything)
            if (this.inputManager.isRestartJustPressed()) {
                this.gameState.reset(true);
                this.updatePowerUpsUI();
                this.uiManager.updateScoreAndLevel(this.gameState.score, this.gameState.level);
                this.resetGame(true);
            }
            // C = Continue (use power-up, keep level and score)
            if (this.inputManager.isContinueJustPressed() && this.gameState.useContinue()) {
                this.updatePowerUpsUI();
                this.resetGame(false);
            }
            if (this.inputManager.isMenuJustPressed()) {
                this.returnToMenu();
            }
            return;
        }

        // Update enemies with throttling
        if (time > this.lastEnemyUpdateTime + CONFIG.PERFORMANCE.ENEMY_UPDATE_THROTTLE_MS) {
            this.enemyManager.update();

            // Update spiders and check collision
            const playerPos = this.playerController.getPosition();
            const playerHit = this.spiderManager.update(time, playerPos);
            if (playerHit && !this.gameState.isGameOver) {
                this.handleDeath();
            }

            this.lastEnemyUpdateTime = time;
        }
    }

    /**
     * Inicializa todos los managers y sistemas
     */
    private initializeManagers(): void {
        // Core systems
        this.collision = new CollisionSystem(this.boardSize);
        this.mazeGenerator = new MazeGenerator(this.boardSize);
        this.gridRenderer = new GridRenderer(this, this.cellSize, this.boardSize);

        // Managers
        this.inputManager = new InputManager(this);
        // audioManager already initialized in preload
        this.playerController = new PlayerController(this, this.collision, this.cellSize);
        this.enemyManager = new EnemyManager(this, this.collision, this.cellSize);
        this.spiderManager = new SpiderManager(this, this.collision, this.cellSize, this.boardSize);
        this.uiManager = new UIManager();
        this.gameState = new GameStateManager(this);

        // Setup input
        this.inputManager.setup();

        // Setup turn callbacks for direction change during movement
        this.playerController.setTurnCallbacks(
            () => this.inputManager.getDesiredDirection(),
            (dx, dy) => this.handlePlayerMove({ dx, dy })
        );

        // Create game over UI
        this.gameState.createGameOverUI();
    }

    /**
     * Configura los eventos entre managers
     */
    private setupEvents(): void {
        // Input direction event
        this.events.on('input:direction', (direction: Direction) => {
            if (!this.playerController.getIsMoving() &&
                !this.gameState.isGameOver &&
                (direction.dx !== 0 || direction.dy !== 0)) {
                this.handlePlayerMove(direction);
                this.requireFreshPressAfterReset = false;
            }
        });

        // Player events
        this.events.on('player:died', () => {
            this.handleDeath();
        });

        this.events.on('player:reachedExit', () => {
            this.handleLevelComplete();
        });

        // Enemy moved event (check collision with player)
        this.events.on('enemy:moved', (pos: Position) => {
            const playerPos = this.playerController.getPosition();
            if (pos.x === playerPos.x && pos.y === playerPos.y) {
                this.handleDeath();
            }
        });
    }

    /**
     * Inicia un nuevo juego
     */
    private startNewGame(): void {
        // Generate maze
        const exitPosition = this.mazeGenerator.generateRandomExit();
        this.mazeData = this.mazeGenerator.generate(exitPosition);
        this.saves = [];

        // Build collision map
        this.collision.build(this.mazeData.obstacles);

        // Store initial coin count
        this.gameState.initialCoinCount = this.mazeData.coins.length;

        // Create grid and draw entities
        this.gridRenderer.createGrid(this.gameState.level);
        this.gridRenderer.drawEntities({
            coins: this.mazeData.coins,
            obstacles: this.mazeData.obstacles,
            traps: this.mazeData.traps,
            saves: this.saves,
            shields: this.shields,
            exitPosition: this.mazeData.exitPosition
        });

        // Create player
        this.playerController.create(this.playerStartPosition);

        // Initialize enemies (level 5+)
        const excludePositions = [
            this.playerStartPosition,
            this.mazeData.exitPosition,
            ...this.mazeData.obstacles,
            ...this.mazeData.traps
        ];
        this.enemyManager.init(this.gameState.level, excludePositions);

        // Initialize spiders
        this.spiderManager.generate(
            this.gameState.level,
            this.mazeData.obstacles,
            this.mazeData.exitPosition
        );
    }

    /**
     * Maneja el movimiento del jugador
     */
    private handlePlayerMove(direction: Direction): void {
        this.playerController.move(
            direction.dx,
            direction.dy,
            this.gameState.level,
            this.mazeData.traps,
            this.mazeData.exitPosition,
            (x, y) => this.enemyManager.checkCollision(x, y) || this.spiderManager.checkCollision(x, y),
            (x, y) => this.processItemsAtPosition(x, y)
        );
    }

    /**
     * Procesa items en la posición del jugador
     */
    private processItemsAtPosition(x: number, y: number): void {
        // Check coins
        for (let i = this.mazeData.coins.length - 1; i >= 0; i--) {
            if (this.mazeData.coins[i].x === x && this.mazeData.coins[i].y === y) {
                this.playerController.emitCoinParticles(x, y);
                this.mazeData.coins.splice(i, 1);
                this.gameState.addScore(10);
                this.uiManager.updateScore(this.gameState.score);
                this.gridRenderer.removeCoin(x, y);

                // Check power-up spawn triggers based on coins collected
                if (this.gameState.initialCoinCount > 0) {
                    const collected = this.gameState.initialCoinCount - this.mazeData.coins.length;
                    const ratio = collected / this.gameState.initialCoinCount;

                    // Power-up spawns at configured ratio (only ONE per level)
                    if (ratio >= CONFIG.POWERUPS.SPAWN_COIN_RATIO && !this.shieldSpawned && !this.continueSpawned) {
                        // Shield has higher probability than continue
                        if (Math.random() < CONFIG.POWERUPS.SHIELD_PROBABILITY) {
                            this.generateShieldItem();
                            this.shieldSpawned = true;
                        } else {
                            this.generateSaveItem();
                            this.continueSpawned = true;
                        }
                    }
                }
                break;
            }
        }

        // Check shield collection
        if (this.shields.length > 0) {
            const shield = this.shields[0];
            if (shield.x === x && shield.y === y) {
                this.gameState.addShield();
                this.shields.splice(0, 1);
                this.gridRenderer.removeShield();
                this.updatePowerUpsUI();
            }
        }

        // Check continue collection
        if (this.saves.length > 0) {
            const save = this.saves[0];
            if (save.x === x && save.y === y) {
                this.gameState.addContinue();
                this.saves.splice(0, 1);
                this.gridRenderer.removeSave();
                this.updatePowerUpsUI();
            }
        }

        // Animate nearby trees
        this.gridRenderer.animateNearbyTrees(x, y);
    }

    /**
     * Genera un save item (continue power-up)
     */
    private generateSaveItem(): void {
        const excludePositions = [
            this.playerController.getPosition(),
            this.mazeData.exitPosition,
            ...this.mazeData.obstacles,
            ...this.mazeData.traps,
            ...this.enemyManager.getEnemies().map(e => ({ x: e.x, y: e.y })),
            ...this.shields
        ];

        const position = this.mazeGenerator.generateSaveItem(excludePositions);
        if (position && this.saves.length === 0) {
            this.saves.push(position);
            this.gridRenderer.drawEntities({
                coins: this.mazeData.coins,
                obstacles: this.mazeData.obstacles,
                traps: this.mazeData.traps,
                saves: this.saves,
                shields: this.shields,
                exitPosition: this.mazeData.exitPosition
            });
        }
    }

    /**
     * Genera un shield item
     */
    private generateShieldItem(): void {
        const excludePositions = [
            this.playerController.getPosition(),
            this.mazeData.exitPosition,
            ...this.mazeData.obstacles,
            ...this.mazeData.traps,
            ...this.enemyManager.getEnemies().map(e => ({ x: e.x, y: e.y })),
            ...this.saves
        ];

        const position = this.mazeGenerator.generateSaveItem(excludePositions);
        if (position && this.shields.length === 0) {
            this.shields.push(position);
            this.gridRenderer.drawEntities({
                coins: this.mazeData.coins,
                obstacles: this.mazeData.obstacles,
                traps: this.mazeData.traps,
                saves: this.saves,
                shields: this.shields,
                exitPosition: this.mazeData.exitPosition
            });
        }
    }

    /**
     * Maneja la muerte del jugador
     * Primero intenta usar shield (flash sin detener), luego game over
     */
    private handleDeath(): void {
        // Try to use shield first
        if (this.gameState.useShield()) {
            // Shield absorbed the hit - flash player and continue movement
            this.playerController.flashInvincibility();
            this.updatePowerUpsUI();
            return;
        }

        // No shield - game over
        this.gameState.isGameOver = true;
        this.playerController.stopMovement();
        this.playerController.showDeathSprite();
        this.gameState.showGameOver();
    }

    /**
     * Maneja la completación del nivel
     */
    private handleLevelComplete(): void {
        this.gameState.nextLevel();
        this.uiManager.updateScoreAndLevel(this.gameState.score, this.gameState.level);
        this.playerController.stopMovement();
        this.requireFreshPressAfterReset = true;
        this.inputManager.resetDesiredDirection();
        this.resetGame(false);
    }

    /**
     * Resetea el juego
     */
    private resetGame(fullReset: boolean): void {
        // Clear caches
        this.gridRenderer.clearCache();
        this.enemyManager.reset();
        this.spiderManager.reset();

        // Generate new maze
        const exitPosition = this.mazeGenerator.generateRandomExit();
        this.mazeData = this.mazeGenerator.generate(exitPosition);

        // Reset power-up items and spawn flags
        this.saves = [];
        this.shields = [];
        this.shieldSpawned = false;
        this.continueSpawned = false;

        // Rebuild collision
        this.collision.build(this.mazeData.obstacles);
        this.gameState.initialCoinCount = this.mazeData.coins.length;

        // Redraw
        this.gridRenderer.createGrid(this.gameState.level);
        this.gridRenderer.drawEntities({
            coins: this.mazeData.coins,
            obstacles: this.mazeData.obstacles,
            traps: this.mazeData.traps,
            saves: this.saves,
            shields: this.shields,
            exitPosition: this.mazeData.exitPosition
        });

        // Reset player
        this.playerController.reset(this.playerStartPosition);

        // Re-init enemies
        const excludePositions = [
            this.playerStartPosition,
            this.mazeData.exitPosition,
            ...this.mazeData.obstacles,
            ...this.mazeData.traps
        ];
        this.enemyManager.init(this.gameState.level, excludePositions);
        this.spiderManager.generate(
            this.gameState.level,
            this.mazeData.obstacles,
            this.mazeData.exitPosition
        );

        // Hide game over UI
        this.gameState.hideGameOverUI();
    }

    /**
     * Maneja el botón de restart de UI
     */
    private handleRestartButton(): void {
        if (this.gameState.useContinue()) {
            this.updatePowerUpsUI();
            this.resetGame(false);
        } else {
            this.gameState.reset(true);
            this.updatePowerUpsUI();
            this.uiManager.updateScoreAndLevel(this.gameState.score, this.gameState.level);
            this.resetGame(true);
        }
    }

    /**
     * Actualiza la UI de power-ups
     */
    private updatePowerUpsUI(): void {
        this.uiManager.updatePowerUps(
            this.gameState.shieldCount,
            this.gameState.continueCount
        );
    }



    /**
     * Retorna al menú principal
     */
    private returnToMenu(): void {
        this.audioManager.stop();
        this.gameState.returnToMenu();
    }

    /**
     * Cleanup al destruir la escena
     */
    shutdown(): void {
        this.inputManager?.destroy();
        this.audioManager?.destroy();
        this.playerController?.destroy();
        this.enemyManager?.destroy();
        this.spiderManager?.destroy();
        this.uiManager?.destroy();
        this.gameState?.destroy();
        this.gridRenderer?.destroy();

        this.events.off('input:direction');
        this.events.off('player:died');
        this.events.off('player:reachedExit');
        this.events.off('enemy:moved');
    }
}
