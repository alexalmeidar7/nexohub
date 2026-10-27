// Decide whether a vMix URL must be handled by the paired studio Bridge.
// The Edge runtime cannot safely validate a DNS hostname and then call fetch:
// fetch resolves the hostname again, leaving a DNS-rebinding window. Therefore
// only explicit public IPv4 literals may use the direct Edge proxy. DNS names,
// IPv6 literals, private/reserved IPv4 addresses, and malformed URLs use Bridge.
export function shouldRouteVmixThroughBridge(input: string): boolean {
  try {
    const url = new URL(input);
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
      return true;
    }

    const host = url.hostname.toLowerCase().replace(/^\\[|\\]$/g, "");
    const match = host.match(/^(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})\\.(\\d{1,3})$/);

    // Hostnames and all IPv6 literals are intentionally routed through the
    // Bridge, where the destination is reached from the studio computer.
    if (!match) return true;

    const octets = match.slice(1).map(Number);
    if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;

    const [a, b, c] = octets;
    if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return true;
    if (a === 192 && b === 88 && c === 99) return true;
    if (a === 198 && (b === 18 || b === 19)) return true;
    if (a === 198 && b === 51 && c === 100) return true;
    if (a === 203 && b === 0 && c === 113) return true;

    return false;
  } catch {
    return true;
  }
}
