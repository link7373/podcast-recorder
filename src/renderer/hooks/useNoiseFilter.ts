import { useRef, useCallback } from 'react';

/**
 * Creates a noise-filtered audio stream using Web Audio API.
 * Uses the browser's built-in noise suppression + a high-pass filter
 * to reduce background noise. Also provides an AnalyserNode for
 * real-time audio level monitoring.
 */
export interface NoiseFilterResult {
  outputStream: MediaStream;
  analyser: AnalyserNode;
  gainNode: GainNode;
  cleanup: () => void;
}

export function createNoiseFilteredStream(
  inputStream: MediaStream,
  enabled: boolean,
  inputLevel: number // 0-100
): NoiseFilterResult {
  const audioCtx = new AudioContext();
  const source = audioCtx.createMediaStreamSource(inputStream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;

  const gainNode = audioCtx.createGain();
  gainNode.gain.value = inputLevel / 100;

  const dest = audioCtx.createMediaStreamDestination();

  if (enabled) {
    // High-pass filter to cut low-frequency rumble (below 80Hz)
    const highPass = audioCtx.createBiquadFilter();
    highPass.type = 'highpass';
    highPass.frequency.value = 80;

    // Low-pass filter to cut hiss above 12kHz
    const lowPass = audioCtx.createBiquadFilter();
    lowPass.type = 'lowpass';
    lowPass.frequency.value = 12000;

    source.connect(highPass);
    highPass.connect(lowPass);
    lowPass.connect(gainNode);
  } else {
    source.connect(gainNode);
  }

  gainNode.connect(analyser);
  analyser.connect(dest);

  return {
    outputStream: dest.stream,
    analyser,
    gainNode,
    cleanup: () => {
      audioCtx.close();
    },
  };
}

/**
 * Gets current audio level (0-1) from an AnalyserNode.
 */
export function getAudioLevel(analyser: AnalyserNode): number {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
  }
  return sum / (data.length * 255);
}

/**
 * Checks if audio level indicates speaking (above threshold).
 */
export function isSpeaking(analyser: AnalyserNode, threshold = 0.08): boolean {
  return getAudioLevel(analyser) > threshold;
}
