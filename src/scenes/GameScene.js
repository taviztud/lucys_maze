import { CONFIG } from '../Config.js';
import { calculateSpriteScale, generateFreePosition, isValidPosition } from '../utils/Utils.js';

export class GameScene extends Phaser.Scene {
    constructor() {
        super('GameScene');

        // State variables
        this.boardSize = CONFIG.BOARD_SIZE;
        this.cellSize = CONFIG.CELL_SIZE;
        this.playerPosition = { x: 0, y: 0 };
        this.exitPosition = { x: CONFIG.BOARD_SIZE - 1, y: CONFIG.BOARD_SIZE - 1 };
        this.coins = [];
        this.obstacles = [];
        this.traps = [];
        this.saves = [];
        this.enemies = [];
        this.score = 0;
        this.level = 1;
        this.gameOver = false;
        this.moving = false;
        this.moveDirection = { dx: 0, dy: 0 };
        this.desiredDirection = { dx: 0, dy: 0 };
        this.playerMoveTween = null;
        this.exitBlinkState = true;
        this.requireFreshPressAfterReset = false;
        this.initialCoinCount = 0;

        // Audio state
        this.availableMusicKeys = [];
        this.backgroundMusic = null;
        this.musicPlaylistOrder = [];
        this.currentPlaylistIndex = 0;

        // Optimization
        this.collisionMap = null;
        this.spriteCache = {
            coins: [],
            obstacles: [],
            traps: []
        };
        this.eventListenerCleanup = [];

        // Juice
        this.coinParticles = null;
        this.trailParticles = null;
    }

    preload() {
        try {
            // Error handling
            this.load.on('loaderror', (file) => {
                console.warn('Asset not found:', file.key, file.src);
                if (file.key.startsWith('backgroundMusic')) {
                    const keyIndex = this.availableMusicKeys.indexOf(file.key);
                    if (keyIndex > -1) {
                        this.availableMusicKeys.splice(keyIndex, 1);
                    }
                }
            });

            this.load.on('filecomplete', (key) => {
                if (key.startsWith('backgroundMusic')) {
                    if (!this.availableMusicKeys.includes(key)) {
                        this.availableMusicKeys.push(key);
                    }
                }
            });

            // Load images
            this.load.image('player_stand', 'lucy_stand.png');
            this.load.image('player_run', 'lucy_run.png');
            this.load.image('player_die', 'lucy_die.png');
            this.load.image('coin', 'tuto.png');
            this.load.image('obstacle_brick', 'brick_1.png');
            this.load.image('obstacle_rock', 'rock_1.png');
            this.load.image('obstacle_tree', 'tree_1.png');
            this.load.image('trap', 'sping.png');
            this.load.image('exit', 'exit.png');
            this.load.image('enemy', 'enemy.png');
            this.load.image('save', 'save.png');

            // Detect and load music
            this.detectAndLoadMusic();

        } catch (error) {
            console.error('Critical error in preload:', error);
        }
    }

    detectAndLoadMusic() {
        this.availableMusicKeys = [];
        const maxTracks = CONFIG.AUDIO.MAX_BG_TRACKS;
        for (let i = 1; i <= maxTracks; i++) {
            const paddedNumber = i.toString().padStart(3, '0');
            const filename = `bg_${paddedNumber}.mp3`;
            const key = `backgroundMusic${i - 1}`;

            try {
                this.load.audio(key, `sound/bg/${filename}`);
            } catch (error) {
                console.warn('Could not queue music file:', filename, error);
            }
        }
    }

