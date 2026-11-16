const path = require("node:path");
const { URL } = require("node:url");

function isAllowedExternalUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function resolveRendererRequestPath(rawUrl, rendererRoot, fileExists = (candidate) => require("node:fs").existsSync(candidate)) {
  try {
    // URL() normalizes encoded dot segments before exposing pathname. Reject
    // traversal syntax in the original input before parsing it.
    if (typeof rawUrl !== "string" ||
        /(?:^|[\\/])(?:\.{1,2}|%2e(?:%2e)?|\.%2e|%2e\.)(?:[\\/]|$)/i.test(rawUrl) ||
        /%(?:2f|5c)/i.test(rawUrl)) {
      return null;
    }

    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "housemix:") return null;
    const pathname = decodeURIComponent(parsed.pathname || "/");
    if (pathname.includes("\\") || pathname.split("/").some((segment) => segment === "." || segment === "..")) return null;

    const requestedPath = pathname === "/" ? "/index.html" : pathname;
    const root = path.resolve(rendererRoot);
    const target = path.resolve(root, "." + requestedPath);
    const relative = path.relative(root, target);
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return null;
    if (fileExists(target)) return target;
    if (path.extname(pathname)) return null;
    const entry = path.join(root, "index.html");
    return fileExists(entry) ? entry : null;
  } catch {
    return null;
  }
}

function createWindowOptions(preloadPath) {
  return {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0c1855",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      backgroundThrottling: false
    }
  };
}

module.exports = { createWindowOptions, isAllowedExternalUrl, resolveRendererRequestPath };
