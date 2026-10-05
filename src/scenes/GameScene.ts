import Phaser from 'phaser';
import { getSfxDebugState, playSfx } from '../audio/sfx';
import { CONFIG } from '../Config';
import { GameEvents, RegistryKeys, SceneKeys, type GameOverPayload } from '../events';

// Managers
import { InputManager } from '../managers/InputManager';
import { musicManager } from '../managers/MusicManager';
import { PlayerController } from '../managers/PlayerController';
import { EnemyManager } from '../managers/EnemyManager';
import { SpiderManager } from '../managers/SpiderManager';
import { GameStateManager } from '../managers/GameStateManager';

// Systems
import { CollisionSystem } from '../systems/CollisionSystem';
import { MazeGenerator, type MazeData } from '../systems/MazeGenerator';
import { GridRenderer } from '../systems/GridRenderer';

import { computeLayout, toPagePoint } from '../ui/layout';
import { calculateStepDuration } from '../utils/playerSpeed';
import type { Position, Direction } from '../types/game.types';
import type { DevModeData } from './MenuScene';
import type { UIScene } from './UIScene';

type PowerUpKind = 'shield' | 'continue';

/**
 * Escena principal del juego - Actúa como orquestador de todos los managers
 */
export class GameScene extends Phaser.Scene {
    // Configuration
    private boardWidth: number;
    private boardHeight: number;
    private cellSize: number;

    // Managers
    private inputManager!: InputManager;
    private playerController!: PlayerController;
    private enemyManager!: EnemyManager;
    private spiderManager!: SpiderManager;
    private gameState!: GameStateManager;

    // Systems
    private collision!: CollisionSystem;
    private mazeGenerator!: MazeGenerator;
    private gridRenderer!: GridRenderer;

    // Game Data
    private mazeData!: MazeData;
    private saves: Position[] = [];      // Continue power-ups
    private shields: Position[] = [];    // Shield power-ups
    private readonly playerStartPosition: Position = { x: 0, y: 0 };
    private powerUpSpawned: boolean = false;  // Only one power-up spawns per level

    // Remaining invincibility after a shield absorbs a hit. Counted down with
    // delta so pausing the scene does not consume it.
    private invincibilityMs: number = 0;
    private leaving: boolean = false;

    constructor() {
        super(SceneKeys.GAME);
        this.boardWidth = CONFIG.BOARD_WIDTH;
        this.boardHeight = CONFIG.BOARD_HEIGHT;
        this.cellSize = CONFIG.CELL_SIZE;
    }

    create(data?: DevModeData): void {
        this.leaving = false;

        // Initialize all managers and systems
        this.initializeManagers();

        // Apply dev mode data if provided
        if (data && data.enabled) {
            this.gameState.applyDevMode(data.level, data.shields, data.continues, data.score);
        }

        // Setup event listeners
        this.setupEvents();

        // Generate initial maze
        this.buildLevel();

        this.applyLayout();
        this.scale.on(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
        // Phaser only emits this event: it never calls a scene method on its own.
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.handleShutdown, this);

        this.syncHud();
        this.scene.launch(SceneKeys.UI);
        playSfx(this, 'bark');
    }

    update(_time: number, delta: number): void {
        if (this.gameState.isGameOver) return;

        if (this.invincibilityMs > 0) {
            this.invincibilityMs = Math.max(0, this.invincibilityMs - delta);
        }

        this.enemyManager.update();

        const playerPos = this.playerController.getPosition();
        this.spiderManager.update(delta, playerPos);

        // Dynamic hazards are checked every frame, so standing on a web or
        // letting a worm walk into Lucy hurts as soon as invincibility ends.
        if (this.isDynamicHazard(playerPos.x, playerPos.y)) this.handleDeath();
    }

