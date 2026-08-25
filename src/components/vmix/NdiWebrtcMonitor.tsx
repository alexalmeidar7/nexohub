import { useCallback, useEffect, useRef, useState } from "react";

type NdiSource = { label: string; url: string };

type Status = "idle" | "connecting" | "live" | "error";
type Discovery = "idle" | "scanning" | "found" | "empty" | "unreachable";

const WHEP_PORT = 8889;
const API_PORT = 9997;

function hostFromUrl(raw?: string | null): string {
  if (!raw) return "";
  let v = raw.trim();
  if (!v) return "";
  if (!/^https?:\/\//i.test(v)) v = "http://" + v;
  try {
    return new URL(v).hostname;
  } catch {
    return "";
  }
}

export default function NdiWebrtcMonitor({ vmixBaseUrl }: { vmixBaseUrl?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [sources, setSources] = useState<NdiSource[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [discovery, setDiscovery] = useState<Discovery>("idle");

  const defaultHost = hostFromUrl(vmixBaseUrl) || "127.0.0.1";
  const [host, setHost] = useState<string>(defaultHost);

  useEffect(() => {
    setHost((prev) => (prev && prev !== "127.0.0.1" ? prev : defaultHost));
  }, [defaultHost]);

  const closeConnection = useCallback(() => {
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

  // Discovery: lists the streams currently published on the local WebRTC/NDI
  // bridge (MediaMTX-compatible API). Each published path = one NDI source.
  const discoverSources = useCallback(async (targetHost: string) => {
    const h = (targetHost || "").trim();
    if (!h) {
      setSources([]);
      setDiscovery("unreachable");
      return;
    }
    setDiscovery("scanning");

    const endpoints = [
      `http://${h}:${API_PORT}/v3/paths/list`,
      `http://${h}:${API_PORT}/v2/paths/list`,
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, { signal: AbortSignal.timeout(4000) });
        if (!res.ok) continue;
        const json = await res.json();

        const items: any[] = Array.isArray(json?.items)
          ? json.items
          : json?.items && typeof json.items === "object"
            ? Object.entries(json.items).map(([name, v]) => ({ name, ...(v as object) }))
            : [];

        const found: NdiSource[] = items
          .map((it) => {
            const name: string = it?.name ?? "";
            if (!name) return null;
            const ready = it?.ready !== false;
            return {
              label: `${name.replace(/[_-]+/g, " ").toUpperCase()}${ready ? "" : " (offline)"}`,
              url: `http://${h}:${WHEP_PORT}/${name}/whep`,
            };
          })
          .filter(Boolean) as NdiSource[];

        setSources(found);
        setDiscovery(found.length ? "found" : "empty");
        return;
      } catch {
        /* try next endpoint */
      }
    }

    setSources([]);
    setDiscovery("unreachable");
  }, []);

  useEffect(() => {
    void discoverSources(defaultHost);
  }, [defaultHost, discoverSources]);

  // WHEP (WebRTC-HTTP Egress Protocol) subscriber
  const connectWebRTC = async (url: string) => {
    closeConnection();
    if (!url) {
      setStatus("idle");
      return;
    }
    setStatus("connecting");

    try {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
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
      const answer = await res.text();
      await pc.setRemoteDescription({ type: "answer", sdp: answer });
    } catch {
      setStatus("error");
      closeConnection();
    }
  };

  useEffect(() => () => closeConnection(), [closeConnection]);

  const handleChange = (url: string) => {
    setSelected(url);
    void connectWebRTC(url);
  };

  const statusMeta: Record<Status, { label: string; color: string }> = {
    idle: { label: "SEM FONTE", color: "#6b7280" },
    connecting: { label: "CONECTANDO", color: "#facc15" },
    live: { label: "AO VIVO", color: "#C6F03C" },
    error: { label: "SEM SINAL", color: "#ef4444" },
  };
  const meta = statusMeta[status];

  const discoveryText =
    discovery === "scanning"
      ? "Buscando fontes na rede…"
      : discovery === "found"
        ? `${sources.length} fonte(s) encontrada(s) em ${host}`
        : discovery === "empty"
          ? `Nenhuma fonte publicada em ${host}`
          : discovery === "unreachable"
            ? `Bridge NDI/WebRTC não encontrada em ${host}:${API_PORT}`
            : "";

  return (
    <section>
      <div className="flex items-center justify-between mb-2.5 gap-2">
        <h3 className="text-[10px] font-black uppercase tracking-[0.25em]" style={{ color: "#C6F03C" }}>
          Fonte NDI (WebRTC)
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
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="IP do servidor NDI/WebRTC"
          className="flex-1 h-8 rounded text-[10px] font-bold tracking-wider px-2 outline-none"
          style={{ backgroundColor: "#111", color: "#e5e5e5", border: "1px solid #C6F03C30" }}
        />
        <button
          type="button"
          onClick={() => void discoverSources(host)}
          className="h-8 px-2.5 rounded text-[9px] font-black uppercase tracking-widest"
          style={{ backgroundColor: "#C6F03C", color: "#000" }}
        >
          {discovery === "scanning" ? "…" : "Buscar"}
        </button>
      </div>

      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        disabled={!sources.length}
        className="w-full h-9 rounded text-[11px] font-bold uppercase tracking-wider px-2.5 outline-none mb-1.5"
        style={{
          backgroundColor: "#1a1a1a",
          color: sources.length ? "#e5e5e5" : "#ffffff50",
          border: "1px solid #C6F03C50",
        }}
      >
        <option value="">{sources.length ? "— Selecionar fonte —" : "— Nenhuma fonte na rede —"}</option>
        {sources.map((s) => (
          <option key={s.url} value={s.url}>
            {s.label}
          </option>
        ))}
      </select>

      {discoveryText && (
        <p className="text-[9px] font-bold uppercase tracking-wider mb-2.5" style={{ color: discovery === "found" ? "#C6F03C99" : "#ffffff45" }}>
          {discoveryText}
        </p>
      )}

      <div
        className="relative w-full overflow-hidden rounded"
        style={{ paddingBottom: "56.25%", backgroundColor: "#000", border: "1px solid #C6F03C25" }}
      >
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="absolute"
          style={{ top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain" }}
        />
        {status !== "live" && (
          <div
            className="absolute flex items-center justify-center text-[10px] font-black uppercase tracking-[0.2em]"
            style={{ top: 0, left: 0, right: 0, bottom: 0, color: "#ffffff40" }}
          >
            {status === "connecting" ? "Conectando…" : status === "error" ? "Sem sinal" : "Selecione uma fonte NDI"}
          </div>
        )}
      </div>
    </section>
  );
}
