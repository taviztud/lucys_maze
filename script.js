// Configuración de Phaser
const config = {
    type: Phaser.AUTO,
    width: 600,
    height: 600,
    backgroundColor: '#000000',
    parent: 'game-container', // Especificamos el contenedor
    pixelArt: true, // Para mantener el pixel art sin difuminado
    scene: {
        preload: preload,
        create: create,
        update: update
    }
};

const game = new Phaser.Game(config);

// Variables globales
const boardSize = 10;
const cellSize = 60; // 600 / 10 = 60
let playerPosition = { x: 0, y: 0 };
let exitPosition = { x: 9, y: 9 };
let coins = [];
let obstacles = [];
let traps = [];
let saves = [];
let enemies = [];
let enemySprites = [];
let score = 0;
let level = 1;
let gameOver = false;
let moving = false;
let moveDirection = { dx: 0, dy: 0 };
let moveInterval;
let exitBlinkState = true;
let musicFiles = ['bg_001.mp3', 'bg_002.mp3', 'bg_003.mp3']; // Lista de archivos de música
let backgroundMusic;
let currentMusicIndex = 0;
let canUseSave = false;

// Agregamos una lista de colores pastel para el fondo
let backgroundColors = [0xFFB6C1, 0xB0E0E6, 0xE6E6FA, 0xFFFACD, 0x98FB98]; // Lista de colores pastel en hexadecimal

// Funciones de Phaser
function preload() {
    // Cargar imágenes personalizadas
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

    // Cargar todas las músicas de fondo
    musicFiles.forEach((file, index) => {
        this.load.audio('backgroundMusic' + index, 'sound/' + file);
    });
}

function create() {
    // Seleccionar y reproducir una canción
    playMusic.call(this, currentMusicIndex);

    // Crear cuadrícula de fondo
    createGrid.call(this);

    // Texto de "Game Over"
    this.gameOverText = this.add.text(this.game.config.width / 2, this.game.config.height / 2, 'Game Over', { fontSize: '64px', fill: '#ff0000' });
    this.gameOverText.setOrigin(0.5);
    this.gameOverText.setVisible(false);

    // Instrucción para reiniciar
    this.restartText = this.add.text(this.game.config.width / 2, this.game.config.height / 2 + 80, 'Presiona R para reiniciar', { fontSize: '32px', fill: '#ffffff' });
    this.restartText.setOrigin(0.5);
    this.restartText.setVisible(false);

    // Inicializar el laberinto
    generateRandomExit();
    generateMaze.call(this);

    // Dibujar el juego
    drawGame.call(this);

    // Configurar controles
    this.cursors = this.input.keyboard.createCursorKeys();
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Configurar parpadeo de salida
    this.time.addEvent({
        delay: 500,
        callback: toggleExitBlink,
        callbackScope: this,
        loop: true
    });

    // Controles de música
    const toggleMusicButton = document.getElementById('toggle-music');
    const volumeSlider = document.getElementById('volume-slider');
    const nextButton = document.getElementById('next-music');
    const prevButton = document.getElementById('prev-music');

    toggleMusicButton.addEventListener('click', () => {
        if (backgroundMusic.isPlaying) {
            backgroundMusic.pause();
            toggleMusicButton.textContent = 'Música On';
        } else {
            backgroundMusic.resume();
            toggleMusicButton.textContent = 'Música Off';
        }
    });

    volumeSlider.addEventListener('input', (e) => {
        backgroundMusic.setVolume(e.target.value);
    });

    nextButton.addEventListener('click', () => {
        currentMusicIndex = (currentMusicIndex + 1) % musicFiles.length;
        playMusic.call(this, currentMusicIndex);
    });

    prevButton.addEventListener('click', () => {
        currentMusicIndex = (currentMusicIndex - 1 + musicFiles.length) % musicFiles.length;
        playMusic.call(this, currentMusicIndex);
    });

    // Actualizar los textos de puntaje y nivel en el DOM
    updateScoreAndLevelTexts();

    // Inicializar enemigos si el nivel es 5 o superior
    if (level >= 5) {
        initEnemies.call(this);
    }
}

