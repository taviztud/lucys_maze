import { getStudioFrameRect, studioStore } from '../state/studioState';
import type { StudioState } from '../types/studio.types';
import { showToast } from '../utils/phaserExport';

export class CanvasGrid {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private container: HTMLElement;
    private isDragging: boolean = false;
    private isSpacePressed: boolean = false;
    private isBoxSelecting: boolean = false;
    private boxStartCanvasX: number = 0;
    private boxStartCanvasY: number = 0;
    private boxCurrentCanvasX: number = 0;
    private boxCurrentCanvasY: number = 0;

    private startX: number = 0;
    private startY: number = 0;
    private hoveredFrame: number = -1;

    constructor(canvasId: string, containerId: string) {
        const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        const container = document.getElementById(containerId) as HTMLElement;
        if (!canvas || !container) {
            throw new Error(`CanvasGrid: Elements ${canvasId} or ${containerId} not found.`);
        }
        this.canvas = canvas;
        this.container = container;
        const ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('CanvasGrid: 2D context not available.');
        this.ctx = ctx;

        this.initEvents();
        studioStore.subscribe(this.render.bind(this));
    }

    private initEvents(): void {
        window.addEventListener('keydown', (e: KeyboardEvent) => {
            if (e.code === 'Space' && (document.activeElement?.tagName !== 'INPUT')) {
                this.isSpacePressed = true;
                this.container.style.cursor = 'grab';
            }
        });

        window.addEventListener('keyup', (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                this.isSpacePressed = false;
                if (!this.isDragging && !this.isBoxSelecting) this.container.style.cursor = 'crosshair';
            }
        });

        // Mouse Wheel Zoom
        this.container.addEventListener('wheel', (e: WheelEvent) => {
            e.preventDefault();
            const state = studioStore.getState();
            const delta = e.deltaY < 0 ? 0.25 : -0.25;
            const newZoom = Math.min(16, Math.max(0.5, state.zoom + delta));
            studioStore.setState({ zoom: newZoom });
        }, { passive: false });

