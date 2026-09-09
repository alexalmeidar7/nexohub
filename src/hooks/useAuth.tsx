import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { ensureMusicScopeForUser } from "@/lib/musicStorageKeys";

type AppRole = "admin" | "user";
const KEEP_CONNECTED_KEY = "nexohub_keep_connected";
const SIGNED_OUT_FLAG = "nexohub_signed_out";

function hasExplicitSignOut() {
  try {
    return new URLSearchParams(window.location.search).get("signed_out") === "1" ||
      localStorage.getItem(SIGNED_OUT_FLAG) === "true" ||
      sessionStorage.getItem(SIGNED_OUT_FLAG) === "true";
  } catch {
    return false;
  }
}

/** Remove qualquer token de sessão persistido (local e session storage). */
function purgeStoredAuth() {
  const isAuthKey = (k: string) =>
    k === "nexohub_backup_session" ||
    (k.startsWith("sb-") && k.includes("auth-token")) ||
    k.startsWith("supabase.auth.");
  try {
    Object.keys(localStorage).filter(isAuthKey).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
  try {
    Object.keys(sessionStorage).filter(isAuthKey).forEach((k) => sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}

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

    // Se o usuário saiu explicitamente, não restauramos nada até um novo login.
    let signedOutIntentionally = hasExplicitSignOut();
    if (signedOutIntentionally) {
      manualSignOutRef.current = true;
      try {
        localStorage.setItem(SIGNED_OUT_FLAG, "true");
        sessionStorage.setItem(SIGNED_OUT_FLAG, "true");
      } catch { /* ignore */ }
      purgeStoredAuth();
      void supabase.auth.signOut({ scope: "local" }).catch(() => { /* ignore */ });
    }

    // Always try to restore the last known good session from backup on boot,
    // so a hard refresh keeps the user signed in and on the welcome screen
    // without requiring an explicit "keep connected" opt-in.
    if (!signedOutIntentionally && !lastGoodSessionRef.current) {
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
        // If we timed out, check if we have a backup session to fallback on
        if (!user && lastGoodSessionRef.current) {
           updateAuth(lastGoodSessionRef.current);
        }
      }
    }, 5000);

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

        if (lastGoodSessionRef.current?.user && lastGoodSessionRef.current.access_token) {
          const restored = lastGoodSessionRef.current;
          if (prevUserIdRef.current !== restored.user.id) {
            prevUserIdRef.current = restored.user.id;
            ensureMusicScopeForUser(restored.user.id);
            setUser(restored.user);
          }
          setSession(restored);
          finishLoading();

          // Inform supabase.auth client of the restored tokens so all DB queries attach Authorization header
          supabase.auth.setSession({
            access_token: restored.access_token,
            refresh_token: restored.refresh_token,
          }).then(({ data: refreshed, error: setErr }) => {
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
            } else if (refreshed.session && mounted) {
              lastGoodSessionRef.current = refreshed.session;
              setSession(refreshed.session);
              setUser(refreshed.session.user);
              try {
                localStorage.setItem('nexohub_backup_session', JSON.stringify(refreshed.session));
              } catch {}
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

      // Depois de um logout explícito, ignoramos sessões residuais
      // (broker do preview, outra aba, cache) até um novo login de fato.
      signedOutIntentionally = hasExplicitSignOut();
      if (signedOutIntentionally) {
        if (session) purgeStoredAuth();
        lastGoodSessionRef.current = null;
        void updateAuth(null);
        return;
      }
      if (event === "SIGNED_IN" && session) {
        manualSignOutRef.current = false;
      }

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
        // Manual logout should always work (flag stays set until the reload)
        if (manualSignOutRef.current) {
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
          if (lastGoodSessionRef.current?.access_token) {
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
    // Marca o logout como intencional e apaga tudo que possa restaurar a sessão
    try {
      localStorage.setItem(KEEP_CONNECTED_KEY, "false");
      localStorage.setItem(SIGNED_OUT_FLAG, "true");
      sessionStorage.setItem(SIGNED_OUT_FLAG, "true");
    } catch { /* ignore */ }
    purgeStoredAuth();
    lastGoodSessionRef.current = null;
    prevUserIdRef.current = null;
    try {
      // scope: 'local' evita revogar a sessão em outros dispositivos/abas
      await supabase.auth.signOut({ scope: 'local' });
    } catch { /* ignore */ }
    // A chamada acima pode falhar por rede; garantimos a limpeza de novo
    purgeStoredAuth();
    setUser(null);
    setSession(null);
    setRole(null);
    if (shouldRedirect) {
      // Hard redirect to login so any cached state is cleared
      window.location.replace("/?signed_out=1");
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
