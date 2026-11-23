import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Radio, X, Keyboard, Headphones, Users, ArrowLeft, Volume2, ChevronDown, Copy, Check } from "lucide-react";
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

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const readIntercomAnchorRect = (): AnchorRect | null => {
  if (typeof document === "undefined") return null;
  const anchors = Array.from(document.querySelectorAll<HTMLElement>("[data-intercom-anchor]"));
  const anchor = anchors.find((el) => {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
  });

  if (!anchor) return null;

  const rect = anchor.getBoundingClientRect();
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
};

export default function IntercomWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [anchorRect, setAnchorRect] = useState<AnchorRect | null>(null);

  useEffect(() => {
    const openHandler = () => {
      setAnchorRect(readIntercomAnchorRect());
      setOpen(true);
    };
    const setRoleHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setAnchorRect(readIntercomAnchorRect());
      if (detail?.role) {
        setRole(detail.role);
        setOpen(true);
        setMinimized(false);
      } else {
        setOpen(true);
      }
    };
    window.addEventListener("intercom:open", openHandler);
    window.addEventListener("intercom:set-role", setRoleHandler as EventListener);
    return () => {
      window.removeEventListener("intercom:open", openHandler);
      window.removeEventListener("intercom:set-role", setRoleHandler as EventListener);
    };
  }, []);

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
  const [copiedUrl, setCopiedUrl] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
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

  useEffect(() => {
    if (!open && !minimized) return;

    const syncAnchor = () => setAnchorRect(readIntercomAnchorRect());
    syncAnchor();
    window.addEventListener("resize", syncAnchor);
    window.addEventListener("orientationchange", syncAnchor);
    return () => {
      window.removeEventListener("resize", syncAnchor);
      window.removeEventListener("orientationchange", syncAnchor);
    };
  }, [open, minimized]);

  useEffect(() => { hotkeyRef.current = hotkey; }, [hotkey]);
  useEffect(() => { talkingRef.current = talking; }, [talking]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("intercom:state-change", {
        detail: { role, talking, receiving, open },
      })
    );
  }, [role, talking, receiving, open]);

  const attachRemoteStreamToAudio = useCallback((stream?: MediaStream | null) => {
    const el = audioRef.current;
    const nextStream = stream ?? remoteStreamRef.current;
    if (!el || !nextStream) return;

    if (el.srcObject !== nextStream) {
      try { el.pause(); } catch {}
      el.srcObject = nextStream;
    }

    el.defaultMuted = false;
    el.muted = false;
    el.volume = listenerVolumeRef.current;

    el.play()
      .then(() => setAudioBlocked(false))
      .catch((e) => {
        console.warn("[Intercom Listener] Autoplay blocked:", e?.message);
        setAudioBlocked(true);
      });
  }, []);

  useEffect(() => {
    if (role !== "listener" || !listenerName) return;
    attachRemoteStreamToAudio();
  }, [role, listenerName, open, minimized, attachRemoteStreamToAudio]);

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
            remoteStreamRef.current = stream;
            attachRemoteStreamToAudio(stream);
            // Re-attempt after a tick — some browsers need a microtask after srcObject swap
            setTimeout(() => attachRemoteStreamToAudio(stream), 100);
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
        remoteStreamRef.current = null;
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
      remoteStreamRef.current = null;
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
          handleMinimize();
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
    remoteStreamRef.current = null;
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setRole("none");
    setOpen(false);
    setMinimized(false);
    setError(null);
    setConnectionState("");
    setReceiving(false);
    setListenerName("");
    setNameInput("");
  };

  const handleMinimize = () => {
    setOpen(false);
    setMinimized(true);
  };


  const handleBack = () => {
    stopTalking();
    pcRef.current?.close();
    pcRef.current = null;
    remoteStreamRef.current = null;
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
    handleMinimize();
  };


  // Autoplay unlock for listener
  const handleUnlockAudio = () => {
    attachRemoteStreamToAudio();
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
    backgroundColor: "#0b1632",
    backdropFilter: "none",
    WebkitBackdropFilter: "none",
    boxShadow: "0 12px 26px rgba(0,0,0,0.24)",
    border: "1px solid rgba(72,117,255,0.28)",
    color: "#f8fafc",
  } as const;

  const anchorStyle = (() => {
    const fallback = { top: 72, left: 72, width: 36, height: 36 };
    const rect = anchorRect ?? fallback;
    const viewportWidth = typeof window === "undefined" ? 1280 : window.innerWidth;
    const viewportHeight = typeof window === "undefined" ? 768 : window.innerHeight;
    const panelWidth = 300;
    const gap = 8;
    const maxLeft = Math.max(gap, viewportWidth - panelWidth - gap);
    // Always open beneath the actual microphone button; never to the left of the page.
    const preferredLeft = rect.left + rect.width / 2 - panelWidth / 2;
    return {
      top: Math.min(Math.max(gap, viewportHeight - 360), rect.top + rect.height + gap),
      left: Math.min(maxLeft, Math.max(gap, preferredLeft)),
      width: rect.width,
      height: rect.height,
    };
  })();

  const floatingPanelStyle = {
    ...glassStyle,
    top: anchorStyle.top,
    left: anchorStyle.left,
  } as const;

  // O indicador minimizado deve ficar EXATAMENTE sobre o ícone do intercom
  // (não deslocado para o lado, o que cobria o botão de notificações).
  // O indicador minimizado deve ficar EXATAMENTE sobre o ícone do intercom
  // (não deslocado para o lado, o que cobria o botão de notificações).
  // Quando não existe ícone visível na tela atual, usa uma posição de segurança
  // para que o usuário nunca perca o acesso ao intercom.
  const minimizedStyle = anchorRect
    ? {
        top: anchorRect.top,
        left: anchorRect.left,
        width: anchorRect.width,
        height: anchorRect.height,
      }
    : ({ bottom: 20, right: 20, width: 36, height: 36 } as const);



  // ─── FAB / Minimized Indicator ───
  if (minimized && role !== "none") {
    const isActive = talking || receiving;
    return (
      <>
        {role === "listener" && <audio ref={audioRef} autoPlay playsInline className="hidden" />}
        {minimizedStyle && (
        <div 
          id="intercom-minimized-fab"
          className="fixed z-[110] animate-in zoom-in duration-300 cursor-pointer pointer-events-auto flex items-center justify-center"
          style={minimizedStyle}
          onClick={(e) => { 
            e.stopPropagation();
            setOpen(true); 
            setMinimized(false); 
          }}
        >
          <div className="relative group w-full h-full flex items-center justify-center">
            {isActive && (
              <>
                <div className="absolute inset-0 rounded-full animate-ping"
                  style={{ border: `2px solid ${talking ? "#ef4444" : "#0055ff"}`, animationDuration: "1.5s" }} />
                <div className="absolute -inset-1 rounded-full animate-ping"
                  style={{ border: `1px solid ${talking ? "rgba(239,68,68,0.3)" : "rgba(0,85,255,0.3)"}`, animationDuration: "2.5s" }} />
              </>
            )}
            <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-300 shadow-lg border hover:scale-110 bg-black"
              style={{
                borderColor: talking ? "#ef4444" : receiving ? "#0055ff" : "rgba(0,85,255,0.4)",
                boxShadow: isActive ? `0 0 20px ${talking ? "rgba(239,68,68,0.4)" : "rgba(0,85,255,0.4)"}` : "0 4px 8px rgba(0,0,0,0.3)"
              }}>
              {talking ? (
                <Mic size={18} className="text-white" style={{ animation: "intercomIconPulse 0.8s ease-in-out infinite" }} />
              ) : receiving ? (
                <Volume2 size={18} className="text-[#0055ff]" style={{ animation: "intercomIconPulse 0.8s ease-in-out infinite" }} />
              ) : role === "speaker" ? (
                <Mic size={18} className="text-white/40" />
              ) : (
                <Headphones size={18} className="text-white/40" />
              )}
            </div>
            
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 px-2 py-1 rounded bg-black/80 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              {talking ? "Transmitindo" : receiving ? "Recebendo" : "Intercom Ligado"}
            </div>
          </div>
          
          <style>{`
            @keyframes intercomIconPulse {
              0%, 100% { transform: scale(1); }
              50% { transform: scale(1.15); }
            }
          `}</style>
        </div>
        )}
      </>

    );
  }

  if (!open) {
    return null;
  }


  const listenerPageUrl = `${window.location.origin}/intercom?uid=${userId || ""}${nameInput.trim() ? `&nome=${encodeURIComponent(nameInput.trim())}` : ""}`;
  const copyListenerPageUrl = async () => {
    try {
      await navigator.clipboard.writeText(listenerPageUrl);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = listenerPageUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1800);
  };

  // ─── Role Selection ───
  if (role === "none" && !listenerName) {
    return (
      <div
        id="intercom-selection-menu"
        className="nexo-scope fixed z-[100] animate-in fade-in slide-in-from-top-2 duration-200 ease-out"
        style={{ top: anchorStyle.top, left: anchorStyle.left, width: 288 }}
      >
        <div
          className="overflow-hidden rounded-2xl border shadow-xl"
          style={{
            background: "#0b1632",
            borderColor: "rgba(0,85,255,0.24)",
            boxShadow: "0 12px 26px rgba(0,0,0,0.24)",
          }}
        >
          <div className="flex items-center justify-between px-4 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <div className="relative flex h-8 w-8 items-center justify-center rounded-xl" style={{ background: "#0A2540" }}>
                <Radio size={14} className="text-white" />
                <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-400" />
              </div>
              <div>
                <p className="text-xs font-black tracking-tight text-white">Intercom</p>
                <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-white/55">Escolha como entrar</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Fechar intercom"
              className="flex h-8 w-8 items-center justify-center rounded-xl text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              title="Fechar"
            >
              <X size={15} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 px-3 pb-3">
            <button
              onClick={() => setRole("speaker")}
              className="group relative flex min-h-[112px] flex-col items-start justify-between overflow-hidden rounded-2xl p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98]"
              style={{ background: "#0055ff" }}
              title="Intercom — falar com ouvintes"
            >
              <span className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-[#0055ff]/15 transition-transform duration-300 group-hover:scale-125" />
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#0055ff] text-white shadow-md shadow-cyan-500/30">
                <Mic size={17} />
              </span>
              <span className="relative">
                <span className="block text-xs font-black text-white">Falar</span>
                <span className="mt-0.5 block text-[9px] font-medium text-white/60">Transmitir para ouvintes</span>
              </span>
            </button>

            <button
              onClick={() => setRole("listener")}
              className="group relative flex min-h-[112px] flex-col items-start justify-between overflow-hidden rounded-2xl border p-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-[#0055ff]/45 hover:shadow-lg active:scale-[0.98]"
              style={{ background: "#152447", borderColor: "rgba(72,117,255,0.24)" }}
              title="Ouvinte — receber áudio"
            >
              <span className="absolute -right-5 -top-5 h-20 w-20 rounded-full bg-[#0055ff]/25 transition-transform duration-300 group-hover:scale-125" />
              <span className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-[#0055ff] text-[#0A2540] shadow-md shadow-lime-400/30">
                <Headphones size={17} />
              </span>
              <span className="relative">
                <span className="block text-xs font-black text-white">Ouvir</span>
                <span className="mt-0.5 block text-[9px] font-medium text-white/60">Receber o áudio ao vivo</span>
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 border-t px-4 py-2" style={{ borderColor: "rgba(255,255,255,0.09)", background: "rgba(0,85,255,0.09)" }}>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <span className="text-[9px] font-semibold text-white/65">Conexão em tempo real</span>
          </div>
        </div>
      </div>
    );
  }


  // ─── Listener: name input (before joining channel) ───
  if (role === "listener" && !listenerName) {
    return (
      <div className="fixed z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...floatingPanelStyle, width: 280 }}>
        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={handleBack} className="text-white/60 hover:text-[#0055ff] p-1 rounded-lg hover:bg-[#0055ff]/12 transition-all">
            <ArrowLeft size={14} />
          </button>
          <Headphones size={16} className="text-green-400" />
          <span className="text-white text-xs font-bold">Identificação</span>
          <div className="flex-1" />
          <button onClick={handleClose} className="text-white/60 hover:text-[#0055ff] p-1 rounded-lg hover:bg-[#0055ff]/12 transition-all">
            <X size={14} />
          </button>
        </div>
        <div className="px-4 pb-4">
          <p className="text-white/60 text-[10px] mb-2">Digite seu nome para entrar como ouvinte:</p>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirmListenerName(); }}
            placeholder="Seu nome..."
            className="w-full px-3 py-2 rounded-lg text-xs text-white bg-white/10 border border-[#0055ff]/25 outline-none focus:border-[#0055ff]/50 placeholder:text-white/30 font-medium"
            autoFocus
          />
          {/* URL da página de áudio (para inserir no navegador do vMix) */}
          <div className="mt-3 p-2 rounded-lg" style={{ backgroundColor: "rgba(0,85,255,0.07)", border: "1px dashed rgba(0,85,255,0.35)" }}>
            <p className="text-[9px] font-bold uppercase tracking-wider text-[#0055ff] mb-1">Página só de áudio (vMix)</p>
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 truncate text-[10px] text-white/70 font-mono">{listenerPageUrl}</span>
              <button
                onClick={copyListenerPageUrl}
                title="Copiar URL para o navegador do vMix"
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg transition-all hover:brightness-95"
                style={{ backgroundColor: copiedUrl ? "#0055ff" : "rgba(0,85,255,0.15)" }}
              >
                {copiedUrl ? <Check size={13} className="text-white" /> : <Copy size={13} className="text-[#0055ff]" />}
              </button>
            </div>
          </div>

          <button onClick={confirmListenerName} disabled={!nameInput.trim()}
            className="w-full mt-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all disabled:opacity-30"
            style={{ backgroundColor: "#0055ff", color: "#ffffff", border: "1px solid #0055ff" }}>
            Entrar como ouvinte
          </button>
        </div>
      </div>
    );
  }

  // ─── Listener mode (active) ───
  if (role === "listener" && listenerName) {
    return (
      <div className="fixed z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...floatingPanelStyle, width: 280 }}
        onClick={handleUnlockAudio}>
        <audio ref={audioRef} autoPlay playsInline />
        <div className="flex items-center gap-2 px-3 py-2.5">
          {/* Animated icon container */}
          <div className="relative flex-shrink-0">
            {/* Pulse rings when receiving */}
            {receiving && (
              <>
                <div className="absolute inset-0 rounded-full animate-ping"
                  style={{ border: "2px solid rgba(0,85,255,0.3)", animationDuration: "1.5s" }} />
                <div className="absolute -inset-1 rounded-full animate-ping"
                  style={{ border: "1px solid rgba(0,85,255,0.18)", animationDuration: "2.5s" }} />
              </>
            )}
            <div className="w-9 h-9 rounded-full flex items-center justify-center relative z-10 transition-all duration-300"
              style={{
                backgroundColor: receiving ? "rgba(0,85,255,0.28)" : "rgba(34,197,94,0.15)",
                border: `1.5px solid ${receiving ? "rgba(0,85,255,0.55)" : "rgba(34,197,94,0.2)"}`,
                boxShadow: receiving ? "0 0 20px rgba(0,85,255,0.3), inset 0 0 8px rgba(0,85,255,0.18)" : "none",
              }}>
              {receiving ? (
                <Volume2 size={15} className="text-[#0055ff]" style={{ animation: "intercomIconPulse 0.8s ease-in-out infinite" }} />
              ) : (
                <Headphones size={15} className="text-green-400" />
              )}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate">{listenerName}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0 transition-colors"
                style={{ backgroundColor: receiving ? "#0055ff" : speakerOnline ? "#22c55e" : "#555" }} />
              <span className="text-white/60 text-[10px] truncate">
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
                    backgroundColor: "#0055ff",
                    height: `${h * 100}%`,
                    animation: `intercomBar 0.${3 + i * 2}s ease-in-out infinite alternate`,
                    opacity: 0.8,
                  }} />
              ))}
            </div>
          )}

          <button onClick={handleMinimize}
            className="bg-[#0055ff] text-white hover:brightness-110 p-1.5 rounded-lg transition-all shadow-[0_4px_14px_-4px_rgba(0,85,255,0.55)]" title="Minimizar">
            <ChevronDown size={14} />
          </button>

          <button onClick={handleClose}
            className="text-white/60 hover:text-red-500 hover:bg-red-500/12 rounded-lg p-1.5 transition-all" title="Desligar">
            <X size={14} />
          </button>
        </div>

        {/* Volume control */}
        <div className="px-3 pb-2.5 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.09)" }}>
          <div className="flex items-center gap-2">
            <Volume2 size={12} className="text-white/60 flex-shrink-0" />
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
                background: `linear-gradient(to right, #0055ff 0%, #0055ff ${listenerVolume * 100}%, rgba(255,255,255,0.14) ${listenerVolume * 100}%, rgba(255,255,255,0.14) 100%)`,
              }}
            />
            <span className="text-[10px] text-white/60 font-mono tabular-nums w-7 text-right">
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

        {/* Disconnect Option */}
        <div className="px-3 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.09)" }}>
          <button 
            onClick={() => {
              setRole("none");
              setOpen(true);
              setMinimized(false);
              remoteStreamRef.current = null;
              const el = audioRef.current;
              if (el) {
                try { el.pause(); } catch {}
                try { el.srcObject = null; } catch {}
              }
            }}
            className="w-full mt-2 py-2 rounded-xl text-xs font-bold transition-all hover:bg-red-500 hover:text-white"
            style={{ 
              backgroundColor: "rgba(239,68,68,0.1)", 
              color: "#ef4444",
              border: "1px solid rgba(239,68,68,0.2)"
            }}
          >
            Desligar Intercom
          </button>
        </div>

        {/* Receiving glow bar at bottom */}

        {receiving && (
          <div className="h-[2px] w-full" style={{
            background: "linear-gradient(90deg, transparent 0%, #0055ff 30%, #0055ff 70%, transparent 100%)",
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
            border: 2px solid #0055ff;
            cursor: pointer;
            box-shadow: 0 0 6px rgba(0,85,255,0.4);
          }
          .intercom-volume-slider::-moz-range-thumb {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background: #fff;
            border: 2px solid #0055ff;
            cursor: pointer;
          }
        `}</style>
      </div>
    );
  }

  // ─── Speaker mode ───
  return (
    <div className="fixed z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...floatingPanelStyle, width: 300 }}>
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
            backgroundColor: talking ? "#ef4444" : "#0055ff",
            boxShadow: talking ? "0 0 16px rgba(239,68,68,0.4)" : "0 0 8px rgba(0,85,255,0.3)",
          }}
          title={talking ? "Transmitindo..." : "Pressione para falar"}>
          {talking ? <MicOff size={15} className="text-white" /> : <Mic size={15} className="text-white" />}
        </button>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <p className="text-white text-xs font-bold truncate">Intercom</p>
            {hotkey && !talking && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#0055ff]/12 text-white/60 font-mono flex-shrink-0">
                {formatKeyName(hotkey)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: talking ? "#ef4444" : onlineListeners.length > 0 ? "#22c55e" : "#555" }} />
            <span className="text-white/60 text-[10px] truncate">
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
                    backgroundColor: active ? barColor : "rgba(255,255,255,0.12)",
                    opacity: active ? 0.9 : 0.3,
                  }} />
              );
            })}
          </div>
        )}

        <button onClick={() => setSettingHotkey(true)}
          className="text-white/60 hover:text-[#0055ff] hover:bg-[#0055ff]/12 rounded-lg p-1.5 transition-all"
          title={settingHotkey ? "Pressione uma tecla..." : hotkey ? `Atalho: ${formatKeyName(hotkey)}` : "Definir atalho"}>
          <Keyboard size={14} className={settingHotkey ? "text-yellow-400 animate-pulse" : ""} />
        </button>

        <button onClick={handleMinimize}
          className="bg-[#0055ff] text-white hover:brightness-110 p-1.5 rounded-lg transition-all shadow-[0_4px_14px_-4px_rgba(0,85,255,0.55)]" title="Minimizar">
          <ChevronDown size={14} />
        </button>

        <button onClick={handleBack}

          className="text-white/60 hover:text-[#0055ff] hover:bg-[#0055ff]/12 rounded-lg p-1.5 transition-all" title="Voltar">
          <ArrowLeft size={14} />
        </button>

        <button onClick={handleClose}
          className="text-white/60 hover:text-red-500 hover:bg-red-500/12 rounded-lg p-1.5 transition-all" title="Desligar">
          <X size={14} />
        </button>
      </div>

      {/* Online listeners list */}
      {onlineListeners.length > 0 && !talking && (
        <div className="px-3 pb-2" style={{ borderTop: "1px solid rgba(255,255,255,0.09)" }}>
          <p className="text-[9px] text-white/50 uppercase tracking-wider py-1.5 flex items-center gap-1">
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

      {/* Disconnect Option */}
      <div className="px-3 pb-3" style={{ borderTop: "1px solid rgba(255,255,255,0.09)" }}>
        <button 
          onClick={() => {
            stopTalking();
            setRole("none");
            setOpen(true);
            setMinimized(false);
          }}
          className="w-full mt-2 py-2 rounded-xl text-xs font-bold transition-all hover:bg-red-500 hover:text-white"
          style={{ 
            backgroundColor: "rgba(239,68,68,0.1)", 
            color: "#ef4444",
            border: "1px solid rgba(239,68,68,0.2)"
          }}
        >
          Desligar Intercom
        </button>
      </div>

      <style>{`

        @keyframes intercomBar {
          0% { transform: scaleY(0.4); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}
