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
  const loadingRef = useRef(true); // mirror of loading state to avoid stale closures
  const lastGoodSessionRef = useRef<Session | null>(null);

  const finishLoading = useCallback(() => {
    loadingRef.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Load backup session if available and keepConnected is true
    const keepConnected = localStorage.getItem(KEEP_CONNECTED_KEY) === "true";
    if (keepConnected && !lastGoodSessionRef.current) {
      const backup = localStorage.getItem('nexohub_backup_session');
      if (backup) {
        try {
          lastGoodSessionRef.current = JSON.parse(backup);
        } catch (e) {
          console.error("Auth: Failed to parse backup session", e);
        }
      }
    }

    const timers: ReturnType<typeof setTimeout>[] = [];

    const addTimer = (fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      timers.push(t);
      return t;
    };

    // Hard safety net: if loading is still true after 15s, force it off
    addTimer(() => {
      if (mounted && loadingRef.current) {
        console.warn("Auth: safety timeout reached (15s), forcing load complete");
        finishLoading();
      }
    }, 15000);

    const fetchRole = async (userId: string): Promise<AppRole> => {
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
    };

    const updateAuth = async (newSession: Session | null) => {
      if (!mounted) return;

      if (newSession) {
        lastGoodSessionRef.current = newSession;
      }

      const newUser = newSession?.user ?? null;

      // CRITICAL: never log the user out unless they explicitly clicked "Sair".
      // If we receive a null session event but we have a known good session,
      // keep the user logged in and try to refresh in the background.
      // This prevents a logout on one device from affecting another (multi-device support).
      if (!newUser && !manualSignOutRef.current) {

        if (lastGoodSessionRef.current?.user) {
          const restored = lastGoodSessionRef.current;
          if (prevUserIdRef.current !== restored.user.id) {
            prevUserIdRef.current = restored.user.id;
            ensureMusicScopeForUser(restored.user.id);
            setUser(restored.user);
          }
          setSession(restored);
          finishLoading();
          // Try to refresh silently
          supabase.auth.refreshSession().then(({ data: refreshed }) => {
            if (refreshed.session && mounted) {
              lastGoodSessionRef.current = refreshed.session;
              setSession(refreshed.session);
            }
          }).catch(() => { /* keep current state */ });
          return;
        }
        // No prior session at all -> treat as logged out
        prevUserIdRef.current = null;
        setUser(null);
        setSession(null);
        setRole(null);
        finishLoading();
        return;
      }

      const newId = newUser?.id ?? null;
      if (newId !== prevUserIdRef.current) {
        prevUserIdRef.current = newId;
        ensureMusicScopeForUser(newId);
        setUser(newUser);
      }
      setSession(newSession);

      if (!newUser) {
        setRole(null);
        finishLoading();
        return;
      }

      // Race role fetch against a 5s timeout so we never hang
      const roleResult = await Promise.race([
        fetchRole(newUser.id),
        new Promise<AppRole>((resolve) => addTimer(() => resolve("user"), 5000)),
      ]);

      if (!mounted) return;
      setRole(roleResult);
      finishLoading();
    };

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log(`Auth event: ${event}`);

      // Se o evento for INITIAL_SESSION e não tivermos sessão, tentamos recuperar a última conhecida se "mantenha-me conectado" estiver ativo
      if (event === "INITIAL_SESSION" && !session) {
        const keepConnected = localStorage.getItem(KEEP_CONNECTED_KEY) === "true";
        if (keepConnected && lastGoodSessionRef.current) {
          console.log("Auth: Tentando restaurar sessão inicial salva.");
          void updateAuth(lastGoodSessionRef.current);
          return;
        }
      }

      if (event === "SIGNED_OUT") {
        const keepConnected = localStorage.getItem(KEEP_CONNECTED_KEY) === "true";
        
        // Manual logout should always work
        if (manualSignOutRef.current) {
          manualSignOutRef.current = false;
          void updateAuth(null);
          return;
        }

        // If 'keep connected' is on and it wasn't a manual sign out, IGNORE the SIGNED_OUT event.
        // This usually happens when another device logs out or a session expires on one tab but should persist globally.
        if (keepConnected && lastGoodSessionRef.current) {
          console.warn("Auth: Ignored SIGNED_OUT event because 'keep connected' is active.");
          // We don't call updateAuth(null) here, we stay as we are.
          return;
        }
        
        void updateAuth(null);
        return;
      }
      
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        lastGoodSessionRef.current = session;
        // Sempre garantimos que persista se estiver logado
        if (session) {
          const keepConnected = localStorage.getItem(KEEP_CONNECTED_KEY) === "true";
          if (keepConnected) {
            // Backup session storage for aggressive recovery
            localStorage.setItem('nexohub_backup_session', JSON.stringify(session));
          }
        }
      }

      void updateAuth(session);
    });

    // Restore initial session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (!mounted) return;
        
        if (error || !session) {
          // If we have no session but 'keep connected' is ON, we might have a transient network failure
          const keepConnected = localStorage.getItem(KEEP_CONNECTED_KEY) === "true";
          if (keepConnected && lastGoodSessionRef.current) {
             console.log("Auth: No session found on start, but keep-connected is active. Restoring last known good session.");
             void updateAuth(lastGoodSessionRef.current);
             return;
          }

          // Otherwise, try one silent refresh before giving up
          return supabase.auth.refreshSession().then(({ data: refreshed }) => {
            if (!mounted) return;
            if (refreshed.session) {
              void updateAuth(refreshed.session);
            } else {
              prevUserIdRef.current = null;
              setUser(null);
              setSession(null);
              setRole(null);
              finishLoading();
            }
          });
        }
        void updateAuth(session);
      })
      .catch(() => {
        if (mounted) finishLoading();
      });

    return () => {
      mounted = false;
      timers.forEach(clearTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    manualSignOutRef.current = true;
    // Clear keep-connected flag and cached session so the user actually logs out
    localStorage.setItem(KEEP_CONNECTED_KEY, "false");
    localStorage.removeItem('nexohub_backup_session');
    lastGoodSessionRef.current = null;
    prevUserIdRef.current = null;
    try {
      await supabase.auth.signOut();
    } catch { /* ignore */ }
    setUser(null);
    setSession(null);
    setRole(null);
    // Hard redirect to login so any cached state is cleared
    window.location.href = "/";
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
