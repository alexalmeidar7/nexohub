const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("houseMixDesktop", Object.freeze({
  isDesktop: true,
  platform: process.platform,
  version: process.env.npm_package_version || "0.0.0"
}));
