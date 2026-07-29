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
  signOut: (options?: { redirect?: boolean }) => Promise<void>;
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

    // Always try to restore the last known good session from backup on boot,
    // so a hard refresh keeps the user signed in and on the welcome screen
    // without requiring an explicit "keep connected" opt-in.
    if (!lastGoodSessionRef.current) {
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

      // If INITIAL_SESSION arrives empty but we have a backup, restore it so a
      // hard refresh keeps the user on the welcome screen.
      if (event === "INITIAL_SESSION" && !session) {
        if (lastGoodSessionRef.current) {
          console.log("Auth: Restoring session from backup on INITIAL_SESSION.");
          void updateAuth(lastGoodSessionRef.current);
          return;
        }
      }

      if (event === "SIGNED_OUT") {
        // Manual logout should always work
        if (manualSignOutRef.current) {
          manualSignOutRef.current = false;
          void updateAuth(null);
          return;
        }

        // Ignore involuntary SIGNED_OUT events (e.g. sign-out on another device
        // or transient auth hiccups) when we still have a backed-up session.
        if (lastGoodSessionRef.current) {
          console.warn("Auth: Ignored involuntary SIGNED_OUT event; keeping user logged in.");
          return;
        }

        void updateAuth(null);
        return;
      }

      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
        lastGoodSessionRef.current = session;
        if (session) {
          // Always back up the session so refreshes restore the same login.
          try {
            localStorage.setItem(KEEP_CONNECTED_KEY, "true");
            localStorage.setItem('nexohub_backup_session', JSON.stringify(session));
          } catch { /* storage may be full or blocked */ }
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
          // If we have a backed-up session, restore it (covers transient network failures)
          if (lastGoodSessionRef.current) {
             console.log("Auth: No session found on start. Restoring last known good session.");
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

    // Proactive session recovery to prevent "reconnect loops" after long idle:
    // - Refresh token on tab focus / online after being idle for >2min
    // - Periodic refresh every 20 min to keep token warm during long idle
    let lastRefreshAt = Date.now();
    const proactiveRefresh = async (reason: string) => {
      if (!mounted || manualSignOutRef.current) return;
      try {
        const { data, error } = await supabase.auth.refreshSession();
        lastRefreshAt = Date.now();
        if (error) {
          console.warn(`Auth: proactive refresh (${reason}) failed`, error.message);
          const { data: sess } = await supabase.auth.getSession();
          if (sess.session && mounted) {
            lastGoodSessionRef.current = sess.session;
            setSession(sess.session);
          }
          return;
        }
        if (data.session && mounted) {
          lastGoodSessionRef.current = data.session;
          setSession(data.session);
          try { localStorage.setItem('nexohub_backup_session', JSON.stringify(data.session)); } catch { /* ignore */ }
        }
      } catch (e) {
        console.warn(`Auth: proactive refresh (${reason}) threw`, e);
      }
    };

    // Force realtime socket reconnect if it went stale during idle.
    const reconnectRealtime = () => {
      try {
        const rt: any = (supabase as any).realtime;
        if (!rt) return;
        const isOpen = typeof rt.isConnected === "function" ? rt.isConnected() : true;
        if (!isOpen) {
          try { rt.connect?.(); } catch { /* ignore */ }
        }
      } catch { /* ignore */ }
    };


    const onVisibility = () => {
      if (document.hidden) return;
      reconnectRealtime();
      const idleMs = Date.now() - lastRefreshAt;
      if (idleMs > 2 * 60 * 1000) void proactiveRefresh("visibility");
    };
    const onOnline = () => { reconnectRealtime(); void proactiveRefresh("online"); };
    const refreshInterval = setInterval(() => {
      if (!document.hidden) void proactiveRefresh("interval");
    }, 20 * 60 * 1000);

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onVisibility);

    return () => {
      mounted = false;
      timers.forEach(clearTimeout);
      subscription.unsubscribe();
      clearInterval(refreshInterval);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onVisibility);
    };
  }, []);

  const signOut = async (options?: { redirect?: boolean }) => {
    const shouldRedirect = options?.redirect !== false;
    manualSignOutRef.current = true;
    // Clear keep-connected flag and cached session so the user actually logs out
    localStorage.setItem(KEEP_CONNECTED_KEY, "false");
    localStorage.removeItem('nexohub_backup_session');
    lastGoodSessionRef.current = null;
    prevUserIdRef.current = null;
    try {
      // scope: 'local' evita revogar a sessão em outros dispositivos/abas
      await supabase.auth.signOut({ scope: 'local' });
    } catch { /* ignore */ }
    setUser(null);
    setSession(null);
    setRole(null);
    if (shouldRedirect) {
      // Hard redirect to login so any cached state is cleared
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
