const { contextBridge } = require("electron");

// Exposição mínima e somente informativa. Nenhum acesso a Node, disco,
// credenciais, rede local ou banco de dados é disponibilizado ao renderer.
contextBridge.exposeInMainWorld("houseMixDesktop", Object.freeze({
  isDesktop: true,
  productName: "House Mix Desktop",
  version: process.env.npm_package_version || "0.0.0",
}));
