import type { SupabaseClient } from "@supabase/supabase-js";

let nextChannelId = 0;

/** Each effect owns its channel, including while an old cleanup is pending. */
export function createOwnedRealtimeChannel(
  realtime: Pick<SupabaseClient["realtime"], "channel">,
  topic: string,
) {
  return realtime.channel(`${topic}:owner-${++nextChannelId}`);
}
