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
  const [musicTitle, setMusicTitle] = useState<string>("");
  const [musicArtist, setMusicArtist] = useState<string>("");
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
        setMusicTitle(String(d.musicData?.titulo || "").trim());
        setMusicArtist(String(d.musicData?.artista || "").trim());

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
    }, 5000);
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

  // Countdown de expiração (mm:ss). Ao chegar em 0 marca como expirado (não
  // regenera automaticamente — usuário precisa clicar em "Gerar novo código").
  const [remaining, setRemaining] = useState<number>(0);
  const [expired, setExpired] = useState<boolean>(false);
  useEffect(() => {
    if (!expiresAt) { setRemaining(0); return; }
    setExpired(false);
    let firedExpired = false;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setRemaining(Math.max(0, ms));
      if (ms <= 0) {
        setExpired(true);
        if (!firedExpired && code) {
          firedExpired = true;
          supabase.functions.invoke("tv-pair-track", {
            body: { event: "expired", code, userSlug, tvSessionId, reason: "countdown_reached_zero" },
          }).catch(() => { /* fire-and-forget */ });
        }
      }
    };
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, [expiresAt, code, userSlug, tvSessionId]);

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

  // Cross-fade entre imagens de fundo: mantemos a camada anterior visível
  // enquanto a nova entra suavemente (opacity 0 → 1), depois removemos a antiga.
  const [loadedBg, setLoadedBg] = useState<string | null>(null);
  const [loadedMode, setLoadedMode] = useState<"artist" | "presenter" | "fallback">("fallback");
  const [prevBg, setPrevBg] = useState<string | null>(null);
  const [prevMode, setPrevMode] = useState<"artist" | "presenter" | "fallback">("fallback");
  const [pendingReady, setPendingReady] = useState(false);
  useEffect(() => {
    if (!activeBg) { setPendingReady(false); return; }
    if (activeBg === loadedBg) { setPendingReady(true); return; }
    setPendingReady(false);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.referrerPolicy = "no-referrer";
    let cancelled = false;
    let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    img.onload = () => {
      if (cancelled) return;
      // Move a imagem atual para a camada "prev" para que ela permaneça
      // visível enquanto a nova entra por cima com opacity animada.
      setPrevBg(loadedBg);
      setPrevMode(loadedMode);
      setLoadedBg(activeBg);
      setLoadedMode(bgMode);
      setPendingReady(true);
      // Após o crossfade terminar, descarta a camada antiga para não
      // acumular <img> na árvore e liberar a animação Ken Burns.
      cleanupTimer = setTimeout(() => {
        if (!cancelled) setPrevBg(null);
      }, 1200);
    };
    img.onerror = () => { if (!cancelled) setPendingReady(false); };
    img.src = activeBg;
    return () => {
      cancelled = true;
      if (cleanupTimer) clearTimeout(cleanupTimer);
    };
  }, [activeBg, bgMode, loadedBg, loadedMode]);

  const presenterGradient = presenterColors
    ? `radial-gradient(60% 80% at 30% 40%, ${presenterColors.primary} 0%, transparent 70%), radial-gradient(60% 80% at 75% 65%, ${presenterColors.secondary} 0%, transparent 70%), linear-gradient(135deg, ${presenterColors.primary} 0%, ${presenterColors.secondary} 100%)`
    : null;

  // Nenhuma imagem disponível (nem artista, nem locutor, nem thumb de programa/canal):
  // ativa um fallback estático elegante — sem shimmer infinito.
  const hasAnyImage = Boolean(artistImg || presenterImg || fallbackImg);
  const showSkeleton = hasAnyImage && !loadedBg && (!activeBg || !pendingReady);
  const showStaticFallback = !hasAnyImage;

  return (
    <div className="relative min-h-screen w-full antialiased text-slate-100 overflow-hidden">
      {/* Zoom in/out bem lento (Ken Burns) para a imagem de fundo */}
      <style>{`
        @keyframes tv-kenburns {
          0%   { transform: scale(1.02); }
          50%  { transform: scale(1.18); }
          100% { transform: scale(1.02); }
        }
        .tv-kenburns {
          animation: tv-kenburns 40s ease-in-out infinite;
          transform-origin: center center;
          will-change: transform;
        }
        .tv-kenburns--contain {
          animation-name: tv-kenburns-contain;
        }
        @keyframes tv-kenburns-contain {
          0%   { transform: translate(-50%, -50%) scale(1.00); }
          50%  { transform: translate(-50%, -50%) scale(1.10); }
          100% { transform: translate(-50%, -50%) scale(1.00); }
        }
        @media (prefers-reduced-motion: reduce) {
          .tv-kenburns { animation: none; }
        }
        @keyframes tv-eq {
          0%, 100% { height: 25%; }
          50%      { height: 100%; }
        }
        @keyframes tv-bg-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        .tv-bg-enter {
          animation: tv-bg-fade-in 1100ms ease-out both;
        }
      `}</style>
      {/* Gradiente elegante atrás da foto do locutor (transição suave) */}
      <div
        className="absolute inset-0 z-0 transition-opacity duration-1000"
        style={{
          opacity: (bgMode === "presenter" || loadedMode === "presenter") && presenterGradient ? 1 : 0,
          background: presenterGradient || "transparent",
        }}
        aria-hidden
      />
      {/* Background principal (imagem) com cross-fade */}
      <div className="absolute inset-0 z-0 bg-black">
        {/* Base gradient — sempre presente por baixo */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, hsl(var(--background)) 0%, hsl(var(--muted)) 60%, hsl(var(--background)) 100%)",
          }}
        />
        {/* Fallback estático elegante quando não há NENHUMA imagem disponível */}
        {showStaticFallback && (
          <>
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(60% 70% at 20% 25%, rgba(0,191,240,0.35) 0%, transparent 65%), radial-gradient(55% 65% at 82% 78%, rgba(198,240,60,0.22) 0%, transparent 70%), radial-gradient(80% 90% at 50% 50%, rgba(15,23,42,0.0) 0%, rgba(2,6,23,0.85) 90%), linear-gradient(135deg, #0b1220 0%, #0f172a 55%, #050914 100%)",
              }}
              aria-hidden
            />
            {/* Grão sutil para dar textura e evitar banding */}
            <div
              className="absolute inset-0 opacity-[0.08] mix-blend-overlay pointer-events-none"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.6 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
              }}
              aria-hidden
            />
            {/* Halo suave no centro para dar profundidade */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(45% 55% at 50% 45%, rgba(255,255,255,0.06) 0%, transparent 70%)",
              }}
              aria-hidden
            />
          </>
        )}
        {/* Skeleton shimmer enquanto nenhuma imagem carregou (só quando há imagem para carregar) */}
        {showSkeleton && (
          <div
            className="absolute inset-0 animate-pulse"
            style={{
              background:
                "linear-gradient(110deg, rgba(255,255,255,0.02) 20%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.02) 80%)",
              backgroundSize: "200% 100%",
            }}
            aria-hidden
          />
        )}
        {/* Camada da imagem carregada (visível assim que pronta) */}
        {loadedBg && (
          <img
            key={loadedBg}
            src={loadedBg}
            alt=""
            aria-hidden
            crossOrigin="anonymous"
            referrerPolicy="no-referrer"
            className={
              (loadedMode === "presenter"
                ? "tv-kenburns tv-kenburns--contain absolute inset-1/2 -translate-x-1/2 -translate-y-1/2 h-[95vh] w-auto max-w-none object-contain drop-shadow-2xl"
                : "tv-kenburns absolute inset-0 w-full h-full object-cover") +
              " transition-opacity duration-700 ease-out opacity-100"
            }
          />
        )}
        {/* Escurecimento para legibilidade (mais leve no fallback estático — já é escuro) */}
        <div className={`absolute inset-0 transition-colors duration-700 ${showStaticFallback ? "bg-black/10" : loadedMode === "presenter" ? "bg-black/25" : "bg-black/55"}`} />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70" />
      </div>


      {/* Conteúdo */}
      <div className="relative z-10 flex flex-col p-tv-safe min-h-screen">
        {/* Cabeçalho: apenas a logo, sem texto "PLAYER ..." */}
        <div className="flex-none flex items-center">
          {radioLogo ? (
            <img
              src={radioLogo}
              alt={radioName}
              className="h-24 w-24 rounded-2xl object-contain bg-white/10 backdrop-blur-md p-2 border border-white/10 shadow-xl"
            />
          ) : null}
        </div>

        {/* Corpo */}
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-16 items-center">
          {/* Coluna esquerda: mensagem (8/12) */}
          <div className="lg:col-span-8 max-w-3xl">
            {/* Bloco headline com respiro generoso */}
            <div className="space-y-6 mb-14">
              <p className="text-tv-caption font-tv-bold uppercase tracking-[0.28em] text-primary drop-shadow">
                Configuração do player
              </p>
              <h1 className="text-tv-h1 font-tv-bold leading-[1.05] drop-shadow-lg">
                Bem-vindo ao player da{" "}
                <span className="text-primary">{radioName || userSlug.toUpperCase()}</span>
              </h1>
              <p className="text-tv-body text-slate-200/90 max-w-2xl leading-relaxed drop-shadow-md">
                Para uma melhor interação, leia o QR code ao lado com a câmera do seu celular e faça login com sua conta.
              </p>
            </div>

            {/* Bloco de ação: apenas status pill (URL foi movida para o card do QR) */}
            {!claimedName && !error && (
              <div className="flex flex-wrap items-center gap-8">
                {!code && !expired && (
                  <div
                    className="inline-flex items-center gap-4 rounded-full border border-primary/30 bg-primary/10 px-7 py-4 backdrop-blur-md"
                    style={{ boxShadow: "0 0 40px hsl(var(--primary) / 0.25)" }}
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-tv-body font-tv-bold text-primary">Gerando código…</span>
                  </div>
                )}
                {expired && (
                  <div className="inline-flex items-center gap-4 rounded-full border border-amber-400/40 bg-amber-500/10 px-7 py-4 backdrop-blur-md">
                    <AlertTriangle className="h-6 w-6 text-amber-300" />
                    <div className="flex items-center gap-4">
                      <span className="text-tv-body font-tv-bold text-amber-100">Código expirado</span>
                      <button
                        type="button"
                        onClick={generateCode}
                        data-tv-focusable
                        autoFocus
                        className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground hover:opacity-90 px-4 py-2 text-tv-caption font-tv-bold"
                      >
                        <RefreshCw className="h-4 w-4" /> Gerar novo
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}


            {claimedName && (
              <div className="rounded-3xl bg-emerald-500/15 border border-emerald-400/40 px-8 py-6 text-emerald-100 backdrop-blur-md inline-flex items-center gap-4 shadow-2xl">
                <CheckCircle2 className="h-8 w-8 text-emerald-300" />
                <div>
                  <div className="text-tv-body font-tv-bold">Pareado com sucesso!</div>
                  <div className="text-tv-caption opacity-90 mt-1">Olá, {claimedName}. Entrando no player…</div>
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-3xl bg-red-500/15 border border-red-400/40 px-8 py-6 text-red-100 backdrop-blur-md inline-flex items-center gap-4 shadow-2xl">
                <AlertTriangle className="h-7 w-7 text-red-300" />
                <div className="flex-1">
                  <div className="text-tv-body font-tv-bold">Erro ao gerar código</div>
                  <div className="text-tv-caption opacity-90 mt-1">{error}</div>
                </div>
                <button
                  type="button"
                  onClick={generateCode}
                  data-tv-focusable
                  className="inline-flex items-center gap-2 rounded-xl bg-white/15 hover:bg-white/25 px-4 py-2 text-tv-caption font-tv-bold"
                >
                  <RefreshCw className="h-4 w-4" /> Tentar novamente
                </button>
              </div>
            )}
          </div>

          {/* Coluna direita: card branco elegante (QR + código + expira + URL discreta) */}
          <div className="lg:col-span-4 flex items-center justify-center lg:justify-end">
            <div
              className="relative bg-white/95 backdrop-blur-2xl px-10 pt-10 pb-8 rounded-[2.5rem] flex flex-col items-center w-full max-w-md border border-white/60"
              style={{
                boxShadow:
                  "0 40px 80px -20px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.4) inset, 0 60px 120px -40px hsl(var(--primary) / 0.35)",
              }}
            >
              {/* Halo colorido sutil atrás do card */}
              <div
                className="absolute -inset-1 -z-10 rounded-[2.75rem] opacity-60 blur-2xl"
                style={{
                  background:
                    "radial-gradient(60% 60% at 30% 20%, hsl(var(--primary) / 0.35) 0%, transparent 70%), radial-gradient(60% 60% at 75% 90%, hsl(var(--accent) / 0.25) 0%, transparent 70%)",
                }}
                aria-hidden
              />

              {/* QR — moldura com cantinhos estilo "viewfinder" */}
              <div className="relative mb-7">
                <div className="relative bg-white p-6 rounded-[1.75rem] ring-1 ring-slate-200/80">
                  {/* Cantos decorativos */}
                  <span className="absolute -top-1 -left-1 h-5 w-5 border-t-[3px] border-l-[3px] border-primary rounded-tl-xl" aria-hidden />
                  <span className="absolute -top-1 -right-1 h-5 w-5 border-t-[3px] border-r-[3px] border-primary rounded-tr-xl" aria-hidden />
                  <span className="absolute -bottom-1 -left-1 h-5 w-5 border-b-[3px] border-l-[3px] border-primary rounded-bl-xl" aria-hidden />
                  <span className="absolute -bottom-1 -right-1 h-5 w-5 border-b-[3px] border-r-[3px] border-primary rounded-br-xl" aria-hidden />
                  {code ? (
                    <>
                      <div className={expired ? "opacity-30 grayscale transition-opacity" : "transition-opacity"}>
                        <QRCodeSVG value={pairUrl} size={240} level="M" includeMargin={false} />
                      </div>
                      {expired && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-[1.75rem] bg-black/40 backdrop-blur-sm">
                          <AlertTriangle className="h-10 w-10 text-amber-300" />
                          <div className="text-tv-body font-tv-bold text-white">Expirado</div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="w-[240px] h-[240px] flex flex-col items-center justify-center gap-3">
                      <Loader2 className="h-10 w-10 animate-spin text-slate-500" />
                      <div className="text-xs text-slate-500">Gerando QR code…</div>
                    </div>
                  )}
                </div>
                {/* Logo/ícone flutuante para dar sofisticação */}
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-4 rounded-full bg-white px-4 py-1.5 ring-1 ring-slate-200 shadow-md flex items-center gap-2">
                  <Smartphone className="h-3.5 w-3.5 text-primary" />
                  <span className="text-[10px] font-tv-bold uppercase tracking-[0.22em] text-slate-500">Escaneie</span>
                </div>
              </div>

              {/* Código */}
              <div className="w-full text-center space-y-3">
                <p className="text-slate-400 font-tv-bold uppercase tracking-[0.28em] text-[10px]">
                  Código de pareamento
                </p>
                <div className={`text-6xl font-tv-bold tracking-[0.22em] ${expired ? "text-slate-400 line-through decoration-4" : "text-slate-900"}`}>
                  {code ? code : "----"}
                </div>
                {code && !expired && remaining > 0 && (
                  <div className="pt-2 flex flex-col items-center gap-3">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-slate-100/80 rounded-full">
                      <span className="text-slate-500 text-sm font-semibold">
                        Expira em <span className="text-slate-900 font-tv-bold tabular-nums">{remainingLabel}</span>
                      </span>
                    </div>
                    {/* URL manual — discreta, logo abaixo do contador */}
                    <div className="text-center">
                      <p className="text-[9px] font-tv-bold uppercase tracking-[0.28em] text-slate-400">
                        ou acesse no navegador
                      </p>
                      <p className="text-sm font-tv-bold tracking-tight text-slate-600 mt-1 break-all">
                        {shortUrl ? shortUrl.replace(/^https?:\/\//, "") : `${window.location.host}/${userSlug}/pair`}
                      </p>
                    </div>
                  </div>
                )}
                {code && expired && (
                  <button
                    type="button"
                    onClick={generateCode}
                    data-tv-focusable
                    className="inline-flex items-center gap-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 px-5 py-3 mt-4 text-tv-body font-tv-bold shadow-lg"
                  >
                    <RefreshCw className="h-5 w-5" /> Gerar novo código
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Now Playing (canto inferior esquerdo) — visível apenas quando o fundo mostra o artista */}
        {(bgMode === "artist" || loadedMode === "artist") && (musicTitle || musicArtist) && (
          <div
            className={`pointer-events-none absolute left-8 bottom-8 max-w-md transition-opacity duration-700 ${
              bgMode === "artist" && loadedMode === "artist" ? "opacity-100" : "opacity-70"
            }`}
          >
            <div className="flex items-center gap-4 rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 px-5 py-4 shadow-2xl">
              {/* Barras de equalizer animadas */}
              <div className="flex items-end gap-1 h-8" aria-hidden>
                <span className="w-1 rounded-full bg-primary animate-[tv-eq_1s_ease-in-out_infinite]" style={{ animationDelay: "0ms" }} />
                <span className="w-1 rounded-full bg-primary animate-[tv-eq_1.1s_ease-in-out_infinite]" style={{ animationDelay: "150ms" }} />
                <span className="w-1 rounded-full bg-primary animate-[tv-eq_0.9s_ease-in-out_infinite]" style={{ animationDelay: "300ms" }} />
                <span className="w-1 rounded-full bg-primary animate-[tv-eq_1.2s_ease-in-out_infinite]" style={{ animationDelay: "450ms" }} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-tv-bold uppercase tracking-[0.28em] text-primary/90">Tocando agora</p>
                {musicTitle && (
                  <p className="text-tv-body font-tv-bold text-white truncate mt-1 drop-shadow">{musicTitle}</p>
                )}
                {musicArtist && (
                  <p className="text-tv-caption text-slate-200/85 truncate">{musicArtist}</p>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
