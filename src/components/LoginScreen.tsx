import { useRef, useState } from "react";
import { ArrowRight, Loader2, CheckCircle, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoNexoSolucoes from "@/assets/logo-nexo-solucoes-visuais.png";

const AUTH_TIMEOUT_MS = 12000;
const KEEP_CONNECTED_KEY = "nexohub_keep_connected";
const REMEMBERED_USER_KEY = "nexohub_remembered_user";
const SIGNED_OUT_FLAG = "nexohub_signed_out";

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
    /\b(?:500|502|503|504|522)\b/.test(message) ||
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
  if (isCredentialError(normalized)) {
    return "E-mail ou senha incorretos.";
  }
  if (normalized.includes("email not confirmed")) {
    return "E-mail ainda não confirmado. Verifique sua caixa de entrada.";
  }
  if (normalized.includes("rate limit") || normalized.includes("too many requests")) {
    return "Muitas tentativas em pouco tempo. Aguarde alguns instantes.";
  }
  if (isConnectionLikeError(normalized)) {
    return "Não foi possível conectar ao servidor. Tente novamente em alguns segundos.";
  }
  return "Não foi possível autenticar. Verifique seus dados e tente novamente.";
};

const FONT_FAMILY = "'Montserrat', sans-serif";

const labelStyle: React.CSSProperties = {
  fontFamily: FONT_FAMILY,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
  display: "block",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 46,
  borderRadius: 999,
  background: "#ededed",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  padding: "0 20px",
  fontFamily: FONT_FAMILY,
  fontSize: 13,
  color: "#0f172a",
  outline: "none",
  transition: "all 0.2s ease",
};

