import { useState } from "react";
import { ArrowRight, Loader2, CheckCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoNexo from "@/assets/logo-nexo.png";

const AUTH_TIMEOUT_FAST_MS = 12000;
const AUTH_TIMEOUT_RETRY_MS = 25000;

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const getErrorMessage = (value: unknown) => {
  if (typeof value === "string") return value;
  if (value instanceof Error) return value.message;
  if (value && typeof value === "object" && "message" in value) {
    return String((value as { message?: unknown }).message ?? "");
  }
  return "";
};

const isConnectionLikeError = (value: unknown) => {
  const message = getErrorMessage(value).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("tempo de conexão excedido") ||
    message.includes("connection") ||
    message.includes("networkerror") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("network") ||
    message.includes("load failed") ||
    message.includes("não foi possível conectar")
  );
};

const getFriendlyAuthMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) {
    return "E-mail ou senha inválidos.";
  }
  if (normalized.includes("email not confirmed")) {
    return "Seu e-mail ainda não foi confirmado.";
  }
  return message;
};

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

    const request = () =>
      supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });

    try {
      const { error } = await withTimeout(request(), AUTH_TIMEOUT_FAST_MS, "Tempo de conexão excedido.");
      if (error) setForgotError(error.message);
      else setForgotSent(true);
    } catch (firstError) {
      if (!isConnectionLikeError(firstError)) {
        setForgotError("Não foi possível enviar o link. Tente novamente.");
      } else {
        try {
          const { error } = await withTimeout(request(), AUTH_TIMEOUT_RETRY_MS, "Tempo de conexão excedido.");
          if (error) setForgotError(error.message);
          else setForgotSent(true);
        } catch {
          setForgotError("Servidor ainda iniciando. Aguarde alguns segundos e tente novamente.");
        }
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!email.trim() || !pass.trim()) {
      setError("Preencha email e senha.");
      return;
    }

    setLoading(true);
    setError("");

    const request = () => supabase.auth.signInWithPassword({ email: email.trim(), password: pass });

    try {
      const { error } = await withTimeout(request(), AUTH_TIMEOUT_FAST_MS, "Tempo de conexão excedido.");

      if (error) {
        setError(getFriendlyAuthMessage(error.message));
      }
    } catch (firstError) {
      if (!isConnectionLikeError(firstError)) {
        const rawMessage = getErrorMessage(firstError);
        setError(rawMessage ? getFriendlyAuthMessage(rawMessage) : "Não foi possível autenticar. Tente novamente.");
      } else {
        try {
          const { error } = await withTimeout(request(), AUTH_TIMEOUT_RETRY_MS, "Tempo de conexão excedido.");
          if (error) {
            setError(getFriendlyAuthMessage(error.message));
          }
        } catch {
          setError("Servidor ainda iniciando. Aguarde alguns segundos e tente novamente.");
        }
      }
    } finally {
      setLoading(false);
    }
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
      style={{ backgroundColor: "#0f1058" }}
    >
      <div className="relative w-full max-w-md">
        {/* Main Login Box */}
        <div className="relative z-10 w-full p-10 shadow-2xl animate-fade-in bg-white" style={{ fontSize: "12px", borderRadius: "2rem" }}>
          <h1 className="text-center font-semibold tracking-wide mb-8" style={{ color: "#0f1058", fontSize: "12px" }}>
            NexoHub login
          </h1>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-full px-5 py-2.5 outline-none transition-colors"
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
              className="w-full rounded-full px-5 py-2.5 outline-none transition-colors"
              style={{ fontSize: "12px", color: "#0f1058", border: "2px solid #0d379a", backgroundColor: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
              onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "#0d379a"; }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#0d379a")}
            />

            {error && <p className="text-center font-medium" style={{ fontSize: "12px", color: "#0f1058" }}>{error}</p>}

            <div className="flex justify-between items-center pt-2">
              <button
                onClick={() => { setShowForgot(!showForgot); setError(""); }}
                className="transition-colors duration-200"
                style={{ fontSize: "12px", color: "#0f1058" }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#268ffa")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#0f1058")}
              >
                Esqueci a senha
              </button>

              {/* Botão Entrar com hover outline + seta animada */}
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="group relative flex items-center gap-3 px-6 py-2 rounded-full font-medium disabled:opacity-50 transition-all duration-300 text-white border-2 border-transparent hover:bg-transparent"
                style={{ fontSize: "12px", backgroundColor: "#268ffa" }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.borderColor = "#268ffa";
                  e.currentTarget.style.color = "#0f1058";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "#268ffa";
                  e.currentTarget.style.borderColor = "transparent";
                  e.currentTarget.style.color = "#ffffff";
                }}
              >
                {loading ? (
                  <Loader2 size={20} className="animate-spin" style={{ color: "#ffffff" }} />
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
            <img src={logoNexo} alt="Nexo Soluções Visuais" className="h-10 opacity-80 animate-fade-in" />
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
          <div className="px-10 pt-10 pb-8 shadow-xl" style={{ backgroundColor: "#0d0446", fontSize: "12px", borderRadius: "0 0 2rem 2rem" }}>
            {forgotSent ? (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle className="text-green-400" size={40} />
                <p className="text-center text-white" style={{ fontSize: "12px" }}>
                  Link enviado para <strong>{forgotEmail}</strong>
                </p>
                <button
                  onClick={closeForgot}
                  className="mt-2 font-medium transition-colors duration-200 text-white"
                  style={{ fontSize: "12px" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "#268ffa")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = "#ffffff")}
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-center text-white" style={{ fontSize: "12px" }}>
                  Informe seu email para redefinir a senha
                </p>
                <input
                  type="email"
                  placeholder="seu email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleForgot()}
                  className="w-full rounded-full px-5 py-2.5 outline-none transition-colors"
                  style={{ fontSize: "12px", color: "#0f1058", border: "2px solid rgba(255,255,255,0.3)", backgroundColor: "#fff" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
                  onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)"; }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.3)")}
                />
                {forgotError && <p className="text-red-400 text-center" style={{ fontSize: "12px" }}>{forgotError}</p>}
                <div className="flex justify-between items-center">
                  <button
                    onClick={closeForgot}
                    className="flex items-center gap-1 transition-colors duration-200 text-white"
                    style={{ fontSize: "12px" }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = "#268ffa")}
                    onMouseLeave={(e) => (e.currentTarget.style.color = "#ffffff")}
                  >
                    <X size={14} /> Fechar
                  </button>
                  <button
                    onClick={handleForgot}
                    disabled={forgotLoading}
                    className="group flex items-center gap-3 px-6 py-2 rounded-full font-medium disabled:opacity-50 transition-all duration-300 text-white border-2 border-transparent"
                    style={{ fontSize: "12px", backgroundColor: "#268ffa" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
                      e.currentTarget.style.borderColor = "#268ffa";
                      e.currentTarget.style.color = "#ffffff";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "#268ffa";
                      e.currentTarget.style.borderColor = "transparent";
                      e.currentTarget.style.color = "#ffffff";
                    }}
                  >
                    {forgotLoading ? (
                      <Loader2 size={20} className="animate-spin" style={{ color: "#ffffff" }} />
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

      <p className="text-center mt-8 text-white/50" style={{ fontSize: "11px" }}>
        © {new Date().getFullYear()} Nexo Soluções Visuais
      </p>
    </div>
  );
}
