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

  useEffect(() => {
    let mounted = true;

    // Safety timeout: if loading takes more than 12s, stop loading
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn("Auth loading timeout - forcing load complete");
        setLoading(false);
      }
    }, 12000);

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
      // Ignore TOKEN_REFRESHED failures that would sign the user out
      if (event === "SIGNED_OUT") {
        // Only sign out if the user explicitly signed out (not token expiry)
        // Check if we still have a session in storage
        supabase.auth.getSession().then(({ data }) => {
          if (!data.session) {
            void updateAuth(null);
          }
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
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
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
