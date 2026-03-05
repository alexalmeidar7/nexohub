import { useState } from "react";
import { ArrowRight, Loader2, CheckCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoNexo from "@/assets/logo-nexo.png";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const handleForgot = async () => {
    if (!forgotEmail.trim()) {
      setForgotError("Preencha o email.");
      return;
    }
    setForgotLoading(true);
    setForgotError("");
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setForgotError(error.message);
    else setForgotSent(true);
    setForgotLoading(false);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !pass.trim()) {
      setError("Preencha email e senha.");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) setError(error.message);
    setLoading(false);
  };

  const closeForgot = () => {
    setShowForgot(false);
    setForgotSent(false);
    setForgotError("");
    setForgotEmail("");
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #004dc0 0%, #0c0440 100%)" }}
    >
      <div className="relative w-full max-w-md">
        {/* Main Login Box */}
        <div className="relative z-10 w-full rounded-3xl p-10 shadow-2xl animate-fade-in bg-white" style={{ fontSize: "12px" }}>
          <h1 className="text-center font-semibold tracking-wide mb-8" style={{ color: "#0f1058", fontSize: "12px" }}>
            NexoHub login
          </h1>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-full px-6 py-4 outline-none transition-colors"
              style={{ fontSize: "12px", color: "#0f1058", border: "2px solid #0d379a", backgroundColor: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
              onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "#0d379a"; }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#0d379a")}
            />
            <input
              type="password"
              placeholder="senha"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              className="w-full rounded-full px-6 py-4 outline-none text-sm transition-colors"
              style={{ color: "#0f1058", border: "2px solid #0d379a", backgroundColor: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
              onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "#0d379a"; }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#0d379a")}
            />

            {error && <p className="text-red-500 text-xs text-center">{error}</p>}

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => { setShowForgot(!showForgot); setError(""); }}
                className="text-xs transition-colors duration-200"
                style={{ color: "#0f1058" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#268ffa")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#0f1058")}
              >
                Esqueci a senha
              </button>

              {/* Botão Entrar com hover outline + seta animada */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="group relative flex items-center gap-3 px-8 py-3 rounded-full font-medium text-sm disabled:opacity-50 transition-all duration-300 text-white border-2 border-transparent hover:bg-transparent"
                style={{ backgroundColor: "#0f1058" }}
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
                {loading ? (
                  <Loader2 size={20} className="animate-spin" />
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
            <img src={logoNexo} alt="Nexo Soluções Visuais" className="h-8 opacity-80" />
          </div>
        </div>

        {/* Forgot Password Box - slides down from behind login box */}
        <div
          className="absolute left-0 right-0 z-0 overflow-hidden transition-all duration-500 ease-in-out"
          style={{
            top: showForgot ? "calc(100% - 24px)" : "50%",
            opacity: showForgot ? 1 : 0,
            pointerEvents: showForgot ? "auto" : "none",
          }}
        >
          <div className="rounded-b-3xl rounded-t-none px-10 pt-10 pb-8 shadow-xl" style={{ backgroundColor: "#0d0446" }}>
            {forgotSent ? (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle className="text-green-400" size={40} />
                <p className="text-center text-white" style={{ fontSize: "14px" }}>
                  Link enviado para <strong>{forgotEmail}</strong>
                </p>
                <button
                  onClick={closeForgot}
                  className="mt-2 font-medium transition-colors duration-200 text-white"
                  style={{ fontSize: "14px" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#268ffa")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#ffffff")}
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-center text-white" style={{ fontSize: "14px" }}>
                  Informe seu email para redefinir a senha
                </p>
                <input
                  type="email"
                  placeholder="seu email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleForgot()}
                  className="w-full rounded-full px-6 py-4 outline-none transition-colors"
                  style={{ fontSize: "14px", color: "#0f1058", border: "2px solid rgba(255,255,255,0.3)", backgroundColor: "#fff" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
                  onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "#0d379a"; }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "#0d379a")}
                />
                {forgotError && <p className="text-red-400 text-center" style={{ fontSize: "14px" }}>{forgotError}</p>}
                <div className="flex justify-between items-center">
                  <button
                    onClick={closeForgot}
                    className="flex items-center gap-1 transition-colors duration-200 text-white"
                    style={{ fontSize: "14px" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#268ffa")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#ffffff")}
                  >
                    <X size={14} /> Fechar
                  </button>
                  <button
                    onClick={handleForgot}
                    disabled={forgotLoading}
                    className="group flex items-center gap-3 px-8 py-3 rounded-full font-medium disabled:opacity-50 transition-all duration-300 text-white border-2 border-transparent"
                    style={{ fontSize: "14px", backgroundColor: "#0f1058" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)";
                      e.currentTarget.style.color = "#ffffff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#0f1058";
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.color = "#ffffff";
                    }}
                  >
                    {forgotLoading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        enviar
                        <ArrowRight size={20} className="transition-transform duration-300 group-hover:translate-x-1.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
