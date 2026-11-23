import { describe, expect, it } from "vitest";
import { resolveHmdBadge } from "./desktopStationRole";
const devices = [
  { device_id: "a", registered_at: "2026-11-23T17:00:00Z" },
  { device_id: "b", registered_at: "2026-11-23T18:00:00Z" },
  { device_id: "c", registered_at: "2026-11-23T19:00:00Z" },
];
describe("HMD role badges", () => {
  it("shows P and ordered S numbers across shared station computers", () => {
    expect(resolveHmdBadge(devices, "a", "a")).toEqual({ badge: "P", isPrimary: true });
    expect(resolveHmdBadge(devices, "a", "b").badge).toBe("S1");
    expect(resolveHmdBadge(devices, "a", "c").badge).toBe("S2");
  });
  it("renumbers after primary promotion without leaking a stale badge", () => {
    expect(resolveHmdBadge(devices, "b", "a").badge).toBe("S1");
    expect(resolveHmdBadge(devices, "b", "b").badge).toBe("P");
    expect(resolveHmdBadge(devices, "b", "c").badge).toBe("S2");
  });
  it("never claims a primary if no central election or unknown device", () => {
    expect(resolveHmdBadge(devices, null, "a").badge).toBeNull();
    expect(resolveHmdBadge(devices, "a", "d").badge).toBeNull();
  });
});
