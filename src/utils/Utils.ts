import Phaser from 'phaser';
import type { Position } from '../types/game.types';

/**
 * Calcula la escala óptima para un sprite basado en el tamaño de celda
 * @param textureKey - Clave de la textura en Phaser
 * @param targetSize - Tamaño objetivo (generalmente cellSize)
 * @param scene - Escena de Phaser para acceder a texturas
 * @returns Factor de escala calculado
 */
export function calculateSpriteScale(
    textureKey: string,
    targetSize: number,
    scene: Phaser.Scene
): number {
    try {
        if (!scene || !scene.textures || !scene.textures.get(textureKey)) {
            console.warn(`calculateSpriteScale: Invalid texture key "${textureKey}"`);
            return 1;
        }

        const texture = scene.textures.get(textureKey);
        const sourceImage = texture.getSourceImage() as HTMLImageElement;
        const originalWidth = sourceImage.width;
        const originalHeight = sourceImage.height;

        return Math.min(targetSize / originalWidth, targetSize / originalHeight);
    } catch (error) {
        console.error('Error calculating sprite scale:', error);
        return 1;
    }
}

/**
 * Valida que las coordenadas estén dentro de los límites del tablero
 * @param x - Coordenada X
 * @param y - Coordenada Y
 * @param boardSize - Tamaño del tablero
 * @returns True si las coordenadas son válidas
 */
export function isValidPosition(x: number, y: number, boardSize: number): boolean {
    return x >= 0 && x < boardSize && y >= 0 && y < boardSize;
}

/**
 * Genera una posición aleatoria libre en el tablero
 * @param excludePositions - Array de posiciones a excluir
 * @param boardSize - Tamaño del tablero
 * @returns Posición libre o null si no se encuentra
 */
export function generateFreePosition(
    excludePositions: Position[] = [],
    boardSize: number
): Position | null {
    if (!Array.isArray(excludePositions)) {
        console.warn('generateFreePosition: excludePositions must be an array');
        excludePositions = [];
    }

    if (!boardSize || boardSize < 1) {
        console.error('generateFreePosition: Invalid boardSize:', boardSize);
        return null;
    }

    const maxAttempts = 50;
    let attempts = 0;

    while (attempts < maxAttempts) {
        const position: Position = {
            x: Math.floor(Math.random() * boardSize),
            y: Math.floor(Math.random() * boardSize)
        };

        const isOccupied = excludePositions.some(
            pos => pos.x === position.x && pos.y === position.y
        );

        if (!isOccupied) {
            return position;
        }

        attempts++;
    }

    console.warn('generateFreePosition: Could not find free position after', maxAttempts, 'attempts');
    return null;
}
