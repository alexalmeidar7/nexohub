import { playerSupabase } from "@/integrations/supabase/playerClient";
import { clearPlayerSession } from "@/lib/playerSession";

const STORAGE_KEY = "nexohub_player_linked_tv";
export type LinkedTv = { deviceId: string; userId: string; slug: string };

export function readLinkedTv(): LinkedTv | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return value && typeof value.deviceId === "string" && typeof value.userId === "string" &&
      typeof value.slug === "string" && /^[a-z0-9][a-z0-9_-]*$/.test(value.slug) ? value as LinkedTv : null;
  } catch {
    return null;
  }
}

export function saveLinkedTv(device: LinkedTv) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(device));
}

export function clearLinkedTv() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* Storage may be unavailable. */ }
}

export async function endLinkedTvSession(userId?: string) {
  const device = readLinkedTv();
  if (!device || device.userId !== userId) return false;
  const { data, error } = await playerSupabase.functions.invoke("nexo-tv-device", {
    body: { action: "revoke", deviceId: device.deviceId },
  });
  if (error || !data?.ok) throw new Error("tv_revoke_failed");
  await playerSupabase.auth.signOut({ scope: "local" });
  clearPlayerSession();
  clearLinkedTv();
  return true;
}
