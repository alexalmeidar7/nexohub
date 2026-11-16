import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { createOwnedRealtimeChannel } from "./ownedRealtimeChannel";

describe("chatbot realtime channel ownership", () => {
  it("isolates simultaneous inboxes and a remount from pending cleanup", async () => {
    const client = createClient("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const first = createOwnedRealtimeChannel(client.realtime, "wa-contacts-user");
    const second = createOwnedRealtimeChannel(client.realtime, "wa-contacts-user");
    expect(first).not.toBe(second);
    const cleanup = client.removeChannel(first);
    const remounted = createOwnedRealtimeChannel(client.realtime, "wa-contacts-user");
    await cleanup;
    expect(client.getChannels()).toContain(second);
    expect(remounted).not.toBe(first);
    expect(remounted).not.toBe(second);
    await client.removeAllChannels();
  });
});