function update(time, delta) {
    // Manejar movimiento del jugador
    if (!gameOver) {
        if (this.cursors.left.isDown) {
            movePlayer.call(this, -1, 0);
        } else if (this.cursors.right.isDown) {
            movePlayer.call(this, 1, 0);
        } else if (this.cursors.up.isDown) {
            movePlayer.call(this, 0, -1);
        } else if (this.cursors.down.isDown) {
            movePlayer.call(this, 0, 1);
        } else {
            // Si no hay movimiento, mostrar sprite de estar quieto
            if (this.playerSprite && this.playerSprite.texture.key !== 'player_stand') {
                this.playerSprite.setTexture('player_stand');
                adjustPlayerScaleAndRotation.call(this);
            }
        }
    }

    // Manejar reinicio
    if (gameOver && this.restartKey.isDown) {
        if (canUseSave) {
            // Reiniciar desde el último nivel alcanzado
            resetGame.call(this, false);
        } else {
            // Reiniciar desde el nivel 1
            score = 0;
            level = 1;
            updateScoreAndLevelTexts();
            resetGame.call(this, true);
        }
    }

    // Actualizar enemigos
    if (!gameOver && level >= 5) {
        updateEnemies.call(this, delta);
    }
}

// Funciones del juego
function playMusic(index) {
    if (backgroundMusic) {
        backgroundMusic.stop();
    }

    backgroundMusic = this.sound.add('backgroundMusic' + index, { loop: false });
    backgroundMusic.play();

    // Cuando termine la canción, reproducir la siguiente
    backgroundMusic.once('complete', () => {
        currentMusicIndex = (currentMusicIndex + 1) % musicFiles.length;
        playMusic.call(this, currentMusicIndex);
    });
}

function createGrid() {
    // Determinar el color de fondo según el nivel
    const bgColor = backgroundColors[(level - 1) % backgroundColors.length];

    // Cambiar el color de fondo del canvas
    this.cameras.main.setBackgroundColor(bgColor);

    // Crear cuadrícula de fondo
    if (this.gridGroup) {
        this.gridGroup.clear(true, true);
    } else {
        this.gridGroup = this.add.group();
    }

    for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
            const cell = this.add.rectangle(
                x * cellSize + cellSize / 2,
                y * cellSize + cellSize / 2,
                cellSize,
                cellSize,
                0xFFFFFF // Color blanco para las celdas
            ).setStrokeStyle(1, 0x000000);

            cell.setAlpha(0); // Hacer las celdas transparentes si no deseas verlas
            this.gridGroup.add(cell);
        }
    }
}

function generateRandomExit() {
    const side = Math.floor(Math.random() * 2);
    if (side === 0) {
        exitPosition = { x: boardSize - 1, y: Math.floor(Math.random() * boardSize) };
    } else {
        exitPosition = { x: Math.floor(Math.random() * boardSize), y: boardSize - 1 };
    }
}

function generateMaze() {
    do {
        coins.length = 0;
        obstacles.length = 0;
        traps.length = 0;
        saves.length = 0;

        for (let y = 0; y < boardSize; y++) {
            for (let x = 0; x < boardSize; x++) {
                if ((x !== 0 || y !== 0) && (x !== exitPosition.x || y !== exitPosition.y)) {
                    if (Math.random() < 0.2 && hasEnoughSpace(x, y)) {
                        // Seleccionar aleatoriamente un tipo de obstáculo
                        const obstacleTypes = ['brick', 'rock', 'tree'];
                        const randomType = obstacleTypes[Phaser.Math.Between(0, obstacleTypes.length - 1)];
                        obstacles.push({ x, y, type: randomType });
                    } else if (Math.random() < 0.1) {
                        coins.push({ x, y });
                    } else if (Math.random() < 0.05 && hasEnoughSpace(x, y)) {
                        traps.push({ x, y });
                    }
                }
            }
        }
    } while (!isSolvable());
}

