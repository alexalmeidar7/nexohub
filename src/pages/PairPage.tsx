import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { getManagedOAuthRedirectUri, setOAuthReturnPath } from "@/lib/oauthReturn";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, RefreshCw, Tv } from "lucide-react";

/**
 * Página mobile de pareamento com a TV. O usuário lê o QR code, faz login com
 * Google, digita/valida o código de 4 dígitos e confirma o pareamento.
 */
export default function PairPage() {
  const { userSlug: rawSlug } = useParams();
  const userSlug = (rawSlug || "").toLowerCase();
  const [sp] = useSearchParams();
  const initialCode = (sp.get("code") || "").replace(/\D/g, "").slice(0, 4);
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [code, setCode] = useState<string>(initialCode);
  const [signingIn, setSigningIn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error" | "expired"; message?: string }>({ kind: "idle" });
  const autoRunRef = useRef(false);

  const canConfirm = useMemo(() => /^\d{4}$/.test(code), [code]);

  const handleGoogleLogin = async () => {
    setSigningIn(true);
    try {
      setOAuthReturnPath(`/${userSlug}/pair${code ? `?code=${code}` : ""}`);
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: getManagedOAuthRedirectUri(),
        extraParams: { prompt: "select_account" },
      });
      if (result.error) {
        setStatus({ kind: "error", message: result.error.message });
        setSigningIn(false);
        return;
      }
      if (result.redirected) return;
      setSigningIn(false);
    } catch (e: any) {
      setStatus({ kind: "error", message: String(e?.message || e) });
      setSigningIn(false);
    }
  };

  const handleGuestContinue = async () => {
    if (!canConfirm) {
      navigate(`/${userSlug}/player?tvGuest=1`);
      return;
    }
    setConfirming(true);
    setStatus({ kind: "idle" });
    try {
      const { data, error } = await supabase.functions.invoke("tv-pair-claim", {
        body: { code, guest: true },
      });
      if (error || !(data as any)?.ok) {
        const reason = (data as any)?.reason;
        if (reason === "code_expired") {
          setStatus({ kind: "expired", message: "O código exibido na TV expirou. Gere um novo código na TV e tente novamente." });
          return;
        }
        setStatus({ kind: "error", message: "Não foi possível entrar como visitante nesta TV. Confira o código e tente novamente." });
        return;
      }
      setStatus({ kind: "ok", message: "Visitante confirmado! A TV vai abrir o splash e mostrar o perfil de visitante." });
      navigate(`/${userSlug}/player?tvGuest=1`, { replace: true });
    } catch (e: any) {
      setStatus({ kind: "error", message: String(e?.message || e) });
    } finally {
      setConfirming(false);
    }
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setConfirming(true);
    setStatus({ kind: "idle" });
    try {
      const { data, error } = await supabase.functions.invoke("tv-pair-claim", { body: { code } });
      if (error || !(data as any)?.ok) {
        const reason = (data as any)?.reason;
        if (reason === "code_expired") {
          setStatus({ kind: "expired", message: "O código exibido na TV expirou. Toque em \"Gerar novo código\" na TV e digite os novos 4 dígitos aqui." });
          setConfirming(false);
          return;
        }
        const map: Record<string, string> = {
          invalid_code: "Código inválido. Confira os 4 dígitos exibidos na TV.",
          code_not_found: "Código não encontrado. Gere um novo na TV.",
          code_already_used: "Este código já foi usado em outro dispositivo.",
          not_authenticated: "Faça login com o Google para continuar.",
        };
        setStatus({ kind: "error", message: map[reason] || "Não foi possível parear. Verifique sua conexão e tente novamente." });
        setConfirming(false);
        return;
      }
      setStatus({ kind: "ok", message: "TV pareada com sucesso! Você já pode fechar esta página — a TV entrará no player em instantes." });
    } catch (e: any) {
      setStatus({ kind: "error", message: String(e?.message || e) });
    } finally {
      setConfirming(false);
    }
  };

  // Registra evento "scanned" quando a página é aberta com um código (via QR code).
  useEffect(() => {
    if (!initialCode || !userSlug) return;
    supabase.functions.invoke("tv-pair-track", {
      body: { event: "scanned", code: initialCode, userSlug, meta: { referrer: document.referrer || null } },
    }).catch(() => { /* fire-and-forget */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Se voltou do Google já com code + sessão, tenta parear automaticamente uma vez.
  useEffect(() => {
    if (loading || !user || !canConfirm || autoRunRef.current) return;
    autoRunRef.current = true;
    handleConfirm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user, canConfirm]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center justify-center px-6 py-10">
      <div className="w-full max-w-md rounded-3xl bg-white/5 backdrop-blur-md border border-white/10 p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-11 w-11 rounded-2xl bg-primary/20 flex items-center justify-center">
            <Tv className="h-6 w-6 text-primary" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-slate-400">Parear TV</div>
            <div className="text-lg font-semibold">{userSlug.toUpperCase()}</div>
          </div>
        </div>

        <p className="text-sm text-slate-300 mb-5">
          Faça login com sua conta Google e confirme o código que aparece na sua TV.
        </p>

        {loading && (
          <div className="mb-4 rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3 text-sm text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" /> Verificando sessão…
          </div>
        )}

        {/* Login */}
        {!user ? (
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={signingIn}
            className="w-full flex items-center justify-center gap-3 rounded-xl bg-white text-slate-900 font-semibold py-3 hover:bg-slate-100 transition disabled:opacity-60"
          >
            {signingIn ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
                  <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.2 17.7 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 2.8-2.2 5.2-4.7 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/>
                  <path fill="#FBBC05" d="M10.4 28.7A14.6 14.6 0 0 1 9.5 24c0-1.7.3-3.2.9-4.7l-7.8-6A24 24 0 0 0 0 24c0 3.9.9 7.6 2.6 10.9l7.8-6.2z"/>
                  <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.4-5.8c-2.1 1.4-4.8 2.3-8.6 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.8 6C6.5 42.6 14.6 48 24 48z"/>
                </svg>
                Entrar com Google
              </>
            )}
          </button>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 flex items-center gap-3 mb-4">
            {user.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url as string} alt="" className="h-9 w-9 rounded-full" />
            ) : (
              <div className="h-9 w-9 rounded-full bg-primary/30" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold truncate">
                {(user.user_metadata?.full_name as string) || user.email}
              </div>
              <div className="text-xs text-slate-400 truncate">{user.email}</div>
            </div>
          </div>
        )}

        {/* Código */}
        <div className="mt-5">
          <label className="text-xs uppercase tracking-widest text-slate-400">Código da TV</label>
          <input
            type="text"
            inputMode="numeric"
            pattern="\d*"
            maxLength={4}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
              if (status.kind === "expired" || status.kind === "error") setStatus({ kind: "idle" });
              autoRunRef.current = false;
            }}
            placeholder="0000"
            className="mt-1 w-full text-center text-4xl tracking-[0.5em] font-bold bg-white/5 border border-white/10 rounded-xl py-4 outline-none focus:border-primary/60"
          />
        </div>

        <button
          type="button"
          disabled={!user || !canConfirm || confirming || status.kind === "ok" || status.kind === "expired"}
          onClick={handleConfirm}
          className="mt-4 w-full rounded-xl bg-primary text-primary-foreground font-semibold py-3 disabled:opacity-50 hover:brightness-110 transition inline-flex items-center justify-center gap-2"
        >
          {confirming ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Pareando com a TV…
            </>
          ) : status.kind === "ok" ? (
            <>
              <CheckCircle2 className="h-4 w-4" /> Pareado
            </>
          ) : (
            "Confirmar pareamento"
          )}
        </button>

        {status.kind === "ok" && (
          <div className="mt-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-100 text-sm px-4 py-3 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 text-emerald-300 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Pareado com sucesso!</div>
              <div className="opacity-90 mt-0.5">{status.message}</div>
            </div>
          </div>
        )}
        {status.kind === "error" && (
          <div className="mt-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-100 text-sm px-4 py-3 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-red-300 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">Não foi possível parear</div>
              <div className="opacity-90 mt-0.5">{status.message}</div>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!user || !canConfirm || confirming}
                className="mt-2 text-xs font-semibold underline underline-offset-2 hover:text-white disabled:opacity-50"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        )}
        {status.kind === "expired" && (
          <div className="mt-4 rounded-xl bg-amber-500/10 border border-amber-500/40 text-amber-100 text-sm px-4 py-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-300 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold">Código expirado</div>
              <div className="opacity-90 mt-0.5">{status.message}</div>
              <button
                type="button"
                onClick={() => { setCode(""); setStatus({ kind: "idle" }); autoRunRef.current = false; }}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 border border-amber-400/40 text-amber-50 px-3 py-1.5 text-xs font-semibold"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Digitar novo código
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="mt-6 w-full text-xs text-slate-400 hover:text-slate-200"
          onClick={handleGuestContinue}
          disabled={confirming || status.kind === "expired"}
        >
          Entrar como visitante
        </button>
      </div>
    </div>
  );
}
