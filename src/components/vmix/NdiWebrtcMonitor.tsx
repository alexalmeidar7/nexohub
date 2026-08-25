import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type VmixInputLike = { number: string | number; key?: string; title?: string; type?: string };

type NdiSource = {
  label: string;
  /** MJPEG (vMix) ou WHEP (bridge WebRTC) */
  kind: "mjpeg" | "whep";
  url: string;
  path?: string;
  fallbackPaths?: string[];
};

type Status = "idle" | "connecting" | "live" | "error";

function normalizeBase(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim().replace(/\/+$/, "");
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  return v;
}

function hostOf(base: string): string {
  try {
    return new URL(base).hostname;
  } catch {
    return "";
  }
}

function isLocalNetworkHost(host: string): boolean {
  return /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|localhost$)/i.test(host);
}

function playbackBases(base: string): string[] {
  if (!base) return [];
  const result = [base];
  try {
    const parsed = new URL(base);
    if (isLocalNetworkHost(parsed.hostname) && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
      const port = parsed.port || "8088";
      result.push(`http://127.0.0.1:${port}`, `http://localhost:${port}`);
    }
  } catch {
    /* URL already normalized; keep the configured base only */
  }
  return Array.from(new Set(result));
}

const isNdiType = (t?: string) => /ndi|desktop/i.test(t || "");

