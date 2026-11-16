import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { playerSupabase } from "@/integrations/supabase/playerClient";

export function usePlayerAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const { data: { subscription } } = playerSupabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    });
    void playerSupabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    }).catch(() => {
      if (active) setLoading(false);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async (_options?: { redirect?: boolean }) => {
    await playerSupabase.auth.signOut({ scope: "local" });
    setSession(null);
  };

  return { user: (session?.user ?? null) as User | null, session, loading, signOut };
}
