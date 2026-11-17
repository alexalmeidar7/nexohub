import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { playerSupabase } from "@/integrations/supabase/playerClient";

import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { extractDominantPair } from "@/lib/dominantColors";
import { getStationLogoFallback } from "@/lib/playerBranding";
import { upgradeArtistImageResolution } from "@/lib/artistImageCache";
import PlayerBrandCorner from "@/components/player/PlayerBrandCorner";
import { isPlayerTvApp } from "@/lib/playerTvApp";
import OttPair from "@/components/player/tv/OttPair";

const CANONICAL_PAIR_ORIGIN = "https://housemix.nexobrasil.net";

/**
 * QR e link manual devem sempre levar o ouvinte ao domínio público da Nexo.
 * O domínio Lovable é ambiente interno de desenvolvimento e nunca deve
 * aparecer no fluxo de pareamento apresentado ao público.
 */
function getPairOrigin() {
  if (typeof window === "undefined") return CANONICAL_PAIR_ORIGIN;
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1") return window.location.origin;
  return CANONICAL_PAIR_ORIGIN;
}

/**
 * Tela de "Bem-vindo" para acesso via TV: gera um código de 4 dígitos e um
 * QR code que aponta para /:userSlug/pair?code=XXXX. Ao ser confirmado no
 * celular, um canal Realtime notifica esta tela para entrar no player.
 */
