import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { ensureMusicScopeForUser } from "@/lib/musicStorageKeys";

type AppRole = "admin" | "user";
const KEEP_CONNECTED_KEY = "nexohub_keep_connected";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  role: AppRole | null;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  role: null,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const prevUserIdRef = useRef<string | null>(null);
  const manualSignOutRef = useRef(false);
  const isRefreshingRef = useRef(false);

  const fetchRole = useCallback(async (userId: string): Promise<AppRole> => {
    try {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (!error && data && data.length > 0) {
        return data.some((r: any) => r.role === "admin") ? "admin" : "user";
      }
    } catch { /* silent */ }
    return "user";
  }, []);

  const updateAuth = useCallback(async (newSession: Session | null) => {
    const newUser = newSession?.user ?? null;
    const newId = newUser?.id ?? null;

    if (newId !== prevUserIdRef.current) {
      prevUserIdRef.current = newId;
      if (newId) {
        ensureMusicScopeForUser(newId);
        const userRole = await fetchRole(newId);
        setRole(userRole);
      } else {
        setRole(null);
      }
      setUser(newUser);
    }
    
    setSession(newSession);
    setLoading(false);
  }, [fetchRole]);

  useEffect(() => {
    let mounted = true;

    // Heartbeat to keep session alive and trigger auto-refresh safely
    const heartbeat = setInterval(async () => {
      if (manualSignOutRef.current || isRefreshingRef.current) return;
      
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (!currentUser && !manualSignOutRef.current) {
          console.log("Auth heartbeat: No user found, attempting session recovery...");
          const { data: { session: recoveredSession } } = await supabase.auth.getSession();
          if (recoveredSession && mounted) {
            void updateAuth(recoveredSession);
          }
        }
      } catch (err) {
        console.error("Auth heartbeat error:", err);
      }
    }, 1000 * 60 * 5); // Every 5 minutes

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      if (!mounted) return;

      console.log(`Auth event: ${event}`);

      if (event === "SIGNED_OUT") {
        if (!manualSignOutRef.current) {
          // Attempt recovery if it wasn't a manual sign out
          const { data: { session: recovered } } = await supabase.auth.getSession();
          if (recovered) {
            void updateAuth(recovered);
            return;
          }
        }
        void updateAuth(null);
      } else if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        void updateAuth(currentSession);
      } else if (event === "USER_UPDATED") {
        void updateAuth(currentSession);
      }
    });

    // Initial session load
    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      if (mounted) {
        void updateAuth(initialSession);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    return () => {
      mounted = false;
      clearInterval(heartbeat);
      subscription.unsubscribe();
    };
  }, [updateAuth]);

  const signOut = async () => {
    manualSignOutRef.current = true;
    localStorage.setItem(KEEP_CONNECTED_KEY, "false");
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error during signOut:", err);
    } finally {
      prevUserIdRef.current = null;
      setUser(null);
      setSession(null);
      setRole(null);
      window.location.href = "/";
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, role, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
