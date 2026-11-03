import { useEffect, useState } from "react";
import { clearSignOutFlag } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentReturnPath, getManagedOAuthRedirectUri, setOAuthReturnPath } from "@/lib/oauthReturn";
import { CheckCircle2, XCircle, Loader2, LogOut, RefreshCw, Mail, User as UserIcon, Shield, Clock } from "lucide-react";

type UserInfo = {
  id: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  provider: string | null;
  emailVerified: boolean;
  lastSignIn: string | null;
  createdAt: string | null;
};

/**
 * Página mobile para o usuário conferir se o login com Google funcionou.
 * Mostra estado de sucesso + detalhes da conta, com opções de tentar novamente ou sair.
 */
export default function GoogleCheckPage() {
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [user, setUser] = useState<UserInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadSession = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      const u = data?.user;
      if (!u) {
        setUser(null);
        return;
      }
      const meta = (u.user_metadata || {}) as Record<string, any>;
      const providers: string[] = (u.app_metadata as any)?.providers || [];
      const provider = (u.app_metadata as any)?.provider || providers[0] || null;
      setUser({
        id: u.id,
        email: u.email ?? null,
        name: meta.full_name || meta.name || null,
        avatar: meta.avatar_url || meta.picture || null,
        provider,
        emailVerified: Boolean(u.email_confirmed_at || meta.email_verified),
        lastSignIn: u.last_sign_in_at ?? null,
        createdAt: u.created_at ?? null,
      });
    } catch (e: any) {
      setError(String(e?.message || e));
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSession();
    const { data: sub } = supabase.auth.onAuthStateChange(() => loadSession());
    return () => sub.subscription.unsubscribe();
  }, []);

  const handleLogin = async () => {
    setSigningIn(true);
    setError(null);
    try {
      setOAuthReturnPath(getCurrentReturnPath());
      clearSignOutFlag();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getManagedOAuthRedirectUri(), queryParams: { prompt: "select_account" } },
      });
      if (error) throw error;
      if (data?.url) return;
      setSigningIn(false);
    } catch (e: any) {
      setError(String(e?.message || e));
      setSigningIn(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-50 flex items-start sm:items-center justify-center p-4">
      <div className="w-full max-w-md">
        <header className="text-center mb-6 pt-4">
          <h1 className="text-2xl font-bold">Verificação de login Google</h1>
          <p className="text-sm text-slate-400 mt-1">
            Confirme se sua conta foi autenticada corretamente.
          </p>
        </header>

        {loading ? (
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-8 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-cyan-400" />
            <p className="text-sm text-slate-400">Verificando sessão…</p>
          </div>
        ) : user ? (
          <div className="rounded-2xl bg-slate-900/70 border border-emerald-500/30 shadow-lg shadow-emerald-500/5 overflow-hidden">
            <div className="bg-emerald-500/10 border-b border-emerald-500/20 p-5 flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 shrink-0" />
              <div>
                <div className="font-semibold text-emerald-300">Login realizado com sucesso</div>
                <div className="text-xs text-emerald-300/70">
                  Você está autenticado{user.provider ? ` via ${user.provider}` : ""}.
                </div>
              </div>
            </div>

            <div className="p-5 flex flex-col items-center gap-3 border-b border-slate-800">
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name || user.email || "Avatar"}
                  className="w-20 h-20 rounded-full border-2 border-slate-700 object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-slate-700 flex items-center justify-center">
                  <UserIcon className="w-10 h-10 text-slate-500" />
                </div>
              )}
              <div className="text-center">
                <div className="font-semibold text-lg leading-tight">{user.name || "Sem nome"}</div>
                <div className="text-sm text-slate-400">{user.email || "sem email"}</div>
              </div>
            </div>

            <dl className="p-5 text-sm space-y-3">
              <Row icon={<Mail className="w-4 h-4" />} label="Email verificado">
                {user.emailVerified ? (
                  <span className="text-emerald-400">Sim</span>
                ) : (
                  <span className="text-amber-400">Não</span>
                )}
              </Row>
              <Row icon={<Shield className="w-4 h-4" />} label="Provedor">
                <span className="capitalize">{user.provider || "—"}</span>
              </Row>
              <Row icon={<Clock className="w-4 h-4" />} label="Último login">
                {fmtDate(user.lastSignIn)}
              </Row>
              <Row icon={<Clock className="w-4 h-4" />} label="Conta criada">
                {fmtDate(user.createdAt)}
              </Row>
              <Row icon={<UserIcon className="w-4 h-4" />} label="ID">
                <span className="font-mono text-xs break-all text-slate-400">{user.id}</span>
              </Row>
            </dl>

            <div className="p-5 pt-0 flex gap-2">
              <button
                onClick={loadSession}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium transition"
              >
                <RefreshCw className="w-4 h-4" /> Atualizar
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 text-sm font-medium transition"
              >
                <LogOut className="w-4 h-4" /> Sair
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl bg-slate-900/70 border border-slate-800 p-6 flex flex-col items-center gap-4">
            <XCircle className="w-10 h-10 text-slate-500" />
            <div className="text-center">
              <div className="font-semibold">Nenhum login ativo</div>
              <p className="text-sm text-slate-400 mt-1">
                Faça login com sua conta Google para verificar os detalhes.
              </p>
            </div>
            <button
              onClick={handleLogin}
              disabled={signingIn}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white text-slate-900 hover:bg-slate-100 font-semibold transition disabled:opacity-60"
            >
              {signingIn ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.1A6.98 6.98 0 0 1 5.47 12c0-.73.13-1.44.37-2.1V7.06H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
                </svg>
              )}
              Entrar com Google
            </button>
            {error && (
              <div className="w-full text-xs text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg p-3">
                {error}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-slate-500 mt-6">
          Precisa trocar de conta? Toque em <strong>Sair</strong> e entre novamente.
        </p>
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="flex items-center gap-2 text-slate-400 shrink-0">
        {icon}
        <span>{label}</span>
      </dt>
      <dd className="text-right text-slate-200">{children}</dd>
    </div>
  );
}
