import { useState, useEffect } from "react";
import { ArrowRight, Loader2, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import logoNexo from "@/assets/logo-nexo.png";

export default function AdminLogin() {
  const { user, loading, role } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [remember, setRemember] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const saved = localStorage.getItem("admin_remember_email");
    if (saved) {
      setEmail(saved);
      setRemember(true);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #004dc0 0%, #0c0440 100%)" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "#268ffa" }} />
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

  const inputStyle = {
    fontSize: "12px",
    color: "#0f1058",
    border: "2px solid #0d379a",
    backgroundColor: "#fff",
  };

  const handleInputMouseEnter = (e: React.MouseEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#268ffa";
  };
  const handleInputMouseLeave = (e: React.MouseEvent<HTMLInputElement>) => {
    if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "#0d379a";
  };
  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#268ffa";
  };
  const handleInputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    e.currentTarget.style.borderColor = "#0d379a";
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #004dc0 0%, #0c0440 100%)" }}
    >
      <div className="w-full max-w-md p-10 shadow-2xl animate-fade-in bg-white" style={{ fontSize: "12px", borderRadius: "2rem" }}>
        <div className="flex items-center justify-center gap-2 mb-8">
          <Shield size={16} style={{ color: "#0f1058" }} />
          <h1 className="text-center font-semibold tracking-wide" style={{ color: "#0f1058", fontSize: "12px" }}>
            MASTERVIEW / ADMIN
          </h1>
        </div>

        <div className="space-y-4">
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-full px-5 py-2.5 outline-none transition-colors"
            style={inputStyle}
            onMouseEnter={handleInputMouseEnter}
            onMouseLeave={handleInputMouseLeave}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          />
          <input
            type="password"
            placeholder="senha"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            className="w-full rounded-full px-5 py-2.5 outline-none transition-colors"
            style={inputStyle}
            onMouseEnter={handleInputMouseEnter}
            onMouseLeave={handleInputMouseLeave}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
          />

          {error && <p className="text-red-500 text-center" style={{ fontSize: "12px" }}>{error}</p>}

          <div className="flex justify-between items-center pt-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="w-4 h-4 rounded"
                style={{ accentColor: "#0f1058" }}
              />
              <span style={{ fontSize: "12px", color: "#0f1058" }}>Lembrar login</span>
            </label>

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="group relative flex items-center gap-3 px-6 py-2 rounded-full font-medium disabled:opacity-50 transition-all duration-300 text-white border-2 border-transparent"
              style={{ fontSize: "12px", backgroundColor: "#0f1058" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor = "#0c0440";
                e.currentTarget.style.color = "#0c0440";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#0f1058";
                e.currentTarget.style.borderColor = "transparent";
                e.currentTarget.style.color = "#ffffff";
              }}
            >
              {submitting ? (
                <Loader2 size={20} className="animate-spin" style={{ color: "#268ffa" }} />
              ) : (
                <>
                  entrar
                  <ArrowRight size={20} className="transition-transform duration-300 group-hover:translate-x-1.5" />
                </>
              )}
            </button>
          </div>
        </div>

        <div className="mt-8">
          <img src={logoNexo} alt="Nexo Soluções Visuais" className="h-10 opacity-80" />
        </div>
      </div>

      <p className="mt-8 text-center text-white/60" style={{ fontSize: "11px" }}>
        Copyrighted 2026 - Todos os direitos reservados a Nexo Soluções Visuais
      </p>
    </div>
  );
}
