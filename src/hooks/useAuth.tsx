import { useState, useEffect, useRef, createContext, useContext, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { ensureMusicScopeForUser } from "@/lib/musicStorageKeys";

type AppRole = "admin" | "user";
const KEEP_CONNECTED_KEY = "nexohub_keep_connected";
const SIGNED_OUT_FLAG = "nexohub_signed_out";
const EXPLICIT_LOGOUT_KEY = "nexohub_explicit_logout";

function hasExplicitSignOut() {
  try {
    return (
      localStorage.getItem(SIGNED_OUT_FLAG) === "true" ||
      sessionStorage.getItem(SIGNED_OUT_FLAG) === "true" ||
      localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "true"
    );
  } catch {
    return false;
  }
}

/** Cancela o bloqueio de logout (novo login realizado). */
export function clearSignOutFlag() {
  try {
    localStorage.removeItem(SIGNED_OUT_FLAG);
    sessionStorage.removeItem(SIGNED_OUT_FLAG);
    localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
  } catch { /* ignore */ }
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("signed_out") === "1") {
      url.searchParams.delete("signed_out");
      window.history.replaceState({}, "", url.toString());
    }
  } catch { /* ignore */ }
}

/** Remove qualquer token de sessão persistido (local e session storage). */
function purgeStoredAuth() {
  const isAuthKey = (k: string) =>
    k === "nexohub_backup_session" ||
    k === "nexohub_force_role" ||
    k === "nexohub_admin_profile" ||
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

const getInitialBackupSession = (): Session | null => null;

const isSimulatedAccessToken = (token?: string | null) => {
  if (!token) return false;
  return token.startsWith("client-token-") || token.startsWith("admin-token-") || token.startsWith("sim-");
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const initialBackup = getInitialBackupSession();
  const [user, setUser] = useState<User | null>(() => initialBackup?.user || null);
  const [session, setSession] = useState<Session | null>(() => initialBackup || null);
  const [loading, setLoading] = useState(() => !initialBackup);
  const [role, setRole] = useState<AppRole | null>(null);
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

    // Player and dashboard have separate auth clients. Do not initialize the
    // dashboard auth listener, restore its session, or run its logout cleanup
    // anywhere in Player routes (including its Google OAuth callback popup).
    const isPlayerRoute = typeof window !== "undefined" && (
      /^\/(?:[^/]+\/)?player(?:\/|$)/.test(window.location.pathname) ||
      window.location.pathname.endsWith("/auth/popup-callback")
    );
    if (isPlayerRoute) {
      lastGoodSessionRef.current = null;
      setUser(null);
      setSession(null);
      setRole(null);
      finishLoading();
      return () => { mounted = false; };
    }

    // Se o usuário saiu explicitamente, não restauramos nada até um novo login.
    let signedOutIntentionally = hasExplicitSignOut();
    if (signedOutIntentionally) {
      manualSignOutRef.current = true;
      try {
        localStorage.setItem(SIGNED_OUT_FLAG, "true");
        sessionStorage.setItem(SIGNED_OUT_FLAG, "true");
        localStorage.setItem(EXPLICIT_LOGOUT_KEY, "true");
      } catch { /* ignore */ }
      purgeStoredAuth();
      void supabase.auth.signOut({ scope: "local" }).catch(() => { /* ignore */ });
      lastGoodSessionRef.current = null;
      setUser(null);
      setSession(null);
      setRole(null);
      finishLoading();
      return;
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
      }
    }, 5000);

    const fetchRole = async (userId: string): Promise<AppRole> => {
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);
        if (error || !data) return "user";
        return data.some((entry: any) => entry.role === "admin") ? "admin" : "user";
      } catch {
        // Falha de consulta nunca concede privilégios administrativos.
        return "user";
      }
    };

    const updateAuth = async (newSession: Session | null) => {
      if (!mounted) return;

      if (newSession && isSimulatedAccessToken(newSession.access_token)) {
        purgeStoredAuth();
        lastGoodSessionRef.current = null;
        setUser(null);
        setSession(null);
        setRole(null);
        finishLoading();
        return;
      }

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

      if (!newUser) {
        prevUserIdRef.current = null;
        setUser(null);
        setSession(null);
        setRole(null);
        finishLoading();
        return;
      }

      const newId = newUser.id;
      if (newId !== prevUserIdRef.current) {
        prevUserIdRef.current = newId;
        ensureMusicScopeForUser(newId);
        setUser(newUser);
      }
      setSession(newSession);

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
      // Um novo login bem-sucedido sempre cancela o bloqueio de logout,
      // independente da tela usada (player, Google, TP, vMix...).
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        clearSignOutFlag();
      }

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
      // Uma sessão de backup só pode ser restaurada após validação por setSession.

      if (event === "SIGNED_OUT") {
        // Manual logout should always work (flag stays set until the reload)
        if (manualSignOutRef.current) {
          void updateAuth(null);
          return;
        }

        if (lastGoodSessionRef.current) {
          // Confere se o login ainda vale de verdade. Se o token de renovação
          // morreu, não fingimos estar conectados (o banco recusaria as gravações).
          void supabase.auth.refreshSession().then(({ data, error }) => {
            if (!mounted) return;
            if (data?.session && !error) { void updateAuth(data.session); return; }
            const refreshError = String(error?.message || "").toLowerCase();
            const isTransientRefreshFailure = /network|fetch|timeout|timed out|temporar|offline|connection|failed to connect|load failed|abort/.test(refreshError);
            if (error && isTransientRefreshFailure) {
              // Falha de rede não deve expulsar o operador do switcher; mantém a última sessão conhecida.
              console.warn("Auth: falha temporária de rede ao renovar sessão; mantendo sessão atual.", error.message);
              return;
            }
            console.warn("Auth: sessão inválida, exigindo novo login.");
            purgeStoredAuth();
            lastGoodSessionRef.current = null;
            manualSignOutRef.current = true;
            void updateAuth(null);
          }).catch(() => { /* rede: mantém estado até voltar */ });
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
                purgeStoredAuth();
                lastGoodSessionRef.current = null;
                void updateAuth(null);
                return;
              }

              console.log("Auth: No session found on start. Restoring last known good session via setSession.");
              supabase.auth.setSession({
                access_token: lastGoodSessionRef.current.access_token,
                refresh_token: lastGoodSessionRef.current.refresh_token,
              }).then(({ data: setRes, error: setErr }) => {
                if (!mounted) return;
                if (setErr || !setRes?.session) {
                  localStorage.removeItem("nexohub_backup_session");
                  lastGoodSessionRef.current = null;
                  void updateAuth(null);
                  return;
                }
                void updateAuth(setRes.session);
              }).catch(() => {
                if (!mounted) return;
                lastGoodSessionRef.current = null;
                void updateAuth(null);
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
      const currentSession = lastGoodSessionRef.current;
      if (!currentSession || isSimulatedAccessToken(currentSession.access_token)) return;
      // Supabase's autoRefreshToken already refreshes near expiry. Our safety
      // refresh must never rotate tokens every minute for every open station.
      const expiresAt = currentSession.expires_at ? currentSession.expires_at * 1000 : 0;
      if (!expiresAt || expiresAt - Date.now() > 5 * 60 * 1000) return;
      try {
        const { data, error } = await supabase.auth.refreshSession();
        lastRefreshAt = Date.now();
        if (error) {
          console.warn(`Auth: proactive refresh (${reason}) failed`, error.message);
          const { data: sess } = await supabase.auth.getSession();
          if (sess.session && mounted) {
            lastGoodSessionRef.current = sess.session;
            setSession(sess.session);
          } else if (mounted && /missing|invalid|already used|expired/i.test(error.message || "")) {
            // Sessão morta: força tela de login em vez de falhar nas gravações.
            purgeStoredAuth();
            lastGoodSessionRef.current = null;
            manualSignOutRef.current = true;
            void updateAuth(null);
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
          const timeToExpiry = session.expires_at * 1000 - Date.now();
          // Refresh only in the final 5 minutes; SDK auto-refresh remains enabled.
          if (timeToExpiry < 5 * 60 * 1000) void proactiveRefresh("expiry_buffer");
        }
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
      localStorage.setItem(EXPLICIT_LOGOUT_KEY, "true");
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
