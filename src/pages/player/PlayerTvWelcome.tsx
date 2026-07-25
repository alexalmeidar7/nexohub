import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Smartphone } from "lucide-react";
import { extractDominantPair } from "@/lib/dominantColors";

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
  const [artistImg, setArtistImg] = useState<string | null>(null);
  const [presenterImg, setPresenterImg] = useState<string | null>(null);
  const [fallbackImg, setFallbackImg] = useState<string | null>(null);
  const [bgMode, setBgMode] = useState<"artist" | "presenter" | "fallback">("fallback");
  const [presenterColors, setPresenterColors] = useState<{ primary: string; secondary: string } | null>(null);
  const [shortUrl, setShortUrl] = useState<string | null>(null);
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

  // Busca metadata pública da rádio + música tocando + locutor no ar.
  // Faz polling a cada 15s para manter o fundo atualizado.
  useEffect(() => {
    if (!userSlug) return;
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await supabase.functions.invoke("public-player-data", {
          body: { slug: userSlug },
        });
        if (cancelled) return;
        const d = (data || {}) as any;
        const emp = d.empresa || {};
        const nome = emp.nome_empresa || emp.nome || userSlug;
        const logo = emp.logo_url || emp.logo || "";
        setRadioName(String(nome).toUpperCase());
        setRadioLogo(String(logo || ""));

        // Deezer artist image (via dashboard_items, já persistido pelo useGlobalMusicSync)
        const deezer: string | null = d.musicDeezerArtistImg || null;
        const cover: string | null = d.musicData?.capa || null;
        setArtistImg(deezer || cover || null);

        // Locutor no ar
        const presenter = d.currentPresenter?.foto || null;
        setPresenterImg(presenter);

        // Fallback: thumb do programa NO AR ou canal ativo
        const programThumb = d.currentProgram?.thumb || null;
        const channels = Array.isArray(d.channels) ? d.channels : [];
        const channelThumb = channels
          .filter((c: any) => c?.active)
          .map((c: any) => c?.cover_url || c?.background_url || c?.logo_url)
          .find(Boolean) || null;
        setFallbackImg(programThumb || channelThumb || null);
      } catch {
        setRadioName(userSlug.toUpperCase());
      }
    };

    load();
    const iv = setInterval(load, 15000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [userSlug]);

  // Alterna o fundo entre foto do artista (Deezer) e foto do locutor a cada 8s.
  useEffect(() => {
    const options: Array<"artist" | "presenter" | "fallback"> = [];
    if (artistImg) options.push("artist");
    if (presenterImg) options.push("presenter");
    if (options.length === 0) { setBgMode("fallback"); return; }
    if (options.length === 1) { setBgMode(options[0]); return; }
    setBgMode((prev) => (options.includes(prev) ? prev : options[0]));
    const iv = setInterval(() => {
      setBgMode((prev) => {
        const idx = options.indexOf(prev as any);
        return options[(idx + 1) % options.length];
      });
    }, 8000);
    return () => clearInterval(iv);
  }, [artistImg, presenterImg]);

  // Extrai duas cores dominantes da foto do locutor para o gradiente.
  useEffect(() => {
    let cancelled = false;
    if (!presenterImg) { setPresenterColors(null); return; }
    (async () => {
      const pair = await extractDominantPair(presenterImg);
      if (!cancelled) setPresenterColors(pair);
    })();
    return () => { cancelled = true; };
  }, [presenterImg]);


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

  // Encurta a URL para facilitar a digitação no navegador.
  useEffect(() => {
    if (!code) { setShortUrl(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("shorten-url", { body: { url: pairUrl } });
        if (!cancelled && (data as any)?.ok && (data as any)?.short) {
          setShortUrl((data as any).short as string);
        }
      } catch { /* fallback: mantém shortUrl null e mostra URL completa */ }
    })();
    return () => { cancelled = true; };
  }, [code, pairUrl]);


  const activeBg =
    bgMode === "artist" ? artistImg :
    bgMode === "presenter" ? presenterImg :
    fallbackImg;

  const presenterGradient = presenterColors
    ? `radial-gradient(60% 80% at 30% 40%, ${presenterColors.primary} 0%, transparent 70%), radial-gradient(60% 80% at 75% 65%, ${presenterColors.secondary} 0%, transparent 70%), linear-gradient(135deg, ${presenterColors.primary} 0%, ${presenterColors.secondary} 100%)`
    : null;

  return (
    <div className="relative min-h-screen w-full antialiased text-slate-100 overflow-hidden">
      {/* Gradiente elegante atrás da foto do locutor (transição suave) */}
      <div
        className="absolute inset-0 z-0 transition-opacity duration-1000"
        style={{
          opacity: bgMode === "presenter" && presenterGradient ? 1 : 0,
          background: presenterGradient || "transparent",
        }}
        aria-hidden
      />
      {/* Background principal (imagem) */}
      <div className="absolute inset-0 z-0 bg-black">
        {activeBg ? (
          <img
            key={activeBg}
            src={activeBg}
            alt=""
            aria-hidden
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            className={
              bgMode === "presenter"
                ? "absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 h-[95vh] w-auto max-w-none object-contain drop-shadow-2xl animate-fade-in"
                : "ws-kenburns absolute inset-0 w-full h-full object-cover animate-fade-in"
            }
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
        <div className={bgMode === "presenter" ? "absolute inset-0 bg-black/25" : "absolute inset-0 bg-black/55"} />
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
              Ou digite no navegador: <span className="text-white font-tv-bold">{shortUrl ? shortUrl.replace(/^https?:\/\//, "") : `${window.location.host}/${userSlug}/pair`}</span>
            </p>
            <p className="text-tv-caption text-slate-400 mt-tv-1">
              {shortUrl ? "Link encurtado para digitar mais fácil" : ""}
            </p>

            {/* Status */}
            {!claimedName && !error && (
              <div className="mt-tv-6 rounded-2xl bg-white/10 border border-white/15 px-tv-4 py-tv-3 backdrop-blur-md inline-flex items-center gap-tv-3">
                {code ? (
                  <>
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-70"></span>
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-primary"></span>
                    </span>
                    <div>
                      <div className="text-tv-body font-tv-bold">Aguardando pareamento…</div>
                      <div className="text-tv-caption text-slate-300 inline-flex items-center gap-2">
                        <Smartphone className="h-4 w-4" />
                        Abra a câmera do celular no QR code
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <div className="text-tv-body">Gerando código de pareamento…</div>
                  </>
                )}
              </div>
            )}

            {claimedName && (
              <div className="mt-tv-6 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 px-tv-4 py-tv-3 text-emerald-100 backdrop-blur-md inline-flex items-center gap-tv-3">
                <CheckCircle2 className="h-7 w-7 text-emerald-300" />
                <div>
                  <div className="text-tv-body font-tv-bold">Pareado com sucesso!</div>
                  <div className="text-tv-caption opacity-90">Olá, {claimedName}. Entrando no player…</div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-tv-6 rounded-2xl bg-red-500/15 border border-red-400/40 px-tv-4 py-tv-3 text-red-100 backdrop-blur-md inline-flex items-center gap-tv-3">
                <AlertTriangle className="h-6 w-6 text-red-300" />
                <div className="flex-1">
                  <div className="text-tv-body font-tv-bold">Erro ao gerar código</div>
                  <div className="text-tv-caption opacity-90">{error}</div>
                </div>
                <button
                  type="button"
                  onClick={generateCode}
                  className="inline-flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 px-4 py-2 text-tv-caption font-tv-bold"
                >
                  <RefreshCw className="h-4 w-4" /> Tentar novamente
                </button>
              </div>
            )}
          </div>

          {/* Coluna direita: QR + código (com respiro entre eles) */}
          <div className="flex flex-col items-center justify-center">
            <div className="rounded-3xl bg-white p-6 shadow-2xl">
              {code ? (
                <QRCodeSVG value={pairUrl} size={280} level="M" includeMargin={false} />
              ) : (
                <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-3">
                  <Loader2 className="h-10 w-10 animate-spin text-slate-500" />
                  <div className="text-xs text-slate-500">Gerando QR code…</div>
                </div>
              )}
            </div>
            <div className="text-center mt-10">
              <div className="text-tv-caption uppercase tracking-widest text-slate-300">Código de pareamento</div>
              <div className="text-6xl font-tv-bold tracking-[0.4em] mt-3 text-white drop-shadow-lg">
                {code ? code : "----"}
              </div>
              {code && remaining > 0 && (
                <div className="text-tv-caption text-slate-400 mt-3">
                  Expira em <span className="text-white font-tv-bold">{remainingLabel}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-tv-6 text-tv-caption text-slate-400">
          O código expira em 15 minutos e é renovado automaticamente.
        </div>

      </div>
    </div>
  );
}
