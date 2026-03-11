import { useState } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import logoNexo from "@/assets/logo-nexo.png";

interface TpLoginProps {
  authLoading: boolean;
  onLoginSuccess: () => void;
}

export default function TpLogin({ authLoading, onLoginSuccess }: TpLoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!email.trim() || !password.trim()) {
      setError("Preencha todos os campos");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) {
      setError("E-mail ou senha inválidos");
    } else {
      onLoginSuccess();
    }
  }

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-tp">
        <Loader2 size={32} className="animate-spin text-tp-accent" />
      </div>
    );
  }

  return (
    <div className="h-screen flex items-center justify-center bg-tp font-sans">
      <form onSubmit={handleLogin} className="bg-white rounded-[2rem] px-9 py-10 w-[min(400px,90%)] flex flex-col items-center gap-4">
        <img src={logoNexo} alt="Nexo" className="h-10 mb-2" />
        <h2 className="text-sm font-bold text-tp-surface m-0">Acesso ao Teleprompter</h2>
        <input
          type="email" placeholder="E-mail" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-[10px] border border-slate-300 text-xs outline-none text-tp-surface"
        />
        <input
          type="password" placeholder="Senha" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3.5 py-2.5 rounded-[10px] border border-slate-300 text-xs outline-none text-tp-surface"
        />
        {error && <span className="text-[11px] text-destructive">{error}</span>}
        <button type="submit" disabled={loading} className="w-full py-2.5 rounded-[10px] border-none bg-tp-accent text-white text-xs font-bold cursor-pointer flex items-center justify-center gap-2">
          {loading ? <Loader2 size={16} className="animate-spin" /> : <>Entrar <ArrowRight size={14} /></>}
        </button>
        <span className="text-[10px] text-tp-surface/40 mt-2">© Nexo Soluções Visuais</span>
      </form>
    </div>
  );
}