function isSolvable() {
    const queue = [{ x: playerPosition.x, y: playerPosition.y }];
    const visited = Array.from({ length: boardSize }, () => Array(boardSize).fill(false));
    visited[playerPosition.y][playerPosition.x] = true;

    const directions = [
        { x: 0, y: -1 }, // arriba
        { x: 1, y: 0 },  // derecha
        { x: 0, y: 1 },  // abajo
        { x: -1, y: 0 }  // izquierda
    ];

    while (queue.length > 0) {
        const { x, y } = queue.shift();

        if (x === exitPosition.x && y === exitPosition.y) {
            return true;
        }

        for (let dir of directions) {
            const nx = x + dir.x;
            const ny = y + dir.y;

            if (
                nx >= 0 && nx < boardSize &&
                ny >= 0 && ny < boardSize &&
                !visited[ny][nx] &&
                !obstacles.some(obstacle => obstacle.x === nx && obstacle.y === ny) &&
                !traps.some(trap => trap.x === nx && trap.y === ny)
            ) {
                visited[ny][nx] = true;
                queue.push({ x: nx, y: ny });
            }
        }
    }

    return false;
}

function hasEnoughSpace(x, y) {
    const directions = [
        { x: 0, y: -1 }, // arriba
        { x: 1, y: 0 },  // derecha
        { x: 0, y: 1 },  // abajo
        { x: -1, y: 0 }, // izquierda
        { x: -1, y: -1 }, // arriba-izquierda
        { x: 1, y: -1 },  // arriba-derecha
        { x: -1, y: 1 },  // abajo-izquierda
        { x: 1, y: 1 }    // abajo-derecha
    ];

    let freeSpaces = 0;
    for (let dir of directions) {
        const nx = x + dir.x;
        const ny = y + dir.y;
        if (
            nx >= 0 && nx < boardSize &&
            ny >= 0 && ny < boardSize &&
            !obstacles.some(obstacle => obstacle.x === nx && obstacle.y === ny) &&
            !traps.some(trap => trap.x === nx && trap.y === ny)
        ) {
            freeSpaces++;
        }
    }

    return freeSpaces >= 4;
}

