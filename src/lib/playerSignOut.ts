import { playerSupabase } from "@/integrations/supabase/playerClient";
import { clearPlayerSession } from "@/lib/playerSession";

/** Ends only the Player's local Supabase session and returns to its login screen. */
export async function playerSignOut(loginPath?: string) {
  try { await playerSupabase.auth.signOut({ scope: "local" }); } catch { /* local cleanup below still applies */ }
  clearPlayerSession();
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith("player_profile") || key.startsWith("nexo_player_") || key.startsWith("player-step-home:"))
      .forEach((key) => localStorage.removeItem(key));
  } catch { /* storage can be unavailable in private mode */ }
  if (loginPath) window.location.href = loginPath;
}
