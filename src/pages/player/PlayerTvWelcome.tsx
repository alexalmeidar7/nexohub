import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";

/**
 * Tela de "Bem-vindo" para acesso via TV: gera um código de 4 dígitos e um
 * QR code que aponta para /:userSlug/pair?code=XXXX. Ao ser confirmado no
 * celular, um canal Realtime notifica esta tela para entrar no player.
 */
export default function PlayerTvWelcome() {
  const { userSlug: rawSlug } = useParams();
  const userSlug = (rawSlug || "").toLowerCase();
  const navigate = useNavigate();

  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radioName, setRadioName] = useState<string>("");
  const [radioLogo, setRadioLogo] = useState<string>("");
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null);
  const [claimedName, setClaimedName] = useState<string | null>(null);
  const tvSessionId = useMemo(() => {
    try {
      const k = `nexohub_tv_session_${userSlug}`;
      let v = localStorage.getItem(k);
      if (!v) {
        v = crypto.randomUUID();
        localStorage.setItem(k, v);
      }
      return v;
    } catch {
      return crypto.randomUUID();
    }
  }, [userSlug]);
  const claimedRef = useRef(false);

  // Busca metadata pública da rádio + background (mesma lógica do WelcomeScreen:
  // thumb do programa NO AR agora, com fallback para thumb do canal ativo).
  useEffect(() => {
    if (!userSlug) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("public-player-data", {
          body: { slug: userSlug },
        });
        const emp = (data as any)?.empresa || {};
        const nome = emp.nome_empresa || emp.nome || userSlug;
        const logo = emp.logo_url || emp.logo || "";
        setRadioName(String(nome).toUpperCase());
        setRadioLogo(String(logo || ""));

        // Pick program thumb (current program NO AR)
        const now = new Date();
        const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const dayCode = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"][now.getDay()];
        const programas = Array.isArray((data as any)?.programas) ? (data as any).programas : [];
        const current = programas.find((p: any) => {
          if (!p?.ativo) return false;
          const dias = Array.isArray(p.dias_semana) ? p.dias_semana : [];
          if (dias.length && !dias.map((d: any) => String(d).toLowerCase()).includes(dayCode)) return false;
          const ini = String(p.horario_inicio || "").slice(0, 5);
          const fim = String(p.horario_fim || "").slice(0, 5);
          if (!ini || !fim) return false;
          return ini <= fim ? hhmm >= ini && hhmm <= fim : hhmm >= ini || hhmm <= fim;
        });
        const programThumb = current?.thumb || null;

        // Fallback: primeiro canal ativo com thumb.
        const channels = Array.isArray((data as any)?.channels) ? (data as any).channels : [];
        const channelThumb = channels
          .filter((c: any) => c?.active)
          .map((c: any) => c?.cover_url || c?.background_url || c?.logo_url)
          .find(Boolean) || null;

        setBackgroundUrl(programThumb || channelThumb || null);
      } catch {
        setRadioName(userSlug.toUpperCase());
      }
    })();
  }, [userSlug]);

  // Gera código de pareamento.
  const generateCode = useCallback(async () => {
    if (!userSlug) return;
    setError(null);
    setCode(null);
    setExpiresAt(null);
    const { data, error: fnErr } = await supabase.functions.invoke("tv-pair-create", {
      body: { userSlug, tvSessionId },
    });
    if (fnErr || !data?.ok) {
      setError("Não foi possível gerar o código. Verifique sua conexão e tente novamente.");
      return;
    }
    setCode(data.code);
    setExpiresAt(data.expiresAt);
  }, [userSlug, tvSessionId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await generateCode();
    })();
    return () => { cancelled = true; };
  }, [generateCode]);

  // Escuta Realtime aguardando o claim.
  useEffect(() => {
    if (!code) return;
    const channel = supabase
      .channel(`tv-pair-${code}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tv_pairing_codes", filter: `code=eq.${code}` },
        (payload: any) => {
          const row = payload?.new;
          if (!row || claimedRef.current) return;
          if (row.status === "claimed") {
            claimedRef.current = true;
            try {
              const guest = {
                name: row.paired_name || row.paired_email || "Convidado",
                email: row.paired_email || null,
                avatar_url: row.paired_avatar || "/avatars/usr-default.png",
                pairedAt: Date.now(),
              };
              localStorage.setItem(`nexohub_tv_guest_${userSlug}`, JSON.stringify(guest));
            } catch { /* ignore */ }
            setClaimedName(row.paired_name || row.paired_email || "Convidado");
            setTimeout(() => {
              navigate(`/${userSlug}/player`, { replace: true });
            }, 1800);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [code, userSlug, navigate]);

  // Countdown de expiração (mm:ss) + regenera automaticamente.
  const [remaining, setRemaining] = useState<number>(0);
  useEffect(() => {
    if (!expiresAt) { setRemaining(0); return; }
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) {
        generateCode();
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [expiresAt, generateCode]);

  const remainingLabel = useMemo(() => {
    const s = Math.floor(remaining / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }, [remaining]);


  const pairUrl = code
    ? `${window.location.origin}/${userSlug}/pair?code=${code}`
    : `${window.location.origin}/${userSlug}/pair`;

  return (
    <div className="relative min-h-screen w-full antialiased text-slate-100 overflow-hidden">
      {/* Background: mesma imagem da WelcomeScreen (thumb do programa/canal) */}
      <div className="absolute inset-0 z-0 bg-black">
        {backgroundUrl ? (
          <img
            src={backgroundUrl}
            alt=""
            aria-hidden
            className="ws-kenburns absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 60%, hsl(var(--background)) 100%)",
            }}
          />
        )}
        {/* Escurecimento para legibilidade */}
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />
      </div>

      {/* Conteúdo */}
      <div className="relative z-10 flex flex-col p-tv-safe min-h-screen">
        {/* Cabeçalho: apenas a logo, sem texto "PLAYER ..." */}
        <div className="flex items-center">
          {radioLogo ? (
            <img
              src={radioLogo}
              alt={radioName}
              className="h-24 w-24 rounded-2xl object-contain bg-white/10 backdrop-blur-md p-2 border border-white/10 shadow-xl"
            />
          ) : null}
        </div>

        {/* Corpo */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-tv-6 items-center mt-tv-8">
          {/* Coluna esquerda: mensagem */}
          <div className="max-w-2xl">
            <div className="text-tv-h2 font-tv-bold leading-tight drop-shadow-lg">
              Bem-vindo ao player da <span className="text-primary">{radioName || userSlug.toUpperCase()}</span>.
            </div>
            <p className="text-tv-body text-slate-200 mt-tv-3 drop-shadow-md">
              Para uma melhor interação, faça login lendo o QR code ao lado com a câmera do seu celular.
            </p>
            <p className="text-tv-caption text-slate-300 mt-tv-2">
              Ou digite no navegador: <span className="text-white font-medium">{window.location.host}/{userSlug}/pair</span>
            </p>

            {claimedName && (
              <div className="mt-tv-6 rounded-2xl bg-emerald-500/15 border border-emerald-400/30 px-tv-4 py-tv-3 text-emerald-100 backdrop-blur-md">
                <div className="text-tv-body font-tv-bold">Olá, {claimedName}!</div>
                <div className="text-tv-caption opacity-80">Entrando no player…</div>
              </div>
            )}
          </div>

          {/* Coluna direita: QR + código (com respiro entre eles) */}
          <div className="flex flex-col items-center justify-center">
            <div className="rounded-3xl bg-white p-6 shadow-2xl">
              {code ? (
                <QRCodeSVG value={pairUrl} size={280} level="M" includeMargin={false} />
              ) : (
                <div className="w-[280px] h-[280px] flex items-center justify-center">
                  <Loader2 className="h-10 w-10 animate-spin text-slate-500" />
                </div>
              )}
            </div>
            <div className="text-center mt-10">
              <div className="text-tv-caption uppercase tracking-widest text-slate-300">Código de pareamento</div>
              <div className="text-6xl font-tv-bold tracking-[0.4em] mt-3 text-white drop-shadow-lg">
                {code ? code : "----"}
              </div>
            </div>
            {error && <div className="text-tv-caption text-red-300 mt-3">{error}</div>}
          </div>
        </div>

        <div className="mt-tv-6 text-tv-caption text-slate-400">
          O código expira em 15 minutos. Gere um novo aguardando a atualização automática.
        </div>
      </div>
    </div>
  );
}
