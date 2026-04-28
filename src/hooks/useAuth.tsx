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
      const newId = newUser?.id ?? null;

      if (newId !== prevUserIdRef.current) {
        prevUserIdRef.current = newId;
        // CRITICAL: scope music localStorage by user to prevent cross-tenant leaks
        ensureMusicScopeForUser(newId);
        setUser(newUser);
      }
      setSession(newSession);

      if (!newUser) {
        if (localStorage.getItem(KEEP_CONNECTED_KEY) !== "false" && lastGoodSessionRef.current?.user) {
          if (prevUserIdRef.current !== lastGoodSessionRef.current.user.id) {
            prevUserIdRef.current = lastGoodSessionRef.current.user.id;
            ensureMusicScopeForUser(lastGoodSessionRef.current.user.id);
          }
          setUser(lastGoodSessionRef.current.user);
          setSession(lastGoodSessionRef.current);
          finishLoading();
          return;
        }
        setRole(null);
        if (mounted) finishLoading();
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
      if (event === "SIGNED_OUT") {
        if (manualSignOutRef.current) {
          manualSignOutRef.current = false;
          void updateAuth(null);
          return;
        }

        // Try to recover silently before logging out
        supabase.auth.getSession().then(async ({ data }) => {
          if (data.session) {
            void updateAuth(data.session);
            return;
          }
          try {
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed.session) {
              void updateAuth(refreshed.session);
              return;
            }
          } catch { /* keep current state */ }
          if (localStorage.getItem(KEEP_CONNECTED_KEY) !== "false" && lastGoodSessionRef.current) {
            void updateAuth(lastGoodSessionRef.current);
            return;
          }
          if (mounted) finishLoading();
        });
        return;
      }
      void updateAuth(session);
    });

    // Restore initial session
    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (error && !session) {
          return supabase.auth.refreshSession().then(({ data: refreshed }) => {
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
