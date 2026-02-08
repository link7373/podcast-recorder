export interface TrackRecorder {
  peerId: string;
  peerName: string;
  mediaRecorder: MediaRecorder;
  chunks: Blob[];
}

export function createTrackRecorder(
  stream: MediaStream,
  peerId: string,
  peerName: string
): TrackRecorder {
  const mediaRecorder = new MediaRecorder(stream, {
    mimeType: 'audio/webm;codecs=opus',
  });

  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return { peerId, peerName, mediaRecorder, chunks };
}

export function startRecording(recorders: TrackRecorder[]): void {
  for (const r of recorders) {
    r.mediaRecorder.start(1000); // collect data every second
  }
}

export function pauseRecording(recorders: TrackRecorder[]): void {
  for (const r of recorders) {
    if (r.mediaRecorder.state === 'recording') {
      r.mediaRecorder.pause();
    }
  }
}

export function resumeRecording(recorders: TrackRecorder[]): void {
  for (const r of recorders) {
    if (r.mediaRecorder.state === 'paused') {
      r.mediaRecorder.resume();
    }
  }
}

export function stopRecording(
  recorders: TrackRecorder[]
): Promise<Map<string, Blob>> {
  return new Promise((resolve) => {
    const results = new Map<string, Blob>();
    let remaining = recorders.length;

    if (remaining === 0) {
      resolve(results);
      return;
    }

    for (const r of recorders) {
      r.mediaRecorder.onstop = () => {
        const blob = new Blob(r.chunks, { type: 'audio/webm' });
        results.set(r.peerId, blob);
        remaining--;
        if (remaining === 0) resolve(results);
      };
      if (r.mediaRecorder.state !== 'inactive') {
        r.mediaRecorder.stop();
      } else {
        const blob = new Blob(r.chunks, { type: 'audio/webm' });
        results.set(r.peerId, blob);
        remaining--;
        if (remaining === 0) resolve(results);
      }
    }
  });
}

/**
 * Convert a webm blob to WAV format using Web Audio API decodeAudioData.
 * This ensures the saved files are compatible with ffmpeg and waveform-playlist.
 */
async function convertBlobToWav(blob: Blob): Promise<ArrayBuffer> {
  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

  try {
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    return audioBufferToWav(audioBuffer);
  } finally {
    await audioCtx.close();
  }
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length * numChannels * 2 + 44;
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
  view.setUint16(offset, 1, true); offset += 2; // PCM
  view.setUint16(offset, numChannels, true); offset += 2;
  view.setUint32(offset, sampleRate, true); offset += 4;
  view.setUint32(offset, sampleRate * 2 * numChannels, true); offset += 4;
  view.setUint16(offset, numChannels * 2, true); offset += 2;
  view.setUint16(offset, 16, true); offset += 2; // 16-bit
  writeString('data');
  view.setUint32(offset, length - offset - 4, true); offset += 4;

  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
  }

  return result;
}

export async function saveTrackToFile(
  blob: Blob,
  folder: string,
  filename: string
): Promise<void> {
  // Convert webm to WAV before saving
  const wavBuffer = await convertBlobToWav(blob);
  await window.electronAPI.saveFile(folder, filename, wavBuffer);
}
