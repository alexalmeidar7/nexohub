const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { app, BrowserWindow, dialog, shell, protocol, net, Notification, ipcMain } = require("electron");
const { spawn } = require("node:child_process");
const { createWindowOptions, isAllowedExternalUrl, resolveRendererRequestPath } = require("./runtime.cjs");
const { startLocalApiHost } = require("./local-api-host.cjs");

// A standard custom scheme gives BrowserRouter a real "/" origin in Electron.
// Register privileges before app readiness, as required by Electron.
protocol.registerSchemesAsPrivileged([{
  scheme: "housemix",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}, {
  scheme: "housemix-local",
  privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
}]);

let mainWindow;
let localApiHost;
let isQuitting = false;
let desktopAutoUpdater = null;
let updateCheckInFlight = false;
let updateDownloaded = false;
let updateCheckTimer = null;
let latestUpdateStatus = { status: "idle" };
const auxiliaryWindows = new WeakSet();

function getLocalAssetsRoot() {
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  return path.join(programFiles, "House Mix Desktop", "arquivos_locais");
}

function safeAccountSlug(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,79}$/i.test(value) ? value.toLowerCase() : null;
}

function accountAssetsRoot(accountSlug) {
  const slug = safeAccountSlug(accountSlug);
  if (!slug) throw new Error("Invalid account slug");
  return path.join(getLocalAssetsRoot(), slug);
}

function safeXmlName(value) {
  return typeof value === "string" && /^[a-z0-9][a-z0-9_-]{0,79}\.xml$/i.test(value);
}

function xmlFilePath(accountSlug, filename) {
  if (!safeXmlName(filename)) throw new Error("Invalid XML filename");
  return path.join(accountAssetsRoot(accountSlug), "xmls", filename);
}

