import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Volume2, Volume1, VolumeX, Radio, Wifi, WifiOff } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { usePageTitle } from "@/hooks/usePageTitle";

const CHANNEL_NAME = "intercom-signal";
const LISTENER_PRESENCE_NAME = "Página ouvinte";

export default function IntercomListener() {
  usePageTitle("Intercomunicador — Receptor");
  const [params] = useSearchParams();
  const uid = params.get("uid");
  const nomeParam = (params.get("nome") || "").trim();

  const [connected, setConnected] = useState(false);
  const [speakerOnline, setSpeakerOnline] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem("intercom-listener-volume");
    return saved ? Number(saved) : 100;
  });
  const [error, setError] = useState<string | null>(null);
  const [peerState, setPeerState] = useState("");
  const [audioUnlockRequired, setAudioUnlockRequired] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const mutedRef = useRef(false);
  const volumeRef = useRef(100);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    mutedRef.current = muted;
    if (audioRef.current) {
      const shouldMute = muted || volumeRef.current === 0;
      audioRef.current.defaultMuted = shouldMute;
      audioRef.current.muted = shouldMute;
    }
  }, [muted]);

  useEffect(() => {
    volumeRef.current = volume;
    localStorage.setItem("intercom-listener-volume", String(volume));
    if (audioRef.current) {
      const shouldMute = mutedRef.current || volume === 0;
      audioRef.current.volume = volume / 100;
      audioRef.current.defaultMuted = shouldMute;
      audioRef.current.muted = shouldMute;
    }
  }, [volume]);

  const tryPlayAudio = useCallback(async () => {
    const audio = audioRef.current;

    if (!audio || !audio.srcObject) return false;

    const shouldMute = mutedRef.current || volumeRef.current === 0;
    audio.defaultMuted = shouldMute;
    audio.muted = shouldMute;
    audio.volume = volumeRef.current / 100;

    try {
      await audio.play();
      setAudioUnlockRequired(false);
      setError(null);
      return true;
    } catch (e: any) {
      const errorName = e?.name ?? "";
      console.warn("[Intercom Listener] Playback pending user action:", errorName || e);

      if (!mutedRef.current) {
        setAudioUnlockRequired(true);
      }

      return false;
    }
  }, []);

  useEffect(() => {
    if (!uid) {
      setError("Parâmetro 'uid' não encontrado na URL.");
      return;
    }

    setError(null);

    const presenceKey = `listener-page-${Date.now()}`;
    const ch = supabase.channel(`${CHANNEL_NAME}-${uid}`, {
      config: { broadcast: { self: false, ack: true }, presence: { key: presenceKey } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const hasSpeaker = Object.values(state).some((entries: any) =>
        entries.some((entry: any) => entry.role === "speaker")
      );

      setSpeakerOnline(hasSpeaker);
      console.log("[Intercom Listener] Presence sync — speaker online:", hasSpeaker);
    });

    const handleOffer = async (payload: any) => {
      try {
        console.log("[Intercom Listener] Received offer");
        setError(null);
        setAudioUnlockRequired(false);
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
          const stream = ev.streams[0] || new MediaStream([ev.track]);
          const markReceiving = () => {
            setReceiving(true);
            void tryPlayAudio();
          };

          // Setup AnalyserNode for VU meter
          try {
            if (!audioCtxRef.current) {
              audioCtxRef.current = new AudioContext();
            }
            const ctx = audioCtxRef.current;
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.6;
            source.connect(analyser);
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const tick = () => {
              analyser.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const avg = sum / dataArray.length / 255;
              setAudioLevel(avg);
              rafRef.current = requestAnimationFrame(tick);
            };
            rafRef.current = requestAnimationFrame(tick);
          } catch (e) {
            console.warn("[Intercom Listener] AnalyserNode setup failed:", e);
          }

          ev.track.onunmute = markReceiving;
          ev.track.onmute = () => setReceiving(false);
          ev.track.onended = () => setReceiving(false);

          if (audioRef.current) {
            audioRef.current.srcObject = stream;
            const shouldMute = mutedRef.current || volumeRef.current === 0;
            audioRef.current.defaultMuted = shouldMute;
            audioRef.current.muted = shouldMute;
            audioRef.current.volume = volumeRef.current / 100;
            audioRef.current.onloadedmetadata = () => {
              const nextShouldMute = mutedRef.current || volumeRef.current === 0;
              if (audioRef.current) {
                audioRef.current.defaultMuted = nextShouldMute;
                audioRef.current.muted = nextShouldMute;
                audioRef.current.volume = volumeRef.current / 100;
              }
              void tryPlayAudio();
            };
            audioRef.current.oncanplay = () => {
              const nextShouldMute = mutedRef.current || volumeRef.current === 0;
              if (audioRef.current) {
                audioRef.current.defaultMuted = nextShouldMute;
                audioRef.current.muted = nextShouldMute;
                audioRef.current.volume = volumeRef.current / 100;
              }
              void tryPlayAudio();
            };
          }

          if (!ev.track.muted) {
            markReceiving();
          }
        };

        pc.onconnectionstatechange = () => {
          const state = pc.connectionState;
          console.log("[Intercom Listener] Connection state:", state);
          setPeerState(state);

          if (state === "disconnected" || state === "failed" || state === "closed") {
            setReceiving(false);
            setAudioUnlockRequired(false);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("[Intercom Listener] ICE state:", pc.iceConnectionState);

          if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            void tryPlayAudio();
          }
        };

        pc.addTransceiver("audio", { direction: "recvonly" });

        console.log("[Intercom Listener] Setting remote description...");
        await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.sdp.type, sdp: payload.sdp.sdp }));
        remoteDescSetRef.current = true;
        console.log("[Intercom Listener] Remote description set");

        for (const candidate of pendingCandidatesRef.current) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(console.warn);
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

    ch.on("broadcast", { event: "offer" }, ({ payload }) => {
      void handleOffer(payload);
    });

    ch.on("broadcast", { event: "ice-candidate-speaker" }, async ({ payload }) => {
      try {
        if (!payload.candidate) return;

        if (pcRef.current && remoteDescSetRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        } else {
          pendingCandidatesRef.current.push(payload.candidate);
        }
      } catch (e) {
        console.error("[Intercom Listener] Error adding ICE:", e);
      }
    });

    ch.on("broadcast", { event: "hangup" }, () => {
      console.log("[Intercom Listener] Speaker hung up");
      cancelAnimationFrame(rafRef.current);
      pcRef.current?.close();
      pcRef.current = null;
      analyserRef.current = null;
      remoteDescSetRef.current = false;
      pendingCandidatesRef.current = [];
      setReceiving(false);
      setAudioLevel(0);
      setPeerState("");
      setAudioUnlockRequired(false);

      if (audioRef.current) {
        audioRef.current.srcObject = null;
      }
    });

    ch.subscribe(async (status) => {
      console.log("[Intercom Listener] Channel status:", status);

      if (status === "SUBSCRIBED") {
        setConnected(true);
        await ch.track({ role: "listener", online: true, name: nomeParam || LISTENER_PRESENCE_NAME });
      }
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      pcRef.current?.close();
      pcRef.current = null;
      analyserRef.current = null;
      ch.untrack();
      supabase.removeChannel(ch);
      setAudioUnlockRequired(false);
    };
  }, [uid, tryPlayAudio]);

  const toggleMute = () => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);

    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }

    if (!nextMuted) {
      void tryPlayAudio();
    }
  };

  const handleUnlock = () => {
    void tryPlayAudio();
  };

  if (!uid) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0a0e2a 0%, #0f1058 50%, #1a1040 100%)", color: "#fff" }}>
        <p className="text-lg">Parâmetro <code className="bg-white/10 px-2 py-1 rounded">?uid=...</code> obrigatório na URL.</p>
      </div>
    );
  }

  return (
    <div
      onPointerDown={handleUnlock}
      className="h-screen w-screen flex flex-col items-center justify-center gap-0 relative overflow-hidden select-none"
      style={{ background: "linear-gradient(160deg, #060a20 0%, #0c1040 40%, #10154a 70%, #0a0e2a 100%)", color: "#fff" }}
    >
      <audio ref={audioRef} autoPlay playsInline />

      {audioUnlockRequired && receiving && !muted && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6" style={{ backgroundColor: "rgba(6,10,32,0.38)", backdropFilter: "blur(4px)" }}>
          <button
            onClick={handleUnlock}
            className="rounded-full px-5 py-3 text-sm font-semibold transition-transform hover:scale-105 active:scale-95"
            style={{
              backgroundColor: "rgba(38,143,250,0.16)",
              color: "#fff",
              border: "1px solid rgba(38,143,250,0.35)",
              boxShadow: "0 10px 30px rgba(0,0,0,0.25)",
            }}
          >
            Toque para ativar o áudio
          </button>
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{ background: "radial-gradient(circle, #268ffa 0%, transparent 70%)", opacity: receiving ? 0.3 : 0.08, transition: "opacity 1s ease" }}
        />
      </div>

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

        <div className="relative">
          {receiving && (
            <>
              <div className="absolute inset-0 rounded-full animate-ping" style={{ border: "2px solid rgba(38,143,250,0.15)", animationDuration: "2s" }} />
              <div className="absolute -inset-4 rounded-full animate-ping" style={{ border: "1px solid rgba(38,143,250,0.08)", animationDuration: "3s" }} />
            </>
          )}
          <div
            className="w-36 h-36 rounded-full flex items-center justify-center transition-all duration-500"
            style={{
              background: receiving
                ? "radial-gradient(circle at 40% 40%, rgba(38,143,250,0.25) 0%, rgba(38,143,250,0.05) 70%)"
                : "radial-gradient(circle at 40% 40%, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 70%)",
              border: `2px solid ${receiving ? "rgba(38,143,250,0.4)" : "rgba(255,255,255,0.08)"}`,
              boxShadow: receiving ? "0 0 60px rgba(38,143,250,0.15), inset 0 0 30px rgba(38,143,250,0.1)" : "none",
            }}
          >
            {receiving ? (
              <div className="flex items-end gap-[3px] h-12">
                {[0.6, 0.75, 0.9, 1, 0.85, 0.7, 0.55].map((sensitivity, index) => {
                  const barLevel = Math.min(1, audioLevel * sensitivity * 2.5);
                  const minHeight = 0.08;
                  const h = Math.max(minHeight, barLevel);
                  return (
                    <div
                      key={index}
                      className="w-[4px] rounded-full transition-all duration-75"
                      style={{
                        backgroundColor: h > 0.7 ? "#22c55e" : h > 0.4 ? "#268ffa" : "rgba(38,143,250,0.5)",
                        height: `${h * 100}%`,
                      }}
                    />
                  );
                })}
              </div>
            ) : (
              <Volume2 size={36} style={{ color: "rgba(255,255,255,0.12)" }} />
            )}
          </div>
        </div>

        <p className="text-sm font-medium" style={{ color: receiving ? "#268ffa" : "rgba(255,255,255,0.25)" }}>
          {receiving ? "Recebendo áudio" : "Aguardando transmissão"}
        </p>

        <div className="flex items-center gap-3 w-56">
          <button
            onClick={toggleMute}
            className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 active:scale-95"
            style={{
              backgroundColor: muted ? "rgba(239,68,68,0.1)" : "rgba(38,143,250,0.1)",
              color: muted ? "#ef4444" : "#268ffa",
              border: `1px solid ${muted ? "rgba(239,68,68,0.2)" : "rgba(38,143,250,0.2)"}`,
            }}
          >
            {muted ? <VolumeX size={18} /> : volume < 50 ? <Volume1 size={18} /> : <Volume2 size={18} />}
          </button>
          <Slider
            value={[muted ? 0 : volume]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => {
              if (v === 0) {
                setMuted(true);
              } else {
                if (muted) setMuted(false);
                setVolume(v);
              }
              if (audioRef.current) {
                audioRef.current.volume = v / 100;
                audioRef.current.muted = v === 0;
              }
            }}
            className="flex-1 [&_[role=slider]]:h-4 [&_[role=slider]]:w-4 [&_[role=slider]]:border-[rgba(38,143,250,0.5)] [&_[role=slider]]:bg-[#268ffa] [&_.relative]:h-1.5 [&_[data-orientation=horizontal]>.absolute]:bg-[#268ffa]"
          />
          <span className="text-[11px] text-white/40 w-7 text-right tabular-nums">{muted ? 0 : volume}</span>
        </div>

        {peerState && peerState !== "connected" && peerState !== "new" && (
          <p className="text-[11px] text-white/20">Estado: {peerState}</p>
        )}
      </div>

      {error && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10">
          <p className="text-sm text-red-400 bg-red-400/10 px-4 py-2 rounded-full border border-red-400/20">{error}</p>
        </div>
      )}

    </div>
  );
}