    create() {
        // Music handling
        const tryStartMusic = () => {
            if (this.availableMusicKeys.length > 0) {
                this.shuffleMusicPlaylist();
                this.playRandomMusic();
            } else {
                this.time.delayedCall(500, () => {
                    if (this.availableMusicKeys.length > 0) {
                        this.shuffleMusicPlaylist();
                        this.playRandomMusic();
                    }
                });
            }
        };

        if (this.sound.locked) {
            this.input.once('pointerdown', () => this.sound.unlock());
            if (this.input.keyboard) this.input.keyboard.once('keydown', () => this.sound.unlock());
            this.sound.once('unlocked', tryStartMusic);
        } else {
            this.time.delayedCall(200, tryStartMusic);
        }

        // Create grid
        this.createGrid();

        // Game Over Text
        this.gameOverText = this.add.text(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2, 'GAME OVER', {
            fontSize: CONFIG.UI.GAME_OVER_FONT_SIZE,
            fontFamily: CONFIG.UI.FONT_FAMILY,
            fill: '#ff0000',
            stroke: '#ffffff',
            strokeThickness: 4
        });
        this.gameOverText.setOrigin(0.5);
        this.gameOverText.setVisible(false);

        // Restart Text
        this.restartText = this.add.text(CONFIG.GAME_WIDTH / 2, CONFIG.GAME_HEIGHT / 2 + CONFIG.UI.RESTART_OFFSET_Y, 'PRESS R TO RESTART', {
            fontSize: CONFIG.UI.RESTART_FONT_SIZE,
            fontFamily: CONFIG.UI.FONT_FAMILY,
            fill: '#ffff00',
            align: 'center'
        });
        this.restartText.setOrigin(0.5);
        this.restartText.setVisible(false);

        // Initialize maze
        this.generateRandomExit();
        this.generateMaze();
        this.initialCoinCount = this.coins.length;
        this.buildCollisionMap();

        // Draw game
        this.drawGame();

        // Controls
        this.cursors = this.input.keyboard.createCursorKeys();
        this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

        // Exit blink
        this.time.addEvent({
            delay: CONFIG.UI.EXIT_BLINK_INTERVAL,
            callback: this.toggleExitBlink,
            callbackScope: this,
            loop: true
        });

        // UI Event Listeners
        this.setupUIEventListeners();

        // Keyboard Input
        this.input.keyboard.on('keydown', (event) => {
            switch (event.code) {
                case 'ArrowLeft':
                    this.desiredDirection = { dx: -1, dy: 0 };
                    break;
                case 'ArrowRight':
                    this.desiredDirection = { dx: 1, dy: 0 };
                    break;
                case 'ArrowUp':
                    this.desiredDirection = { dx: 0, dy: -1 };
                    break;
                case 'ArrowDown':
                    this.desiredDirection = { dx: 0, dy: 1 };
                    break;
                default:
                    break;
            }

            if (!this.moving && (this.desiredDirection.dx !== 0 || this.desiredDirection.dy !== 0) && !this.gameOver) {
                this.movePlayer(this.desiredDirection.dx, this.desiredDirection.dy);
                this.requireFreshPressAfterReset = false;
            }
        });

        this.updateScoreAndLevelTexts();

        if (this.level >= 5) {
            this.initEnemies();
        }

        // Juice
        this.coinParticles = this.add.particles(0, 0, 'coin', {
            speed: { min: 50, max: 150 },
            scale: { start: 0.4, end: 0 },
            lifespan: 600,
            blendMode: 'ADD',
            quantity: 10,
            emitting: false
        });

        this.trailParticles = this.add.particles(0, 0, 'player_run', {
            speed: 0,
            scale: { start: calculateSpriteScale('player_run', this.cellSize, this) * 0.8, end: 0 },
            alpha: { start: 0.4, end: 0 },
            lifespan: 500, // Slower fade
            blendMode: 'ADD',
            frequency: 40, // More frequent for smoother trail
            emitting: false
        });
    }

    update(time, delta) {
        if (this.gameOver) {
            if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
                this.score = 0;
                this.level = 1;
                this.updateScoreAndLevelTexts();
                this.resetGame(true);
            }
            return;
        }

