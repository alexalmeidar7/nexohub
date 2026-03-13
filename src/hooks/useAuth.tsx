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

    const updateAuth = async (newSession: Session | null) => {
      if (!mounted) return;

      const newUser = newSession?.user ?? null;
      const newId = newUser?.id ?? null;

      // Only update user state if the user ID actually changed
      // This prevents re-renders from token refreshes when switching tabs
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
      setLoading(false);
    };

    // Set up auth state listener FIRST (non-async callback to avoid deadlocks)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void updateAuth(session);
    });

    // Then restore initial session from storage (deterministic bootstrap)
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      if (error && !session) {
        prevUserIdRef.current = null;
        setUser(null);
        setSession(null);
        setRole(null);
        setLoading(false);
        return;
      }

      void updateAuth(session);
    });

    return () => {
      mounted = false;
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
