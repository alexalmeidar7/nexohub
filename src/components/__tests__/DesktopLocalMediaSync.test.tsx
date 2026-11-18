import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  channel: { on: vi.fn(), subscribe: vi.fn() },
  save: vi.fn().mockResolvedValue("local.xml"),
  localize: vi.fn(async (xml: string) => xml),
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "station" }, loading: false }) }));
vi.mock("@/hooks/useUserSlug", () => ({ useUserSlug: () => "station-slug" }));
vi.mock("@/lib/clientAuthAccounts", () => ({ findClientAccountById: () => null }));
vi.mock("@/lib/desktopLocalXml", () => ({ localizeXmlImageUrls: mocks.localize }));
vi.mock("@/lib/desktopPromotionBanners", () => ({
  cachePromotionBanners: vi.fn().mockResolvedValue({ failed: [] }), rotateDesktopBanner: vi.fn().mockResolvedValue(undefined),
  saveDesktopXml: (...args: unknown[]) => mocks.save(...args), BANNER_DURATION_MS: 5000,
}));
vi.mock("@/lib/ownedRealtimeChannel", () => ({ createOwnedRealtimeChannel: () => mocks.channel }));
vi.mock("@/integrations/supabase/client", () => {
  const query = { select: () => query, eq: () => query, order: () => query, then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }) };
  return { supabase: { realtime: {}, from: () => query, removeChannel: vi.fn() } };
});
import DesktopLocalMediaSync from "../DesktopLocalMediaSync";
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("HMD local XML synchronization", () => {
  it("updates other feeds despite one failure, then updates the program without a database event", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0); mocks.save.mockClear();
    vi.stubEnv("VITE_SUPABASE_URL", "https://xml-test.invalid");
    vi.stubGlobal("AbortSignal", { timeout: () => new AbortController().signal });
    mocks.channel.on.mockReturnValue(mocks.channel); mocks.channel.subscribe.mockReturnValue(mocks.channel);
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    window.houseMixDesktop = { initializeLocalAssets: vi.fn().mockResolvedValue(undefined), cacheImage: vi.fn() } as any;
    let program = "Before";
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url.includes("serve-xml-geral")) throw new Error("Unavailable feed");
      return { ok: true, text: async () => `<items><programa_nome>${program}</programa_nome></items>` };
    }));
    const view = render(<DesktopLocalMediaSync />);
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(mocks.save.mock.calls.map(call => call[2])).toContain("broadcast.xml");
    expect(mocks.save.mock.calls.map(call => call[2])).toContain("vmix-live.xml");
    expect(mocks.save).toHaveBeenCalledTimes(11);
    program = "After";
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(mocks.save.mock.calls.some(call => call[2] === "broadcast.xml" && call[3].includes("After"))).toBe(true);
    expect(mocks.channel.on).toHaveBeenCalledWith("postgres_changes", expect.objectContaining({ table: "programas", filter: "user_id=eq.station" }), expect.any(Function));
    const count = mocks.save.mock.calls.length; view.unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
    expect(mocks.save).toHaveBeenCalledTimes(count);
  });
});