function drawGame() {
    // Limpiar sprites anteriores
    if (this.playerSprite) this.playerSprite.destroy();
    if (this.exitSprite) this.exitSprite.destroy();
    if (this.coinSprites) {
        this.coinSprites.forEach(sprite => sprite.destroy());
        this.coinSprites = [];
    }
    if (this.obstacleSprites) {
        this.obstacleSprites.forEach(sprite => sprite.destroy());
        this.obstacleSprites = [];
    }
    if (this.trapSprites) {
        this.trapSprites.forEach(sprite => sprite.destroy());
        this.trapSprites = [];
    }
    if (this.saveSprite) {
        this.saveSprite.destroy();
    }

    // No destruir los sprites de los enemigos aquí

    // Dibujar jugador
    const playerTexture = moving ? 'player_run' : 'player_stand';
    this.playerSprite = this.add.sprite(
        playerPosition.x * cellSize + cellSize / 2,
        playerPosition.y * cellSize + cellSize / 2,
        playerTexture
    );

    adjustPlayerScaleAndRotation.call(this);

    // Dibujar salida
    this.exitSprite = this.add.sprite(
        exitPosition.x * cellSize + cellSize / 2,
        exitPosition.y * cellSize + cellSize / 2,
        'exit'
    );
    // Ajustar escala para mantener proporción
    const exitOriginalWidth = this.textures.get('exit').getSourceImage().width;
    const exitOriginalHeight = this.textures.get('exit').getSourceImage().height;
    const exitScale = Math.min(cellSize / exitOriginalWidth, cellSize / exitOriginalHeight);
    this.exitSprite.setScale(exitScale);

    // Efecto de parpadeo
    if (exitBlinkState) {
        this.exitSprite.setAlpha(1);
    } else {
        this.exitSprite.setAlpha(0.5);
    }

    // Dibujar monedas
    this.coinSprites = [];
    coins.forEach(coin => {
        const coinSprite = this.add.sprite(
            coin.x * cellSize + cellSize / 2,
            coin.y * cellSize + cellSize / 2,
            'coin'
        );
        // Ajustar escala para mantener proporción
        const coinOriginalWidth = this.textures.get('coin').getSourceImage().width;
        const coinOriginalHeight = this.textures.get('coin').getSourceImage().height;
        const coinScale = Math.min(cellSize / coinOriginalWidth, cellSize / coinOriginalHeight);
        coinSprite.setScale(coinScale);

        // Guardar posición de la celda en el sprite para facilitar la verificación de colisiones
        coinSprite.gridX = coin.x;
        coinSprite.gridY = coin.y;

        this.coinSprites.push(coinSprite);
    });

    // Dibujar obstáculos
    this.obstacleSprites = [];
    obstacles.forEach(obstacle => {
        const obstacleSprite = this.add.sprite(
            obstacle.x * cellSize + cellSize / 2,
            obstacle.y * cellSize + cellSize / 2,
            `obstacle_${obstacle.type}`
        );
        // Ajustar escala para mantener proporción
        const obstacleOriginalWidth = this.textures.get(`obstacle_${obstacle.type}`).getSourceImage().width;
        const obstacleOriginalHeight = this.textures.get(`obstacle_${obstacle.type}`).getSourceImage().height;
        const obstacleScale = Math.min(cellSize / obstacleOriginalWidth, cellSize / obstacleOriginalHeight);
        obstacleSprite.setScale(obstacleScale);

        this.obstacleSprites.push(obstacleSprite);
    });

    // Dibujar trampas
    this.trapSprites = [];
    traps.forEach(trap => {
        const trapSprite = this.add.sprite(
            trap.x * cellSize + cellSize / 2,
            trap.y * cellSize + cellSize / 2,
            'trap'
        );
        // Ajustar escala para mantener proporción
        const trapOriginalWidth = this.textures.get('trap').getSourceImage().width;
        const trapOriginalHeight = this.textures.get('trap').getSourceImage().height;
        const trapScale = Math.min(cellSize / trapOriginalWidth, cellSize / trapOriginalHeight);
        trapSprite.setScale(trapScale);

        this.trapSprites.push(trapSprite);
    });

    // Dibujar ítem de salvación si existe
    if (saves.length > 0) {
        const save = saves[0];
        this.saveSprite = this.add.sprite(
            save.x * cellSize + cellSize / 2,
            save.y * cellSize + cellSize / 2,
            'save'
        );
        const saveOriginalWidth = this.textures.get('save').getSourceImage().width;
        const saveOriginalHeight = this.textures.get('save').getSourceImage().height;
        const saveScale = Math.min(cellSize / saveOriginalWidth, cellSize / saveOriginalHeight);
        this.saveSprite.setScale(saveScale);
    }

    // Actualizar posiciones de los enemigos
    if (level >= 5) {
        enemies.forEach(enemy => {
            // Ajustar flipX basado en la dirección
            if (enemy.direction.dx === -1) {
                enemy.sprite.setFlipX(true);
            } else if (enemy.direction.dx === 1) {
                enemy.sprite.setFlipX(false);
            }
            // La actualización de posición se maneja en updateEnemies
        });
    }
}

