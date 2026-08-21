export interface ImageDivisionSuggestion {
    columns: number;
    rows: number;
    frameWidth: number;
    frameHeight: number;
    offsetX?: number;
    offsetY?: number;
    totalFrames: number;
    label: string;
}

export interface AlphaBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
}

/**
 * Escanea la imagen completa en memoria para obtener los límites de píxeles visibles (canal Alpha > 10).
 */
export function scanImageAlphaBounds(imageElement: HTMLImageElement): AlphaBounds | null {
    const width = imageElement.naturalWidth || imageElement.width;
    const height = imageElement.naturalHeight || imageElement.height;
    if (width === 0 || height === 0) return null;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(imageElement, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const alpha = data[(y * width + x) * 4 + 3];
            if (alpha > 15) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < minX || maxY < minY) return null;

    return {
        minX,
        minY,
        maxX,
        maxY,
        width: maxX - minX + 1,
        height: maxY - minY + 1
    };
}

/**
 * Detecta islas/número de sprites escaneando la densidad de columnas de la imagen.
 */
export function detectSpriteCountByAlpha(imageElement: HTMLImageElement): number {
    const width = imageElement.naturalWidth || imageElement.width;
    const height = imageElement.naturalHeight || imageElement.height;
    if (width === 0 || height === 0) return 1;

    const offCanvas = document.createElement('canvas');
    offCanvas.width = width;
    offCanvas.height = height;
    const ctx = offCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return 1;

    ctx.drawImage(imageElement, 0, 0);
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Build column occupancy array
    const columnHasPixels: boolean[] = new Array(width).fill(false);
    for (let x = 0; x < width; x++) {
        for (let y = 0; y < height; y++) {
            if (data[(y * width + x) * 4 + 3] > 15) {
                columnHasPixels[x] = true;
                break;
            }
        }
    }

    // Count transitions from empty -> filled
    let islands = 0;
    let inIsland = false;
    for (let x = 0; x < width; x++) {
        if (columnHasPixels[x]) {
            if (!inIsland) {
                islands++;
                inIsland = true;
            }
        } else {
            inIsland = false;
        }
    }

    // If islands detected cleanly, return count (between 2 and 32)
    if (islands >= 2 && islands <= 32) {
        return islands;
    }

    // Fallback: check typical frame counts
    const candidateCounts = [8, 6, 4, 12, 10, 5, 3, 2];
    for (const count of candidateCounts) {
        if (width % count === 0) return count;
    }

    return 1;
}

/**
 * Calcula todas las divisiones sugeridas incluyendo análisis de canal Alpha.
 */
export function calculateImageDivisions(
    imageWidth: number,
    imageHeight: number,
    imageElement?: HTMLImageElement | null
): ImageDivisionSuggestion[] {
    const suggestions: ImageDivisionSuggestion[] = [];

    // 1. If imageElement is provided, calculate Alpha Bounds
    if (imageElement) {
        const bounds = scanImageAlphaBounds(imageElement);
        const detectedIslands = detectSpriteCountByAlpha(imageElement);

        if (bounds) {
            // Suggest division fitted to detected sprite count (e.g. 8 frames)
            const targetCols = detectedIslands > 1 ? detectedIslands : 8;
            const fw = Math.round(imageWidth / targetCols);
            const fh = bounds.height + 4; // slight padding

            suggestions.push({
                columns: targetCols,
                rows: 1,
                frameWidth: fw,
                frameHeight: fh,
                offsetX: 0,
                offsetY: Math.max(0, bounds.minY - 2),
                totalFrames: targetCols,
                label: `Auto-Detectado: ${targetCols} frames de ${fw}x${fh} px (Offset Y=${Math.max(0, bounds.minY - 2)} px)`
            });
        }
    }

    // 2. Division by common frame counts in strips (8, 6, 4, 12, 16, 2)
    const commonFrameCounts = [8, 6, 4, 12, 16, 5, 3, 2];
    for (const count of commonFrameCounts) {
        const fw = Math.round(imageWidth / count);
        const alreadyExists = suggestions.some(s => s.columns === count && s.rows === 1);
        if (!alreadyExists && fw >= 16) {
            suggestions.push({
                columns: count,
                rows: 1,
                frameWidth: fw,
                frameHeight: imageHeight,
                offsetX: 0,
                offsetY: 0,
                totalFrames: count,
                label: `Tira de ${count} frames (${fw}x${imageHeight} px)`
            });
        }
    }

    // 3. Common square sizes
    const commonSizes = [16, 24, 32, 48, 60, 64, 128, 256, 288];
    for (const size of commonSizes) {
        if (imageWidth >= size && imageHeight >= size) {
            if (imageWidth % size === 0 && imageHeight % size === 0) {
                const cols = imageWidth / size;
                const rows = imageHeight / size;
                const alreadyExists = suggestions.some(s => s.frameWidth === size && s.frameHeight === size);
                if (!alreadyExists) {
                    suggestions.push({
                        columns: cols,
                        rows,
                        frameWidth: size,
                        frameHeight: size,
                        offsetX: 0,
                        offsetY: 0,
                        totalFrames: cols * rows,
                        label: `${size}x${size} px (${cols}x${rows} = ${cols * rows} frames)`
                    });
                }
            }
        }
    }

    return suggestions;
}

