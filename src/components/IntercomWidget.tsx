import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Radio, X, Share2, Check, Keyboard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CHANNEL_NAME = "intercom-signal";
const HOTKEY_STORAGE_KEY = "intercom-hotkey";

export default function IntercomWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [talking, setTalking] = useState(false);
  const [listenerOnline, setListenerOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [hotkey, setHotkey] = useState<string>(() => localStorage.getItem(HOTKEY_STORAGE_KEY) || "");
  const [settingHotkey, setSettingHotkey] = useState(false);
  const [connectionState, setConnectionState] = useState("");

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSetRef = useRef(false);
  const talkingRef = useRef(false);
  const hotkeyRef = useRef(hotkey);
  const channelReadyRef = useRef(false);

  const userId = user?.id;

  useEffect(() => { hotkeyRef.current = hotkey; }, [hotkey]);
  useEffect(() => { talkingRef.current = talking; }, [talking]);

  // Signaling channel
  useEffect(() => {
    if (!userId) return;
    const presenceKey = `speaker-${Date.now()}`;
    const ch = supabase.channel(`${CHANNEL_NAME}-${userId}`, {
      config: { broadcast: { self: false, ack: true }, presence: { key: presenceKey } },
    });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const hasListener = Object.values(state).some((entries: any) =>
        entries.some((e: any) => e.role === "listener")
      );
      setListenerOnline(hasListener);
      console.log("[Intercom Speaker] Presence sync — listener online:", hasListener);
    });

    ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
      console.log("[Intercom Speaker] Received answer");
      try {
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
          console.log("[Intercom Speaker] Queued ICE candidate from listener");
        }
      } catch (e) {
        console.error("[Intercom Speaker] Error adding ICE candidate:", e);
      }
    });

    ch.subscribe(async (status) => {
      console.log("[Intercom Speaker] Channel status:", status);
      if (status === "SUBSCRIBED") {
        channelReadyRef.current = true;
        await ch.track({ role: "speaker", online: true });
      }
    });

    channelRef.current = ch;
    return () => {
      channelReadyRef.current = false;
      ch.untrack();
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [userId]);

  const startTalking = useCallback(async () => {
    if (talkingRef.current) return;
    if (!channelReadyRef.current) {
      console.warn("[Intercom Speaker] Channel not ready");
      setError("Canal não pronto");
      return;
    }
    setError(null);
    setConnectionState("capturing");
    remoteDescSetRef.current = false;
    pendingCandidatesRef.current = [];

    try {
      console.log("[Intercom Speaker] Requesting mic...");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      streamRef.current = stream;
      console.log("[Intercom Speaker] Mic captured, tracks:", stream.getAudioTracks().length);

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      // Collect ICE candidates to send along with the offer
      const iceCandidates: RTCIceCandidateInit[] = [];
      
      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          const c = ev.candidate.toJSON();
          iceCandidates.push(c);
          // Also send individually for real-time delivery
          channelRef.current?.send({
            type: "broadcast",
            event: "ice-candidate-speaker",
            payload: { candidate: c },
          });
        }
      };

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        console.log("[Intercom Speaker] Connection state:", s);
        setConnectionState(s);
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[Intercom Speaker] ICE connection state:", pc.iceConnectionState);
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      console.log("[Intercom Speaker] Offer created, sending...");

      // Send offer with ack to verify delivery
      const sendResult = await channelRef.current?.send({
        type: "broadcast",
        event: "offer",
        payload: { sdp: { type: offer.type, sdp: offer.sdp } },
      });
      console.log("[Intercom Speaker] Offer send result:", sendResult);

      setTalking(true);
      setConnectionState("connecting");

      // Resend offer after short delay in case listener missed it
      setTimeout(async () => {
        if (pcRef.current && !remoteDescSetRef.current && channelRef.current) {
          console.log("[Intercom Speaker] Resending offer (retry)...");
          await channelRef.current.send({
            type: "broadcast",
            event: "offer",
            payload: { sdp: { type: offer.type, sdp: offer.sdp } },
          });
          // Also resend collected ICE candidates
          for (const c of iceCandidates) {
            await channelRef.current.send({
              type: "broadcast",
              event: "ice-candidate-speaker",
              payload: { candidate: c },
            });
          }
        }
      }, 1500);

    } catch (e: any) {
      console.error("[Intercom Speaker] Mic error:", e);
      setConnectionState("");
      if (e.name === "NotAllowedError") setError("Permissão de microfone negada");
      else if (e.name === "NotFoundError") setError("Nenhum microfone encontrado");
      else if (e.name === "NotReadableError") setError("Microfone em uso por outro app");
      else setError("Erro ao acessar microfone");
    }
  }, []);

  const stopTalking = useCallback(() => {
    if (!talkingRef.current) return;
    console.log("[Intercom Speaker] Stopping...");
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

  // Keyboard hotkey
  useEffect(() => {
    if (!hotkey) return;
    const onDown = (e: KeyboardEvent) => {
      if (settingHotkey) return;
      if (e.repeat) return; // Ignore key repeat
      if (e.code === hotkey && !talkingRef.current) {
        e.preventDefault();
        startTalking();
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === hotkey && talkingRef.current) {
        e.preventDefault();
        stopTalking();
      }
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [hotkey, settingHotkey, startTalking, stopTalking]);

  // Hotkey capture mode
  useEffect(() => {
    if (!settingHotkey) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      const code = e.code;
      setHotkey(code);
      localStorage.setItem(HOTKEY_STORAGE_KEY, code);
      setSettingHotkey(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [settingHotkey]);

  const shareLink = useCallback(async () => {
    if (!userId) return;
    const url = `${window.location.origin}/intercom?uid=${userId}`;
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url; ta.style.position = "fixed"; ta.style.left = "-9999px";
        document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url; ta.style.position = "fixed"; ta.style.left = "-9999px";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [userId]);

  const formatKeyName = (code: string) =>
    code.replace("Key", "").replace("Digit", "").replace("Numpad", "Num ");

  const glassStyle = {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.12)",
  } as const;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-[100] rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{ ...glassStyle, width: 44, height: 44 }}
        title="Intercomunicador"
      >
        <Radio size={20} className="text-white/80" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-20 right-5 z-[100] rounded-2xl overflow-hidden animate-fade-in" style={{ ...glassStyle, width: 300 }}>
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          onMouseDown={startTalking}
          onMouseUp={stopTalking}
          onMouseLeave={() => { if (talking) stopTalking(); }}
          onTouchStart={startTalking}
          onTouchEnd={stopTalking}
          disabled={!listenerOnline}
          className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95 disabled:opacity-30"
          style={{
            backgroundColor: talking ? "#ef4444" : "#268ffa",
            boxShadow: talking ? "0 0 16px rgba(239,68,68,0.4)" : "0 0 8px rgba(38,143,250,0.3)",
          }}
          title={talking ? "Transmitindo..." : "Pressione para falar"}
        >
          {talking ? <MicOff size={15} className="text-white" /> : <Mic size={15} className="text-white" />}
        </button>

        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-1.5">
            <p className="text-white text-xs font-bold truncate">Intercomunicador</p>
            {hotkey && !talking && (
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-mono flex-shrink-0">
                {formatKeyName(hotkey)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: talking ? "#ef4444" : listenerOnline ? "#22c55e" : "#555" }} />
            <span className="text-white/40 text-[10px] truncate">
              {talking
                ? connectionState === "connected" ? "Conectado" : "Transmitindo..."
                : listenerOnline ? "Receptor online" : "Receptor offline"}
            </span>
          </div>
        </div>

        {talking && (
          <div className="flex items-end gap-[2px] mr-0.5 h-4">
            {[0.6, 1, 0.7, 0.9, 0.5].map((h, i) => (
              <div key={i} className="w-[3px] rounded-full"
                style={{
                  backgroundColor: "#ef4444",
                  height: `${h * 100}%`,
                  animation: `intercomBar 0.${3 + i * 2}s ease-in-out infinite alternate`,
                }} />
            ))}
          </div>
        )}

        <button onClick={() => setSettingHotkey(true)}
          className="text-white/40 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all"
          title={settingHotkey ? "Pressione uma tecla..." : hotkey ? `Atalho: ${formatKeyName(hotkey)}` : "Definir atalho"}>
          <Keyboard size={14} className={settingHotkey ? "text-yellow-400 animate-pulse" : ""} />
        </button>

        <button onClick={shareLink}
          className="text-white/40 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all"
          title={copied ? "Link copiado!" : "Compartilhar link"}>
          {copied ? <Check size={14} className="text-green-400" /> : <Share2 size={14} />}
        </button>

        <button onClick={() => { stopTalking(); setOpen(false); }}
          className="text-white/40 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all" title="Fechar">
          <X size={14} />
        </button>
      </div>

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
