import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { User as UserIcon, Loader2 } from "lucide-react";

interface AccessScreenProps {
  logoUrl?: string | null;
  onLoginSuccess: () => void;
  onGuest: () => void;
}

export default function AccessScreen({ logoUrl, onLoginSuccess, onGuest }: AccessScreenProps) {
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    if (isSignUp) {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) { setError(err.message); setLoading(false); return; }
      setError("Verifique seu e-mail para confirmar o cadastro.");
      setLoading(false);
      return;
    }

    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError(err.message); setLoading(false); return; }
    setLoading(false);
    onLoginSuccess();
  };

  if (showLogin) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black px-6"
        style={{ background: "radial-gradient(ellipse at 50% 90%, rgba(180,20,20,0.25) 0%, #000 70%)" }}
      >
        <button onClick={() => setShowLogin(false)} className="absolute top-6 left-6 text-white/60 hover:text-white text-sm">
          ← voltar
        </button>
        <h2 className="text-white text-2xl font-semibold mb-8">{isSignUp ? "Criar conta" : "Entrar"}</h2>
        <form onSubmit={handleSubmit} className="w-full max-w-xs flex flex-col gap-4">
          <input
            type="email"
            placeholder="E-mail"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-red-600"
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder:text-white/40 focus:outline-none focus:border-red-600"
            required
          />
          {error && <p className="text-red-400 text-xs text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white font-semibold py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {isSignUp ? "Cadastrar" : "Entrar"}
          </button>
          <button type="button" onClick={() => setIsSignUp(!isSignUp)} className="text-red-500 text-sm hover:underline">
            {isSignUp ? "Já tenho conta" : "Criar uma conta"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black"
      style={{ background: "radial-gradient(ellipse at 50% 90%, rgba(180,20,20,0.25) 0%, #000 70%)" }}
    >
      <h1 className="text-white text-2xl font-semibold mb-12">Quem vai acessar?</h1>

      <div className="flex items-center gap-8">
        {/* Login option */}
        <button
          onClick={() => setShowLogin(true)}
          className="flex flex-col items-center gap-4 group"
        >
          <div className="w-32 h-32 rounded-full bg-red-700/80 flex items-center justify-center transition-transform group-hover:scale-105">
            <UserIcon className="h-14 w-14 text-white/90" />
          </div>
          <div className="text-center">
            <p className="text-white text-sm"><span className="font-bold">login</span> para</p>
            <p className="text-white text-sm">ter + benefícios</p>
          </div>
          <span className="text-red-500 text-sm hover:underline">entrar / fazer cadastro</span>
        </button>

        {/* Divider */}
        <div className="h-48 w-px bg-white/10" />

        {/* Guest option */}
        <button
          onClick={onGuest}
          className="flex flex-col items-center gap-4 group"
        >
          <div className="w-32 h-32 rounded-full bg-red-700/80 flex items-center justify-center transition-transform group-hover:scale-105 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
            ) : (
              <span className="text-white text-3xl font-bold">P</span>
            )}
          </div>
          <p className="text-white text-sm">só quero acessar</p>
        </button>
      </div>
    </div>
  );
}
