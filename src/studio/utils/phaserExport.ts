import type { StudioState, AnimationTrack } from '../types/studio.types';
import type { PhaserAtlasJSON, PhaserAnimationJSON, PhaserFrameData } from '../../types/animation.types';
import { getStudioFrameRect } from '../state/studioState';

export function createPhaserAtlasJson(state: StudioState): PhaserAtlasJSON {
    const frames: Record<string, PhaserFrameData> = {};
    const totalFrames = state.frameRects?.length ?? state.columns * state.rows;
    for (let index = 0; index < totalFrames; index++) {
        const rect = getStudioFrameRect(state, index);
        const frameKey = `frame_${index.toString().padStart(2, '0')}`;
        frames[frameKey] = {
            frame: { ...rect },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: rect.w, h: rect.h },
            sourceSize: { w: rect.w, h: rect.h },
            pivot: { x: state.pivotX, y: state.pivotY }
        };
    }

    return {
        frames,
        meta: {
            app: 'lucys-maze sprite studio',
            version: '2.0',
            image: `${stripExtension(state.imageName)}.png`,
            format: 'RGBA8888',
            size: { w: state.imageWidth, h: state.imageHeight },
            scale: '1',
            lucysMaze: { targetCellRatio: state.targetCellRatio }
        }
    };
}

export function createPhaserAnimationJson(state: StudioState): PhaserAnimationJSON[] {
    const textureKey = state.textureKey || cleanKey(state.imageName);
    return state.animations.map((animation: AnimationTrack) => ({
        key: `${textureKey}:${animation.name}`,
        type: 'frame',
        frames: animation.frames.map((frameIndex, sequenceIndex) => ({
            key: textureKey,
            frame: `frame_${frameIndex.toString().padStart(2, '0')}`,
            ...(animation.frameDurations[sequenceIndex] > 0
                ? { duration: animation.frameDurations[sequenceIndex] }
                : {})
        })),
        frameRate: animation.frameRate,
        repeat: animation.repeat,
        yoyo: Boolean(animation.yoyo),
        startFrame: animation.startFrame
    }));
}

export function createStudioPayload(state: StudioState): PhaserAtlasJSON {
    const atlas = createPhaserAtlasJson(state);
    return { ...atlas, anims: createPhaserAnimationJson(state) };
}

export function validateStudioState(state: StudioState): string[] {
    const errors: string[] = [];
    if (!state.imageElement || state.imageWidth <= 0 || state.imageHeight <= 0) {
        errors.push('No hay una imagen valida cargada.');
        return errors;
    }
    const totalFrames = state.frameRects?.length ?? state.columns * state.rows;
    for (let index = 0; index < totalFrames; index++) {
        const frame = getStudioFrameRect(state, index);
        if (frame.w <= 0 || frame.h <= 0 || frame.x < 0 || frame.y < 0
            || frame.x + frame.w > state.imageWidth || frame.y + frame.h > state.imageHeight) {
            errors.push(`El frame ${index} queda fuera del PNG.`);
        }
    }
    state.animations.forEach((animation) => {
        if (!animation.name.trim()) errors.push('Toda animacion necesita nombre.');
        if (animation.frames.length === 0) errors.push(`${animation.name}: no tiene frames.`);
        if (animation.frameRate <= 0) errors.push(`${animation.name}: FPS debe ser mayor que cero.`);
        if (animation.repeat < -1) errors.push(`${animation.name}: repeticion invalida.`);
        if (animation.startFrame < 0 || animation.startFrame >= Math.max(1, animation.frames.length)) {
            errors.push(`${animation.name}: frame inicial fuera de rango.`);
        }
        animation.frames.forEach((frame) => {
            if (!Number.isInteger(frame) || frame < 0 || frame >= totalFrames) {
                errors.push(`${animation.name}: referencia el frame inexistente ${frame}.`);
            }
        });
    });
    return [...new Set(errors)];
}

export function copyToClipboard(text: string): Promise<void> {
    return navigator.clipboard.writeText(text);
}

export function downloadJsonFile(filename: string, data: object): void {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

export async function saveJsonToProject(targetPath: string, data: object): Promise<{ success: boolean; message: string }> {
    return postAsset('/api/assets/save-json', { targetPath, content: data }, targetPath);
}

export async function saveSheetToProject(targetPath: string, state: StudioState): Promise<{ success: boolean; message: string }> {
    if (!state.imageElement) return { success: false, message: 'No hay imagen activa.' };
    const canvas = document.createElement('canvas');
    canvas.width = state.imageWidth;
    canvas.height = state.imageHeight;
    const context = canvas.getContext('2d');
    if (!context) return { success: false, message: 'No se pudo serializar el PNG.' };
    context.drawImage(state.imageElement, 0, 0);
    return postAsset('/api/assets/save-sheet', { targetPath, base64Data: canvas.toDataURL('image/png') }, targetPath);
}

async function postAsset(endpoint: string, body: object, targetPath: string): Promise<{ success: boolean; message: string }> {
    try {
        const response = await fetch(new URL(`..${endpoint}`, window.location.href), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        const payload = await response.json().catch(() => ({}));
        return response.ok
            ? { success: true, message: `Guardado en ${payload.savedPath || targetPath}` }
            : { success: false, message: payload.error || 'Error al guardar archivo' };
    } catch (error) {
        return { success: false, message: error instanceof Error ? error.message : String(error) };
    }
}

export function showToast(message: string, type: 'success' | 'error' = 'success'): void {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    window.setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.2s';
        window.setTimeout(() => toast.remove(), 200);
    }, 3000);
}

function cleanKey(name: string): string {
    return stripExtension(name).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
}

function stripExtension(name: string): string {
    return name.replace(/\.[^/.]+$/, '');
}
