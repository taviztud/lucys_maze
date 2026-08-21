import { studioStore } from '../state/studioState';
import type { PresetAsset, AssetCategory } from '../types/studio.types';
import type { PhaserAtlasJSON } from '../../types/animation.types';
import { ANIMATED_ASSETS, BOARD_BACKGROUNDS } from '../../visuals/assetRegistry';
import { showToast } from '../utils/phaserExport';

const CATEGORY_BY_FOLDER: Record<string, AssetCategory> = {
    player: 'player',
    enemies: 'enemy',
    enemy: 'enemy',
    obstacles: 'obstacle',
    powerups: 'powerup',
    traps: 'trap',
    tiles: 'tile'
};

const ANIMATED_PRESETS: PresetAsset[] = Object.values(ANIMATED_ASSETS).map((definition) => {
    const folder = definition.category === 'player' ? 'player' : 'enemies';
    const imageName = definition.atlas.meta.image;
    return {
        id: definition.id,
        name: definition.name,
        category: definition.category,
        url: definition.imageUrl,
        defaultFrameWidth: definition.atlas.frames[Object.keys(definition.atlas.frames)[0]].frame.w,
        defaultFrameHeight: definition.atlas.frames[Object.keys(definition.atlas.frames)[0]].frame.h,
        defaultFps: definition.atlas.anims?.[0]?.frameRate ?? 1,
        atlas: definition.atlas,
        targetImagePath: `src/assets/sprites/${folder}/${imageName}`,
        targetJsonPath: `src/assets/sprites/${folder}/${imageName.replace(/\.png$/i, '.json')}`
    };
});

const BACKGROUND_PRESETS: PresetAsset[] = Object.values(BOARD_BACKGROUNDS).map((definition) => ({
    id: definition.id,
    name: definition.name,
    category: definition.category,
    url: definition.imageUrl,
    defaultFps: 1,
    targetImagePath: `src/assets/sprites/tiles/backgrounds/${definition.fileName}`
}));

export const GAME_PRESETS: PresetAsset[] = [...ANIMATED_PRESETS, ...BACKGROUND_PRESETS];

interface ApiAsset {
    id: string;
    name: string;
    category: string;
    imageUrl: string;
    jsonUrl?: string;
    targetImagePath: string;
    targetJsonPath?: string;
}

export class AssetCatalog {
    private container = document.getElementById('assetListContainer') as HTMLElement;
    private fileInput = document.getElementById('fileInput') as HTMLInputElement;
    private dropZone = document.getElementById('fileDropZone') as HTMLElement;
    private btnRefresh = document.getElementById('btnRefreshAssets') as HTMLButtonElement;

    constructor() {
        this.initEvents();
        void this.loadCatalog();
    }

