import { afterEach, describe, expect, it, vi } from "vitest";
import { VmixPreviewSession } from "./vmixPreviewSession";
import { limitPreviewSender, previewRate } from "./vmixPreviewMedia";
import type { VmixRemoteRoom } from "./vmixRemoteRoom";

const sessions: VmixPreviewSession[] = [];
afterEach(() => { sessions.splice(0).forEach(s => s.close()); vi.useRealTimers(); vi.unstubAllGlobals(); });
function setup(host = true) {
  let receive: (message: any) => void = () => {};
  const sent: any[] = [];
  const room = {
    actorId: host ? "radio" : "operator", state: { available: true, hostId: "radio", joined: true },
    listenMedia(fn: typeof receive) { receive = fn; return () => {}; },
    listen(fn: () => void) { fn(); return () => {}; },
    sendMedia(message: any) { sent.push(message); return Promise.resolve("ok"); }
  };
  const status = vi.fn(), stream = vi.fn();
  const session = new VmixPreviewSession(room as unknown as VmixRemoteRoom, host, [], status, stream);
  sessions.push(session);
  return { session, sent, status, receive: (message: any) => receive({ sender: host ? "operator" : "radio", target: room.actorId, session: "attempt", ...message }) };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

describe("remote preview authorization and resource limits", () => {
  it("does not capture or create a connection while the radio has disabled publishing", async () => {
    const x = setup();
    const rtc = vi.fn(); vi.stubGlobal("RTCPeerConnection", rtc);
    x.receive({ kind: "hello", rate: 900 }); await flush();
    expect(x.sent.some(m => m.kind === "status" && m.enabled === false)).toBe(true);
    expect(rtc).not.toHaveBeenCalled();
  });
  it("enabled without viewers remains idle; a cancelled preparation cannot leak capture", async () => {
    const x = setup();
    let complete!: (capture: any) => void;
    let signal!: AbortSignal;
    const capture = vi.fn((value: AbortSignal) => { signal = value; return new Promise<any>(r => { complete = r; }); });
    x.session.setPublisher(capture);
    expect(capture).not.toHaveBeenCalled();
    x.receive({ kind: "hello", rate: 300 }); await flush();
    expect(capture).toHaveBeenCalledTimes(1);
    x.session.setPublisher(null);
    expect(signal.aborted).toBe(true);
    const stop = vi.fn(); complete({ stream: {}, stop }); await flush();
    expect(stop).toHaveBeenCalledTimes(1);
    expect(x.sent.filter(m => m.kind === "offer")).toHaveLength(0);
  });
  it("expires an operator lease and stops pending capture after loss of connectivity", async () => {
    vi.useFakeTimers();
    const x = setup(); let signal!: AbortSignal;
    x.session.setPublisher(value => { signal = value; return new Promise(() => {}); });
    x.receive({ kind: "hello", rate: 500 }); await flush();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(signal.aborted).toBe(true);
  });
  it("ignores media offers from another actor or an expired viewing attempt", async () => {
    const x = setup(false); const rtc = vi.fn(); vi.stubGlobal("RTCPeerConnection", rtc);
    x.session.watch(500);
    x.receive({ kind: "offer", sender: "another-radio", description: { type: "offer", sdp: "bad" } });
    x.receive({ kind: "offer", session: "old-attempt", description: { type: "offer", sdp: "bad" } });
    await flush(); expect(rtc).not.toHaveBeenCalled();
  });
  it("caps audio at 64 Kbps and video at exactly the selected reference profile", async () => {
    for (const rate of [300, 500, 900] as const) {
      const apply = vi.fn();
      await limitPreviewSender({ track: { kind: "video" }, getParameters: () => ({ encodings: [{}] }), setParameters: apply } as any, rate);
      expect(apply.mock.calls[0][0].encodings[0]).toEqual({ maxBitrate: rate * 1000, maxFramerate: 20 });
      expect(apply.mock.calls[0][0].degradationPreference).toBe("maintain-framerate");
    }
    const apply = vi.fn();
    await limitPreviewSender({ track: { kind: "audio" }, getParameters: () => ({ encodings: [{}] }), setParameters: apply } as any, 900);
    expect(apply.mock.calls[0][0].encodings[0].maxBitrate).toBe(64000);
    expect(previewRate(700000)).toBe(500);
  });
});
