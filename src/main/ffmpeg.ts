import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg = require('fluent-ffmpeg');

// Point fluent-ffmpeg to the bundled binary
const ffmpegPath: string = require('ffmpeg-static');
ffmpeg.setFfmpegPath(ffmpegPath);

export interface ExportOptions {
  inputFiles: string[];
  outputPath: string;
  format: 'mp3' | 'm4a' | 'wav';
}

/**
 * Mix down multiple audio tracks into a single file.
 * All inputs are merged (amerge) and output is normalized.
 */
export function exportMix(options: ExportOptions): Promise<string> {
  const { inputFiles, outputPath, format } = options;

  return new Promise((resolve, reject) => {
    if (inputFiles.length === 0) {
      reject(new Error('No input files'));
      return;
    }

    let command = ffmpeg();

    // Add each input file
    for (const file of inputFiles) {
      command = command.input(file);
    }

    // Build filter for merging
    if (inputFiles.length > 1) {
      const filterInputs = inputFiles.map((_, i) => `[${i}:a]`).join('');
      command = command.complexFilter([
        `${filterInputs}amerge=inputs=${inputFiles.length}[aout]`,
      ]);
      command = command.outputOptions(['-map', '[aout]']);
    }

    // Set output format options
    switch (format) {
      case 'mp3':
        command = command
          .audioCodec('libmp3lame')
          .audioBitrate('192k')
          .audioChannels(2)
          .audioFrequency(44100);
        break;
      case 'm4a':
        command = command
          .audioCodec('aac')
          .audioBitrate('192k')
          .audioChannels(2)
          .audioFrequency(44100);
        break;
      case 'wav':
        command = command
          .audioCodec('pcm_s16le')
          .audioChannels(2)
          .audioFrequency(44100);
        break;
    }

    command
      .output(outputPath)
      .on('end', () => resolve(outputPath))
      .on('error', (err: Error) => reject(err))
      .run();
  });
}