        // Pan with Mouse Drag OR Box Select (with Shift key)
        this.canvas.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button === 1 || (e.button === 0 && this.isSpacePressed)) {
                this.isDragging = true;
                this.startX = e.clientX;
                this.startY = e.clientY;
                this.container.style.cursor = 'grabbing';
            } else if (e.button === 0 && e.shiftKey) {
                // Interactive Box Selection
                const state = studioStore.getState();
                const rect = this.canvas.getBoundingClientRect();
                this.isBoxSelecting = true;
                this.boxStartCanvasX = Math.round((e.clientX - rect.left) / state.zoom);
                this.boxStartCanvasY = Math.round((e.clientY - rect.top) / state.zoom);
                this.boxCurrentCanvasX = this.boxStartCanvasX;
                this.boxCurrentCanvasY = this.boxStartCanvasY;
            }
        });

        window.addEventListener('mousemove', (e: MouseEvent) => {
            if (this.isDragging) {
                const dx = e.clientX - this.startX;
                const dy = e.clientY - this.startY;
                this.startX = e.clientX;
                this.startY = e.clientY;
                const state = studioStore.getState();
                studioStore.setState({
                    panX: state.panX + dx,
                    panY: state.panY + dy
                });
            } else if (this.isBoxSelecting) {
                const state = studioStore.getState();
                const rect = this.canvas.getBoundingClientRect();
                this.boxCurrentCanvasX = Math.round((e.clientX - rect.left) / state.zoom);
                this.boxCurrentCanvasY = Math.round((e.clientY - rect.top) / state.zoom);
                this.render(state);
            } else {
                this.updateHover(e);
            }
        });

        window.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                this.container.style.cursor = 'crosshair';
            } else if (this.isBoxSelecting) {
                this.isBoxSelecting = false;
                this.finishBoxSelection();
            }
        });

        // Click on frame cell to add frame or select
        this.canvas.addEventListener('click', (e: MouseEvent) => {
            if (this.isDragging || e.shiftKey) return;
            const frameIndex = this.getFrameIndexAtMouse(e);
            if (frameIndex >= 0) {
                studioStore.setState({ selectedFrame: frameIndex });
                studioStore.addFrameToActive(frameIndex);
            }
        });
    }

    private finishBoxSelection(): void {
        const minX = Math.min(this.boxStartCanvasX, this.boxCurrentCanvasX);
        const minY = Math.min(this.boxStartCanvasY, this.boxCurrentCanvasY);
        const maxX = Math.max(this.boxStartCanvasX, this.boxCurrentCanvasX);
        const maxY = Math.max(this.boxStartCanvasY, this.boxCurrentCanvasY);

        const w = maxX - minX;
        const h = maxY - minY;

        if (w >= 4 && h >= 4) {
            studioStore.updateGrid(w, h, 0, minX);
            showToast(`Recorte visual fijado: ${w}x${h} px`, 'success');
        }
        this.render(studioStore.getState());
    }

    private updateHover(e: MouseEvent): void {
        const frameIndex = this.getFrameIndexAtMouse(e);
        if (frameIndex !== this.hoveredFrame) {
            this.hoveredFrame = frameIndex;
            this.render(studioStore.getState());
        }
    }

    private getFrameIndexAtMouse(e: MouseEvent): number {
        const state = studioStore.getState();
        if (!state.imageElement) return -1;

        const rect = this.canvas.getBoundingClientRect();
        const mouseCanvasX = (e.clientX - rect.left) / state.zoom;
        const mouseCanvasY = (e.clientY - rect.top) / state.zoom;

        const totalFrames = state.frameRects?.length ?? state.columns * state.rows;
        for (let index = 0; index < totalFrames; index++) {
            const frame = getStudioFrameRect(state, index);
            if (mouseCanvasX >= frame.x && mouseCanvasX < frame.x + frame.w
                && mouseCanvasY >= frame.y && mouseCanvasY < frame.y + frame.h) return index;
        }
        return -1;
    }

    public render(state: StudioState): void {
        const {
            imageElement,
            imageWidth,
            imageHeight,
            zoom,
            panX,
            panY,
            showGrid,
            showFrameNumbers,
            showPivot,
            pivotX,
            pivotY,
            selectedFrame,
            animations,
            activeAnimationIndex,
            currentPreviewFrame
        } = state;

        if (!imageElement || imageWidth === 0 || imageHeight === 0) {
            this.canvas.width = 300;
            this.canvas.height = 200;
            this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.ctx.fillStyle = '#8b949e';
            this.ctx.font = '13px sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Selecciona o arrastra una imagen PNG', 150, 100);
            return;
        }

        // Apply canvas dimensions with zoom
        this.canvas.width = imageWidth * zoom;
        this.canvas.height = imageHeight * zoom;
        this.canvas.style.transform = `translate(${panX}px, ${panY}px)`;

        this.ctx.save();
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.scale(zoom, zoom);

        // Draw source image
        this.ctx.drawImage(imageElement, 0, 0);

        // Current active sequence playing frame
        const activeAnim = animations[activeAnimationIndex];
        const activePlayingFrame = activeAnim && activeAnim.frames.length > 0
            ? activeAnim.frames[currentPreviewFrame % activeAnim.frames.length]
            : -1;

        // Draw grid overlay
        const totalFrames = state.frameRects?.length ?? state.columns * state.rows;
        for (let index = 0; index < totalFrames; index++) {
                const frame = getStudioFrameRect(state, index);
                const cellX = frame.x;
                const cellY = frame.y;
                const frameWidth = frame.w;
                const frameHeight = frame.h;

                const isHovered = index === this.hoveredFrame;
                const isSelected = index === selectedFrame;
                const isPlayingFrame = index === activePlayingFrame;

                if (showGrid) {
                    this.ctx.lineWidth = 1 / zoom;
                    this.ctx.strokeStyle = 'rgba(76, 201, 240, 0.4)';
                    this.ctx.strokeRect(cellX, cellY, frameWidth, frameHeight);
                }

                // Highlight hovered or selected frame
                if (isPlayingFrame) {
                    this.ctx.fillStyle = 'rgba(247, 37, 133, 0.25)';
                    this.ctx.fillRect(cellX, cellY, frameWidth, frameHeight);
                    this.ctx.lineWidth = 2 / zoom;
                    this.ctx.strokeStyle = '#f72585';
                    this.ctx.strokeRect(cellX, cellY, frameWidth, frameHeight);
                } else if (isHovered) {
                    this.ctx.fillStyle = 'rgba(76, 201, 240, 0.15)';
                    this.ctx.fillRect(cellX, cellY, frameWidth, frameHeight);
                }

                if (isSelected && !isPlayingFrame) {
                    this.ctx.lineWidth = 2 / zoom;
                    this.ctx.strokeStyle = '#4ad66d';
                    this.ctx.strokeRect(cellX, cellY, frameWidth, frameHeight);
                }

                // Draw frame number
                if (showFrameNumbers) {
                    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    this.ctx.fillRect(cellX + 2, cellY + 2, 18, 12);
                    this.ctx.fillStyle = '#ffffff';
                    this.ctx.font = '9px monospace';
                    this.ctx.textAlign = 'left';
                    this.ctx.textBaseline = 'top';
                    this.ctx.fillText(`${index}`, cellX + 4, cellY + 3);
                }

                // Draw Pivot Marker
                if (showPivot) {
                    const px = cellX + frameWidth * pivotX;
                    const py = cellY + frameHeight * pivotY;
                    this.ctx.strokeStyle = '#f4d35e';
                    this.ctx.lineWidth = 1 / zoom;
                    this.ctx.beginPath();
                    this.ctx.moveTo(px - 3, py);
                    this.ctx.lineTo(px + 3, py);
                    this.ctx.moveTo(px, py - 3);
                    this.ctx.lineTo(px, py + 3);
                    this.ctx.stroke();
                }
        }

        // Draw Interactive Box Selection overlay if active
        if (this.isBoxSelecting) {
            const minX = Math.min(this.boxStartCanvasX, this.boxCurrentCanvasX);
            const minY = Math.min(this.boxStartCanvasY, this.boxCurrentCanvasY);
            const w = Math.abs(this.boxCurrentCanvasX - this.boxStartCanvasX);
            const h = Math.abs(this.boxCurrentCanvasY - this.boxStartCanvasY);

            this.ctx.fillStyle = 'rgba(244, 211, 94, 0.2)';
            this.ctx.fillRect(minX, minY, w, h);
            this.ctx.strokeStyle = '#f4d35e';
            this.ctx.lineWidth = 2 / zoom;
            this.ctx.strokeRect(minX, minY, w, h);

            // Display size badge
            this.ctx.fillStyle = '#f4d35e';
            this.ctx.fillRect(minX, Math.max(0, minY - 14), 60, 12);
            this.ctx.fillStyle = '#0b0c10';
            this.ctx.font = '9px monospace';
            this.ctx.textAlign = 'left';
            this.ctx.fillText(`${w}x${h} px`, minX + 2, Math.max(9, minY - 4));
        }

        this.ctx.restore();
    }
}
