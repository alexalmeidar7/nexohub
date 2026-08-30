import { useEffect, useMemo, useRef, useState } from "react";
import type HlsType from "hls.js";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

type VmixInputLike = { number: string | number; key?: string; title?: string; type?: string };

type Status = "idle" | "connecting" | "live" | "error";

const HLS_KEY = "vmix_livelan_url";

let hlsModule: typeof import("hls.js") | null = null;
const getHls = async () => {
  if (!hlsModule) hlsModule = await import("hls.js");
  return hlsModule.default;
};

/** Aceita "10.1.1.62", "10.1.1.62:8088/livelan" ou a URL completa do LiveLAN. */
function normalizeHlsUrl(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  try {
    const u = new URL(v);
    if (!u.port) u.port = "8088";
    if (!u.pathname || u.pathname === "/") u.pathname = "/livelan/stream.m3u8";
    // vMix LiveLAN publica o manifesto em /livelan/stream.m3u8
    if (/^\/livelan\/?$/i.test(u.pathname)) u.pathname = "/livelan/stream.m3u8";
    return u.toString().replace(/\/$/, "");
  } catch {
    return v;
  }
}

export default function NdiWebrtcMonitor({
  onRefresh,
}: {
  vmixBaseUrl?: string;
  vmixUser?: string;
  vmixPass?: string;
  inputs?: VmixInputLike[];
  onRefresh?: () => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const retryRef = useRef<number | null>(null);

  // Recupera a última URL salva e dá play automaticamente.
  const storedHls = (() => {
    try {
      return localStorage.getItem(HLS_KEY) || "";
    } catch {
      return "";
    }
  })();
  const [draftHls, setDraftHls] = useState(storedHls);
  const [hlsUrl, setHlsUrl] = useState(storedHls);
  const [status, setStatus] = useState<Status>("idle");
  const [running, setRunning] = useState(true);
  const [muted, setMuted] = useState(true);
  const [volume, setVolume] = useState(0.8);

  const effectiveHls = useMemo(() => normalizeHlsUrl(hlsUrl), [hlsUrl]);

  // Auto-save (debounce) da URL digitada
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = normalizeHlsUrl(draftHls);
      setHlsUrl(next);
      try {
        if (next) localStorage.setItem(HLS_KEY, next);
        else localStorage.removeItem(HLS_KEY);
      } catch {
        /* storage indisponível */
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draftHls]);

  const mixedContent =
    typeof window !== "undefined" &&
    window.location.protocol === "https:" &&
    effectiveHls.startsWith("http://");

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !effectiveHls || !running) {
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("connecting");

    (async () => {
      const Hls = await getHls();
      if (cancelled) return;
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          liveDurationInfinity: true,
          manifestLoadingRetryDelay: 1000,
          manifestLoadingMaxRetry: 6,
          levelLoadingMaxRetry: 6,
          fragLoadingMaxRetry: 6,
        });
        hlsRef.current = hls;
        hls.loadSource(effectiveHls);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setStatus("live");
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.FRAG_BUFFERED, () => setStatus("live"));
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            // Rede local instável / manifesto ainda não publicado: tenta de novo.
            retryRef.current = window.setTimeout(() => {
              if (!cancelled) hls.startLoad();
            }, 2000);
            setStatus("connecting");
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
            return;
          }
          setStatus("error");
        });
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = effectiveHls;
        video.addEventListener("loadedmetadata", () => {
          setStatus("live");
          video.play().catch(() => {});
        });
        video.addEventListener("error", () => setStatus("error"));
      } else {
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      if (retryRef.current) {
        window.clearTimeout(retryRef.current);
        retryRef.current = null;
      }
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
    };
  }, [effectiveHls, running]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    video.volume = volume;
  }, [muted, volume, status]);

  const togglePlay = () => {
    void onRefresh?.();
    setRunning((r) => !r);
  };

  const statusMeta: Record<Status, { label: string; color: string }> = {
    idle: { label: "PARADO", color: "#6b7280" },
    connecting: { label: "CONECTANDO", color: "#facc15" },
    live: { label: "AO VIVO", color: "#C6F03C" },
    error: { label: "SEM SINAL", color: "#ef4444" },
  };
  const meta = statusMeta[status];
  const iconBtn = {
    backgroundColor: "#1a1a1a",
    color: "#C6F03C",
    border: "1px solid #C6F03C50",
  } as const;

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: "#C6F03C" }}>
          Monitor Output 1
        </h3>
        <span
          className="flex items-center gap-1.5 text-[9px] font-black tracking-widest px-2 py-0.5 rounded"
          style={{ backgroundColor: "#0f0f0f", color: meta.color, border: `1px solid ${meta.color}40` }}
        >
          <span
            className={status === "connecting" || status === "live" ? "animate-pulse" : ""}
            style={{ width: 6, height: 6, borderRadius: 999, backgroundColor: meta.color, display: "inline-block" }}
          />
          {meta.label}
        </span>
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <input
          value={draftHls}
          onChange={(e) => setDraftHls(e.target.value)}
          placeholder="http://10.1.1.62:8088/livelan"
          className="vmix-hover-ring flex-1 h-9 rounded text-[11px] font-bold px-2.5 outline-none"
          style={{ backgroundColor: "#1a1a1a", color: "#e5e5e5", border: "1px solid #C6F03C50" }}
        />
        <button
          type="button"
          onClick={() => setMuted((m) => !m)}
          title={muted ? "Habilitar áudio" : "Silenciar"}
          aria-label={muted ? "Habilitar áudio" : "Silenciar"}
          className="vmix-hover-ring h-9 w-9 rounded flex items-center justify-center"
          style={iconBtn}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        {!muted && (
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-label="Volume"
            className="w-20 h-9 cursor-pointer"
            style={{ accentColor: "#C6F03C" }}
          />
        )}
        <button
          type="button"
          onClick={togglePlay}
          title={running ? "Pausar vídeo" : "Reproduzir vídeo"}
          aria-label={running ? "Pausar vídeo" : "Reproduzir vídeo"}
          className="vmix-hover-ring h-9 w-9 rounded flex items-center justify-center"
          style={iconBtn}
        >
          {running ? <Pause size={14} /> : <Play size={14} />}
        </button>
      </div>

      <div
        className="relative w-full overflow-hidden rounded"
        style={{ paddingBottom: "56.25%", backgroundColor: "#000", border: "1px solid #C6F03C25" }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={muted}
          className="absolute"
          style={{
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            objectFit: "contain",
            visibility: status === "live" ? "visible" : "hidden",
          }}
        />

        {status !== "live" && (
          <div
            className="absolute flex flex-col items-center justify-center text-center px-4 gap-1.5"
            style={{ top: 0, left: 0, right: 0, bottom: 0, color: "#ffffff55" }}
          >
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {!effectiveHls
                ? "Informe a URL do LiveLAN"
                : status === "connecting"
                  ? "Conectando…"
                  : status === "error"
                    ? "Não foi possível abrir o stream"
                    : "Monitor pausado"}
            </span>
            {status === "error" && mixedContent && (
              <span className="text-[9px] font-bold normal-case leading-relaxed" style={{ color: "#facc15", maxWidth: 380 }}>
                O painel está em HTTPS e o stream do vMix é HTTP. Clique no cadeado na barra de
                endereços → Configurações do site → “Conteúdo não seguro” → Permitir, e recarregue a página.
              </span>
            )}
            {status === "error" && !mixedContent && (
              <span className="text-[9px] font-bold normal-case leading-relaxed" style={{ color: "#facc15", maxWidth: 380 }}>
                Verifique se o LiveLAN está ativo no vMix e se a URL/porta estão corretas na mesma rede local.
              </span>
            )}
          </div>
        )}
      </div>

      {mixedContent && status !== "error" && (
        <p className="text-[9px] font-bold uppercase tracking-wider mt-2 leading-relaxed" style={{ color: "#facc15" }}>
          HTTPS → HTTP: se o vídeo não abrir, libere “Conteúdo não seguro” no cadeado do navegador.
        </p>
      )}
      <p className="text-[9px] font-bold uppercase tracking-wider mt-1.5 break-all" style={{ color: "#ffffff45" }}>
        {effectiveHls ? `LiveLAN: ${effectiveHls} · salvo automaticamente` : "Nenhuma fonte configurada"}
      </p>
    </section>
  );
}
