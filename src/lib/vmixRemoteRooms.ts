import { supabase } from "@/integrations/supabase/client";
import { VmixRemoteRoom } from "./vmixRemoteRoom";

const rooms = new Map<string, { room: VmixRemoteRoom; refs: number; cleanup?: ReturnType<typeof setTimeout> }>();
const closing = new Map<string, Promise<unknown>>();
export async function acquireVmixRoom(connectionId: string) {
  await closing.get(connectionId);
  let entry = rooms.get(connectionId);
  if (!entry) {
    const channel = supabase.channel(`vmix-desktop:${connectionId}`, {
      config: { private: true, broadcast: { self: true, ack: true }, presence: { key: crypto.randomUUID() } },
    });
    entry = { room: new VmixRemoteRoom(channel), refs: 0 };
    rooms.set(connectionId, entry);
  }
  clearTimeout(entry.cleanup);
  entry.refs++;
  const current = entry;
  let released = false;
  return { room: entry.room, release: () => {
    if (released) return;
    released = true;
    current.refs--;
    if (current.refs) return;
    // Keep one subscription across StrictMode and route transitions. Detach all
    // listeners before unsubscribe; a new room starts only after removal.
    current.cleanup = setTimeout(() => {
      if (current.refs) return;
      current.room.close();
      rooms.delete(connectionId);
      const channel = supabase.getChannels().find(c => c.topic === `realtime:vmix-desktop:${connectionId}`);
      if (channel) {
        const removal = supabase.removeChannel(channel).finally(() => closing.delete(connectionId));
        closing.set(connectionId, removal);
      }
    }, 1500);
  } };
}