    private initEvents(): void {
        this.btnRefresh.addEventListener('click', () => void this.loadCatalog());
        this.dropZone.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', () => {
            if (this.fileInput.files) void this.handleLocalFiles([...this.fileInput.files]);
            this.fileInput.value = '';
        });
        this.dropZone.addEventListener('dragover', (event) => {
            event.preventDefault();
            this.dropZone.style.borderColor = 'var(--accent-blue)';
        });
        this.dropZone.addEventListener('dragleave', () => {
            this.dropZone.style.borderColor = 'var(--border-color)';
        });
        this.dropZone.addEventListener('drop', (event) => {
            event.preventDefault();
            this.dropZone.style.borderColor = 'var(--border-color)';
            if (event.dataTransfer?.files) void this.handleLocalFiles([...event.dataTransfer.files]);
        });
    }

    async loadCatalog(): Promise<void> {
        this.container.replaceChildren();
        GAME_PRESETS.forEach((preset) => this.appendPreset(preset));

        if (!import.meta.env.DEV) return;

        try {
            const response = await fetch(new URL('../api/assets/list', window.location.href));
            if (!response.ok) return;
            const data = await response.json();
            const knownTargets = new Set(GAME_PRESETS.map(({ targetImagePath }) => targetImagePath));
            for (const asset of (data.assets ?? []) as ApiAsset[]) {
                if (knownTargets.has(asset.targetImagePath)) continue;
                this.appendApiAsset(asset);
            }
            for (const image of (data.images ?? []) as Array<{ name: string; relativeUrl: string; targetPath: string }>) {
                this.appendItem(image.name, 'tile', image.relativeUrl, () => {
                    void studioStore.loadImage(image.relativeUrl, stripExtension(image.name), 'tile');
                });
            }
        } catch {
            // The save/discovery API intentionally exists only on the local Vite server.
        }
    }

    private appendPreset(preset: PresetAsset): void {
        this.appendItem(preset.name, preset.category, preset.url, () => {
            if (preset.atlas) {
                void studioStore.loadAtlas(
                    preset.url,
                    stripExtension(preset.atlas.meta.image),
                    preset.category,
                    preset.atlas,
                    preset.targetJsonPath ?? null,
                    preset.targetImagePath ?? null
                );
            } else {
                void studioStore.loadImage(
                    preset.url,
                    preset.id,
                    preset.category,
                    preset.defaultFrameWidth,
                    preset.defaultFrameHeight,
                    undefined,
                    preset.targetImagePath ?? null
                );
            }
        });
    }

    private appendApiAsset(asset: ApiAsset): void {
        const category = CATEGORY_BY_FOLDER[asset.category] ?? 'tile';
        this.appendItem(asset.name, category, asset.imageUrl, async () => {
            if (!asset.jsonUrl) {
                await studioStore.loadImage(asset.imageUrl, asset.name, category);
                return;
            }
            const response = await fetch(asset.jsonUrl);
            if (!response.ok) throw new Error(`No se pudo cargar ${asset.jsonUrl}`);
            const atlas = await response.json() as PhaserAtlasJSON;
            await studioStore.loadAtlas(
                asset.imageUrl,
                asset.name,
                category,
                atlas,
                asset.targetJsonPath ?? null,
                asset.targetImagePath
            );
        });
    }

    private async handleLocalFiles(files: File[]): Promise<void> {
        const pairs = new Map<string, { image?: File; atlas?: File }>();
        for (const file of files) {
            const extension = file.name.split('.').pop()?.toLowerCase();
            if (!['png', 'jpg', 'jpeg', 'webp', 'json'].includes(extension ?? '')) continue;
            const base = stripExtension(file.name);
            const pair = pairs.get(base) ?? {};
            if (extension === 'json') pair.atlas = file;
            else pair.image = file;
            pairs.set(base, pair);
        }

        let firstLoader: (() => Promise<void>) | null = null;
        for (const [base, pair] of pairs) {
            if (!pair.image) {
                showToast(`Falta la imagen para ${pair.atlas?.name ?? base}`, 'error');
                continue;
            }
            const imageUrl = URL.createObjectURL(pair.image);
            const atlas = pair.atlas ? JSON.parse(await pair.atlas.text()) as PhaserAtlasJSON : null;
            const loader = async () => {
                if (atlas) await studioStore.loadAtlas(imageUrl, base, 'enemy', atlas);
                else await studioStore.loadImage(imageUrl, base, 'enemy');
            };
            this.appendItem(`${base} (local)`, 'enemy', imageUrl, () => void loader());
            firstLoader ??= loader;
        }
        if (firstLoader) await firstLoader();
    }

    private appendItem(
        name: string,
        category: AssetCategory,
        url: string,
        onClick: () => void | Promise<void>
    ): void {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'asset-item';
        const image = document.createElement('img');
        image.src = url;
        image.className = 'asset-thumb';
        image.alt = name;
        image.addEventListener('error', () => image.remove());
        const info = document.createElement('span');
        info.className = 'asset-info';
        const title = document.createElement('span');
        title.className = 'asset-name';
        title.textContent = name;
        const meta = document.createElement('span');
        meta.className = 'asset-meta';
        meta.textContent = category;
        info.append(title, meta);
        item.append(image, info);
        item.addEventListener('click', async () => {
            this.container.querySelectorAll('.asset-item').forEach((element) => element.classList.remove('active'));
            item.classList.add('active');
            try {
                await onClick();
            } catch (error) {
                showToast(error instanceof Error ? error.message : String(error), 'error');
            }
        });
        this.container.appendChild(item);
    }
}

function stripExtension(name: string): string {
    return name.replace(/\.[^/.]+$/, '');
}
