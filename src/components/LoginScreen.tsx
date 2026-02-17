import { useState } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (!email.trim() || !pass.trim()) {
      setError("Preencha email e senha.");
      return;
    }
    setLoading(true);
    setError("");

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password: pass });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) setError(error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="bg-login w-full max-w-md rounded-4xl p-10 shadow-2xl animate-fade-in">
        <h1 className="text-center text-login-foreground font-medium tracking-[0.2em] mb-8 text-xs">
          MASTERVIEW / {isSignUp ? "CADASTRO" : "LOGIN"}
        </h1>
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
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs text-login-foreground/70 hover:text-login-foreground transition-colors"
            >
              {isSignUp ? "Já tenho conta" : "Criar conta"}
            </button>
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="bg-primary hover:brightness-95 transition-all flex items-center gap-3 px-8 py-3 rounded-full font-medium text-primary-foreground text-sm disabled:opacity-50"
            >
              {loading ? <Loader2 size={20} className="animate-spin" /> : (
                <>
                  {isSignUp ? "cadastrar" : "entrar"}
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
