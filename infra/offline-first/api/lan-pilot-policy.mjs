import { isIP } from "node:net";

// Candidate policy for an isolated LAN pilot. Not wired to the production listener.
function ipv4(value) {
  if (typeof value !== "string" || isIP(value) !== 4) throw new Error("Invalid IPv4 address");
  return value.split(".").reduce((n, part) => (n * 256 + Number(part)) >>> 0, 0);
}
function privateIp(n) {
  return (n >>> 24) === 10 || (n >>> 20) === 0xac1 || (n >>> 16) === 0xc0a8;
}
export function createLanPilotPolicy({ host, cidr, tlsOptions }) {
  const address = ipv4(host);
  if (!privateIp(address)) throw new Error("Private interface required");
  if (!tlsOptions?.cert || !tlsOptions?.key || !["TLSv1.2", "TLSv1.3"].includes(tlsOptions.minVersion)) {
    throw new Error("Validated HTTPS configuration required");
  }
  const match = /^([^/]+)\/(\d{1,2})$/.exec(cidr || "");
  if (!match) throw new Error("Explicit private subnet required");
  const bits = Number(match[2]);
  if (bits < 8 || bits > 30) throw new Error("Invalid subnet prefix");
  const network = ipv4(match[1]);
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  if ((network & mask) >>> 0 !== network || !privateIp(network) || !privateIp(broadcast) ||
      ((address & mask) >>> 0) !== network || address === network || address === broadcast) {
    throw new Error("Interface must belong to an explicitly configured private subnet");
  }
  return Object.freeze({
    host,
    allowsPeer(peer) {
      try {
        const ip = ipv4(peer);
        return ip !== network && ip !== broadcast && ((ip & mask) >>> 0) === network;
      } catch { return false; }
    }
  });
}
