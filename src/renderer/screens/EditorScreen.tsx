import { useState, useEffect, useRef, useCallback } from 'react';
import WaveformPlaylist from 'waveform-playlist';
import { SessionConfig } from './SetupScreen';

interface EditorScreenProps {
  config: SessionConfig;
  trackFiles: string[];
  onNewSession: () => void;
  onExport: () => void;
}

export default function EditorScreen({
  config,
  trackFiles,
  onNewSession,
  onExport,
}: EditorScreenProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playlistRef = useRef<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || trackFiles.length === 0) return;

    // Clear previous playlist
    containerRef.current.innerHTML = '';

    const playlist = WaveformPlaylist({
      container: containerRef.current,
      timescale: true,
      state: 'select',
      samplesPerPixel: 1000,
      waveHeight: 80,
      colors: {
        waveOutlineColor: '#e94560',
        timeColor: '#a0a0b8',
        fadeColor: 'rgba(233, 69, 96, 0.3)',
      },
      controls: {
        show: true,
        width: 150,
      },
      zoomLevels: [500, 1000, 2000, 4000],
    });

    playlistRef.current = playlist;

    // Build track list from saved files
    const tracks = trackFiles.map((filename, i) => ({
      src: `file://${config.saveFolder.replace(/\\/g, '/')}/${filename}`,
      name: filename.replace(/\.webm$/, '').replace(/_/g, ' '),
    }));

    playlist
      .load(tracks)
      .then(() => {
        setIsLoading(false);
        playlist.initExporter();
      })
      .catch((err: Error) => {
        setError(`Failed to load tracks: ${err.message}`);
        setIsLoading(false);
      });

    return () => {
      // Cleanup
      if (playlistRef.current) {
        try {
          playlistRef.current.clear();
        } catch {
          // ignore cleanup errors
        }
      }
    };
  }, [trackFiles, config.saveFolder]);

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
      // Trim selected region
      playlistRef.current.trim();
    }
  }, []);

  const handleBleep = useCallback(() => {
    if (!playlistRef.current) return;
    // The bleep censor generates a 1-second 1kHz tone and replaces the selection
    // For now we use the built-in censor approach via Web Audio API
    const ee = playlistRef.current.getEventEmitter();
    ee.emit('statechange', 'select');

    // Generate a 1-second bleep tone
    const audioCtx = new AudioContext();
    const duration = 1.0;
    const sampleRate = audioCtx.sampleRate;
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.sin(2 * Math.PI * 1000 * (i / sampleRate)) * 0.5;
    }
    audioCtx.close();

    alert(
      'Select a region on a track first, then use Cut to remove it. Bleep censor will be implemented with the full audio processing pipeline.'
    );
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

  const handleRemoveDeadAir = useCallback(() => {
    alert(
      'Dead air removal will scan all tracks for silence and remove it. This will be connected to the dead-air-remover module.'
    );
  }, []);

  const handleExport = useCallback(() => {
    onExport();
  }, [onExport]);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>
          Editor: {config.sessionName}
        </h2>
        <div style={styles.headerButtons}>
          <button onClick={onNewSession} style={styles.secondaryBtn}>
            New Session
          </button>
          <button onClick={handleExport} style={styles.exportBtn}>
            Export
          </button>
        </div>
      </div>

      {error && <p style={styles.error}>{error}</p>}
      {isLoading && <p style={styles.loading}>Loading tracks...</p>}

      {/* Toolbar */}
      <div style={styles.toolbar}>
        {/* Playback controls */}
        <div style={styles.toolGroup}>
          {!isPlaying ? (
            <button onClick={handlePlay} style={styles.toolBtn}>
              Play
            </button>
          ) : (
            <button onClick={handlePause} style={styles.toolBtn}>
              Pause
            </button>
          )}
          <button onClick={handleStop} style={styles.toolBtn}>
            Stop
          </button>
        </div>

        <div style={styles.divider} />

        {/* Edit controls */}
        <div style={styles.toolGroup}>
          <button onClick={handleCut} style={styles.toolBtn}>
            Cut Selection
          </button>
          <button onClick={handleBleep} style={styles.toolBtn}>
            Bleep (1s)
          </button>
        </div>

        <div style={styles.divider} />

        {/* Fade controls */}
        <div style={styles.toolGroup}>
          <button onClick={handleFadeOut} style={styles.toolBtn}>
            Fade All Out
          </button>
          <button onClick={handleFadeIn} style={styles.toolBtn}>
            Fade All In
          </button>
        </div>

        <div style={styles.divider} />

        {/* Cleanup */}
        <div style={styles.toolGroup}>
          <button onClick={handleRemoveDeadAir} style={styles.toolBtnAccent}>
            Remove Dead Air
          </button>
        </div>
      </div>

      {/* Waveform timeline */}
      <div ref={containerRef} style={styles.timeline} />

      {/* Track info */}
      <div style={styles.trackInfo}>
        {trackFiles.map((f) => (
          <span key={f} style={styles.trackBadge}>
            {f.replace(/\.webm$/, '').replace(/_/g, ' ')}
          </span>
        ))}
      </div>
    </div>
  );
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
    padding: '6px 12px',
    borderRadius: 4,
    fontSize: 12,
    border: 'none',
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  },
  toolBtnAccent: {
    background: '#e94560',
    color: '#fff',
    padding: '6px 12px',
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
  trackInfo: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap' as const,
  },
  trackBadge: {
    background: '#16213e',
    color: '#a0a0b8',
    padding: '4px 10px',
    borderRadius: 4,
    fontSize: 11,
  },
};
