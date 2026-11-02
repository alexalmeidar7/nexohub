const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nexoPreview", {
  sendKey: (key) => ipcRenderer.send("preview:key", key)
});
