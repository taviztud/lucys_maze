// CONFIG: Centralizar todas las constantes de configuración
const CONFIG = {
    // Configuración del juego
    GAME_WIDTH: 600,
    GAME_HEIGHT: 600,
    BOARD_SIZE: 10,
    CELL_SIZE: 60,

    // Configuraciones de gameplay
    MAZE_GENERATION: {
        OBSTACLE_PROBABILITY: 0.2,
        COIN_PROBABILITY: 0.1,
        TRAP_PROBABILITY: 0.05,
        MAX_ATTEMPTS: 100,
        MIN_FREE_SPACES: 4
    },

    // Configuración de música y audio
    AUDIO: {
        DEFAULT_VOLUME: 0.5,
        MAX_BG_TRACKS: 14 // Limitar detección a 14 pistas por ahora
    },

    // UI y efectos visuales
    UI: {
        GAME_OVER_FONT_SIZE: '48px',
        RESTART_FONT_SIZE: '24px',
        RESTART_OFFSET_Y: 80,
        EXIT_BLINK_ALPHA_HIGH: 1,
        EXIT_BLINK_ALPHA_LOW: 0.3,
        EXIT_BLINK_INTERVAL: 200,
        FONT_FAMILY: '"Press Start 2P", cursive'
    },

    // Colores de NEÓN por nivel (Cyan, Magenta, Lime, Yellow, Purple)
    BACKGROUND_COLORS: [0x00FFFF, 0xFF00FF, 0x00FF00, 0xFFFF00, 0x9D00FF],
    GRID_ALPHA: 0.3, // Transparencia sutil para el grid

    // Configuración de enemigos
    ENEMIES: {
        MIN_LEVEL_FOR_TWO: 10,
        SINGLE_COUNT: 1,
        DOUBLE_COUNT: 2,
        MOVE_TWEEN_DURATION_MS: 1000
    },

    PERFORMANCE: {
        INPUT_THROTTLE_MS: 16,
        ENEMY_UPDATE_THROTTLE_MS: 16,
        PLAYER_MIN_STEP_DURATION_MS: 200,
        PLAYER_BASE_DURATION_MS: 400,
        PLAYER_STEP_DEC_PER_LEVEL: 20
    },

    DEBUG: false
};

// Configuración de Phaser
const config = {
    type: Phaser.AUTO,
    width: CONFIG.GAME_WIDTH,
    height: CONFIG.GAME_HEIGHT,
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
const boardSize = CONFIG.BOARD_SIZE;
const cellSize = CONFIG.CELL_SIZE;
let playerPosition = { x: 0, y: 0 };
let exitPosition = { x: CONFIG.BOARD_SIZE - 1, y: CONFIG.BOARD_SIZE - 1 };
let coins = [];
let obstacles = [];
let traps = [];
let saves = [];
let enemies = [];
let score = 0;
let level = 1;
let gameOver = false;
let moving = false;
let moveDirection = { dx: 0, dy: 0 };
let desiredDirection = { dx: 0, dy: 0 };
let playerMoveTween = null;
let exitBlinkState = true;
let requireFreshPressAfterReset = false; // Al pasar de nivel, exigir nuevo keypress para arrancar
let initialCoinCount = 0; // Cantidad de monedas al inicio del nivel

// Performance optimization: throttling variables
let lastInputTime = 0;
let lastEnemyUpdateTime = 0;
// Sistema de audio mejorado con detección automática y reproducción aleatoria
let availableMusicKeys = [];
let backgroundMusic;
let musicPlaylistOrder = []; // Array para orden aleatorio de reproducción
let currentPlaylistIndex = 0;

// Función para generar orden aleatorio de reproducción
function shuffleMusicPlaylist() {
    if (availableMusicKeys.length === 0) {
        console.warn('shuffleMusicPlaylist: No music keys available');
        musicPlaylistOrder = [];
        currentPlaylistIndex = 0;
        return;
    }

    // Crear array con índices válidos basado en availableMusicKeys
    musicPlaylistOrder = [...Array(availableMusicKeys.length).keys()];

    // Fisher-Yates shuffle algorithm
    for (let i = musicPlaylistOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [musicPlaylistOrder[i], musicPlaylistOrder[j]] = [musicPlaylistOrder[j], musicPlaylistOrder[i]];
    }

    currentPlaylistIndex = 0;
    if (CONFIG.DEBUG) console.debug(`Music playlist shuffled: ${musicPlaylistOrder.length} tracks available`);
}
let canUseSave = false;

// Función para limpiar intervalos de movimiento de forma segura
function cleanupMoveInterval() {
    if (playerMoveTween) {
        playerMoveTween.stop();
        playerMoveTween = null;
    }
    moving = false;
}

// Sistema de gestión de event listeners para evitar memory leaks
let eventListenerCleanup = [];

// Sistema de optimización de colisiones - Spatial Grid
let collisionMap = null; // Mapa de obstáculos solamente (excluye trampas)

// ========== UTILITY FUNCTIONS ==========
/**
 * Calcula la escala óptima para un sprite basado en el tamaño de celda
 * Elimina duplicación de código en escalado de sprites
 * @param {string} textureKey - Clave de la textura en Phaser
 * @param {number} targetSize - Tamaño objetivo (generalmente cellSize)
 * @param {object} scene - Escena de Phaser para acceder a texturas
 * @returns {number} - Factor de escala calculado
 */
function calculateSpriteScale(textureKey, targetSize, scene) {
    try {
        if (!scene || !scene.textures || !scene.textures.get(textureKey)) {
            console.warn(`calculateSpriteScale: Invalid texture key "${textureKey}"`);
            return 1; // Escala por defecto
        }

        const texture = scene.textures.get(textureKey);
        const sourceImage = texture.getSourceImage();
        const originalWidth = sourceImage.width;
        const originalHeight = sourceImage.height;

        return Math.min(targetSize / originalWidth, targetSize / originalHeight);
    } catch (error) {
        console.error('Error calculating sprite scale:', error);
        return 1; // Escala por defecto en caso de error
    }
}

/**
 * Genera una posición aleatoria libre en el tablero
 * Evita colisiones con jugador, salida, obstáculos y otros elementos
 * @param {Array} excludePositions - Array de posiciones a excluir
 * @returns {Object} - {x, y} posición libre o null si no se encuentra
 */
function generateFreePosition(excludePositions = []) {
    // Validación de input
    if (!Array.isArray(excludePositions)) {
        console.warn('generateFreePosition: excludePositions must be an array');
        excludePositions = [];
    }

    // Validación de boardSize
    if (!boardSize || boardSize < 1) {
        console.error('generateFreePosition: Invalid boardSize:', boardSize);
        return null;
    }

    const maxAttempts = 50;
    let attempts = 0;

    while (attempts < maxAttempts) {
        const position = {
            x: Phaser.Math.Between(0, boardSize - 1),
            y: Phaser.Math.Between(0, boardSize - 1)
        };

        // Verificar si la posición está libre
        const isOccupied = excludePositions.some(pos =>
            pos.x === position.x && pos.y === position.y
        );

        if (!isOccupied) {
            return position;
        }

        attempts++;
    }

    console.warn('generateFreePosition: Could not find free position after', maxAttempts, 'attempts');
    return null;
}

/**
 * Valida que las coordenadas estén dentro de los límites del tablero
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @returns {boolean} - True si las coordenadas son válidas
 */
function isValidPosition(x, y) {
    return x >= 0 && x < boardSize && y >= 0 && y < boardSize;
}

// Sistema de reutilización de sprites para reducir memory usage
let spriteCache = {
    coins: [],
    obstacles: [],
    traps: []
};

// Función para construir mapa de colisiones optimizado
/**
 * Construye el mapa de colisiones para optimizar la detección
 * Crea una grid 2D que marca las posiciones con obstáculos y trampas
 */
function buildCollisionMap() {
    // Validación de boardSize
    if (!boardSize || boardSize < 1) {
        console.error('buildCollisionMap: Invalid boardSize:', boardSize);
        return;
    }

    try {
        collisionMap = Array.from({ length: boardSize }, () => Array(boardSize).fill(false));
        // Marcar solo obstáculos (las trampas NO bloquean el deslizamiento)
        obstacles.forEach(obstacle => {
            if (obstacle.x >= 0 && obstacle.x < boardSize && obstacle.y >= 0 && obstacle.y < boardSize) {
                collisionMap[obstacle.y][obstacle.x] = true;
            }
        });
    } catch (error) {
        console.error('Error building collision map:', error);
        // Crear mapa vacío como fallback
        collisionMap = Array.from({ length: boardSize || 10 }, () => Array(boardSize || 10).fill(false));
    }
}

// Función optimizada para verificar colisión O(1) vs O(n)
/**
 * Verifica si hay una colisión en las coordenadas especificadas usando spatial grid
 * Optimización O(1) vs verificación O(n) tradicional
 * @param {number} x - Coordenada X del tablero
 * @param {number} y - Coordenada Y del tablero
 * @returns {boolean} - True si hay colisión, false en caso contrario
 */
function isCollisionOptimized(x, y) {
    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
        return true; // Fuera de límites
    }
    return collisionMap && collisionMap[y] && collisionMap[y][x];
}

