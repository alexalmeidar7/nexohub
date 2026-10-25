const fs = require("node:fs");
const path = require("node:path");
const { parseClientId } = require("./clientProfile.cjs");
function registryPath(appDataPath) { return path.join(appDataPath, "NexoBrasil", "HouseMix", "client-registry.json"); }
function listClients(appDataPath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(registryPath(appDataPath), "utf8"));
    return Array.isArray(parsed) ? parsed.filter(x => x && typeof x.id === "string" && typeof x.name === "string") : [];
  } catch (error) { if (error.code === "ENOENT") return []; throw new Error("Não foi possível ler o cadastro local de clientes."); }
}
function slugify(name) { return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64); }
function createClient(appDataPath, rawName) {
  const name = rawName.trim();
  if (!name || name.length > 80) throw new Error("O nome deve ter entre 1 e 80 caracteres.");
  const id = parseClientId([`--client-id=${slugify(name)}`]);
  if (id === "default") throw new Error("Nome de cliente inválido.");
  const clients = listClients(appDataPath);
  if (clients.some(x => x.id === id)) throw new Error("Já existe um cliente com esse identificador.");
  const next = [...clients, { id, name, createdAt: new Date().toISOString() }];
  const file = registryPath(appDataPath); fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + ".tmp"; fs.writeFileSync(temp, JSON.stringify(next, null, 2), { encoding: "utf8", mode: 0o600 }); fs.renameSync(temp, file);
  return next;
}
module.exports = { registryPath, listClients, createClient, slugify };
