import { describe, expect, it, vi } from "vitest";
import { createCostAwareFetch } from "./requestBudget";

const endpoint = "https://qazvgmgdidjhbvcuinpy.supabase.co/rest/v1/programas?select=id&user_id=eq.tenant-a";
const json = (body: string, status = 200) =>
  new Response(body, { status, headers: { "content-type": "application/json", "content-length": String(body.length) } });

describe("cost-aware Supabase reads", () => {
  it("shares in-flight reads and caches only within the short TTL", async () => {
    let time = 0;
    const transport = vi.fn(async () => json('[{"id":1}]'));
    const request = createCostAwareFetch(transport as typeof fetch, () => time);
    const options = { headers: { authorization: "Bearer tenant-a" } };
    const calls = await Promise.all(Array.from({ length: 8 }, () => request(endpoint, options)));
    expect(transport).toHaveBeenCalledTimes(1);
    for (const response of calls) expect(await response.json()).toEqual([{ id: 1 }]);
    expect((await request(endpoint, options)).ok).toBe(true);
    expect(transport).toHaveBeenCalledTimes(1);
    time = 8_001;
    await request(endpoint, options);
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("never shares data between bearer credentials", async () => {
    const transport = vi.fn(async () => json("[]"));
    const request = createCostAwareFetch(transport as typeof fetch);
    await request(endpoint, { headers: { authorization: "Bearer a" } });
    await request(endpoint, { headers: { authorization: "Bearer b" } });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("invalidates table reads when a mutation happens", async () => {
    const transport = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) =>
      json(init?.method === "PATCH" ? "{}" : "[]"));
    const request = createCostAwareFetch(transport as typeof fetch);
    await request(endpoint);
    await request(endpoint);
    await request("https://qazvgmgdidjhbvcuinpy.supabase.co/rest/v1/programas?id=eq.1", { method: "PATCH", body: "{}" });
    await request(endpoint);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("does not cache auth, failures, bypassed reads or other origins", async () => {
    const transport = vi.fn(async () => json("{}", 402));
    const request = createCostAwareFetch(transport as typeof fetch);
    await request(endpoint); await request(endpoint);
    await request(endpoint, { cache: "no-store" });
    await request("https://qazvgmgdidjhbvcuinpy.supabase.co/auth/v1/user");
    await request("https://api.example.com/rest/v1/programas");
    expect(transport).toHaveBeenCalledTimes(5);
  });

  it("caches identical XML Storage listings, but never uploads", async () => {
    const transport = vi.fn(async () => json('{"data":[]}'));
    const request = createCostAwareFetch(transport as typeof fetch);
    const listUrl = "https://qazvgmgdidjhbvcuinpy.supabase.co/storage/v1/object/list/xml-files";
    const options = { method: "POST", body: '{"prefix":"weather-icons/","limit":100}' };
    await request(listUrl, options); await request(listUrl, options);
    expect(transport).toHaveBeenCalledTimes(1);
    await request("https://qazvgmgdidjhbvcuinpy.supabase.co/storage/v1/object/xml-files/example.xml", { method: "POST", body: "file" });
    await request(listUrl, options);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("does not repopulate stale reads after a concurrent write", async () => {
    let release!: (value: Response) => void;
    const transport = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return Promise.resolve(json("{}"));
      if (transport.mock.calls.length === 1) return new Promise<Response>(resolve => { release = resolve; });
      return Promise.resolve(json("[]"));
    });
    const request = createCostAwareFetch(transport as typeof fetch);
    const original = request(endpoint);
    await request("https://qazvgmgdidjhbvcuinpy.supabase.co/rest/v1/programas?id=eq.1", { method: "PATCH", body: "{}" });
    release(json('[{"id":"old"}]'));
    await original;
    await request(endpoint);
    expect(transport).toHaveBeenCalledTimes(3);
  });

  it("does not reuse an unfinished old read after a write", async () => {
    let release!: (response: Response) => void;
    const transport = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PATCH") return Promise.resolve(json("{}"));
      if (transport.mock.calls.length === 1) return new Promise<Response>(resolve => { release = resolve; });
      return Promise.resolve(json('[{"id":"new"}]'));
    });
    const request = createCostAwareFetch(transport as typeof fetch);
    const oldRead = request(endpoint);
    await request("https://qazvgmgdidjhbvcuinpy.supabase.co/rest/v1/programas?id=eq.1", { method: "PATCH", body: "{}" });
    const freshRead = await request(endpoint);
    expect(await freshRead.json()).toEqual([{ id: "new" }]);
    release(json('[{"id":"old"}]'));
    await oldRead;
    expect(transport).toHaveBeenCalledTimes(3);
  });
});