/**
 * Detecta automáticamente la división de celdas más probable para una imagen (considerando canal alpha).
 */
export function autoDetectGridDimensions(
    imageWidth: number,
    imageHeight: number,
    imageElement?: HTMLImageElement | null
): { frameWidth: number; frameHeight: number; columns: number; rows: number; offsetX: number; offsetY: number } {
    if (imageWidth === 0 || imageHeight === 0) {
        return { frameWidth: 32, frameHeight: 32, columns: 1, rows: 1, offsetX: 0, offsetY: 0 };
    }

    // 1. Check with Alpha Channel scanner if element provided
    if (imageElement) {
        const bounds = scanImageAlphaBounds(imageElement);
        const islands = detectSpriteCountByAlpha(imageElement);
        if (bounds) {
            const cols = islands > 1 ? islands : (imageWidth >= 1000 ? 8 : 4);
            const fw = Math.round(imageWidth / cols);
            const fh = bounds.height + 4;
            const topOffset = Math.max(0, bounds.minY - 2);

            return {
                frameWidth: fw,
                frameHeight: fh,
                columns: cols,
                rows: 1,
                offsetX: 0,
                offsetY: topOffset
            };
        }
    }

    // 2. Known Lucy's Maze atlas
    if (imageWidth === 1152 && imageHeight === 576) {
        return { frameWidth: 288, frameHeight: 288, columns: 4, rows: 2, offsetX: 0, offsetY: 0 };
    }

    // 3. Wide horizontal strip (e.g., width > 2 * height)
    if (imageWidth >= imageHeight * 2) {
        const candidateCols = [8, 6, 4, 12, 16];
        for (const count of candidateCols) {
            if (imageWidth % count === 0) {
                return {
                    frameWidth: imageWidth / count,
                    frameHeight: imageHeight,
                    columns: count,
                    rows: 1,
                    offsetX: 0,
                    offsetY: 0
                };
            }
        }
        return {
            frameWidth: Math.round(imageWidth / 8),
            frameHeight: imageHeight,
            columns: 8,
            rows: 1,
            offsetX: 0,
            offsetY: 0
        };
    }

    // 4. Common pixel art sizes
    const targetSizes = [288, 128, 64, 60, 48, 32, 24, 16];
    for (const size of targetSizes) {
        if (imageWidth % size === 0 && imageHeight % size === 0) {
            return {
                frameWidth: size,
                frameHeight: size,
                columns: imageWidth / size,
                rows: imageHeight / size,
                offsetX: 0,
                offsetY: 0
            };
        }
    }

    // 5. Default
    return {
        frameWidth: imageWidth,
        frameHeight: imageHeight,
        columns: 1,
        rows: 1,
        offsetX: 0,
        offsetY: 0
    };
}
