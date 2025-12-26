import Phaser from 'phaser';
import { CONFIG } from '../Config';
import { generateFreePosition } from '../utils/Utils';
import type { Position, Obstacle } from '../types/game.types';

/**
 * Datos generados del laberinto
 */
export interface MazeData {
    coins: Position[];
    obstacles: Obstacle[];
    traps: Position[];
    exitPosition: Position;
}

/**
 * Generador procedural de laberintos con validación de solvability
 */
export class MazeGenerator {
    private boardSize: number;

    constructor(boardSize: number) {
        this.boardSize = boardSize;
    }

    /**
     * Genera un laberinto completo válido (garantiza que sea solucionable)
     */
    generate(exitPosition: Position): MazeData {
        const playerStart: Position = { x: 0, y: 0 };

        let attempts = 0;
        const maxAttempts = CONFIG.MAZE_GENERATION.MAX_ATTEMPTS;
        let mazeData: MazeData;

        do {
            attempts++;
            mazeData = this.generateAttempt(playerStart, exitPosition);
        } while (!this.isSolvable(playerStart, exitPosition, mazeData) && attempts < maxAttempts);

        if (attempts >= maxAttempts) {
            console.warn('MazeGenerator: Max attempts reached, generating simple maze');
            return this.generateSimpleMaze(exitPosition);
        }

        return mazeData;
    }

    /**
     * Genera una posición aleatoria para la salida en el borde derecho o inferior
     */
    generateRandomExit(): Position {
        const side = Math.floor(Math.random() * 2);
        if (side === 0) {
            return { x: this.boardSize - 1, y: Math.floor(Math.random() * this.boardSize) };
        } else {
            return { x: Math.floor(Math.random() * this.boardSize), y: this.boardSize - 1 };
        }
    }

    /**
     * Genera un save item en una posición válida
     */
    generateSaveItem(excludePositions: Position[]): Position | null {
        return generateFreePosition(excludePositions, this.boardSize);
    }

    /**
     * Un intento de generación de laberinto
     */
    private generateAttempt(playerStart: Position, exitPosition: Position): MazeData {
        const coins: Position[] = [];
        const obstacles: Obstacle[] = [];
        const traps: Position[] = [];

        for (let y = 0; y < this.boardSize; y++) {
            for (let x = 0; x < this.boardSize; x++) {
                // Skip player start and exit
                if ((x === playerStart.x && y === playerStart.y) ||
                    (x === exitPosition.x && y === exitPosition.y)) {
                    continue;
                }

                if (Math.random() < CONFIG.MAZE_GENERATION.OBSTACLE_PROBABILITY &&
                    this.hasEnoughSpace(x, y, obstacles, traps)) {
                    const obstacleTypes: Array<'brick' | 'rock' | 'tree'> = ['brick', 'rock', 'tree'];
                    const randomType = obstacleTypes[Phaser.Math.Between(0, obstacleTypes.length - 1)];
                    obstacles.push({ x, y, type: randomType });
                } else if (Math.random() < CONFIG.MAZE_GENERATION.COIN_PROBABILITY) {
                    coins.push({ x, y });
                } else if (Math.random() < CONFIG.MAZE_GENERATION.TRAP_PROBABILITY &&
                    this.hasEnoughSpace(x, y, obstacles, traps)) {
                    traps.push({ x, y });
                }
            }
        }

        return { coins, obstacles, traps, exitPosition };
    }

    /**
     * Verifica que hay suficiente espacio alrededor de una posición
     */
    private hasEnoughSpace(x: number, y: number, obstacles: Obstacle[], traps: Position[]): boolean {
        const directions = [
            { x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 },
            { x: -1, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 1 }, { x: 1, y: 1 }
        ];

        let freeSpaces = 0;
        for (const dir of directions) {
            const nx = x + dir.x;
            const ny = y + dir.y;
            if (
                nx >= 0 && nx < this.boardSize &&
                ny >= 0 && ny < this.boardSize &&
                !obstacles.some(obs => obs.x === nx && obs.y === ny) &&
                !traps.some(trap => trap.x === nx && trap.y === ny)
            ) {
                freeSpaces++;
            }
        }

        return freeSpaces >= CONFIG.MAZE_GENERATION.MIN_FREE_SPACES;
    }

    /**
     * Verifica que el laberinto es solucionable usando BFS
     */
    private isSolvable(playerStart: Position, exitPosition: Position, mazeData: MazeData): boolean {
        const queue = [{ x: playerStart.x, y: playerStart.y }];
        const visited = Array.from(
            { length: this.boardSize },
            () => Array(this.boardSize).fill(false)
        );
        visited[playerStart.y][playerStart.x] = true;

        const directions = [
            { x: 0, y: -1 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
            { x: -1, y: 0 }
        ];

        while (queue.length > 0) {
            const { x, y } = queue.shift()!;

            if (x === exitPosition.x && y === exitPosition.y) {
                return true;
            }

            for (const dir of directions) {
                const nx = x + dir.x;
                const ny = y + dir.y;

                if (
                    nx >= 0 && nx < this.boardSize &&
                    ny >= 0 && ny < this.boardSize &&
                    !visited[ny][nx] &&
                    !mazeData.obstacles.some(obs => obs.x === nx && obs.y === ny) &&
                    !mazeData.traps.some(trap => trap.x === nx && trap.y === ny)
                ) {
                    visited[ny][nx] = true;
                    queue.push({ x: nx, y: ny });
                }
            }
        }

        return false;
    }

    /**
     * Genera un laberinto simple como fallback
     */
    private generateSimpleMaze(exitPosition: Position): MazeData {
        return {
            coins: [{ x: 2, y: 2 }, { x: 5, y: 5 }, { x: 7, y: 3 }],
            obstacles: [
                { x: 3, y: 4, type: 'brick' },
                { x: 6, y: 7, type: 'rock' }
            ],
            traps: [],
            exitPosition
        };
    }

    /**
     * Actualiza el tamaño del tablero
     */
    setBoardSize(size: number): void {
        this.boardSize = size;
    }
}
