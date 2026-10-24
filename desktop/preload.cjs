const { contextBridge } = require("electron");

// Superfície mínima exposta ao renderer. Nunca expor Node.js, filesystem ou credenciais.
contextBridge.exposeInMainWorld("houseMixDesktop", Object.freeze({
  isDesktop: true,
  productName: "House Mix Desktop",
  version: process.env.npm_package_version || "0.0.0",
}));
