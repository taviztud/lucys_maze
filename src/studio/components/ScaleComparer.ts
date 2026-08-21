import { getStudioFrameRect, studioStore } from '../state/studioState';
import type { StudioState } from '../types/studio.types';

export class ScaleComparer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private playerRefImg: HTMLImageElement | null = null;

    constructor() {
        this.canvas = document.getElementById('compareCanvas') as HTMLCanvasElement;
        const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('ScaleComparer: 2D context not available.');
        this.ctx = ctx;

        this.loadPlayerReference();
        studioStore.subscribe(this.render.bind(this));
    }

    private loadPlayerReference(): void {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            this.playerRefImg = img;
            this.render(studioStore.getState());
        };
        // Use normalized player idle or fallback
        img.src = '/lucy_stand.png';
    }

    public render(state: StudioState): void {
        const { imageElement, animations, activeAnimationIndex, currentPreviewFrame } = state;

        this.canvas.width = 300;
        this.canvas.height = 90;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        this.ctx.save();
        this.ctx.imageSmoothingEnabled = false;

        const cellSize = state.compareCellSize;
        const baselineY = 75;

        // Draw Cell 1 (Lucy Player Reference)
        const cell1X = 20;
        const cell1Y = baselineY - cellSize;
        this.ctx.strokeStyle = 'rgba(76, 201, 240, 0.4)';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(cell1X, cell1Y, cellSize, cellSize);

        // Label Cell 1
        this.ctx.fillStyle = '#8b949e';
        this.ctx.font = '9px monospace';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("Lucy (Player)", cell1X + cellSize / 2, baselineY + 12);

        // Draw Player Sprite inside Cell 1
        if (this.playerRefImg) {
            const pW = this.playerRefImg.naturalWidth || this.playerRefImg.width;
            const pH = this.playerRefImg.naturalHeight || this.playerRefImg.height;
            const pScale = Math.min(cellSize / pW, cellSize / pH) * 0.85;
            const drawW = pW * pScale;
            const drawH = pH * pScale;
            const drawX = cell1X + (cellSize - drawW) / 2;
            const drawY = baselineY - drawH;
            this.ctx.drawImage(this.playerRefImg, drawX, drawY, drawW, drawH);
        }

        // Draw Cell 2 (Current Active Asset inside Cell)
        const cell2X = 110;
        const cell2Y = baselineY - cellSize;
        this.ctx.strokeStyle = 'rgba(244, 211, 94, 0.5)';
        this.ctx.strokeRect(cell2X, cell2Y, cellSize, cellSize);

        // Label Cell 2
        this.ctx.fillStyle = '#f4d35e';
        this.ctx.fillText("Sprite Actual", cell2X + cellSize / 2, baselineY + 12);

        // Draw Current Asset inside Cell 2
        if (imageElement && animations[activeAnimationIndex]) {
            const currentAnim = animations[activeAnimationIndex];
            const frameIndex = currentAnim.frames.length > 0
                ? currentAnim.frames[currentPreviewFrame % currentAnim.frames.length]
                : 0;

            const frame = getStudioFrameRect(state, frameIndex);

            // Scale asset to fit cell proportionally like Phaser's calculateSpriteScale
            const assetScale = Math.min(cellSize / frame.w, cellSize / frame.h) * state.targetCellRatio;
            const drawW = frame.w * assetScale;
            const drawH = frame.h * assetScale;
            const drawX = cell2X + (cellSize - drawW) / 2;
            const drawY = baselineY - drawH;

            this.ctx.drawImage(
                imageElement,
                frame.x, frame.y, frame.w, frame.h,
                drawX, drawY, drawW, drawH
            );
        }

        // Draw Cell 3 (Wall / Maze Tile comparison)
        const cell3X = 200;
        const cell3Y = baselineY - cellSize;
        this.ctx.strokeStyle = 'rgba(247, 37, 133, 0.4)';
        this.ctx.strokeRect(cell3X, cell3Y, cellSize, cellSize);
        this.ctx.fillStyle = 'rgba(247, 37, 133, 0.1)';
        this.ctx.fillRect(cell3X, cell3Y, cellSize, cellSize);

        this.ctx.fillStyle = '#8b949e';
        this.ctx.fillText("Muro 60x60", cell3X + cellSize / 2, baselineY + 12);

        // Baseline Floor Line
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.beginPath();
        this.ctx.moveTo(10, baselineY);
        this.ctx.lineTo(280, baselineY);
        this.ctx.stroke();

        this.ctx.restore();
    }
}