    /** Concise state used by the automated browser test loop. */
    renderGameToText(): string {
        if (!this.gameState || !this.playerController || !this.mazeData) {
            return JSON.stringify({ mode: 'loading', scene: 'GameScene' });
        }

        const layout = computeLayout(this.scale.width, this.scale.height);
        const boardTopLeft = toPagePoint(this.scale, layout.boardX, layout.boardY);
        const boardBottomRight = toPagePoint(
            this.scale,
            layout.boardX + layout.boardWidth,
            layout.boardY + layout.boardHeight
        );
        const uiScene = this.scene.get(SceneKeys.UI) as UIScene;

        return JSON.stringify({
            coordinateSystem: 'grid origin top-left; x increases right; y increases down',
            mode: this.gameState.isGameOver ? 'game-over' : this.scene.isPaused() ? 'paused' : 'playing',
            scene: 'GameScene',
            level: this.gameState.level,
            score: this.gameState.score,
            player: {
                ...this.playerController.getPosition(),
                visualState: this.playerController.getVisualState(),
                moving: this.playerController.getIsMoving(),
                frame: this.playerController.getCurrentFrameName(),
                trail: this.playerController.getTrailState()
            },
            exit: this.mazeData.exitPosition,
            coins: this.mazeData.coins,
            obstacles: this.mazeData.obstacles,
            powerUps: { shields: this.shields, continues: this.saves },
            inventory: { shields: this.gameState.shieldCount, continues: this.gameState.continueCount },
            theme: this.gridRenderer.getThemeState(),
            traps: this.gridRenderer.getTrapVisualStates(),
            worms: this.enemyManager.getEnemies().map((enemy) => ({
                x: Number(enemy.x.toFixed(3)),
                y: Number(enemy.y.toFixed(3)),
                target: enemy.target,
                frame: enemy.sprite?.frame.name ?? null,
                animation: enemy.sprite?.anims.currentAnim?.key ?? null,
                isPlaying: enemy.sprite?.anims.isPlaying ?? false,
                flipX: enemy.sprite?.flipX ?? false,
                startFrame: enemy.sprite?.getData('startFrame') ?? null,
                scaleMultiplier: enemy.sprite?.getData('scaleMultiplier') ?? null
            })),
            spiders: this.spiderManager.getVisualStates(),
            input: this.inputManager.getDebugState(),
            ui: this.scene.isActive(SceneKeys.UI) ? uiScene.getDebugState() : null,
            // Page CSS pixels, so automated tests know where to touch.
            layout: {
                viewport: { width: window.innerWidth, height: window.innerHeight },
                board: {
                    x: boardTopLeft.x,
                    y: boardTopLeft.y,
                    width: boardBottomRight.x - boardTopLeft.x,
                    height: boardBottomRight.y - boardTopLeft.y
                }
            },
            sfx: getSfxDebugState(this),
            music: {
                state: musicManager.getState(),
                track: musicManager.getCurrentTrackId(),
                format: musicManager.getCurrentFormat(),
                volume: musicManager.getVolume()
            }
        });
    }

    /**
     * Inicializa todos los managers y sistemas
     */
    private initializeManagers(): void {
        // Core systems
        this.collision = new CollisionSystem(this.boardWidth, this.boardHeight);
        this.mazeGenerator = new MazeGenerator(this.boardWidth, this.boardHeight);
        this.gridRenderer = new GridRenderer(this, this.cellSize, this.boardWidth, this.boardHeight);

        // Managers
        this.inputManager = new InputManager(this);
        this.playerController = new PlayerController(this, this.collision, this.cellSize);
        this.enemyManager = new EnemyManager(this, this.collision, this.cellSize);
        this.spiderManager = new SpiderManager(this, this.collision, this.cellSize, this.boardWidth, this.boardHeight);
        this.gameState = new GameStateManager();

        // Setup input
        this.inputManager.setup();

        // The queued turn is applied by the player at the first free cell
        this.playerController.setDirectionQueue(this.inputManager);
        this.playerController.create(this.playerStartPosition);
    }

    /**
     * Configura los eventos entre managers y con la UI
     */
    private setupEvents(): void {
        this.events.on(GameEvents.INPUT_DIRECTION, this.handleDirectionInput, this);
        this.events.on(GameEvents.UI_RESTART, this.handleRestart, this);
        this.events.on(GameEvents.UI_CONTINUE, this.handleContinue, this);
        this.events.on(GameEvents.UI_MENU, this.returnToMenu, this);
    }

