import type { Position, Obstacle } from '../types/game.types';

/**
 * Sistema de colisiones optimizado con mapa pre-calculado
 * Proporciona queries rápidas O(1) para detección de colisiones
 */
export class CollisionSystem {
    private boardSize: number;
    private collisionMap: boolean[][] | null = null;

    constructor(boardSize: number) {
        this.boardSize = boardSize;
    }

    /**
     * Construye el mapa de colisiones basado en obstáculos
     */
    build(obstacles: Obstacle[]): void {
        if (!this.boardSize || this.boardSize < 1) {
            console.error('CollisionSystem.build: Invalid boardSize:', this.boardSize);
            return;
        }

        try {
            this.collisionMap = Array.from(
                { length: this.boardSize },
                () => Array(this.boardSize).fill(false)
            );

            obstacles.forEach(obstacle => {
                if (this.isWithinBounds(obstacle.x, obstacle.y)) {
                    this.collisionMap![obstacle.y][obstacle.x] = true;
                }
            });
        } catch (error) {
            console.error('Error building collision map:', error);
            this.collisionMap = Array.from(
                { length: this.boardSize },
                () => Array(this.boardSize).fill(false)
            );
        }
    }

    /**
     * Verifica si una posición tiene colisión (obstáculo o fuera de límites)
     */
    isCollision(x: number, y: number): boolean {
        if (this.isOutOfBounds(x, y)) {
            return true;
        }
        return this.collisionMap?.[y]?.[x] ?? false;
    }

    /**
     * Verifica si una posición contiene una trampa
     */
    isTrap(x: number, y: number, traps: Position[]): boolean {
        if (this.isOutOfBounds(x, y)) {
            return false;
        }
        return traps.some(trap => trap.x === x && trap.y === y);
    }

    /**
     * Verifica si las coordenadas están fuera del tablero
     */
    isOutOfBounds(x: number, y: number): boolean {
        return x < 0 || x >= this.boardSize || y < 0 || y >= this.boardSize;
    }

    /**
     * Verifica si las coordenadas están dentro del tablero
     */
    isWithinBounds(x: number, y: number): boolean {
        return x >= 0 && x < this.boardSize && y >= 0 && y < this.boardSize;
    }

    /**
     * Calcula el movimiento hasta encontrar un obstáculo
     * Devuelve la posición final y la distancia recorrida
     */
    calculateMoveUntilObstacle(
        startX: number,
        startY: number,
        dx: number,
        dy: number
    ): { x: number; y: number; distance: number } {
        let currentX = startX;
        let currentY = startY;
        let distance = 0;

        while (true) {
            const nextX = currentX + dx;
            const nextY = currentY + dy;

            if (this.isCollision(nextX, nextY)) {
                break;
            }

            currentX = nextX;
            currentY = nextY;
            distance++;
        }

        return { x: currentX, y: currentY, distance };
    }

    /**
     * Verifica si el camino entre dos puntos está libre
     */
    isPathClear(start: Position, end: Position, obstacles: Obstacle[]): boolean {
        const dx = Math.sign(end.x - start.x);
        const dy = Math.sign(end.y - start.y);

        let currX = start.x;
        let currY = start.y;

        while (currX !== end.x || currY !== end.y) {
            currX += dx;
            currY += dy;

            if (obstacles.some(o => o.x === currX && o.y === currY)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Actualiza el tamaño del tablero
     */
    setBoardSize(size: number): void {
        this.boardSize = size;
        this.collisionMap = null;
    }

    /**
     * Obtiene el tamaño del tablero
     */
    getBoardSize(): number {
        return this.boardSize;
    }
}
