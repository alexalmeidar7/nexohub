import { useEffect } from "react";
import { playerSupabase } from "@/integrations/supabase/playerClient";

const SESSION_KEY = "nexo_player_session_id";
const HEARTBEAT_MS = 20 * 1000; // 20s

function getSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = (crypto as any)?.randomUUID?.() || `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `s_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

/**
 * Sends a heartbeat every 20s while the Player is open, so
 * AudienceWidget's "Conectados no Player" reflects real-time viewers.
 */
export function usePlayerHeartbeat(userId?: string | null) {
  useEffect(() => {
    if (!userId) return;
    const sessionId = getSessionId();
    let cancelled = false;
    // Transient 5xx from the edge runtime must never break the Player:
    // back off exponentially and keep going silently.
    let skipCycles = 0;
    let failures = 0;

    const ping = async () => {
      if (cancelled) return;
      // Skip when tab is hidden to avoid inflating counts with idle tabs.
      if (typeof document !== "undefined" && document.hidden) return;
      if (skipCycles > 0) { skipCycles -= 1; return; }
      try {
        const { error } = await playerSupabase.functions.invoke("player-heartbeat", {
          body: { userId, sessionId },
        });
        if (error) throw error;
        failures = 0;
      } catch {
        failures = Math.min(failures + 1, 5);
        // 1 → 2 → 4 → 8 → 16 skipped cycles (20s each)
        skipCycles = Math.pow(2, failures - 1);
      }
    };

    void ping();
    const iv = setInterval(() => { void ping(); }, HEARTBEAT_MS);
    const onVis = () => { if (!document.hidden) void ping(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId]);
}
