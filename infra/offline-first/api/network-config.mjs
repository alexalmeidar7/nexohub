import { isIP } from "node:net";

// LAN is explicit, private IPv4 only, and requires TLS and a permitted subnet.
export function resolveApiHost(env = process.env) {
  const host = env.HOUSEMIX_API_HOST || "127.0.0.1";
  if (host === "127.0.0.1") return host;
  const privateIp = isIP(host) === 4 && /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)/.test(host);
  if (!privateIp || env.HOUSEMIX_ALLOW_LAN !== "true" || env.HOUSEMIX_API_TLS !== "true" ||
      !env.HOUSEMIX_TLS_CERT_FILE || !env.HOUSEMIX_TLS_KEY_FILE || !env.HOUSEMIX_LAN_SUBNET) {
    throw new Error("LAN binding requires explicit private IPv4, HTTPS certificates and authorized subnet.");
  }
  const subnet = parseSubnet(env.HOUSEMIX_LAN_SUBNET);
  if (!subnet(host)) throw new Error("LAN host is outside authorized subnet.");
  return host;
}
export function parseSubnet(value) {
  const [ip, prefix, extra] = String(value || "").split("/");
  if (extra !== undefined || isIP(ip) !== 4 || !/^(?:1[6-9]|2[0-9]|3[0-2])$/.test(prefix || ""))
    throw new Error("Invalid authorized LAN subnet.");
  const number = address => address.split(".").reduce((n, octet) => ((n << 8) | Number(octet)) >>> 0, 0);
  const mask = (0xffffffff << (32 - Number(prefix))) >>> 0;
  const network = (number(ip) & mask) >>> 0;
  return address => {
    const normalized = String(address || "").replace(/^::ffff:/, "");
    return isIP(normalized) === 4 && ((number(normalized) & mask) >>> 0) === network;
  };
}
