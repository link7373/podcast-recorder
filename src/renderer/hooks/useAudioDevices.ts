import { useState, useEffect } from 'react';

interface AudioDevices {
  inputs: MediaDeviceInfo[];
  outputs: MediaDeviceInfo[];
  loading: boolean;
  error: string | null;
}

export function useAudioDevices(): AudioDevices {
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function enumerate() {
      try {
        // Request mic permission first so device labels are populated
        await navigator.mediaDevices.getUserMedia({ audio: true });
        const devices = await navigator.mediaDevices.enumerateDevices();
        setInputs(devices.filter((d) => d.kind === 'audioinput'));
        setOutputs(devices.filter((d) => d.kind === 'audiooutput'));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to enumerate devices'
        );
      } finally {
        setLoading(false);
      }
    }
    enumerate();
  }, []);

  return { inputs, outputs, loading, error };
}
