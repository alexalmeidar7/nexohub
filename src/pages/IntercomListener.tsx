import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Volume2, VolumeX, Radio } from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";

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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!uid) {
      setError("Parâmetro 'uid' não encontrado na URL.");
      return;
    }

    const ch = supabase.channel(`${CHANNEL_NAME}-${uid}`, { config: { presence: { key: "listener" } } });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const speakers = Object.keys(state).filter((k) => k.startsWith("speaker"));
      setSpeakerOnline(speakers.length > 0);
    });

    ch.on("broadcast", { event: "offer" }, async ({ payload }) => {
      try {
        // Cleanup previous connection
        pcRef.current?.close();

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        pc.onicecandidate = (ev) => {
          if (ev.candidate) {
            ch.send({
              type: "broadcast",
              event: "ice-candidate-listener",
              payload: { candidate: ev.candidate.toJSON() },
            });
          }
        };

        pc.ontrack = (ev) => {
          setReceiving(true);
          if (audioRef.current) {
            audioRef.current.srcObject = ev.streams[0];
            audioRef.current.play().catch(console.error);
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
            setReceiving(false);
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        ch.send({
          type: "broadcast",
          event: "answer",
          payload: { sdp: pc.localDescription },
        });
      } catch (e) {
        console.error("Error handling offer:", e);
        setError("Erro ao conectar áudio");
      }
    });

    ch.on("broadcast", { event: "ice-candidate-speaker" }, async ({ payload }) => {
      try {
        if (pcRef.current && payload.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (e) {
        console.error("Error adding ICE:", e);
      }
    });

    ch.on("broadcast", { event: "hangup" }, () => {
      pcRef.current?.close();
      pcRef.current = null;
      setReceiving(false);
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        await ch.track({ online: true, role: "listener" });
      }
    });

    channelRef.current = ch;

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

  if (!uid) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ backgroundColor: "#0f1058", color: "#fff" }}>
        <p className="text-lg">Parâmetro <code className="bg-white/10 px-2 py-1 rounded">?uid=...</code> obrigatório na URL.</p>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col items-center justify-center gap-6" style={{ backgroundColor: "#0f1058", color: "#fff" }}>
      <audio ref={audioRef} autoPlay playsInline />

      <div className="flex flex-col items-center gap-2">
        <Radio size={48} style={{ color: "#268ffa" }} />
        <h1 className="text-2xl font-bold">Intercomunicador</h1>
        <p className="text-sm opacity-60">Página do Receptor</p>
      </div>

      {/* Connection status */}
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: connected ? "#22c55e" : "#ef4444" }} />
          {connected ? "Conectado ao canal" : "Conectando..."}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: speakerOnline ? "#22c55e" : "#666" }} />
          {speakerOnline ? "Speaker online" : "Speaker offline"}
        </div>
      </div>

      {/* Receiving indicator */}
      <div
        className="w-32 h-32 rounded-full flex items-center justify-center transition-all"
        style={{
          backgroundColor: receiving ? "#268ffa22" : "#ffffff08",
          border: `3px solid ${receiving ? "#268ffa" : "#ffffff22"}`,
          boxShadow: receiving ? "0 0 40px #268ffa44" : "none",
        }}
      >
        {receiving ? (
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-2 rounded-full animate-pulse"
                style={{
                  backgroundColor: "#268ffa",
                  height: `${12 + Math.random() * 28}px`,
                  animationDelay: `${i * 0.12}s`,
                }}
              />
            ))}
          </div>
        ) : (
          <Volume2 size={40} style={{ color: "#ffffff33" }} />
        )}
      </div>

      <p className="text-sm" style={{ color: receiving ? "#268ffa" : "#ffffff66" }}>
        {receiving ? "Recebendo áudio..." : "Aguardando transmissão"}
      </p>

      {/* Mute toggle */}
      <button
        onClick={toggleMute}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium transition-all hover:scale-105"
        style={{
          backgroundColor: muted ? "#ef444422" : "#268ffa22",
          color: muted ? "#ef4444" : "#268ffa",
          border: `1px solid ${muted ? "#ef444444" : "#268ffa44"}`,
        }}
      >
        {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
        {muted ? "Som desativado" : "Som ativado"}
      </button>

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
