import type { StudioState, AnimationTrack, AssetCategory } from '../types/studio.types';
import type { PhaserAtlasJSON, PhaserRect } from '../../types/animation.types';

type StateListener = (state: StudioState) => void;

const initialState: StudioState = {
    imageSrc: null,
    imageName: '',
    imageElement: null,
    imageWidth: 0,
    imageHeight: 0,
    category: 'player',
    textureKey: '',
    targetJsonPath: null,
    targetImagePath: null,
    frameRects: null,
    
    frameWidth: 288,
    frameHeight: 288,
    columns: 4,
    rows: 2,
    spacing: 0,
    margin: 0,
    offsetX: 0,
    offsetY: 0,
    
    zoom: 2,
    panX: 0,
    panY: 0,
    showGrid: true,
    showFrameNumbers: true,
    showPivot: true,
    
    pivotX: 0.5,
    pivotY: 0.5,
    targetCellRatio: 1,
    
    selectedFrame: 0,
    selectedFrames: [],
    
    animations: [
        {
            id: 'anim_1',
            name: 'idle',
            frames: [0, 1, 2, 3, 4, 5, 6, 7],
            frameRate: 6,
            repeat: -1,
            yoyo: false,
            startFrame: 0,
            frameDurations: Array(8).fill(0)
        }
    ],
    activeAnimationIndex: 0,
    
    isPlaying: true,
    currentPreviewFrame: 0,
    previewSpeedMultiplier: 1,
    previewScale: 1,
    previewBackground: 'dark',
    
    compareWithPlayer: true,
    compareCellSize: 60
};

class StudioStore {
    private state: StudioState = { ...initialState };
    private listeners: Set<StateListener> = new Set();

    getState(): StudioState {
        return this.state;
    }

    setState(partial: Partial<StudioState>): void {
        this.state = { ...this.state, ...partial };
        this.notify();
    }

    subscribe(listener: StateListener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        for (const listener of this.listeners) {
            listener(this.state);
        }
    }

    async loadImage(
        src: string,
        name: string,
        category: AssetCategory = 'player',
        suggestedFrameWidth?: number,
        suggestedFrameHeight?: number,
        customAnimations?: AnimationTrack[],
        targetImagePath: string | null = null
    ): Promise<void> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                const width = img.naturalWidth || img.width;
                const height = img.naturalHeight || img.height;
                
                let fw = suggestedFrameWidth || 32;
                let fh = suggestedFrameHeight || 32;

                // Adjust defaults based on image aspect ratio if no suggestion
                if (!suggestedFrameWidth) {
                    if (width % 288 === 0 && height % 288 === 0) {
                        fw = 288;
                        fh = 288;
                    } else if (width % 64 === 0 && height % 64 === 0) {
                        fw = 64;
                        fh = 64;
                    } else if (width % 32 === 0 && height % 32 === 0) {
                        fw = 32;
                        fh = 32;
                    } else if (width % 16 === 0 && height % 16 === 0) {
                        fw = 16;
                        fh = 16;
                    } else {
                        fw = width;
                        fh = height;
                    }
                }

                const cols = Math.max(1, Math.floor(width / fw));
                const rows = Math.max(1, Math.floor(height / fh));
                const totalFrames = cols * rows;
                const frameList = Array.from({ length: totalFrames }, (_, i) => i);

                const anims: AnimationTrack[] = customAnimations && customAnimations.length > 0
                    ? customAnimations
                    : [
                        {
                            id: 'anim_default',
                            name: 'idle',
                            frames: frameList.length > 0 ? frameList : [0],
                            frameRate: 6,
                            repeat: -1,
                            yoyo: false,
                            startFrame: 0,
                            frameDurations: frameList.map(() => 0)
                        }
                    ];