        // Enemy updates
        if (time > this.lastEnemyUpdateTime + CONFIG.PERFORMANCE.ENEMY_UPDATE_THROTTLE_MS) {
            this.updateEnemies();
            this.lastEnemyUpdateTime = time;
        }
    }

    createGrid() {
        // Background color
        this.cameras.main.setBackgroundColor(CONFIG.UI.MAIN_BACKGROUND_COLOR);

        // Neon color based on level
        const neonColor = CONFIG.BACKGROUND_COLORS[(this.level - 1) % CONFIG.BACKGROUND_COLORS.length];

        // Create grid group
        if (this.gridGroup) {
            this.gridGroup.clear(true, true);
        } else {
            this.gridGroup = this.add.group();
        }

        // Draw grid
        const graphics = this.add.graphics();
        graphics.lineStyle(1, neonColor, CONFIG.GRID_ALPHA);

        for (let i = 0; i <= this.boardSize; i++) {
            // Vertical lines
            graphics.moveTo(i * this.cellSize, 0);
            graphics.lineTo(i * this.cellSize, this.boardSize * this.cellSize);

            // Horizontal lines
            graphics.moveTo(0, i * this.cellSize);
            graphics.lineTo(this.boardSize * this.cellSize, i * this.cellSize);
        }

        graphics.strokePath();
        this.gridGroup.add(graphics);

        // Add dots at intersections
        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                const dot = this.add.rectangle(
                    x * this.cellSize + this.cellSize / 2,
                    y * this.cellSize + this.cellSize / 2,
                    2,
                    2,
                    neonColor
                );
                dot.setAlpha(0.6);
                this.gridGroup.add(dot);
            }
        }
    }

    generateRandomExit() {
        const side = Math.floor(Math.random() * 2);
        if (side === 0) {
            this.exitPosition = { x: this.boardSize - 1, y: Math.floor(Math.random() * this.boardSize) };
        } else {
            this.exitPosition = { x: Math.floor(Math.random() * this.boardSize), y: this.boardSize - 1 };
        }
    }

    generateMaze() {
        try {
            if (!this.boardSize || this.boardSize < 3) {
                console.error('generateMaze: Invalid boardSize:', this.boardSize);
                return;
            }

            let attempts = 0;
            const maxAttempts = CONFIG.MAZE_GENERATION.MAX_ATTEMPTS;

            do {
                attempts++;
                this.coins.length = 0;
                this.obstacles.length = 0;
                this.traps.length = 0;
                this.saves.length = 0;

                for (let y = 0; y < this.boardSize; y++) {
                    for (let x = 0; x < this.boardSize; x++) {
                        if ((x !== 0 || y !== 0) && (x !== this.exitPosition.x || y !== this.exitPosition.y)) {
                            if (Math.random() < CONFIG.MAZE_GENERATION.OBSTACLE_PROBABILITY && this.hasEnoughSpace(x, y)) {
                                const obstacleTypes = ['brick', 'rock', 'tree'];
                                const randomType = obstacleTypes[Phaser.Math.Between(0, obstacleTypes.length - 1)];
                                this.obstacles.push({ x, y, type: randomType });
                            } else if (Math.random() < CONFIG.MAZE_GENERATION.COIN_PROBABILITY) {
                                this.coins.push({ x, y });
                            } else if (Math.random() < CONFIG.MAZE_GENERATION.TRAP_PROBABILITY && this.hasEnoughSpace(x, y)) {
                                this.traps.push({ x, y });
                            }
                        }
                    }
                }
            } while (!this.isSolvable() && attempts < maxAttempts);

            if (attempts >= maxAttempts) {
                console.warn('generateMaze: Max attempts reached, generating simple maze');
                this.coins.length = 0;
                this.obstacles.length = 0;
                this.traps.length = 0;
                this.saves.length = 0;
                this.coins.push({ x: 2, y: 2 }, { x: 5, y: 5 }, { x: 7, y: 3 });
                this.obstacles.push({ x: 3, y: 4, type: 'brick' }, { x: 6, y: 7, type: 'rock' });
            }
        } catch (error) {
            console.error('Error in generateMaze:', error);
            this.coins.length = 0;
            this.obstacles.length = 0;
            this.traps.length = 0;
            this.saves.length = 0;
            this.coins.push({ x: 1, y: 1 });
        }
    }

    isSolvable() {
        const queue = [{ x: this.playerPosition.x, y: this.playerPosition.y }];
        const visited = Array.from({ length: this.boardSize }, () => Array(this.boardSize).fill(false));
        visited[this.playerPosition.y][this.playerPosition.x] = true;

        const directions = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 }
        ];

        while (queue.length > 0) {
            const { x, y } = queue.shift();

            if (x === this.exitPosition.x && y === this.exitPosition.y) {
                return true;
            }

            for (let dir of directions) {
                const nx = x + dir.x;
                const ny = y + dir.y;

                if (
                    nx >= 0 && nx < this.boardSize &&
                    ny >= 0 && ny < this.boardSize &&
                    !visited[ny][nx] &&
                    !this.obstacles.some(obstacle => obstacle.x === nx && obstacle.y === ny) &&
                    !this.traps.some(trap => trap.x === nx && trap.y === ny)
                ) {
                    visited[ny][nx] = true;
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        return false;
    }

    hasEnoughSpace(x, y) {
        const directions = [
            { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
            { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }
        ];

        let freeSpaces = 0;
        for (let dir of directions) {
            const nx = x + dir.x;
            const ny = y + dir.y;
            if (
                nx >= 0 && nx < this.boardSize &&
                ny >= 0 && ny < this.boardSize &&
                !this.obstacles.some(obs => obs.x === nx && obs.y === ny) &&
                !this.traps.some(trap => trap.x === nx && trap.y === ny)
            ) {
                freeSpaces++;
            }
        }

        return freeSpaces >= CONFIG.MAZE_GENERATION.MIN_FREE_SPACES;
    }

    buildCollisionMap() {
        if (!this.boardSize || this.boardSize < 1) {
            console.error('buildCollisionMap: Invalid boardSize:', this.boardSize);
            return;
        }

        try {
            this.collisionMap = Array.from({ length: this.boardSize }, () => Array(this.boardSize).fill(false));
            this.obstacles.forEach(obstacle => {
                if (obstacle.x >= 0 && obstacle.x < this.boardSize && obstacle.y >= 0 && obstacle.y < this.boardSize) {
                    this.collisionMap[obstacle.y][obstacle.x] = true;
                }
            });
        } catch (error) {
            console.error('Error building collision map:', error);
            this.collisionMap = Array.from({ length: this.boardSize || 10 }, () => Array(this.boardSize || 10).fill(false));
        }
    }

    drawGame() {
        // Clear existing sprites
        this.clearSpriteCache();
        this.coinSprites = this.coinSprites || [];
        this.obstacleSprites = this.obstacleSprites || [];
        this.trapSprites = this.trapSprites || [];

        // Draw Player
        if (!this.playerSprite) {
            this.playerSprite = this.add.sprite(
                this.playerPosition.x * this.cellSize + this.cellSize / 2,
                this.playerPosition.y * this.cellSize + this.cellSize / 2,
                'player_stand'
            );
        } else {
            this.playerSprite.setPosition(
                this.playerPosition.x * this.cellSize + this.cellSize / 2,
                this.playerPosition.y * this.cellSize + this.cellSize / 2
            );
            this.playerSprite.setVisible(true);
            this.playerSprite.setDepth(10); // Ensure player is on top
        }
        this.adjustPlayerScaleAndRotation();

        // Draw Exit
        if (!this.exitSprite) {
            this.exitSprite = this.add.sprite(
                this.exitPosition.x * this.cellSize + this.cellSize / 2,
                this.exitPosition.y * this.cellSize + this.cellSize / 2,
                'exit'
            );
        } else {
            this.exitSprite.setPosition(
                this.exitPosition.x * this.cellSize + this.cellSize / 2,
                this.exitPosition.y * this.cellSize + this.cellSize / 2
            );
            this.exitSprite.setVisible(true);
        }
        const exitScale = calculateSpriteScale('exit', this.cellSize, this);
        this.exitSprite.setScale(exitScale);

        // Draw Coins
        this.coinSprites = [];
        this.coins.forEach((coin, index) => {
            let coinSprite;
            if (this.spriteCache.coins[index] && !this.spriteCache.coins[index].destroyed) {
                coinSprite = this.spriteCache.coins[index];
                coinSprite.setPosition(
                    coin.x * this.cellSize + this.cellSize / 2,
                    coin.y * this.cellSize + this.cellSize / 2
                );
                coinSprite.setVisible(true);
            } else {
                coinSprite = this.add.sprite(
                    coin.x * this.cellSize + this.cellSize / 2,
                    coin.y * this.cellSize + this.cellSize / 2,
                    'coin'
                );
                const coinScale = calculateSpriteScale('coin', this.cellSize, this);
                coinSprite.setScale(coinScale);
                this.spriteCache.coins[index] = coinSprite;
            }
            // Store grid position for easy removal
            coinSprite.gridX = coin.x;
            coinSprite.gridY = coin.y;
            this.coinSprites.push(coinSprite);
        });

        // Draw Obstacles
        this.obstacleSprites = [];
        this.obstacles.forEach((obstacle, index) => {
            let obstacleSprite;
            if (this.spriteCache.obstacles[index] && !this.spriteCache.obstacles[index].destroyed) {
                obstacleSprite = this.spriteCache.obstacles[index];
                obstacleSprite.setPosition(
                    obstacle.x * this.cellSize + this.cellSize / 2,
                    obstacle.y * this.cellSize + this.cellSize / 2
                );
                obstacleSprite.setTexture(`obstacle_${obstacle.type}`);
                obstacleSprite.setVisible(true);
            } else {
                obstacleSprite = this.add.sprite(
                    obstacle.x * this.cellSize + this.cellSize / 2,
                    obstacle.y * this.cellSize + this.cellSize / 2,
                    `obstacle_${obstacle.type}`
                );
                const obstacleScale = calculateSpriteScale(`obstacle_${obstacle.type}`, this.cellSize, this);
                obstacleSprite.setScale(obstacleScale);
                this.spriteCache.obstacles[index] = obstacleSprite;
            }
            this.obstacleSprites.push(obstacleSprite);
        });

        // Draw Traps
        this.trapSprites = [];
        this.traps.forEach((trap, index) => {
            let trapSprite;
            if (this.spriteCache.traps[index] && !this.spriteCache.traps[index].destroyed) {
                trapSprite = this.spriteCache.traps[index];
                trapSprite.setPosition(
                    trap.x * this.cellSize + this.cellSize / 2,
                    trap.y * this.cellSize + this.cellSize / 2
                );
                trapSprite.setVisible(true);
            } else {
                trapSprite = this.add.sprite(
                    trap.x * this.cellSize + this.cellSize / 2,
                    trap.y * this.cellSize + this.cellSize / 2,
                    'trap'
                );
                const trapScale = calculateSpriteScale('trap', this.cellSize, this);
                trapSprite.setScale(trapScale);
                this.spriteCache.traps[index] = trapSprite;
            }
            this.trapSprites.push(trapSprite);
        });

        // Draw Save
        if (this.saves.length > 0) {
            const save = this.saves[0];
            if (!this.saveSprite) {
                this.saveSprite = this.add.sprite(
                    save.x * this.cellSize + this.cellSize / 2,
                    save.y * this.cellSize + this.cellSize / 2,
                    'save'
                );
            } else {
                this.saveSprite.setPosition(
                    save.x * this.cellSize + this.cellSize / 2,
                    save.y * this.cellSize + this.cellSize / 2
                );
                this.saveSprite.setVisible(true);
            }
            const saveScale = calculateSpriteScale('save', this.cellSize, this);
            this.saveSprite.setScale(saveScale);
            this.saveSprite.setAlpha(1);

            // Pulse tween
            if (this.savePulseTween) {
                this.savePulseTween.stop();
            }
            this.savePulseTween = this.tweens.add({
                targets: this.saveSprite,
                scaleX: { from: saveScale * 0.95, to: saveScale * 1.08 },
                scaleY: { from: saveScale * 0.95, to: saveScale * 1.08 },
                alpha: { from: 0.9, to: 1.0 },
                ease: 'Sine.InOut',
                duration: 600,
                yoyo: true,
                repeat: -1
            });
        } else if (this.saveSprite) {
            this.saveSprite.setVisible(false);
        }

        // Hide unused sprites
        this.hideUnusedSprites(this.coinSprites, 'coins');
        this.hideUnusedSprites(this.obstacleSprites, 'obstacles');
        this.hideUnusedSprites(this.trapSprites, 'traps');

        // Update enemy sprites
        if (this.level >= 5) {
            this.enemies.forEach(enemy => {
                if (enemy.sprite) {
                    if (enemy.direction.dx === -1) {
                        enemy.sprite.setFlipX(true);
                    } else if (enemy.direction.dx === 1) {
                        enemy.sprite.setFlipX(false);
                    }
                }
            });
        }
    }

    movePlayer(dx, dy) {
        if (this.gameOver || this.moving) return;
        if (dx === 0 && dy === 0) return;

        this.moveDirection = { dx, dy };
        const moveResult = this.calculateMoveUntilObstacle(this.playerPosition.x, this.playerPosition.y, dx, dy);

        if (moveResult.distance === 0) {
            this.moveDirection = { dx: 0, dy: 0 };
            if (this.playerSprite) {
                this.playerSprite.setTexture('player_stand');
                this.adjustPlayerScaleAndRotation();
            }
            return;
        }

        this.moving = true;
        this.playerSprite.setTexture('player_run');
        this.adjustPlayerScaleAndRotation();

        const baseStepDuration = Math.max(
            CONFIG.PERFORMANCE.PLAYER_MIN_STEP_DURATION_MS,
            CONFIG.PERFORMANCE.PLAYER_BASE_DURATION_MS - this.level * CONFIG.PERFORMANCE.PLAYER_STEP_DEC_PER_LEVEL
        );
        const actualDuration = baseStepDuration * moveResult.distance;

        // Trail effect
        if (this.trailParticles) {
            this.trailParticles.start();
            this.trailParticles.follow = this.playerSprite;
        }

        let lastStepProcessed = -1;
        const startX = this.playerPosition.x;
        const startY = this.playerPosition.y;
        const finalDestination = { x: moveResult.x, y: moveResult.y, step: moveResult.distance };

        // Check for stops along the way (traps, enemies, exit)
        for (let i = 1; i <= moveResult.distance; i++) {
            const checkX = startX + (dx * i);
            const checkY = startY + (dy * i);

            if (this.isTrapOptimized(checkX, checkY)) {
                finalDestination.x = checkX;
                finalDestination.y = checkY;
                finalDestination.step = i;
                break;
            }
            if (this.enemies.some(e => Math.round(e.x) === checkX && Math.round(e.y) === checkY)) {
                finalDestination.x = checkX;
                finalDestination.y = checkY;
                finalDestination.step = i;
                break;
            }
            if (checkX === this.exitPosition.x && checkY === this.exitPosition.y) {
                finalDestination.x = checkX;
                finalDestination.y = checkY;
                finalDestination.step = i;
                break;
            }
        }

        this.playerMoveTween = this.tweens.add({
            targets: this.playerSprite,
            x: finalDestination.x * this.cellSize + this.cellSize / 2,
            y: finalDestination.y * this.cellSize + this.cellSize / 2,
            duration: baseStepDuration * finalDestination.step,
            ease: 'Linear',
            onUpdate: (tween) => {
                const progress = tween.progress;
                const currentStep = Math.floor(progress * finalDestination.step);
                const stepStart = Math.max(0, lastStepProcessed + 1);

                for (let step = stepStart; step <= currentStep; step++) {
                    const newLogicalX = startX + (dx * step);
                    const newLogicalY = startY + (dy * step);

                    if (newLogicalX !== this.playerPosition.x || newLogicalY !== this.playerPosition.y) {
                        this.playerPosition.x = newLogicalX;
                        this.playerPosition.y = newLogicalY;

                        this.processItemsAtPosition(this.playerPosition.x, this.playerPosition.y);

                        if (this.isTrapOptimized(this.playerPosition.x, this.playerPosition.y)) {
                            this.handleDeath();
                            return;
                        }

                        if (this.enemies.some(e => Math.round(e.x) === this.playerPosition.x && Math.round(e.y) === this.playerPosition.y)) {
                            this.handleDeath();
                            return;
                        }

                        if (this.playerPosition.x === this.exitPosition.x && this.playerPosition.y === this.exitPosition.y) {
                            this.handleLevelComplete();
                            return;
                        }

                        // Turn logic
                        if ((this.desiredDirection.dx !== 0 || this.desiredDirection.dy !== 0) &&
                            (this.desiredDirection.dx !== this.moveDirection.dx || this.desiredDirection.dy !== this.moveDirection.dy)) {
                            const turnNextX = this.playerPosition.x + this.desiredDirection.dx;
                            const turnNextY = this.playerPosition.y + this.desiredDirection.dy;
                            if (!this.isCollisionOptimized(turnNextX, turnNextY)) {
                                this.playerSprite.setPosition(
                                    this.playerPosition.x * this.cellSize + this.cellSize / 2,
                                    this.playerPosition.y * this.cellSize + this.cellSize / 2
                                );
                                tween.stop();
                                this.moving = false;
                                this.movePlayer(this.desiredDirection.dx, this.desiredDirection.dy);
                                return;
                            }
                        }
                    }
                }
                lastStepProcessed = currentStep;
            },
            onComplete: () => {
                if (this.trailParticles) this.trailParticles.stop();

                this.playerPosition.x = finalDestination.x;
                this.playerPosition.y = finalDestination.y;

                if (finalDestination.step > 0 && !this.gameOver) {
                    this.cameras.main.shake(100, 0.005);
                }

                this.processItemsAtPosition(this.playerPosition.x, this.playerPosition.y);

                if (this.isTrapOptimized(this.playerPosition.x, this.playerPosition.y)) {
                    this.handleDeath();
                    return;
                }
                if (this.playerPosition.x === this.exitPosition.x && this.playerPosition.y === this.exitPosition.y) {
                    this.handleLevelComplete();
                    return;
                }

                this.moving = false;
                this.playerMoveTween = null;
                this.moveDirection = { dx: 0, dy: 0 };
                this.playerSprite.setTexture('player_stand');
                this.adjustPlayerScaleAndRotation();
            },
            callbackScope: this
        });
    }

    clearSpriteCache() {
        Object.keys(this.spriteCache).forEach(key => {
            this.spriteCache[key].forEach(sprite => {
                if (sprite && sprite.destroy) {
                    sprite.destroy();
                }
            });
            this.spriteCache[key] = [];
        });
    }

    hideUnusedSprites(usedSprites, cacheKey) {
        const cache = this.spriteCache[cacheKey];
        for (let i = usedSprites.length; i < cache.length; i++) {
            if (cache[i]) {
                cache[i].setVisible(false);
            }
        }
    }

    adjustPlayerScaleAndRotation() {
        if (!this.playerSprite) return;

        const playerScale = calculateSpriteScale(this.playerSprite.texture.key, this.cellSize, this);
        this.playerSprite.setScale(playerScale);

        if (this.moveDirection.dx === 1) {
            this.playerSprite.setAngle(0);
            this.playerSprite.setFlipX(false);
        } else if (this.moveDirection.dx === -1) {
            this.playerSprite.setAngle(0);
            this.playerSprite.setFlipX(true);
        } else if (this.moveDirection.dy === -1) {
            this.playerSprite.setAngle(-90);
            this.playerSprite.setFlipX(false);
        } else if (this.moveDirection.dy === 1) {
            this.playerSprite.setAngle(90);
            this.playerSprite.setFlipX(false);
        }
    }

    calculateMoveUntilObstacle(startX, startY, dx, dy) {
        let currentX = startX;
        let currentY = startY;
        let distance = 0;

        while (true) {
            let nextX = currentX + dx;
            let nextY = currentY + dy;

            if (this.isCollisionOptimized(nextX, nextY)) {
                break;
            }

            currentX = nextX;
            currentY = nextY;
            distance++;
        }

        return { x: currentX, y: currentY, distance };
    }

    processItemsAtPosition(x, y) {
        // Coins
        for (let i = this.coins.length - 1; i >= 0; i--) {
            if (this.coins[i].x === x && this.coins[i].y === y) {
                // Particles
                if (this.coinParticles) {
                    this.coinParticles.emitParticleAt(
                        x * this.cellSize + this.cellSize / 2,
                        y * this.cellSize + this.cellSize / 2
                    );
                }

                this.coins.splice(i, 1);
                this.score += 10;
                this.updateScoreAndLevelTexts();

                // Remove sprite
                for (let j = this.coinSprites.length - 1; j >= 0; j--) {
                    if (this.coinSprites[j].gridX === x && this.coinSprites[j].gridY === y) {
                        this.coinSprites[j].destroy();
                        this.coinSprites.splice(j, 1);
                        break;
                    }
                }

                // Generate save item
                if (this.initialCoinCount > 0) {
                    const collected = this.initialCoinCount - this.coins.length;
                    const ratio = collected / this.initialCoinCount;
                    if (ratio > 0.7 && this.saves.length === 0) {
                        this.generateSaveItem();
                        this.drawGame();
                    }
                }
                break;
            }
        }

        // Saves
        if (this.saves.length > 0) {
            const save = this.saves[0];
            if (save.x === x && save.y === y) {
                this.canUseSave = true;
                this.saves.splice(0, 1);
                if (this.saveSprite) {
                    if (this.savePulseTween) {
                        this.savePulseTween.stop();
                        this.savePulseTween = null;
                    }
                    this.saveSprite.destroy();
                    this.saveSprite = null;
                }
            }
        }
    }

    isCollisionOptimized(x, y) {
        if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) {
            return true;
        }
        return this.collisionMap && this.collisionMap[y] && this.collisionMap[y][x];
    }

    isTrapOptimized(x, y) {
        if (x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize) {
            return false;
        }
        return this.traps.some(trap => trap.x === x && trap.y === y);
    }

    handleDeath() {
        this.gameOver = true;
        this.moveDirection = { dx: 0, dy: 0 };
        if (this.playerMoveTween) {
            this.playerMoveTween.stop();
            this.playerMoveTween = null;
        }
        this.moving = false;
        this.drawGame();
        this.showGameOver();

        // Death sprite
        if (this.playerSprite) {
            this.playerSprite.destroy();
            this.playerSprite = null;
        }
        this.playerDieSprite = this.add.sprite(
            this.playerPosition.x * this.cellSize + this.cellSize / 2,
            this.playerPosition.y * this.cellSize + this.cellSize / 2,
            'player_die'
        );
        const playerDieScale = calculateSpriteScale('player_die', this.cellSize, this);
        this.playerDieSprite.setScale(playerDieScale);
    }

    handleLevelComplete() {
        this.score += 100;
        this.level += 1;
        this.updateScoreAndLevelTexts();
        if (this.playerMoveTween) {
            this.playerMoveTween.stop();
            this.playerMoveTween = null;
        }
        this.moving = false;
        this.requireFreshPressAfterReset = true;
        this.desiredDirection = { dx: 0, dy: 0 };
        this.resetGame(false);
    }

    showGameOver() {
        this.gameOverText.setVisible(true);
        this.restartText.setVisible(true);
        if (this.playerMoveTween) {
            this.playerMoveTween.stop();
            this.playerMoveTween = null;
        }
        this.moving = false;
    }

    resetGame(resetLevel) {
        if (resetLevel) {
            this.level = 1;
            this.score = 0;
        }
        this.playerPosition = { x: 0, y: 0 };
        this.generateRandomExit();
        this.gameOver = false;
        this.moveDirection = { dx: 0, dy: 0 };
        this.desiredDirection = { dx: 0, dy: 0 };
        this.canUseSave = false;

        if (this.playerMoveTween) {
            this.playerMoveTween.stop();
            this.playerMoveTween = null;
        }
        this.moving = false;

        this.clearSpriteCache();
        this.generateMaze();
        this.initialCoinCount = this.coins.length;
        this.buildCollisionMap();

        this.gameOverText.setVisible(false);
        this.restartText.setVisible(false);

        this.createGrid();

        // Reset enemies
        this.enemies.forEach(enemy => {
            if (enemy && enemy.sprite) {
                enemy.sprite.destroy();
            }
        });
        this.enemies = [];
        if (this.level >= 5) {
            this.initEnemies();
        }

        if (this.playerDieSprite) {
            this.playerDieSprite.destroy();
            this.playerDieSprite = null;
        }
        if (this.savePulseTween) {
            this.savePulseTween.stop();
            this.savePulseTween = null;
        }
        if (this.saveSprite) {
            this.saveSprite.destroy();
            this.saveSprite = null;
        }

        this.drawGame();
    }

    generateSaveItem() {
        const excludePositions = [
            this.playerPosition,
            this.exitPosition,
            ...this.obstacles,
            ...this.traps,
            ...this.enemies.map(e => ({ x: e.x, y: e.y }))
        ];

        const position = generateFreePosition(excludePositions, this.boardSize);
        if (position) {
            if (this.saves.length === 0) {
                this.saves.push(position);
            }
        }
    }

    toggleExitBlink() {
        this.exitBlinkState = !this.exitBlinkState;
        if (this.exitSprite) {
            if (this.exitBlinkState) {
                this.exitSprite.setAlpha(CONFIG.UI.EXIT_BLINK_ALPHA_HIGH);
            } else {
                this.exitSprite.setAlpha(CONFIG.UI.EXIT_BLINK_ALPHA_LOW);
            }
        }
    }

    initEnemies() {
        this.enemies = [];
        let enemyCount = this.level >= CONFIG.ENEMIES.MIN_LEVEL_FOR_TWO ? CONFIG.ENEMIES.DOUBLE_COUNT : CONFIG.ENEMIES.SINGLE_COUNT;

        for (let i = 0; i < enemyCount; i++) {
            const excludePositions = [
                this.playerPosition,
                this.exitPosition,
                ...this.obstacles,
                ...this.traps,
                ...this.enemies
            ];

            const position = generateFreePosition(excludePositions, this.boardSize);
            if (!position) continue;

            const enemyPosition = {
                x: position.x,
                y: position.y,
                direction: this.getRandomDirection(),
                moving: false,
                sprite: null
            };

            enemyPosition.sprite = this.add.sprite(
                enemyPosition.x * this.cellSize + this.cellSize / 2,
                enemyPosition.y * this.cellSize + this.cellSize / 2,
                'enemy'
            );
            const enemyScale = calculateSpriteScale('enemy', this.cellSize, this);
            enemyPosition.sprite.setScale(enemyScale);
            enemyPosition.sprite.setFlipX(enemyPosition.direction.dx === -1);

            this.enemies.push(enemyPosition);
        }
    }

    getRandomDirection() {
        const directions = [
            { dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }
        ];
        return directions[Phaser.Math.Between(0, directions.length - 1)];
    }

    updateEnemies() {
        this.enemies.forEach(enemy => {
            if (!enemy || !enemy.sprite) return;

            if (!enemy.moving) {
                enemy.moving = true;
                let nextX = enemy.x + enemy.direction.dx;
                let nextY = enemy.y + enemy.direction.dy;

                if (this.isCollisionOptimized(nextX, nextY)) {
                    enemy.direction = this.getRandomDirection();
                    enemy.moving = false;
                    enemy.sprite.setFlipX(enemy.direction.dx === -1);
                } else {
                    this.tweens.add({
                        targets: enemy.sprite,
                        x: nextX * this.cellSize + this.cellSize / 2,
                        y: nextY * this.cellSize + this.cellSize / 2,
                        duration: CONFIG.ENEMIES.MOVE_TWEEN_DURATION_MS,
                        onComplete: () => {
                            enemy.x = nextX;
                            enemy.y = nextY;
                            enemy.moving = false;

                            if (enemy.x === this.playerPosition.x && enemy.y === this.playerPosition.y) {
                                this.handleDeath();
                            }
                        },
                        callbackScope: this
                    });
                }
            }
        });
    }

    updateScoreAndLevelTexts() {
        const safeScore = (typeof this.score === 'number' && !isNaN(this.score)) ? this.score : 0;
        const safeLevel = (typeof this.level === 'number' && !isNaN(this.level)) ? this.level : 1;

        const scoreElement = document.getElementById('score');
        const levelElement = document.getElementById('level');

        if (scoreElement) scoreElement.textContent = 'Puntos: ' + safeScore;
        if (levelElement) levelElement.textContent = 'Nivel: ' + safeLevel;
    }

    shuffleMusicPlaylist() {
        if (this.availableMusicKeys.length === 0) {
            this.musicPlaylistOrder = [];
            this.currentPlaylistIndex = 0;
            return;
        }
        this.musicPlaylistOrder = [...Array(this.availableMusicKeys.length).keys()];
        for (let i = this.musicPlaylistOrder.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.musicPlaylistOrder[i], this.musicPlaylistOrder[j]] = [this.musicPlaylistOrder[j], this.musicPlaylistOrder[i]];
        }
        this.currentPlaylistIndex = 0;
    }

    playRandomMusic() {
        if (this.availableMusicKeys.length === 0) return;

        if (this.backgroundMusic) {
            this.backgroundMusic.stop();
            this.backgroundMusic.destroy();
            this.backgroundMusic = null;
        }

        if (this.currentPlaylistIndex >= this.musicPlaylistOrder.length) {
            this.shuffleMusicPlaylist();
        }

        const musicIndex = this.musicPlaylistOrder[this.currentPlaylistIndex];
        const musicKey = this.availableMusicKeys[musicIndex];
        this.currentPlaylistIndex++;

        this.playSpecificMusic(musicKey);
    }

    playSpecificMusic(musicKey) {
        try {
            if (!this.cache.audio.exists(musicKey)) return;

            this.backgroundMusic = this.sound.add(musicKey, {
                loop: false,
                volume: CONFIG.AUDIO.DEFAULT_VOLUME
            });

            this.backgroundMusic.play();
            this.backgroundMusic.once('complete', () => {
                this.playRandomMusic();
            });

            // Update UI
            const toggleMusicButton = document.getElementById('toggle-music');
            if (toggleMusicButton) toggleMusicButton.textContent = 'Música Off';

        } catch (error) {
            console.error('Error in playSpecificMusic:', error);
        }
    }

    setupUIEventListeners() {
        const toggleMusicButton = document.getElementById('toggle-music');
        const volumeSlider = document.getElementById('volume-slider');
        const nextButton = document.getElementById('next-music');
        const prevButton = document.getElementById('prev-music');
        const restartButton = document.getElementById('restart-button');

        // Cleanup old listeners if any (though we are in a new class instance usually)
        this.eventListenerCleanup.forEach(({ element, event, handler }) => {
            if (element) element.removeEventListener(event, handler);
        });
        this.eventListenerCleanup = [];

        const addListener = (element, event, handler) => {
            if (element) {
                element.addEventListener(event, handler);
                this.eventListenerCleanup.push({ element, event, handler });
            }
        };

        addListener(toggleMusicButton, 'click', () => {
            if (this.sound && this.sound.context && this.sound.context.state === 'suspended') {
                this.sound.context.resume().catch(() => { });
            }
            if (this.backgroundMusic && this.backgroundMusic.isPlaying) {
                this.backgroundMusic.pause();
                if (toggleMusicButton) toggleMusicButton.textContent = 'Música On';
            } else if (this.backgroundMusic) {
                this.backgroundMusic.resume();
                if (toggleMusicButton) toggleMusicButton.textContent = 'Música Off';
            } else {
                this.playRandomMusic();
                if (toggleMusicButton) toggleMusicButton.textContent = 'Música Off';
            }
        });

        addListener(volumeSlider, 'input', (e) => {
            if (this.backgroundMusic) {
                this.backgroundMusic.setVolume(parseFloat(e.target.value));
            }
        });

        addListener(nextButton, 'click', () => {
            if (this.availableMusicKeys.length > 0) {
                if (this.currentPlaylistIndex >= this.musicPlaylistOrder.length) {
                    this.shuffleMusicPlaylist();
                }
                this.playRandomMusic();
            }
        });

        addListener(prevButton, 'click', () => {
            if (this.availableMusicKeys.length > 0) {
                this.currentPlaylistIndex = Math.max(0, this.currentPlaylistIndex - 2);
                this.playRandomMusic();
            }
        });

        addListener(restartButton, 'click', () => {
            if (this.canUseSave) {
                this.resetGame(false);
            } else {
                this.score = 0;
                this.level = 1;
                this.updateScoreAndLevelTexts();
                this.resetGame(true);
            }
        });
    }
}