export default function LoginScreen() {
  const [email, setEmail] = useState(() => {
    try {
      return localStorage.getItem(REMEMBERED_USER_KEY) || "";
    } catch {
      return "";
    }
  });
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const loginRequestRef = useRef<ReturnType<typeof supabase.auth.signInWithPassword> | null>(null);
  const [error, setError] = useState("");
  const [keepConnected, setKeepConnected] = useState(() => {
    try {
      return localStorage.getItem(KEEP_CONNECTED_KEY) !== "false";
    } catch {
      return true;
    }
  });

  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const handleForgotSubmit = async () => {
    if (!forgotEmail.trim()) {
      setForgotError("Informe seu email.");
      return;
    }
    setForgotLoading(true);
    setForgotError("");

    // A packaged file:// origin is not a valid password-reset callback.
    // Require an explicitly configured, allowlisted callback for the Desktop build.
    const redirectTo =
      import.meta.env.BASE_URL === "./"
        ? import.meta.env.VITE_DESKTOP_AUTH_REDIRECT_URL?.trim()
        : `${window.location.origin}/reset-password`;

    if (!redirectTo) {
      setForgotError("A recuperação de senha ainda não está configurada para o aplicativo Desktop. Entre em contato com o suporte.");
      setForgotLoading(false);
      return;
    }

    const request = () =>
      supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
        redirectTo,
      });

    try {
      const { error } = await withTimeout(
        request(),
        AUTH_TIMEOUT_MS,
        "Tempo de conexão excedido."
      );
      if (error) {
        setForgotError(
          isConnectionLikeError(error)
            ? "Não foi possível confirmar o envio. Verifique sua caixa de entrada antes de solicitar outro link."
            : getFriendlyAuthMessage(error.message)
        );
        return;
      }
      setForgotSent(true);
    } catch (err) {
      setForgotError(
        isConnectionLikeError(err)
          ? "Não foi possível confirmar o envio. Verifique sua caixa de entrada antes de solicitar outro link."
          : "Não foi possível enviar o link. Tente novamente."
      );
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgot = handleForgotSubmit;

  const handleSubmit = async () => {
    if (!email.trim() || !pass.trim()) {
      setError("Preencha email e senha.");
      return;
    }
    if (loginRequestRef.current) {
      setError("A tentativa anterior ainda está sendo processada. Aguarde antes de tentar novamente.");
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

    // Password grants are single-flight: retrying after a timeout can create
    // concurrent sessions and rotate refresh tokens more than once.
    try {
      const loginRequest = supabase.auth.signInWithPassword({ email: email.trim(), password: pass });
      loginRequestRef.current = loginRequest;
      const clearLoginRequest = () => {
        if (loginRequestRef.current === loginRequest) loginRequestRef.current = null;
      };
      void loginRequest.then(clearLoginRequest, clearLoginRequest);

      const { data, error } = await withTimeout(
        loginRequest,
        AUTH_TIMEOUT_MS,
        "Tempo de conexão excedido. O servidor não respondeu a tempo."
      );

      if (error) {
        console.error("[AuthLogin] signInWithPassword failed", {
          status: (error as any).status,
          code: (error as any).code,
          message: error.message,
        });
        setError(getFriendlyAuthMessage(error.message));
        return;
      }

      if (!data?.session || !data?.user) {
        console.error("[AuthLogin] Auth returned no session or user", {
          hasSession: Boolean(data?.session),
          hasUser: Boolean(data?.user),
        });
        setError("O servidor aceitou a solicitação, mas não retornou uma sessão válida. Tente novamente.");
        return;
      }

      localStorage.removeItem("nexohub_explicit_logout");
      localStorage.removeItem(SIGNED_OUT_FLAG);
      sessionStorage.removeItem(SIGNED_OUT_FLAG);
      if (import.meta.env.BASE_URL !== "./" && new URLSearchParams(window.location.search).get("signed_out") === "1") {
        window.history.replaceState({}, "", "/");
      }
      localStorage.setItem("nexohub_backup_session", JSON.stringify(data.session));
      localStorage.setItem(KEEP_CONNECTED_KEY, "true");
      if (import.meta.env.BASE_URL === "./") {
        window.location.hash = "#/home";
      } else {
        window.location.replace("/home");
      }
    } catch (err) {
      const rawMessage = getErrorMessage(err);
      const requestStillPending = Boolean(loginRequestRef.current);
      console.error("[AuthLogin] login request threw", err);
      setError(
        isConnectionLikeError(err)
          ? requestStillPending
            ? "O servidor não respondeu a tempo. A tentativa ainda pode estar em processamento; aguarde antes de tentar novamente."
            : "Não foi possível conectar ao servidor. Verifique a conexão e tente novamente."
          : rawMessage
            ? getFriendlyAuthMessage(rawMessage)
            : "Não foi possível autenticar. Tente novamente."
      );
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
      className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden"
      style={{ background: "#000000" }}
    >
      <div className="relative w-full max-w-[440px] z-10">
        {/* Main Login Card - Super Admin / Cadastro de Cliente Visual Style */}
        <div
          className="relative z-10 w-full bg-white rounded-3xl p-8 sm:p-10 shadow-[0_20px_60px_rgba(0,0,0,0.6)] border border-slate-100/90 animate-fade-in"
          style={{ fontFamily: FONT_FAMILY }}
        >
          {/* Logo on top of form */}
          <div className="flex items-center justify-center mb-8">
            <img
              src={logoNexoSolucoes}
              alt="Nexo Soluções Visuais"
              className="h-16 sm:h-20 w-auto object-contain"
            />
          </div>

          <div className="space-y-4">
            <div>
              <label style={labelStyle}>E-mail de Acesso</label>
              <input
                type="email"
                placeholder="seu.email@empresa.com.br"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit(); }}
                disabled={loading}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#0055ff";
                  e.currentTarget.style.backgroundColor = "#ffffff";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,85,255,0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(226, 232, 240, 0.9)";
                  e.currentTarget.style.backgroundColor = "#ededed";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            <div>
              <label style={labelStyle}>Senha</label>
              <input
                type="password"
                placeholder="••••••••"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !loading) handleSubmit(); }}
                disabled={loading}
                style={inputStyle}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = "#0055ff";
                  e.currentTarget.style.backgroundColor = "#ffffff";
                  e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,85,255,0.15)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = "rgba(226, 232, 240, 0.9)";
                  e.currentTarget.style.backgroundColor = "#ededed";
                  e.currentTarget.style.boxShadow = "none";
                }}
              />
            </div>

            {error && (
              <p
                className="text-center font-bold text-xs py-1 px-3 rounded-full bg-rose-50 border border-rose-200 text-rose-600"
                style={{ fontFamily: FONT_FAMILY }}
              >
                {error}
              </p>
            )}

            {/* Mantenha-me conectado */}
            <label
              htmlFor="keep-connected"
              className="flex items-center gap-3 cursor-pointer select-none px-4 py-2.5 rounded-full bg-[#f8fafc] border border-slate-200/80 hover:bg-slate-100/80 transition-colors"
            >
              <input
                id="keep-connected"
                name="keep-connected"
                type="checkbox"
                checked={keepConnected}
                onChange={(e) => {
                  setKeepConnected(e.target.checked);
                  localStorage.setItem(KEEP_CONNECTED_KEY, e.target.checked ? "true" : "false");
                }}
                className="w-4 h-4 rounded text-[#0055ff] focus:ring-[#0055ff] accent-[#0055ff] cursor-pointer"
              />
              <span
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: "#475569",
                }}
              >
                Mantenha-me conectado
              </span>
            </label>

            {/* Bottom Actions */}
            <div className="flex justify-between items-center pt-3">
              <button
                type="button"
                onClick={() => { setShowForgot(!showForgot); setError(""); }}
                style={{
                  fontFamily: FONT_FAMILY,
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: 0.8,
                  textTransform: "uppercase",
                  color: "#64748b",
                }}
                className="hover:text-[#0055ff] transition-colors cursor-pointer"
              >
                Esqueci a senha
              </button>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                aria-busy={loading}
                aria-live="polite"
                style={{
                  height: 44,
                  borderRadius: 999,
                  background: "#0055ff",
                  color: "#ffffff",
                  fontFamily: FONT_FAMILY,
                  fontWeight: 800,
                  fontSize: 12,
                  letterSpacing: 1.2,
                  textTransform: "uppercase",
                }}
                className="px-7 inline-flex items-center justify-center gap-2 hover:bg-[#0047d4] active:scale-95 transition-all shadow-md hover:shadow-lg hover:shadow-blue-500/25 disabled:opacity-50 cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin text-white" size={15} />
                    <span>Entrando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar</span>
                    <ArrowRight size={15} />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Forgot Password Sub-Card */}
        <div
          className="overflow-hidden transition-all duration-300 ease-in-out mt-3"
          style={{
            maxHeight: showForgot ? "300px" : "0",
            opacity: showForgot ? 1 : 0,
            pointerEvents: showForgot ? "auto" : "none",
          }}
        >
          <div
            className="bg-white rounded-3xl p-6 shadow-2xl border border-slate-100/90"
            style={{ fontFamily: FONT_FAMILY }}
          >
            {forgotSent ? (
              <div className="flex flex-col items-center gap-3 py-2 text-center">
                <CheckCircle className="text-emerald-500" size={32} />
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Link enviado para <strong>{forgotEmail}</strong>
                </p>
                <button
                  type="button"
                  onClick={closeForgot}
                  style={{
                    height: 38,
                    borderRadius: 999,
                    background: "#0055ff",
                    color: "#ffffff",
                    fontFamily: FONT_FAMILY,
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                  className="px-6 mt-2 hover:bg-[#0047d4] active:scale-95 transition-all shadow-sm cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <label style={labelStyle}>Redefinição de Senha</label>
                <input
                  type="email"
                  placeholder="seu.email@empresa.com.br"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleForgot()}
                  style={inputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = "#0055ff";
                    e.currentTarget.style.backgroundColor = "#ffffff";
                    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0,85,255,0.15)";
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = "rgba(226, 232, 240, 0.9)";
                    e.currentTarget.style.backgroundColor = "#ededed";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                />
                {forgotError && (
                  <p className="text-center font-bold text-xs py-1 px-3 rounded-full bg-rose-50 border border-rose-200 text-rose-600">
                    {forgotError}
                  </p>
                )}
                <div className="flex justify-between items-center pt-2">
                  <button
                    type="button"
                    onClick={closeForgot}
                    style={{
                      fontFamily: FONT_FAMILY,
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: 0.8,
                      textTransform: "uppercase",
                      color: "#64748b",
                    }}
                    className="inline-flex items-center gap-1 hover:text-slate-900 transition-colors cursor-pointer"
                  >
                    <X size={14} /> Fechar
                  </button>
                  <button
                    type="button"
                    onClick={handleForgot}
                    disabled={forgotLoading}
                    style={{
                      height: 38,
                      borderRadius: 999,
                      background: "#0055ff",
                      color: "#ffffff",
                      fontFamily: FONT_FAMILY,
                      fontWeight: 800,
                      fontSize: 11,
                      letterSpacing: 1,
                      textTransform: "uppercase",
                    }}
                    className="px-6 inline-flex items-center gap-2 hover:bg-[#0047d4] active:scale-95 transition-all shadow-sm hover:shadow-md hover:shadow-blue-500/25 disabled:opacity-50 cursor-pointer"
                  >
                    {forgotLoading ? (
                      <Loader2 className="animate-spin text-white" size={14} />
                    ) : (
                      <>
                        <span>Enviar</span>
                        <ArrowRight size={14} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <p
        className="text-center mt-8 z-10"
        style={{
          fontFamily: FONT_FAMILY,
          fontSize: "11px",
          color: "rgba(255, 255, 255, 0.35)",
          letterSpacing: 1.2,
          textTransform: "uppercase",
          fontWeight: 600,
        }}
      >
        © {new Date().getFullYear()} Nexo Soluções Visuais
      </p>
    </div>
  );
}
