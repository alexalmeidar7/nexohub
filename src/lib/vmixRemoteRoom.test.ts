import { afterEach, describe, expect, it, vi } from "vitest";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { VmixRemoteRoom, validVmixPaths } from "./vmixRemoteRoom";

class FakeChannel {
  static channels: FakeChannel[] = [];
  handlers: Array<{ type: string; event: string; fn: (payload: any) => void }> = [];
  presence: any = null;
  sent: any[] = [];
  constructor(public topic: string) { FakeChannel.channels.push(this); }
  on(type: string, filter: { event: string }, fn: (p: any) => void) { this.handlers.push({ type, event: filter.event, fn }); return this; }
  subscribe(fn: (s: string) => void) { queueMicrotask(() => fn("SUBSCRIBED")); return this; }
  presenceState() { return Object.fromEntries(FakeChannel.channels.filter(c => c.topic === this.topic && c.presence).map((c, i) => [String(i), [c.presence]])); }
  async track(payload: any) { this.presence = payload; this.sync(); return "ok"; }
  async untrack() { this.presence = null; this.sync(); return "ok"; }
  sync() { FakeChannel.channels.filter(c => c.topic === this.topic).forEach(c => c.emit("presence", "sync", {})); }
  emit(type: string, event: string, payload: any) { this.handlers.filter(h => h.type === type && h.event === event).forEach(h => h.fn(payload)); }
  async send(message: any) { this.sent.push(message.payload); FakeChannel.channels.filter(c => c.topic === this.topic).forEach(c => c.emit("broadcast", message.event, { payload: message.payload })); return "ok"; }
}
const rooms: VmixRemoteRoom[] = [];
const makeRoom = (topic = "studio-a") => {
  const channel = new FakeChannel(topic);
  const room = new VmixRemoteRoom(channel as unknown as RealtimeChannel);
  rooms.push(room);
  return { room, channel };
};
afterEach(() => { rooms.splice(0).forEach(r => r.close()); FakeChannel.channels = []; vi.useRealTimers(); });
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("remote control through the radio HMD", () => {
  it("delivers one ordered batch to the selected studio and waits for real execution confirmation", async () => {
    const host = makeRoom();
    const operator = makeRoom();
    const anotherStudio = makeRoom("studio-b");
    await flush();
    const execute = vi.fn(async (_paths: string[], _label: string, _expiresAt: number) => "executed");
    const otherExecute = vi.fn(async () => "wrong studio");
    await host.room.setHost(execute, "Estudio FM", "<vmix><active>1</active></vmix>");
    await anotherStudio.room.setHost(otherExecute, "Estudio B", "<vmix/>");
    const paths = ["/api/?Function=PreviewInput&Input=2", "/api/?Function=Cut"];
    expect(await operator.room.request(paths, "Efeito: Camera 2")).toBe("executed");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute.mock.calls[0][0]).toEqual(paths);
    expect(otherExecute).not.toHaveBeenCalled();
    expect(operator.room.state.available).toBe(true);
    expect(await operator.room.request(["/api/"])).toContain("<active>1</active>");
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("deduplicates repeated deliveries of the same cut", async () => {
    const host = makeRoom(); const operator = makeRoom();
    await flush();
    const execute = vi.fn(async () => "ok");
    await host.room.setHost(execute, "FM", "<vmix></vmix>");
    await operator.room.request(["/api/?Function=Cut"]);
    const request = operator.channel.sent.find(m => m.kind === "request");
    await operator.channel.send({ event: "vmix-message", payload: request });
    await flush();
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects expired requests and invalid API paths without touching the mixer", async () => {
    const host = makeRoom(); const operator = makeRoom();
    await flush();
    const execute = vi.fn(async () => "ok");
    await host.room.setHost(execute, "FM", "<vmix></vmix>");
    await operator.channel.send({ event: "vmix-message", payload: { kind: "request", id: "expired", sender: operator.room.actorId, target: host.room.actorId, paths: ["/api/?Function=Cut"], expiresAt: Date.now() - 1 } });
    await expect(operator.room.request(["https://example.com/api/"])).rejects.toThrow("inválido");
    expect(validVmixPaths(["/api/../../admin"])).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("reports a real execution failure and never retries the batch", async () => {
    const host = makeRoom(); const operator = makeRoom();
    await flush();
    const execute = vi.fn(async () => { throw new Error("vMix unavailable"); });
    await host.room.setHost(execute, "FM", "<vmix></vmix>");
    await expect(operator.room.request(["/api/?Function=StartStreaming"])).rejects.toThrow("vMix unavailable");
    expect(execute).toHaveBeenCalledTimes(1);
    await host.room.setHost(null);
    expect(operator.room.state.available).toBe(false);
  });

  it("does not repeat an executed action when its acknowledgement is lost", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const host = makeRoom(); const operator = makeRoom();
    await flush();
    const execute = vi.fn(async () => "executed");
    await host.room.setHost(execute, "FM", "<vmix></vmix>");
    const send = host.channel.send.bind(host.channel);
    host.channel.send = async message => message.payload.kind === "result" ? "ok" : send(message);
    const pending = operator.room.request(["/api/?Function=Cut"]).catch(error => error);
    await vi.advanceTimersByTimeAsync(35_001);
    expect((await pending).message).toContain("não foi reenviado");
    expect(execute).toHaveBeenCalledTimes(1);
    expect(operator.channel.sent.filter(m => m.kind === "request")).toHaveLength(1);
  });

  it("marks a silent host unavailable instead of showing old state as live", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
    const host = makeRoom(); const operator = makeRoom();
    await flush();
    await host.room.setHost(async () => "ok", "FM", "<vmix></vmix>");
    expect(operator.room.state.available).toBe(true);
    await vi.advanceTimersByTimeAsync(14_000);
    expect(operator.room.state.available).toBe(false);
    expect(operator.room.state.xml).toBe("");
  });
});
