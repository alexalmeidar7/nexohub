import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Radio, X, Keyboard, Headphones, Users, ArrowLeft, Volume2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CHANNEL_NAME = "intercom-signal";
const HOTKEY_STORAGE_KEY = "intercom-hotkey";

type Role = "none" | "speaker" | "listener";
type TargetMode = "all" | "selected";

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
  const [targetMode, setTargetMode] = useState<TargetMode>("all");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [connectedListenerKeys, setConnectedListenerKeys] = useState<Set<string>>(new Set());
  const [connectionState, setConnectionState] = useState("");
  const [hotkey, setHotkey] = useState<string>(() => localStorage.getItem(HOTKEY_STORAGE_KEY) || "");
  const [settingHotkey, setSettingHotkey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Listener state
  const [receiving, setReceiving] = useState(false);
  const [speakerOnline, setSpeakerOnline] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const talkingRef = useRef(false);
  const hotkeyRef = useRef(hotkey);
  const channelReadyRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listenerPresenceKeyRef = useRef<string>("");
  const targetModeRef = useRef<TargetMode>("all");
  const selectedKeysRef = useRef<Set<string>>(new Set());

  const userId = user?.id;

  useEffect(() => { hotkeyRef.current = hotkey; }, [hotkey]);
  useEffect(() => { talkingRef.current = talking; }, [talking]);
  useEffect(() => { targetModeRef.current = targetMode; }, [targetMode]);
  useEffect(() => { selectedKeysRef.current = selectedKeys; }, [selectedKeys]);

  const toggleListenerSelection = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Check if a broadcast target includes this listener
  const isTargetedAtMe = (payload: any): boolean => {
    // If no target info, it's for everyone (backward compat)
    if (!payload.target) return true;
    if (payload.target === "all") return true;
    if (Array.isArray(payload.targetKeys)) {
      return payload.targetKeys.includes(listenerPresenceKeyRef.current);
    }
    return true;
  };

  // Build target payload for speaker broadcasts
  const buildTargetPayload = () => {
    if (targetModeRef.current === "all") return { target: "all" };
    return { target: "selected", targetKeys: Array.from(selectedKeysRef.current) };
  };

  // ─── Signaling channel (shared by both roles) ───
  useEffect(() => {
    if (!userId || role === "none") return;
    if (role === "listener" && !listenerName) return;

    console.log("[Intercom] Joining channel as", role, "uid:", userId.slice(0, 8));

    const presenceKey = role === "speaker"
      ? `speaker-${Date.now()}`
      : `listener-${Date.now()}`;

    if (role === "listener") {
      listenerPresenceKeyRef.current = presenceKey;
    }

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
          if (e.role === "listener" && e.name) {
            listeners.push({ presenceKey: key, name: e.name });
          }
          if (e.role === "speaker") hasSpeaker = true;
        });
      });

      if (role === "speaker") setOnlineListeners(listeners);
      if (role === "listener") setSpeakerOnline(hasSpeaker);
      console.log("[Intercom] Presence sync — listeners:", listeners.length, "speaker:", hasSpeaker);
    });

    // ── Speaker: listen for answer + listener ICE + status ──
    if (role === "speaker") {
      ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
        try {
          console.log("[Intercom Speaker] Received answer");
          const pc = pcRef.current;
          if (pc && payload.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.sdp.type, sdp: payload.sdp.sdp }));
            remoteDescSetRef.current = true;
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

      // Listener reports its connection status
      ch.on("broadcast", { event: "listener-status" }, ({ payload }) => {
        if (!payload.presenceKey) return;
        setConnectedListenerKeys(prev => {
          const next = new Set(prev);
          if (payload.status === "connected") {
            next.add(payload.presenceKey);
          } else {
            next.delete(payload.presenceKey);
          }
          return next;
        });
      });
    }

    // ── Listener: listen for offer + speaker ICE + hangup ──
    if (role === "listener") {
      const handleOffer = async (payload: any) => {
        // Check if this offer is targeted at me
        if (!isTargetedAtMe(payload)) {
          console.log("[Intercom Listener] Offer not targeted at me, ignoring");
          return;
        }

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
              ch.send({ type: "broadcast", event: "ice-candidate-listener", payload: { candidate: ev.candidate.toJSON() } });
            }
          };

          pc.ontrack = (ev) => {
            console.log("[Intercom Listener] Got audio track!");
            setReceiving(true);
            const stream = ev.streams[0] || new MediaStream([ev.track]);
            if (audioRef.current) {
              audioRef.current.srcObject = stream;
              audioRef.current.play().catch((e) => {
                console.warn("[Intercom Listener] Autoplay blocked:", e.message);
              });
            }
          };

          pc.onconnectionstatechange = () => {
            const s = pc.connectionState;
            console.log("[Intercom Listener] Connection state:", s);
            // Notify speaker about our connection status
            ch.send({
              type: "broadcast", event: "listener-status",
              payload: {
                presenceKey: listenerPresenceKeyRef.current,
                status: s === "connected" ? "connected" : s === "disconnected" || s === "failed" || s === "closed" ? "disconnected" : "connecting",
              },
            });
            if (s === "disconnected" || s === "failed" || s === "closed") {
              setReceiving(false);
            }
          };

          pc.addTransceiver("audio", { direction: "recvonly" });

          await pc.setRemoteDescription(new RTCSessionDescription({ type: payload.sdp.type, sdp: payload.sdp.sdp }));
          remoteDescSetRef.current = true;

          for (const c of pendingCandidatesRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.warn);
          }
          pendingCandidatesRef.current = [];

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);

          await ch.send({
            type: "broadcast", event: "answer",
            payload: { sdp: { type: answer.type, sdp: answer.sdp } },
          });
        } catch (e) {
          console.error("[Intercom Listener] Error handling offer:", e);
        }
      };

      ch.on("broadcast", { event: "offer" }, ({ payload }) => handleOffer(payload));

      ch.on("broadcast", { event: "ice-candidate-speaker" }, async ({ payload }) => {
        if (!isTargetedAtMe(payload)) return;
        try {
          if (!payload.candidate) return;
          if (pcRef.current && remoteDescSetRef.current) {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
          } else {
            pendingCandidatesRef.current.push(payload.candidate);
          }
        } catch (e) { console.error("[Intercom Listener] Error adding ICE:", e); }
      });

      ch.on("broadcast", { event: "hangup" }, ({ payload }) => {
        if (!isTargetedAtMe(payload)) return;
        console.log("[Intercom Listener] Speaker hung up");
        pcRef.current?.close();
        pcRef.current = null;
        remoteDescSetRef.current = false;
        pendingCandidatesRef.current = [];
        setReceiving(false);
        if (audioRef.current) audioRef.current.srcObject = null;
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
      }
    });

    channelRef.current = ch;
    return () => {
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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      streamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      const targetInfo = buildTargetPayload();

      const collectedCandidates: RTCIceCandidateInit[] = [];
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          const c = ev.candidate.toJSON();
          collectedCandidates.push(c);
          channelRef.current?.send({
            type: "broadcast", event: "ice-candidate-speaker",
            payload: { candidate: c, ...targetInfo },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const offerPayload = { sdp: { type: offer.type, sdp: offer.sdp }, ...targetInfo };

      await channelRef.current?.send({
        type: "broadcast", event: "offer",
        payload: offerPayload,
      });

      setTalking(true);
      setConnectionState("connecting");

      // Retries
      setTimeout(async () => {
        if (pcRef.current && !remoteDescSetRef.current && channelRef.current) {
          await channelRef.current.send({ type: "broadcast", event: "offer", payload: offerPayload });
          for (const c of collectedCandidates) {
            await channelRef.current.send({ type: "broadcast", event: "ice-candidate-speaker", payload: { candidate: c, ...targetInfo } });
          }
        }
      }, 1500);

      setTimeout(async () => {
        if (pcRef.current && !remoteDescSetRef.current && channelRef.current) {
          await channelRef.current.send({ type: "broadcast", event: "offer", payload: offerPayload });
          for (const c of collectedCandidates) {
            await channelRef.current.send({ type: "broadcast", event: "ice-candidate-speaker", payload: { candidate: c, ...targetInfo } });
          }
        }
      }, 3000);

    } catch (e: any) {
      setConnectionState("");
      if (e.name === "NotAllowedError") setError("Permissão de microfone negada");
      else if (e.name === "NotFoundError") setError("Nenhum microfone encontrado");
      else setError("Erro ao acessar microfone");
    }
  }, []);

  const stopTalking = useCallback(() => {
    if (!talkingRef.current) return;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    remoteDescSetRef.current = false;
    pendingCandidatesRef.current = [];
    setTalking(false);
    setConnectionState("");
    setConnectedListenerKeys(new Set());
    channelRef.current?.send({
      type: "broadcast", event: "hangup",
      payload: buildTargetPayload(),
    });
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
    setSelectedKeys(new Set());
    setTargetMode("all");
    setConnectedListenerKeys(new Set());
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
    setSelectedKeys(new Set());
    setTargetMode("all");
  };

  const confirmListenerName = () => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setListenerName(trimmed);
    setRole("listener");
  };

  const handleUnlockAudio = () => {
    if (audioRef.current && audioRef.current.srcObject) {
      audioRef.current.play().catch(console.warn);
    }
  };

  // Can speaker talk? Need at least one listener: all mode or selected listeners
  const canTalk = onlineListeners.length > 0 && (targetMode === "all" || selectedKeys.size > 0);

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
        className="fixed bottom-20 right-5 z-[100] rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{ ...glassStyle, width: 44, height: 44 }} title="Intercomunicador">
        <Radio size={20} className="text-white/80" />
      </button>
    );
  }

  // ─── Role Selection ───
  if (role === "none" && !listenerName) {
    return (
      <div className="fixed bottom-20 right-5 z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...glassStyle, width: 280 }}>
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
          <button onClick={() => setRole("listener")}
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

  // ─── Listener: name input ───
  if (role === "listener" && !listenerName) {
    return (
      <div className="fixed bottom-20 right-5 z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...glassStyle, width: 280 }}>
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
      <div className="fixed bottom-20 right-5 z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...glassStyle, width: 280 }}
        onClick={handleUnlockAudio}>
        <audio ref={audioRef} autoPlay playsInline />
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="relative flex-shrink-0">
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

        {receiving && (
          <div className="h-[2px] w-full" style={{
            background: "linear-gradient(90deg, transparent 0%, #268ffa 30%, #268ffa 70%, transparent 100%)",
            animation: "intercomGlowPulse 2s ease-in-out infinite",
          }} />
        )}

        <style>{`
          @keyframes intercomBar { 0% { transform: scaleY(0.3); } 100% { transform: scaleY(1); } }
          @keyframes intercomIconPulse { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.15); opacity: 0.8; } }
          @keyframes intercomGlowPulse { 0%, 100% { opacity: 0.5; } 50% { opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // ─── Speaker mode ───
  return (
    <div className="fixed bottom-20 right-5 z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...glassStyle, width: 300 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onMouseDown={startTalking}
          onMouseUp={stopTalking}
          onMouseLeave={() => { if (talking) stopTalking(); }}
          onTouchStart={startTalking}
          onTouchEnd={stopTalking}
          disabled={!canTalk}
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
          <div className="flex items-end gap-[2px] mr-0.5 h-4">
            {[0.6, 1, 0.7, 0.9, 0.5].map((h, i) => (
              <div key={i} className="w-[3px] rounded-full"
                style={{ backgroundColor: "#ef4444", height: `${h * 100}%`, animation: `intercomBar 0.${3 + i * 2}s ease-in-out infinite alternate` }} />
            ))}
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

      {/* Online listeners list with selection */}
      {onlineListeners.length > 0 && (
        <div className="px-3 pb-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="flex items-center justify-between py-1.5">
            <p className="text-[9px] text-white/30 uppercase tracking-wider flex items-center gap-1">
              <Users size={10} /> Ouvintes {talking ? "— transmitindo" : "online"}
            </p>
            {talking && connectedListenerKeys.size > 0 && (
              <span className="text-[9px] text-green-400/70">
                {connectedListenerKeys.size} conectado(s)
              </span>
            )}
          </div>

          {/* Target mode toggle (only when not talking) */}
          {!talking && (
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => { setTargetMode("all"); setSelectedKeys(new Set()); }}
                className="flex-1 text-[10px] py-1.5 rounded-lg font-medium transition-all"
                style={{
                  backgroundColor: targetMode === "all" ? "rgba(38,143,250,0.2)" : "rgba(255,255,255,0.04)",
                  color: targetMode === "all" ? "#268ffa" : "rgba(255,255,255,0.4)",
                  border: `1px solid ${targetMode === "all" ? "rgba(38,143,250,0.3)" : "rgba(255,255,255,0.06)"}`,
                }}>
                Todos ({onlineListeners.length})
              </button>
              <button
                onClick={() => setTargetMode("selected")}
                className="flex-1 text-[10px] py-1.5 rounded-lg font-medium transition-all"
                style={{
                  backgroundColor: targetMode === "selected" ? "rgba(38,143,250,0.2)" : "rgba(255,255,255,0.04)",
                  color: targetMode === "selected" ? "#268ffa" : "rgba(255,255,255,0.4)",
                  border: `1px solid ${targetMode === "selected" ? "rgba(38,143,250,0.3)" : "rgba(255,255,255,0.06)"}`,
                }}>
                Selecionar
              </button>
            </div>
          )}

          {/* Listener chips */}
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
            {onlineListeners.map((l) => {
              const isSelected = targetMode === "all" || selectedKeys.has(l.presenceKey);
              const isConnected = connectedListenerKeys.has(l.presenceKey);
              return (
                <button
                  key={l.presenceKey}
                  onClick={() => {
                    if (!talking && targetMode === "selected") toggleListenerSelection(l.presenceKey);
                  }}
                  className="text-[10px] px-2 py-1 rounded-full flex items-center gap-1.5 transition-all"
                  style={{
                    backgroundColor: talking && isConnected
                      ? "rgba(38,143,250,0.15)"
                      : isSelected ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.04)",
                    color: talking && isConnected
                      ? "#268ffa"
                      : isSelected ? "#22c55e" : "rgba(255,255,255,0.3)",
                    border: `1px solid ${talking && isConnected
                      ? "rgba(38,143,250,0.3)"
                      : isSelected ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.06)"}`,
                    cursor: !talking && targetMode === "selected" ? "pointer" : "default",
                  }}>
                  {/* Connection status dot */}
                  {talking && (
                    <span className="relative flex-shrink-0">
                      <span className="w-[6px] h-[6px] rounded-full inline-block"
                        style={{ backgroundColor: isConnected ? "#22c55e" : "#555" }} />
                      {isConnected && (
                        <span className="absolute inset-0 w-[6px] h-[6px] rounded-full animate-ping"
                          style={{ backgroundColor: "#22c55e", opacity: 0.5 }} />
                      )}
                    </span>
                  )}
                  {!talking && targetMode === "selected" && isSelected && <Check size={10} />}
                  {l.name}
                </button>
              );
            })}
          </div>

          {!talking && targetMode === "selected" && selectedKeys.size === 0 && (
            <p className="text-[9px] text-white/20 mt-1 text-center">Selecione ao menos um ouvinte</p>
          )}
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
        @keyframes intercomBar { 0% { transform: scaleY(0.4); } 100% { transform: scaleY(1); } }
      `}</style>
    </div>
  );
}
