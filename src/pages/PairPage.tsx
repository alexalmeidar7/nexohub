/* NEXO_PAIR_CHAT_MESCLADO_V6: pareamento completo TV + chat separado */
import TvChatPhone from "@/components/player/tv/TvChatPhone";
import { useParams as useNexoChatSlug, useSearchParams as useNexoChatQuery } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { clearSignOutFlag } from "@/hooks/useAuth";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getManagedOAuthRedirectUri, setOAuthReturnPath } from "@/lib/oauthReturn";
import { CheckCircle2, Loader2, Tv, ArrowRight, ShieldCheck } from "lucide-react";

/**
 * Página mobile de pareamento com a TV. O usuário lê o QR code, faz login com
 * Google, digita/valida o código de 4 dígitos e confirma o pareamento.
 */
function PairPage() {
  const { userSlug: rawSlug } = useParams();
  const userSlug = (rawSlug || "").toLowerCase();
  const [sp] = useSearchParams();
  const initialCode = (sp.get("code") || "").replace(/\D/g, "").slice(0, 4);

  const { user, loading } = useAuth();

  const [code, setCode] = useState<string>(initialCode);
  const [signingIn, setSigningIn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [completedAsGuest, setCompletedAsGuest] = useState(false);
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
      setStatus({ kind: "error", message: "Digite o código exibido na TV para continuar como visitante." });
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
      setCompletedAsGuest(true);
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

  const done = status.kind === "ok";
  const displayName = completedAsGuest ? "Visitante" : String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Ouvinte");
  const avatar = !completedAsGuest && (user?.user_metadata?.avatar_url || user?.user_metadata?.picture);

  return (
    <main className="min-h-[100svh] bg-[#08090d] text-white px-5 py-8 flex items-center justify-center">
      <section className="w-full max-w-[420px] space-y-7">
        <header className="flex items-center justify-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#f20d0f] flex items-center justify-center"><Tv className="w-6 h-6" /></div>
          <div><p className="text-[11px] tracking-[0.22em] font-bold text-white/55">NEXO PLAYER</p><p className="font-bold text-lg leading-tight">{userSlug.toUpperCase()}</p></div>
        </header>

        <div className="flex items-center justify-center gap-2" aria-label="Etapas do pareamento">
          {["Login", "Código", "Concluído"].map((label, index) => {
            const active = done ? 2 : user ? 1 : 0;
            return <div key={label} className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center ${index <= active ? "bg-[#f20d0f] text-white" : "bg-white/10 text-white/40"}`}>{index < active ? "✓" : index + 1}</span>
              <span className={`text-xs ${index === active ? "text-white" : "text-white/40"}`}>{label}</span>
              {index < 2 && <span className="w-3 h-px bg-white/20" />}
            </div>;
          })}
        </div>

        {done ? (
          <div className="text-center space-y-5" role="status">
            <div className="mx-auto w-20 h-20 rounded-full bg-[#f20d0f]/15 flex items-center justify-center"><CheckCircle2 className="w-12 h-12 text-[#ff3638]" /></div>
            <div><h1 className="text-3xl font-extrabold">Tudo pronto!</h1><p className="text-white/60 mt-2">Sua TV foi pareada com sucesso.</p></div>
            <div className="bg-[#17191f] rounded-3xl p-6 flex flex-col items-center gap-3">
              {avatar ? <img src={String(avatar)} alt="" className="w-16 h-16 rounded-full object-cover" /> : <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-2xl font-bold">{displayName.charAt(0).toUpperCase()}</div>}
              <p className="text-xl font-bold">{displayName}</p><p className="text-sm text-white/55">Seu perfil está sendo exibido na TV.</p>
            </div>
            <p className="text-sm text-white/60">Pode fechar esta página e continuar pela televisão.</p>
          </div>
        ) : (
          <>
            <div className="text-center space-y-2">
              <h1 className="text-3xl font-extrabold tracking-tight">{user ? "Confirme sua TV" : "Conecte sua conta"}</h1>
              <p className="text-white/60 text-sm leading-relaxed">{user ? "Confira o código de 4 dígitos exibido na televisão." : "Entre com sua conta Google para levar seu perfil ao Nexo Player na TV."}</p>
            </div>
            {!user ? (
              <button type="button" onClick={handleGoogleLogin} disabled={signingIn || loading} className="w-full h-14 rounded-2xl bg-white text-[#16181d] font-bold flex items-center justify-center gap-3 disabled:opacity-50">
                {signingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <span className="font-extrabold text-xl text-[#4285f4]">G</span>}
                Continuar com Google
              </button>
            ) : (
              <div className="flex items-center gap-3 bg-[#17191f] p-4 rounded-2xl">
                {avatar ? <img src={String(avatar)} alt="" className="w-11 h-11 rounded-full object-cover" /> : <div className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center font-bold">{displayName.charAt(0).toUpperCase()}</div>}
                <div className="min-w-0 flex-1"><p className="font-semibold truncate">{displayName}</p><p className="text-xs text-white/50 truncate">{user.email}</p></div>
                <CheckCircle2 className="w-5 h-5 text-[#ff3638]" />
              </div>
            )}
            <div className="bg-[#17191f] rounded-3xl p-6 space-y-4">
              <label htmlFor="tv-pair-code" className="block text-center text-xs font-semibold uppercase tracking-[0.15em] text-white/60">Código da televisão</label>
              <input id="tv-pair-code" type="text" inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" maxLength={4} value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0,4)); setStatus({kind:"idle"}); autoRunRef.current=false; }} placeholder="0000" aria-label="Código de pareamento de quatro dígitos" className="w-full bg-transparent text-center text-5xl font-black tracking-[0.25em] outline-none placeholder:text-white/15" />
              <p className="text-center text-xs text-white/40">O código aparece na tela de pareamento da TV.</p>
            </div>
            <button type="button" onClick={handleConfirm} disabled={!user || !canConfirm || confirming || loading} className="w-full h-14 rounded-2xl bg-[#f20d0f] text-white font-bold flex items-center justify-center gap-2 disabled:opacity-40">
              {confirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              {confirming ? "Conectando..." : "Confirmar pareamento"}
            </button>
            {(status.kind === "error" || status.kind === "expired") && <div role="alert" className="rounded-2xl bg-red-500/10 p-4 text-sm text-red-200">{status.message}<button type="button" className="block mt-2 font-semibold underline" onClick={() => {setStatus({kind:"idle"}); autoRunRef.current=false;}}>Tentar novamente</button></div>}
            <button type="button" onClick={handleGuestContinue} disabled={confirming} className="w-full text-center text-sm font-semibold text-white/65 py-2">Entrar como visitante</button>
          </>
        )}
        <footer className="flex items-center justify-center gap-2 text-xs text-white/35"><ShieldCheck className="w-4 h-4" /> Conexão segura com Nexo Player</footer>
      </section>
    </main>
  );
}

export default function NexoPairPageRoute() {
  const { userSlug: rawSlug } = useNexoChatSlug();
  const [chatQuery] = useNexoChatQuery();
  if (chatQuery.get("mode") === "chat") {
    return <TvChatPhone userSlug={(rawSlug || "").toLowerCase()} />;
  }
  return <PairPage />;
}
