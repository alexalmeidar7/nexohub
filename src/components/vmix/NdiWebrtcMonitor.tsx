import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type HlsType from "hls.js";

type VmixInputLike = { number: string | number; key?: string; title?: string; type?: string };

type Status = "idle" | "connecting" | "live" | "error";
type Mode = "hls" | "snapshot";

const SNAP_KEY = "vmix_snapshot_base";
const HLS_KEY = "vmix_livelan_url";
const MODE_KEY = "vmix_monitor_mode";
const isNdiType = (t?: string) => /ndi|desktop/i.test(t || "");

let hlsModule: typeof import("hls.js") | null = null;
const getHls = async () => {
  if (!hlsModule) hlsModule = await import("hls.js");
  return hlsModule.default;
};

function normalizeBase(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  try {
    const u = new URL(v);
    if (!u.port) u.port = "8088";
    return `${u.protocol}//${u.hostname}:${u.port}`;
  } catch {
    return v;
  }
}

/** Aceita "10.1.1.62", "10.1.1.62:8088/livelan" ou a URL completa do LiveLAN. */
function normalizeHlsUrl(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  try {
    const u = new URL(v);
    if (!u.port) u.port = "8088";
    // Caminho livre: /livelan (padrão do vMix), /stream.m3u8, master.m3u8 etc.
    if (!u.pathname || u.pathname === "/") u.pathname = "/livelan";
    return u.toString().replace(/\/$/, "");
  } catch {
    return v;
  }
}


function snapshotPaths(inputRef: string): string[] {
  const q = inputRef ? `?input=${encodeURIComponent(inputRef)}` : "";
  return [
    `/snapshot${q}`,
    `/api/?snapshot${inputRef ? `&input=${encodeURIComponent(inputRef)}` : ""}`,
    `/mjpeg${inputRef ? `?Input=${encodeURIComponent(inputRef)}` : ""}`,
  ];
}

