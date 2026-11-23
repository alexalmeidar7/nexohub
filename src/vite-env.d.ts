/// <reference types="vite/client" />

interface FileSystemFileHandle {
  getFile(): Promise<File>;
  kind: 'file';
  name: string;
}

interface HouseMixDesktopUpdateStatus {
  status: "idle" | "checking" | "available" | "downloading" | "downloaded";
  version?: string;
  percent?: number;
}

interface Window {
  showOpenFilePicker?: (options?: any) => Promise<FileSystemFileHandle[]>;
  houseMixDesktop?: {
    isDesktop: true;
    generateLocalText?: (system: string, prompt: string) => Promise<string>;
    transcribeLocalAudio?: (streamUrl: string) => Promise<string>;
    listLocalTranscriptions?: (stationId: string) => Promise<Array<{id:string; texto_transcrito:string; timestamp_inicio:string; timestamp_fim:string|null}>>;
    appendLocalTranscription?: (stationId: string, text: string, start: string, end: string) =>
      Promise<{id:string; texto_transcrito:string; timestamp_inicio:string; timestamp_fim:string|null}>;
    fetchVmixApi?: (base: string, path: string, username?: string, password?: string) => Promise<string>;
    platform: string;
    version: string;
    openExternal: (url: string) => Promise<boolean>;
    onPlayerOAuthCallback: (callback: (url: string) => void) => () => void;
    getAppVersion: () => Promise<string>;
    getStartWithWindows: () => Promise<{ enabled: boolean; supported: boolean }>;
    setStartWithWindows: (enabled: boolean) => Promise<{ enabled: boolean; supported: boolean }>;
    getUpdateStatus: () => Promise<HouseMixDesktopUpdateStatus>;
    onUpdateStatus: (callback: (status: HouseMixDesktopUpdateStatus) => void) => () => void;
    downloadUpdate: () => Promise<boolean>;
    installUpdate: () => Promise<boolean>;
    initializeLocalAssets: (slug: string) => Promise<string>;
    getXmlPath: (slug: string, filename: string) => Promise<string>;
    saveXml: (slug: string, filename: string, content: string) => Promise<string>;
    readXml: (slug: string, filename: string) => Promise<string | null>;
    cacheImage: (url: string, hint: string, slug: string, refresh?: boolean) => Promise<string | null>;
    cacheImageFileUrl: (url: string, hint: string, slug: string) => Promise<string | null>;
    getCachedImageFileUrl: (url: string, hint: string, slug: string) => Promise<string | null>;
    saveLocalImage: (slug: string, bytes: ArrayBuffer, contentType: string, hint: string) => Promise<string>;
    getWindowState: () => Promise<{ auxiliary: boolean; fullscreen: boolean }>;
    toggleFullscreen: () => Promise<boolean>;
  };
}