export default function PlayerTvWelcome() {
  const { userSlug: rawSlug } = useParams();
  // Ignora slugs inválidos (rota acessada sem substituir o parâmetro, ex.: literal ":userSlug").
  const rawTrim = (rawSlug || "").trim();
  const userSlug = /^[a-z0-9][a-z0-9_-]*$/i.test(rawTrim) ? rawTrim.toLowerCase() : "";
  const navigate = useNavigate();

  const [code, setCode] = useState<string | null>(null);
  const [displayCode, setDisplayCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [radioName, setRadioName] = useState<string>("");
  const [radioLogo, setRadioLogo] = useState<string>("");
  const [radioUserId, setRadioUserId] = useState<string | null>(null);
  const [artistImg, setArtistImg] = useState<string | null>(null);
  const [musicCover, setMusicCover] = useState<string | null>(null);
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

  const handleClaimedRow = useCallback((row: any) => {
    if (!row || claimedRef.current || row.status !== "claimed") return;
    claimedRef.current = true;
    const isGuestClaim = !row.paired_user_id && !row.paired_email;
    try {
      const guest = {
        name: isGuestClaim ? "Visitante" : row.paired_name || row.paired_email || "Convidado",
        email: row.paired_email || null,
        avatar_url: row.paired_avatar || "/avatars/usr-default.png",
        pairedAt: Date.now(),
      };
      localStorage.setItem(`nexohub_tv_guest_${userSlug}`, JSON.stringify(guest));
      if (isGuestClaim) localStorage.removeItem(`player-step-home:${userSlug}`);
    } catch { /* ignore */ }
    setClaimedName(isGuestClaim ? "Visitante" : row.paired_name || row.paired_email || "Convidado");
    setTimeout(() => {
      navigate(`/${userSlug}/player?tvGuest=1&step=home`, { replace: true });
    }, 900);
  }, [navigate, userSlug]);

  // Auto-fullscreen quando aberto em navegador de TV (WebOS/Tizen/AndroidTV/etc).
  // Alguns navegadores só permitem via gesto — nesse caso, o primeiro clique/tecla dispara.
  useEffect(() => {
    const ua = (navigator.userAgent || "").toLowerCase();
    const isTv = /smart-tv|smarttv|hbbtv|web0s|webos|tizen|viera|nettv|googletv|appletv|crkey|bravia|android tv|large screen/.test(ua);
    if (!isTv) return;
    const tryFs = () => {
      const el = document.documentElement as any;
      const req = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen;
      if (req && !document.fullscreenElement) {
        try { req.call(el); } catch { /* precisa gesto */ }
      }
    };
    tryFs();
    const onGesture = () => { tryFs(); };
    window.addEventListener("keydown", onGesture, { once: true });
    window.addEventListener("pointerdown", onGesture, { once: true });
    return () => {
      window.removeEventListener("keydown", onGesture);
      window.removeEventListener("pointerdown", onGesture);
    };
  }, []);

  // Busca metadata pública da rádio + música tocando + locutor no ar.
  // Faz polling a cada 15s para manter o fundo atualizado.
  useEffect(() => {
    if (!userSlug) return;
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await playerSupabase.functions.invoke("public-player-data", {
          body: { slug: userSlug },
        });
        if (cancelled) return;
        const d = (data || {}) as any;
        const emp = d.empresa || {};
        const nome = emp.nome_empresa || emp.nome || userSlug;
        const logo = emp.logo_url || emp.logo || (Array.isArray(d.channels) ? d.channels.find((c: any) => c?.active && c?.logo_url)?.logo_url : "") || getStationLogoFallback(userSlug) || "";
        setRadioUserId(d.userId || null);
        setRadioName(String(nome).toUpperCase());
        setRadioLogo(String(logo || ""));

        // Apenas a imagem do artista via Deezer — NÃO usar capa do CD como fallback.
        const deezer: string | null = upgradeArtistImageResolution(d.musicDeezerArtistImg) || d.musicDeezerArtistImg || null;
        setArtistImg(deezer);
        setMusicCover(String(d.musicData?.capa || deezer || "").trim() || null);
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

  // Pré-carrega TODAS as imagens candidatas (artista, locutor e fallback) assim
  // que suas URLs ficam conhecidas — antes mesmo de virarem o fundo ativo.
  // Isso elimina o flicker na troca a cada 5s: quando bgMode alterna, o browser
  // já tem o arquivo em cache e o crossfade acontece instantaneamente.
  const preloadedRef = useRef<Map<string, HTMLImageElement>>(new Map());
  useEffect(() => {
    const urls = [artistImg, presenterImg, fallbackImg].filter(
      (u): u is string => Boolean(u)
    );
    for (const url of urls) {
      if (preloadedRef.current.has(url)) continue;
      const img = new Image();
      img.decoding = "async";
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      img.src = url;
      // decode() força o browser a resolver o bitmap agora, evitando pop-in
      // quando a <img> visível montar depois.
      if (typeof img.decode === "function") {
        img.decode().catch(() => { /* ignore — fallback é o onload padrão */ });
      }
      preloadedRef.current.set(url, img);
    }
    // Garbage-collect entradas cujas URLs não são mais candidatas atuais.
    for (const key of Array.from(preloadedRef.current.keys())) {
      if (!urls.includes(key)) preloadedRef.current.delete(key);
    }
  }, [artistImg, presenterImg, fallbackImg]);




  // Gera código de pareamento.
  const generateCode = useCallback(async () => {
    if (!userSlug) return;
    setError(null);
    setCode(null);
    setDisplayCode(null);
    setExpiresAt(null);
    const { data, error: fnErr } = await playerSupabase.functions.invoke("tv-pair-create", {
      body: { userSlug, tvSessionId },
    });
    if (fnErr || !data?.ok) {
      setError("Não foi possível gerar o código. Verifique sua conexão e tente novamente.");
      return;
    }
    setCode(data.code);
    setDisplayCode(data.displayCode || null);
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
    const channel = playerSupabase
      .channel(`tv-pair-${code}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tv_pairing_codes", filter: `code=eq.${code}` },
        (payload: any) => {
          const row = payload?.new;
          if (!row || claimedRef.current) return;
          handleClaimedRow(row);
        }
      )
      .subscribe();
    return () => { playerSupabase.removeChannel(channel); };
  }, [code, handleClaimedRow]);

  // Fallback para TVs/navegadores que não recebem Realtime: consulta o status
  // do código a cada 2s e entra assim que o celular confirmar.
  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    const poll = async () => {
      if (claimedRef.current) return;
      const { data } = await playerSupabase.functions.invoke("tv-pair-status", {
        body: { code, tvSessionId },
      });
      if (!cancelled) handleClaimedRow(data?.ok ? data.row : null);
    };
    poll();
    const iv = window.setInterval(poll, 2000);
    return () => { cancelled = true; window.clearInterval(iv); };
  }, [code, handleClaimedRow]);

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
          playerSupabase.functions.invoke("tv-pair-track", {
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


  const pairOrigin = getPairOrigin();
  const pairUrl = code
    ? `${pairOrigin}/${userSlug}/pair?code=${displayCode || code}`
    : `${pairOrigin}/${userSlug}/pair`;

  // Encurta a URL para facilitar a digitação no navegador.
  useEffect(() => {
    if (!code) { setShortUrl(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await playerSupabase.functions.invoke("shorten-url", { body: { url: pairUrl } });
        if (!cancelled && (data as any)?.ok && (data as any)?.short) {
          setShortUrl((data as any).short as string);
        }
      } catch { /* fallback: mantém shortUrl null e mostra URL completa */ }
    })();
    return () => { cancelled = true; };
  }, [code, pairUrl]);


  const activeBg = artistImg;

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
  const hasAnyImage = Boolean(artistImg);
  const showSkeleton = hasAnyImage && !loadedBg && (!activeBg || !pendingReady);
  const showStaticFallback = !hasAnyImage;

  if (!userSlug) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 text-slate-100 p-8">
        <div className="max-w-md text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-amber-300 mx-auto" />
          <h1 className="text-2xl font-tv-bold">URL inválida</h1>
          <p className="text-slate-300/90">
            Abra este player usando o endereço da sua rádio, por exemplo:
            <br />
            <span className="font-mono text-primary">/suaradio/player/tv</span>
          </p>
        </div>
      </div>
    );
  }

  if (isPlayerTvApp()) return <OttPair radioName={radioName} logo={radioLogo || getStationLogoFallback(userSlug)} background={fallbackImg || loadedBg} code={displayCode} pairUrl={pairUrl} expired={expired} remaining={remainingLabel} error={error} claimed={claimedName} onRetry={()=>void generateCode()} onGuest={()=>navigate(`/${userSlug}/player?tvGuest=1&step=home`)} />;

  return (
    <main className="fixed inset-0 overflow-hidden bg-black text-white antialiased">
      <style>{"@keyframes tv-pan-horizontal { 0%,100% { transform: scale(1.06) translateX(-1.5%) } 50% { transform: scale(1.06) translateX(1.5%) } } .tv-login-bg { transform-origin: center top; animation: tv-pan-horizontal 28s ease-in-out infinite; will-change: transform; } @media (prefers-reduced-motion: reduce) { .tv-login-bg { animation: none; transform: none; } }"}</style>
      <div className="absolute inset-0 z-0 overflow-hidden bg-black" aria-hidden="true">
        {!loadedBg && <div className="absolute inset-0" style={{ background: "#000" }} />}
        {loadedBg && <img src={loadedBg} alt="" className="tv-login-bg absolute inset-0 h-full w-full object-cover object-top" />}
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-transparent to-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/20" />
      </div>
      <PlayerBrandCorner radioUserId={radioUserId} logoUrl={radioLogo} logoAlt={radioName || "Emissora"} className="absolute right-[4.5vw] top-[3vh] z-10" />
      <section data-tv-pair-card className="absolute left-[6vw] top-[9.3vh] z-10 flex min-h-[50vh] max-h-[62vh] w-[min(320px,38vw)] flex-col overflow-hidden rounded-[30px] bg-white px-[30px] pb-[30px] pt-[34px] text-black shadow-2xl">
        <div data-tv-pair-qr className="mx-auto flex w-full max-w-[250px] items-center justify-center bg-white">
          {code ? <div className={expired ? "relative opacity-35 grayscale" : "relative"}>
            <QRCodeSVG value={pairUrl} size={250} level="M" includeMargin />
            {expired && <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/85"><AlertTriangle className="h-10 w-10 text-red-600" /><span className="font-bold">C&oacute;digo expirado</span></div>}
          </div> : <div className="flex h-[250px] w-[250px] flex-col items-center justify-center gap-3"><Loader2 className="h-10 w-10 animate-spin text-slate-500" /><span className="text-sm text-slate-600">Gerando QR code...</span></div>}
        </div>
        <p data-tv-pair-help className="mt-5 text-[clamp(17px,1.35vw,25px)] leading-[1.08] text-black">escaneie o codigo<br />no seu celular e<br />fa&ccedil;a login</p>
        <div className="mt-6 rounded-[22px] border-2 border-black px-4 pb-3 pt-2"><div className="text-[clamp(11px,0.78vw,15px)] leading-none">c&oacute;digo de pareamento</div><div data-tv-pair-code className={"mt-1 flex min-h-[60px] items-center justify-center text-center text-[clamp(46px,3.7vw,72px)] font-bold leading-none tracking-[0.18em] " + (expired ? "text-neutral-400 line-through" : "text-black")}>{displayCode || "----"}</div></div>
        {error && <div className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{error}<button type="button" onClick={generateCode} className="ml-2 font-bold underline">Tentar novamente</button></div>}
        {expired && <button type="button" onClick={generateCode} data-tv-focusable className="mt-3 rounded-xl bg-black px-4 py-2 text-sm font-bold text-white">Gerar novo c&oacute;digo</button>}
        {claimedName && <div className="mt-3 text-center text-sm font-bold text-emerald-700">Pareado com {claimedName}. Entrando...</div>}
      </section>
      {(musicTitle || musicArtist || musicCover) && <div className="absolute bottom-[15.6vh] left-[6vw] z-[3] flex max-w-[38vw] items-center gap-5 text-white drop-shadow-lg">
        {musicCover && <img src={musicCover} alt="Capa da m&uacute;sica" className="h-[min(15vh,160px)] w-[min(15vh,160px)] shrink-0 rounded-[24px] object-cover shadow-xl" />}
        <div className="min-w-0"><div className="text-[clamp(20px,1.6vw,32px)] leading-tight">tocando agora:</div>{musicTitle && <div className="mt-1 truncate text-[clamp(21px,1.7vw,34px)] font-bold leading-tight">{musicTitle}</div>}{musicArtist && <div className="truncate text-[clamp(19px,1.5vw,30px)] leading-tight">{musicArtist}</div>}</div>
      </div>}
      <div className="absolute bottom-[8vh] left-[6vw] z-10 h-[4.5vh] max-h-[50px] w-[9.8vh] max-w-[110px] overflow-hidden drop-shadow-lg" aria-label="Nexo OTT Player">
        <img src="/images/player-seal.png" alt="Nexo OTT Player" className="absolute max-w-none object-fill" style={{ width: "123.27%", height: "177.63%", left: "-8.13%", top: "-38.82%" }} />
      </div>
      <div className="absolute bottom-[7vh] right-[4.5vw] z-10 text-right text-[clamp(12px,1vw,20px)] text-white drop-shadow-lg">desenvolvido por : Nexo Brasil</div>
    </main>
  );
}
