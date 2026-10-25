const { contextBridge } = require("electron");

const clientArgument = process.argv.find((arg) => arg.startsWith("--house-mix-client-id="));
const clientId = clientArgument
  ? clientArgument.slice("--house-mix-client-id=".length)
  : "default";

// Exposição somente de metadados. O renderer não recebe acesso a disco,
// credenciais, rede local, banco de dados ou APIs genéricas do Electron.
contextBridge.exposeInMainWorld("houseMixDesktop", Object.freeze({
  isDesktop: true,
  productName: "House Mix Desktop",
  version: process.env.npm_package_version || "0.0.0",
  clientId,
}));
