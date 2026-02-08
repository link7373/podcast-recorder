import { useState } from 'react';
import { useAudioDevices } from '../hooks/useAudioDevices';

export interface SessionConfig {
  sessionName: string;
  inputDeviceId: string;
  outputDeviceId: string;
  noiseFilter: boolean;
  inputLevel: number;
  saveFolder: string; // auto-set to temp dir; user picks location at export
}

interface SetupScreenProps {
  onStartSession: (config: SessionConfig) => void;
}

export default function SetupScreen({ onStartSession }: SetupScreenProps) {
  const { inputs, outputs, loading, error } = useAudioDevices();
  const [sessionName, setSessionName] = useState('');
  const [inputDeviceId, setInputDeviceId] = useState('');
  const [outputDeviceId, setOutputDeviceId] = useState('');
  const [noiseFilter, setNoiseFilter] = useState(true);
  const [inputLevel, setInputLevel] = useState(80);
  const canStart = sessionName.trim();

  return (
    <div style={styles.container}>
      <div style={styles.headerRow}>
        <div>
          <h1 style={styles.title}>Podcast Recorder</h1>
          <p style={styles.subtitle}>Set up your recording session</p>
        </div>
        <span style={styles.version}>v1.1.0</span>
      </div>

      {error && <p style={styles.error}>Audio error: {error}</p>}

      <div style={styles.form}>
        {/* Session Name */}
        <Field label="Session Name">
          <input
            type="text"
            placeholder="My Podcast Episode 1"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            style={styles.input}
          />
        </Field>

        {/* Audio Input */}
        <Field label="Microphone">
          {loading ? (
            <p style={styles.loading}>Detecting devices...</p>
          ) : (
            <select
              value={inputDeviceId}
              onChange={(e) => setInputDeviceId(e.target.value)}
              style={styles.input}
            >
              <option value="">System Default</option>
              {inputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* Audio Output */}
        <Field label="Speakers / Headphones">
          {loading ? (
            <p style={styles.loading}>Detecting devices...</p>
          ) : (
            <select
              value={outputDeviceId}
              onChange={(e) => setOutputDeviceId(e.target.value)}
              style={styles.input}
            >
              <option value="">System Default</option>
              {outputs.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label || `Speaker ${d.deviceId.slice(0, 8)}`}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* Toggles row */}
        <div style={styles.toggleRow}>
          <Toggle
            label="Noise Filter"
            checked={noiseFilter}
            onChange={setNoiseFilter}
          />
        </div>

        {/* Input Level */}
        <Field label={`Input Level: ${inputLevel}%`}>
          <input
            type="range"
            min={0}
            max={100}
            value={inputLevel}
            onChange={(e) => setInputLevel(Number(e.target.value))}
            style={styles.slider}
          />
        </Field>

        {/* Start Button */}
        <button
          style={{
            ...styles.startBtn,
            opacity: canStart ? 1 : 0.5,
          }}
          onClick={async () => {
            if (!canStart) return;
            const tempFolder = await window.electronAPI.getTempPath();
            onStartSession({
              sessionName: sessionName.trim(),
              inputDeviceId,
              outputDeviceId,
              noiseFilter,
              inputLevel,
              saveFolder: tempFolder,
            });
          }}
          disabled={!canStart}
        >
          Start Session
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  offLabel,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  offLabel?: string;
}) {
  return (
    <button
      onClick={() => onChange(!checked)}
      style={{
        ...styles.toggleBtn,
        background: checked ? '#e94560' : '#16213e',
        border: `1px solid ${checked ? '#e94560' : '#0f3460'}`,
      }}
    >
      {offLabel && !checked ? offLabel : label}
      {checked && ' ON'}
      {!checked && !offLabel && ' OFF'}
    </button>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '32px 40px',
    maxWidth: 560,
    margin: '0 auto',
    overflowY: 'auto',
    height: '100vh',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  title: {
    color: '#e94560',
    fontSize: 28,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    color: '#a0a0b8',
    fontSize: 14,
  },
  version: {
    color: '#555',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  error: {
    color: '#ff6b6b',
    background: '#2a1a1a',
    padding: '8px 12px',
    borderRadius: 6,
    fontSize: 13,
    marginBottom: 16,
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 18,
  },
  field: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
  },
  label: {
    fontSize: 13,
    color: '#a0a0b8',
  },
  input: {
    background: '#16213e',
    border: '1px solid #0f3460',
    borderRadius: 6,
    color: '#e0e0e0',
    padding: '8px 12px',
    fontSize: 14,
    outline: 'none',
    width: '100%',
  },
  loading: {
    color: '#a0a0b8',
    fontSize: 13,
    fontStyle: 'italic',
  },
  toggleRow: {
    display: 'flex',
    gap: 12,
  },
  toggleBtn: {
    padding: '8px 16px',
    borderRadius: 6,
    color: '#e0e0e0',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  slider: {
    width: '100%',
    accentColor: '#e94560',
  },
  startBtn: {
    background: '#e94560',
    color: '#fff',
    padding: '14px 24px',
    fontSize: 16,
    fontWeight: 600,
    borderRadius: 8,
    border: 'none',
    cursor: 'pointer',
    marginTop: 8,
  },
};
