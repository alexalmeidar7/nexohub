const { contextBridge, ipcRenderer } = require("electron");

// Transport-level events come from the native Desktop bridge only. These are
// local filesystem operations, NOT cloud synchronization or Supabase writes.
const activitySubscribers = new Set();
let activitySeq = 0;
function dispatchLocalActivity(event) {
  for (const listener of activitySubscribers) {
    try { listener(event); } catch { /* one listener cannot break a file operation */ }
  }
}
ipcRenderer.on("housemix:local-activity", (_event, activity) => dispatchLocalActivity(activity));
async function trackedLocalInvoke(operation, channel, ...args) {
  const id = "native-" + ++activitySeq;
  dispatchLocalActivity({ id, phase: "start", operation });
  try {
    const value = await ipcRenderer.invoke(channel, ...args);
    dispatchLocalActivity({ id, phase: "end", operation, ok: true });
    return value;
  } catch (error) {
    dispatchLocalActivity({ id, phase: "end", operation, ok: false });
    throw error;
  }
}
contextBridge.exposeInMainWorld("houseMixDesktop", Object.freeze({
  onLocalActivity: (callback) => {
    if (typeof callback !== "function") return () => {};
    activitySubscribers.add(callback);
    return () => activitySubscribers.delete(callback);
  },
  isDesktop: true,
  generateLocalText: (system, prompt) => ipcRenderer.invoke("housemix:local-ai", { system, prompt }),
  transcribeLocalAudio: (streamUrl) => ipcRenderer.invoke("housemix:local-transcribe", streamUrl),
  listLocalTranscriptions: (stationId) => ipcRenderer.invoke("housemix:local-transcripts-read", stationId),
  appendLocalTranscription: (stationId, text, start, end) =>
    ipcRenderer.invoke("housemix:local-transcripts-append", stationId, text, start, end),
  fetchVmixApi: (base, apiPath, username, password) => ipcRenderer.invoke("housemix:vmix-api", base, apiPath, username, password),
  platform: process.platform,
  version: process.env.npm_package_version || "0.0.0",
  openExternal: (url) => ipcRenderer.invoke("housemix:open-external", url),
  onPlayerOAuthCallback: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("housemix:player-oauth-callback", listener);
    return () => ipcRenderer.removeListener("housemix:player-oauth-callback", listener);
  },
  getAppVersion: () => ipcRenderer.invoke("housemix:app-version"),
  getStartWithWindows: () => ipcRenderer.invoke("housemix:get-start-with-windows"),
  setStartWithWindows: (enabled) => ipcRenderer.invoke("housemix:set-start-with-windows", enabled),
  getUpdateStatus: () => ipcRenderer.invoke("housemix:update-status"),
  downloadUpdate: () => ipcRenderer.invoke("housemix:download-update"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("housemix:update-status", listener);
    return () => ipcRenderer.removeListener("housemix:update-status", listener);
  },
  installUpdate: () => ipcRenderer.invoke("housemix:install-update"),
  initializeLocalAssets: (slug) => ipcRenderer.invoke("housemix:assets-init", slug),
  getXmlPath: (slug, filename) => ipcRenderer.invoke("housemix:xml-path", slug, filename),
  saveXml: (slug, filename, content) => ipcRenderer.invoke("housemix:xml-save", slug, filename, content),
  readXml: (slug, filename) => trackedLocalInvoke("read", "housemix:xml-read", slug, filename),
  cacheImage: (url, hint, slug, refresh = false) => ipcRenderer.invoke("housemix:image-cache", url, hint, slug, refresh),
  cacheImageFileUrl: (url, hint, slug) => ipcRenderer.invoke("housemix:image-cache-file-url", url, hint, slug),
  getCachedImageFileUrl: (url, hint, slug) => trackedLocalInvoke("read", "housemix:image-cached-file-url", url, hint, slug),
  saveLocalImage: (slug, bytes, contentType, hint) => trackedLocalInvoke("write", "housemix:image-save-local", slug, bytes, contentType, hint),
  getWindowState: () => ipcRenderer.invoke("housemix:window-state"),
  toggleFullscreen: () => ipcRenderer.invoke("housemix:window-fullscreen")
}));
