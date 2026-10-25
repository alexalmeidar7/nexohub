const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("houseMixClientManager", Object.freeze({
  list: () => ipcRenderer.invoke("client-manager:list"),
  create: (name) => ipcRenderer.invoke("client-manager:create", { name }),
  open: (id) => ipcRenderer.invoke("client-manager:open", id),
}));
