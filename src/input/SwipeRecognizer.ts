import type { Direction } from '../types/game.types';

export interface SwipeConfig {
    /** Distance on the dominant axis that turns a drag into a swipe. */
    threshold: number;
    /** How many times larger the dominant axis must be than the other one. */
    axisDominance: number;
}

interface PointerTrack {
    anchorX: number;
    anchorY: number;
    lastDirection: Direction | null;
}

/**
 * Turns pointer samples into grid directions while the finger is still down.
 * Each pointer is tracked on its own, so two thumbs can alternate, and the
 * anchor moves to the recognition point so turns can be chained without
 * lifting. Units are whatever the caller feeds in (game pixels in practice).
 */
export class SwipeRecognizer {
    private readonly tracks = new Map<number, PointerTrack>();

    constructor(private config: SwipeConfig) {}

    setThreshold(threshold: number): void {
        this.config = { ...this.config, threshold };
    }

    down(pointerId: number, x: number, y: number): void {
        this.tracks.set(pointerId, { anchorX: x, anchorY: y, lastDirection: null });
    }

    /** Returns a direction the first time this contact commits to it. */
    move(pointerId: number, x: number, y: number): Direction | null {
        const track = this.tracks.get(pointerId);
        if (!track) return null;

        const deltaX = x - track.anchorX;
        const deltaY = y - track.anchorY;
        const absX = Math.abs(deltaX);
        const absY = Math.abs(deltaY);
        const major = Math.max(absX, absY);
        const minor = Math.min(absX, absY);
        if (major < this.config.threshold) return null;

        if (major < minor * this.config.axisDominance) {
            // Ambiguous diagonal: keep waiting, but drop the stale offset once
            // it is long enough to bias whatever the finger does next.
            if (major >= this.config.threshold * 2) {
                track.anchorX = x;
                track.anchorY = y;
            }
            return null;
        }

        const direction: Direction = absX > absY
            ? { dx: Math.sign(deltaX), dy: 0 }
            : { dx: 0, dy: Math.sign(deltaY) };
        track.anchorX = x;
        track.anchorY = y;

        const last = track.lastDirection;
        if (last && last.dx === direction.dx && last.dy === direction.dy) return null;
        track.lastDirection = direction;
        return direction;
    }

    up(pointerId: number): void {
        this.tracks.delete(pointerId);
    }

    reset(): void {
        this.tracks.clear();
    }

    getActivePointerCount(): number {
        return this.tracks.size;
    }
}
