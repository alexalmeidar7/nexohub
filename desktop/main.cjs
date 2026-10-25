const { app, BrowserWindow, shell, dialog } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { resolveClientProfile } = require("./clientProfile.cjs");

const isDev = !app.isPackaged;
const profile = resolveClientProfile(process.argv, app.getPath("appData"));
app.setPath("userData", profile.userDataPath);
let mainWindow;

function isAllowedAppNavigation(rawUrl) {
  try {
    const target = new URL(rawUrl);
    if (isDev) {
      return target.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(target.hostname) &&
        target.port === "8080";
    }

    const entry = new URL(pathToFileURL(path.join(__dirname, "..", "dist", "index.html")).href);
    return target.protocol === "file:" &&
      target.host === entry.host &&
      target.pathname === entry.pathname;
  } catch {
    return false;
  }
}

function openExternalSafely(rawUrl) {
  try {
    const target = new URL(rawUrl);
    if (target.protocol === "https:" || target.protocol === "mailto:") {
      void shell.openExternal(target.href);
    }
  } catch {
    // Ignore malformed or unsupported external URLs.
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: "#111318",
    title: `House Mix Desktop — ${profile.clientId}`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      additionalArguments: [`--house-mix-client-id=${profile.clientId}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openExternalSafely(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (!isAllowedAppNavigation(url)) event.preventDefault();
  });

  if (isDev) {
    void mainWindow.loadURL("http://localhost:8080");
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => { mainWindow = null; });
}

app.whenReady().then(() => {
  app.setAppUserModelId("br.com.nexobrasil.housemix");
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (error) => {
  dialog.showErrorBox(
    "House Mix Desktop",
    "O aplicativo encontrou um erro inesperado.\n\n" + (error?.message || String(error)),
  );
});
