import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

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

    const ping = () => {
      if (cancelled) return;
      // Skip when tab is hidden to avoid inflating counts with idle tabs.
      if (typeof document !== "undefined" && document.hidden) return;
      supabase.functions.invoke("player-heartbeat", {
        body: { userId, sessionId },
      }).catch(() => {});
    };

    ping();
    const iv = setInterval(ping, HEARTBEAT_MS);
    const onVis = () => { if (!document.hidden) ping(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelled = true;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [userId]);
}
