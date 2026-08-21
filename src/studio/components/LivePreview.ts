import { getStudioFrameRect, studioStore } from '../state/studioState';
import type { AnimationTrack, StudioState } from '../types/studio.types';

export class LivePreview {
    private canvas = document.getElementById('previewCanvas') as HTMLCanvasElement;
    private wrapper = document.getElementById('previewWrapper') as HTMLElement;
    private btnPlayPause = document.getElementById('btnPlayPause') as HTMLButtonElement;
    private btnStepBack = document.getElementById('btnStepBack') as HTMLButtonElement;
    private btnStepForward = document.getElementById('btnStepForward') as HTMLButtonElement;
    private selectBg = document.getElementById('selectPreviewBg') as HTMLSelectElement;
    private labelFps = document.getElementById('labelFpsCounter') as HTMLElement;
    private ctx: CanvasRenderingContext2D;
    private lastFrameTime = 0;
    private animFrameId: number | null = null;
    private frameSequenceIndex = 0;
    private direction: 1 | -1 = 1;
    private completedRepeats = 0;
    private identity = '';

    constructor() {
        const context = this.canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('LivePreview: 2D context not available.');
        this.ctx = context;
        this.initEvents();
        this.startLoop();
        studioStore.subscribe((state) => this.onStateChange(state));
    }

    private initEvents(): void {
        this.btnPlayPause.addEventListener('click', () => {
            const isPlaying = !studioStore.getState().isPlaying;
            if (isPlaying && this.isAtCompletedEnd()) this.resetPlayback(studioStore.getState());
            studioStore.setState({ isPlaying });
            this.syncButton(isPlaying);
        });
        this.btnStepForward.addEventListener('click', () => this.step(1));
        this.btnStepBack.addEventListener('click', () => this.step(-1));
        this.selectBg.addEventListener('change', () => {
            const previewBackground = this.selectBg.value as StudioState['previewBackground'];
            this.wrapper.className = `preview-canvas-wrapper bg-${previewBackground}`;
            studioStore.setState({ previewBackground });
        });
    }

    private step(delta: number): void {
        const animation = this.getAnimation();
        if (!animation?.frames.length) return;
        this.frameSequenceIndex = modulo(this.frameSequenceIndex + delta, animation.frames.length);
        studioStore.setState({ isPlaying: false, currentPreviewFrame: this.frameSequenceIndex });
        this.syncButton(false);
        this.renderFrame();
    }

    private startLoop(): void {
        const tick = (now: number) => {
            const state = studioStore.getState();
            const animation = state.animations[state.activeAnimationIndex];
            if (state.isPlaying && animation?.frames.length) {
                const customDuration = animation.frameDurations[this.frameSequenceIndex] ?? 0;
                const duration = customDuration > 0
                    ? customDuration
                    : 1000 / Math.max(1, animation.frameRate * state.previewSpeedMultiplier);
                if (now - this.lastFrameTime >= duration) {
                    this.lastFrameTime = now;
                    this.advanceFrame(animation);
                    this.renderFrame();
                }
            }
            this.animFrameId = requestAnimationFrame(tick);
        };
        this.animFrameId = requestAnimationFrame(tick);
    }

    private advanceFrame(animation: AnimationTrack): void {
        const last = animation.frames.length - 1;
        if (last <= 0) return;
        if (animation.yoyo) {
            if (this.direction === 1 && this.frameSequenceIndex >= last) {
                this.direction = -1;
                this.frameSequenceIndex = Math.max(0, last - 1);
            } else if (this.direction === -1 && this.frameSequenceIndex <= 0) {
                if (!this.beginNextRepeat(animation)) return;
                this.direction = 1;
                this.frameSequenceIndex = Math.min(last, 1);
            } else {
                this.frameSequenceIndex += this.direction;
            }
        } else if (this.frameSequenceIndex >= last) {
            if (!this.beginNextRepeat(animation)) return;
            this.frameSequenceIndex = 0;
        } else {
            this.frameSequenceIndex++;
        }
        studioStore.setState({ currentPreviewFrame: this.frameSequenceIndex });
    }

    private beginNextRepeat(animation: AnimationTrack): boolean {
        if (animation.repeat !== -1 && this.completedRepeats >= animation.repeat) {
            studioStore.setState({ isPlaying: false });
            this.syncButton(false);
            return false;
        }
        this.completedRepeats++;
        return true;
    }

    private onStateChange(state: StudioState): void {
        const animation = state.animations[state.activeAnimationIndex];
        const nextIdentity = `${state.imageSrc}|${animation?.id ?? ''}`;
        if (nextIdentity !== this.identity) {
            this.identity = nextIdentity;
            this.resetPlayback(state);
        }
        this.frameSequenceIndex = Math.min(
            this.frameSequenceIndex,
            Math.max(0, (animation?.frames.length ?? 1) - 1)
        );
        this.labelFps.textContent = animation ? `${animation.frameRate} FPS` : '0 FPS';
        this.syncButton(state.isPlaying);
        this.renderFrame();
    }

    private resetPlayback(state: StudioState): void {
        const animation = state.animations[state.activeAnimationIndex];
        this.frameSequenceIndex = Math.min(animation?.startFrame ?? 0, Math.max(0, (animation?.frames.length ?? 1) - 1));
        this.direction = 1;
        this.completedRepeats = 0;
        this.lastFrameTime = performance.now();
        if (state.currentPreviewFrame !== this.frameSequenceIndex) {
            studioStore.setState({ currentPreviewFrame: this.frameSequenceIndex });
        }
    }

    private renderFrame(): void {
        const state = studioStore.getState();
        const animation = state.animations[state.activeAnimationIndex];
        this.canvas.width = 128;
        this.canvas.height = 128;
        this.ctx.clearRect(0, 0, 128, 128);
        if (!state.imageElement || !animation?.frames.length) return;
        const frameIndex = animation.frames[this.frameSequenceIndex % animation.frames.length];
        const frame = getStudioFrameRect(state, frameIndex);
        const scale = Math.min(128 / frame.w, 128 / frame.h, 4) * state.previewScale;
        const width = frame.w * scale;
        const height = frame.h * scale;
        this.ctx.save();
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(
            state.imageElement,
            frame.x, frame.y, frame.w, frame.h,
            (128 - width) / 2, (128 - height) / 2, width, height
        );
        this.ctx.restore();
    }

    private getAnimation(): AnimationTrack | undefined {
        const state = studioStore.getState();
        return state.animations[state.activeAnimationIndex];
    }

    private isAtCompletedEnd(): boolean {
        const animation = this.getAnimation();
        return Boolean(animation && animation.repeat !== -1 && this.completedRepeats >= animation.repeat);
    }

    private syncButton(isPlaying: boolean): void {
        this.btnPlayPause.textContent = isPlaying ? 'Pausar' : 'Reproducir';
    }

    destroy(): void {
        if (this.animFrameId !== null) cancelAnimationFrame(this.animFrameId);
    }
}

function modulo(value: number, length: number): number {
    return ((value % length) + length) % length;
}
