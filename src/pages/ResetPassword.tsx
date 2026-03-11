import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowRight, Loader2, CheckCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function ResetPassword() {
  usePageTitle("Redefinir Senha");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [isRecovery, setIsRecovery] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setIsRecovery(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setIsRecovery(true);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async () => {
    if (!password.trim() || !confirm.trim()) {
      setError("Preencha os dois campos.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    setError("");

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setError(error.message);
    } else {
      setSuccess(true);
      setTimeout(() => navigate("/"), 2000);
    }
    setLoading(false);
  };

  if (!isRecovery) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="bg-login w-full max-w-md rounded-4xl p-10 shadow-2xl animate-fade-in text-center">
          <h1 className="text-login-foreground font-medium tracking-[0.2em] mb-4 text-xs">
            MASTERVIEW / RECUPERAÇÃO
          </h1>
          <p className="text-login-foreground/70 text-sm">
            Link inválido ou expirado. Solicite um novo link de recuperação na tela de login.
          </p>
          <button
            onClick={() => navigate("/")}
            className="mt-6 bg-primary hover:brightness-95 transition-all px-8 py-3 rounded-full font-medium text-primary-foreground text-sm"
          >
            Voltar ao login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="bg-login w-full max-w-md rounded-4xl p-10 shadow-2xl animate-fade-in">
        <h1 className="text-center text-login-foreground font-medium tracking-[0.2em] mb-8 text-xs">
          MASTERVIEW / NOVA SENHA
        </h1>

        {success ? (
          <div className="flex flex-col items-center gap-4">
            <CheckCircle className="text-green-400" size={48} />
            <p className="text-login-foreground/70 text-sm text-center">
              Senha alterada com sucesso! Redirecionando...
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="password"
              placeholder="nova senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-foreground text-muted-foreground rounded-full px-6 py-4 outline-none placeholder:text-muted-foreground/50"
            />
            <input
              type="password"
              placeholder="confirmar senha"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleReset()}
              className="w-full bg-foreground text-muted-foreground rounded-full px-6 py-4 outline-none placeholder:text-muted-foreground/50"
            />

            {error && <p className="text-red-400 text-xs text-center">{error}</p>}

            <div className="flex justify-end pt-2">
              <button
                onClick={handleReset}
                disabled={loading}
                className="bg-primary hover:brightness-95 transition-all flex items-center gap-3 px-8 py-3 rounded-full font-medium text-primary-foreground text-sm disabled:opacity-50"
              >
                {loading ? <Loader2 size={20} className="animate-spin" /> : (
                  <>
                    salvar
                    <ArrowRight size={20} />
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="mt-20">
        <span className="text-foreground font-bold text-2xl tracking-tighter flex items-center gap-1">
          svn<span className="text-sm">✦</span>broadcast
        </span>
      </div>
    </div>
  );
}