    /**
     * Genera y dibuja un nivel completo para el estado actual de la partida
     */
    private buildLevel(): void {
        // Clear the previous level
        this.gridRenderer.clearCache();
        this.enemyManager.reset();
        this.spiderManager.reset();
        this.inputManager.clearQueuedDirection();
        this.invincibilityMs = 0;

        // Generate maze
        const exitPosition = this.mazeGenerator.generateRandomExit();
        this.mazeData = this.mazeGenerator.generate(exitPosition);

        // Reset power-up items and spawn flag
        this.saves = [];
        this.shields = [];
        this.powerUpSpawned = false;

        // Build collision map
        this.collision.build(this.mazeData.obstacles);
        this.gameState.initialCoinCount = this.mazeData.coins.length;

        // Create grid and draw entities
        this.gridRenderer.createGrid(this.gameState.level);
        this.drawEntities();

        // Place the player and hand it the rules of this level
        this.playerController.reset(this.playerStartPosition);
        this.playerController.setLevelContext({
            stepDurationMs: calculateStepDuration(this.gameState.level),
            exit: this.mazeData.exitPosition,
            isTrap: (x, y) => this.collision.isTrap(x, y, this.mazeData.traps),
            isHazard: (x, y) => this.collision.isTrap(x, y, this.mazeData.traps) || this.isDynamicHazard(x, y),
            onStep: (x, y) => this.processItemsAtPosition(x, y),
            onHazard: () => this.handleDeath(),
            onExit: () => this.handleLevelComplete()
        });

        // Initialize enemies (level 5+), away from Lucy's first moves
        const excludePositions = [
            ...this.getSafeSpawnZone(),
            this.mazeData.exitPosition,
            ...this.mazeData.obstacles,
            ...this.mazeData.traps
        ];
        this.enemyManager.init(this.gameState.level, excludePositions);

        // Initialize spiders
        this.spiderManager.generate(
            this.gameState.level,
            this.mazeData.obstacles,
            this.mazeData.exitPosition,
            this.playerStartPosition
        );
    }

    private drawEntities(): void {
        this.gridRenderer.drawEntities({
            coins: this.mazeData.coins,
            obstacles: this.mazeData.obstacles,
            traps: this.mazeData.traps,
            saves: this.saves,
            shields: this.shields,
            exitPosition: this.mazeData.exitPosition
        });
    }

    /** Celdas a distancia Manhattan del inicio que quedan libres de enemigos al generar. */
    private getSafeSpawnZone(): Position[] {
        const radius = CONFIG.ENEMIES.SAFE_SPAWN_RADIUS;
        const { x: startX, y: startY } = this.playerStartPosition;
        const cells: Position[] = [];
        for (let y = startY - radius; y <= startY + radius; y++) {
            for (let x = startX - radius; x <= startX + radius; x++) {
                if (Math.abs(x - startX) + Math.abs(y - startY) <= radius) cells.push({ x, y });
            }
        }
        return cells;
    }

    private isDynamicHazard(x: number, y: number): boolean {
        return this.enemyManager.checkCollision(x, y) || this.spiderManager.checkCollision(x, y);
    }

    /**
     * Aplica una dirección recién pedida. Si Lucy ya se desliza, la dirección
     * queda en la cola de InputManager y el jugador la toma en la primera
     * celda libre.
     */
    private handleDirectionInput(direction: Direction): void {
        if (this.gameState.isGameOver || this.leaving) {
            this.inputManager.clearQueuedDirection();
            return;
        }
        if (this.playerController.getIsMoving()) return;

        this.playerController.move(direction);
        this.inputManager.clearQueuedDirection();
    }

