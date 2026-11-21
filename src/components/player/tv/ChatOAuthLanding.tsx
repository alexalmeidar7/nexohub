import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { clearChatOAuthReturn, getChatOAuthReturn } from "@/lib/chatOAuthReturn";

/** Supabase can return OAuth to / when it cannot preserve the deeper route.
 * Hold the dashboard while the Player client processes the PKCE callback,
 * then send the listener back to the SAME station chat on this origin.
 */
export default function ChatOAuthLanding({ children }: { children: ReactNode }) {
  const [target] = useState(() => getChatOAuthReturn());
  const [ready, setReady] = useState(!target);

  useEffect(() => {
    if (!target) return;
    let active = true;
    const complete = async () => {
      try {
        await playerSupabase.auth.initialize();
        await playerSupabase.auth.getSession();
      } catch (error) {
        console.warn("Nexo Chat: OAuth return needs another login", error);
      } finally {
        if (active) { clearChatOAuthReturn(); setReady(true); }
      }
    };
    void complete();
    return () => { active = false; };
  }, [target]);

  if (!target) return <>{children}</>;
  if (!ready) return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#111", color: "#fff" }}>Concluindo login do chat...</main>;
  return <Navigate to={target} replace />;
}
