import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionConfig } from './SetupScreen';
import { createRoom, generateRoomId, getInviteLink, Peer } from '../lib/trystero-room';
import {
  createNoiseFilteredStream,
  getAudioLevel,
  isSpeaking,
  NoiseFilterResult,
} from '../hooks/useNoiseFilter';

type ConnectionStatus = 'empty' | 'connecting' | 'connected' | 'poor';

interface ParticipantInfo {
  id: string;
  name: string;
  stream: MediaStream | null;
  muted: boolean;
  status: ConnectionStatus;
  audioLevel: number;
  speaking: boolean;
  analyser: AnalyserNode | null;
}

interface GreenRoomScreenProps {
  config: SessionConfig;
  onStartRecording: (roomData: GreenRoomData) => void;
}

export interface GreenRoomData {
  roomId: string;
  room: any;
  localStream: MediaStream;
  filteredStream: MediaStream;
  peers: Map<string, ParticipantInfo>;
  localAnalyser: AnalyserNode;
  noiseFilter: NoiseFilterResult;
}

export default function GreenRoomScreen({
  config,
  onStartRecording,
}: GreenRoomScreenProps) {
  const [participants, setParticipants] = useState<Map<string, ParticipantInfo>>(new Map());
  const [roomId] = useState(() => generateRoomId());
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [localLevel, setLocalLevel] = useState(0);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [localMuted, setLocalMuted] = useState(false);

  const roomRef = useRef<ReturnType<typeof createRoom> | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const noiseFilterRef = useRef<NoiseFilterResult | null>(null);
  const animFrameRef = useRef<number>(0);
  const peerAnalysersRef = useRef<Map<string, { analyser: AnalyserNode; cleanup: () => void }>>(new Map());

  // Set up room and local audio
  useEffect(() => {
    let cleanup = false;

    async function init() {
      // Get local mic with noise suppression if enabled
      const audioConstraints: MediaTrackConstraints = {
        noiseSuppression: config.noiseFilter,
        echoCancellation: true,
        autoGainControl: true,
      };
      if (config.inputDeviceId) {
        audioConstraints.deviceId = { exact: config.inputDeviceId };
      }

      const localStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });
      if (cleanup) {
        localStream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = localStream;

      // Apply noise filter chain
      const filterResult = createNoiseFilteredStream(
        localStream,
        config.noiseFilter,
        config.inputLevel
      );
      noiseFilterRef.current = filterResult;

      // Create Trystero room
      const session = createRoom(roomId);
      roomRef.current = session;
      setInviteLink(getInviteLink(roomId));

      // Peer join
      session.room.onPeerJoin((peerId: string) => {
        session.sendName(config.sessionName);

        setParticipants((prev) => {
          const next = new Map(prev);
          next.set(peerId, {
            id: peerId,
            name: `Guest ${next.size + 1}`,
            stream: null,
            muted: false,
            status: 'connecting',
            audioLevel: 0,
            speaking: false,
            analyser: null,
          });
          return next;
        });
      });

      // Peer leave
      session.room.onPeerLeave((peerId: string) => {
        setParticipants((prev) => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
        // Cleanup analyser for this peer
        const peerAnalyser = peerAnalysersRef.current.get(peerId);
        if (peerAnalyser) {
          peerAnalyser.cleanup();
          peerAnalysersRef.current.delete(peerId);
        }
      });

      // Receive peer names
      const onName = (session.room as any)._onName;
      if (onName) {
        onName((name: string, peerId: string) => {
          setParticipants((prev) => {
            const next = new Map(prev);
            const existing = next.get(peerId);
            if (existing) {
              next.set(peerId, { ...existing, name });
            }
            return next;
          });
        });
      }

      // Peer streams
      session.room.onPeerStream((stream: MediaStream, peerId: string) => {
        // Create analyser for peer audio
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        // Play peer audio so everyone can hear in green room
        const audio = new Audio();
        audio.srcObject = stream;
        audio.play();

        peerAnalysersRef.current.set(peerId, {
          analyser,
          cleanup: () => audioCtx.close(),
        });

        setParticipants((prev) => {
          const next = new Map(prev);
          const existing = next.get(peerId);
          if (existing) {
            next.set(peerId, {
              ...existing,
              stream,
              status: 'connected',
              analyser,
            });
          }
          return next;
        });
      });

      // Share our filtered audio stream with peers
      session.room.addStream(filterResult.outputStream);
    }

    init();
    return () => {
      cleanup = true;
      cancelAnimationFrame(animFrameRef.current);
      if (roomRef.current) {
        roomRef.current.room.leave();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (noiseFilterRef.current) {
        noiseFilterRef.current.cleanup();
      }
      peerAnalysersRef.current.forEach((p) => p.cleanup());
      peerAnalysersRef.current.clear();
    };
  }, [roomId, config]);

  // Audio level animation loop
  useEffect(() => {
    function updateLevels() {
      // Update local level
      if (noiseFilterRef.current) {
        const level = getAudioLevel(noiseFilterRef.current.analyser);
        setLocalLevel(level);
        setLocalSpeaking(isSpeaking(noiseFilterRef.current.analyser));
      }

      // Update peer levels
      setParticipants((prev) => {
        let changed = false;
        const next = new Map(prev);
        next.forEach((p, id) => {
          const peerAnalyser = peerAnalysersRef.current.get(id);
          if (peerAnalyser) {
            const level = getAudioLevel(peerAnalyser.analyser);
            const speaking = isSpeaking(peerAnalyser.analyser);
            if (Math.abs(p.audioLevel - level) > 0.01 || p.speaking !== speaking) {
              next.set(id, { ...p, audioLevel: level, speaking });
              changed = true;
            }
          }
        });
        return changed ? next : prev;
      });

      animFrameRef.current = requestAnimationFrame(updateLevels);
    }
    animFrameRef.current = requestAnimationFrame(updateLevels);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, []);

  const toggleMute = (id: string) => {
    if (id === 'local') {
      // Mute/unmute host's own mic
      if (noiseFilterRef.current) {
        const tracks = noiseFilterRef.current.outputStream.getAudioTracks();
        const newMuted = !localMuted;
        tracks.forEach((t) => { t.enabled = !newMuted; });
        setLocalMuted(newMuted);
      }
    } else {
      // Mute/unmute a remote peer
      setParticipants((prev) => {
        const next = new Map(prev);
        const peer = next.get(id);
        if (peer && peer.stream) {
          const newMuted = !peer.muted;
          peer.stream.getAudioTracks().forEach((t) => { t.enabled = !newMuted; });
          next.set(id, { ...peer, muted: newMuted });
        }
        return next;
      });
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStartRecording = () => {
    if (!roomRef.current || !localStreamRef.current || !noiseFilterRef.current) return;

    // Cancel animation frame before transitioning
    cancelAnimationFrame(animFrameRef.current);

    onStartRecording({
      roomId,
      room: roomRef.current,
      localStream: localStreamRef.current,
      filteredStream: noiseFilterRef.current.outputStream,
      peers: participants,
      localAnalyser: noiseFilterRef.current.analyser,
      noiseFilter: noiseFilterRef.current,
    });
  };

  const participantList = Array.from(participants.values());
  const connectedCount = participantList.filter((p) => p.status === 'connected').length;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>{config.sessionName}</h2>
          <p style={styles.subtitle}>Green Room - everyone can talk before recording</p>
        </div>
      </div>

      {/* Invite Link */}
      <div style={styles.inviteSection}>
        <label style={styles.label}>Invite Link (send to guests)</label>
        <div style={styles.inviteRow}>
          <input type="text" readOnly value={inviteLink} style={styles.inviteInput} />
          <button onClick={copyLink} style={styles.copyBtn}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      </div>

      {/* Participants Grid */}
      <div style={styles.participantsGrid}>
        {/* Host Card */}
        <ParticipantCard
          name="You (Host)"
          status="connected"
          audioLevel={localLevel}
          speaking={localSpeaking}
          isHost
          muted={localMuted}
          onToggleMute={() => toggleMute('local')}
        />

        {/* Remote Peers */}
        {participantList.map((p) => (
          <ParticipantCard
            key={p.id}
            name={p.name}
            status={p.status}
            audioLevel={p.audioLevel}
            speaking={p.speaking}
            muted={p.muted}
            onToggleMute={() => toggleMute(p.id)}
          />
        ))}

        {/* Empty Slots */}
        {Array.from({ length: Math.max(0, 3 - participantList.length) }).map((_, i) => (
          <div key={`empty-${i}`} style={styles.emptySlot}>
            <div style={styles.emptyIcon}>?</div>
            <span style={styles.emptyLabel}>Empty Slot</span>
          </div>
        ))}
      </div>

      {/* Status bar */}
      <div style={styles.statusBar}>
        <span style={styles.statusText}>
          {connectedCount === 0
            ? 'Waiting for guests to connect...'
            : `${connectedCount} guest${connectedCount > 1 ? 's' : ''} connected`}
        </span>
        <button
          onClick={handleStartRecording}
          style={styles.startBtn}
        >
          Start Recording
        </button>
      </div>
    </div>
  );
}

function ParticipantCard({
  name,
  status,
  audioLevel,
  speaking,
  isHost,
  muted,
  onToggleMute,
}: {
  name: string;
  status: ConnectionStatus;
  audioLevel: number;
  speaking: boolean;
  isHost?: boolean;
  muted: boolean;
  onToggleMute?: () => void;
}) {
  const initial = name.charAt(0).toUpperCase();

  const statusLabels: Record<ConnectionStatus, string> = {
    empty: 'Empty Slot',
    connecting: 'Connecting...',
    connected: 'Connected',
    poor: 'Poor Connection',
  };

  const statusColors: Record<ConnectionStatus, string> = {
    empty: '#555',
    connecting: '#ffa500',
    connected: '#4caf50',
    poor: '#ff6b6b',
  };

  return (
    <div
      style={{
        ...styles.participantCard,
        borderColor: speaking ? '#4caf50' : '#0f3460',
        boxShadow: speaking ? '0 0 12px rgba(76, 175, 80, 0.4)' : 'none',
      }}
    >
      <div
        style={{
          ...styles.avatar,
          background: isHost ? '#e94560' : '#0f3460',
          borderColor: speaking ? '#4caf50' : 'transparent',
          borderWidth: 3,
          borderStyle: 'solid',
        }}
      >
        {initial}
      </div>
      <span style={styles.participantName}>{name}</span>

      {/* Status indicator */}
      <div style={styles.statusRow}>
        <div
          style={{
            ...styles.statusDot,
            background: statusColors[status],
          }}
        />
        <span style={{ ...styles.statusLabel, color: statusColors[status] }}>
          {statusLabels[status]}
        </span>
      </div>

      {/* Audio level meter */}
      <div style={styles.levelMeterBg}>
        <div
          style={{
            ...styles.levelMeterFill,
            width: `${Math.min(audioLevel * 100 * 3, 100)}%`,
            background: audioLevel > 0.3 ? '#ff6b6b' : audioLevel > 0.15 ? '#ffa500' : '#4caf50',
          }}
        />
      </div>

      {onToggleMute && (
        <button
          onClick={onToggleMute}
          style={{
            ...styles.muteBtn,
            background: muted ? '#e94560' : '#16213e',
          }}
        >
          {muted ? 'Unmute' : 'Mute'}
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '24px 32px',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    gap: 20,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#e94560',
    fontSize: 24,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    color: '#a0a0b8',
    fontSize: 14,
  },
  inviteSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 6,
  },
  label: {
    fontSize: 13,
    color: '#a0a0b8',
  },
  inviteRow: {
    display: 'flex',
    gap: 8,
  },
  inviteInput: {
    flex: 1,
    background: '#16213e',
    border: '1px solid #0f3460',
    borderRadius: 6,
    color: '#e0e0e0',
    padding: '8px 12px',
    fontSize: 13,
  },
  copyBtn: {
    background: '#0f3460',
    color: '#e0e0e0',
    padding: '8px 16px',
    borderRadius: 6,
    fontSize: 13,
    border: 'none',
    cursor: 'pointer',
  },
  participantsGrid: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap' as const,
    flex: 1,
    alignContent: 'flex-start',
  },
  participantCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    padding: 20,
    background: '#16213e',
    borderRadius: 12,
    width: 160,
    border: '2px solid #0f3460',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 22,
    fontWeight: 700,
  },
  participantName: {
    color: '#e0e0e0',
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'center' as const,
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
  },
  statusLabel: {
    fontSize: 11,
  },
  levelMeterBg: {
    width: '100%',
    height: 4,
    background: '#0d1117',
    borderRadius: 2,
    overflow: 'hidden',
  },
  levelMeterFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.05s',
  },
  muteBtn: {
    padding: '4px 12px',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 11,
    border: '1px solid #0f3460',
    cursor: 'pointer',
    fontWeight: 500,
  },
  emptySlot: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 20,
    background: '#16213e',
    borderRadius: 12,
    width: 160,
    opacity: 0.3,
    border: '2px dashed #0f3460',
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#a0a0b8',
    fontSize: 22,
    border: '2px dashed #0f3460',
  },
  emptyLabel: {
    color: '#a0a0b8',
    fontSize: 12,
  },
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 12,
    borderTop: '1px solid #0f3460',
  },
  statusText: {
    color: '#a0a0b8',
    fontSize: 14,
    fontStyle: 'italic',
  },
  startBtn: {
    background: '#e94560',
    color: '#fff',
    padding: '14px 32px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
  },
};