function adjustPlayerScaleAndRotation() {
    // Ajustar escala para mantener proporción
    const playerOriginalWidth = this.textures.get(this.playerSprite.texture.key).getSourceImage().width;
    const playerOriginalHeight = this.textures.get(this.playerSprite.texture.key).getSourceImage().height;
    const playerScale = Math.min(cellSize / playerOriginalWidth, cellSize / playerOriginalHeight);
    this.playerSprite.setScale(playerScale);

    // Rotar jugador basado en la dirección
    if (moveDirection.dx === 1) {
        this.playerSprite.setAngle(0);
        this.playerSprite.setFlipX(false);
    } else if (moveDirection.dx === -1) {
        this.playerSprite.setAngle(0);
        this.playerSprite.setFlipX(true);
    } else if (moveDirection.dy === -1) {
        this.playerSprite.setAngle(-90);
        this.playerSprite.setFlipX(false);
    } else if (moveDirection.dy === 1) {
        this.playerSprite.setAngle(90);
        this.playerSprite.setFlipX(false);
    }
}

function movePlayer(dx, dy) {
    if (gameOver) return;

    // Actualizar dirección de movimiento
    moveDirection = { dx, dy };

    if (!moving) {
        moving = true;
        this.playerSprite.setTexture('player_run');
        adjustPlayerScaleAndRotation.call(this);

        moveInterval = this.time.addEvent({
            delay: Math.max(50, 200 - level * 10),
            callback: () => {
                let nextX = playerPosition.x + moveDirection.dx;
                let nextY = playerPosition.y + moveDirection.dy;

                // Verificar límites y obstáculos
                if (nextX < 0 || nextX >= boardSize || nextY < 0 || nextY >= boardSize ||
                    obstacles.some(obstacle => obstacle.x === nextX && obstacle.y === nextY)) {
                    moving = false;
                    moveInterval.remove();
                    this.playerSprite.setTexture('player_stand');
                    adjustPlayerScaleAndRotation.call(this);
                    return;
                }

                playerPosition.x = nextX;
                playerPosition.y = nextY;

                // Verificar trampas
                if (traps.some(trap => trap.x === playerPosition.x && trap.y === playerPosition.y)) {
                    gameOver = true;
                    moving = false;
                    moveInterval.remove();
                    drawGame.call(this);
                    showGameOver.call(this);
                    return;
                }

                // Verificar enemigos
                if (enemies.some(enemy => Math.round(enemy.x) === playerPosition.x && Math.round(enemy.y) === playerPosition.y)) {
                    gameOver = true;
                    moving = false;
                    moveInterval.remove();
                    drawGame.call(this);
                    showGameOver.call(this);
                    return;
                }

                // Verificar salida
                if (playerPosition.x === exitPosition.x && playerPosition.y === exitPosition.y) {
                    score += 100;
                    level += 1;
                    updateScoreAndLevelTexts();
                    resetGame.call(this, false);
                    moveInterval.remove();
                    return;
                }

                // Verificar monedas
                for (let i = coins.length - 1; i >= 0; i--) {
                    if (coins[i].x === playerPosition.x && coins[i].y === playerPosition.y) {
                        coins.splice(i, 1);
                        score += 10;
                        updateScoreAndLevelTexts();

                        // Buscar y destruir el sprite correspondiente usando gridX y gridY
                        for (let j = this.coinSprites.length - 1; j >= 0; j--) {
                            if (this.coinSprites[j].gridX === playerPosition.x && this.coinSprites[j].gridY === playerPosition.y) {
                                this.coinSprites[j].destroy();
                                this.coinSprites.splice(j, 1);
                                break; // Se asume que hay una sola moneda por celda
                            }
                        }
                    }
                }

                // Verificar ítem de salvación
                if (saves.length > 0) {
                    const save = saves[0];
                    if (save.x === playerPosition.x && save.y === playerPosition.y) {
                        canUseSave = true;
                        saves.splice(0, 1);
                        if (this.saveSprite) {
                            this.saveSprite.destroy();
                        }
                    }
                }

                // Actualizar posición del jugador sin recrear sprite
                this.playerSprite.setPosition(
                    playerPosition.x * cellSize + cellSize / 2,
                    playerPosition.y * cellSize + cellSize / 2
                );

                // Rotar jugador basado en la dirección
                adjustPlayerScaleAndRotation.call(this);
            },
            callbackScope: this,
            loop: true
        });
    }
}

