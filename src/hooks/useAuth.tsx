import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { ensureMusicScopeForUser } from "@/lib/musicStorageKeys";

type AppRole = "admin" | "user";
const KEEP_CONNECTED_KEY = "nexohub_keep_connected";
const EXPLICIT_LOGOUT_KEY = "nexohub_explicit_logout";

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

const isLocalhostEnvironment = () => {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.startsWith("192.168.") || host.startsWith("10.");
};

const getInitialBackupSession = (): Session | null => {
  try {
    if (typeof window === "undefined") return null;
    if (localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true") return null;
    const raw = localStorage.getItem('nexohub_backup_session');
    if (!raw) return null;
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
};

const isSimulatedAccessToken = (token?: string | null) => {
  if (!token) return false;
  return token.startsWith("client-token-") || token.startsWith("admin-token-") || token.startsWith("sim-");
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialBackup = getInitialBackupSession();
  const [user, setUser] = useState<User | null>(() => initialBackup?.user || null);
  const [session, setSession] = useState<Session | null>(() => initialBackup || null);
  const [loading, setLoading] = useState(() => !initialBackup);
  const [role, setRole] = useState<AppRole | null>(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true") return null;
      const forceRole = localStorage.getItem("nexohub_force_role");
      if (forceRole === "admin") return "admin";
      if (forceRole === "user") return "user";
      const metaRole = initialBackup?.user?.user_metadata?.role as AppRole;
      if (metaRole === "admin" || metaRole === "user") return metaRole;
    } catch {}
    if (isLocalhostEnvironment() && !(typeof window !== "undefined" && localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true")) return "admin";
    return null;
  });
  const prevUserIdRef = useRef<string | null>(initialBackup?.user?.id || null);
  const manualSignOutRef = useRef(false);
  const loadingRef = useRef(!initialBackup);
  const lastGoodSessionRef = useRef<Session | null>(initialBackup);

  const finishLoading = useCallback(() => {
    loadingRef.current = false;
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    // Check if user has explicitly logged out
    const isExplicitlyLoggedOut = typeof window !== "undefined" && localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true";
    if (isExplicitlyLoggedOut) {
      lastGoodSessionRef.current = null;
      try {
        localStorage.removeItem('nexohub_backup_session');
        localStorage.removeItem('nexohub_force_role');
      } catch {}
      setUser(null);
      setSession(null);
      setRole(null);
      finishLoading();
      return;
    }

    // Restore the last known good session from backup on boot if not already loaded
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

    // Safety net: if loading is still true after 5s, force it off
    addTimer(() => {
      if (mounted && loadingRef.current) {
        console.warn("Auth: safety timeout reached (5s), forcing load complete");
        finishLoading();
        if (!user && lastGoodSessionRef.current) {
          updateAuth(lastGoodSessionRef.current);
        }
      }
    }, 5000);

    const fetchRole = async (userId: string, email?: string): Promise<AppRole> => {
      if (typeof window !== "undefined" && localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true") {
        return "user";
      }
      try {
        const forceRole = localStorage.getItem("nexohub_force_role");
        if (forceRole === "admin") return "admin";
        if (forceRole === "user") return "user";
      } catch {}

      if (email && (email.toLowerCase() === "alex@nexobrasil.net" || email.toLowerCase().includes("alex"))) {
        return "admin";
      }

      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        if (!error && data && data.length > 0) {
          return data.some((r: any) => r.role === "admin") ? "admin" : "user";
        }
      } catch { /* silent */ }

      if (isLocalhostEnvironment()) {
        return "admin";
      }
      return "user";
    };

    const updateAuth = async (newSession: Session | null) => {
      if (!mounted) return;

      if (typeof window !== "undefined" && localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true") {
        lastGoodSessionRef.current = null;
        prevUserIdRef.current = null;
        setUser(null);
        setSession(null);
        setRole(null);
        finishLoading();
        return;
      }

      if (newSession) {
        lastGoodSessionRef.current = newSession;
      }

      const newUser = newSession?.user ?? null;

      if (!newUser && !manualSignOutRef.current) {
        if (lastGoodSessionRef.current?.user && lastGoodSessionRef.current.access_token) {
          const restored = lastGoodSessionRef.current;
          if (prevUserIdRef.current !== restored.user.id) {
            prevUserIdRef.current = restored.user.id;
            ensureMusicScopeForUser(restored.user.id);
            setUser(restored.user);
          }
          setSession(restored);

          const isSim = isSimulatedAccessToken(restored.access_token);

          // Determine role
          const roleFromMeta = (restored.user.user_metadata?.role as AppRole) || null;
          const roleResult = roleFromMeta || (await fetchRole(restored.user.id, restored.user.email));
          if (mounted) setRole(roleResult);
          finishLoading();

          // Only attempt supabase.auth.setSession for real Supabase JWT tokens
          if (!isSim) {
            supabase.auth.setSession({
              access_token: restored.access_token,
              refresh_token: restored.refresh_token,
            }).then(({ data: setRes, error: setErr }) => {
              if (setErr) {
                console.warn("Auth: setSession failed with restored tokens", setErr.message);
                if (setErr.message?.toLowerCase().includes("invalid") || setErr.message?.toLowerCase().includes("expired")) {
                  localStorage.removeItem('nexohub_backup_session');
                  lastGoodSessionRef.current = null;
                  if (mounted) {
                    setUser(null);
                    setSession(null);
                    setRole(null);
                  }
                }
              } else if (setRes.session && mounted) {
                lastGoodSessionRef.current = setRes.session;
                setSession(setRes.session);
                setUser(setRes.session.user);
                try {
                  localStorage.setItem('nexohub_backup_session', JSON.stringify(setRes.session));
                } catch {}
              }
            }).catch(() => { /* keep current state */ });
          }
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
      const roleFromMeta = (newUser.user_metadata?.role as AppRole) || null;
      const roleResult = roleFromMeta || await Promise.race([
        fetchRole(newUser.id, newUser.email),
        new Promise<AppRole>((resolve) => addTimer(() => resolve(isLocalhostEnvironment() ? "admin" : "user"), 5000)),
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

      if (event === "SIGNED_IN") {
        try {
          localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
        } catch {}
      }

      if (typeof window !== "undefined" && localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true" && event !== "SIGNED_IN") {
        void updateAuth(null);
        return;
      }

      // If INITIAL_SESSION arrives empty but we have a backup, restore it
      if (event === "INITIAL_SESSION" && !session) {
        if (lastGoodSessionRef.current) {
          console.log("Auth: Restoring session from backup on INITIAL_SESSION.");
          void updateAuth(lastGoodSessionRef.current);
          return;
        }
      }

      if (event === "SIGNED_OUT") {
        if (manualSignOutRef.current) {
          manualSignOutRef.current = false;
          void updateAuth(null);
          return;
        }

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
          try {
            localStorage.setItem(KEEP_CONNECTED_KEY, "true");
            localStorage.setItem('nexohub_backup_session', JSON.stringify(session));
          } catch { /* storage may be full or blocked */ }
        }
      }

      void updateAuth(session);
    });

    // Restore initial session
    if (typeof window !== "undefined" && localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true") {
      setUser(null);
      setSession(null);
      setRole(null);
      finishLoading();
    } else {
      supabase.auth
        .getSession()
        .then(({ data: { session }, error }) => {
          if (!mounted) return;
          
          if (error || !session) {
            // If we have a backed-up session, restore it
            if (lastGoodSessionRef.current?.access_token) {
              const isSim = isSimulatedAccessToken(lastGoodSessionRef.current.access_token);
              if (isSim) {
                console.log("Auth: Restored simulated client/admin session on start.");
                void updateAuth(lastGoodSessionRef.current);
                return;
              }

              console.log("Auth: No session found on start. Restoring last known good session via setSession.");
              supabase.auth.setSession({
                access_token: lastGoodSessionRef.current.access_token,
                refresh_token: lastGoodSessionRef.current.refresh_token,
              }).then(({ data: setRes, error: setErr }) => {
                if (!mounted) return;
                if (setErr) {
                  console.warn("Auth: initial setSession failed", setErr.message);
                  if (setErr.message?.toLowerCase().includes("invalid") || setErr.message?.toLowerCase().includes("expired")) {
                    localStorage.removeItem('nexohub_backup_session');
                    lastGoodSessionRef.current = null;
                    void updateAuth(null);
                    return;
                  }
                }
                void updateAuth(setRes?.session || lastGoodSessionRef.current);
              }).catch(() => {
                if (mounted) void updateAuth(lastGoodSessionRef.current);
              });
              return;
            }

            if (user && lastGoodSessionRef.current) {
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
            }).catch(() => {
              if (mounted) finishLoading();
            });
          }
          void updateAuth(session);
        })
        .catch(() => {
          if (mounted) finishLoading();
        });
    }

    let lastRefreshAt = Date.now();
    const proactiveRefresh = async (reason: string) => {
      if (!mounted || manualSignOutRef.current) return;
      if (isSimulatedAccessToken(lastGoodSessionRef.current?.access_token)) {
        return; // Simulated sessions don't need Supabase JWT refresh
      }
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
      // If idle for more than 1 min, refresh now to ensure tokens are valid
      if (idleMs > 1 * 60 * 1000) void proactiveRefresh("visibility");
    };
    const onOnline = () => { 
      reconnectRealtime(); 
      void proactiveRefresh("online"); 
    };
    
    // Check session health every minute instead of 20min
    const refreshInterval = setInterval(() => {
      if (!document.hidden) {
        const session = lastGoodSessionRef.current;
        if (session?.expires_at) {
          const expiresAt = session.expires_at * 1000;
          const timeToExpiry = expiresAt - Date.now();
          // If less than 10 mins remaining, refresh proactively
          if (timeToExpiry < 10 * 60 * 1000) {
            void proactiveRefresh("expiry_buffer");
            return;
          }
        }
        void proactiveRefresh("health_check");
      }
    }, 60 * 1000);

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
    
    // 1. Mark explicit sign out and clear cached auth items
    try {
      localStorage.setItem(EXPLICIT_LOGOUT_KEY, "true");
      localStorage.setItem(KEEP_CONNECTED_KEY, "false");
      localStorage.removeItem('nexohub_backup_session');
      localStorage.removeItem('nexohub_force_role');
      localStorage.removeItem('nexohub_admin_profile');

      // Clear all Supabase storage tokens from localStorage and sessionStorage
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('supabase.auth'))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));

      for (let i = 0; i < sessionStorage.length; i++) {
        const k = sessionStorage.key(i);
        if (k && (k.startsWith('sb-') || k.includes('supabase.auth'))) {
          sessionStorage.removeItem(k);
        }
      }
    } catch {}

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
      // Direct redirect to House Mix login screen
      window.location.replace("/");
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
