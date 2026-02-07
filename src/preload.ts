import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: (): Promise<string | null> =>
    ipcRenderer.invoke('select-folder'),
  saveFile: (
    folder: string,
    filename: string,
    data: ArrayBuffer
  ): Promise<string> =>
    ipcRenderer.invoke('save-file', folder, filename, data),
  selectSaveFile: (
    defaultName: string
  ): Promise<string | null> =>
    ipcRenderer.invoke('select-save-file', defaultName),
  exportMix: (
    inputFiles: string[],
    outputPath: string
  ): Promise<string> =>
    ipcRenderer.invoke('export-mix', inputFiles, outputPath),
  listTrackFiles: (
    folder: string,
    sessionName: string
  ): Promise<string[]> =>
    ipcRenderer.invoke('list-track-files', folder, sessionName),
});