// Función optimizada para verificar trampas específicamente
function isTrapOptimized(x, y) {
    if (x < 0 || x >= boardSize || y < 0 || y >= boardSize) {
        return false;
    }
    // Las trampas no están en collisionMap; comprobar directamente contra la lista de trampas
    return traps.some(trap => trap.x === x && trap.y === y);
}

// Funciones de sprite pooling para mejor gestión de memoria
function clearSpriteCache() {
    Object.keys(spriteCache).forEach(key => {
        spriteCache[key].forEach(sprite => {
            if (sprite && sprite.destroy) {
                sprite.destroy();
            }
        });
        spriteCache[key] = [];
    });
}

function hideUnusedSprites(usedSprites, cacheKey) {
    const cache = spriteCache[cacheKey];
    for (let i = usedSprites.length; i < cache.length; i++) {
        if (cache[i]) {
            cache[i].setVisible(false);
        }
    }
}

function addEventListenerWithCleanup(element, event, handler) {
    if (element) {
        element.addEventListener(event, handler);
        eventListenerCleanup.push({ element, event, handler });
    }
}

function cleanupAllEventListeners() {
    eventListenerCleanup.forEach(({ element, event, handler }) => {
        if (element) {
            element.removeEventListener(event, handler);
        }
    });
    eventListenerCleanup = [];
}

// Agregamos una lista de colores pastel para el fondo
let backgroundColors = CONFIG.BACKGROUND_COLORS; // Lista de colores pastel en hexadecimal

// Funciones de Phaser
/**
 * Detecta automáticamente archivos de música disponibles
 * Intenta cargar archivos bg_XXX.mp3 desde la carpeta sound/bg/
 * Para agregar nuevos archivos, simplemente ponlos en sound/bg/ con formato bg_XXX.mp3
 */
function detectAndLoadMusic() {
    availableMusicKeys = [];

    // Intentar cargar archivos desde bg_001.mp3 hasta bg_MAX.mp3
    // Solo los que existen se cargarán exitosamente
    const maxTracks = (CONFIG && CONFIG.AUDIO && CONFIG.AUDIO.MAX_BG_TRACKS) ? CONFIG.AUDIO.MAX_BG_TRACKS : 50;
    for (let i = 1; i <= maxTracks; i++) {
        const paddedNumber = i.toString().padStart(3, '0');
        const filename = `bg_${paddedNumber}.mp3`;
        const key = `backgroundMusic${i - 1}`; // Índice basado en 0

        try {
            // Ruta correcta para los audios existentes (p. ej., sound/bg/bg_001.mp3)
            this.load.audio(key, `sound/bg/${filename}`);
            if (CONFIG.DEBUG) console.debug(`Queued for loading: ${filename} as ${key}`);
        } catch (error) {
            console.warn('Could not queue music file:', filename, error);
        }
    }

    if (CONFIG.DEBUG) console.debug('Music detection complete. Available files will be logged as they load.');
}

/**
 * Carga todos los assets necesarios para el juego
 * Incluye sprites, texturas, archivos de audio y manejo de errores
 */
function preload() {
    try {
        // Error handling: Manejar fallos de carga de assets
        this.load.on('loaderror', function (file) {
            console.warn('Asset not found:', file.key, file.src);
            // Remover de availableMusicKeys si es música
            if (file.key.startsWith('backgroundMusic')) {
                const keyIndex = availableMusicKeys.indexOf(file.key);
                if (keyIndex > -1) {
                    availableMusicKeys.splice(keyIndex, 1);
                    if (CONFIG.DEBUG) console.debug(`Removed unavailable music key: ${file.key}`);
                }
            }
        });

        this.load.on('filecomplete', function (key) {
            if (key.startsWith('backgroundMusic')) {
                if (CONFIG.DEBUG) console.debug('Music loaded successfully:', key);
                // Agregar a la lista de claves disponibles solo cuando se carga exitosamente
                if (!availableMusicKeys.includes(key)) {
                    availableMusicKeys.push(key);
                }
            }
        });

        // Cargar imágenes personalizadas con fallbacks
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

        // Detectar y cargar música automáticamente
        detectAndLoadMusic.call(this);

    } catch (error) {
        console.error('Critical error in preload:', error);
        // Continuar con configuración mínima
    }
}

/**
 * Inicializa el juego después de cargar todos los assets
 * Configura la escena, controles, eventos y estado inicial
 */