export default function NdiWebrtcMonitor({
  vmixBaseUrl,
  vmixUser,
  vmixPass,
  inputs = [],
  onRefresh,
}: {
  vmixBaseUrl?: string;
  vmixUser?: string;
  vmixPass?: string;
  inputs?: VmixInputLike[];
  onRefresh?: () => void | Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const mjpegAbortRef = useRef<AbortController | null>(null);
  const frameUrlRef = useRef<string | null>(null);
  const [selected, setSelected] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [reloadKey, setReloadKey] = useState(0);
  const [playbackAttempt, setPlaybackAttempt] = useState(0);
  const [bridgeSources, setBridgeSources] = useState<NdiSource[]>([]);

  const base = normalizeBase(vmixBaseUrl);
  const host = hostOf(base);

  // 1) Fontes reais: as entradas NDI / Capture Desktop já presentes no vMix.
  //    O próprio vMix renderiza qualquer entrada no endpoint /mjpeg?Input=N,
  //    então cada entrada vira uma fonte reproduzível sem bridge externa.
  const vmixSources = useMemo<NdiSource[]>(() => {
    if (!base) return [];
    const list = [...inputs].filter((i) => String(i?.number ?? "").trim() !== "");
    const ndi = list.filter((i) => isNdiType(i.type));
    const others = list.filter((i) => !isNdiType(i.type));
    const build = (i: VmixInputLike, tag: string): NdiSource => {
      const inputNumber = String(i.number);
      const inputKey = String(i.key || "").trim();
      const paths = Array.from(new Set([
        `/mjpeg?Input=${encodeURIComponent(inputNumber)}`,
        inputKey ? `/mjpeg?Input=${encodeURIComponent(inputKey)}` : "",
      ].filter(Boolean)));
      return {
        label: `${tag} ${i.number} · ${(i.title || "Sem título").replace(/\s+/g, " ").trim()}`,
        kind: "mjpeg",
        url: `${base}${paths[0]}`,
        path: paths[0],
        fallbackPaths: paths.slice(1),
      };
    };
    return [
      {
        label: "VMIX NDI · OUTPUT 1 (PROGRAMA)",
        kind: "mjpeg",
        url: `${base}/mjpeg`,
        path: "/mjpeg",
      },
      {
        label: "VMIX NDI · PREVIEW",
        kind: "mjpeg",
        url: `${base}/mjpeg?Input=Preview`,
        path: "/mjpeg?Input=Preview",
      },
      ...ndi.map((i) => build(i, "NDI")),
      ...others.map((i) => build(i, "IN")),
    ];
  }, [base, inputs]);

  // 2) Opcional: bridge WebRTC/WHEP (MediaMTX) na mesma máquina do vMix.
  const discoverBridge = useCallback(async (targetHost: string) => {
    if (!targetHost) {
      setBridgeSources([]);
      return;
    }
    for (const endpoint of [
      `http://${targetHost}:9997/v3/paths/list`,
      `http://${targetHost}:9997/v2/paths/list`,
    ]) {
      try {
        const res = await fetch(endpoint, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) continue;
        const json = await res.json();
        const items: any[] = Array.isArray(json?.items)
          ? json.items
          : json?.items && typeof json.items === "object"
            ? Object.entries(json.items).map(([name, v]) => ({ name, ...(v as object) }))
            : [];
        const found = items
          .filter((it) => it?.name)
          .map<NdiSource>((it) => ({
            label: `WEBRTC · ${String(it.name).replace(/[_-]+/g, " ").toUpperCase()}`,
            kind: "whep",
            url: `http://${targetHost}:8889/${it.name}/whep`,
          }));
        setBridgeSources(found);
        return;
      } catch {
        /* bridge ausente — segue apenas com MJPEG do vMix */
      }
    }
    setBridgeSources([]);
  }, []);

  useEffect(() => {
    void discoverBridge(host);
  }, [host, discoverBridge, reloadKey]);

  const sources = useMemo(() => [...vmixSources, ...bridgeSources], [vmixSources, bridgeSources]);

  const closeConnection = useCallback(() => {
    mjpegAbortRef.current?.abort();
    mjpegAbortRef.current = null;
    if (frameUrlRef.current) {
      URL.revokeObjectURL(frameUrlRef.current);
      frameUrlRef.current = null;
    }
    if (pcRef.current) {
      try {
        pcRef.current.getSenders().forEach((s) => s.track?.stop());
        pcRef.current.close();
      } catch {
        /* noop */
      }
      pcRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const showJpegFrame = useCallback((bytes: Uint8Array) => {
    const frame = new Uint8Array(bytes.length);
    frame.set(bytes);
    const nextUrl = URL.createObjectURL(new Blob([frame.buffer], { type: "image/jpeg" }));
    const image = imageRef.current;
    if (!image) {
      URL.revokeObjectURL(nextUrl);
      return;
    }
    const previousUrl = frameUrlRef.current;
    frameUrlRef.current = nextUrl;
    image.src = nextUrl;
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    setStatus("live");
  }, []);

  const connectMjpeg = useCallback(async (source: NdiSource) => {
    closeConnection();
    setStatus("connecting");
    const paths = [source.path, ...(source.fallbackPaths || [])].filter(Boolean) as string[];
    const targets = playbackBases(base).flatMap((candidateBase) =>
      paths.map((path) => `${candidateBase}${path}${path.includes("?") ? "&" : "?"}_=${Date.now()}`),
    );
    const headers: Record<string, string> = { Accept: "multipart/x-mixed-replace,image/jpeg,*/*" };
    if (vmixUser) headers.Authorization = `Basic ${btoa(`${vmixUser}:${vmixPass || ""}`)}`;

    for (const target of targets) {
      const controller = new AbortController();
      mjpegAbortRef.current = controller;
      try {
        const response = await fetch(target, { headers, cache: "no-store", mode: "cors", signal: controller.signal });
        if (!response.ok || !response.body) throw new Error(`MJPEG ${response.status}`);
        const reader = response.body.getReader();
        let buffer = new Uint8Array(0);
        while (!controller.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) break;
          const merged = new Uint8Array(buffer.length + value.length);
          merged.set(buffer);
          merged.set(value, buffer.length);
          buffer = merged;

          let start = -1;
          let end = -1;
          for (let index = 0; index < buffer.length - 1; index += 1) {
            if (start < 0 && buffer[index] === 0xff && buffer[index + 1] === 0xd8) start = index;
            if (start >= 0 && buffer[index] === 0xff && buffer[index + 1] === 0xd9) {
              end = index + 2;
              break;
            }
          }
          if (start >= 0 && end > start) {
            showJpegFrame(buffer.slice(start, end));
            buffer = buffer.slice(end);
          } else if (buffer.length > 8_000_000) {
            buffer = buffer.slice(-1_000_000);
          }
        }
        if (!controller.signal.aborted) throw new Error("Fluxo MJPEG encerrado");
        return;
      } catch (error) {
        if (controller.signal.aborted) return;
      }
    }
    setStatus("error");
  }, [base, closeConnection, showJpegFrame, vmixPass, vmixUser]);

  // WHEP (WebRTC-HTTP Egress Protocol) subscriber
  const connectWebRTC = useCallback(
    async (url: string) => {
      closeConnection();
      setStatus("connecting");
      try {
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
        pcRef.current = pc;
        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        const remoteStream = new MediaStream();
        pc.ontrack = (ev) => {
          remoteStream.addTrack(ev.track);
          if (videoRef.current) videoRef.current.srcObject = remoteStream;
        };
        pc.onconnectionstatechange = () => {
          if (!pcRef.current) return;
          if (pc.connectionState === "connected") setStatus("live");
          if (pc.connectionState === "failed" || pc.connectionState === "disconnected") setStatus("error");
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: offer.sdp || "",
        });
        if (!res.ok) throw new Error(`WHEP ${res.status}`);
        await pc.setRemoteDescription({ type: "answer", sdp: await res.text() });
      } catch {
        setStatus("error");
        closeConnection();
      }
    },
    [closeConnection],
  );

  useEffect(() => () => closeConnection(), [closeConnection]);

  const current = sources.find((s) => s.url === selected) || null;

  const handleChange = (url: string) => {
    setSelected(url);
    closeConnection();
    if (!url) {
      setStatus("idle");
      return;
    }
    const src = sources.find((s) => s.url === url);
    if (src?.kind === "whep") {
      void connectWebRTC(url);
    } else {
      setPlaybackAttempt(0);
      setReloadKey((k) => k + 1);
      if (src) void connectMjpeg(src);
    }
  };

  const statusMeta: Record<Status, { label: string; color: string }> = {
    idle: { label: "SEM FONTE", color: "#6b7280" },
    connecting: { label: "CONECTANDO", color: "#facc15" },
    live: { label: "AO VIVO", color: "#C6F03C" },
    error: { label: "SEM SINAL", color: "#ef4444" },
  };
  const meta = statusMeta[status];

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: "#C6F03C" }}>
          Fonte NDI (vMix)
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

      <div className="flex gap-1.5 mb-1.5">
        <select
          value={selected}
          onChange={(e) => handleChange(e.target.value)}
          disabled={!sources.length}
          className="flex-1 h-9 rounded text-[11px] font-bold uppercase tracking-wider px-2.5 outline-none"
          style={{
            backgroundColor: "#1a1a1a",
            color: sources.length ? "#e5e5e5" : "#ffffff50",
            border: "1px solid #C6F03C50",
          }}
        >
          <option value="">
            {sources.length ? "— Selecionar fonte —" : "— Conecte ao vMix para listar as fontes —"}
          </option>
          {sources.map((s) => (
            <option key={s.url} value={s.url}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            void onRefresh?.();
            setReloadKey((k) => k + 1);
            setPlaybackAttempt(0);
            void discoverBridge(host);
            if (current?.kind === "whep") void connectWebRTC(current.url);
            if (current?.kind === "mjpeg") void connectMjpeg(current);
          }}
          className="h-9 px-2.5 rounded text-[9px] font-black uppercase tracking-widest"
          style={{ backgroundColor: "#C6F03C", color: "#000" }}
        >
          Atualizar
        </button>
      </div>

      <p className="text-[9px] font-bold uppercase tracking-wider mb-2.5" style={{ color: "#ffffff45" }}>
        {sources.length
          ? `${sources.length} fonte(s) sincronizada(s) do vMix${host ? ` em ${host}` : ""}`
          : "Nenhuma entrada carregada do vMix"}
      </p>

      <div
        className="relative w-full overflow-hidden rounded"
        style={{ paddingBottom: "56.25%", backgroundColor: "#000", border: "1px solid #C6F03C25" }}
      >
        {current?.kind === "mjpeg" ? (
          <img
            ref={imageRef}
            alt={current?.label || "Fonte NDI"}
            className="absolute"
            style={{ top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", visibility: status === "live" ? "visible" : "hidden" }}
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            muted
            playsInline
            className="absolute"
            style={{ top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }}
          />
        )}
        {status !== "live" && (
          <div
            className="absolute flex items-center justify-center text-center px-3 text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ top: 0, left: 0, right: 0, bottom: 0, color: "#ffffff40" }}
          >
            {status === "connecting"
              ? "Conectando…"
              : status === "error"
                ? "Sem sinal · libere o Web Controller e o acesso HTTP local"
                : "Selecione uma fonte NDI"}
          </div>
        )}
      </div>
    </section>
  );
}