function imageCategory(sourceUrl, hint = "") {
  const value = `${sourceUrl} ${hint}`.toLowerCase();
  const pathname = (() => { try { return new URL(sourceUrl).pathname.toLowerCase(); } catch { return ""; } })();
  if (/apresentador|locutor|speaker|host/.test(value)) return "apresentadores";
  if (/banner/.test(value)) return "banners";
  if (/fundo|background|wallpaper/.test(value)) return "fundos";
  if (/capa|album|cover|artwork/.test(value) || /\/images\/cover\//.test(pathname)) return "capas";
  if (/\/images\/artist\//.test(pathname) || /deezer.{0,20}(artista|artist)|(artista|artist).{0,20}deezer/.test(value)) return "deezer";
  if (/logo|patrocin|sponsor|anunciante/.test(value)) return "logos";
  return "geral";
}

function cachedImagePath(accountSlug, relativePath) {
  if (typeof relativePath !== "string" || !/^imagens\/(apresentadores|banners|fundos|capas|deezer|logos|geral)\/[a-f0-9]{64}\.(?:png|jpe?g|webp|gif|avif|svg)$/i.test(relativePath)) {
    throw new Error("Invalid local image path");
  }
  const root = path.resolve(accountAssetsRoot(accountSlug), "imagens");
  const target = path.resolve(accountAssetsRoot(accountSlug), relativePath);
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Invalid local image path");
  return target;
}

function legacyCachedImagePath(relativePath) {
  if (typeof relativePath !== "string" || !/^imagens\/(apresentadores|banners|fundos|programas|logos|geral)\/[a-f0-9]{64}\.(?:png|jpe?g|webp|gif|avif|svg)$/i.test(relativePath)) return null;
  const root = path.resolve(getLocalAssetsRoot(), "imagens");
  const target = path.resolve(getLocalAssetsRoot(), relativePath);
  const relative = path.relative(root, target);
  return !relative || relative.startsWith("..") || path.isAbsolute(relative) ? null : target;
}

function localImageUrl(accountSlug, relativePath) {
  return `housemix-local://asset/${safeAccountSlug(accountSlug)}/${relativePath}`;
}

async function cacheRemoteImage(sourceUrl, hint, accountSlug, forceRefresh = false) {
  const safeSlug = safeAccountSlug(accountSlug);
  if (!safeSlug) return null;
  let parsed;
  try { parsed = new URL(sourceUrl); } catch { return null; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  const hostname = parsed.hostname.toLowerCase();
  const allowed = hostname.endsWith(".supabase.co") || hostname === "supabase.co" ||
    hostname === "deezer.com" || hostname.endsWith(".deezer.com") || hostname.endsWith(".dzcdn.net") ||
    hostname.endsWith(".wikimedia.org") || hostname === "itunes.apple.com" || hostname.endsWith(".mzstatic.com") ||
    hostname.endsWith(".scdn.co") || hostname.endsWith(".spotifycdn.com");
  if (!allowed) return null;

  const category = imageCategory(sourceUrl, hint);
  const key = crypto.createHash("sha256").update(sourceUrl).digest("hex");
  const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/svg+xml": "svg" };
  let existingRelative = null;
  for (const extension of Object.values(extensions)) {
    const relativePath = `imagens/${category}/${key}.${extension}`;
    if (fs.existsSync(cachedImagePath(safeSlug, relativePath))) {
      existingRelative = relativePath;
      if (!forceRefresh) return localImageUrl(safeSlug, relativePath);
      break;
    }
  }

  const legacyCategory = (() => {
    const value = `${sourceUrl} ${hint}`.toLowerCase();
    if (/apresentador|locutor|speaker|host/.test(value)) return "apresentadores";
    if (/banner/.test(value)) return "banners";
    if (/fundo|background|wallpaper/.test(value)) return "fundos";
    if (/programa|capa|album|cover/.test(value)) return "programas";
    if (/logo|patrocin|sponsor|anunciante/.test(value)) return "logos";
    return "geral";
  })();
  let legacyPath = null;
  for (const extension of Object.values(extensions)) {
    const candidate = legacyCachedImagePath(`imagens/${legacyCategory}/${key}.${extension}`);
    if (candidate && fs.existsSync(candidate)) { legacyPath = candidate; break; }
  }
  if (!existingRelative && legacyPath) {
    const extension = path.extname(legacyPath).slice(1);
    existingRelative = `imagens/${category}/${key}.${extension}`;
    const target = cachedImagePath(safeSlug, existingRelative);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    try { await fs.promises.copyFile(legacyPath, target, fs.constants.COPYFILE_EXCL); }
    catch (error) { if (error.code !== "EEXIST") throw error; }
    if (!forceRefresh) return localImageUrl(safeSlug, existingRelative);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(sourceUrl, { signal: controller.signal, redirect: "error" });
    const finalHost = new URL(response.url).hostname.toLowerCase();
    const finalHostAllowed = finalHost.endsWith(".supabase.co") || finalHost === "supabase.co" ||
      finalHost === "deezer.com" || finalHost.endsWith(".deezer.com") || finalHost.endsWith(".dzcdn.net") ||
      finalHost.endsWith(".wikimedia.org") || finalHost === "itunes.apple.com" || finalHost.endsWith(".mzstatic.com") ||
      finalHost.endsWith(".scdn.co") || finalHost.endsWith(".spotifycdn.com");
    if (!finalHostAllowed) return existingRelative ? localImageUrl(safeSlug, existingRelative) : null;
    const contentType = response.headers.get("content-type")?.split(";")[0].toLowerCase() || "";
    if (!response.ok || !contentType.startsWith("image/")) return existingRelative ? localImageUrl(safeSlug, existingRelative) : null;
    const extension = extensions[contentType];
    if (!extension) return existingRelative ? localImageUrl(safeSlug, existingRelative) : null;
    const length = Number(response.headers.get("content-length") || 0);
    if (length > 20 * 1024 * 1024) return existingRelative ? localImageUrl(safeSlug, existingRelative) : null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) return existingRelative ? localImageUrl(safeSlug, existingRelative) : null;
    const relativePath = `imagens/${category}/${key}.${extension}`;
    const target = cachedImagePath(safeSlug, relativePath);
    await fs.promises.mkdir(path.dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.promises.writeFile(temporary, bytes, { flag: "wx" });
    try { await fs.promises.rename(temporary, target); }
    catch (error) {
      await fs.promises.rm(temporary, { force: true });
      if (!fs.existsSync(target)) throw error;
    }
    return localImageUrl(safeSlug, relativePath);
  } catch {
    return existingRelative ? localImageUrl(safeSlug, existingRelative) : null;
  } finally {
    clearTimeout(timeout);
  }
}

async function saveLocalImage(accountSlug, input, contentType, hint = "") {
  const safeSlug = safeAccountSlug(accountSlug);
  const bytes = input instanceof ArrayBuffer ? Buffer.from(input) : (Buffer.isBuffer(input) || input instanceof Uint8Array ? Buffer.from(input) : null);
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif" }[String(contentType || "").split(";")[0].toLowerCase()];
  if (!safeSlug || !bytes || !bytes.length || bytes.length > 20 * 1024 * 1024 || !extension) throw new Error("Invalid local image payload");
  const category = imageCategory("", hint);
  const key = crypto.createHash("sha256").update(bytes).digest("hex");
  const relativePath = `imagens/${category}/${key}.${extension}`;
  const target = cachedImagePath(safeSlug, relativePath);
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) await fs.promises.writeFile(target, bytes, { flag: "wx" });
  return localImageUrl(safeSlug, relativePath);
}

async function ensureAccountLocalAssetFolders(accountSlug) {
  const root = accountAssetsRoot(accountSlug);
  await Promise.all([
    "xmls", "imagens/apresentadores", "imagens/banners", "imagens/fundos",
    "imagens/capas", "imagens/deezer", "imagens/logos", "imagens/geral"
  ].map((folder) => fs.promises.mkdir(path.join(root, folder), { recursive: true })));
  return root;
}

async function initializeLocalAssetFolders() {
  await fs.promises.mkdir(getLocalAssetsRoot(), { recursive: true });
}

function configureDesktopIpc() {
  ipcMain.handle("housemix:app-version", () => app.getVersion());
  ipcMain.handle("housemix:update-status", () => latestUpdateStatus);
  ipcMain.handle("housemix:install-update", () => {
    if (!updateDownloaded || !desktopAutoUpdater) return false;
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    if (localApiHost && !isQuitting) {
      isQuitting = true;
      const host = localApiHost;
      localApiHost = null;
      void host.stop().finally(() => desktopAutoUpdater.quitAndInstall());
      return true;
    }
    desktopAutoUpdater.quitAndInstall();
    return true;
  });
  ipcMain.handle("housemix:assets-init", (_event, slug) => ensureAccountLocalAssetFolders(slug));
  ipcMain.handle("housemix:xml-path", (_event, slug, filename) => xmlFilePath(slug, filename));
  ipcMain.handle("housemix:xml-save", async (_event, slug, filename, content) => {
    if (typeof content !== "string" || content.length > 5_000_000 || !content.trim().startsWith("<")) {
      throw new Error("Invalid XML content");
    }
    await ensureAccountLocalAssetFolders(slug);
    const target = xmlFilePath(slug, filename);
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    await fs.promises.writeFile(temporary, content, "utf8");
    await fs.promises.rename(temporary, target);
    return target;
  });
  ipcMain.handle("housemix:xml-read", async (_event, slug, filename) => {
    const target = xmlFilePath(slug, filename);
    try {
      const stat = await fs.promises.stat(target);
      if (!stat.isFile() || stat.size > 5_000_000) return null;
      return await fs.promises.readFile(target, "utf8");
    } catch { return null; }
  });
  ipcMain.handle("housemix:image-cache", (_event, sourceUrl, hint, slug, refresh) => cacheRemoteImage(sourceUrl, hint, slug, refresh === true));
  ipcMain.handle("housemix:image-save-local", (_event, slug, bytes, contentType, hint) => saveLocalImage(slug, bytes, contentType, hint));
  ipcMain.handle("housemix:window-fullscreen", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || !auxiliaryWindows.has(win)) return false;
    win.setFullScreen(!win.isFullScreen());
    return win.isFullScreen();
  });
  ipcMain.handle("housemix:window-state", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return { auxiliary: !!win && auxiliaryWindows.has(win), fullscreen: !!win?.isFullScreen() };
  });
}

