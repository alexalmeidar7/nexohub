const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, shell, protocol, net } = require("electron");
const { spawn } = require("node:child_process");
const { createWindowOptions, isAllowedExternalUrl, resolveRendererRequestPath } = require("./runtime.cjs");
const { startLocalApiHost } = require("./local-api-host.cjs");

protocol.registerSchemesAsPrivileged([{
  scheme: "housemix",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

let mainWindow;
let localApiHost;
let isQuitting = false;

function getLocalApiEnabled() {
  if (process.env.HOUSEMIX_LOCAL_API_ENABLED === "true") return true;
  if (process.env.HOUSEMIX_LOCAL_API_ENABLED === "false") return false;
  return app.isPackaged;
}

async function registerRendererProtocol() {
  const rendererRoot = path.join(app.getAppPath(), "dist");
  const entry = path.join(rendererRoot, "index.html");
  if (!fs.existsSync(entry)) {
    throw new Error(`Renderer not found: ${entry}`);
  }

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
  const preloadPath = path.join(__dirname, "preload.cjs");
  if (!fs.existsSync(preloadPath)) throw new Error(`Preload not found: ${preloadPath}`);

  const windowOptions = createWindowOptions(preloadPath);
  const iconPath = path.join(__dirname, "assets", "house-mix.ico");
  if (fs.existsSync(iconPath)) windowOptions.icon = iconPath;

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
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, "runtime", "local-api-host", "HouseMix.OfflineFirst.Host.exe")
    : path.join(__dirname, "runtime", "local-api-host", "HouseMix.OfflineFirst.Host.exe");
  return path.resolve(candidate);
}

async function startLocalRuntime() {
  if (!getLocalApiEnabled()) return;

  const executablePath = resolveLocalApiHostPath();
  if (!fs.existsSync(executablePath)) {
    throw new Error(`Local API host executable not found: ${executablePath}`);
  }

  const host = startLocalApiHost({
    executablePath,
    env: { ...process.env, HOUSEMIX_LOCAL_API_ENABLED: "true" },
    spawnProcess: spawn
  });

  if (!host.configured) return;
  localApiHost = host;

  try {
    await host.ready;
  } catch (error) {
    await host.stop();
    localApiHost = null;
    throw new Error(
      `Local API host failed to start. Executable: ${executablePath}. ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

app.whenReady().then(async () => {
  try {
    await registerRendererProtocol();
    await startLocalRuntime();
    createMainWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[House Mix Desktop] startup failed:", error);

    try {
      const logPath = path.join(app.getPath("userData"), "startup-error.log");
      fs.writeFileSync(logPath, `House Mix Desktop startup failure\\n\\n${detail}\\n`, "utf8");
    } catch {}

    dialog.showErrorBox(
      "House Mix Desktop",
      `Não foi possível iniciar o House Mix Desktop.\\n\\n${detail}`
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
