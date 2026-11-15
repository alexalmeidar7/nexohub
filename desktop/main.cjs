const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, shell, protocol, net } = require("electron");
const { spawn } = require("node:child_process");
const { createWindowOptions, isAllowedExternalUrl, resolveRendererRequestPath } = require("./runtime.cjs");
const { startLocalApiHost } = require("./local-api-host.cjs");

// A standard custom scheme gives BrowserRouter a real "/" origin in Electron.
// Register privileges before app readiness, as required by Electron.
protocol.registerSchemesAsPrivileged([{
  scheme: "housemix",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

let mainWindow;
let localApiHost;
let isQuitting = false;
let desktopAutoUpdater = null;

function configureAutoUpdater() {
  if (!app.isPackaged) return;

  try {
    ({ autoUpdater: desktopAutoUpdater } = require("electron-updater"));
    desktopAutoUpdater.autoDownload = true;
    desktopAutoUpdater.autoInstallOnAppQuit = true;
  } catch {
    // Updates are optional; an updater issue must not block the local app.
    desktopAutoUpdater = null;
  }
}

async function checkForDesktopUpdate() {
  if (!app.isPackaged || !desktopAutoUpdater) return;

  try {
    await desktopAutoUpdater.checkForUpdates();
  } catch {
    // Offline startup and local data access must continue when updates fail.
  }
}

async function registerRendererProtocol() {
  const rendererRoot = path.join(app.getAppPath(), "dist");
  protocol.handle("housemix", (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }

    const filePath = resolveRendererRequestPath(
      request.url,
      rendererRoot,
      (candidate) => fs.existsSync(candidate)
    );

    if (!filePath) return new Response("Not found", { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function createMainWindow() {
  const windowOptions = createWindowOptions(path.join(__dirname, "preload.cjs"));
  windowOptions.icon = path.join(__dirname, "assets", "house-mix.ico");
  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl.startsWith("housemix://desktop/")) return;
    event.preventDefault();
    if (isAllowedExternalUrl(targetUrl)) void shell.openExternal(targetUrl);
  });

  void mainWindow.loadURL("housemix://desktop/");
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
    configureAutoUpdater();
    await registerRendererProtocol();
    await startLocalRuntime();
    createMainWindow();
    void checkForDesktopUpdate();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  } catch {
    dialog.showErrorBox(
      "House Mix Desktop",
      "Não foi possível iniciar o House Mix Desktop. Verifique a instalação e a configuração do ambiente local."
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
