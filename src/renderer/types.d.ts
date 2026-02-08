interface ElectronAPI {
  getTempPath: () => Promise<string>;
  selectFolder: () => Promise<string | null>;
  saveFile: (folder: string, filename: string, data: ArrayBuffer) => Promise<string>;
  selectSaveFile: (defaultName: string) => Promise<string | null>;
  exportMix: (inputFiles: string[], outputPath: string) => Promise<string>;
  listTrackFiles: (folder: string, sessionName: string) => Promise<string[]>;
}

interface Window {
  electronAPI: ElectronAPI;
}
