import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginDataActivity, classifyDataRequest, finishDataActivity,
  recordLocalDataEvent, useActivityStatus,
} from "./activityStatus";
afterEach(() => { vi.useRealTimers(); });

describe("DB activity origin and operation", () => {
  it("classifies Supabase Storage POST list as a read, never a fake save", () => {
    const base = "https://example.supabase.co";
    expect(classifyDataRequest(base + "/storage/v1/object/list/xml-files", { method: "POST" }))
      .toEqual({ origin: "online", operation: "read" });
    expect(classifyDataRequest(base + "/storage/v1/object/info/xml-files/a.xml", { method: "POST" }))
      .toEqual({ origin: "online", operation: "read" });
    expect(classifyDataRequest(base + "/storage/v1/object/xml-files/a.xml", { method: "POST" }))
      .toEqual({ origin: "online", operation: "write" });
    expect(classifyDataRequest(base + "/rest/v1/user_settings?select=*", { method: "GET" }))
      .toEqual({ origin: "online", operation: "read" });
    expect(classifyDataRequest(base + "/rest/v1/user_settings", { method: "PATCH" }))
      .toEqual({ origin: "online", operation: "write" });
    expect(classifyDataRequest(base + "/rest/v1/rpc/find_messages", { method: "POST" })).toBeNull();
    expect(classifyDataRequest(base + "/functions/v1/public-cenario-data", { method: "POST" })).toBeNull();
    expect(classifyDataRequest(base + "/auth/v1/token", { method: "POST" })).toBeNull();
  });

  it("does not mistake a browser request for the HMD's local database", () => {
    const address = "http://127.0.0.1:8787/v1/sync/changes?limit=10";
    expect(classifyDataRequest(address, {}, false)).toBeNull();
    expect(classifyDataRequest(address, {}, true))
      .toEqual({ origin: "local", operation: "read" });
    expect(classifyDataRequest("http://127.0.0.1:8787/v1/sync/outbox", { method: "POST" }, true))
      .toEqual({ origin: "local", operation: "write" });
    expect(classifyDataRequest("http://127.0.0.1:8787/health", {}, true)).toBeNull();
  });

  it("keeps online and local busy counts separately and returns to idle", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useActivityStatus());
    const online = beginDataActivity("online", "read");
    recordLocalDataEvent({ id: "station-1", phase: "start", operation: "write" });
    act(() => vi.advanceTimersByTime(260));
    expect(result.current.active.online.read).toBe(1);
    expect(result.current.active.local.write).toBe(1);
    act(() => {
      finishDataActivity(online, true);
      recordLocalDataEvent({ id: "station-1", phase: "end", operation: "write", ok: true });
    });
    expect(result.current.active.online.read).toBe(0);
    expect(result.current.active.local.write).toBe(0);
    expect(result.current.lastByOrigin.online?.operation).toBe("read");
    expect(result.current.lastByOrigin.local?.operation).toBe("write");
    unmount();
  });

  it("does not label a quick check as ongoing activity and expires stalled requests", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useActivityStatus());
    const fast = beginDataActivity("online", "read");
    act(() => finishDataActivity(fast, true));
    act(() => vi.advanceTimersByTime(260));
    expect(result.current.active.online.read).toBe(0);
    const stuck = beginDataActivity("online", "write");
    act(() => vi.advanceTimersByTime(260));
    expect(result.current.active.online.write).toBe(1);
    act(() => vi.advanceTimersByTime(20_100));
    expect(result.current.active.online.write).toBe(0);
    finishDataActivity(stuck, false);
    unmount();
  });
});
