export interface TrackRecorder {
  peerId: string;
  peerName: string;
  mediaRecorder: MediaRecorder;
  chunks: Blob[];
}

export function createTrackRecorder(
  stream: MediaStream,
  peerId: string,
  peerName: string,
  mono: boolean
): TrackRecorder {
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(stream);
  const dest = audioContext.createMediaStreamDestination();

  // If mono, merge channels
  if (mono) {
    const merger = audioContext.createChannelMerger(1);
    source.connect(merger);
    merger.connect(dest);
  } else {
    source.connect(dest);
  }

  const mediaRecorder = new MediaRecorder(dest.stream, {
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

export async function saveTrackToFile(
  blob: Blob,
  folder: string,
  filename: string
): Promise<void> {
  const buffer = await blob.arrayBuffer();
  await window.electronAPI.saveFile(folder, filename, buffer);
}