    /**
     * Procesa items en la posición del jugador
     */
    private processItemsAtPosition(x: number, y: number): void {
        // Check coins
        for (let i = this.mazeData.coins.length - 1; i >= 0; i--) {
            if (this.mazeData.coins[i].x === x && this.mazeData.coins[i].y === y) {
                this.playerController.emitCoinParticles(x, y);
                playSfx(this, 'coin');
                this.mazeData.coins.splice(i, 1);
                this.gameState.addScore(10);
                this.gridRenderer.removeCoin(x, y);

                // Check power-up spawn triggers based on coins collected
                if (this.gameState.initialCoinCount > 0) {
                    const collected = this.gameState.initialCoinCount - this.mazeData.coins.length;
                    const ratio = collected / this.gameState.initialCoinCount;

                    // Power-up spawns at configured ratio (only ONE per level)
                    if (ratio >= CONFIG.POWERUPS.SPAWN_COIN_RATIO && !this.powerUpSpawned) {
                        this.powerUpSpawned = true;
                        // Shield has higher probability than continue
                        this.spawnPowerUp(Math.random() < CONFIG.POWERUPS.SHIELD_PROBABILITY ? 'shield' : 'continue');
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
                playSfx(this, 'shield');
                this.shields.splice(0, 1);
                this.gridRenderer.removeShield();
            }
        }

        // Check continue collection
        if (this.saves.length > 0) {
            const save = this.saves[0];
            if (save.x === x && save.y === y) {
                this.gameState.addContinue();
                playSfx(this, 'continue');
                this.saves.splice(0, 1);
                this.gridRenderer.removeSave();
            }
        }

        this.syncHud();

        // Animate nearby trees
        this.gridRenderer.animateNearbyTrees(x, y);
    }

    /**
     * Coloca un power-up (escudo o continue) en una celda libre
     */
    private spawnPowerUp(kind: PowerUpKind): void {
        const excludePositions = [
            this.playerController.getPosition(),
            this.mazeData.exitPosition,
            ...this.mazeData.obstacles,
            ...this.mazeData.traps,
            ...this.enemyManager.getEnemies().map(e => ({ x: Math.round(e.x), y: Math.round(e.y) })),
            ...this.saves,
            ...this.shields
        ];

        const position = this.mazeGenerator.generateSaveItem(excludePositions);
        if (!position) return;

        (kind === 'shield' ? this.shields : this.saves).push(position);
        playSfx(this, 'spawn');
        this.drawEntities();
    }

    /**
     * Maneja la muerte del jugador
     * Primero intenta usar shield (flash sin detener), luego game over
     * Verifica invincibilidad para evitar consumo múltiple de shields
     */
    private handleDeath(): void {
        // Multiple collision sources can report the same fatal hit in one frame.
        // Once game over is active, ignore duplicate notifications so only one
        // death sprite is created and tracked for the next reset.
        if (this.gameState.isGameOver) return;

        // Skip if currently invincible (shield was just used)
        if (this.invincibilityMs > 0) return;

        // Try to use shield first
        if (this.gameState.useShield()) {
            // Shield absorbed the hit - flash player and continue movement
            this.playerController.flashInvincibility();
            playSfx(this, 'shieldHit');
            this.syncHud();
            // Set invincibility window to prevent multiple shield consumption
            this.invincibilityMs = CONFIG.POWERUPS.SHIELD_INVINCIBILITY_MS;
            return;
        }

        // No shield - game over
        const isNewRecord = this.gameState.registerGameOver();
        this.playerController.stopMovement();
        this.playerController.showDeathSprite();
        playSfx(this, 'death');
        this.inputManager.clearQueuedDirection();

        const payload: GameOverPayload = {
            score: this.gameState.score,
            continues: this.gameState.continueCount,
            isNewRecord
        };
        this.events.emit(GameEvents.GAME_OVER, payload);
    }

    /**
     * Maneja la completación del nivel
     */
    private handleLevelComplete(): void {
        this.gameState.nextLevel();
        playSfx(this, 'levelUp');
        this.buildLevel();
        this.syncHud();
    }

    /**
     * Continue: consume un power-up y reanuda en un laberinto nuevo del mismo nivel
     */
    private handleContinue(): void {
        if (!this.gameState.useContinue()) return;
        this.buildLevel();
        this.syncHud();
        this.events.emit(GameEvents.GAME_ACTIVE);
    }

    /**
     * Restart: siempre empieza una partida nueva
     */
    private handleRestart(): void {
        if (this.leaving) return;
        this.gameState.reset();
        this.buildLevel();
        this.syncHud();
        this.events.emit(GameEvents.GAME_ACTIVE);
    }

    /**
     * Publica en el registry los valores que muestra el HUD
     */
    private syncHud(): void {
        this.registry.set(RegistryKeys.SCORE, this.gameState.score);
        this.registry.set(RegistryKeys.LEVEL, this.gameState.level);
        this.registry.set(RegistryKeys.SHIELDS, this.gameState.shieldCount);
        this.registry.set(RegistryKeys.CONTINUES, this.gameState.continueCount);
    }

    /** Coloca el tablero dentro del canvas expandido sin tocar las coordenadas de grilla. */
    private applyLayout(): void {
        const layout = computeLayout(this.scale.width, this.scale.height);
        this.cameras.main.setScroll(-layout.boardX, -layout.boardY);
    }

    /**
     * Retorna al menú principal
     */
    private returnToMenu(): void {
        if (this.leaving) return;
        this.leaving = true;
        musicManager.stop();
        this.cameras.main.fadeOut(300, 0, 0, 0);
        this.time.delayedCall(300, () => {
            this.scene.start(SceneKeys.MENU);
        });
    }

    /**
     * Cleanup al detener la escena (se engancha al evento SHUTDOWN en create)
     */
    private handleShutdown(): void {
        this.scale.off(Phaser.Scale.Events.RESIZE, this.applyLayout, this);
        this.events.off(GameEvents.INPUT_DIRECTION, this.handleDirectionInput, this);
        this.events.off(GameEvents.UI_RESTART, this.handleRestart, this);
        this.events.off(GameEvents.UI_CONTINUE, this.handleContinue, this);
        this.events.off(GameEvents.UI_MENU, this.returnToMenu, this);

        this.inputManager.destroy();
        this.playerController.destroy();
        this.enemyManager.destroy();
        this.spiderManager.destroy();
        this.gridRenderer.destroy();

        this.scene.stop(SceneKeys.UI);
        musicManager.stop();
    }
}
