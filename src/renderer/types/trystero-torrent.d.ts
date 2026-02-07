declare module 'trystero/torrent' {
  interface BaseRoomConfig {
    appId: string;
    password?: string;
    rtcConfig?: RTCConfiguration;
  }

  interface RelayConfig {
    relayUrls?: string[];
    relayRedundancy?: number;
  }

  type ActionSender<T> = (data: T, targetPeers?: string[]) => void;
  type ActionReceiver<T> = (callback: (data: T, peerId: string) => void) => void;
  type ActionProgress = (
    callback: (percent: number, peerId: string, metadata?: Record<string, unknown>) => void
  ) => void;

  interface Room {
    makeAction<T>(
      namespace: string
    ): [ActionSender<T>, ActionReceiver<T>, ActionProgress];
    ping(peerId: string): Promise<number>;
    leave(): void;
    getPeers(): string[];
    addStream(
      stream: MediaStream,
      targetPeers?: string[],
      metadata?: Record<string, unknown>
    ): Promise<void>[];
    removeStream(stream: MediaStream, targetPeers?: string[]): void;
    addTrack(
      track: MediaStreamTrack,
      stream: MediaStream,
      targetPeers?: string[],
      metadata?: Record<string, unknown>
    ): Promise<void>[];
    removeTrack(
      track: MediaStreamTrack,
      stream: MediaStream,
      targetPeers?: string[]
    ): void;
    replaceTrack(
      oldTrack: MediaStreamTrack,
      newTrack: MediaStreamTrack,
      stream: MediaStream,
      targetPeers?: string[]
    ): Promise<void>[];
    onPeerJoin(callback: (peerId: string) => void): void;
    onPeerLeave(callback: (peerId: string) => void): void;
    onPeerStream(
      callback: (stream: MediaStream, peerId: string, metadata?: Record<string, unknown>) => void
    ): void;
    onPeerTrack(
      callback: (track: MediaStreamTrack, stream: MediaStream, peerId: string, metadata?: Record<string, unknown>) => void
    ): void;
    selfId: string;
  }

  export function joinRoom(
    config: BaseRoomConfig & RelayConfig,
    roomId: string
  ): Room;

  export function getRelaySockets(): Record<string, WebSocket>;
  export const selfId: string;

  export { Room, BaseRoomConfig, RelayConfig };
}
