import React, { useState, useEffect } from "react";
import { clearSignOutFlag } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { LogOut, Loader2 } from "lucide-react";
import VmixPage from "@/components/VmixPage";
import type { User } from "@supabase/supabase-js";
import vmixControlLogo from "@/assets/logo-mixcontrol.png";
import nexoLogo from "@/assets/logo-nxo.png";
import VmixControlSkeleton from "@/components/skeletons/VmixControlSkeleton";

export default function VmixControl({ forcedConnected = false }: { forcedConnected?: boolean }) {
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
    clearSignOutFlag();
    const { error: err } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (err) setError("Usuário/e-mail ou senha incorretos.");
    setSigning(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  if (loading) return <VmixControlSkeleton />;

  return (
    <div className="relative min-h-screen w-full overflow-hidden flex flex-col" style={{ backgroundColor: "#151515", color: "#fff" }}>
      {/* Top navigation pill follows the visual language of the House Mix home header. */}
      <header className="w-full px-4 sm:px-8 pt-6 sm:pt-8 shrink-0 relative z-20">
        <div
          className="mx-auto w-full max-w-[1656px] min-h-[54px] sm:min-h-[56px] rounded-full flex items-center px-5 sm:px-8"
          style={{
            background: "rgba(245,245,245,0.92)",
            border: "1px solid rgba(255,255,255,0.55)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.65)",
          }}
        >
          <img
            src={vmixControlLogo}
            alt="Nexo vMix Control"
            className="block h-auto max-h-[22px] w-auto max-w-full object-contain object-left"
          />
          {user && (
            <div className="ml-auto flex items-center gap-3 pl-4">
              <span className="hidden sm:block max-w-[260px] truncate text-xs font-semibold text-slate-700">{user.email}</span>
              <button
                onClick={handleLogout}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#0055ff] text-white shadow-sm transition hover:bg-[#0047d4] active:scale-95"
                title="Sair"
                aria-label="Sair da conta"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="relative flex-1 flex items-center justify-center px-4 py-8 sm:py-10">
        {!user ? (
          <form
            onSubmit={handleLogin}
            className="w-full max-w-[380px] min-h-[438px] rounded-[34px] px-8 py-9 sm:px-8 flex flex-col"
            style={{
              backgroundColor: "#aaa",
              color: "#222",
              boxShadow: "0 18px 55px rgba(0,0,0,0.16)",
            }}
          >
            <h1 className="mb-7 text-[18px] font-medium tracking-tight">login de acesso</h1>

            {error && (
              <div className="mb-3 rounded-xl border border-red-900/15 bg-red-100/70 px-3 py-2 text-xs font-medium text-red-800" role="alert">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <input
                type="text"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuário"
                aria-label="Usuário ou e-mail"
                className="h-[51px] w-full rounded-full border border-white/70 bg-white px-5 text-[15px] text-[#222] outline-none transition placeholder:text-[#b8b8b8] focus:border-[#0055ff] focus:ring-2 focus:ring-[#0055ff]/15"
              />
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                aria-label="Senha"
                className="h-[51px] w-full rounded-full border border-white/70 bg-white px-5 text-[15px] text-[#222] outline-none transition placeholder:text-[#b8b8b8] focus:border-[#0055ff] focus:ring-2 focus:ring-[#0055ff]/15"
              />
            </div>

            <button
              type="submit"
              disabled={signing}
              className="mt-3 inline-flex h-[51px] w-fit min-w-[101px] items-center justify-center gap-2 rounded-full bg-[#292929] px-7 text-sm font-semibold text-white transition hover:bg-[#111] active:scale-[0.98] disabled:cursor-wait disabled:opacity-60"
            >
              {signing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {signing ? "entrando" : "entrar"}
            </button>

            <div className="mt-auto pt-10 text-[15px] leading-[1.4] tracking-tight text-[#292929]">
              <p className="font-semibold">esqueceu login ou senha?</p>
              <p>fale com o suporte</p>
            </div>
          </form>
        ) : (
          <div className="w-full h-full min-h-[480px] rounded-2xl" style={{ color: "#fff" }}>
            <VmixPage forcedConnected={forcedConnected} />
          </div>
        )}
      </main>

      {/* Nexo brand signature anchored at the lower-left, as in the supplied reference. */}
      <footer className="pointer-events-none absolute bottom-5 sm:bottom-7 left-5 sm:left-8 lg:left-[max(32px,calc((100vw-1656px)/2))] z-10">
        <img src={nexoLogo} alt="Nexo soluções visuais" className="block h-auto w-[104px] sm:w-[119px] object-contain" />
      </footer>
    </div>
  );
}
