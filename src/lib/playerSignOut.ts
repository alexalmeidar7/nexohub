import { playerSupabase } from "@/integrations/supabase/playerClient";
import { clearPlayerSession } from "@/lib/playerSession";
import { endLinkedTvSession, readLinkedTv } from "@/lib/nexoTvDevice";

/** Ends only the Player's local Supabase session and returns to its login screen. */
export async function playerSignOut(loginPath?: string) {
  const linked = readLinkedTv();
  const session = linked ? (await playerSupabase.auth.getSession()).data.session : null;
  const ended = linked && await endLinkedTvSession(session?.user.id);
  if (!ended) {
    try { await playerSupabase.auth.signOut({ scope: "local" }); } catch { /* local cleanup below still applies */ }
  }
  clearPlayerSession();
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("player_profile") || key.startsWith("nexo_player_") || key.startsWith("player-step-home:"))
      .forEach((key) => localStorage.removeItem(key));
  } catch { /* storage can be unavailable in private mode */ }
  if (loginPath) window.location.href = loginPath;
}
