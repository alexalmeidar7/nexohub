const { app, BrowserWindow, shell, dialog, ipcMain } = require("electron");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { resolveClientProfile, parseClientId } = require("./clientProfile.cjs");
const { listClients, createClient } = require("./clientRegistry.cjs");

const isDev = !app.isPackaged;
const clientArg = process.argv.some((arg) => arg.startsWith("--client-id="));
const profile = clientArg ? resolveClientProfile(process.argv, app.getPath("appData")) : null;
if (profile) app.setPath("userData", profile.userDataPath);
let mainWindow;

function isAllowedAppNavigation(rawUrl) {
  try {
    const target = new URL(rawUrl);
    if (isDev) return target.protocol === "http:" && ["localhost", "127.0.0.1"].includes(target.hostname) && target.port === "8080";
    const entry = new URL(pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).href);
    return target.protocol === "file:" && target.host === entry.host && target.pathname === entry.pathname;
  } catch { return false; }
}
function openExternalSafely(rawUrl) {
  try { const target = new URL(rawUrl); if (target.protocol === "https:" || target.protocol === "mailto:") void shell.openExternal(target.href); } catch {}
}
function createClientWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1024, minHeight: 680, show: false,
    backgroundColor: "#111318", title: `House Mix Desktop — ${profile.clientId}`, autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), additionalArguments: [`--house-mix-client-id=${profile.clientId}`], contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternalSafely(url); return { action: "deny" }; });
  mainWindow.webContents.on("will-navigate", (event, url) => { if (!isAllowedAppNavigation(url)) event.preventDefault(); });
  if (isDev) void mainWindow.loadURL("http://localhost:8080"); else void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  mainWindow.on("closed", () => { mainWindow = null; });
}
function createManagerWindow() {
  ipcMain.handle("client-manager:list", () => listClients(app.getPath("appData")));
  ipcMain.handle("client-manager:create", (_event, payload) => {
    if (!payload || typeof payload.name !== "string") throw new Error("Informe o nome do cliente.");
    return createClient(app.getPath("appData"), payload.name);
  });
  ipcMain.handle("client-manager:open", (_event, rawId) => {
    const id = parseClientId([`--client-id=${String(rawId || "")}`]);
    if (!listClients(app.getPath("appData")).some((client) => client.id === id)) throw new Error("Cliente não cadastrado neste computador.");
    const args = isDev ? [app.getAppPath(), `--client-id=${id}`] : [`--client-id=${id}`];
    const child = spawn(process.execPath, args, { detached: true, stdio: "ignore", windowsHide: false });
    child.unref();
    return { opened: true, clientId: id };
  });
  const win = new BrowserWindow({
    width: 900, height: 680, minWidth: 680, minHeight: 560, show: false,
    title: "House Mix Desktop — Clientes", autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, "client-manager-preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.once("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  void win.loadFile(path.join(__dirname, "client-manager.html"));
}
app.whenReady().then(() => {
  app.setAppUserModelId("br.com.nexobrasil.housemix");
  if (profile) createClientWindow(); else createManagerWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) { if (profile) createClientWindow(); else createManagerWindow(); } });
});
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
process.on("uncaughtException", (error) => dialog.showErrorBox("House Mix Desktop", "O aplicativo encontrou um erro inesperado.\n\n" + (error?.message || String(error))));
