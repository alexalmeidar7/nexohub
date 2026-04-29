import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Radio, X, Keyboard, Headphones, Users, ArrowLeft, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CHANNEL_NAME = "intercom-signal";
const HOTKEY_STORAGE_KEY = "intercom-hotkey";
const EXTERNAL_LISTENER_NAME = "Página ouvinte";

type Role = "none" | "speaker" | "listener";

interface ListenerInfo {
  presenceKey: string;
  name: string;
}

export default function IntercomWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>("none");
  const [listenerName, setListenerName] = useState("");
  const [nameInput, setNameInput] = useState("");

  // Speaker state
  const [talking, setTalking] = useState(false);
  const [onlineListeners, setOnlineListeners] = useState<ListenerInfo[]>([]);
  const [connectionState, setConnectionState] = useState("");
  const [hotkey, setHotkey] = useState<string>(() => localStorage.getItem(HOTKEY_STORAGE_KEY) || "");
  const [settingHotkey, setSettingHotkey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0); // 0-1 audio level

  // Listener state
  const [receiving, setReceiving] = useState(false);
  const [speakerOnline, setSpeakerOnline] = useState(false);
  const [listenerVolume, setListenerVolume] = useState<number>(() => {
    const saved = localStorage.getItem("intercom-listener-volume");
    return saved ? Math.max(0, Math.min(1, parseFloat(saved))) : 1;
  });
  const [audioBlocked, setAudioBlocked] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const talkingRef = useRef(false);
  const hotkeyRef = useRef(hotkey);
  const channelReadyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelRafRef = useRef<number>(0);
  const listenerVolumeRef = useRef<number>(1);
  const userId = user?.id;

  useEffect(() => { hotkeyRef.current = hotkey; }, [hotkey]);
  useEffect(() => { talkingRef.current = talking; }, [talking]);

  // ─── Signaling channel (shared by both roles) ───
  useEffect(() => {
    if (!userId || role === "none") return;
    // Don't join channel as listener until name is provided
    if (role === "listener" && !listenerName) return;

    console.log("[Intercom] Joining channel as", role, "uid:", userId.slice(0, 8));

    const presenceKey = role === "speaker"
      ? `speaker-${Date.now()}`
      : `listener-${Date.now()}`;

    const ch = supabase.channel(`${CHANNEL_NAME}-${userId}`, {
      config: { broadcast: { self: false, ack: true }, presence: { key: presenceKey } },
    });

    // ── Presence sync ──
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const listeners: ListenerInfo[] = [];
      let hasSpeaker = false;

      Object.entries(state).forEach(([key, entries]: [string, any]) => {
        entries.forEach((e: any) => {
          if (e.role === "listener") {
            const resolvedName = typeof e.name === "string" && e.name.trim()
              ? e.name.trim()
              : EXTERNAL_LISTENER_NAME;
            listeners.push({ presenceKey: key, name: resolvedName });
          }
          if (e.role === "speaker") hasSpeaker = true;
        });
      });

      if (role === "speaker") setOnlineListeners(listeners);
      if (role === "listener") setSpeakerOnline(hasSpeaker);
      console.log("[Intercom] Presence sync — listeners:", listeners.length, "speaker:", hasSpeaker);
    });

    // ── Speaker: listen for answer + listener ICE ──
    if (role === "speaker") {
      ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
        try {
          console.log("[Intercom Speaker] Received answer");
          const pc = pcRef.current;
          if (pc && payload.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.sdp.type, sdp: payload.sdp.sdp }));
            remoteDescSetRef.current = true;
            console.log("[Intercom Speaker] Remote description set, flushing", pendingCandidatesRef.current.length, "candidates");
            for (const c of pendingCandidatesRef.current) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
            }
            pendingCandidatesRef.current = [];
          }
        } catch (e) {
          console.error("[Intercom Speaker] Error setting answer:", e);
        }
      });

      ch.on("broadcast", { event: "ice-candidate-listener" }, async ({ payload }) => {
        try {
          if (!payload.candidate) return;
          if (pcRef.current && remoteDescSetRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            pendingCandidatesRef.current.push(payload.candidate);
          }
        } catch (e) {
          console.error("[Intercom Speaker] Error adding ICE:", e);
        }
      });
    }

    // ── Listener: listen for offer + speaker ICE + hangup ──
    if (role === "listener") {
      const handleOffer = async (payload: any) => {
        try {
          console.log("[Intercom Listener] Received offer, setting up peer connection");
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
              console.log("[Intercom Listener] Sending ICE candidate");
              ch.send({ type: "broadcast", event: "ice-candidate-listener", payload: { candidate: ev.candidate.toJSON() } });
            }
          };

          pc.ontrack = (ev) => {
            console.log("[Intercom Listener] Got audio track!");
            setReceiving(true);
            const stream = ev.streams[0] || new MediaStream([ev.track]);
            const el = audioRef.current;
            if (el) {
              try { el.pause(); } catch {}
              try { (el as any).srcObject = null; } catch {}
              el.srcObject = stream;
              el.muted = false;
              el.volume = listenerVolumeRef.current;
              const tryPlay = () => el.play()
                .then(() => setAudioBlocked(false))
                .catch((e) => {
                  console.warn("[Intercom Listener] Autoplay blocked:", e?.message);
                  setAudioBlocked(true);
                });
              tryPlay();
              // Re-attempt after a tick — some browsers need a microtask after srcObject swap
              setTimeout(tryPlay, 100);
            }
          };

          pc.onconnectionstatechange = () => {
            const s = pc.connectionState;
            console.log("[Intercom Listener] Connection state:", s);
            if (s === "disconnected" || s === "failed" || s === "closed") {
              setReceiving(false);
            }
          };

          pc.oniceconnectionstatechange = () => {
            console.log("[Intercom Listener] ICE state:", pc.iceConnectionState);
          };

          // Add a transceiver to accept audio
          pc.addTransceiver("audio", { direction: "recvonly" });

          await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.sdp.type, sdp: payload.sdp.sdp }));
          remoteDescSetRef.current = true;
          console.log("[Intercom Listener] Remote description set");

          for (const c of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
          }
          console.log("[Intercom Listener] Flushed", pendingCandidatesRef.current.length, "queued candidates");
          pendingCandidatesRef.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          console.log("[Intercom Listener] Created and sending answer");

          const sendResult = await ch.send({
            type: "broadcast", event: "answer",
            payload: { sdp: { type: answer.type, sdp: answer.sdp } },
          });
          console.log("[Intercom Listener] Answer send result:", sendResult);
        } catch (e) {
          console.error("[Intercom Listener] Error handling offer:", e);
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
        const el = audioRef.current;
        if (el) {
          try { el.pause(); } catch {}
          try { el.srcObject = null; } catch {}
          el.currentTime = 0;
        }
      });
    }

    ch.subscribe(async (status) => {
      console.log("[Intercom] Channel status:", status);
      if (status === "SUBSCRIBED") {
        channelReadyRef.current = true;
        if (role === "speaker") {
          await ch.track({ role: "speaker", online: true });
        } else {
          await ch.track({ role: "listener", online: true, name: listenerName });
        }
        console.log("[Intercom] Tracked as", role);
      }
    });

    channelRef.current = ch;
    return () => {
      console.log("[Intercom] Cleaning up channel");
      channelReadyRef.current = false;
      pcRef.current?.close();
      pcRef.current = null;
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
      ch.untrack();
      supabase.removeChannel(ch);
      channelRef.current = null;
      setTalking(false);
      setReceiving(false);
      setConnectionState("");
    };
  }, [userId, role, listenerName]);

  // ─── Speaker: start/stop talking ───
  const startTalking = useCallback(async () => {
    if (talkingRef.current || !channelReadyRef.current) return;
    setError(null);
    setConnectionState("capturing");
    remoteDescSetRef.current = false;
    pendingCandidatesRef.current = [];

    try {
      console.log("[Intercom Speaker] Capturing microphone...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      streamRef.current = stream;
      console.log("[Intercom Speaker] Mic captured, tracks:", stream.getAudioTracks().length);

      // Set up audio level monitoring
      try {
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        source.connect(analyser);
        analyserRef.current = analyser;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        const updateLevel = () => {
          if (!analyserRef.current) return;
          analyserRef.current.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const avg = sum / dataArray.length / 255;
          setMicLevel(avg);
          levelRafRef.current = requestAnimationFrame(updateLevel);
        };
        levelRafRef.current = requestAnimationFrame(updateLevel);
      } catch (e) {
        console.warn("[Intercom] Audio analyser not available:", e);
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const collectedCandidates: RTCIceCandidateInit[] = [];
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          const c = ev.candidate.toJSON();
          collectedCandidates.push(c);
          channelRef.current?.send({ type: "broadcast", event: "ice-candidate-speaker", payload: { candidate: c } });
        }
      };

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        console.log("[Intercom Speaker] Connection state:", s);
        setConnectionState(s);
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[Intercom Speaker] ICE state:", pc.iceConnectionState);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("[Intercom Speaker] Offer created, sending...");

      await channelRef.current?.send({
        type: "broadcast", event: "offer",
        payload: { sdp: { type: offer.type, sdp: offer.sdp } },
      });

      setTalking(true);
      setConnectionState("connecting");

      // Re-send offer after a short delay in case listener wasn't ready
      setTimeout(async () => {
        if (pcRef.current && !remoteDescSetRef.current && channelRef.current) {
          console.log("[Intercom Speaker] Re-sending offer (no answer yet)");
          await channelRef.current.send({
            type: "broadcast", event: "offer",
            payload: { sdp: { type: offer.type, sdp: offer.sdp } },
          });
          for (const c of collectedCandidates) {
            await channelRef.current.send({ type: "broadcast", event: "ice-candidate-speaker", payload: { candidate: c } });
          }
        }
      }, 1500);

      // Another retry at 3s
      setTimeout(async () => {
        if (pcRef.current && !remoteDescSetRef.current && channelRef.current) {
          console.log("[Intercom Speaker] Re-sending offer (2nd retry)");
          await channelRef.current.send({
            type: "broadcast", event: "offer",
            payload: { sdp: { type: offer.type, sdp: offer.sdp } },
          });
          for (const c of collectedCandidates) {
            await channelRef.current.send({ type: "broadcast", event: "ice-candidate-speaker", payload: { candidate: c } });
          }
        }
      }, 3000);

    } catch (e: any) {
      setConnectionState("");
      if (e.name === "NotAllowedError") setError("Permissão de microfone negada");
      else if (e.name === "NotFoundError") setError("Nenhum microfone encontrado");
      else setError("Erro ao acessar microfone");
      console.error("[Intercom Speaker] Error:", e);
    }
  }, []);

  const stopTalking = useCallback(() => {
    if (!talkingRef.current) return;
    console.log("[Intercom Speaker] Stopping...");
    cancelAnimationFrame(levelRafRef.current);
    analyserRef.current = null;
    setMicLevel(0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    remoteDescSetRef.current = false;
    pendingCandidatesRef.current = [];
    setTalking(false);
    setConnectionState("");
    channelRef.current?.send({ type: "broadcast", event: "hangup", payload: {} });
  }, []);

  // ─── Keyboard hotkey (speaker only) ───
  useEffect(() => {
    if (!hotkey || role !== "speaker") return;
    const onDown = (e: KeyboardEvent) => {
      if (settingHotkey || e.repeat) return;
      if (e.code === hotkey && !talkingRef.current) { e.preventDefault(); startTalking(); }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === hotkey && talkingRef.current) { e.preventDefault(); stopTalking(); }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); };
  }, [hotkey, settingHotkey, startTalking, stopTalking, role]);

  useEffect(() => {
    if (!settingHotkey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      setHotkey(e.code);
      localStorage.setItem(HOTKEY_STORAGE_KEY, e.code);
      setSettingHotkey(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingHotkey]);

  const formatKeyName = (code: string) =>
    code.replace("Key", "").replace("Digit", "").replace("Numpad", "Num ");

  const handleClose = () => {
    stopTalking();
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRole("none");
    setOpen(false);
    setError(null);
    setConnectionState("");
    setReceiving(false);
    setListenerName("");
    setNameInput("");
  };

  const handleBack = () => {
    stopTalking();
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRole("none");
    setError(null);
    setConnectionState("");
    setReceiving(false);
    setListenerName("");
  };

  const confirmListenerName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setListenerName(trimmed);
    setRole("listener");
  };

  // Autoplay unlock for listener
  const handleUnlockAudio = () => {
    if (audioRef.current && audioRef.current.srcObject) {
      audioRef.current.muted = false;
      audioRef.current.volume = listenerVolume;
      audioRef.current.play()
        .then(() => setAudioBlocked(false))
        .catch(console.warn);
    }
  };

  // Keep audio element volume in sync
  useEffect(() => {
    listenerVolumeRef.current = listenerVolume;
    if (audioRef.current) {
      audioRef.current.volume = listenerVolume;
      audioRef.current.muted = false;
    }
    localStorage.setItem("intercom-listener-volume", String(listenerVolume));
  }, [listenerVolume]);

  const glassStyle = {
    backgroundColor: "rgba(0,0,0,0.75)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.12)",
  } as const;

  // ─── FAB ───
  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="fixed z-[100] rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95
                   top-[22px] right-[100px] w-8 h-8
                   sm:top-[24px] sm:right-[110px] sm:w-9 sm:h-9
                   lg:top-[30px] lg:right-[130px] lg:w-10 lg:h-10
                   translate-y-[calc(30px-50%)] sm:translate-y-[calc(30px-50%)] lg:translate-y-[calc(30px-50%)]"
        style={{ ...glassStyle }} title="Intercomunicador">
        <Radio className="text-white/85 w-[14px] h-[14px] sm:w-4 sm:h-4 lg:w-[18px] lg:h-[18px]" />
      </button>
    );
  }

  // ─── Role Selection ───
  if (role === "none" && !listenerName) {
    return (
      <div className="fixed top-[30px] -translate-y-1/2 right-[130px] z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...glassStyle, width: 280 }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <Radio size={16} className="text-white/70" />
            <span className="text-white text-xs font-bold">Intercomunicador</span>
          </div>
          <button onClick={handleClose} className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all">
            <X size={14} />
          </button>
        </div>
        <div className="px-4 pb-4 flex flex-col gap-2">
          <button onClick={() => setRole("speaker")}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: "rgba(38,143,250,0.12)", border: "1px solid rgba(38,143,250,0.2)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(38,143,250,0.2)" }}>
              <Mic size={16} className="text-[#268ffa]" />
            </div>
            <div>
              <p className="text-white text-xs font-semibold">Intercom</p>
              <p className="text-white/40 text-[10px]">Falar com os ouvintes</p>
            </div>
          </button>
          <button onClick={() => { setRole("listener"); }}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ backgroundColor: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.18)" }}>
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(34,197,94,0.15)" }}>
              <Headphones size={16} className="text-green-400" />
            </div>
            <div>
              <p className="text-white text-xs font-semibold">Ouvinte</p>
              <p className="text-white/40 text-[10px]">Receber áudio do intercom</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ─── Listener: name input (before joining channel) ───
  if (role === "listener" && !listenerName) {
    return (
      <div className="fixed top-[30px] -translate-y-1/2 right-[130px] z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...glassStyle, width: 280 }}>
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={handleBack} className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all">
            <ArrowLeft size={14} />
          </button>
          <Headphones size={16} className="text-green-400" />
          <span className="text-white text-xs font-bold">Identificação</span>
          <div className="flex-1" />
          <button onClick={handleClose} className="text-white/40 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-all">
            <X size={14} />
          </button>
        </div>
        <div className="px-4 pb-4">
          <p className="text-white/40 text-[10px] mb-2">Digite seu nome para entrar como ouvinte:</p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmListenerName(); }}
            placeholder="Seu nome..."
            className="w-full px-3 py-2 rounded-lg text-xs text-white bg-white/5 border border-white/10 outline-none focus:border-[#268ffa]/50 placeholder:text-white/20"
            autoFocus
          />
          <button onClick={confirmListenerName} disabled={!nameInput.trim()}
            className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-30"
            style={{ backgroundColor: "rgba(34,197,94,0.15)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }}>
            Entrar como ouvinte
          </button>
        </div>
      </div>
    );
  }

  // ─── Listener mode (active) ───
  if (role === "listener" && listenerName) {
    return (
      <div className="fixed top-[30px] -translate-y-1/2 right-[130px] z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...glassStyle, width: 280 }}
        onClick={handleUnlockAudio}>
        <audio ref={audioRef} autoPlay playsInline />
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Animated icon container */}
          <div className="relative flex-shrink-0">
            {/* Pulse rings when receiving */}
            {receiving && (
              <>
                <div className="absolute inset-0 rounded-full animate-ping"
                  style={{ border: "2px solid rgba(38,143,250,0.3)", animationDuration: "1.5s" }} />
                <div className="absolute -inset-1 rounded-full animate-ping"
                  style={{ border: "1px solid rgba(38,143,250,0.15)", animationDuration: "2.5s" }} />
              </>
            )}
            <div className="w-9 h-9 rounded-full flex items-center justify-center relative z-10 transition-all duration-300"
              style={{
                backgroundColor: receiving ? "rgba(38,143,250,0.25)" : "rgba(34,197,94,0.15)",
                border: `1.5px solid ${receiving ? "rgba(38,143,250,0.5)" : "rgba(34,197,94,0.2)"}`,
                boxShadow: receiving ? "0 0 20px rgba(38,143,250,0.3), inset 0 0 8px rgba(38,143,250,0.15)" : "none",
              }}>
              {receiving ? (
                <Volume2 size={15} className="text-[#268ffa]" style={{ animation: "intercomIconPulse 0.8s ease-in-out infinite" }} />
              ) : (
                <Headphones size={15} className="text-green-400" />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate">{listenerName}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors"
                style={{ backgroundColor: receiving ? "#268ffa" : speakerOnline ? "#22c55e" : "#555" }} />
              <span className="text-white/40 text-[10px] truncate">
                {receiving ? "Recebendo áudio" : speakerOnline ? "Speaker online" : "Speaker offline"}
              </span>
            </div>
          </div>

          {/* Spectrum bars when receiving */}
          {receiving && (
            <div className="flex items-end gap-[2px] mr-0.5 h-5">
              {[0.5, 0.8, 1, 0.7, 0.9, 0.6, 0.85].map((h, i) => (
                <div key={i} className="w-[3px] rounded-full"
                  style={{
                    backgroundColor: "#268ffa",
                    height: `${h * 100}%`,
                    animation: `intercomBar 0.${3 + i * 2}s ease-in-out infinite alternate`,
                    opacity: 0.8,
                  }} />
              ))}
            </div>
          )}

          <button onClick={handleClose}
            className="text-white/40 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all" title="Sair">
            <X size={14} />
          </button>
        </div>

        {/* Volume control */}
        <div className="px-3 pb-2.5 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Volume2 size={12} className="text-white/50 flex-shrink-0" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={listenerVolume}
              onChange={(e) => setListenerVolume(parseFloat(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer intercom-volume-slider"
              style={{
                background: `linear-gradient(to right, #268ffa 0%, #268ffa ${listenerVolume * 100}%, rgba(255,255,255,0.1) ${listenerVolume * 100}%, rgba(255,255,255,0.1) 100%)`,
              }}
            />
            <span className="text-[10px] text-white/50 font-mono tabular-nums w-7 text-right">
              {Math.round(listenerVolume * 100)}
            </span>
          </div>
          {audioBlocked && (
            <button
              onClick={(e) => { e.stopPropagation(); handleUnlockAudio(); }}
              className="w-full mt-2 px-2 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
              style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}>
              ▶ Clique para liberar o áudio
            </button>
          )}
        </div>

        {/* Receiving glow bar at bottom */}
        {receiving && (
          <div className="h-[2px] w-full" style={{
            background: "linear-gradient(90deg, transparent 0%, #268ffa 30%, #268ffa 70%, transparent 100%)",
            animation: "intercomGlowPulse 2s ease-in-out infinite",
          }} />
        )}

        <style>{`
          @keyframes intercomBar {
            0% { transform: scaleY(0.3); }
            100% { transform: scaleY(1); }
          }
          @keyframes intercomIconPulse {
            0%, 100% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.15); opacity: 0.8; }
          }
          @keyframes intercomGlowPulse {
            0%, 100% { opacity: 0.5; }
            50% { opacity: 1; }
          }
          .intercom-volume-slider::-webkit-slider-thumb {
            -webkit-appearance: none;
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #fff;
            border: 2px solid #268ffa;
            cursor: pointer;
            box-shadow: 0 0 6px rgba(38,143,250,0.4);
          }
          .intercom-volume-slider::-moz-range-thumb {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #fff;
            border: 2px solid #268ffa;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  // ─── Speaker mode ───
  return (
    <div className="fixed top-[30px] -translate-y-1/2 right-[130px] z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...glassStyle, width: 300 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onMouseDown={startTalking}
          onMouseUp={stopTalking}
          onMouseLeave={() => { if (talking) stopTalking(); }}
          onTouchStart={startTalking}
          onTouchEnd={stopTalking}
          disabled={onlineListeners.length === 0}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95 disabled:opacity-30"
          style={{
            backgroundColor: talking ? "#ef4444" : "#268ffa",
            boxShadow: talking ? "0 0 16px rgba(239,68,68,0.4)" : "0 0 8px rgba(38,143,250,0.3)",
          }}
          title={talking ? "Transmitindo..." : "Pressione para falar"}>
          {talking ? <MicOff size={15} className="text-white" /> : <Mic size={15} className="text-white" />}
        </button>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <p className="text-white text-xs font-bold truncate">Intercom</p>
            {hotkey && !talking && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-mono flex-shrink-0">
                {formatKeyName(hotkey)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: talking ? "#ef4444" : onlineListeners.length > 0 ? "#22c55e" : "#555" }} />
            <span className="text-white/40 text-[10px] truncate">
              {talking
                ? connectionState === "connected" ? "Conectado" : "Transmitindo..."
                : onlineListeners.length > 0 ? `${onlineListeners.length} ouvinte(s)` : "Nenhum ouvinte"}
            </span>
          </div>
        </div>

        {talking && (
          <div className="flex items-center gap-[2px] mr-0.5" style={{ height: 20, width: 40 }}>
            {Array.from({ length: 8 }).map((_, i) => {
              const threshold = (i + 1) / 8;
              const active = micLevel >= threshold;
              const barColor = threshold > 0.85 ? "#ef4444" : threshold > 0.6 ? "#f59e0b" : "#22c55e";
              return (
                <div key={i} className="flex-1 rounded-sm transition-all duration-75"
                  style={{
                    height: "100%",
                    backgroundColor: active ? barColor : "rgba(255,255,255,0.08)",
                    opacity: active ? 0.9 : 0.3,
                  }} />
              );
            })}
          </div>
        )}

        <button onClick={() => setSettingHotkey(true)}
          className="text-white/40 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all"
          title={settingHotkey ? "Pressione uma tecla..." : hotkey ? `Atalho: ${formatKeyName(hotkey)}` : "Definir atalho"}>
          <Keyboard size={14} className={settingHotkey ? "text-yellow-400 animate-pulse" : ""} />
        </button>

        <button onClick={handleBack}
          className="text-white/40 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all" title="Voltar">
          <ArrowLeft size={14} />
        </button>

        <button onClick={handleClose}
          className="text-white/40 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all" title="Fechar">
          <X size={14} />
        </button>
      </div>

      {/* Online listeners list */}
      {onlineListeners.length > 0 && !talking && (
        <div className="px-3 pb-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[9px] text-white/30 uppercase tracking-wider py-1.5 flex items-center gap-1">
            <Users size={10} /> Ouvintes online
          </p>
          <div className="flex flex-wrap gap-1">
            {onlineListeners.map((l) => (
              <span key={l.presenceKey} className="text-[10px] px-2 py-1 rounded-full bg-green-500/10 text-green-400 border border-green-500/15">
                {l.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {settingHotkey && (
        <div className="px-3 py-2" style={{ backgroundColor: "rgba(255,200,0,0.08)", borderTop: "1px solid rgba(255,200,0,0.15)" }}>
          <p className="text-[10px] text-yellow-300/80 text-center">Pressione uma tecla para definir o atalho...</p>
        </div>
      )}

      {error && (
        <div className="px-3 py-1.5" style={{ backgroundColor: "rgba(239,68,68,0.12)", borderTop: "1px solid rgba(239,68,68,0.1)" }}>
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}

      <style>{`
        @keyframes intercomBar {
          0% { transform: scaleY(0.4); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
