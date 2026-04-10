import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Volume2, VolumeX, Radio } from "lucide-react";
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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);

  useEffect(() => {
    if (!uid) {
      setError("Parâmetro 'uid' não encontrado na URL.");
      return;
    }

    const presenceKey = `listener-${Date.now()}`;
    const ch = supabase.channel(`${CHANNEL_NAME}-${uid}`, {
      config: { broadcast: { self: false }, presence: { key: presenceKey } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const hasSpeaker = Object.values(state).some((entries: any) =>
        entries.some((e: any) => e.role === "speaker")
      );
      setSpeakerOnline(hasSpeaker);
    });

    ch.on("broadcast", { event: "offer" }, async ({ payload }) => {
      try {
        console.log("[Intercom Listener] Received offer");
        // Cleanup previous connection
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
            ch.send({
              type: "broadcast",
              event: "ice-candidate-listener",
              payload: { candidate: ev.candidate.toJSON() },
            });
          }
        };

        pc.ontrack = (ev) => {
          console.log("[Intercom Listener] Received audio track");
          setReceiving(true);
          if (audioRef.current) {
            audioRef.current.srcObject = ev.streams[0];
            audioRef.current.play().catch((e) => {
              console.warn("[Intercom Listener] Autoplay blocked:", e);
            });
          }
        };

        pc.onconnectionstatechange = () => {
          console.log("[Intercom Listener] Connection state:", pc.connectionState);
          if (pc.connectionState === "disconnected" || pc.connectionState === "failed" || pc.connectionState === "closed") {
            setReceiving(false);
          }
        };

        // Set remote description with plain SDP object
        await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.sdp.type, sdp: payload.sdp.sdp }));
        remoteDescSetRef.current = true;

        // Flush any ICE candidates that arrived before the offer was processed
        for (const c of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
        }
        pendingCandidatesRef.current = [];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        console.log("[Intercom Listener] Sending answer");
        ch.send({
          type: "broadcast",
          event: "answer",
          payload: { sdp: { type: answer.type, sdp: answer.sdp } },
        });
      } catch (e) {
        console.error("[Intercom Listener] Error handling offer:", e);
        setError("Erro ao conectar áudio");
      }
    });

    ch.on("broadcast", { event: "ice-candidate-speaker" }, async ({ payload }) => {
      try {
        if (!payload.candidate) return;
        if (pcRef.current && remoteDescSetRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } else {
          // Queue candidates that arrive before remote description is set
          pendingCandidatesRef.current.push(payload.candidate);
        }
      } catch (e) {
        console.error("[Intercom Listener] Error adding ICE:", e);
      }
    });

    ch.on("broadcast", { event: "hangup" }, () => {
      console.log("[Intercom Listener] Speaker hung up");
      pcRef.current?.close();
      pcRef.current = null;
      remoteDescSetRef.current = false;
      pendingCandidatesRef.current = [];
      setReceiving(false);
      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        console.log("[Intercom Listener] Channel subscribed");
        setConnected(true);
        await ch.track({ role: "listener", online: true });
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
