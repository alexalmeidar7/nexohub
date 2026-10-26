const path = require("node:path");
const { app, BrowserWindow, shell } = require("electron");
const { createWindowOptions, isAllowedExternalUrl } = require("./runtime.cjs");

let mainWindow;

function createMainWindow() {
  mainWindow = new BrowserWindow(createWindowOptions(path.join(__dirname, "preload.cjs")));
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      if (isAllowedExternalUrl(targetUrl)) void shell.openExternal(targetUrl);
    }
  });

  void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
}

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
