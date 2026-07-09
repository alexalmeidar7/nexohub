import { useState } from "react";
import { ArrowRight, Loader2, CheckCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoNexoAsset from "@/assets/logo-nexo-azul.png.asset.json";
import { HouseMixIcon } from "@/components/ProductIcons";
const logoNexo = logoNexoAsset.url;

const AUTH_TIMEOUT_MS = 12000;
const MAX_RETRIES = 3;
const KEEP_CONNECTED_KEY = "nexohub_keep_connected";
const REMEMBERED_USER_KEY = "nexohub_remembered_user";

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

/** Exponential backoff with jitter */
const backoffDelay = (attempt: number) =>
  Math.min(2000 * Math.pow(2, attempt), 20000) + Math.random() * 1000;

const isCredentialError = (msg: string) => {
  const n = msg.toLowerCase();
  return n.includes("invalid login credentials") || n.includes("email not confirmed");
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
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBERED_USER_KEY) || "");
  const [pass, setPass] = useState("");
  const [keepConnected, setKeepConnected] = useState(() => localStorage.getItem(KEEP_CONNECTED_KEY) !== "false");
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

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const { error } = await withTimeout(request(), AUTH_TIMEOUT_MS, "Tempo de conexão excedido.");
        if (error) {
          if (attempt === MAX_RETRIES - 1) {
            setForgotError(getFriendlyAuthMessage(error.message));
          } else {
            await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
            continue;
          }
        }
        setForgotSent(true);
        break;
      } catch (err) {
        if (!isConnectionLikeError(err)) {
          setForgotError("Não foi possível enviar o link. Tente novamente.");
          break;
        }
        if (attempt === MAX_RETRIES - 1) {
          setForgotError("Não foi possível conectar ao servidor. Tente novamente em alguns segundos.");
        } else {
          await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
        }
      }
    }
    setForgotLoading(false);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !pass.trim()) {
      setError("Preencha email e senha.");
      return;
    }
    if (loading) return;
    setLoading(true);
    setError("");
    localStorage.setItem(KEEP_CONNECTED_KEY, keepConnected ? "true" : "false");
    if (keepConnected) {
      localStorage.setItem(REMEMBERED_USER_KEY, email.trim());
    } else {
      localStorage.removeItem(REMEMBERED_USER_KEY);
    }

    const request = () => supabase.auth.signInWithPassword({ email: email.trim(), password: pass });

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const { error } = await withTimeout(request(), AUTH_TIMEOUT_MS, "Tempo de conexão excedido.");
        if (error) {
          if (isCredentialError(error.message)) {
            setError(getFriendlyAuthMessage(error.message));
            break;
          }
          if (attempt === MAX_RETRIES - 1) {
            setError(getFriendlyAuthMessage(error.message));
          } else {
            await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
            continue;
          }
        }
        break;
      } catch (err) {
        if (!isConnectionLikeError(err)) {
          const rawMessage = getErrorMessage(err);
          setError(rawMessage ? getFriendlyAuthMessage(rawMessage) : "Não foi possível autenticar. Tente novamente.");
          break;
        }
        if (attempt === MAX_RETRIES - 1) {
          setError("Não foi possível conectar ao servidor. Tente novamente em alguns segundos.");
        } else {
          await new Promise((r) => setTimeout(r, backoffDelay(attempt)));
        }
      }
    }
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
      className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden"
      style={{ background: "#00dbff" }}
    >
      <div className="relative w-full max-w-md z-10">
        {/* Main Login Box */}
        <div
          className="relative z-10 w-full p-10 shadow-[0_20px_60px_-10px_rgba(0,0,0,0.25),0_0_0_1px_rgba(255,255,255,0.08)] animate-fade-in backdrop-blur-xl"
          style={{ fontSize: "12px", borderRadius: "1.5rem", background: "rgba(255,255,255,0.97)" }}
        >
          <div className="flex items-center justify-center mb-8">
            <HouseMixIcon size={56} />
          </div>

          <div className="space-y-4">
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className="login-input w-full rounded-xl px-5 py-3 outline-none transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ fontSize: "12px", color: "#0f1058", border: "2px solid #00dbff", backgroundColor: "#ffffff" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00dbff")}
              onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "#00dbff"; }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#00dbff"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,219,255,0.25)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#00dbff"; e.currentTarget.style.boxShadow = "none"; }}
            />
            <input
              type="password"
              placeholder="senha"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit(); }}
              disabled={loading}
              className="login-input w-full rounded-xl px-5 py-3 outline-none transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ fontSize: "12px", color: "#0f1058", border: "2px solid #00dbff", backgroundColor: "#ffffff" }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#00dbff")}
              onMouseLeave={(e) => { if (document.activeElement !== e.currentTarget) e.currentTarget.style.borderColor = "#00dbff"; }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#00dbff"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,219,255,0.25)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#00dbff"; e.currentTarget.style.boxShadow = "none"; }}
            />

            {error && <p className="text-center font-medium" style={{ fontSize: "12px", color: "#dc2626" }}>{error}</p>}

            <label
              htmlFor="keep-connected"
              className="flex items-center gap-3 cursor-pointer select-none px-3 py-2.5 min-h-11 rounded-xl group focus-within:outline-none transition-colors touch-manipulation"
              style={{ border: "2px solid #00dbff", backgroundColor: "#ffffff" }}
            >
              <div className="relative flex items-center justify-center">
                <input
                  id="keep-connected"
                  name="keep-connected"
                  type="checkbox"
                  checked={keepConnected}
                  onChange={(e) => {
                    setKeepConnected(e.target.checked);
                    localStorage.setItem(KEEP_CONNECTED_KEY, e.target.checked ? "true" : "false");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const next = !keepConnected;
                      setKeepConnected(next);
                      localStorage.setItem(KEEP_CONNECTED_KEY, next ? "true" : "false");
                    }
                  }}
                  aria-checked={keepConnected}
                  aria-label="Mantenha-me conectado"
                  className="peer h-[20px] w-[20px] shrink-0 rounded-[4px] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00dbff] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none transition-all duration-200 cursor-pointer"
                  style={{
                    accentColor: "#d9ff65",
                    border: "2px solid #0f1058",
                    backgroundColor: keepConnected ? "#d9ff65" : "#ffffff",
                  }}
                />
                <div className="absolute opacity-0 peer-checked:opacity-100 pointer-events-none transition-opacity duration-200">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0f1058" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><polyline points="20 6 9 17 4 12"></polyline></svg>
                </div>
              </div>
              <span className="transition-colors duration-200" style={{ fontSize: "12px", color: "#0f1058" }}>mantenha-me conectado</span>
            </label>



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

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                aria-busy={loading}
                aria-live="polite"
                className="group relative flex items-center justify-center gap-3 px-7 py-2.5 min-w-[130px] rounded-full font-semibold disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-300 overflow-hidden"
                style={{ fontSize: "12px", background: "#00dbff", color: "#0f1058", boxShadow: "0 4px 16px -2px rgba(0,219,255,0.5)" }}
                onMouseEnter={(e) => {
                  if (loading) return;
                  e.currentTarget.style.boxShadow = "0 6px 24px -2px rgba(0,219,255,0.7)";
                  e.currentTarget.style.transform = "translateY(-1px)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "0 4px 16px -2px rgba(0,219,255,0.5)";
                  e.currentTarget.style.transform = "translateY(0)";
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" style={{ color: "#0f1058" }} aria-hidden="true" />
                    <span>entrando...</span>
                    <span className="sr-only">Autenticando, aguarde</span>
                  </>
                ) : (
                  <>
                    entrar
                    <ArrowRight size={20} strokeWidth={1.25} className="transition-transform duration-300 group-hover:translate-x-1.5" />
                  </>
                )}
              </button>
            </div>
          </div>

        </div>

        <div className="mt-6 flex justify-center">
          <img src={logoNexo} alt="Nexo Soluções Visuais" className="h-10 opacity-90 animate-fade-in" />
        </div>

        {/* Forgot Password Box */}
        <div
          className="absolute left-0 right-0 z-0 overflow-hidden transition-all duration-500 ease-in-out"
          style={{
            top: showForgot ? "calc(100% - 80px)" : "50%",
            opacity: showForgot ? 1 : 0,
            pointerEvents: showForgot ? "auto" : "none",
          }}
        >
          <div
            className="px-10 pt-10 pb-8 shadow-[0_16px_50px_-10px_rgba(0,0,0,0.15)]"
            style={{ background: "rgba(255,255,255,0.97)", fontSize: "12px", borderRadius: "0 0 1.5rem 1.5rem", border: "1px solid rgba(0,219,255,0.25)", borderTop: "none" }}
          >
            {forgotSent ? (
              <div className="flex flex-col items-center gap-3">
                <CheckCircle style={{ color: "#00dbff" }} size={40} />
                <p className="text-center" style={{ fontSize: "12px", color: "#0f1058" }}>
                  Link enviado para <strong>{forgotEmail}</strong>
                </p>
                <button
                  onClick={closeForgot}
                  className="mt-2 font-medium transition-colors duration-200"
                  style={{ fontSize: "12px", color: "#0f1058" }}
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-center" style={{ fontSize: "12px", color: "#0f1058" }}>
                  Informe seu email para redefinir a senha
                </p>
                <input
                  type="email"
                  placeholder="seu email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleForgot()}
                  className="login-input w-full rounded-xl px-5 py-3 outline-none transition-all duration-200"
                  style={{ fontSize: "12px", color: "#0f1058", border: "2px solid #00dbff", backgroundColor: "#ffffff" }}
                  onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,219,255,0.25)"; }}
                  onBlur={(e) => { e.currentTarget.style.boxShadow = "none"; }}
                />
                {forgotError && <p className="text-center" style={{ fontSize: "12px", color: "#dc2626" }}>{forgotError}</p>}
                <div className="flex justify-between items-center">
                  <button
                    onClick={closeForgot}
                    className="flex items-center gap-1 transition-colors duration-200"
                    style={{ fontSize: "12px", color: "#0f1058" }}
                  >
                    <X size={14} /> Fechar
                  </button>
                  <button
                    onClick={handleForgot}
                    disabled={forgotLoading}
                    className="group flex items-center gap-3 px-7 py-2.5 rounded-full font-semibold disabled:opacity-70 transition-all duration-300"
                    style={{ fontSize: "12px", background: "#00dbff", color: "#0f1058", boxShadow: "0 4px 16px -2px rgba(0,219,255,0.5)" }}
                    onMouseEnter={(e) => {
                      if (forgotLoading) return;
                      e.currentTarget.style.boxShadow = "0 6px 24px -2px rgba(0,219,255,0.7)";
                      e.currentTarget.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = "0 4px 16px -2px rgba(0,219,255,0.5)";
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                  >
                    {forgotLoading ? (
                      <Loader2 size={20} className="animate-spin" style={{ color: "#0f1058" }} />
                    ) : (
                      <>
                        enviar
                        <ArrowRight size={20} strokeWidth={1.25} className="transition-transform duration-300 group-hover:translate-x-1.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="text-center mt-8 text-white/40 z-10" style={{ fontSize: "11px" }}>
        © {new Date().getFullYear()} Nexo Soluções Visuais
      </p>
    </div>
  );
}