function updateScoreAndLevelTexts() {
    document.getElementById('score').textContent = 'Puntos: ' + score;
    document.getElementById('level').textContent = 'Nivel: ' + level;
}

function showGameOver() {
    this.gameOverText.setVisible(true);
    this.restartText.setVisible(true);
    moving = false;

    // Mostrar sprite de Lucy muerta
    if (this.playerSprite) {
        this.playerSprite.destroy();
    }

    this.playerDieSprite = this.add.sprite(
        playerPosition.x * cellSize + cellSize / 2,
        playerPosition.y * cellSize + cellSize / 2,
        'player_die'
    );

    // Ajustar escala para mantener proporción
    const playerDieOriginalWidth = this.textures.get('player_die').getSourceImage().width;
    const playerDieOriginalHeight = this.textures.get('player_die').getSourceImage().height;
    const playerDieScale = Math.min(cellSize / playerDieOriginalWidth, cellSize / playerDieOriginalHeight);
    this.playerDieSprite.setScale(playerDieScale);
}

function resetGame(resetLevel) {
    if (resetLevel) {
        level = 1;
        score = 0;
    }
    playerPosition = { x: 0, y: 0 };
    generateRandomExit();
    gameOver = false;
    moving = false;
    moveDirection = { dx: 0, dy: 0 };
    canUseSave = false;
    if (moveInterval) moveInterval.remove();
    generateMaze.call(this);
    this.gameOverText.setVisible(false);
    this.restartText.setVisible(false);

    // Crear la cuadrícula nuevamente con el nuevo color de fondo
    createGrid.call(this);

    // Inicializar enemigos si el nivel es 5 o superior
    if (level >= 5) {
        enemies.forEach(enemy => {
            if (enemy.sprite) {
                enemy.sprite.destroy();
            }
        });
        initEnemies.call(this);
    } else {
        // Destruir sprites de enemigos
        enemies.forEach(enemy => {
            if (enemy.sprite) {
                enemy.sprite.destroy();
            }
        });
        enemies = [];
    }

    // Eliminar sprite de Lucy muerta si existe
    if (this.playerDieSprite) {
        this.playerDieSprite.destroy();
        this.playerDieSprite = null;
    }

    // Generar ítem de salvación si el jugador ha recolectado suficientes monedas
    if (score >= 50 && Math.random() < 0.5) {
        generateSaveItem();
    }

    drawGame.call(this);
}

function generateSaveItem() {
    let position;
    do {
        position = {
            x: Phaser.Math.Between(0, boardSize - 1),
            y: Phaser.Math.Between(0, boardSize - 1)
        };
    } while (
        (position.x === playerPosition.x && position.y === playerPosition.y) ||
        (position.x === exitPosition.x && position.y === exitPosition.y) ||
        obstacles.some(obstacle => obstacle.x === position.x && obstacle.y === position.y) ||
        traps.some(trap => trap.x === position.x && trap.y === position.y)
    );

    saves.push(position);
}

function toggleExitBlink() {
    exitBlinkState = !exitBlinkState;
    if (this.exitSprite) {
        if (exitBlinkState) {
            this.exitSprite.setAlpha(1);
        } else {
            this.exitSprite.setAlpha(0.5);
        }
    }
}

