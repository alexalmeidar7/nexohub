const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, shell, protocol, net, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const { createWindowOptions, isAllowedExternalUrl, resolveRendererRequestPath } = require("./runtime.cjs");
const { startLocalApiHost } = require("./local-api-host.cjs");
const { resolveClientProfile, parseClientId } = require("./clientProfile.cjs");
const { listClients, createClient } = require("./clientRegistry.cjs");

const clientArgPresent = process.argv.some((arg) => arg.startsWith("--client-id="));
const profile = clientArgPresent
  ? resolveClientProfile(process.argv, app.getPath("appData"))
  : null;
if (profile) app.setPath("userData", profile.userDataPath);

protocol.registerSchemesAsPrivileged([{
  scheme: "housemix",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

let mainWindow;
let localApiHost;
let isQuitting = false;

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

function openExternalSafely(rawUrl) {
  if (isAllowedExternalUrl(rawUrl)) void shell.openExternal(rawUrl);
}

function createClientWindow() {
  const options = createWindowOptions(path.join(__dirname, "preload.cjs"));
  options.icon = path.join(__dirname, "assets", "house-mix.ico");
  options.title = `House Mix Desktop — ${profile.clientId}`;
  mainWindow = new BrowserWindow(options);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => { mainWindow = null; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, targetUrl) => {
    if (targetUrl.startsWith("housemix://desktop/")) return;
    event.preventDefault();
    openExternalSafely(targetUrl);
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
    env: {
      ...process.env,
      ...(profile ? { HOUSEMIX_CLIENT_ID: profile.clientId } : {})
    },
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

function createManagerWindow() {
  ipcMain.handle("client-manager:list", () => listClients(app.getPath("appData")));
  ipcMain.handle("client-manager:create", (_event, payload) => {
    if (!payload || typeof payload.name !== "string") {
      throw new Error("Informe o nome do cliente.");
    }
    return createClient(app.getPath("appData"), payload.name);
  });
  ipcMain.handle("client-manager:open", (_event, rawId) => {
    const id = parseClientId([`--client-id=${String(rawId || "")}`]);
    if (!listClients(app.getPath("appData")).some((client) => client.id === id)) {
      throw new Error("Cliente não cadastrado neste computador.");
    }
    const args = app.isPackaged
      ? [`--client-id=${id}`]
      : [app.getAppPath(), `--client-id=${id}`];
    const child = spawn(process.execPath, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false
    });
    child.unref();
    return { opened: true, clientId: id };
  });

  const manager = new BrowserWindow({
    width: 900,
    height: 680,
    minWidth: 680,
    minHeight: 560,
    show: false,
    title: "House Mix Desktop — Clientes",
    autoHideMenuBar: true,
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: path.join(__dirname, "client-manager-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  manager.once("ready-to-show", () => manager.show());
  manager.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  manager.webContents.on("will-navigate", (event) => event.preventDefault());
  void manager.loadFile(path.join(__dirname, "client-manager.html"));
}

app.whenReady().then(async () => {
  try {
    app.setAppUserModelId("br.com.nexobrasil.housemix");
    if (!profile) {
      createManagerWindow();
      return;
    }
    await registerRendererProtocol();
    await startLocalRuntime();
    createClientWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createClientWindow();
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
