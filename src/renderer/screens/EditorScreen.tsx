import { useState, useEffect, useRef, useCallback } from 'react';
import WaveformPlaylist from 'waveform-playlist';
import { SessionConfig } from './SetupScreen';

interface EditorScreenProps {
  config: SessionConfig;
  trackFiles: string[];
  onNewSession: () => void;
  onExport: () => void;
}

const TRACK_COLORS = [
  { wave: '#e94560', bg: 'rgba(233, 69, 96, 0.15)' },
  { wave: '#4fc3f7', bg: 'rgba(79, 195, 247, 0.15)' },
  { wave: '#81c784', bg: 'rgba(129, 199, 132, 0.15)' },
  { wave: '#ffb74d', bg: 'rgba(255, 183, 77, 0.15)' },
];

export default function EditorScreen({
  config,
  trackFiles,
  onNewSession,
  onExport,
}: EditorScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playlistRef = useRef<any>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingDeadAir, setProcessingDeadAir] = useState(false);

  useEffect(() => {
    if (!containerRef.current || trackFiles.length === 0) return;

    // Clear previous playlist
    containerRef.current.innerHTML = '';

    const playlist = WaveformPlaylist({
      container: containerRef.current,
      timescale: true,
      state: 'select',
      samplesPerPixel: 1000,
      waveHeight: 100,
      colors: {
        waveOutlineColor: '#e94560',
        timeColor: '#a0a0b8',
        fadeColor: 'rgba(233, 69, 96, 0.3)',
      },
      controls: {
        show: true,
        width: 180,
      },
      zoomLevels: [500, 1000, 2000, 4000],
    });

    playlistRef.current = playlist;

    // Build track list with distinct colors and clean names
    const tracks = trackFiles.map((filename, i) => {
      const color = TRACK_COLORS[i % TRACK_COLORS.length];
      const rawName = filename.replace(/\.(wav|webm)$/, '').replace(/_/g, ' ');
      const parts = rawName.split(' ');
      const name = parts.length >= 3
        ? parts.slice(1, -1).join(' ')
        : rawName;
      // Use file:// protocol with proper path formatting
      const folder = config.saveFolder.replace(/\\/g, '/');
      const src = `file:///${folder.replace(/^\//, '')}/${filename}`;
      return {
        src,
        name,
        waveOutlineColor: color.wave,
        backgroundColor: color.bg,
      };
    });

    playlist
      .load(tracks)
      .then(() => {
        setIsLoading(false);
        playlist.initExporter();
        injectTrackStyles();
      })
      .catch((err: Error) => {
        setError(`Failed to load tracks: ${err.message}`);
        setIsLoading(false);
      });

    return () => {
      if (playlistRef.current) {
        try {
          playlistRef.current.clear();
        } catch {
          // ignore cleanup errors
        }
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, [trackFiles, config.saveFolder]);

  function injectTrackStyles() {
    const existing = document.getElementById('track-color-styles');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'track-color-styles';
    style.textContent = `
      .playlist-tracks .channel-wrapper {
        margin-bottom: 4px;
        border-radius: 4px;
      }
      .playlist-tracks .controls {
        background: #16213e !important;
        border-right: 2px solid #0f3460;
        padding: 8px !important;
      }
      .playlist-tracks .controls header {
        color: #e0e0e0 !important;
        font-size: 13px !important;
        font-weight: 600 !important;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        max-width: 160px;
      }
      .playlist-time-scale {
        background: #0d1117 !important;
        color: #a0a0b8 !important;
      }
      .cursor {
        background: #fff !important;
        width: 2px !important;
      }
      .selection.point {
        background: rgba(233, 69, 96, 0.4) !important;
      }
      .selection {
        background: rgba(233, 69, 96, 0.25) !important;
      }
      .channel {
        background: #0d1117 !important;
      }
      .playlist-tracks {
        cursor: crosshair;
      }
    `;
    document.head.appendChild(style);
  }

  const handlePlay = useCallback(() => {
    if (playlistRef.current) {
      playlistRef.current.play();
      setIsPlaying(true);
    }
  }, []);

  const handlePause = useCallback(() => {
    if (playlistRef.current) {
      playlistRef.current.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleStop = useCallback(() => {
    if (playlistRef.current) {
      playlistRef.current.stop();
      setIsPlaying(false);
    }
  }, []);

  const handleCut = useCallback(() => {
    if (playlistRef.current) {
      // Use the event emitter to trigger trim (removes selected region)
      const ee = playlistRef.current.getEventEmitter();
      ee.emit('trim');
    }
  }, []);

  const handleBleep = useCallback(() => {
    if (!playlistRef.current) return;

    // Generate a 1-second 1kHz bleep tone and load it as a new track
    const ctx = new AudioContext();
    const duration = 1.0;
    const sampleRate = ctx.sampleRate;
    const buffer = ctx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin(2 * Math.PI * 1000 * (i / sampleRate)) * 0.5;
    }

    const wavBlob = audioBufferToWav(buffer);
    const blobUrl = URL.createObjectURL(wavBlob);

    playlistRef.current.load([{
      src: blobUrl,
      name: 'Bleep',
      waveOutlineColor: '#ff0000',
    }]).then(() => {
      ctx.close();
    });
  }, []);

  const handleFadeOut = useCallback(() => {
    if (playlistRef.current) {
      const ee = playlistRef.current.getEventEmitter();
      ee.emit('fadeout');
    }
  }, []);

  const handleFadeIn = useCallback(() => {
    if (playlistRef.current) {
      const ee = playlistRef.current.getEventEmitter();
      ee.emit('fadein');
    }
  }, []);

  const handleRemoveDeadAir = useCallback(async () => {
    if (!playlistRef.current) return;
    setProcessingDeadAir(true);

    try {
      const { detectDeadAirAcrossTracks } = await import('../lib/dead-air-remover');

      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;

      const buffers: AudioBuffer[] = [];
      for (const filename of trackFiles) {
        const folder = config.saveFolder.replace(/\\/g, '/');
        const filePath = `file:///${folder.replace(/^\//, '')}/${filename}`;
        const response = await fetch(filePath);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        buffers.push(audioBuffer);
      }

      const deadAirRegions = detectDeadAirAcrossTracks(buffers, {
        silenceThreshold: 0.01,
        minSilenceDuration: 1.5,
        padding: 0.3,
      });

      if (deadAirRegions.length === 0) {
        alert('No dead air detected in the recording.');
        setProcessingDeadAir(false);
        return;
      }

      const totalDeadAir = deadAirRegions.reduce(
        (sum, r) => sum + (r.end - r.start),
        0
      );

      // Process from end to start so positions don't shift
      const sortedRegions = [...deadAirRegions].sort((a, b) => b.start - a.start);
      const ee = playlistRef.current.getEventEmitter();

      for (const region of sortedRegions) {
        ee.emit('select', region.start, region.end);
        await new Promise((resolve) => setTimeout(resolve, 50));
        playlistRef.current.trim();
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      alert(
        `Removed ${deadAirRegions.length} dead air region(s), totaling ${totalDeadAir.toFixed(1)} seconds.`
      );
    } catch (err) {
      alert(
        `Dead air removal failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setProcessingDeadAir(false);
    }
  }, [trackFiles, config.saveFolder]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Editor: {config.sessionName}</h2>
        <div style={styles.headerButtons}>
          <button onClick={onNewSession} style={styles.secondaryBtn}>
            New Session
          </button>
          <button onClick={onExport} style={styles.exportBtn}>
            Export
          </button>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {isLoading && <p style={styles.loading}>Loading tracks...</p>}

      {/* Toolbar */}
      <div style={styles.toolbar}>
        <div style={styles.toolGroup}>
          {!isPlaying ? (
            <button onClick={handlePlay} style={styles.toolBtn}>
              &#9654; Play
            </button>
          ) : (
            <button onClick={handlePause} style={styles.toolBtn}>
              &#10074;&#10074; Pause
            </button>
          )}
          <button onClick={handleStop} style={styles.toolBtn}>
            &#9632; Stop
          </button>
        </div>

        <div style={styles.divider} />

        <div style={styles.toolGroup}>
          <button onClick={handleCut} style={styles.toolBtn}>
            Cut Selection
          </button>
          <button onClick={handleBleep} style={styles.toolBtn}>
            Bleep (1s)
          </button>
        </div>

        <div style={styles.divider} />

        <div style={styles.toolGroup}>
          <button onClick={handleFadeOut} style={styles.toolBtn}>
            Fade Out
          </button>
          <button onClick={handleFadeIn} style={styles.toolBtn}>
            Fade In
          </button>
        </div>

        <div style={styles.divider} />

        <div style={styles.toolGroup}>
          <button
            onClick={handleRemoveDeadAir}
            disabled={processingDeadAir}
            style={{
              ...styles.toolBtnAccent,
              opacity: processingDeadAir ? 0.5 : 1,
            }}
          >
            {processingDeadAir ? 'Processing...' : 'Remove Dead Air'}
          </button>
        </div>
      </div>

      {/* Waveform timeline */}
      <div ref={containerRef} style={styles.timeline} />

      {/* Track legend */}
      <div style={styles.trackLegend}>
        {trackFiles.map((f, i) => {
          const color = TRACK_COLORS[i % TRACK_COLORS.length];
          const parts = f.replace(/\.(wav|webm)$/, '').replace(/_/g, ' ').split(' ');
          const name = parts.length >= 3 ? parts.slice(1, -1).join(' ') : parts.join(' ');
          return (
            <div key={f} style={styles.legendItem}>
              <div style={{ ...styles.legendDot, background: color.wave }} />
              <span style={styles.legendName}>{name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const result = new ArrayBuffer(length);
  const view = new DataView(result);
  const channels: Float32Array[] = [];

  let offset = 0;
  function writeString(s: string) {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
    offset += s.length;
  }

  writeString('RIFF');
  view.setUint32(offset, length - 8, true); offset += 4;
  writeString('WAVE');
  writeString('fmt ');
  view.setUint32(offset, 16, true); offset += 4;
  view.setUint16(offset, 1, true); offset += 2;
  view.setUint16(offset, numOfChan, true); offset += 2;
  view.setUint32(offset, buffer.sampleRate, true); offset += 4;
  view.setUint32(offset, buffer.sampleRate * 2 * numOfChan, true); offset += 4;
  view.setUint16(offset, numOfChan * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2;
  writeString('data');
  view.setUint32(offset, length - offset - 4, true); offset += 4;

  for (let i = 0; i < numOfChan; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numOfChan; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return new Blob([result], { type: 'audio/wav' });
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100vh',
    padding: '16px 24px',
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
  headerButtons: {
    display: 'flex',
    gap: 8,
  },
  secondaryBtn: {
    background: '#16213e',
    color: '#e0e0e0',
    padding: '8px 16px',
    borderRadius: 6,
    fontSize: 13,
    border: '1px solid #0f3460',
    cursor: 'pointer',
  },
  exportBtn: {
    background: '#e94560',
    color: '#fff',
    padding: '8px 20px',
    borderRadius: 6,
    fontSize: 13,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
  },
  error: {
    color: '#ff6b6b',
    background: '#2a1a1a',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
  },
  loading: {
    color: '#a0a0b8',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center' as const,
    padding: 40,
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 12px',
    background: '#16213e',
    borderRadius: 8,
    flexWrap: 'wrap' as const,
  },
  toolGroup: {
    display: 'flex',
    gap: 4,
  },
  toolBtn: {
    background: '#0f3460',
    color: '#e0e0e0',
    padding: '6px 14px',
    borderRadius: 4,
    fontSize: 12,
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
    fontWeight: 500,
  },
  toolBtnAccent: {
    background: '#e94560',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: 4,
    fontSize: 12,
    fontWeight: 600,
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  divider: {
    width: 1,
    height: 24,
    background: '#0f3460',
  },
  timeline: {
    flex: 1,
    background: '#0d1117',
    borderRadius: 8,
    overflow: 'auto',
    minHeight: 200,
  },
  trackLegend: {
    display: 'flex',
    gap: 16,
    padding: '8px 0',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: '50%',
  },
  legendName: {
    color: '#a0a0b8',
    fontSize: 12,
  },
};