// Inicializar enemigos
function initEnemies() {
    enemies = [];

    let enemyCount = level >= 10 ? 2 : 1;

    for (let i = 0; i < enemyCount; i++) {
        let enemyPosition;
        do {
            enemyPosition = {
                x: Phaser.Math.Between(0, boardSize - 1),
                y: Phaser.Math.Between(0, boardSize - 1),
                direction: getRandomDirection(),
                moving: false,
                sprite: null
            };
        } while (
            (enemyPosition.x === playerPosition.x && enemyPosition.y === playerPosition.y) ||
            (enemyPosition.x === exitPosition.x && enemyPosition.y === exitPosition.y) ||
            obstacles.some(obstacle => obstacle.x === enemyPosition.x && obstacle.y === enemyPosition.y) ||
            traps.some(trap => trap.x === enemyPosition.x && trap.y === enemyPosition.y)
        );

        // Crear sprite para el enemigo
        enemyPosition.sprite = this.add.sprite(
            enemyPosition.x * cellSize + cellSize / 2,
            enemyPosition.y * cellSize + cellSize / 2,
            'enemy'
        );
        // Ajustar escala para mantener proporción
        const enemyOriginalWidth = this.textures.get('enemy').getSourceImage().width;
        const enemyOriginalHeight = this.textures.get('enemy').getSourceImage().height;
        const enemyScale = Math.min(cellSize / enemyOriginalWidth, cellSize / enemyOriginalHeight);
        enemyPosition.sprite.setScale(enemyScale);

        // Flip sprite based on direction
        if (enemyPosition.direction.dx === -1) {
            enemyPosition.sprite.setFlipX(true);
        } else {
            enemyPosition.sprite.setFlipX(false);
        }

        enemies.push(enemyPosition);
    }
}

// Obtener una dirección aleatoria
function getRandomDirection() {
    const directions = [
        { dx: 0, dy: -1 }, // arriba
        { dx: 1, dy: 0 },  // derecha
        { dx: 0, dy: 1 },  // abajo
        { dx: -1, dy: 0 }  // izquierda
    ];
    return directions[Phaser.Math.Between(0, directions.length - 1)];
}

// Actualizar enemigos
function updateEnemies(delta) {
    enemies.forEach(enemy => {
        if (!enemy.moving) {
            enemy.moving = true;
            let nextX = enemy.x + enemy.direction.dx;
            let nextY = enemy.y + enemy.direction.dy;

            // Si el enemigo choca con un obstáculo o límite, cambia de dirección
            if (
                nextX < 0 || nextX >= boardSize || nextY < 0 || nextY >= boardSize ||
                obstacles.some(obstacle => obstacle.x === nextX && obstacle.y === nextY)
            ) {
                enemy.direction = getRandomDirection();
                enemy.moving = false;
                // Flip sprite based on new direction
                if (enemy.direction.dx === -1) {
                    enemy.sprite.setFlipX(true);
                } else if (enemy.direction.dx === 1) {
                    enemy.sprite.setFlipX(false);
                }
            } else {
                // Mover suavemente al enemigo usando tween
                this.tweens.add({
                    targets: enemy.sprite,
                    x: nextX * cellSize + cellSize / 2,
                    y: nextY * cellSize + cellSize / 2,
                    duration: 1000, // Velocidad de movimiento del enemigo (más alto es más lento)
                    onComplete: () => {
                        enemy.x = nextX;
                        enemy.y = nextY;
                        enemy.moving = false;

                        // Verificar colisión con el jugador
                        if (enemy.x === playerPosition.x && enemy.y === playerPosition.y) {
                            gameOver = true;
                            moving = false;
                            showGameOver.call(this);
                        }
                    },
                    callbackScope: this
                });

                // Flip sprite based on direction
                if (enemy.direction.dx === -1) {
                    enemy.sprite.setFlipX(true);
                } else if (enemy.direction.dx === 1) {
                    enemy.sprite.setFlipX(false);
                }
            }
        }
    });
}

// Event listener para el botón de reinicio
document.getElementById('restart-button').addEventListener('click', () => {
    if (canUseSave) {
        // Reiniciar desde el último nivel alcanzado
        resetGame.call(game.scene.scenes[0], false);
    } else {
        // Reiniciar desde el nivel 1
        score = 0;
        level = 1;
        updateScoreAndLevelTexts();
        resetGame.call(game.scene.scenes[0], true);
    }
});
