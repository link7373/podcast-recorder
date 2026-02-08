import { useState, useEffect, useRef, useCallback } from 'react';
import { SessionConfig } from './SetupScreen';
import { GreenRoomData } from './GreenRoomScreen';
import {
  TrackRecorder,
  createTrackRecorder,
  startRecording,
  pauseRecording,
  resumeRecording,
  stopRecording,
  saveTrackToFile,
} from '../lib/audio-recorder';
import { getAudioLevel, isSpeaking } from '../hooks/useNoiseFilter';

type RecordingState = 'recording' | 'paused';

interface RecordingScreenProps {
  config: SessionConfig;
  roomData: GreenRoomData;
  onFinished: (trackFiles: string[]) => void;
}

const TRACK_COLORS = ['#e94560', '#4fc3f7', '#81c784', '#ffb74d'];

export default function RecordingScreen({
  config,
  roomData,
  onFinished,
}: RecordingScreenProps) {
  const [recordingState, setRecordingState] = useState<RecordingState>('recording');
  const [elapsed, setElapsed] = useState(0);
  const [levels, setLevels] = useState<Map<string, number>>(new Map());
  const [speaking, setSpeaking] = useState<Map<string, boolean>>(new Map());
  const [muted, setMuted] = useState<Map<string, boolean>>(new Map());
  // Live waveform data: array of snapshots { time, levels: Map<string, number> }
  const [waveformData, setWaveformData] = useState<Array<{ time: number; levels: Map<string, number> }>>([]);

  const recordersRef = useRef<TrackRecorder[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number>(0);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Build list of all participants (host + peers)
  const allParticipants = useRef<Array<{ id: string; name: string; color: string }>>([]);

  useEffect(() => {
    const parts: Array<{ id: string; name: string; color: string }> = [
      { id: 'local', name: 'You (Host)', color: TRACK_COLORS[0] },
    ];
    let i = 1;
    roomData.peers.forEach((p) => {
      parts.push({ id: p.id, name: p.name, color: TRACK_COLORS[i % TRACK_COLORS.length] });
      i++;
    });
    allParticipants.current = parts;
  }, [roomData.peers]);

  // Start recording immediately
  useEffect(() => {
    const recorders: TrackRecorder[] = [];

    // Record local filtered stream
    recorders.push(
      createTrackRecorder(roomData.filteredStream, 'local', 'Host')
    );

    // Record each peer's stream
    roomData.peers.forEach((peer) => {
      if (peer.stream) {
        recorders.push(
          createTrackRecorder(peer.stream, peer.id, peer.name)
        );
      }
    });

    recordersRef.current = recorders;
    startRecording(recorders);
    startTimeRef.current = Date.now();

    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [roomData]);

  // Audio level animation loop + waveform data collection
  useEffect(() => {
    let lastWaveformCapture = 0;

    function updateLevels() {
      const newLevels = new Map<string, number>();
      const newSpeaking = new Map<string, boolean>();

      // Host level
      if (roomData.localAnalyser) {
        const level = getAudioLevel(roomData.localAnalyser);
        newLevels.set('local', level);
        newSpeaking.set('local', isSpeaking(roomData.localAnalyser));
      }

      // Peer levels
      roomData.peers.forEach((peer) => {
        if (peer.analyser) {
          const level = getAudioLevel(peer.analyser);
          newLevels.set(peer.id, level);
          newSpeaking.set(peer.id, isSpeaking(peer.analyser));
        }
      });

      setLevels(newLevels);
      setSpeaking(newSpeaking);

      // Capture waveform snapshot every 100ms
      const now = Date.now();
      if (now - lastWaveformCapture > 100) {
        lastWaveformCapture = now;
        setWaveformData((prev) => {
          const elapsed = (now - startTimeRef.current) / 1000;
          const next = [...prev, { time: elapsed, levels: new Map(newLevels) }];
          // Keep last 600 snapshots (60 seconds of data at 100ms intervals)
          if (next.length > 600) return next.slice(-600);
          return next;
        });
      }

      animFrameRef.current = requestAnimationFrame(updateLevels);
    }
    animFrameRef.current = requestAnimationFrame(updateLevels);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [roomData]);

  // Draw waveform canvas
  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, w, h);

    if (waveformData.length < 2) return;

    const parts = allParticipants.current;
    const trackHeight = h / Math.max(parts.length, 1);
    const dataLen = waveformData.length;
    const pixelsPerSample = w / Math.min(dataLen, 600);

    parts.forEach((part, trackIdx) => {
      const baseY = trackIdx * trackHeight + trackHeight / 2;

      // Draw track separator
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, trackIdx * trackHeight);
      ctx.lineTo(w, trackIdx * trackHeight);
      ctx.stroke();

      // Draw track name
      ctx.fillStyle = part.color;
      ctx.font = '11px -apple-system, sans-serif';
      ctx.fillText(part.name, 4, trackIdx * trackHeight + 14);

      // Draw waveform — amplify levels (typically 0-0.3 range) to fill track height
      ctx.strokeStyle = part.color;
      ctx.lineWidth = 1.5;

      const startIdx = Math.max(0, dataLen - 600);
      for (let i = startIdx; i < dataLen; i++) {
        const x = (i - startIdx) * pixelsPerSample;
        const rawLevel = waveformData[i].levels.get(part.id) || 0;
        // Amplify: multiply by 4 and clamp to 0-1 range so typical speech fills the track
        const level = Math.min(rawLevel * 4, 1);
        const amplitude = level * trackHeight * 0.8;

        ctx.fillStyle = part.color;
        ctx.globalAlpha = 0.7;
        ctx.fillRect(x, baseY - amplitude / 2, Math.max(pixelsPerSample, 1), Math.max(amplitude, 1));
      }
      ctx.globalAlpha = 1;
    });

    // Draw time markers
    ctx.fillStyle = '#555';
    ctx.font = '10px monospace';
    if (waveformData.length > 0) {
      const lastTime = waveformData[waveformData.length - 1].time;
      const startTime = waveformData[Math.max(0, dataLen - 600)].time;
      for (let t = Math.ceil(startTime); t <= lastTime; t += 5) {
        const x = ((t - startTime) / (lastTime - startTime || 1)) * w;
        ctx.fillText(formatTime(t), x, h - 4);
      }
    }
  }, [waveformData]);

  const handleFadeToMute = () => {
    // Mute all participants (fade effect via disabling tracks)
    const allMuted = new Map<string, boolean>();
    allParticipants.current.forEach((part) => {
      allMuted.set(part.id, true);
    });
    setMuted(allMuted);

    // Actually mute all audio tracks
    if (roomData.filteredStream) {
      roomData.filteredStream.getAudioTracks().forEach((t) => { t.enabled = false; });
    }
    roomData.peers.forEach((peer) => {
      if (peer.stream) {
        peer.stream.getAudioTracks().forEach((t) => { t.enabled = false; });
      }
    });
  };

  const handleFadeBackIn = () => {
    // Unmute all participants
    setMuted(new Map());

    // Re-enable all audio tracks
    if (roomData.filteredStream) {
      roomData.filteredStream.getAudioTracks().forEach((t) => { t.enabled = true; });
    }
    roomData.peers.forEach((peer) => {
      if (peer.stream) {
        peer.stream.getAudioTracks().forEach((t) => { t.enabled = true; });
      }
    });
  };

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

  const [isSaving, setIsSaving] = useState(false);

  const handleStop = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    cancelAnimationFrame(animFrameRef.current);
    setIsSaving(true);

    try {
      const blobs = await stopRecording(recordersRef.current);
      const savedFiles: string[] = [];

      for (const recorder of recordersRef.current) {
        const blob = blobs.get(recorder.peerId);
        if (blob) {
          const safeName = recorder.peerName.replace(/[^a-zA-Z0-9]/g, '_');
          const filename = `${config.sessionName}_${safeName}_${recorder.peerId.slice(0, 6)}.wav`;
          try {
            await saveTrackToFile(blob, config.saveFolder, filename);
            savedFiles.push(filename);
          } catch (err) {
            console.error(`Failed to save track ${filename}:`, err);
          }
        }
      }

      // Leave room and stop local stream
      if (roomData.room) roomData.room.room.leave();
      if (roomData.localStream) {
        roomData.localStream.getTracks().forEach((t: MediaStreamTrack) => t.stop());
      }
      if (roomData.noiseFilter) {
        roomData.noiseFilter.cleanup();
      }

      onFinished(savedFiles);
    } catch (err) {
      console.error('Error stopping recording:', err);
      alert(`Error saving recording: ${err instanceof Error ? err.message : String(err)}`);
      setIsSaving(false);
    }
  };

  const toggleMute = (peerId: string) => {
    setMuted((prev) => {
      const next = new Map(prev);
      const wasMuted = next.get(peerId) || false;
      next.set(peerId, !wasMuted);

      // Actually mute/unmute the audio
      if (peerId === 'local' && roomData.filteredStream) {
        roomData.filteredStream.getAudioTracks().forEach((t) => {
          t.enabled = wasMuted; // toggle
        });
      } else {
        const peer = roomData.peers.get(peerId);
        if (peer?.stream) {
          peer.stream.getAudioTracks().forEach((t) => {
            t.enabled = wasMuted;
          });
        }
      }
      return next;
    });
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>{config.sessionName}</h2>
        <div style={styles.timer}>
          <span
            style={{
              ...styles.dot,
              background: recordingState === 'recording' ? '#e94560' : '#ffa500',
              animation: recordingState === 'recording' ? 'pulse 1s infinite' : 'none',
            }}
          />
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Main area: Participants left, Waveform right */}
      <div style={styles.mainArea}>
        {/* Participant column */}
        <div style={styles.participantColumn}>
          {allParticipants.current.map((part) => (
            <div
              key={part.id}
              style={{
                ...styles.participantCard,
                borderColor: speaking.get(part.id) ? '#4caf50' : '#0f3460',
                boxShadow: speaking.get(part.id) ? '0 0 8px rgba(76,175,80,0.3)' : 'none',
              }}
            >
              <div style={{ ...styles.avatar, background: part.color }}>
                {part.name.charAt(0).toUpperCase()}
              </div>
              <span style={styles.participantName}>{part.name}</span>
              {/* Level meter */}
              <div style={styles.levelBar}>
                <div
                  style={{
                    ...styles.levelFill,
                    width: `${Math.min((levels.get(part.id) || 0) * 300, 100)}%`,
                    background: part.color,
                  }}
                />
              </div>
              <button
                onClick={() => toggleMute(part.id)}
                style={{
                  ...styles.muteBtn,
                  background: muted.get(part.id) ? '#e94560' : '#16213e',
                }}
              >
                {muted.get(part.id) ? 'Unmute' : 'Mute'}
              </button>
            </div>
          ))}
        </div>

        {/* Live waveform canvas */}
        <div style={styles.waveformContainer}>
          <canvas
            ref={waveformCanvasRef}
            style={styles.waveformCanvas}
          />
        </div>
      </div>

      {/* Controls */}
      <div style={styles.controls}>
        {isSaving ? (
          <span style={{ color: '#ffa500', fontSize: 16, fontWeight: 600 }}>
            Saving tracks... please wait
          </span>
        ) : (
          <>
            <button onClick={handleFadeToMute} style={styles.fadeBtn}>
              Fade to Mute
            </button>
            <button onClick={handleFadeBackIn} style={styles.fadeBtn}>
              Fade Back In
            </button>

            <div style={styles.controlDivider} />

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
          </>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    gap: 12,
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    color: '#e0e0e0',
    fontSize: 20,
    fontWeight: 600,
  },
  timer: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#e0e0e0',
    fontSize: 20,
    fontFamily: 'monospace',
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: '50%',
    display: 'inline-block',
  },
  mainArea: {
    display: 'flex',
    flex: 1,
    gap: 16,
    overflow: 'hidden',
  },
  participantColumn: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
    width: 140,
    flexShrink: 0,
  },
  participantCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 6,
    padding: 12,
    background: '#16213e',
    borderRadius: 10,
    border: '2px solid #0f3460',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: 18,
    fontWeight: 700,
  },
  participantName: {
    color: '#e0e0e0',
    fontSize: 12,
    textAlign: 'center' as const,
  },
  levelBar: {
    width: '100%',
    height: 4,
    background: '#0d1117',
    borderRadius: 2,
    overflow: 'hidden',
  },
  levelFill: {
    height: '100%',
    borderRadius: 2,
    transition: 'width 0.05s',
  },
  muteBtn: {
    padding: '3px 8px',
    borderRadius: 4,
    color: '#e0e0e0',
    fontSize: 10,
    border: '1px solid #0f3460',
    cursor: 'pointer',
  },
  waveformContainer: {
    flex: 1,
    background: '#0d1117',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative' as const,
  },
  waveformCanvas: {
    width: '100%',
    height: '100%',
    display: 'block',
  },
  controls: {
    display: 'flex',
    gap: 12,
    justifyContent: 'center',
    paddingTop: 12,
    borderTop: '1px solid #0f3460',
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
  fadeBtn: {
    background: '#0f3460',
    color: '#e0e0e0',
    padding: '12px 20px',
    fontSize: 14,
    fontWeight: 500,
    borderRadius: 8,
    border: '1px solid #1e4a7a',
    cursor: 'pointer',
  },
  controlDivider: {
    width: 1,
    height: 32,
    background: '#0f3460',
    margin: '0 8px',
  },
};
