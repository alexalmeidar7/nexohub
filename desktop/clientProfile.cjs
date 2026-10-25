const path = require("node:path");

const DEFAULT_CLIENT_ID = "default";
const CLIENT_ID_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

function parseClientId(argv = []) {
  const args = argv.filter((arg) => arg.startsWith("--client-id="));
  if (args.length > 1) throw new Error("Informe apenas um --client-id.");
  if (args.length === 0) return DEFAULT_CLIENT_ID;
  const value = args[0].slice("--client-id=".length).trim().toLowerCase();
  if (!CLIENT_ID_PATTERN.test(value)) throw new Error("Identificador do cliente inválido. Use letras minúsculas, números e hífens (1 a 64 caracteres).");
  return value;
}
function clientSessionPartition(clientId) {
  const id = parseClientId(["--client-id=" + clientId]);
  if (id === DEFAULT_CLIENT_ID) throw new Error("O ambiente padrão não pode compartilhar sessão com clientes.");
  return "persist:housemix-" + id;
}
function resolveClientProfile(argv, appDataPath) {
  const clientId = parseClientId(argv);
  const workspaceRoot = path.join(appDataPath, "NexoBrasil", "HouseMix", "clients", clientId);
  return Object.freeze({
    clientId,
    workspaceRoot,
    userDataPath: path.join(workspaceRoot, "runtime", "electron"),
    sessionDataPath: path.join(workspaceRoot, "runtime", "session-data"),
    sessionPartition: clientSessionPartition(clientId),
  });
}
module.exports = { DEFAULT_CLIENT_ID, parseClientId, resolveClientProfile, clientSessionPartition };
