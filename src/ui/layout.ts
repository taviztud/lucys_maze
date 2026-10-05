import { CONFIG } from '../Config';

export interface GameLayout {
    /** Current canvas size in game pixels (>= the base size on both axes). */
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    /** Top-left corner of the board inside the canvas. */
    boardX: number;
    boardY: number;
    boardWidth: number;
    boardHeight: number;
    /** Top edge of the HUD strip, which sits right above the board. */
    hudY: number;
    hudHeight: number;
}

export const BOARD_PIXEL_WIDTH = CONFIG.BOARD_WIDTH * CONFIG.CELL_SIZE;
export const BOARD_PIXEL_HEIGHT = CONFIG.BOARD_HEIGHT * CONFIG.CELL_SIZE;

/**
 * Places the board and its HUD strip inside whatever canvas size Scale.EXPAND
 * produced: centred horizontally, and vertically centred as one block.
 */
export function computeLayout(width: number, height: number): GameLayout {
    const hudHeight = CONFIG.LAYOUT.HUD_HEIGHT;
    const freeHeight = Math.max(0, height - hudHeight - BOARD_PIXEL_HEIGHT);
    const hudY = Math.round(freeHeight / 2);
    return {
        width,
        height,
        centerX: Math.round(width / 2),
        centerY: Math.round(height / 2),
        boardX: Math.round((width - BOARD_PIXEL_WIDTH) / 2),
        boardY: hudY + hudHeight,
        boardWidth: BOARD_PIXEL_WIDTH,
        boardHeight: BOARD_PIXEL_HEIGHT,
        hudY,
        hudHeight
    };
}

/** The part of the Scale Manager needed to map game pixels to the page. */
export interface ScaleMetrics {
    canvasBounds: { left: number; top: number };
    displayScale: { x: number; y: number };
}

/** Converts a canvas position (game pixels) to page CSS pixels. */
export function toPagePoint(scale: ScaleMetrics, x: number, y: number): { x: number; y: number } {
    return {
        x: Math.round(scale.canvasBounds.left + x / (scale.displayScale.x || 1)),
        y: Math.round(scale.canvasBounds.top + y / (scale.displayScale.y || 1))
    };
}
