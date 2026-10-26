const path = require("node:path");
const { app, BrowserWindow, dialog, shell } = require("electron");
const { spawn } = require("node:child_process");
const { createWindowOptions, isAllowedExternalUrl } = require("./runtime.cjs");
const { startLocalApiHost } = require("./local-api-host.cjs");

let mainWindow;
let localApiHost;
let isQuitting = false;

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

function resolveLocalApiHostPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "runtime", "local-api-host", "HouseMix.OfflineFirst.Host.exe");
  }
  return path.join(__dirname, "runtime", "local-api-host", "HouseMix.OfflineFirst.Host.exe");
}

async function startLocalRuntime() {
  const host = startLocalApiHost({
    executablePath: resolveLocalApiHostPath(),
    env: process.env,
    spawnProcess: spawn
  });
  if (!host.configured) return;
  localApiHost = host;
  try {
    await host.ready;
  } catch (error) {
    await host.stop();
    localApiHost = null;
    throw error;
  }
}

app.whenReady().then(async () => {
  try {
    await startLocalRuntime();
    createMainWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  } catch {
    dialog.showErrorBox(
      "House Mix Desktop",
      "Não foi possível iniciar o serviço local do House Mix. Verifique a instalação e a configuração do banco de dados."
    );
    app.quit();
  }
});

app.on("before-quit", (event) => {
  if (isQuitting || !localApiHost) return;
  event.preventDefault();
  isQuitting = true;
  const host = localApiHost;
  localApiHost = null;
  void host.stop().finally(() => app.quit());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
