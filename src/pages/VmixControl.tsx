import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Monitor, LogOut, Loader2 } from "lucide-react";
import VmixPage from "@/components/VmixPage";
import type { User } from "@supabase/supabase-js";

export default function VmixControl() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSigning(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) setError("E-mail ou senha incorretos.");
    setSigning(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
        <Loader2 className="animate-spin text-white" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-5"
          style={{ backgroundColor: "#ffffff", boxShadow: "0 8px 40px rgba(0,0,0,0.3)" }}
        >
          <div className="flex flex-col items-center gap-2 mb-2">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
              <Monitor className="text-white" size={28} />
            </div>
            <h1 className="text-xl font-bold" style={{ color: "#0d0446" }}>vMix Control</h1>
            <p className="text-xs" style={{ color: "#6b7280" }}>Faça login para acessar o controle</p>
          </div>

          {error && (
            <div className="text-xs text-center font-medium px-3 py-2 rounded-lg" style={{ backgroundColor: "#fee2e2", color: "#dc2626" }}>
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-2"
              style={{ backgroundColor: "#f0f4fa", color: "#0d0446", border: "1px solid #e2e8f0", focusRingColor: "#268ffa" } as React.CSSProperties}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold" style={{ color: "#0d0446" }}>Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-2"
              style={{ backgroundColor: "#f0f4fa", color: "#0d0446", border: "1px solid #e2e8f0" } as React.CSSProperties}
            />
          </div>

          <button
            type="submit"
            disabled={signing}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}
          >
            {signing ? <Loader2 className="animate-spin" size={16} /> : null}
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#ffffff" }}>
      <header className="flex items-center justify-between px-6 py-3" style={{ backgroundColor: "#0d0446" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
            <Monitor className="text-white" size={16} />
          </div>
          <span className="text-white font-bold text-sm">vMix Control</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs">{user.email}</span>
          <button onClick={handleLogout} className="text-white/50 hover:text-white transition-colors" title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main className="flex-1 p-6" style={{ backgroundColor: "#f8f9fc" }}>
        <VmixPage />
      </main>
    </div>
  );
}
