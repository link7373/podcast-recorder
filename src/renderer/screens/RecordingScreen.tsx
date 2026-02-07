import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionConfig } from './SetupScreen';
import { createRoom, generateRoomId, getInviteLink, Peer } from '../lib/trystero-room';
import {
  TrackRecorder,
  createTrackRecorder,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  saveTrackToFile,
} from '../lib/audio-recorder';

type RecordingState = 'waiting' | 'recording' | 'paused';

interface RecordingScreenProps {
  config: SessionConfig;
  onFinished: (trackFiles: string[]) => void;
}

export default function RecordingScreen({
  config,
  onFinished,
}: RecordingScreenProps) {
  const [peers, setPeers] = useState<Map<string, Peer>>(new Map());
  const [recordingState, setRecordingState] =
    useState<RecordingState>('waiting');
  const [roomId] = useState(() => generateRoomId());
  const [inviteLink, setInviteLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const roomRef = useRef<ReturnType<typeof createRoom> | null>(null);
  const recordersRef = useRef<TrackRecorder[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set up room and local audio
  useEffect(() => {
    let cleanup = false;

    async function init() {
      // Get local mic stream
      const constraints: MediaStreamConstraints = {
        audio: config.inputDeviceId
          ? { deviceId: { exact: config.inputDeviceId } }
          : true,
      };
      const localStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (cleanup) {
        localStream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = localStream;

      // Create Trystero room
      const session = createRoom(roomId);
      roomRef.current = session;
      setInviteLink(getInviteLink(roomId));

      // Send our name to new peers
      session.room.onPeerJoin((peerId) => {
        session.sendName(config.sessionName);

        setPeers((prev) => {
          const next = new Map(prev);
          next.set(peerId, {
            id: peerId,
            name: `Guest ${next.size + 1}`,
            stream: null,
            muted: false,
          });
          return next;
        });
      });

      session.room.onPeerLeave((peerId) => {
        setPeers((prev) => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });
      });

      // Receive peer names
      const onName = (session.room as any)._onName;
      if (onName) {
        onName((name: string, peerId: string) => {
          setPeers((prev) => {
            const next = new Map(prev);
            const existing = next.get(peerId);
            if (existing) {
              next.set(peerId, { ...existing, name });
            }
            return next;
          });
        });
      }

      // Share our audio stream with peers, receive theirs
      session.room.onPeerStream((stream, peerId) => {
        setPeers((prev) => {
          const next = new Map(prev);
          const existing = next.get(peerId);
          if (existing) {
            next.set(peerId, { ...existing, stream });
          }
          return next;
        });
      });

      // Add our stream so peers can hear us
      session.room.addStream(localStream);
    }

    init();
    return () => {
      cleanup = true;
      if (roomRef.current) {
        roomRef.current.room.leave();
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [roomId, config]);

  const handleStartRecording = useCallback(() => {
    const recorders: TrackRecorder[] = [];

    // Record local mic
    if (localStreamRef.current) {
      recorders.push(
        createTrackRecorder(
          localStreamRef.current,
          'local',
          'Host',
          config.mono
        )
      );
    }

    // Record each peer's stream
    peers.forEach((peer) => {
      if (peer.stream) {
        recorders.push(
          createTrackRecorder(peer.stream, peer.id, peer.name, config.mono)
        );
      }
    });

    recordersRef.current = recorders;
    startRecording(recorders);
    setRecordingState('recording');
    setElapsed(0);

    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }, [peers, config]);

  const handlePause = () => {
    pauseRecording(recordersRef.current);
    setRecordingState('paused');
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const handleResume = () => {
    resumeRecording(recordersRef.current);
    setRecordingState('recording');
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  };

  const handleStop = async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const blobs = await stopRecording(recordersRef.current);
    const savedFiles: string[] = [];

    for (const recorder of recordersRef.current) {
      const blob = blobs.get(recorder.peerId);
      if (blob) {
        const safeName = recorder.peerName.replace(/[^a-zA-Z0-9]/g, '_');
        const filename = `${config.sessionName}_${safeName}_${recorder.peerId.slice(0, 6)}.webm`;
        await saveTrackToFile(blob, config.saveFolder, filename);
        savedFiles.push(filename);
      }
    }

    // Leave room and stop local stream
    if (roomRef.current) roomRef.current.room.leave();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
    }

    onFinished(savedFiles);
  };

  const toggleMute = (peerId: string) => {
    setPeers((prev) => {
      const next = new Map(prev);
      const peer = next.get(peerId);
      if (peer) {
        next.set(peerId, { ...peer, muted: !peer.muted });
        // Actually mute/unmute the audio
        if (peer.stream) {
          peer.stream.getAudioTracks().forEach((t) => {
            t.enabled = peer.muted; // toggling, so if currently muted -> enable
          });
        }
      }
      return next;
    });
  };

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>{config.sessionName}</h2>
        {recordingState !== 'waiting' && (
          <div style={styles.timer}>
            <span
              style={{
                ...styles.dot,
                background:
                  recordingState === 'recording' ? '#e94560' : '#ffa500',
              }}
            />
            {formatTime(elapsed)}
          </div>
        )}
      </div>

      {/* Invite Link */}
      <div style={styles.inviteSection}>
        <label style={styles.label}>Invite Link (send to guests)</label>
        <div style={styles.inviteRow}>
          <input
            type="text"
            readOnly
            value={inviteLink}
            style={styles.inviteInput}
          />
          <button onClick={copyLink} style={styles.copyBtn}>
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p style={styles.hint}>
          {peers.size === 0
            ? 'Waiting for guests to join...'
            : `${peers.size} guest${peers.size > 1 ? 's' : ''} connected`}
        </p>
      </div>

      {/* Participants */}
      <div style={styles.participants}>
        {/* Host (you) */}
        <ParticipantCard name="You (Host)" isHost muted={false} />

        {/* Remote peers */}
        {Array.from(peers.values()).map((peer) => (
          <ParticipantCard
            key={peer.id}
            name={peer.name}
            muted={peer.muted}
            onToggleMute={() => toggleMute(peer.id)}
            connected={!!peer.stream}
          />
        ))}

        {/* Empty slots */}
        {Array.from({ length: 3 - peers.size }).map((_, i) => (
          <div key={`empty-${i}`} style={styles.emptySlot}>
            <div style={styles.emptyIcon}>?</div>
            <span style={styles.emptyLabel}>Empty slot</span>
          </div>
        ))}
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        {recordingState === 'waiting' && (
          <button onClick={handleStartRecording} style={styles.recordBtn}>
            Start Recording
          </button>
        )}
        {recordingState === 'recording' && (
          <>
            <button onClick={handlePause} style={styles.pauseBtn}>
              Pause
            </button>
            <button onClick={handleStop} style={styles.stopBtn}>
              Stop & Save
            </button>
          </>
        )}
        {recordingState === 'paused' && (
          <>
            <button onClick={handleResume} style={styles.resumeBtn}>
              Resume
            </button>
            <button onClick={handleStop} style={styles.stopBtn}>
              Stop & Save
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function ParticipantCard({
  name,
  isHost,
  muted,
  onToggleMute,
  connected,
}: {
  name: string;
  isHost?: boolean;
  muted: boolean;
  onToggleMute?: () => void;
  connected?: boolean;
}) {
  const initial = name.charAt(0).toUpperCase();
  return (
    <div style={styles.participant}>
      <div
        style={{
          ...styles.avatar,
          background: isHost ? '#e94560' : '#0f3460',
          opacity: connected === false ? 0.5 : 1,
        }}
      >
        {initial}
      </div>
      <span style={styles.participantName}>{name}</span>
      {!isHost && onToggleMute && (
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
    color: '#e0e0e0',
    fontSize: 22,
    fontWeight: 600,
  },
  timer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#e0e0e0',
    fontSize: 18,
    fontFamily: 'monospace',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
    display: 'inline-block',
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
  hint: {
    color: '#a0a0b8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  participants: {
    display: 'flex',
    gap: 16,
    flexWrap: 'wrap' as const,
    flex: 1,
    alignContent: 'flex-start',
  },
  participant: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    padding: 16,
    background: '#16213e',
    borderRadius: 10,
    width: 120,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 20,
    fontWeight: 700,
  },
  participantName: {
    color: '#e0e0e0',
    fontSize: 13,
    textAlign: 'center' as const,
  },
  muteBtn: {
    padding: '4px 10px',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 11,
    border: '1px solid #0f3460',
    cursor: 'pointer',
  },
  emptySlot: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    padding: 16,
    background: '#16213e',
    borderRadius: 10,
    width: 120,
    opacity: 0.3,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#a0a0b8',
    fontSize: 20,
    border: '2px dashed #0f3460',
  },
  emptyLabel: {
    color: '#a0a0b8',
    fontSize: 12,
  },
  controls: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    paddingTop: 12,
    borderTop: '1px solid #0f3460',
  },
  recordBtn: {
    background: '#e94560',
    color: '#fff',
    padding: '12px 32px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
  },
  pauseBtn: {
    background: '#ffa500',
    color: '#1a1a2e',
    padding: '12px 32px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
  },
  resumeBtn: {
    background: '#4caf50',
    color: '#fff',
    padding: '12px 32px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
  },
  stopBtn: {
    background: '#333',
    color: '#e0e0e0',
    padding: '12px 32px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 8,
    border: '1px solid #555',
    cursor: 'pointer',
  },
};
