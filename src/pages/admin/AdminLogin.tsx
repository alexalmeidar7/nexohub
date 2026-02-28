import { useState, useEffect } from "react";
import { ArrowRight, Loader2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";

export default function AdminLogin() {
  const { user, loading, role } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Load remembered email
  useEffect(() => {
    const saved = localStorage.getItem("admin_remember_email");
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (user && role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  const handleSubmit = async () => {
    if (!email.trim() || !pass.trim()) {
      setError("Preencha email e senha.");
      return;
    }
    setSubmitting(true);
    setError("");

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });

    if (authError) {
      setError(authError.message);
      setSubmitting(false);
      return;
    }

    // Check if user has admin role
    const { data: { user: loggedUser } } = await supabase.auth.getUser();
    if (loggedUser) {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", loggedUser.id);

      const isAdmin = roles?.some((r: any) => r.role === "admin");
      if (!isAdmin) {
        await supabase.auth.signOut();
        setError("Acesso negado. Apenas administradores podem acessar.");
        setSubmitting(false);
        return;
      }
    }

    if (remember) {
      localStorage.setItem("admin_remember_email", email);
    } else {
      localStorage.removeItem("admin_remember_email");
    }

    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="bg-login w-full max-w-md rounded-3xl p-10 shadow-2xl animate-fade-in">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Shield size={20} className="text-login-foreground/80" />
          <h1 className="text-center text-login-foreground font-medium tracking-[0.2em] text-xs">
            MASTERVIEW / ADMIN
          </h1>
        </div>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-foreground text-muted-foreground rounded-full px-6 py-4 outline-none placeholder:text-muted-foreground/50"
          />
          <input
            type="password"
            placeholder="senha"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full bg-foreground text-muted-foreground rounded-full px-6 py-4 outline-none placeholder:text-muted-foreground/50"
          />

          {error && <p className="text-red-400 text-xs text-center">{error}</p>}

          <div className="flex justify-between items-center pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded border-login-foreground/30 accent-login-foreground"
              />
              <span className="text-xs text-login-foreground/70">Lembrar login</span>
            </label>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="bg-primary hover:brightness-95 transition-all flex items-center gap-3 px-8 py-3 rounded-full font-medium text-primary-foreground text-sm disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 size={20} className="animate-spin" />
              ) : (
                <>
                  entrar
                  <ArrowRight size={20} />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-20">
        <span className="text-foreground font-bold text-2xl tracking-tighter flex items-center gap-1">
          svn<span className="text-sm">✦</span>broadcast
        </span>
      </div>
    </div>
  );
}