function create() {
    // Preparar inicio de música respetando políticas de autoplay (requiere gesto del usuario)
    const tryStartMusic = () => {
        if (availableMusicKeys.length > 0) {
            shuffleMusicPlaylist();
            playRandomMusic.call(this);
        } else {
            // Reintentar poco después si aún no hay pistas detectadas
            this.time.delayedCall(500, () => {
                if (availableMusicKeys.length > 0) {
                    shuffleMusicPlaylist();
                    playRandomMusic.call(this);
                }
            });
        }
    };

    if (this.sound.locked) {
        // Desbloquear audio con primer gesto del usuario y luego arrancar música
        this.input.once('pointerdown', () => this.sound.unlock());
        this.input.keyboard?.once('keydown', () => this.sound.unlock());
        this.sound.once('unlocked', tryStartMusic);
    } else {
        // Audio ya disponible: iniciar con un pequeño delay
        this.time.delayedCall(200, tryStartMusic);
    }

    // Crear cuadrícula de fondo
    createGrid.call(this);

    // Texto de "Game Over"
    this.gameOverText = this.add.text(this.game.config.width / 2, this.game.config.height / 2, 'GAME OVER', {
        fontSize: CONFIG.UI.GAME_OVER_FONT_SIZE,
        fontFamily: CONFIG.UI.FONT_FAMILY,
        fill: '#ff0000',
        stroke: '#ffffff',
        strokeThickness: 4
    });
    this.gameOverText.setOrigin(0.5);
    this.gameOverText.setVisible(false);

    // Instrucción para reiniciar
    this.restartText = this.add.text(this.game.config.width / 2, this.game.config.height / 2 + CONFIG.UI.RESTART_OFFSET_Y, 'PRESS R TO RESTART', {
        fontSize: CONFIG.UI.RESTART_FONT_SIZE,
        fontFamily: CONFIG.UI.FONT_FAMILY,
        fill: '#ffff00',
        align: 'center'
    });
    this.restartText.setOrigin(0.5);
    this.restartText.setVisible(false);

    // Inicializar el laberinto
    generateRandomExit();
    generateMaze.call(this);
    // Registrar cantidad de monedas iniciales del nivel para regla del 70%
    initialCoinCount = coins.length;
    buildCollisionMap(); // Construir mapa de colisiones para optimización

    // Dibujar el juego
    drawGame.call(this);

    // Configurar controles
    this.cursors = this.input.keyboard.createCursorKeys();
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Configurar parpadeo de salida
    this.time.addEvent({
        delay: CONFIG.UI.EXIT_BLINK_INTERVAL,
        callback: toggleExitBlink,
        callbackScope: this,
        loop: true
    });

    // Controles de música - Con sistema de cleanup
    const toggleMusicButton = document.getElementById('toggle-music');
    const volumeSlider = document.getElementById('volume-slider');
    const nextButton = document.getElementById('next-music');
    const prevButton = document.getElementById('prev-music');

    // Limpiar event listeners anteriores antes de añadir nuevos
    cleanupAllEventListeners();

    // Ajustar estado inicial del botón según haya música sonando o no
    if (toggleMusicButton) {
        toggleMusicButton.textContent = (backgroundMusic && backgroundMusic.isPlaying) ? 'Música Off' : 'Música On';
    }

    addEventListenerWithCleanup(toggleMusicButton, 'click', () => {
        try {
            // Intentar reanudar AudioContext si está suspendido (cumple gesto del usuario)
            if (this.sound && this.sound.context && this.sound.context.state === 'suspended') {
                this.sound.context.resume().catch(() => { });
            }
            if (backgroundMusic && backgroundMusic.isPlaying) {
                backgroundMusic.pause();
                toggleMusicButton.textContent = 'Música On';
            } else if (backgroundMusic) {
                backgroundMusic.resume();
                toggleMusicButton.textContent = 'Música Off';
            } else {
                // Si no hay música, intentar reproducir una nueva
                playRandomMusic.call(this);
                toggleMusicButton.textContent = 'Música Off';
            }
        } catch (error) {
            console.error('Error toggling music:', error);
        }
    });

    addEventListenerWithCleanup(volumeSlider, 'input', (e) => {
        try {
            if (backgroundMusic) {
                backgroundMusic.setVolume(parseFloat(e.target.value));
            }
        } catch (error) {
            console.error('Error setting volume:', error);
        }
    });

    addEventListenerWithCleanup(nextButton, 'click', () => {
        try {
            if (availableMusicKeys.length > 0) {
                // Avanzar al siguiente en el playlist aleatorio
                if (currentPlaylistIndex >= musicPlaylistOrder.length) {
                    shuffleMusicPlaylist();
                }
                playRandomMusic.call(this);
            }
        } catch (error) {
            console.error('Error playing next music:', error);
        }
    });

    addEventListenerWithCleanup(prevButton, 'click', () => {
        try {
            if (availableMusicKeys.length > 0) {
                // Retroceder en el playlist aleatorio
                currentPlaylistIndex = Math.max(0, currentPlaylistIndex - 2);
                playRandomMusic.call(this);
            }
        } catch (error) {
            console.error('Error playing previous music:', error);
        }
    });

    // Event listener para el botón de reinicio - Gestionado con cleanup
    const restartButton = document.getElementById('restart-button');
    addEventListenerWithCleanup(restartButton, 'click', () => {
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
    });

    // Input de teclado: actualizar dirección deseada inmediatamente
    this.input.keyboard.on('keydown', (event) => {
        switch (event.code) {
            case 'ArrowLeft':
                desiredDirection = { dx: -1, dy: 0 };
                break;
            case 'ArrowRight':
                desiredDirection = { dx: 1, dy: 0 };
                break;
            case 'ArrowUp':
                desiredDirection = { dx: 0, dy: -1 };
                break;
            case 'ArrowDown':
                desiredDirection = { dx: 0, dy: 1 };
                break;
            default:
                break;
        }
        // Si está detenido, arrancar de inmediato con un keypress fresco
        if (!moving && (desiredDirection.dx !== 0 || desiredDirection.dy !== 0) && !gameOver) {
            movePlayer.call(this, desiredDirection.dx, desiredDirection.dy);
            requireFreshPressAfterReset = false; // Se ha realizado una nueva pulsación
        }
    });

    // Actualizar los textos de puntaje y nivel en el DOM
    updateScoreAndLevelTexts();

    // Inicializar enemigos si el nivel es 5 o superior
    if (level >= 5) {
        initEnemies.call(this);
    }

    // --- EFECTOS VISUALES (JUICE) ---

    // Partículas de monedas
    this.coinParticles = this.add.particles(0, 0, 'coin', {
        speed: { min: 50, max: 150 },
        scale: { start: 0.4, end: 0 },
        lifespan: 600,
        blendMode: 'ADD',
        quantity: 10,
        emitting: false
    });

    // Partículas de rastro (Trail)
    this.trailParticles = this.add.particles(0, 0, 'player_run', {
        speed: 0,
        scale: { start: calculateSpriteScale('player_run', cellSize, this) * 0.8, end: 0 },
        alpha: { start: 0.5, end: 0 },
        lifespan: 200,
        blendMode: 'ADD',
        frequency: 50, // Emitir cada 50ms
        emitting: false
    });
}

/**
 * Loop principal del juego que se ejecuta en cada frame
 * Maneja input del jugador, actualización de enemigos y estado del juego
 * @param {number} time - Tiempo transcurrido desde el inicio del juego
 * @param {number} delta - Tiempo transcurrido desde el último frame
 */
