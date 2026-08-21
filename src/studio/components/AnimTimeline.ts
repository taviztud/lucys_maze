import { studioStore } from '../state/studioState';
import type { StudioState, AnimationTrack } from '../types/studio.types';

export class AnimTimeline {
    private tabsContainer: HTMLElement;
    private trackContainer: HTMLElement;
    private inputName: HTMLInputElement;
    private inputFps: HTMLInputElement;
    private selectRepeat: HTMLSelectElement;
    private chkYoyo: HTMLInputElement;
    private inputStartFrame: HTMLInputElement;
    private inputFrameDuration: HTMLInputElement;
    private btnAddAnim: HTMLButtonElement;
    private btnClearFrames: HTMLButtonElement;

    constructor() {
        this.tabsContainer = document.getElementById('animTabsContainer') as HTMLElement;
        this.trackContainer = document.getElementById('timelineTrack') as HTMLElement;
        this.inputName = document.getElementById('inputAnimName') as HTMLInputElement;
        this.inputFps = document.getElementById('inputAnimFps') as HTMLInputElement;
        this.selectRepeat = document.getElementById('selectRepeat') as HTMLSelectElement;
        this.chkYoyo = document.getElementById('chkAnimYoyo') as HTMLInputElement;
        this.inputStartFrame = document.getElementById('inputAnimStartFrame') as HTMLInputElement;
        this.inputFrameDuration = document.getElementById('inputFrameDuration') as HTMLInputElement;
        this.btnAddAnim = document.getElementById('btnAddAnim') as HTMLButtonElement;
        this.btnClearFrames = document.getElementById('btnClearFrames') as HTMLButtonElement;

        this.initEvents();
        studioStore.subscribe(this.render.bind(this));
    }

    private initEvents(): void {
        this.btnAddAnim.addEventListener('click', () => {
            const count = studioStore.getState().animations.length + 1;
            studioStore.addAnimation(`anim_${count}`);
        });

        this.inputName.addEventListener('input', () => {
            studioStore.updateActiveAnimation({ name: this.inputName.value.trim() || 'unnamed' });
        });

        this.inputFps.addEventListener('change', () => {
            const val = Math.max(1, Math.min(60, parseInt(this.inputFps.value, 10) || 6));
            studioStore.updateActiveAnimation({ frameRate: val });
        });

        this.selectRepeat.addEventListener('change', () => {
            studioStore.updateActiveAnimation({ repeat: parseInt(this.selectRepeat.value, 10) });
        });

        this.chkYoyo.addEventListener('change', () => {
            studioStore.updateActiveAnimation({ yoyo: this.chkYoyo.checked });
        });

        this.inputStartFrame.addEventListener('change', () => {
            const animation = this.getActiveAnimation();
            const maximum = Math.max(0, (animation?.frames.length ?? 1) - 1);
            const startFrame = Math.min(maximum, Math.max(0, parseInt(this.inputStartFrame.value, 10) || 0));
            studioStore.updateActiveAnimation({ startFrame });
            studioStore.setState({ currentPreviewFrame: startFrame });
        });

        this.inputFrameDuration.addEventListener('change', () => {
            const state = studioStore.getState();
            const animation = state.animations[state.activeAnimationIndex];
            if (!animation) return;
            const position = Math.min(state.currentPreviewFrame, animation.frames.length - 1);
            const frameDurations = [...animation.frameDurations];
            frameDurations[position] = Math.max(0, parseInt(this.inputFrameDuration.value, 10) || 0);
            studioStore.updateActiveAnimation({ frameDurations });
        });

        this.btnClearFrames.addEventListener('click', () => {
            studioStore.setFramesForActive([]);
        });
    }

    public render(state: StudioState): void {
        const { animations, activeAnimationIndex, currentPreviewFrame } = state;
        const currentAnim = animations[activeAnimationIndex];

        // Render Tabs
        this.tabsContainer.innerHTML = '';
        animations.forEach((anim, idx) => {
            const tab = document.createElement('div');
            tab.className = `anim-tab ${idx === activeAnimationIndex ? 'active' : ''}`;
            tab.textContent = anim.name || `anim_${idx + 1}`;
            tab.addEventListener('click', () => {
                studioStore.setState({
                    activeAnimationIndex: idx,
                    currentPreviewFrame: 0
                });
            });
            this.tabsContainer.appendChild(tab);
        });

        if (!currentAnim) return;

        // Sync inputs with active animation (avoid overwriting while user is typing if matching)
        if (document.activeElement !== this.inputName) {
            this.inputName.value = currentAnim.name;
        }
        if (document.activeElement !== this.inputFps) {
            this.inputFps.value = currentAnim.frameRate.toString();
        }
        this.selectRepeat.value = currentAnim.repeat.toString();
        this.chkYoyo.checked = Boolean(currentAnim.yoyo);
        this.inputStartFrame.max = Math.max(0, currentAnim.frames.length - 1).toString();
        this.inputStartFrame.value = currentAnim.startFrame.toString();
        this.inputFrameDuration.value = (currentAnim.frameDurations[currentPreviewFrame] ?? 0).toString();

        // Render Timeline Track Frames
        this.trackContainer.innerHTML = '';
        if (currentAnim.frames.length === 0) {
            const emptyLabel = document.createElement('span');
            emptyLabel.style.fontSize = '11px';
            emptyLabel.style.color = 'var(--text-muted)';
            emptyLabel.textContent = 'Sin frames asignados. Haz clic en celdas de la cuadrícula.';
            this.trackContainer.appendChild(emptyLabel);
            return;
        }

        const activeSequencePos = currentPreviewFrame % currentAnim.frames.length;

        currentAnim.frames.forEach((frameIdx, posIdx) => {
            const frameBox = document.createElement('div');
            frameBox.className = `timeline-frame ${posIdx === activeSequencePos ? 'active' : ''}`;
            frameBox.textContent = `#${frameIdx}`;

            const removeBtn = document.createElement('button');
            removeBtn.className = 'btn-remove-frame';
            removeBtn.textContent = 'x';
            removeBtn.title = 'Eliminar frame';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                studioStore.removeFrameFromActive(posIdx);
            });

            frameBox.appendChild(removeBtn);
            frameBox.addEventListener('click', () => {
                studioStore.setState({ selectedFrame: frameIdx, currentPreviewFrame: posIdx, isPlaying: false });
            });

            this.trackContainer.appendChild(frameBox);
        });
    }

    private getActiveAnimation(): AnimationTrack | undefined {
        const state = studioStore.getState();
        return state.animations[state.activeAnimationIndex];
    }
}
