import { describe, expect, it } from 'vitest';
import { SwipeRecognizer } from '../src/input/SwipeRecognizer';

const create = (): SwipeRecognizer => new SwipeRecognizer({ threshold: 24, axisDominance: 1.5 });

describe('SwipeRecognizer', () => {
    it('ignores movement below the threshold', () => {
        const swipes = create();
        swipes.down(1, 100, 100);
        expect(swipes.move(1, 120, 100)).toBeNull();
    });

    it('recognises each direction while the pointer is still down', () => {
        const cases = [
            { to: [130, 100], expected: { dx: 1, dy: 0 } },
            { to: [70, 100], expected: { dx: -1, dy: 0 } },
            { to: [100, 130], expected: { dx: 0, dy: 1 } },
            { to: [100, 70], expected: { dx: 0, dy: -1 } }
        ];
        for (const { to, expected } of cases) {
            const swipes = create();
            swipes.down(1, 100, 100);
            expect(swipes.move(1, to[0], to[1])).toEqual(expected);
        }
    });

    it('does nothing for a pointer that never went down', () => {
        expect(create().move(1, 500, 500)).toBeNull();
    });

    it('waits on an ambiguous diagonal instead of guessing', () => {
        const swipes = create();
        swipes.down(1, 100, 100);
        expect(swipes.move(1, 130, 128)).toBeNull();
    });

    it('re-anchors after a long diagonal so the next clear move still counts', () => {
        const swipes = create();
        swipes.down(1, 100, 100);
        expect(swipes.move(1, 160, 158)).toBeNull();
        expect(swipes.move(1, 190, 160)).toEqual({ dx: 1, dy: 0 });
    });

    it('chains a turn without lifting the finger', () => {
        const swipes = create();
        swipes.down(1, 100, 100);
        expect(swipes.move(1, 130, 100)).toEqual({ dx: 1, dy: 0 });
        expect(swipes.move(1, 132, 70)).toEqual({ dx: 0, dy: -1 });
    });

    it('reports a direction once per contact while the finger keeps going the same way', () => {
        const swipes = create();
        swipes.down(1, 100, 100);
        expect(swipes.move(1, 130, 100)).toEqual({ dx: 1, dy: 0 });
        expect(swipes.move(1, 160, 100)).toBeNull();
        expect(swipes.move(1, 190, 100)).toBeNull();
    });

    it('reports the same direction again after the finger is lifted', () => {
        const swipes = create();
        swipes.down(1, 100, 100);
        expect(swipes.move(1, 130, 100)).toEqual({ dx: 1, dy: 0 });
        swipes.up(1);
        swipes.down(1, 100, 100);
        expect(swipes.move(1, 130, 100)).toEqual({ dx: 1, dy: 0 });
    });

    it('tracks two pointers independently', () => {
        const swipes = create();
        swipes.down(1, 100, 100);
        swipes.down(2, 300, 300);
        expect(swipes.getActivePointerCount()).toBe(2);
        expect(swipes.move(1, 130, 100)).toEqual({ dx: 1, dy: 0 });
        expect(swipes.move(2, 300, 270)).toEqual({ dx: 0, dy: -1 });
        swipes.up(1);
        expect(swipes.move(1, 200, 100)).toBeNull();
        expect(swipes.getActivePointerCount()).toBe(1);
    });

    it('applies a new threshold to later moves', () => {
        const swipes = create();
        swipes.setThreshold(60);
        swipes.down(1, 100, 100);
        expect(swipes.move(1, 140, 100)).toBeNull();
        expect(swipes.move(1, 165, 100)).toEqual({ dx: 1, dy: 0 });
    });
});
