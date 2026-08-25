import React, { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Loader2, Clock, ExternalLink, RefreshCw } from "lucide-react";
import VmixPage from "@/components/VmixPage";
import type { User } from "@supabase/supabase-js";
import vmixControlLogo from "@/assets/logo-mixcontrol.png";
import VmixControlSkeleton from "@/components/skeletons/VmixControlSkeleton";

export default function VmixControl({ forcedConnected = false }: { forcedConnected?: boolean }) {
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
      <div className="h-screen flex items-center justify-center" style={{ backgroundColor: "#000000" }}>
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-2xl p-8 flex flex-col gap-5"
          style={{ backgroundColor: "#0d0d0d", border: "1px solid #C6F03C25", boxShadow: "0 8px 40px rgba(0,0,0,0.6)" }}
        >
          <div className="flex flex-col items-center gap-2 mb-2">
            <img src={vmixControlLogo} alt="Mix Control" className="h-8" />
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#ffffff45" }}>Faça login para acessar o controle</p>
          </div>

          {error && (
            <div className="text-xs text-center font-medium px-3 py-2 rounded-lg" style={{ backgroundColor: "#dc262620", color: "#f87171", border: "1px solid #dc262640" }}>
              {error}
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#C6F03C" }}>E-mail</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
              style={{ backgroundColor: "#141414", color: "#fff", border: "1px solid #ffffff14" }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-black uppercase tracking-widest" style={{ color: "#C6F03C" }}>Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none transition-all"
              style={{ backgroundColor: "#141414", color: "#fff", border: "1px solid #ffffff14" }}
            />
          </div>

          <button
            type="submit"
            disabled={signing}
            className="w-full py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#C6F03C", color: "#000" }}
          >
            {signing ? <Loader2 className="animate-spin" size={16} /> : null}
            Entrar
          </button>

        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#000000" }}>
      <header className="relative flex items-center justify-between px-6 py-3" style={{ backgroundColor: "#0a0a0a", borderBottom: "1px solid #C6F03C20" }}>
        <div className="flex items-center gap-2" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <img src={vmixControlLogo} alt="NEXO VMIX CONTROL" className="h-6" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#C6F03C99" }}>{user.email}</span>
          <button
            onClick={handleLogout}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ backgroundColor: "#1a1a1a", color: "#C6F03C", border: "1px solid #C6F03C30" }}
            title="Sair"
          >
            <LogOut size={15} />
          </button>
        </div>
      </header>
      <main className="flex-1 p-6" style={{ backgroundColor: "#000000" }}>
        <VmixPage forcedConnected={forcedConnected} />
      </main>
    </div>
  );

}
