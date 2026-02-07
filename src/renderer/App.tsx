import { useState, useCallback } from 'react';
import SetupScreen, { SessionConfig } from './screens/SetupScreen';
import GreenRoomScreen, { GreenRoomData } from './screens/GreenRoomScreen';
import RecordingScreen from './screens/RecordingScreen';
import EditorScreen from './screens/EditorScreen';

type Screen = 'setup' | 'greenroom' | 'recording' | 'editor';

export default function App() {
  const [screen, setScreen] = useState<Screen>('setup');
  const [sessionConfig, setSessionConfig] = useState<SessionConfig | null>(null);
  const [roomData, setRoomData] = useState<GreenRoomData | null>(null);
  const [trackFiles, setTrackFiles] = useState<string[]>([]);

  const handleStartSession = (config: SessionConfig) => {
    setSessionConfig(config);
    setScreen('greenroom');
  };

  const handleStartRecording = (data: GreenRoomData) => {
    setRoomData(data);
    setScreen('recording');
  };

  const handleRecordingFinished = (files: string[]) => {
    setTrackFiles(files);
    setRoomData(null);
    setScreen('editor');
  };

  const handleExport = useCallback(async () => {
    if (!sessionConfig) return;
    const savePath = await window.electronAPI.selectSaveFile(
      `${sessionConfig.sessionName}_mix.mp3`
    );
    if (!savePath) return;

    try {
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
    setRoomData(null);
    setTrackFiles([]);
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {screen === 'setup' && (
        <SetupScreen onStartSession={handleStartSession} />
      )}
      {screen === 'greenroom' && sessionConfig && (
        <GreenRoomScreen
          config={sessionConfig}
          onStartRecording={handleStartRecording}
        />
      )}
      {screen === 'recording' && sessionConfig && roomData && (
        <RecordingScreen
          config={sessionConfig}
          roomData={roomData}
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
