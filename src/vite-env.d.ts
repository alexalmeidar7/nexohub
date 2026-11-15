/// <reference types="vite/client" />

interface FileSystemFileHandle {
  getFile(): Promise<File>;
  kind: 'file';
  name: string;
}

interface HouseMixDesktopUpdateStatus {
  status: "idle" | "checking" | "downloading" | "downloaded";
  version?: string;
  percent?: number;
}

interface Window {
  showOpenFilePicker?: (options?: any) => Promise<FileSystemFileHandle[]>;
  houseMixDesktop?: {
    isDesktop: true;
    platform: string;
    version: string;
    getAppVersion: () => Promise<string>;
    getUpdateStatus: () => Promise<HouseMixDesktopUpdateStatus>;
    onUpdateStatus: (callback: (status: HouseMixDesktopUpdateStatus) => void) => () => void;
    installUpdate: () => Promise<boolean>;
    getXmlPath: (slug: string, filename: string) => Promise<string>;
    saveXml: (slug: string, filename: string, content: string) => Promise<string>;
    cacheImage: (url: string, hint: string) => Promise<string | null>;
    getWindowState: () => Promise<{ auxiliary: boolean; fullscreen: boolean }>;
    toggleFullscreen: () => Promise<boolean>;
  };
}
