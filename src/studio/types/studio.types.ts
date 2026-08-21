import type { AssetCategory, PhaserAtlasJSON, PhaserRect } from '../../types/animation.types';
export type { AssetCategory } from '../../types/animation.types';

export interface AnimationTrack {
    id: string;
    name: string;
    frames: number[];
    frameRate: number;
    repeat: number;
    yoyo: boolean;
    startFrame: number;
    frameDurations: number[];
}

export interface StudioState {
    imageSrc: string | null;
    imageName: string;
    imageElement: HTMLImageElement | null;
    imageWidth: number;
    imageHeight: number;
    category: AssetCategory;
    textureKey: string;
    targetJsonPath: string | null;
    targetImagePath: string | null;
    frameRects: PhaserRect[] | null;
    
    // Grid slicing parameters
    frameWidth: number;
    frameHeight: number;
    columns: number;
    rows: number;
    spacing: number;
    spacingY?: number;
    margin: number;
    offsetX: number; // Left margin / offset
    offsetY: number; // Top margin / offset
    
    // Viewport & canvas
    zoom: number;
    panX: number;
    panY: number;
    showGrid: boolean;
    showFrameNumbers: boolean;
    showPivot: boolean;
    
    // Alignment & Pivot (normalized 0..1 or pixel)
    pivotX: number;
    pivotY: number;
    targetCellRatio: number;
    
    // Selection
    selectedFrame: number;
    selectedFrames: number[];
    
    // Animations
    animations: AnimationTrack[];
    activeAnimationIndex: number;
    
    // Preview
    isPlaying: boolean;
    currentPreviewFrame: number;
    previewSpeedMultiplier: number;
    previewScale: number;
    previewBackground: 'dark' | 'checker' | 'neon-blue' | 'neon-pink' | 'neon-green';
    
    // Scale comparison
    compareWithPlayer: boolean;
    compareCellSize: number; // default 60 (from game Config)
}

export interface PresetAsset {
    id: string;
    name: string;
    category: AssetCategory;
    url: string;
    defaultFrameWidth?: number;
    defaultFrameHeight?: number;
    defaultFps: number;
    atlas?: PhaserAtlasJSON;
    targetJsonPath?: string;
    targetImagePath?: string;
    defaultAnimations?: {
        name: string;
        frames: number[];
        frameRate: number;
        repeat: number;
        yoyo?: boolean;
        startFrame?: number;
        frameDurations?: number[];
    }[];
}
