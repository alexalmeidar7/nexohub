import { useEffect, useMemo, useRef, useState } from "react";
import { clearSignOutFlag } from "@/hooks/useAuth";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
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
      clearSignOutFlag();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getManagedOAuthRedirectUri(), queryParams: { prompt: "select_account" } },
      });
      if (error) {
        setStatus({ kind: "error", message: error.message });
        setSigningIn(false);
        return;
      }
      if (data?.url) return;
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
    <main className="min-h-[100svh] w-full overflow-x-hidden bg-[#09030b] text-white flex items-center justify-center px-4 py-8">
      <section className="w-full max-w-xl flex flex-col items-center text-center gap-5">
        <div className="flex flex-col items-center gap-2">
          <div className="text-[11px] font-bold uppercase tracking-[0.35em] text-white/55">NEXO PLAYER</div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight">{userSlug.toUpperCase()}</div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-4xl font-extrabold leading-tight">Estamos quase conectados!</h1>
          <p className="text-sm sm:text-lg text-white/75 max-w-md mx-auto">
            Faça login com sua conta Google e confirme o código que aparece na sua TV.
          </p>
        </div>

        {!user ? (
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={signingIn}
            className="w-full max-w-lg min-h-24 rounded-[28px] bg-primary text-primary-foreground flex flex-col items-center justify-center gap-2 text-xl font-bold shadow-xl disabled:opacity-60"
          >
            {signingIn ? <Loader2 className="h-8 w-8 animate-spin" /> : (
              <>
                <svg width="30" height="30" viewBox="0 0 48 48" aria-hidden>
                  <path fill="currentColor" d="M24 9.5c3.5 0 6.6 1.2 9 3.2l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6C12.3 13.2 17.7 9.5 24 9.5z"/>
                  <path fill="currentColor" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 2.8-2.2 5.2-4.7 6.9l7.4 5.8c4.3-4 6.9-9.9 6.9-17.2z"/>
                </svg>
                <span>Login com Google</span>
              </>
            )}
          </button>
        ) : (
          <div className="w-full max-w-lg rounded-2xl bg-white/10 border border-white/15 p-4 flex items-center gap-3 text-left">
            {user.user_metadata?.avatar_url ? (
              <img src={user.user_metadata.avatar_url as string} alt="" className="h-12 w-12 rounded-full object-cover" />
            ) : <div className="h-12 w-12 rounded-full bg-white/15" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold truncate">{(user.user_metadata?.full_name as string) || user.email}</p>
              <p className="text-sm text-white/60 truncate">{user.email}</p>
            </div>
            <CheckCircle2 className="h-6 w-6 text-primary shrink-0" />
          </div>
        )}

        <div className="w-full max-w-lg rounded-[30px] bg-white text-[#100914] px-5 py-5 sm:px-8 sm:py-7 shadow-2xl">
          <label htmlFor="tv-pair-code" className="block text-xs font-bold uppercase tracking-[0.3em] text-black/50 mb-2">Código da sua TV</label>
          <input
            id="tv-pair-code"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="one-time-code"
            maxLength={4}
            value={code}
            onChange={(e) => {
              setCode(e.target.value.replace(/\D/g, "").slice(0, 4));
              if (status.kind === "expired" || status.kind === "error") setStatus({ kind: "idle" });
              autoRunRef.current = false;
            }}
            placeholder="0000"
            aria-label="Código de pareamento de quatro dígitos"
            className="w-full min-w-0 bg-transparent text-center text-6xl sm:text-8xl font-black tracking-[0.12em] leading-none outline-none placeholder:text-black/15"
          />
        </div>

        <button
          type="button"
          disabled={!user || !canConfirm || confirming || status.kind === "ok" || status.kind === "expired"}
          onClick={handleConfirm}
          className="w-full max-w-lg rounded-full bg-primary text-primary-foreground font-bold text-lg py-4 disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {confirming ? <><Loader2 className="h-5 w-5 animate-spin" /> Conectando à TV…</> : status.kind === "ok" ? <><CheckCircle2 className="h-5 w-5" /> Pareado com sucesso!</> : "Confirmar pareamento"}
        </button>

        {status.kind === "ok" && (
          <div className="w-full max-w-lg text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 font-bold">
              <CheckCircle2 className="h-6 w-6" /> Uhu!! Pareado com sucesso!
            </div>
            <p className="mt-3 text-sm text-white/75">Você já pode fechar esta página. A TV entrará no player em instantes.</p>
          </div>
        )}
        {(status.kind === "error" || status.kind === "expired") && (
          <div className="w-full max-w-lg rounded-2xl bg-white/10 border border-white/15 p-4 text-left">
            <div className="font-bold">{status.kind === "expired" ? "Código expirado" : "Não foi possível parear"}</div>
            <p className="mt-1 text-sm text-white/75">{status.message}</p>
            <button type="button" onClick={() => { setStatus({ kind: "idle" }); if (status.kind === "expired") setCode(""); autoRunRef.current = false; }} className="mt-3 text-sm font-bold underline underline-offset-4">Tentar novamente</button>
          </div>
        )}

        <button type="button" className="text-sm text-white/55 underline underline-offset-4" onClick={handleGuestContinue} disabled={confirming || status.kind === "expired"}>
          Entrar como visitante
        </button>
      </section>
    </main>
  );
}
