import { CONFIG } from '../Config';
import { MUSIC_CATALOG, type MusicTrack } from './musicCatalog';

export type MusicPlaybackState = 'idle' | 'loading' | 'playing' | 'paused' | 'stopped' | 'error';
export type MusicStateListener = (state: MusicPlaybackState) => void;

interface MusicSource {
    format: 'opus' | 'mp3';
    url: string;
}

export class MusicManager {
    private readonly audio: HTMLAudioElement;
    private readonly tracks: readonly MusicTrack[];
    private readonly listeners = new Set<MusicStateListener>();
    private readonly supportsOpus: boolean;
    private playlist: MusicTrack[] = [];
    private playlistIndex = 0;
    private currentTrack: MusicTrack | null = null;
    private currentSources: MusicSource[] = [];
    private currentSourceIndex = 0;
    private failedTrackCount = 0;
    private attemptToken = 0;
    private state: MusicPlaybackState = 'idle';

    constructor(tracks: readonly MusicTrack[], defaultVolume: number) {
        this.tracks = tracks;
        this.audio = document.createElement('audio');
        this.audio.preload = 'none';
        this.audio.loop = false;
        this.audio.volume = this.clampVolume(defaultVolume);
        this.supportsOpus = this.audio.canPlayType('audio/ogg; codecs="opus"') !== '';

        this.audio.addEventListener('playing', this.handlePlaying);
        this.audio.addEventListener('pause', this.handlePause);
        this.audio.addEventListener('ended', this.handleEnded);
        this.audio.addEventListener('error', this.handleError);
    }

    async start(): Promise<void> {
        if (this.tracks.length === 0 || this.state === 'playing' || this.state === 'loading') return;

        if (this.currentTrack && this.audio.src && this.state === 'paused') {
            await this.resumeCurrent();
            return;
        }

        await this.playNext();
    }

    async togglePlayPause(): Promise<void> {
        if (this.state === 'playing' || this.state === 'loading') {
            this.audio.pause();
            this.setState('paused');
            return;
        }

        if (this.currentTrack && this.audio.src && this.state === 'paused') {
            await this.resumeCurrent();
            return;
        }

        await this.playNext();
    }

    async playNext(): Promise<void> {
        if (this.tracks.length === 0) {
            this.setState('error');
            return;
        }

        this.failedTrackCount = 0;
        await this.playTrack(this.takeNextTrack());
    }

    stop(): void {
        this.attemptToken++;
        this.audio.pause();
        this.audio.removeAttribute('src');
        this.audio.load();
        this.currentTrack = null;
        this.currentSources = [];
        this.currentSourceIndex = 0;
        this.failedTrackCount = 0;
        this.setState('stopped');
    }

    setVolume(volume: number): void {
        this.audio.volume = this.clampVolume(volume);
    }

    isPlaying(): boolean {
        return this.state === 'playing' || this.state === 'loading';
    }

    getState(): MusicPlaybackState {
        return this.state;
    }

    getCurrentTrackId(): string | null {
        return this.currentTrack?.id ?? null;
    }

    getCurrentFormat(): 'opus' | 'mp3' | null {
        return this.currentSources[this.currentSourceIndex]?.format ?? null;
    }

    getVolume(): number {
        return this.audio.volume;
    }

    subscribe(listener: MusicStateListener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => this.listeners.delete(listener);
    }

    destroy(): void {
        this.stop();
        this.audio.removeEventListener('playing', this.handlePlaying);
        this.audio.removeEventListener('pause', this.handlePause);
        this.audio.removeEventListener('ended', this.handleEnded);
        this.audio.removeEventListener('error', this.handleError);
        this.listeners.clear();
    }

    private readonly handlePlaying = (): void => this.setState('playing');

    private readonly handlePause = (): void => {
        if (this.currentTrack && this.state === 'playing') this.setState('paused');
    };

    private readonly handleEnded = (): void => {
        void this.playNext();
    };

