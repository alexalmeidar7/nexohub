import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Loader2, Clock, ExternalLink } from "lucide-react";
import VmixPage from "@/components/VmixPage";
import type { User } from "@supabase/supabase-js";
import logoMixControl from "@/assets/logo-mixcontrol.png"; // User requested logo change, but the asset is managed by Lovable. I will keep using the project's logo variable.
import VmixControlSkeleton from "@/components/skeletons/VmixControlSkeleton";

export default function VmixControl() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(false);
  const [clock, setClock] = useState(() => {
    const now = new Date();
    return {
      time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      date: now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, ""),
    };
  });

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setClock({
        time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        date: now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" }).replace(/\./g, ""),
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

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
    return <VmixControlSkeleton />;
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
            <img src={logoMixControl} alt="Mix Control" className="h-8" />
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
              style={{ backgroundColor: "#f0f4fa", color: "#0d0446", border: "1px solid #e2e8f0" }}
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
              style={{ backgroundColor: "#f0f4fa", color: "#0d0446", border: "1px solid #e2e8f0" }}
            />
          </div>

          <button
            type="submit"
            disabled={signing}
            className="w-full py-2.5 rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #3a3a44, #4a4a54)" }}
          >
            {signing ? <Loader2 className="animate-spin" size={16} /> : null}
            Entrar
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#191919" }}>
      <header className="relative flex items-center justify-between px-6 py-3" style={{ backgroundColor: "#242424" }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#111115", border: "1px solid #2a2a30", boxShadow: "inset 0 2px 6px rgba(0,0,0,0.6), 0 0 12px rgba(0,0,0,0.3)" }}>
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#dc2626", boxShadow: "0 0 6px #dc262660" }} />
            <div className="flex flex-col items-end">
              <span className="text-xs font-mono font-black tracking-[0.3em] tabular-nums leading-none" style={{ color: "#22c55e", textShadow: "0 0 10px rgba(34,197,94,0.5)" }}>{clock.time}</span>
              <span className="text-[7px] font-medium uppercase tracking-widest mt-0.5" style={{ color: "#666" }}>{clock.date}</span>
            </div>
          </div>
          <button
            onClick={() => window.open(window.location.pathname, "_blank", "noopener,noreferrer")}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:scale-105"
            style={{ backgroundColor: "#2a2a30", border: "1px solid #3a3a40", color: "#888" }}
            title="Abrir em nova aba"
          >
            <ExternalLink size={14} />
          </button>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <img src={logoMixControl} alt="Mix Control" className="h-5" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-white/60 text-xs">{user.email}</span>
          <button onClick={handleLogout} className="text-white/50 hover:text-white transition-colors" title="Sair">
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main className="flex-1 p-6" style={{ backgroundColor: "#191919" }}>
        <VmixPage />
      </main>
    </div>
  );
}
