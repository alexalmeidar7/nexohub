import { useEffect, useRef, useState } from "react";

type NdiSource = { label: string; url: string };

const MOCK_SOURCES: NdiSource[] = [
  { label: "Estúdio 1 (NDI 1)", url: "http://localhost:8889/estudio1/whep" },
  { label: "Estúdio 2 (NDI 2)", url: "http://localhost:8889/estudio2/whep" },
  { label: "Estúdio 3 (NDI 3)", url: "http://localhost:8889/estudio3/whep" },
];

type Status = "idle" | "connecting" | "live" | "error";

export default function NdiWebrtcMonitor() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [sources] = useState<NdiSource[]>(MOCK_SOURCES);
  const [selected, setSelected] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");

  const closeConnection = () => {
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
  };

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

  useEffect(() => () => closeConnection(), []);

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

      <select
        value={selected}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full h-9 rounded text-[11px] font-bold uppercase tracking-wider px-2.5 outline-none mb-2.5"
        style={{ backgroundColor: "#1a1a1a", color: "#e5e5e5", border: "1px solid #C6F03C50" }}
      >
        <option value="">— Selecionar fonte —</option>
        {sources.map((s) => (
          <option key={s.url} value={s.url}>
            {s.label}
          </option>
        ))}
      </select>

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
