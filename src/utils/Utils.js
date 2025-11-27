/**
 * Calcula la escala óptima para un sprite basado en el tamaño de celda
 * Elimina duplicación de código en escalado de sprites
 * @param {string} textureKey - Clave de la textura en Phaser
 * @param {number} targetSize - Tamaño objetivo (generalmente cellSize)
 * @param {object} scene - Escena de Phaser para acceder a texturas
 * @returns {number} - Factor de escala calculado
 */
export function calculateSpriteScale(textureKey, targetSize, scene) {
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
 * Valida que las coordenadas estén dentro de los límites del tablero
 * @param {number} x - Coordenada X
 * @param {number} y - Coordenada Y
 * @param {number} boardSize - Tamaño del tablero
 * @returns {boolean} - True si las coordenadas son válidas
 */
export function isValidPosition(x, y, boardSize) {
    return x >= 0 && x < boardSize && y >= 0 && y < boardSize;
}

/**
 * Genera una posición aleatoria libre en el tablero
 * @param {Array} excludePositions - Array de posiciones a excluir
 * @param {number} boardSize - Tamaño del tablero
 * @returns {Object} - {x, y} posición libre o null si no se encuentra
 */
export function generateFreePosition(excludePositions = [], boardSize) {
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
            x: Math.floor(Math.random() * boardSize),
            y: Math.floor(Math.random() * boardSize)
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
