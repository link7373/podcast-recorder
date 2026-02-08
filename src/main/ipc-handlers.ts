import { ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exportMix, ExportOptions } from './ffmpeg';

export function registerIpcHandlers(): void {
  ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Choose save folder for recordings',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle(
    'save-file',
    async (
      _event: Electron.IpcMainInvokeEvent,
      folder: string,
      filename: string,
      data: ArrayBuffer
    ) => {
      const filePath = path.join(folder, filename);
      fs.writeFileSync(filePath, Buffer.from(data));
      return filePath;
    }
  );

  ipcMain.handle(
    'select-save-file',
    async (
      _event: Electron.IpcMainInvokeEvent,
      defaultName: string
    ) => {
      const result = await dialog.showSaveDialog({
        title: 'Export podcast',
        defaultPath: defaultName,
        filters: [
          { name: 'MP3 Audio', extensions: ['mp3'] },
          { name: 'AAC Audio', extensions: ['m4a'] },
          { name: 'WAV Audio', extensions: ['wav'] },
        ],
      });
      if (result.canceled || !result.filePath) {
        return null;
      }
      return result.filePath;
    }
  );

  ipcMain.handle(
    'export-mix',
    async (
      _event: Electron.IpcMainInvokeEvent,
      inputFiles: string[],
      outputPath: string
    ) => {
      const ext = path.extname(outputPath).slice(1) as 'mp3' | 'm4a' | 'wav';
      const options: ExportOptions = {
        inputFiles,
        outputPath,
        format: ext === 'mp3' || ext === 'm4a' || ext === 'wav' ? ext : 'mp3',
      };
      return exportMix(options);
    }
  );

  ipcMain.handle(
    'list-track-files',
    async (
      _event: Electron.IpcMainInvokeEvent,
      folder: string,
      sessionName: string
    ) => {
      const files = fs.readdirSync(folder);
      return files
        .filter(
          (f) => f.startsWith(sessionName) && (f.endsWith('.wav') || f.endsWith('.webm'))
        )
        .map((f) => path.join(folder, f));
    }
  );
}
