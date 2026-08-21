import { studioStore } from '../state/studioState';
import {
    calculateImageDivisions,
    autoDetectGridDimensions,
    scanImageAlphaBounds,
    detectSpriteCountByAlpha,
    type ImageDivisionSuggestion
} from '../utils/imageAnalysis';
import { showToast } from '../utils/phaserExport';

export class CropWizard {
    private modalElement: HTMLElement;
    private previewCanvas: HTMLCanvasElement;
    private previewCtx: CanvasRenderingContext2D;
    
    private infoLabel: HTMLElement;
    private suggestionsContainer: HTMLElement;
    private chipsContainer: HTMLElement;
    
    private inputCols: HTMLInputElement;
    private inputRows: HTMLInputElement;
    private inputFw: HTMLInputElement;
    private inputFh: HTMLInputElement;
    private inputSpacing: HTMLInputElement;
    private inputOffsetX: HTMLInputElement;
    private inputOffsetY: HTMLInputElement;
    
    private btnAutoTrim: HTMLButtonElement;
    private btnApply: HTMLButtonElement;
    private btnClose: HTMLButtonElement;
    private btnCancel: HTMLButtonElement;

    // Temporary wizard state before applying
    private tempFrameW: number = 32;
    private tempFrameH: number = 32;
    private tempCols: number = 1;
    private tempRows: number = 1;
    private tempSpacing: number = 0;
    private tempOffsetX: number = 0;
    private tempOffsetY: number = 0;

    constructor() {
        this.modalElement = document.getElementById('cropWizardModal') as HTMLElement;
        this.previewCanvas = document.getElementById('wizardPreviewCanvas') as HTMLCanvasElement;
        this.infoLabel = document.getElementById('wizardImageInfo') as HTMLElement;
        this.suggestionsContainer = document.getElementById('wizardSuggestions') as HTMLElement;
        this.chipsContainer = document.getElementById('wizardQuickChips') as HTMLElement;

        this.inputCols = document.getElementById('wizardInputCols') as HTMLInputElement;
        this.inputRows = document.getElementById('wizardInputRows') as HTMLInputElement;
        this.inputFw = document.getElementById('wizardInputFw') as HTMLInputElement;
        this.inputFh = document.getElementById('wizardInputFh') as HTMLInputElement;
        this.inputSpacing = document.getElementById('wizardInputSpacing') as HTMLInputElement;
        this.inputOffsetX = document.getElementById('wizardInputOffsetX') as HTMLInputElement;
        this.inputOffsetY = document.getElementById('wizardInputOffsetY') as HTMLInputElement;

        this.btnAutoTrim = document.getElementById('btnWizardAutoTrim') as HTMLButtonElement;
        this.btnApply = document.getElementById('btnWizardApply') as HTMLButtonElement;
        this.btnClose = document.getElementById('btnWizardClose') as HTMLButtonElement;
        this.btnCancel = document.getElementById('btnWizardCancel') as HTMLButtonElement;

        const ctx = this.previewCanvas.getContext('2d');
        if (!ctx) throw new Error('CropWizard: Canvas 2D context not available.');
        this.previewCtx = ctx;

        this.initEvents();
    }