export default function NdiWebrtcMonitor({
  vmixBaseUrl,
  inputs = [],
  onRefresh,
}: {
  vmixBaseUrl?: string;
  vmixUser?: string;
  vmixPass?: string;
  inputs?: VmixInputLike[];
  onRefresh?: () => void | Promise<void>;
}) {
  const imageRef = useRef<HTMLImageElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const pathIndexRef = useRef(0);

  const read = (k: string, fallback = "") => {
    try {
      return localStorage.getItem(k) || fallback;
    } catch {
      return fallback;
    }
  };
  const write = (k: string, v: string) => {
    try {
      if (v) localStorage.setItem(k, v);
      else localStorage.removeItem(k);
    } catch {
      /* storage indisponível */
    }
  };

  const [mode, setMode] = useState<Mode>(() => (read(MODE_KEY) === "snapshot" ? "snapshot" : "hls"));
  const [base, setBase] = useState<string>(() => read(SNAP_KEY));
  const [hlsUrl, setHlsUrl] = useState<string>(() => read(HLS_KEY));
  const [draftBase, setDraftBase] = useState("");
  const [draftHls, setDraftHls] = useState(() => read(HLS_KEY));
  const [source, setSource] = useState<string>("");
  const [fps, setFps] = useState(3);
  const [status, setStatus] = useState<Status>("idle");
  const [running, setRunning] = useState(true);
  const [muted, setMuted] = useState(true);

  const effectiveBase = useMemo(() => normalizeBase(base || vmixBaseUrl), [base, vmixBaseUrl]);
  const effectiveHls = useMemo(() => normalizeHlsUrl(hlsUrl), [hlsUrl]);

  useEffect(() => {
    setDraftBase(effectiveBase.replace(/^https?:\/\//, ""));
  }, [effectiveBase]);

  useEffect(() => write(MODE_KEY, mode), [mode]);

  const sources = useMemo(() => {
    const ndi = inputs.filter((i) => String(i?.number ?? "").trim() !== "" && isNdiType(i.type));
    return [
      { value: "", label: "OUTPUT 1 · PROGRAMA" },
      { value: "Preview", label: "PREVIEW" },
      ...ndi.map((i) => ({
        value: String(i.number),
        label: `NDI ${i.number} · ${(i.title || "Sem título").replace(/\s+/g, " ").trim()}`,
      })),
    ];
  }, [inputs]);

  const target = mode === "hls" ? effectiveHls : effectiveBase;
  const mixedContent = typeof window !== "undefined"
    && window.location.protocol === "https:"
    && target.startsWith("http://");

  // ---- HLS (LiveLAN do vMix) ----
  useEffect(() => {
    if (mode !== "hls") return;
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
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true, liveDurationInfinity: true });
        hlsRef.current = hls;
        hls.loadSource(effectiveHls);
        hls.attachMedia(video);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          setStatus("live");
          video.play().catch(() => {});
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data?.fatal) setStatus("error");
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
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute("src");
    };
  }, [mode, effectiveHls, running]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted, status]);

  // ---- Snapshot (fallback via polling de imagem) ----
  const paths = useMemo(() => snapshotPaths(source), [source]);
  useEffect(() => {
    if (mode !== "snapshot") return;
    if (!effectiveBase || !running) {
      setStatus("idle");
      return;
    }
    pathIndexRef.current = 0;
    setStatus("connecting");
    let cancelled = false;

    const img = imageRef.current;
    const tick = () => {
      if (cancelled || !imageRef.current) return;
      const path = paths[pathIndexRef.current % paths.length];
      const sep = path.includes("?") ? "&" : "?";
      imageRef.current.src = `${effectiveBase}${path}${sep}t=${Date.now()}`;
    };
    if (img) {
      img.onload = () => !cancelled && setStatus("live");
      img.onerror = () => {
        if (cancelled) return;
        pathIndexRef.current += 1;
        if (pathIndexRef.current >= paths.length * 2) setStatus("error");
      };
    }
    tick();
    const timer = window.setInterval(tick, Math.max(120, Math.round(1000 / fps)));

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (img) {
        img.onload = null;
        img.onerror = null;
      }
    };
  }, [mode, effectiveBase, paths, fps, running]);

  const saveHls = useCallback(() => {
    const next = normalizeHlsUrl(draftHls);
    setHlsUrl(next);
    setDraftHls(next);
    write(HLS_KEY, next);
    setStatus("connecting");
  }, [draftHls]);

  const saveBase = useCallback(() => {
    const next = normalizeBase(draftBase);
    setBase(next);
    write(SNAP_KEY, next);
    setStatus("connecting");
  }, [draftBase]);

  const statusMeta: Record<Status, { label: string; color: string }> = {
    idle: { label: "PARADO", color: "#6b7280" },
    connecting: { label: "CONECTANDO", color: "#facc15" },
    live: { label: "AO VIVO", color: "#C6F03C" },
    error: { label: "SEM SINAL", color: "#ef4444" },
  };
  const meta = statusMeta[status];
  const fieldStyle = { backgroundColor: "#1a1a1a", color: "#e5e5e5", border: "1px solid #C6F03C50" } as const;

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

      {/* Modo */}
      <div className="grid grid-cols-2 gap-1.5 mb-1.5">
        {([["hls", "HLS · LIVELAN"], ["snapshot", "SNAPSHOT"]] as [Mode, string][]).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className="vmix-hover-ring h-8 rounded text-[9px] font-black uppercase tracking-widest"
            style={{
              backgroundColor: mode === m ? "#C6F03C" : "#1a1a1a",
              color: mode === m ? "#000" : "#C6F03C",
              border: "1px solid #C6F03C50",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === "hls" ? (
        <div className="flex gap-1.5 mb-1.5">
          <input
            value={draftHls}
            onChange={(e) => setDraftHls(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveHls()}
            placeholder="http://192.168.0.10:8080/stream.m3u8"
            className="vmix-hover-ring flex-1 h-9 rounded text-[11px] font-bold px-2.5 outline-none"
            style={fieldStyle}
          />
          <button
            type="button"
            onClick={saveHls}
            className="vmix-hover-ring h-9 px-2.5 rounded text-[9px] font-black uppercase tracking-widest"
            style={{ backgroundColor: "#C6F03C", color: "#000" }}
          >
            Salvar URL
          </button>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5 mb-1.5">
            <input
              value={draftBase}
              onChange={(e) => setDraftBase(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveBase()}
              placeholder="192.168.0.10:8088"
              className="vmix-hover-ring flex-1 h-9 rounded text-[11px] font-bold px-2.5 outline-none"
              style={fieldStyle}
            />
            <button
              type="button"
              onClick={saveBase}
              className="vmix-hover-ring h-9 px-2.5 rounded text-[9px] font-black uppercase tracking-widest"
              style={{ backgroundColor: "#C6F03C", color: "#000" }}
            >
              Salvar IP
            </button>
          </div>
          <div className="flex gap-1.5 mb-1.5">
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="vmix-hover-ring flex-1 h-9 rounded text-[11px] font-bold uppercase tracking-wider px-2.5 outline-none"
              style={fieldStyle}
            >
              {sources.map((s) => (
                <option key={s.value || "program"} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="vmix-hover-ring h-9 rounded text-[11px] font-bold uppercase tracking-wider px-2 outline-none"
              style={fieldStyle}
              title="Taxa de atualização"
            >
              {[1, 2, 3, 5, 8].map((f) => (
                <option key={f} value={f}>{f} FPS</option>
              ))}
            </select>
          </div>
        </>
      )}

      <div className="flex gap-1.5 mb-2">
        <button
          type="button"
          onClick={() => {
            void onRefresh?.();
            setRunning((r) => !r);
          }}
          className="vmix-hover-ring flex-1 h-8 rounded text-[9px] font-black uppercase tracking-widest"
          style={{ backgroundColor: running ? "#1a1a1a" : "#C6F03C", color: running ? "#C6F03C" : "#000", border: "1px solid #C6F03C50" }}
        >
          {running ? "Pausar" : "Iniciar"}
        </button>
        {mode === "hls" && (
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="vmix-hover-ring h-8 px-3 rounded text-[9px] font-black uppercase tracking-widest"
            style={{ backgroundColor: "#1a1a1a", color: "#C6F03C", border: "1px solid #C6F03C50" }}
          >
            {muted ? "Som off" : "Som on"}
          </button>
        )}
      </div>

      <div
        className="relative w-full overflow-hidden rounded"
        style={{ paddingBottom: "56.25%", backgroundColor: "#000", border: "1px solid #C6F03C25" }}
      >
        {mode === "hls" ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted={muted}
            className="absolute"
            style={{
              top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain",
              visibility: status === "live" ? "visible" : "hidden",
            }}
          />
        ) : (
          <img
            ref={imageRef}
            alt="Preview vMix"
            className="absolute"
            style={{
              top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain",
              visibility: status === "live" ? "visible" : "hidden",
            }}
          />
        )}

        {status !== "live" && (
          <div
            className="absolute flex flex-col items-center justify-center text-center px-4 gap-1.5"
            style={{ top: 0, left: 0, right: 0, bottom: 0, color: "#ffffff55" }}
          >
            <span className="text-[10px] font-black uppercase tracking-[0.2em]">
              {!target
                ? mode === "hls" ? "Informe a URL do LiveLAN (.m3u8)" : "Informe o IP:porta do vMix"
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
        {target ? (mode === "hls" ? `LiveLAN: ${target}` : `Snapshot: ${target} · ${fps} FPS`) : "Nenhuma fonte configurada"}
      </p>
    </section>
  );
}
