import { useState } from "react";
import { ArrowRight, Loader2, CheckCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoNexo from "@/assets/logo-nexo.png";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  
  const [isForgot, setIsForgot] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotSent, setForgotSent] = useState(false);

  const handleForgot = async () => {
    if (!email.trim()) {
      setError("Preencha o email.");
      return;
    }
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) setError(error.message);
    else setForgotSent(true);
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (isForgot) return handleForgot();
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

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: "linear-gradient(135deg, #004dc0 0%, #0c0440 100%)" }}
    >
      <div className="w-full max-w-md rounded-3xl p-10 shadow-2xl animate-fade-in bg-white relative">
        <h1 className="text-center font-semibold tracking-wide mb-8 text-sm" style={{ color: "#0f1058" }}>
          NexoHub {isForgot ? "/ recuperar senha" : "login"}
        </h1>

        {isForgot && forgotSent ? (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="text-green-500" size={48} />
            <p className="text-sm text-center" style={{ color: "#0f1058" }}>
              Link de recuperação enviado para <strong>{email}</strong>. Verifique sua caixa de entrada.
            </p>
            <button
              onClick={() => { setIsForgot(false); setForgotSent(false); }}
              className="text-xs hover:opacity-80 transition-opacity mt-2"
              style={{ color: "#0f1058" }}
            >
              Voltar ao login
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="email"
              placeholder="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-full px-6 py-4 outline-none text-sm transition-colors"
              style={{
                color: "#0f1058",
                border: "2px solid #0d379a",
                backgroundColor: "#fff",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#0d379a")}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#0d379a")}
            />
            {!isForgot && (
              <input
                type="password"
                placeholder="senha"
                value={pass}
                onChange={(e) => setPass(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                className="w-full rounded-full px-6 py-4 outline-none text-sm transition-colors"
                style={{
                  color: "#0f1058",
                  border: "2px solid #0d379a",
                  backgroundColor: "#fff",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#0d379a")}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#268ffa")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "#0d379a")}
              />
            )}

            {error && <p className="text-red-500 text-xs text-center">{error}</p>}

            <div className="flex justify-between items-center pt-2">
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => { setIsForgot(!isForgot); setError(""); }}
                  className="text-xs hover:opacity-80 transition-opacity"
                  style={{ color: "#0f1058" }}
                >
                  {isForgot ? "Voltar ao login" : "Esqueci a senha"}
                </button>
              </div>
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="hover:brightness-110 transition-all flex items-center gap-3 px-8 py-3 rounded-full font-medium text-sm disabled:opacity-50 text-white"
                style={{ backgroundColor: "#0f1058" }}
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : (
                  <>
                    {isForgot ? "enviar" : "entrar"}
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Logo no canto inferior esquerdo do box */}
        <div className="mt-8">
          <img src={logoNexo} alt="Nexo Soluções Visuais" className="h-8 opacity-80" />
        </div>
      </div>
    </div>
  );
}