                this.setState({
                    imageSrc: src,
                    imageName: name,
                    imageElement: img,
                    imageWidth: width,
                    imageHeight: height,
                    category,
                    textureKey: cleanTextureKey(name),
                    targetJsonPath: null,
                    targetImagePath,
                    frameRects: null,
                    frameWidth: fw,
                    frameHeight: fh,
                    columns: cols,
                    rows,
                    spacing: 0,
                    margin: 0,
                    offsetX: 0,
                    offsetY: 0,
                    targetCellRatio: 1,
                    selectedFrame: 0,
                    selectedFrames: [],
                    animations: anims,
                    activeAnimationIndex: 0,
                    currentPreviewFrame: 0,
                    panX: 0,
                    panY: 0
                });
                resolve();
            };
            img.onerror = () => reject(new Error(`Failed to load image at ${src}`));
            img.src = src;
        });
    }

    async loadAtlas(
        src: string,
        name: string,
        category: AssetCategory,
        atlas: PhaserAtlasJSON,
        targetJsonPath: string | null = null,
        targetImagePath: string | null = null
    ): Promise<void> {
        const entries = Object.entries(atlas.frames);
        if (entries.length === 0) throw new Error(`${name} no contiene frames.`);
        const frameRects = entries.map(([, data]) => ({ ...data.frame }));
        const frameIndexByName = new Map(entries.map(([key], index) => [key, index]));
        const textureKey = atlas.anims?.[0]?.frames[0]?.key ?? cleanTextureKey(name);
        const animations: AnimationTrack[] = (atlas.anims ?? []).map((animation, index) => ({
            id: `anim_${index + 1}`,
            name: animation.key.includes(':') ? animation.key.slice(animation.key.indexOf(':') + 1) : animation.key,
            frames: animation.frames.map(({ frame }) => frameIndexByName.get(String(frame)) ?? 0),
            frameRate: animation.frameRate,
            repeat: animation.repeat ?? 0,
            yoyo: Boolean(animation.yoyo),
            startFrame: 0,
            frameDurations: animation.frames.map(({ duration }) => duration ?? 0)
        }));
        const first = frameRects[0];
        const pivot = entries[0][1].pivot ?? { x: 0.5, y: 0.5 };
        await this.loadImage(
            src,
            name,
            category,
            first.w,
            first.h,
            animations.length ? animations : undefined
        );
        const uniqueX = new Set(frameRects.map(({ x }) => x));
        const uniqueY = new Set(frameRects.map(({ y }) => y));
        this.setState({
            textureKey,
            targetJsonPath,
            targetImagePath,
            frameRects,
            columns: uniqueX.size,
            rows: uniqueY.size,
            pivotX: pivot.x,
            pivotY: pivot.y,
            targetCellRatio: atlas.meta.lucysMaze?.targetCellRatio ?? 1
        });
    }

    updateGrid(
        frameWidth: number,
        frameHeight: number,
        spacing: number = 0,
        offsetX: number = 0,
        offsetY: number = 0,
        explicitCols?: number,
        explicitRows?: number
    ): void {
        const fw = Math.max(1, frameWidth);
        const fh = Math.max(1, frameHeight);
        const imgW = this.state.imageWidth;
        const imgH = this.state.imageHeight;
        
        const cols = explicitCols && explicitCols > 0
            ? explicitCols
            : Math.max(1, Math.round((imgW - offsetX + spacing) / (fw + spacing)));
        const rows = explicitRows && explicitRows > 0
            ? explicitRows
            : Math.max(1, Math.round((imgH - offsetY + spacing) / (fh + spacing)));

        this.setState({
            frameWidth: fw,
            frameHeight: fh,
            spacing,
            margin: offsetX,
            offsetX,
            offsetY,
            columns: cols,
            rows,
            frameRects: null
        });
    }

    addAnimation(name: string = 'anim'): void {
        const newTrack: AnimationTrack = {
            id: `anim_${Date.now()}`,
            name,
            frames: [0],
            frameRate: 6,
            repeat: -1,
            yoyo: false,
            startFrame: 0,
            frameDurations: [0]
        };
        const nextAnimations = [...this.state.animations, newTrack];
        this.setState({
            animations: nextAnimations,
            activeAnimationIndex: nextAnimations.length - 1
        });
    }

    removeAnimation(index: number): void {
        if (this.state.animations.length <= 1) return;
        const nextAnimations = this.state.animations.filter((_, i) => i !== index);
        const nextIndex = Math.min(this.state.activeAnimationIndex, nextAnimations.length - 1);
        this.setState({
            animations: nextAnimations,
            activeAnimationIndex: nextIndex
        });
    }

    updateActiveAnimation(partial: Partial<AnimationTrack>): void {
        const index = this.state.activeAnimationIndex;
        if (index < 0 || index >= this.state.animations.length) return;
        
        const nextAnimations = [...this.state.animations];
        nextAnimations[index] = { ...nextAnimations[index], ...partial };
        this.setState({ animations: nextAnimations });
    }

    addFrameToActive(frameIndex: number): void {
        const index = this.state.activeAnimationIndex;
        if (index < 0 || index >= this.state.animations.length) return;

        const current = this.state.animations[index];
        const nextFrames = [...current.frames, frameIndex];
        this.updateActiveAnimation({ frames: nextFrames, frameDurations: [...current.frameDurations, 0] });
    }

    removeFrameFromActive(positionIndex: number): void {
        const index = this.state.activeAnimationIndex;
        if (index < 0 || index >= this.state.animations.length) return;

        const current = this.state.animations[index];
        if (current.frames.length <= 1) return;
        const nextFrames = current.frames.filter((_, i) => i !== positionIndex);
        const frameDurations = current.frameDurations.filter((_, i) => i !== positionIndex);
        this.updateActiveAnimation({
            frames: nextFrames,
            frameDurations,
            startFrame: Math.min(current.startFrame, nextFrames.length - 1)
        });
    }

    setFramesForActive(frames: number[]): void {
        this.updateActiveAnimation({ frames, frameDurations: frames.map(() => 0) });
    }
}

export const studioStore = new StudioStore();

export function getStudioFrameRect(state: StudioState, frameIndex: number): PhaserRect {
    const custom = state.frameRects?.[frameIndex];
    if (custom) return custom;
    const col = frameIndex % state.columns;
    const row = Math.floor(frameIndex / state.columns);
    return {
        x: (state.offsetX ?? state.margin ?? 0) + col * (state.frameWidth + state.spacing),
        y: (state.offsetY ?? 0) + row * (state.frameHeight + (state.spacingY ?? state.spacing)),
        w: state.frameWidth,
        h: state.frameHeight
    };
}

function cleanTextureKey(name: string): string {
    return name.replace(/\.[^/.]+$/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}