const UPDATE_CHECK_INTERVAL_MS = 15 * 60 * 1000;

function configureAutoUpdater() {
  if (!app.isPackaged) return;

  try {
    ({ autoUpdater: desktopAutoUpdater } = require("electron-updater"));
    desktopAutoUpdater.autoDownload = true;
    desktopAutoUpdater.autoInstallOnAppQuit = true;
    const publishStatus = (status) => {
      latestUpdateStatus = status;
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("housemix:update-status", status);
    };
    desktopAutoUpdater.on("checking-for-update", () => publishStatus({ status: "checking" }));
    desktopAutoUpdater.on("update-available", (info) => publishStatus({ status: "downloading", version: info.version, percent: 0 }));
    desktopAutoUpdater.on("download-progress", (progress) => publishStatus({
      ...latestUpdateStatus,
      status: "downloading",
      percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0)))
    }));
    desktopAutoUpdater.on("update-not-available", () => publishStatus({ status: "idle" }));
    desktopAutoUpdater.on("error", () => {
      if (latestUpdateStatus.status !== "downloaded") publishStatus({ status: "idle" });
    });
    desktopAutoUpdater.on("update-downloaded", (info) => {
      updateDownloaded = true;
      publishStatus({ status: "downloaded", version: info.version, percent: 100 });
      if (!Notification.isSupported()) return;
      new Notification({
        title: "House Mix Desktop atualizado",
        body: `A versão ${info.version} será instalada quando você fechar o aplicativo.`
      }).show();
    });
  } catch {
    // Updates are optional; an updater issue must not block the local app.
    desktopAutoUpdater = null;
  }
}

