const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("houseMixDesktop", Object.freeze({
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || "0.0.0",
  getAppVersion: () => ipcRenderer.invoke("housemix:app-version"),
  getUpdateStatus: () => ipcRenderer.invoke("housemix:update-status"),
  onUpdateStatus: (callback) => {
    const listener = (_event, status) => callback(status);
    ipcRenderer.on("housemix:update-status", listener);
    return () => ipcRenderer.removeListener("housemix:update-status", listener);
  },
  installUpdate: () => ipcRenderer.invoke("housemix:install-update"),
  getXmlPath: (slug, filename) => ipcRenderer.invoke("housemix:xml-path", slug, filename),
  saveXml: (slug, filename, content) => ipcRenderer.invoke("housemix:xml-save", slug, filename, content),
  cacheImage: (url, hint) => ipcRenderer.invoke("housemix:image-cache", url, hint),
  getWindowState: () => ipcRenderer.invoke("housemix:window-state"),
  toggleFullscreen: () => ipcRenderer.invoke("housemix:window-fullscreen")
}));
