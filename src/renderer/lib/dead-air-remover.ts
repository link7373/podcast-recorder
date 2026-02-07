/**
 * Scans an AudioBuffer for silence regions and returns the time ranges to keep.
 * Leaves padding around speech so cuts sound natural.
 */

interface SilenceRegion {
  start: number;
  end: number;
}

interface KeepRegion {
  start: number;
  end: number;
}

export function detectSilence(
  buffer: AudioBuffer,
  options?: {
    silenceThreshold?: number; // RMS threshold (0-1), default 0.01
    minSilenceDuration?: number; // seconds, default 1.5
    padding?: number; // seconds of padding around speech, default 0.3
  }
): { silenceRegions: SilenceRegion[]; keepRegions: KeepRegion[] } {
  const threshold = options?.silenceThreshold ?? 0.01;
  const minDuration = options?.minSilenceDuration ?? 1.5;
  const padding = options?.padding ?? 0.3;

  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  const windowSize = Math.floor(sampleRate * 0.05); // 50ms windows

  const silenceRegions: SilenceRegion[] = [];
  let silenceStart: number | null = null;

  for (let i = 0; i < channelData.length; i += windowSize) {
    const end = Math.min(i + windowSize, channelData.length);
    let sumSquares = 0;
    for (let j = i; j < end; j++) {
      sumSquares += channelData[j] * channelData[j];
    }
    const rms = Math.sqrt(sumSquares / (end - i));

    const timeSec = i / sampleRate;

    if (rms < threshold) {
      if (silenceStart === null) silenceStart = timeSec;
    } else {
      if (silenceStart !== null) {
        const duration = timeSec - silenceStart;
        if (duration >= minDuration) {
          silenceRegions.push({ start: silenceStart, end: timeSec });
        }
        silenceStart = null;
      }
    }
  }

  // Handle trailing silence
  if (silenceStart !== null) {
    const endTime = channelData.length / sampleRate;
    if (endTime - silenceStart >= minDuration) {
      silenceRegions.push({ start: silenceStart, end: endTime });
    }
  }

  // Build keep regions (inverse of silence, with padding)
  const totalDuration = buffer.duration;
  const keepRegions: KeepRegion[] = [];

  if (silenceRegions.length === 0) {
    keepRegions.push({ start: 0, end: totalDuration });
  } else {
    let cursor = 0;
    for (const silence of silenceRegions) {
      const keepEnd = Math.min(silence.start + padding, silence.end);
      const keepStart = Math.max(silence.end - padding, silence.start);

      if (cursor < keepEnd) {
        keepRegions.push({ start: cursor, end: keepEnd });
      }
      cursor = keepStart;
    }
    if (cursor < totalDuration) {
      keepRegions.push({ start: cursor, end: totalDuration });
    }
  }

  return { silenceRegions, keepRegions };
}

/**
 * Merges silence detection across multiple tracks — a region is only
 * considered dead air if ALL tracks are silent at that point.
 */
export function detectDeadAirAcrossTracks(
  buffers: AudioBuffer[],
  options?: {
    silenceThreshold?: number;
    minSilenceDuration?: number;
    padding?: number;
  }
): SilenceRegion[] {
  if (buffers.length === 0) return [];

  const allSilence = buffers.map((b) => detectSilence(b, options).silenceRegions);

  // Find intersection of all silence regions
  let result = allSilence[0];
  for (let i = 1; i < allSilence.length; i++) {
    result = intersectRegions(result, allSilence[i]);
  }

  return result;
}

function intersectRegions(a: SilenceRegion[], b: SilenceRegion[]): SilenceRegion[] {
  const result: SilenceRegion[] = [];
  let ai = 0;
  let bi = 0;

  while (ai < a.length && bi < b.length) {
    const start = Math.max(a[ai].start, b[bi].start);
    const end = Math.min(a[ai].end, b[bi].end);

    if (start < end) {
      result.push({ start, end });
    }

    if (a[ai].end < b[bi].end) ai++;
    else bi++;
  }

  return result;
}