    private initEvents(): void {
        this.btnClose.addEventListener('click', () => this.hide());
        this.btnCancel.addEventListener('click', () => this.hide());

        this.btnApply.addEventListener('click', () => {
            this.applyToStore();
            this.hide();
            showToast(`Recorte aplicado: ${this.tempCols * this.tempRows} frames de ${this.tempFrameW}x${this.tempFrameH} px`, 'success');
        });

        // Auto-Trim Alpha button
        if (this.btnAutoTrim) {
            this.btnAutoTrim.addEventListener('click', () => {
                const state = studioStore.getState();
                if (!state.imageElement) return;

                const bounds = scanImageAlphaBounds(state.imageElement);
                const islands = detectSpriteCountByAlpha(state.imageElement);
                if (bounds) {
                    const cols = islands > 1 ? islands : (state.imageWidth >= 1000 ? 8 : 4);
                    this.tempCols = cols;
                    this.tempRows = 1;
                    this.tempFrameW = Math.round(state.imageWidth / cols);
                    this.tempFrameH = bounds.height + 4;
                    this.tempOffsetX = 0;
                    this.tempOffsetY = Math.max(0, bounds.minY - 2);

                    this.updateInputs();
                    this.renderPreview();
                    showToast(`Ajustado a contenido: ${cols} frames de ${this.tempFrameW}x${this.tempFrameH} px (Offset Y=${this.tempOffsetY} px)`, 'success');
                } else {
                    showToast('No se detectaron píxeles visibles', 'error');
                }
            });
        }

        // Sync columns/rows inputs with frameWidth/frameHeight
        this.inputCols.addEventListener('input', () => {
            const state = studioStore.getState();
            const cols = Math.max(1, parseInt(this.inputCols.value, 10) || 1);
            this.tempCols = cols;
            this.tempFrameW = Math.max(1, Math.floor((state.imageWidth - this.tempOffsetX) / cols));
            this.inputFw.value = this.tempFrameW.toString();
            this.renderPreview();
        });

        this.inputRows.addEventListener('input', () => {
            const state = studioStore.getState();
            const rows = Math.max(1, parseInt(this.inputRows.value, 10) || 1);
            this.tempRows = rows;
            this.tempFrameH = Math.max(1, Math.floor((state.imageHeight - this.tempOffsetY) / rows));
            this.inputFh.value = this.tempFrameH.toString();
            this.renderPreview();
        });

        this.inputFw.addEventListener('input', () => {
            const state = studioStore.getState();
            const fw = Math.max(1, parseInt(this.inputFw.value, 10) || 32);
            this.tempFrameW = fw;
            this.tempCols = Math.max(1, Math.floor((state.imageWidth - this.tempOffsetX) / fw));
            this.inputCols.value = this.tempCols.toString();
            this.renderPreview();
        });

        this.inputFh.addEventListener('input', () => {
            const state = studioStore.getState();
            const fh = Math.max(1, parseInt(this.inputFh.value, 10) || 32);
            this.tempFrameH = fh;
            this.tempRows = Math.max(1, Math.floor((state.imageHeight - this.tempOffsetY) / fh));
            this.inputRows.value = this.tempRows.toString();
            this.renderPreview();
        });

        this.inputSpacing.addEventListener('input', () => {
            this.tempSpacing = Math.max(0, parseInt(this.inputSpacing.value, 10) || 0);
            this.renderPreview();
        });

        if (this.inputOffsetX) {
            this.inputOffsetX.addEventListener('input', () => {
                this.tempOffsetX = Math.max(0, parseInt(this.inputOffsetX.value, 10) || 0);
                this.renderPreview();
            });
        }

        if (this.inputOffsetY) {
            this.inputOffsetY.addEventListener('input', () => {
                this.tempOffsetY = Math.max(0, parseInt(this.inputOffsetY.value, 10) || 0);
                this.renderPreview();
            });
        }
    }

    public show(): void {
        const state = studioStore.getState();
        if (!state.imageElement) {
            showToast('Primero carga una imagen o selecciona un asset', 'error');
            return;
        }

        this.tempFrameW = state.frameWidth;
        this.tempFrameH = state.frameHeight;
        this.tempCols = state.columns;
        this.tempRows = state.rows;
        this.tempSpacing = state.spacing;
        this.tempOffsetX = state.offsetX || 0;
        this.tempOffsetY = state.offsetY || 0;

        this.infoLabel.textContent = `${state.imageName} — ${state.imageWidth}x${state.imageHeight} px`;

        this.renderSuggestions(state.imageWidth, state.imageHeight, state.imageElement);
        this.renderQuickChips(state.imageWidth, state.imageHeight);
        this.updateInputs();
        this.renderPreview();

        this.modalElement.classList.add('active');
    }

    public hide(): void {
        this.modalElement.classList.remove('active');
    }

