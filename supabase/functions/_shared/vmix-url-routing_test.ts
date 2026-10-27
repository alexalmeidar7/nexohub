import { shouldRouteVmixThroughBridge } from "./vmix-url-routing.ts";

const cases: Array<[string, string, boolean]> = [
  ["routes loopback through Bridge", "http://127.0.0.1:8088", true],
  ["routes RFC1918 addresses through Bridge", "http://192.168.1.25:8088", true],
  ["routes carrier-grade NAT through Bridge", "http://100.64.0.1:8088", true],
  ["routes link-local metadata address through Bridge", "http://169.254.169.254", true],
  ["routes documentation ranges through Bridge", "http://203.0.113.10:8088", true],
  ["routes DNS hostnames through Bridge", "https://vmix.example.com:8088", true],
  ["routes IPv6 literals through Bridge", "https://[2606:4700:4700::1111]:8088", true],
  ["routes URLs with embedded credentials through Bridge", "https://user:pass@8.8.8.8:8088", true],
  ["routes non-HTTP schemes through Bridge", "ftp://8.8.8.8:8088", true],
  ["routes malformed URLs through Bridge", "not a URL", true],
  ["allows an explicit public IPv4 literal", "https://8.8.8.8:8088", false],
  ["normalizes integer-form loopback IPv4 before checking", "http://2130706433:8088", true],
];

for (const [name, input, expected] of cases) {
  Deno.test(name, () => {
    const actual = shouldRouteVmixThroughBridge(input);
    if (actual !== expected) {
      throw new Error(`Expected ${expected} for ${input}, received ${actual}`);
    }
  });
}