    private readonly handleError = (): void => {
        if (this.currentTrack && this.state !== 'stopped') void this.tryFallbackOrNextTrack();
    };

    private async resumeCurrent(): Promise<void> {
        const token = ++this.attemptToken;
        this.setState('loading');
        try {
            await this.audio.play();
        } catch (error) {
            if (token === this.attemptToken) this.handlePlayRejection(error);
        }
    }

    private async playTrack(track: MusicTrack): Promise<void> {
        this.currentTrack = track;
        this.currentSources = this.getSources(track);
        this.currentSourceIndex = 0;

        if (this.currentSources.length === 0) {
            await this.tryNextTrackAfterFailure();
            return;
        }

        await this.playCurrentSource();
    }

    private async playCurrentSource(): Promise<void> {
        const source = this.currentSources[this.currentSourceIndex];
        if (!source) {
            await this.tryNextTrackAfterFailure();
            return;
        }

        const token = ++this.attemptToken;
        this.audio.pause();
        this.audio.src = source.url;
        this.audio.preload = 'none';
        this.setState('loading');

        try {
            await this.audio.play();
        } catch (error) {
            if (token !== this.attemptToken) return;
            if (error instanceof DOMException && error.name === 'NotAllowedError') {
                this.setState('stopped');
                return;
            }
            await this.tryFallbackOrNextTrack();
        }
    }

    private async tryFallbackOrNextTrack(): Promise<void> {
        this.attemptToken++;
        if (this.currentSourceIndex + 1 < this.currentSources.length) {
            this.currentSourceIndex++;
            await this.playCurrentSource();
            return;
        }

        await this.tryNextTrackAfterFailure();
    }

    private async tryNextTrackAfterFailure(): Promise<void> {
        this.failedTrackCount++;
        if (this.failedTrackCount >= this.tracks.length) {
            this.audio.pause();
            this.audio.removeAttribute('src');
            this.audio.load();
            this.currentTrack = null;
            this.currentSources = [];
            this.setState('error');
            return;
        }

        await this.playTrack(this.takeNextTrack());
    }

    private handlePlayRejection(error: unknown): void {
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
            this.setState('stopped');
            return;
        }

        void this.tryFallbackOrNextTrack();
    }

    private getSources(track: MusicTrack): MusicSource[] {
        const sources: MusicSource[] = [];
        if (this.supportsOpus && track.opusUrl) sources.push({ format: 'opus', url: track.opusUrl });
        if (track.mp3Url) sources.push({ format: 'mp3', url: track.mp3Url });
        if (!this.supportsOpus && sources.length === 0 && track.opusUrl) {
            sources.push({ format: 'opus', url: track.opusUrl });
        }
        return sources;
    }

    private takeNextTrack(): MusicTrack {
        if (this.playlistIndex >= this.playlist.length) this.shufflePlaylist();
        return this.playlist[this.playlistIndex++];
    }

    private shufflePlaylist(): void {
        const previousTrackId = this.currentTrack?.id ?? null;
        this.playlist = [...this.tracks];

        for (let index = this.playlist.length - 1; index > 0; index--) {
            const randomIndex = Math.floor(Math.random() * (index + 1));
            [this.playlist[index], this.playlist[randomIndex]] = [this.playlist[randomIndex], this.playlist[index]];
        }

        if (previousTrackId && this.playlist.length > 1 && this.playlist[0].id === previousTrackId) {
            [this.playlist[0], this.playlist[1]] = [this.playlist[1], this.playlist[0]];
        }
        this.playlistIndex = 0;
    }

    private setState(state: MusicPlaybackState): void {
        if (this.state === state) return;
        this.state = state;
        this.listeners.forEach((listener) => listener(state));
    }

    private clampVolume(volume: number): number {
        return Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : CONFIG.AUDIO.DEFAULT_VOLUME;
    }
}

export const musicManager = new MusicManager(MUSIC_CATALOG, CONFIG.AUDIO.DEFAULT_VOLUME);
