import { useState, useEffect, useRef, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

type AppRole = "admin" | "user";

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

  useEffect(() => {
    let mounted = true;

    // Gradual retry strategy instead of a single hard timeout
    let retryCount = 0;
    const MAX_AUTH_RETRIES = 3;
    const scheduleRetry = () => {
      retryCount++;
      const delay = Math.min(5000 * Math.pow(1.5, retryCount - 1), 15000);
      return setTimeout(async () => {
        if (!mounted || !loading) return;
        try {
          const { data } = await supabase.auth.getSession();
          if (data.session) {
            void updateAuth(data.session);
            return;
          }
          const { data: refreshed } = await supabase.auth.refreshSession();
          if (refreshed.session) {
            void updateAuth(refreshed.session);
            return;
          }
        } catch { /* silent */ }
        if (retryCount < MAX_AUTH_RETRIES) {
          retryTimer = scheduleRetry();
        } else {
          console.warn("Auth loading: max retries reached, forcing load complete");
          if (mounted) setLoading(false);
        }
      }, delay);
    };
    let retryTimer = setTimeout(() => {
      if (mounted && loading) {
        retryTimer = scheduleRetry();
      }
    }, 8000);

    const updateAuth = async (newSession: Session | null) => {
      if (!mounted) return;

      const newUser = newSession?.user ?? null;
      const newId = newUser?.id ?? null;

      // Only update user state if the user ID actually changed
      if (newId !== prevUserIdRef.current) {
        prevUserIdRef.current = newId;
        setUser(newUser);
      }
      setSession(newSession);

      if (!newUser) {
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", newUser.id);

        if (!mounted) return;

        if (!error && data && data.length > 0) {
          const isAdmin = data.some((r: any) => r.role === "admin");
          setRole(isAdmin ? "admin" : "user");
        } else {
          setRole("user");
        }
      } catch {
        if (mounted) setRole("user");
      }
      if (mounted) setLoading(false);
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

        // Never auto-logout on idle/session hiccups: try to recover silently
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
          } catch {
            // keep current in-memory auth state
          }

          if (mounted) setLoading(false);
        });
        return;
      }
      void updateAuth(session);
    });

    // Then restore initial session from storage
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error && !session) {
        // Try to recover by refreshing the session
        supabase.auth.refreshSession().then(({ data: refreshed }) => {
          if (refreshed.session) {
            void updateAuth(refreshed.session);
          } else {
            prevUserIdRef.current = null;
            setUser(null);
            setSession(null);
            setRole(null);
            setLoading(false);
          }
        });
        return;
      }

      void updateAuth(session);
    }).catch(() => {
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      if (retryTimer) clearTimeout(retryTimer);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    manualSignOutRef.current = true;
    await supabase.auth.signOut();
    setRole(null);
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
