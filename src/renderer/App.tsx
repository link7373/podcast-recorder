import { useState, useCallback } from 'react';
import SetupScreen, { SessionConfig } from './screens/SetupScreen';
import RecordingScreen from './screens/RecordingScreen';
import EditorScreen from './screens/EditorScreen';

type Screen = 'setup' | 'recording' | 'editor';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(
    null
  );
  const [trackFiles, setTrackFiles] = useState<string[]>([]);

  const handleStartSession = (config: SessionConfig) => {
    setSessionConfig(config);
    setScreen('recording');
  };

  const handleRecordingFinished = (files: string[]) => {
    setTrackFiles(files);
    setScreen('editor');
  };

  const handleExport = useCallback(async () => {
    if (!sessionConfig) return;
    const savePath = await window.electronAPI.selectSaveFile(
      `${sessionConfig.sessionName}_mix.mp3`
    );
    if (!savePath) return;

    try {
      // Get full paths to track files
      const fullPaths = trackFiles.map(
        (f) => `${sessionConfig.saveFolder.replace(/\\/g, '/')}/${f}`
      );
      await window.electronAPI.exportMix(fullPaths, savePath);
      alert(`Export complete!\n\nSaved to: ${savePath}`);
    } catch (err) {
      alert(
        `Export failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }, [sessionConfig, trackFiles]);

  const handleNewSession = () => {
    setScreen('setup');
    setSessionConfig(null);
    setTrackFiles([]);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {screen === 'setup' && (
        <SetupScreen onStartSession={handleStartSession} />
      )}
      {screen === 'recording' && sessionConfig && (
        <RecordingScreen
          config={sessionConfig}
          onFinished={handleRecordingFinished}
        />
      )}
      {screen === 'editor' && sessionConfig && (
        <EditorScreen
          config={sessionConfig}
          trackFiles={trackFiles}
          onNewSession={handleNewSession}
          onExport={handleExport}
        />
      )}
    </div>
  );
}