    private renderSuggestions(imgW: number, imgH: number, imageElement?: HTMLImageElement | null): void {
        this.suggestionsContainer.innerHTML = '';
        const suggestions = calculateImageDivisions(imgW, imgH, imageElement);

        if (suggestions.length === 0) {
            const p = document.createElement('p');
            p.style.fontSize = '12px';
            p.style.color = 'var(--text-secondary)';
            p.textContent = 'No se detectaron divisiones exactas estándar.';
            this.suggestionsContainer.appendChild(p);
            return;
        }

        suggestions.forEach((sug: ImageDivisionSuggestion) => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-card';
            btn.innerHTML = `
                <div class="sug-title">${sug.label}</div>
                <div class="sug-desc">${sug.columns} col x ${sug.rows} fila (${sug.frameWidth}x${sug.frameHeight} px)</div>
            `;
            btn.addEventListener('click', () => {
                this.selectDimensions(
                    sug.frameWidth,
                    sug.frameHeight,
                    sug.columns,
                    sug.rows,
                    sug.offsetX || 0,
                    sug.offsetY || 0
                );
            });
            this.suggestionsContainer.appendChild(btn);
        });
    }

    private renderQuickChips(imgW: number, imgH: number): void {
        this.chipsContainer.innerHTML = '';
        const standardSizes = [16, 24, 32, 48, 60, 64, 128, 288];

        standardSizes.forEach((size) => {
            const chip = document.createElement('button');
            chip.className = `chip-btn ${this.tempFrameW === size ? 'active' : ''}`;
            chip.textContent = `${size}x${size}`;
            chip.addEventListener('click', () => {
                const cols = Math.max(1, Math.floor(imgW / size));
                const rows = Math.max(1, Math.floor(imgH / size));
                this.selectDimensions(size, size, cols, rows, 0, 0);
            });
            this.chipsContainer.appendChild(chip);
        });
    }

    private selectDimensions(
        fw: number,
        fh: number,
        cols: number,
        rows: number,
        offsetX: number = 0,
        offsetY: number = 0
    ): void {
        this.tempFrameW = fw;
        this.tempFrameH = fh;
        this.tempCols = cols;
        this.tempRows = rows;
        this.tempOffsetX = offsetX;
        this.tempOffsetY = offsetY;
        this.updateInputs();
        this.renderPreview();
    }

    private updateInputs(): void {
        this.inputFw.value = this.tempFrameW.toString();
        this.inputFh.value = this.tempFrameH.toString();
        this.inputCols.value = this.tempCols.toString();
        this.inputRows.value = this.tempRows.toString();
        this.inputSpacing.value = this.tempSpacing.toString();
        if (this.inputOffsetX) this.inputOffsetX.value = this.tempOffsetX.toString();
        if (this.inputOffsetY) this.inputOffsetY.value = this.tempOffsetY.toString();
    }

    private renderPreview(): void {
        const state = studioStore.getState();
        if (!state.imageElement) return;

        const img = state.imageElement;
        const imgW = state.imageWidth;
        const imgH = state.imageHeight;

        // Scale down to fit preview container (max 280x160)
        const maxW = 340;
        const maxH = 160;
        const scale = Math.min(maxW / imgW, maxH / imgH, 1);

        this.previewCanvas.width = imgW * scale;
        this.previewCanvas.height = imgH * scale;

        this.previewCtx.imageSmoothingEnabled = false;
        this.previewCtx.clearRect(0, 0, this.previewCanvas.width, this.previewCanvas.height);
        this.previewCtx.drawImage(img, 0, 0, this.previewCanvas.width, this.previewCanvas.height);

        // Draw overlay grid lines
        this.previewCtx.strokeStyle = '#f72585';
        this.previewCtx.lineWidth = 1;

        for (let r = 0; r < this.tempRows; r++) {
            for (let c = 0; c < this.tempCols; c++) {
                const cellX = (this.tempOffsetX + c * (this.tempFrameW + this.tempSpacing)) * scale;
                const cellY = (this.tempOffsetY + r * (this.tempFrameH + this.tempSpacing)) * scale;
                const cellW = this.tempFrameW * scale;
                const cellH = this.tempFrameH * scale;

                this.previewCtx.strokeRect(cellX, cellY, cellW, cellH);
            }
        }
    }

    private applyToStore(): void {
        studioStore.updateGrid(
            this.tempFrameW,
            this.tempFrameH,
            this.tempSpacing,
            this.tempOffsetX,
            this.tempOffsetY,
            this.tempCols,
            this.tempRows
        );

        // Regenerate sequence of frames for the active animation based on new grid
        const total = this.tempCols * this.tempRows;
        const frameList = Array.from({ length: total }, (_, i) => i);
        studioStore.setFramesForActive(frameList);
    }
}