function update(time, delta) {
    try {
        // Throttle input handling to reduce CPU usage
        const currentTime = time;

        // Manejar movimiento del jugador con throttling
        if (!gameOver && (currentTime - lastInputTime) >= CONFIG.PERFORMANCE.INPUT_THROTTLE_MS) {
            let inputDetected = false;
            // Actualizar dirección deseada inmediatamente según teclas presionadas
            if (this.cursors.left.isDown) {
                desiredDirection = { dx: -1, dy: 0 };
                inputDetected = true;
            } else if (this.cursors.right.isDown) {
                desiredDirection = { dx: 1, dy: 0 };
                inputDetected = true;
            } else if (this.cursors.up.isDown) {
                desiredDirection = { dx: 0, dy: -1 };
                inputDetected = true;
            } else if (this.cursors.down.isDown) {
                desiredDirection = { dx: 0, dy: 1 };
                inputDetected = true;
            }

            // Si no estamos moviéndonos, iniciar movimiento en la dirección deseada (si existe)
            if (!moving && !requireFreshPressAfterReset && (desiredDirection.dx !== 0 || desiredDirection.dy !== 0)) {
                movePlayer.call(this, desiredDirection.dx, desiredDirection.dy);
                inputDetected = true;
            }

            if (inputDetected) {
                lastInputTime = currentTime;
            }
        }

        // Manejar reinicio (sin throttling para responsividad)
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

        // Actualizar enemigos con throttling
        if (!gameOver && level >= 5 && (currentTime - lastEnemyUpdateTime) >= CONFIG.PERFORMANCE.ENEMY_UPDATE_THROTTLE_MS) {
            updateEnemies.call(this, delta);
            lastEnemyUpdateTime = currentTime;
        }
    } catch (error) {
        console.error('Error in update loop:', error);
        // Continuar funcionando incluso si hay errores
    }
}

// Funciones del juego
/**
 * Reproduce música de fondo en orden aleatorio
 * Sistema mejorado que detecta automáticamente archivos disponibles
 */
function playRandomMusic(recursionDepth = 0) {
    try {
        // Protección contra recursión infinita
        if (recursionDepth > 10) {
            console.error('playRandomMusic: Too many recursion attempts, stopping');
            return;
        }

        if (availableMusicKeys.length === 0) {
            console.warn('playRandomMusic: No music tracks available');
            return;
        }

        // Detener música actual si existe
        if (backgroundMusic) {
            try {
                backgroundMusic.stop();
                backgroundMusic.destroy();
            } catch (stopError) {
                console.warn('Error stopping background music:', stopError);
            }
        }

        // Obtener siguiente pista del playlist aleatorio
        if (currentPlaylistIndex >= musicPlaylistOrder.length) {
            // Rebarajar cuando termine el playlist
            shuffleMusicPlaylist();
        }

        // Si aún no hay playlist, crear uno
        if (musicPlaylistOrder.length === 0) {
            shuffleMusicPlaylist();
        }

        const trackIndex = musicPlaylistOrder[currentPlaylistIndex];

        // Validar que el índice sea válido
        if (trackIndex >= availableMusicKeys.length || trackIndex < 0) {
            console.warn('Invalid track index:', trackIndex);
            currentPlaylistIndex++;
            if (currentPlaylistIndex < musicPlaylistOrder.length) {
                playRandomMusic.call(this, recursionDepth + 1);
            }
            return;
        }

        const musicKey = availableMusicKeys[trackIndex];

        // Verificar que la pista esté cargada en la caché de audio
        if (!musicKey || !this.cache || !this.cache.audio || !this.cache.audio.exists(musicKey)) {
            console.warn('Music track not available:', musicKey);
            currentPlaylistIndex++;
            if (currentPlaylistIndex < musicPlaylistOrder.length) {
                playRandomMusic.call(this, recursionDepth + 1);
            }
            return;
        }

        if (CONFIG.DEBUG) console.debug(`Playing: ${musicKey}`);
        backgroundMusic = this.sound.add(musicKey, {
            loop: false,
            volume: CONFIG.AUDIO.DEFAULT_VOLUME
        });

        backgroundMusic.on('loaderror', () => {
            console.error('Error loading music track:', musicKey);
            currentPlaylistIndex++;
            if (currentPlaylistIndex < musicPlaylistOrder.length) {
                playRandomMusic.call(this, recursionDepth + 1);
            }
        });

        backgroundMusic.play();

        // Cuando termine la canción, reproducir la siguiente aleatoria
        backgroundMusic.once('complete', () => {
            try {
                playRandomMusic.call(this);
            } catch (nextError) {
                console.error('Error playing next random music track:', nextError);
            }
        });

        currentPlaylistIndex++;
    } catch (error) {
        console.error('Error in playRandomMusic:', error);
    }
}

/**
 * Reproduce una pista de música específica (para controles manuales)
 * @param {string} musicKey - Clave de la pista de música
 */
function playSpecificMusic(musicKey) {
    try {
        if (!musicKey || !availableMusicKeys.includes(musicKey)) {
            console.warn('playSpecificMusic: Invalid music key:', musicKey);
            return;
        }

        if (backgroundMusic) {
            try {
                backgroundMusic.stop();
                backgroundMusic.destroy();
            } catch (stopError) {
                console.warn('Error stopping background music:', stopError);
            }
        }

        if (!this.cache || !this.cache.audio || !this.cache.audio.exists(musicKey)) {
            console.warn('Music track not found in scene:', musicKey);
            return;
        }

        if (CONFIG.DEBUG) console.debug(`Playing specific track: ${musicKey}`);
        backgroundMusic = this.sound.add(musicKey, {
            loop: false,
            volume: CONFIG.AUDIO.DEFAULT_VOLUME
        });

        backgroundMusic.play();

        // Cuando termine, continuar con reproducción aleatoria
        backgroundMusic.once('complete', () => {
            playRandomMusic.call(this);
        });
    } catch (error) {
        console.error('Error in playSpecificMusic:', error);
    }
}

