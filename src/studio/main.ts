import { studioStore } from './state/studioState';
import { CanvasGrid } from './components/CanvasGrid';
import { AnimTimeline } from './components/AnimTimeline';
import { LivePreview } from './components/LivePreview';
import { ScaleComparer } from './components/ScaleComparer';
import { AssetCatalog, GAME_PRESETS } from './components/AssetCatalog';
import { CropWizard } from './components/CropWizard';
import { autoDetectGridDimensions, scanImageAlphaBounds, detectSpriteCountByAlpha } from './utils/imageAnalysis';
import {
    createStudioPayload,
    validateStudioState,
    copyToClipboard,
    downloadJsonFile,
    saveJsonToProject,
    saveSheetToProject,
    showToast
} from './utils/phaserExport';

document.addEventListener('DOMContentLoaded', () => {
    // Initialize components
    const canvasGrid = new CanvasGrid('studioCanvas', 'canvasContainer');
    const animTimeline = new AnimTimeline();
    const livePreview = new LivePreview();
    const scaleComparer = new ScaleComparer();
    const assetCatalog = new AssetCatalog();
    const cropWizard = new CropWizard();

    // DOM Elements
    const headerTitle = document.getElementById('headerAssetTitle') as HTMLElement;
    const labelDimensions = document.getElementById('labelDimensions') as HTMLElement;
    const labelZoom = document.getElementById('labelZoom') as HTMLElement;

    const btnOpenGame = document.getElementById('btnOpenGame') as HTMLButtonElement;
    const btnCopyJson = document.getElementById('btnCopyJson') as HTMLButtonElement;
    const btnDownloadJson = document.getElementById('btnDownloadJson') as HTMLButtonElement;
    const btnSaveToProject = document.getElementById('btnSaveToProject') as HTMLButtonElement;

    const btnOpenWizard = document.getElementById('btnOpenWizard') as HTMLButtonElement;
    const btnAutoTrim = document.getElementById('btnAutoTrim') as HTMLButtonElement;
    const btnAutoDetect = document.getElementById('btnAutoDetect') as HTMLButtonElement;
    const quickChipsContainer = document.getElementById('quickPresetChips') as HTMLElement;

    const btnZoomIn = document.getElementById('btnZoomIn') as HTMLButtonElement;
    const btnZoomOut = document.getElementById('btnZoomOut') as HTMLButtonElement;
    const btnResetZoom = document.getElementById('btnResetZoom') as HTMLButtonElement;

    const chkShowGrid = document.getElementById('chkShowGrid') as HTMLInputElement;
    const chkShowNumbers = document.getElementById('chkShowNumbers') as HTMLInputElement;
    const chkShowPivot = document.getElementById('chkShowPivot') as HTMLInputElement;

    const inputCols = document.getElementById('inputCols') as HTMLInputElement;
    const inputRows = document.getElementById('inputRows') as HTMLInputElement;
    const inputFrameW = document.getElementById('inputFrameW') as HTMLInputElement;
    const inputFrameH = document.getElementById('inputFrameH') as HTMLInputElement;
    const inputOffsetX = document.getElementById('inputOffsetX') as HTMLInputElement;
    const inputOffsetY = document.getElementById('inputOffsetY') as HTMLInputElement;
    const inputSpacing = document.getElementById('inputSpacing') as HTMLInputElement;
    const inputPivotX = document.getElementById('inputPivotX') as HTMLInputElement;
    const inputPivotY = document.getElementById('inputPivotY') as HTMLInputElement;
    const inputTargetRatio = document.getElementById('inputTargetRatio') as HTMLInputElement;
    const inputTargetSize = document.getElementById('inputTargetSize') as HTMLInputElement;

    // Header & Navigation
    btnOpenGame.addEventListener('click', () => {
        window.location.href = new URL('../', window.location.href).href;
    });

    // Wizard
    btnOpenWizard.addEventListener('click', () => {
        cropWizard.show();
    });

    // Auto-Trim Alpha (Smart Bounding Box)
    if (btnAutoTrim) {
        btnAutoTrim.addEventListener('click', () => {
            const state = studioStore.getState();
            if (!state.imageElement) {
                showToast('Primero selecciona un sprite', 'error');
                return;
            }

            const bounds = scanImageAlphaBounds(state.imageElement);
            const islands = detectSpriteCountByAlpha(state.imageElement);

            if (bounds) {
                const cols = islands > 1 ? islands : (state.imageWidth >= 1000 ? 8 : 4);
                const fw = Math.round(state.imageWidth / cols);
                const fh = bounds.height + 4;
                const topOffset = Math.max(0, bounds.minY - 2);

                studioStore.updateGrid(fw, fh, state.spacing, 0, topOffset, cols, 1);
                studioStore.setFramesForActive(Array.from({ length: cols }, (_, i) => i));

                showToast(`Auto-Trim aplicado: ${cols} frames de ${fw}x${fh} px (Offset Y=${topOffset} px)`, 'success');
            } else {
                showToast('No se detectaron píxeles visibles', 'error');
            }
        });
    }

    // Auto Detection
    btnAutoDetect.addEventListener('click', () => {
        const state = studioStore.getState();
        if (!state.imageElement) {
            showToast('Primero selecciona un sprite', 'error');
            return;
        }

        const detected = autoDetectGridDimensions(state.imageWidth, state.imageHeight, state.imageElement);
        studioStore.updateGrid(
            detected.frameWidth,
            detected.frameHeight,
            state.spacing,
            detected.offsetX,
            detected.offsetY,
            detected.columns,
            detected.rows
        );

        const totalFrames = detected.columns * detected.rows;
        studioStore.setFramesForActive(Array.from({ length: totalFrames }, (_, i) => i));

        showToast(`Auto-detectado: ${detected.columns}x${detected.rows} frames de ${detected.frameWidth}x${detected.frameHeight} px (Offset Y=${detected.offsetY})`, 'success');
    });

    // Quick Size Chips
    if (quickChipsContainer) {
        const chips = quickChipsContainer.querySelectorAll('.preset-chip');
        chips.forEach((chip) => {
            chip.addEventListener('click', () => {
                const size = parseInt(chip.getAttribute('data-size') || '32', 10);
                const state = studioStore.getState();
                const cols = Math.max(1, Math.floor((state.imageWidth - (state.offsetX || 0)) / size));
                const rows = Math.max(1, Math.floor((state.imageHeight - (state.offsetY || 0)) / size));
                
                studioStore.updateGrid(size, size, state.spacing, state.offsetX, state.offsetY, cols, rows);

                const totalFrames = cols * rows;
                studioStore.setFramesForActive(Array.from({ length: totalFrames }, (_, i) => i));

                showToast(`Cuadrícula fijada a ${size}x${size} px (${cols}x${rows} frames)`, 'success');
            });
        });
    }

    // Zoom Controls
    btnZoomIn.addEventListener('click', () => {
        const state = studioStore.getState();
        const nextZoom = Math.min(16, state.zoom + 0.5);
        studioStore.setState({ zoom: nextZoom });
    });

    btnZoomOut.addEventListener('click', () => {
        const state = studioStore.getState();
        const nextZoom = Math.max(0.5, state.zoom - 0.5);
        studioStore.setState({ zoom: nextZoom });
    });

    btnResetZoom.addEventListener('click', () => {
        studioStore.setState({ zoom: 2, panX: 0, panY: 0 });
    });

    // Viewport Toggles
    chkShowGrid.addEventListener('change', () => {
        studioStore.setState({ showGrid: chkShowGrid.checked });
    });

    chkShowNumbers.addEventListener('change', () => {
        studioStore.setState({ showFrameNumbers: chkShowNumbers.checked });
    });

    chkShowPivot.addEventListener('change', () => {
        studioStore.setState({ showPivot: chkShowPivot.checked });
    });

    // Slicing Inputs
    const updateGridFromInputs = () => {
        const state = studioStore.getState();
        const fw = parseInt(inputFrameW.value, 10) || 32;
        const fh = parseInt(inputFrameH.value, 10) || 32;
        const offX = inputOffsetX ? (parseInt(inputOffsetX.value, 10) || 0) : 0;
        const offY = inputOffsetY ? (parseInt(inputOffsetY.value, 10) || 0) : 0;
        const sp = parseInt(inputSpacing.value, 10) || 0;
        
        let cols = inputCols ? parseInt(inputCols.value, 10) : 0;
        let rows = inputRows ? parseInt(inputRows.value, 10) : 0;

        studioStore.updateGrid(fw, fh, sp, offX, offY, cols, rows);
    };

    if (inputCols) {
        inputCols.addEventListener('change', () => {
            const state = studioStore.getState();
            const cols = Math.max(1, parseInt(inputCols.value, 10) || 1);
            const fw = Math.round((state.imageWidth - (state.offsetX || 0)) / cols);
            inputFrameW.value = fw.toString();
            studioStore.updateGrid(fw, state.frameHeight, state.spacing, state.offsetX, state.offsetY, cols, state.rows);
        });
    }

    if (inputRows) {
        inputRows.addEventListener('change', () => {
            const state = studioStore.getState();
            const rows = Math.max(1, parseInt(inputRows.value, 10) || 1);
            const fh = Math.round((state.imageHeight - (state.offsetY || 0)) / rows);
            inputFrameH.value = fh.toString();
            studioStore.updateGrid(state.frameWidth, fh, state.spacing, state.offsetX, state.offsetY, state.columns, rows);
        });
    }

    inputFrameW.addEventListener('change', updateGridFromInputs);
    inputFrameH.addEventListener('change', updateGridFromInputs);
    if (inputOffsetX) inputOffsetX.addEventListener('change', updateGridFromInputs);
    if (inputOffsetY) inputOffsetY.addEventListener('change', updateGridFromInputs);
    inputSpacing.addEventListener('change', updateGridFromInputs);

    inputPivotX.addEventListener('change', () => {
        const px = Math.min(1, Math.max(0, parseFloat(inputPivotX.value) || 0.5));
        studioStore.setState({ pivotX: px });
    });

    inputPivotY.addEventListener('change', () => {
        const py = Math.min(1, Math.max(0, parseFloat(inputPivotY.value) || 0.5));
        studioStore.setState({ pivotY: py });
    });

    inputTargetRatio.addEventListener('change', () => {
        const targetCellRatio = Math.min(2, Math.max(0.1, parseFloat(inputTargetRatio.value) || 1));
        studioStore.setState({ targetCellRatio });
    });

    inputTargetSize.addEventListener('change', () => {
        const state = studioStore.getState();
        const targetSize = Math.max(1, parseFloat(inputTargetSize.value) || state.compareCellSize);
        studioStore.setState({ targetCellRatio: targetSize / state.compareCellSize });
    });

    // Export Handlers
    btnCopyJson.addEventListener('click', async () => {
        const state = studioStore.getState();
        const errors = validateStudioState(state);
        if (errors.length) return showToast(errors[0], 'error');
        const payload = createStudioPayload(state);

        try {
            await copyToClipboard(JSON.stringify(payload, null, 2));
            showToast('JSON copiado al portapapeles', 'success');
        } catch {
            showToast('Error al copiar al portapapeles', 'error');
        }
    });

    btnDownloadJson.addEventListener('click', () => {
        const state = studioStore.getState();
        const errors = validateStudioState(state);
        if (errors.length) return showToast(errors[0], 'error');
        const payload = createStudioPayload(state);
        const filename = `${state.imageName || 'sprite'}.json`;
        downloadJsonFile(filename, payload);
        showToast(`Descargado ${filename}`, 'success');
    });

    btnSaveToProject.addEventListener('click', async () => {
        const state = studioStore.getState();
        if (!state.imageName) {
            showToast('No hay sprite activo para guardar', 'error');
            return;
        }

        const errors = validateStudioState(state);
        if (errors.length) return showToast(errors[0], 'error');
        const cleanKey = state.imageName.toLowerCase().replace(/\.[^/.]+$/, '').replace(/[^a-z0-9_-]/g, '_');
        const folder = state.category === 'player' ? 'player'
            : state.category === 'enemy' || state.category === 'trap' ? 'enemies'
                : `${state.category}s`;
        const targetPath = state.targetJsonPath ?? `src/assets/sprites/${folder}/${cleanKey}.json`;
        const targetImagePath = state.targetImagePath ?? `src/assets/sprites/${folder}/${cleanKey}.png`;
        const payload = createStudioPayload(state);

        btnSaveToProject.disabled = true;
        btnSaveToProject.textContent = 'Guardando...';

        let res = { success: true, message: '' };
        if (state.imageSrc?.startsWith('blob:') || state.imageSrc?.startsWith('data:')) {
            res = await saveSheetToProject(targetImagePath, state);
        }
        if (res.success) res = await saveJsonToProject(targetPath, payload);
        btnSaveToProject.disabled = false;
        btnSaveToProject.textContent = 'Guardar en Proyecto';

        if (res.success) {
            showToast(res.message, 'success');
        } else {
            showToast(`Error: ${res.message}`, 'error');
        }
    });

    // Subscribe to store updates for UI sync
    studioStore.subscribe((state) => {
        headerTitle.textContent = state.imageName ? `— ${state.imageName}` : '';
        labelDimensions.textContent = `${state.imageWidth}x${state.imageHeight} px (${state.columns}x${state.rows} celdas)`;
        labelZoom.textContent = `${Math.round(state.zoom * 100)}%`;

        if (inputCols && document.activeElement !== inputCols) inputCols.value = state.columns.toString();
        if (inputRows && document.activeElement !== inputRows) inputRows.value = state.rows.toString();
        if (document.activeElement !== inputFrameW) inputFrameW.value = state.frameWidth.toString();
        if (document.activeElement !== inputFrameH) inputFrameH.value = state.frameHeight.toString();
        if (inputOffsetX && document.activeElement !== inputOffsetX) inputOffsetX.value = (state.offsetX || 0).toString();
        if (inputOffsetY && document.activeElement !== inputOffsetY) inputOffsetY.value = (state.offsetY || 0).toString();
        if (document.activeElement !== inputSpacing) inputSpacing.value = state.spacing.toString();
        if (document.activeElement !== inputPivotX) inputPivotX.value = state.pivotX.toString();
        if (document.activeElement !== inputPivotY) inputPivotY.value = state.pivotY.toString();
        if (document.activeElement !== inputTargetRatio) inputTargetRatio.value = state.targetCellRatio.toFixed(2);
        if (document.activeElement !== inputTargetSize) {
            inputTargetSize.value = Math.round(state.compareCellSize * state.targetCellRatio).toString();
        }

        // Sync active chip
        if (quickChipsContainer) {
            const chips = quickChipsContainer.querySelectorAll('.preset-chip');
            chips.forEach((chip) => {
                const size = parseInt(chip.getAttribute('data-size') || '0', 10);
                if (size === state.frameWidth && size === state.frameHeight) {
                    chip.classList.add('active');
                } else {
                    chip.classList.remove('active');
                }
            });
        }
    });

    // Load initial preset (Lucy Idle)
    if (GAME_PRESETS.length > 0) {
        const firstPreset = GAME_PRESETS[0];
        if (firstPreset.atlas) {
            void studioStore.loadAtlas(
                firstPreset.url,
                firstPreset.id,
                firstPreset.category,
                firstPreset.atlas,
                firstPreset.targetJsonPath ?? null,
                firstPreset.targetImagePath ?? null
            );
        }
    }
});
