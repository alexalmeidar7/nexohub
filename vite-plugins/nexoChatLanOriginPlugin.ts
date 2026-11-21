/** Exibe para o QR um endereço local acessível por outros dispositivos.
 * Ativo somente no Vite de desenvolvimento. Não toca em produção.
 */
import os from "node:os";
import type { Plugin } from "vite";

function getLocalIp(): string | null {
  const found: Array<{ ip: string; weight: number }> = [];
  for (const [name, adapters] of Object.entries(os.networkInterfaces())) {
    if (/virtual|wsl|docker|vpn|tailscale|zerotier|hamachi|loopback|vmware|vbox|hyper-v|vethernet/i.test(name)) continue;
    for (const adapter of adapters || []) {
      if (adapter.family !== "IPv4" || adapter.internal) continue;
      const ip = adapter.address;
      if (!/^(192\.168\.|10\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(ip)) continue;
      let weight = 0;
      if (/wi-?fi|wlan|wireless/i.test(name)) weight += 30;
      if (/ethernet|^en\d|^eth\d/i.test(name)) weight += 20;
      if (ip.startsWith("192.168.")) weight += 10;
      found.push({ ip, weight });
    }
  }
  found.sort((a, b) => b.weight - a.weight);
  return found[0]?.ip || null;
}

export function nexoChatLanOriginPlugin(): Plugin {
  return {
    name: "nexo-chat-lan-origin-v2",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__nexo/chat-lan-origin", (req, res) => {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-store, max-age=0");
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }
        const ip = getLocalIp();
        const binding = server.httpServer?.address();
        const port = binding && typeof binding !== "string" ? binding.port : server.config.server.port || 8080;
        if (!ip) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: "local_network_unavailable" }));
          return;
        }
        res.end(JSON.stringify({ origin: `http://${ip}:${port}` }));
      });
    },
  };
}