async function checkForDesktopUpdate() {
  if (!app.isPackaged || !desktopAutoUpdater || updateCheckInFlight || updateDownloaded) return;

  updateCheckInFlight = true;
  try {
    await desktopAutoUpdater.checkForUpdates();
  } catch {
    // Offline startup and local data access must continue when updates fail.
  } finally {
    updateCheckInFlight = false;
  }
}

function scheduleDesktopUpdates() {
  if (!app.isPackaged || !desktopAutoUpdater || updateCheckTimer) return;
  void checkForDesktopUpdate();
  updateCheckTimer = setInterval(() => {
    void checkForDesktopUpdate();
  }, UPDATE_CHECK_INTERVAL_MS);
  updateCheckTimer.unref?.();
  app.on("browser-window-focus", () => void checkForDesktopUpdate());
  app.on("activate", () => void checkForDesktopUpdate());
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
  protocol.handle("housemix-local", (request) => {
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    try {
      const parsed = new URL(request.url);
      if (parsed.hostname !== "asset") return new Response("Not found", { status: 404 });
      const [accountSlug, ...segments] = decodeURIComponent(parsed.pathname).replace(/^\//, "").split("/");
      const filePath = cachedImagePath(accountSlug, segments.join("/"));
      if (!fs.existsSync(filePath)) return new Response("Not found", { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function createMainWindow() {
  const windowOptions = createWindowOptions(path.join(__dirname, "preload.cjs"));
  windowOptions.icon = path.join(__dirname, "assets", "house-mix.ico");
  mainWindow = new BrowserWindow(windowOptions);
  mainWindow.once("ready-to-show", () => { mainWindow.maximize(); mainWindow.show(); });
  mainWindow.on("closed", () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("housemix://desktop/")) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          width: 1280, height: 800, minWidth: 800, minHeight: 550,
          show: false, autoHideMenuBar: true, backgroundColor: "#0c1855",
          webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true }
        }
      };
    }
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.webContents.on("did-create-window", (child) => {
    auxiliaryWindows.add(child);
    child.webContents.setWindowOpenHandler(({ url }) => {
      if (isAllowedExternalUrl(url)) void shell.openExternal(url);
      return { action: "deny" };
    });
    child.webContents.on("will-navigate", (event, targetUrl) => {
      if (targetUrl.startsWith("housemix://desktop/")) return;
      event.preventDefault();
      if (isAllowedExternalUrl(targetUrl)) void shell.openExternal(targetUrl);
    });
    child.once("ready-to-show", () => child.show());
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
    configureDesktopIpc();
    await registerRendererProtocol();
    await initializeLocalAssetFolders();
    await startLocalRuntime();
    createMainWindow();
    scheduleDesktopUpdates();
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
  if (updateCheckTimer) clearInterval(updateCheckTimer);
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