function createGrid() {
    // Fondo negro siempre para contraste
    this.cameras.main.setBackgroundColor('#050505');

    // Determinar el color NEÓN según el nivel
    const neonColor = CONFIG.BACKGROUND_COLORS[(level - 1) % CONFIG.BACKGROUND_COLORS.length];

    // Crear cuadrícula de fondo
    if (this.gridGroup) {
        this.gridGroup.clear(true, true);
    } else {
        this.gridGroup = this.add.group();
    }

    // Dibujar grid estilo retro sutil
    const graphics = this.add.graphics();
    graphics.lineStyle(1, neonColor, CONFIG.GRID_ALPHA); // Línea fina y semitransparente

    for (let i = 0; i <= boardSize; i++) {
        // Líneas verticales
        graphics.moveTo(i * cellSize, 0);
        graphics.lineTo(i * cellSize, boardSize * cellSize);

        // Líneas horizontales
        graphics.moveTo(0, i * cellSize);
        graphics.lineTo(boardSize * cellSize, i * cellSize);
    }

    graphics.strokePath();
    this.gridGroup.add(graphics);

    // Añadir puntos en las intersecciones (más brillantes)
    for (let y = 0; y < boardSize; y++) {
        for (let x = 0; x < boardSize; x++) {
            const dot = this.add.rectangle(
                x * cellSize + cellSize / 2,
                y * cellSize + cellSize / 2,
                2, // Puntos más pequeños
                2,
                neonColor
            );
            dot.setAlpha(0.6);
            this.gridGroup.add(dot);
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

/**
 * Genera un laberinto aleatorio con obstáculos, monedas y trampas
 * Incluye validación y algoritmo de prevención de loops infinitos
 * Garantiza que el laberinto sea solucionable
 */
function generateMaze() {
    try {
        // Validación de boardSize
        if (!boardSize || boardSize < 3) {
            console.error('generateMaze: Invalid boardSize:', boardSize);
            return;
        }

        let attempts = 0;
        const maxAttempts = CONFIG.MAZE_GENERATION.MAX_ATTEMPTS; // Prevenir loops infinitos

        do {
            attempts++;
            coins.length = 0;
            obstacles.length = 0;
            traps.length = 0;
            saves.length = 0;

            for (let y = 0; y < boardSize; y++) {
                for (let x = 0; x < boardSize; x++) {
                    if ((x !== 0 || y !== 0) && (x !== exitPosition.x || y !== exitPosition.y)) {
                        if (Math.random() < CONFIG.MAZE_GENERATION.OBSTACLE_PROBABILITY && hasEnoughSpace(x, y)) {
                            // Seleccionar aleatoriamente un tipo de obstáculo
                            const obstacleTypes = ['brick', 'rock', 'tree'];
                            const randomType = obstacleTypes[Phaser.Math.Between(0, obstacleTypes.length - 1)];
                            obstacles.push({ x, y, type: randomType });
                        } else if (Math.random() < CONFIG.MAZE_GENERATION.COIN_PROBABILITY) {
                            coins.push({ x, y });
                        } else if (Math.random() < CONFIG.MAZE_GENERATION.TRAP_PROBABILITY && hasEnoughSpace(x, y)) {
                            traps.push({ x, y });
                        }
                    }
                }
            }
        } while (!isSolvable() && attempts < maxAttempts);

        // Si no se pudo generar un maze solvable después de maxAttempts, crear uno simple y seguro
        if (attempts >= maxAttempts) {
            console.warn('generateMaze: Se alcanzó el límite de intentos, generando maze simple');
            coins.length = 0;
            obstacles.length = 0;
            traps.length = 0;
            saves.length = 0;
            // Generar algunos elementos seguros
            coins.push({ x: 2, y: 2 }, { x: 5, y: 5 }, { x: 7, y: 3 });
            obstacles.push({ x: 3, y: 4, type: 'brick' }, { x: 6, y: 7, type: 'rock' });
        }
    } catch (error) {
        console.error('Error in generateMaze:', error);
        // Generar maze de emergencia muy simple
        coins.length = 0;
        obstacles.length = 0;
        traps.length = 0;
        saves.length = 0;
        coins.push({ x: 1, y: 1 });
    }
}

function isSolvable() {
    const queue = [{ x: playerPosition.x, y: playerPosition.y }];
    const visited = Array.from({ length: boardSize }, () => Array(boardSize).fill(false));
    visited[playerPosition.y][playerPosition.x] = true;

    const directions = [
        { x: 0, y: -1 }, // up
        { x: 1, y: 0 },  // right
        { x: 0, y: 1 },  // down
        { x: -1, y: 0 }  // left
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
        { x: 0, y: -1 }, // up
        { x: 1, y: 0 },  // right
        { x: 0, y: 1 },  // down
        { x: -1, y: 0 }, // left
        { x: -1, y: -1 }, // up-left
        { x: 1, y: -1 },  // up-right
        { x: -1, y: 1 },  // down-left
        { x: 1, y: 1 }    // down-right
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

    return freeSpaces >= CONFIG.MAZE_GENERATION.MIN_FREE_SPACES;
}

function drawGame() {
    // Object pooling: Reutilizar sprites en lugar de destruir/crear constantemente

    if (this.saveSprite) {
        if (this.savePulseTween) {
            try { this.savePulseTween.stop(); } catch (e) { }
            this.savePulseTween = null;
        }
        this.saveSprite.destroy();
        this.saveSprite = null;
    }

    // No destruir los sprites de los enemigos aquí

    // Draw/Update player (pooling)
    const playerTexture = moving ? 'player_run' : 'player_stand';
    const playerX = playerPosition.x * cellSize + cellSize / 2;
    const playerY = playerPosition.y * cellSize + cellSize / 2;
    if (!this.playerSprite || !this.playerSprite.scene) {
        this.playerSprite = this.add.sprite(playerX, playerY, playerTexture);
    } else {
        this.playerSprite.setTexture(playerTexture);
        this.playerSprite.setPosition(playerX, playerY);
        this.playerSprite.setVisible(true);
    }

    adjustPlayerScaleAndRotation.call(this);

    // Draw/Update exit (pooling)
    const exitX = exitPosition.x * cellSize + cellSize / 2;
    const exitY = exitPosition.y * cellSize + cellSize / 2;
    if (!this.exitSprite || !this.exitSprite.scene) {
        this.exitSprite = this.add.sprite(exitX, exitY, 'exit');
    } else {
        this.exitSprite.setPosition(exitX, exitY);
        this.exitSprite.setTexture('exit');
        this.exitSprite.setVisible(true);
    }
    // Ajustar escala para mantener proporción usando utility function
    const exitScale = calculateSpriteScale('exit', cellSize, this);
    this.exitSprite.setScale(exitScale);

    // Efecto de parpadeo
    if (exitBlinkState) {
        this.exitSprite.setAlpha(CONFIG.UI.EXIT_BLINK_ALPHA_HIGH);
    } else {
        this.exitSprite.setAlpha(CONFIG.UI.EXIT_BLINK_ALPHA_LOW);
    }

    // Draw coins using object pooling
    this.coinSprites = [];
    coins.forEach((coin, index) => {
        let coinSprite;
        if (spriteCache.coins[index] && !spriteCache.coins[index].destroyed) {
            // Reutilizar sprite de la cache
            coinSprite = spriteCache.coins[index];
            coinSprite.setPosition(
                coin.x * cellSize + cellSize / 2,
                coin.y * cellSize + cellSize / 2
            );
            coinSprite.setVisible(true);
        } else {
            // Crear nuevo sprite solo si es necesario
            coinSprite = this.add.sprite(
                coin.x * cellSize + cellSize / 2,
                coin.y * cellSize + cellSize / 2,
                'coin'
            );
            const coinScale = calculateSpriteScale('coin', cellSize, this);
            coinSprite.setScale(coinScale);

            // Guardar en cache
            spriteCache.coins[index] = coinSprite;
        }

        // Guardar posición de la celda en el sprite para facilitar la verificación de colisiones
        coinSprite.gridX = coin.x;
        coinSprite.gridY = coin.y;

        this.coinSprites.push(coinSprite);
    });

    // Draw obstacles using object pooling
    this.obstacleSprites = [];
    obstacles.forEach((obstacle, index) => {
        let obstacleSprite;
        if (spriteCache.obstacles[index] && !spriteCache.obstacles[index].destroyed) {
            // Reutilizar sprite de la cache
            obstacleSprite = spriteCache.obstacles[index];
            obstacleSprite.setPosition(
                obstacle.x * cellSize + cellSize / 2,
                obstacle.y * cellSize + cellSize / 2
            );
            obstacleSprite.setTexture(`obstacle_${obstacle.type}`);
            obstacleSprite.setVisible(true);
        } else {
            // Crear nuevo sprite solo si es necesario
            obstacleSprite = this.add.sprite(
                obstacle.x * cellSize + cellSize / 2,
                obstacle.y * cellSize + cellSize / 2,
                `obstacle_${obstacle.type}`
            );
            const obstacleScale = calculateSpriteScale(`obstacle_${obstacle.type}`, cellSize, this);
            obstacleSprite.setScale(obstacleScale);

            // Guardar en cache
            spriteCache.obstacles[index] = obstacleSprite;
        }

        this.obstacleSprites.push(obstacleSprite);
    });

    // Draw traps using object pooling
    this.trapSprites = [];
    traps.forEach((trap, index) => {
        let trapSprite;
        if (spriteCache.traps[index] && !spriteCache.traps[index].destroyed) {
            // Reutilizar sprite de la cache
            trapSprite = spriteCache.traps[index];
            trapSprite.setPosition(
                trap.x * cellSize + cellSize / 2,
                trap.y * cellSize + cellSize / 2
            );
            trapSprite.setVisible(true);
        } else {
            // Crear nuevo sprite solo si es necesario
            trapSprite = this.add.sprite(
                trap.x * cellSize + cellSize / 2,
                trap.y * cellSize + cellSize / 2,
                'trap'
            );
            const trapScale = calculateSpriteScale('trap', cellSize, this);
            trapSprite.setScale(trapScale);

            // Guardar en cache
            spriteCache.traps[index] = trapSprite;
        }

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
        const saveScale = calculateSpriteScale('save', cellSize, this);
        this.saveSprite.setScale(saveScale);
        this.saveSprite.setAlpha(1);

        // Pulso suave tipo "corazón" para destacar el save
        // Limpia tween previo si existiera
        if (this.savePulseTween) {
            try { this.savePulseTween.stop(); } catch (e) { }
            this.savePulseTween = null;
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
    }

    // Ocultar cualquier sprite sobrante que no se usó en este dibujo
    hideUnusedSprites(this.coinSprites, 'coins');
    hideUnusedSprites(this.obstacleSprites, 'obstacles');
    hideUnusedSprites(this.trapSprites, 'traps');

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
    // Ajustar escala para mantener proporción usando utility function
    const playerScale = calculateSpriteScale(this.playerSprite.texture.key, cellSize, this);
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

/**
 * Calcula hasta dónde puede moverse Lucy en una dirección hasta encontrar un obstáculo
 * @param {number} startX - Posición X inicial
 * @param {number} startY - Posición Y inicial  
 * @param {number} dx - Dirección X (-1, 0, 1)
 * @param {number} dy - Dirección Y (-1, 0, 1)
 * @returns {Object} - {x, y, distance} posición final y distancia
 */
function calculateMoveUntilObstacle(startX, startY, dx, dy) {
    let currentX = startX;
    let currentY = startY;
    let distance = 0;

    while (true) {
        let nextX = currentX + dx;
        let nextY = currentY + dy;

        // Verificar límites y obstáculos
        if (isCollisionOptimized(nextX, nextY)) {
            break;
        }

        currentX = nextX;
        currentY = nextY;
        distance++;
    }

    return { x: currentX, y: currentY, distance };
}

/**
 * Procesa items (monedas, saves) en una posición específica
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 */
function processItemsAtPosition(x, y) {
    // Verificar monedas
    for (let i = coins.length - 1; i >= 0; i--) {
        if (coins[i].x === x && coins[i].y === y) {
            // Efecto de partículas
            if (this.coinParticles) {
                this.coinParticles.emitParticleAt(
                    x * cellSize + cellSize / 2,
                    y * cellSize + cellSize / 2
                );
            }

            coins.splice(i, 1);
            score += 10;
            updateScoreAndLevelTexts();

            // Buscar y destruir el sprite correspondiente
            for (let j = this.coinSprites.length - 1; j >= 0; j--) {
                if (this.coinSprites[j].gridX === x && this.coinSprites[j].gridY === y) {
                    this.coinSprites[j].destroy();
                    this.coinSprites.splice(j, 1);
                    break;
                }
            }

            // Generar save dinámicamente si se supera >70% de monedas y aún no existe
            if (initialCoinCount > 0) {
                const collected = initialCoinCount - coins.length;
                const ratio = collected / initialCoinCount;
                if (ratio > 0.7 && saves.length === 0) {
                    generateSaveItem();
                    // Redibujar para que el sprite de save aparezca de inmediato
                    if (typeof drawGame === 'function') {
                        drawGame.call(this);
                    }
                }
            }
            break; // Solo una moneda por celda
        }
    }

    // Verificar ítem de salvación
    if (saves.length > 0) {
        const save = saves[0];
        if (save.x === x && save.y === y) {
            canUseSave = true;
            saves.splice(0, 1);
            if (this.saveSprite) {
                if (this.savePulseTween) {
                    try { this.savePulseTween.stop(); } catch (e) { }
                    this.savePulseTween = null;
                }
                this.saveSprite.destroy();
                this.saveSprite = null;
            }
        }
    }
}

/**
 * Mueve el jugador continuamente hasta encontrar un obstáculo (estilo Tomb of the Mask)
 * @param {number} dx - Movimiento horizontal (-1, 0, 1)
 * @param {number} dy - Movimiento vertical (-1, 0, 1)
 */
function movePlayer(dx, dy) {
    try {
        // Validación de input - Solo direcciones cardinales
        if (typeof dx !== 'number' || typeof dy !== 'number') {
            console.warn('movePlayer: Invalid parameters, dx and dy must be numbers');
            return;
        }

        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            console.warn('movePlayer: Invalid movement values, dx and dy must be -1, 0, or 1');
            return;
        }

        // Asegurar que solo se permite una dirección a la vez (no diagonal)
        if ((dx !== 0 && dy !== 0) || (dx === 0 && dy === 0)) {
            console.warn('movePlayer: Only cardinal directions allowed (up/down/left/right)');
            return;
        }

        if (gameOver || moving) return;

        // Actualizar dirección de movimiento
        moveDirection = { dx, dy };

        // Calcular hasta dónde puede moverse
        const moveResult = calculateMoveUntilObstacle(playerPosition.x, playerPosition.y, dx, dy);

        // Si no puede moverse ni una celda, salir
        if (moveResult.distance === 0) {
            moveDirection = { dx: 0, dy: 0 };
            if (this.playerSprite && this.playerSprite.texture.key !== 'player_stand') {
                this.playerSprite.setTexture('player_stand');
                adjustPlayerScaleAndRotation.call(this);
            }
            return;
        }

        moving = true;

        // Cambiar a sprite de correr
        this.playerSprite.setTexture('player_run');
        adjustPlayerScaleAndRotation.call(this);

        // Crear animación suave hasta la posición final
        const baseStepDuration = Math.max(
            CONFIG.PERFORMANCE.PLAYER_MIN_STEP_DURATION_MS,
            CONFIG.PERFORMANCE.PLAYER_BASE_DURATION_MS - level * CONFIG.PERFORMANCE.PLAYER_STEP_DEC_PER_LEVEL
        );
        const moveDuration = baseStepDuration * moveResult.distance; // Duración proporcional a la distancia

        // Pre-calcular todas las verificaciones antes de la animación
        const cellsToCheck = [];
        let currentX = playerPosition.x;
        let currentY = playerPosition.y;

        // Crear lista de celdas por las que pasará Lucy
        for (let i = 1; i <= moveResult.distance; i++) {
            currentX = playerPosition.x + (dx * i);
            currentY = playerPosition.y + (dy * i);
            cellsToCheck.push({ x: currentX, y: currentY, step: i });
        }

        // Verificar cada celda en el camino para encontrar stops tempranos
        let finalDestination = { x: moveResult.x, y: moveResult.y, step: moveResult.distance };

        for (const cell of cellsToCheck) {
            // Verificar trampas - detener movimiento aquí
            if (isTrapOptimized(cell.x, cell.y)) {
                finalDestination = cell;
                break;
            }

            // Verificar enemigos - detener movimiento aquí  
            if (enemies.some(enemy => Math.round(enemy.x) === cell.x && Math.round(enemy.y) === cell.y)) {
                finalDestination = cell;
                break;
            }

            // Verificar salida - detener movimiento aquí
            if (cell.x === exitPosition.x && cell.y === exitPosition.y) {
                finalDestination = cell;
                break;
            }
        }

        // Ajustar duración basada en destino final real
        const actualDuration = baseStepDuration * finalDestination.step;

        // Guardar posición inicial para cálculos
        const startX = playerPosition.x;
        const startY = playerPosition.y;

        // Iniciar efecto de rastro
        if (this.trailParticles) {
            this.trailParticles.start();
            this.trailParticles.follow = this.playerSprite;
        }

        let lastStepProcessed = -1; // Para detectar nuevas celdas alcanzadas
        playerMoveTween = this.tweens.add({
            targets: this.playerSprite,
            x: finalDestination.x * cellSize + cellSize / 2,
            y: finalDestination.y * cellSize + cellSize / 2,
            duration: actualDuration,
            ease: 'Linear',
            onUpdate: (tween) => {
                // Calcular cuántas celdas hemos avanzado basado en el progreso
                const progress = tween.progress;
                const totalSteps = finalDestination.step;
                const currentStep = Math.floor(progress * totalSteps);

                // Procesar todos los pasos nuevos alcanzados desde el último
                const stepStart = Math.max(0, lastStepProcessed + 1);
                for (let step = stepStart; step <= currentStep; step++) {
                    // Calcular nueva posición lógica SOLO en la dirección de movimiento usando posición inicial
                    let newLogicalX, newLogicalY;
                    if (dx !== 0) {
                        newLogicalX = startX + (dx * step);
                        newLogicalY = startY;
                    } else if (dy !== 0) {
                        newLogicalX = startX;
                        newLogicalY = startY + (dy * step);
                    } else {
                        break; // Sin movimiento válido
                    }

                    if (newLogicalX !== playerPosition.x || newLogicalY !== playerPosition.y) {
                        if (newLogicalX >= 0 && newLogicalX < boardSize && newLogicalY >= 0 && newLogicalY < boardSize) {
                            playerPosition.x = newLogicalX;
                            playerPosition.y = newLogicalY;

                            // Procesar items por celda recorrida
                            processItemsAtPosition.call(this, playerPosition.x, playerPosition.y);

                            // Trampa: matar al pisarla
                            if (isTrapOptimized(playerPosition.x, playerPosition.y)) {
                                gameOver = true;
                                moveDirection = { dx: 0, dy: 0 };
                                tween.stop();
                                cleanupMoveInterval();
                                drawGame.call(this);
                                showGameOver.call(this);
                                return;
                            }

                            // Enemigo: colisión
                            if (enemies.some(enemy => Math.round(enemy.x) === playerPosition.x && Math.round(enemy.y) === playerPosition.y)) {
                                gameOver = true;
                                moveDirection = { dx: 0, dy: 0 };
                                tween.stop();
                                cleanupMoveInterval();
                                drawGame.call(this);
                                showGameOver.call(this);
                                return;
                            }

                            // Salida: siguiente nivel
                            if (playerPosition.x === exitPosition.x && playerPosition.y === exitPosition.y) {
                                score += 100;
                                level += 1;
                                updateScoreAndLevelTexts();
                                tween.stop();
                                cleanupMoveInterval();
                                // Requerir un nuevo keypress para arrancar en el nivel siguiente
                                requireFreshPressAfterReset = true;
                                // Limpiar la dirección deseada para evitar arranques accidentales
                                desiredDirection = { dx: 0, dy: 0 };
                                resetGame.call(this, false);
                                return;
                            }

                            // Intentar giro en intersección hacia desiredDirection si es diferente y transitable
                            if ((desiredDirection.dx !== 0 || desiredDirection.dy !== 0) &&
                                (desiredDirection.dx !== moveDirection.dx || desiredDirection.dy !== moveDirection.dy)) {
                                const turnNextX = playerPosition.x + desiredDirection.dx;
                                const turnNextY = playerPosition.y + desiredDirection.dy;
                                if (!isCollisionOptimized(turnNextX, turnNextY)) {
                                    // Fijar el sprite exactamente al centro de la celda actual
                                    this.playerSprite.setPosition(
                                        playerPosition.x * cellSize + cellSize / 2,
                                        playerPosition.y * cellSize + cellSize / 2
                                    );
                                    tween.stop();
                                    moving = false;
                                    movePlayer.call(this, desiredDirection.dx, desiredDirection.dy);
                                    return;
                                }
                            }
                        }
                    }
                }

                lastStepProcessed = currentStep;
            },
            onComplete: () => {
                // Detener efecto de rastro
                if (this.trailParticles) {
                    this.trailParticles.stop();
                }

                // Asegurar posición final exacta
                playerPosition.x = finalDestination.x;
                playerPosition.y = finalDestination.y;

                // Efecto de choque si se detuvo contra un obstáculo (y se movió algo)
                if (finalDestination.step > 0 && !gameOver) {
                    this.cameras.main.shake(100, 0.005); // Sacudida leve
                }

                // Procesar cualquier item en la posición final
                processItemsAtPosition.call(this, playerPosition.x, playerPosition.y);
                // Fallback de seguridad: comprobar trampa/salida en la celda final
                if (isTrapOptimized(playerPosition.x, playerPosition.y)) {
                    gameOver = true;
                    moveDirection = { dx: 0, dy: 0 };
                    cleanupMoveInterval();
                    drawGame.call(this);
                    showGameOver.call(this);
                    return;
                }
                if (playerPosition.x === exitPosition.x && playerPosition.y === exitPosition.y) {
                    score += 100;
                    level += 1;
                    updateScoreAndLevelTexts();
                    // Requerir un nuevo keypress para arrancar en el nivel siguiente
                    requireFreshPressAfterReset = true;
                    desiredDirection = { dx: 0, dy: 0 };
                    cleanupMoveInterval();
                    resetGame.call(this, false);
                    return;
                }

                moving = false;
                playerMoveTween = null;
                moveDirection = { dx: 0, dy: 0 };

                // Cambiar a sprite de parado
                this.playerSprite.setTexture('player_stand');
                adjustPlayerScaleAndRotation.call(this);
            },
            callbackScope: this
        });

    } catch (error) {
        console.error('Error in movePlayer:', error);
        cleanupMoveInterval();
        moving = false;
    }
}

function updateScoreAndLevelTexts() {
    try {
        // Validar que score y level sean números válidos
        const safeScore = (typeof score === 'number' && !isNaN(score)) ? score : 0;
        const safeLevel = (typeof level === 'number' && !isNaN(level)) ? level : 1;

        const scoreElement = document.getElementById('score');
        const levelElement = document.getElementById('level');

        if (scoreElement) {
            scoreElement.textContent = 'Puntos: ' + safeScore;
        } else {
            console.warn('updateScoreAndLevelTexts: score element not found');
        }

        if (levelElement) {
            levelElement.textContent = 'Nivel: ' + safeLevel;
        } else {
            console.warn('updateScoreAndLevelTexts: level element not found');
        }
    } catch (error) {
        console.error('Error updating score and level texts:', error);
    }
}

function showGameOver() {
    this.gameOverText.setVisible(true);
    this.restartText.setVisible(true);
    cleanupMoveInterval(); // Asegurar limpieza de intervalos

    // Mostrar sprite de Lucy muerta
    if (this.playerSprite) {
        this.playerSprite.destroy();
        this.playerSprite = null;
    }

    this.playerDieSprite = this.add.sprite(
        playerPosition.x * cellSize + cellSize / 2,
        playerPosition.y * cellSize + cellSize / 2,
        'player_die'
    );

    // Ajustar escala para mantener proporción usando utility function
    const playerDieScale = calculateSpriteScale('player_die', cellSize, this);
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
    moveDirection = { dx: 0, dy: 0 };
    desiredDirection = { dx: 0, dy: 0 }; // Evitar arranques accidentales
    canUseSave = false;
    cleanupMoveInterval(); // Usar función helper más segura
    clearSpriteCache(); // Limpiar sprite cache al reiniciar
    generateMaze.call(this);
    // Registrar cantidad de monedas iniciales del nivel para regla del 70%
    initialCoinCount = coins.length;
    buildCollisionMap(); // Reconstruir mapa de colisiones después del reset
    this.gameOverText.setVisible(false);
    this.restartText.setVisible(false);

    // Crear la cuadrícula nuevamente con el nuevo color de fondo
    createGrid.call(this);

    // Limpieza y reinicio de enemigos (unificada)
    enemies.forEach(enemy => {
        if (enemy && enemy.sprite) {
            enemy.sprite.destroy();
        }
    });
    enemies = [];
    if (level >= 5) {
        initEnemies.call(this);
    }

    // Eliminar sprite de Lucy muerta si existe
    if (this.playerDieSprite) {
        this.playerDieSprite.destroy();
        this.playerDieSprite = null;
    }
    // Asegurar limpieza de save y su tween de pulso
    if (this.savePulseTween) {
        try { this.savePulseTween.stop(); } catch (e) { }
        this.savePulseTween = null;
    }
    if (this.saveSprite) {
        this.saveSprite.destroy();
        this.saveSprite = null;
    }

    // La aparición del ítem de salvación ahora depende de >70% de monedas recogidas

    drawGame.call(this);
}

/**
 * Genera un item de salvación en una posición libre del tablero
 * Utiliza función utility para evitar duplicación de código
 */
function generateSaveItem() {
    const excludePositions = [
        playerPosition,
        exitPosition,
        ...obstacles,
        ...traps,
        // Evitar generar sobre enemigos existentes
        ...enemies.map(e => ({ x: e.x, y: e.y }))
    ];

    const position = generateFreePosition(excludePositions);
    if (position) {
        if (saves.length === 0) {
            saves.push(position);
        }
    } else {
        console.warn('generateSaveItem: Could not generate save item, no free positions');
    }
}

function toggleExitBlink() {
    exitBlinkState = !exitBlinkState;
    if (this.exitSprite) {
        if (exitBlinkState) {
            this.exitSprite.setAlpha(CONFIG.UI.EXIT_BLINK_ALPHA_HIGH);
        } else {
            this.exitSprite.setAlpha(CONFIG.UI.EXIT_BLINK_ALPHA_LOW);
        }
    }
}

// Inicializar enemigos
function initEnemies() {
    enemies = [];

    let enemyCount = level >= CONFIG.ENEMIES.MIN_LEVEL_FOR_TWO ? CONFIG.ENEMIES.DOUBLE_COUNT : CONFIG.ENEMIES.SINGLE_COUNT;

    for (let i = 0; i < enemyCount; i++) {
        const excludePositions = [
            playerPosition,
            exitPosition,
            ...obstacles,
            ...traps,
            ...enemies // Evitar que los enemigos se generen en la misma posición
        ];

        const position = generateFreePosition(excludePositions);
        if (!position) {
            console.warn(`initEnemies: Could not generate enemy ${i}, no free positions`);
            continue;
        }

        const enemyPosition = {
            x: position.x,
            y: position.y,
            direction: getRandomDirection(),
            moving: false,
            sprite: null
        };

        // Crear sprite para el enemigo
        enemyPosition.sprite = this.add.sprite(
            enemyPosition.x * cellSize + cellSize / 2,
            enemyPosition.y * cellSize + cellSize / 2,
            'enemy'
        );
        // Ajustar escala para mantener proporción usando utility function
        const enemyScale = calculateSpriteScale('enemy', cellSize, this);
        enemyPosition.sprite.setScale(enemyScale);

        // Flip sprite based on direction
        enemyPosition.sprite.setFlipX(enemyPosition.direction.dx === -1);

        enemies.push(enemyPosition);
    }
}

// Obtener una dirección aleatoria
function getRandomDirection() {
    const directions = [
        { dx: 0, dy: -1 }, // up
        { dx: 1, dy: 0 },  // right
        { dx: 0, dy: 1 },  // down
        { dx: -1, dy: 0 }  // left
    ];
    return directions[Phaser.Math.Between(0, directions.length - 1)];
}

// Actualizar enemigos
function updateEnemies(delta) {
    enemies.forEach(enemy => {
        if (!enemy || !enemy.sprite) {
            return;
        }
        if (!enemy.moving) {
            enemy.moving = true;
            let nextX = enemy.x + enemy.direction.dx;
            let nextY = enemy.y + enemy.direction.dy;

            // Si el enemigo choca con un obstáculo o límite, cambia de dirección
            if (isCollisionOptimized(nextX, nextY)) {
                enemy.direction = getRandomDirection();
                enemy.moving = false;
                // Flip sprite based on new direction
                enemy.sprite.setFlipX(enemy.direction.dx === -1);
            } else {
                // Mover suavemente al enemigo usando tween
                this.tweens.add({
                    targets: enemy.sprite,
                    x: nextX * cellSize + cellSize / 2,
                    y: nextY * cellSize + cellSize / 2,
                    duration: CONFIG.ENEMIES.MOVE_TWEEN_DURATION_MS, // Velocidad de movimiento del enemigo (más alto es más lento)
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
                enemy.sprite.setFlipX(enemy.direction.dx === -1);
            }
        }
    });
}

