/// <reference types="vite/client" />

interface FileSystemFileHandle {
  getFile(): Promise<File>;
  kind: 'file';
  name: string;
}

interface Window {
  showOpenFilePicker?: (options?: any) => Promise<FileSystemFileHandle[]>;
}
