import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Volume2, VolumeX, Radio, Wifi, WifiOff } from "lucide-react";
import { usePageTitle } from "@/hooks/usePageTitle";

const CHANNEL_NAME = "intercom-signal";

export default function IntercomListener() {
  usePageTitle("Intercomunicador — Receptor");
  const [params] = useSearchParams();
  const uid = params.get("uid");

  const [connected, setConnected] = useState(false);
  const [speakerOnline, setSpeakerOnline] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [peerState, setPeerState] = useState("");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);

  useEffect(() => {
    if (!uid) { setError("Parâmetro 'uid' não encontrado na URL."); return; }

    const presenceKey = `listener-${Date.now()}`;
    const ch = supabase.channel(`${CHANNEL_NAME}-${uid}`, {
      config: { broadcast: { self: false, ack: true }, presence: { key: presenceKey } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const hasSpeaker = Object.values(state).some((entries: any) =>
        entries.some((e: any) => e.role === "speaker")
      );
      setSpeakerOnline(hasSpeaker);
      console.log("[Intercom Listener] Presence sync — speaker online:", hasSpeaker);
    });

    const handleOffer = async (payload: any) => {
      try {
        console.log("[Intercom Listener] Received offer");
        pcRef.current?.close();
        remoteDescSetRef.current = false;
        pendingCandidatesRef.current = [];

        const pc = new RTCPeerConnection({
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        });
        pcRef.current = pc;

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            ch.send({ type: "broadcast", event: "ice-candidate-listener", payload: { candidate: ev.candidate.toJSON() } });
          }
        };

        pc.ontrack = (ev) => {
          console.log("[Intercom Listener] Got audio track, streams:", ev.streams.length);
          setReceiving(true);
          if (audioRef.current) {
            audioRef.current.srcObject = ev.streams[0] || new MediaStream([ev.track]);
            audioRef.current.play().catch((e) => {
              console.warn("[Intercom Listener] Autoplay blocked, user interaction needed:", e.message);
            });
          }
        };

        pc.onconnectionstatechange = () => {
          const s = pc.connectionState;
          console.log("[Intercom Listener] Connection state:", s);
          setPeerState(s);
          if (s === "disconnected" || s === "failed" || s === "closed") {
            setReceiving(false);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("[Intercom Listener] ICE state:", pc.iceConnectionState);
        };

        console.log("[Intercom Listener] Setting remote description...");
        await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.sdp.type, sdp: payload.sdp.sdp }));
        remoteDescSetRef.current = true;
        console.log("[Intercom Listener] Remote description set");

        // Flush queued candidates
        for (const c of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
        }
        console.log("[Intercom Listener] Flushed", pendingCandidatesRef.current.length, "queued candidates");
        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log("[Intercom Listener] Answer created, sending...");

        const sendResult = await ch.send({
          type: "broadcast",
          event: "answer",
          payload: { sdp: { type: answer.type, sdp: answer.sdp } },
        });
        console.log("[Intercom Listener] Answer send result:", sendResult);
      } catch (e) {
        console.error("[Intercom Listener] Error handling offer:", e);
        setError("Erro ao conectar áudio");
      }
    };

    ch.on("broadcast", { event: "offer" }, ({ payload }) => handleOffer(payload));

    ch.on("broadcast", { event: "ice-candidate-speaker" }, async ({ payload }) => {
      try {
        if (!payload.candidate) return;
        if (pcRef.current && remoteDescSetRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } else {
          pendingCandidatesRef.current.push(payload.candidate);
        }
      } catch (e) { console.error("[Intercom Listener] Error adding ICE:", e); }
    });

    ch.on("broadcast", { event: "hangup" }, () => {
      console.log("[Intercom Listener] Speaker hung up");
      pcRef.current?.close();
      pcRef.current = null;
      remoteDescSetRef.current = false;
      pendingCandidatesRef.current = [];
      setReceiving(false);
      setPeerState("");
      if (audioRef.current) audioRef.current.srcObject = null;
    });

    ch.subscribe(async (status) => {
      console.log("[Intercom Listener] Channel status:", status);
      if (status === "SUBSCRIBED") {
        setConnected(true);
        await ch.track({ role: "listener", online: true });
      }
    });

    return () => {
      pcRef.current?.close();
      pcRef.current = null;
      ch.untrack();
      supabase.removeChannel(ch);
    };
  }, [uid]);

  const toggleMute = () => {
    setMuted((m) => {
      if (audioRef.current) audioRef.current.muted = !m;
      return !m;
    });
  };

  // Autoplay unlock: user needs to click page at least once
  const handleUnlock = () => {
    if (audioRef.current && audioRef.current.srcObject) {
      audioRef.current.play().catch(console.warn);
    }
  };

  if (!uid) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0a0e2a 0%, #0f1058 50%, #1a1040 100%)", color: "#fff" }}>
        <p className="text-lg">Parâmetro <code className="bg-white/10 px-2 py-1 rounded">?uid=...</code> obrigatório na URL.</p>
      </div>
    );
  }

  return (
    <div onClick={handleUnlock}
      className="h-screen w-screen flex flex-col items-center justify-center gap-0 relative overflow-hidden select-none"
      style={{ background: "linear-gradient(160deg, #060a20 0%, #0c1040 40%, #10154a 70%, #0a0e2a 100%)", color: "#fff" }}>
      <audio ref={audioRef} autoPlay playsInline />

      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, #268ffa 0%, transparent 70%)", opacity: receiving ? 0.3 : 0.08, transition: "opacity 1s ease" }} />
      </div>

      {/* Top status bar */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between px-6 py-4 z-10">
        <div className="flex items-center gap-2">
          {connected ? <Wifi size={14} className="text-green-400/60" /> : <WifiOff size={14} className="text-red-400/60" />}
          <span className="text-[11px] text-white/30">{connected ? "Conectado" : "Conectando..."}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: speakerOnline ? "#22c55e" : "#444" }} />
          <span className="text-[11px] text-white/30">{speakerOnline ? "Speaker online" : "Speaker offline"}</span>
        </div>
      </div>

      {/* Center */}
      <div className="flex flex-col items-center gap-8 z-10">
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "rgba(38,143,250,0.1)", border: "1px solid rgba(38,143,250,0.2)" }}>
            <Radio size={28} style={{ color: "#268ffa" }} />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold tracking-tight">Intercomunicador</h1>
            <p className="text-xs text-white/30 mt-1">Receptor de Áudio</p>
          </div>
        </div>

        {/* Audio visualizer */}
        <div className="relative">
          {receiving && (
            <>
              <div className="absolute inset-0 rounded-full animate-ping" style={{ border: "2px solid rgba(38,143,250,0.15)", animationDuration: "2s" }} />
              <div className="absolute -inset-4 rounded-full animate-ping" style={{ border: "1px solid rgba(38,143,250,0.08)", animationDuration: "3s" }} />
            </>
          )}
          <div className="w-36 h-36 rounded-full flex items-center justify-center transition-all duration-500"
            style={{
              background: receiving
                ? "radial-gradient(circle at 40% 40%, rgba(38,143,250,0.25) 0%, rgba(38,143,250,0.05) 70%)"
                : "radial-gradient(circle at 40% 40%, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 70%)",
              border: `2px solid ${receiving ? "rgba(38,143,250,0.4)" : "rgba(255,255,255,0.08)"}`,
              boxShadow: receiving ? "0 0 60px rgba(38,143,250,0.15), inset 0 0 30px rgba(38,143,250,0.1)" : "none",
            }}>
            {receiving ? (
              <div className="flex items-end gap-[3px] h-12">
                {[0.5, 0.8, 1, 0.7, 0.9, 0.6, 0.85].map((h, i) => (
                  <div key={i} className="w-[4px] rounded-full"
                    style={{ backgroundColor: "#268ffa", height: `${h * 100}%`, animation: `listenerBar 0.${3 + i * 2}s ease-in-out infinite alternate` }} />
                ))}
              </div>
            ) : (
              <Volume2 size={36} style={{ color: "rgba(255,255,255,0.12)" }} />
            )}
          </div>
        </div>

        <p className="text-sm font-medium" style={{ color: receiving ? "#268ffa" : "rgba(255,255,255,0.25)" }}>
          {receiving ? "Recebendo áudio" : "Aguardando transmissão"}
        </p>

        <button onClick={toggleMute}
          className="flex items-center gap-2.5 px-6 py-3 rounded-full text-sm font-medium transition-all hover:scale-105 active:scale-95"
          style={{
            backgroundColor: muted ? "rgba(239,68,68,0.1)" : "rgba(38,143,250,0.1)",
            color: muted ? "#ef4444" : "#268ffa",
            border: `1px solid ${muted ? "rgba(239,68,68,0.2)" : "rgba(38,143,250,0.2)"}`,
            backdropFilter: "blur(12px)",
          }}>
          {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          {muted ? "Som desativado" : "Som ativado"}
        </button>

        {peerState && peerState !== "connected" && peerState !== "new" && (
          <p className="text-[11px] text-white/20">Estado: {peerState}</p>
        )}
      </div>

      {error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <p className="text-sm text-red-400 bg-red-400/10 px-4 py-2 rounded-full border border-red-400/20">{error}</p>
        </div>
      )}

      <style>{`
        @keyframes listenerBar {
          0% { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
