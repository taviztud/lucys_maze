export interface MusicTrack {
    id: string;
    opusUrl?: string;
    mp3Url?: string;
}

const mp3Assets = import.meta.glob('../assets/audio/bg/*.mp3', {
    eager: true,
    query: '?url',
    import: 'default'
}) as Record<string, string>;

const opusAssets = import.meta.glob('../assets/audio/bg/*.ogg', {
    eager: true,
    query: '?url',
    import: 'default'
}) as Record<string, string>;

function getTrackId(assetPath: string): string {
    const filename = assetPath.split('/').pop() ?? assetPath;
    const extensionIndex = filename.lastIndexOf('.');
    return extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
}

function createMusicCatalog(): MusicTrack[] {
    const tracks = new Map<string, MusicTrack>();

    for (const [assetPath, url] of Object.entries(mp3Assets)) {
        const id = getTrackId(assetPath);
        tracks.set(id, { ...tracks.get(id), id, mp3Url: url });
    }

    for (const [assetPath, url] of Object.entries(opusAssets)) {
        const id = getTrackId(assetPath);
        tracks.set(id, { ...tracks.get(id), id, opusUrl: url });
    }

    return [...tracks.values()]
        .filter((track) => track.mp3Url || track.opusUrl)
        .sort((left, right) => left.id.localeCompare(right.id));
}

export const MUSIC_CATALOG: readonly MusicTrack[] = Object.freeze(createMusicCatalog());
