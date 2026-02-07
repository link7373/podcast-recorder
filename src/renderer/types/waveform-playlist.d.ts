declare module 'waveform-playlist' {
  interface PlaylistOptions {
    container: HTMLElement;
    timescale?: boolean;
    state?: string;
    samplesPerPixel?: number;
    waveHeight?: number;
    colors?: Record<string, string>;
    controls?: { show?: boolean; width?: number };
    zoomLevels?: number[];
  }

  interface TrackConfig {
    src: string;
    name?: string;
    gain?: number;
    muted?: boolean;
    customClass?: string;
  }

  interface Playlist {
    load(tracks: TrackConfig[]): Promise<void>;
    play(): void;
    pause(): void;
    stop(): void;
    clear(): void;
    trim(): void;
    initExporter(): void;
    getEventEmitter(): {
      emit(event: string, ...args: any[]): void;
      on(event: string, handler: (...args: any[]) => void): void;
    };
  }

  export default function WaveformPlaylist(options: PlaylistOptions): Playlist;
}
