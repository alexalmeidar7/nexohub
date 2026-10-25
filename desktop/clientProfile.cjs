const path = require("node:path");

const DEFAULT_CLIENT_ID = "default";
const CLIENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function parseClientId(argv = []) {
  const args = argv.filter((arg) => arg.startsWith("--client-id="));
  if (args.length > 1) throw new Error("Informe apenas um --client-id.");
  if (args.length === 0) return DEFAULT_CLIENT_ID;

  const value = args[0].slice("--client-id=".length).trim().toLowerCase();
  if (!CLIENT_ID_PATTERN.test(value)) {
    throw new Error("Identificador do cliente inválido. Use letras minúsculas, números e hífens (1 a 64 caracteres).");
  }
  return value;
}

function resolveClientProfile(argv, appDataPath) {
  const clientId = parseClientId(argv);
  return Object.freeze({
    clientId,
    userDataPath: path.join(appDataPath, "House Mix Desktop", "clients", clientId),
  });
}

module.exports = { DEFAULT_CLIENT_ID, parseClientId, resolveClientProfile };
