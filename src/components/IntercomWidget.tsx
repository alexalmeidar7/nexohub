import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Radio, X, Share2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CHANNEL_NAME = "intercom-signal";

export default function IntercomWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [talking, setTalking] = useState(false);
  const [listenerOnline, setListenerOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`${CHANNEL_NAME}-${userId}`, { config: { presence: { key: "speaker" } } });

    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const listeners = Object.keys(state).filter((k) => k.startsWith("listener"));
      setListenerOnline(listeners.length > 0);
    });

    ch.on("broadcast", { event: "answer" }, async ({ payload }) => {
      try {
        if (pcRef.current && payload.sdp) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        }
      } catch (e) {
        console.error("Error setting answer:", e);
      }
    });

    ch.on("broadcast", { event: "ice-candidate-listener" }, async ({ payload }) => {
      try {
        if (pcRef.current && payload.candidate) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(payload.candidate));
        }
      } catch (e) {
        console.error("Error adding ICE candidate:", e);
      }
    });

    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ online: true, role: "speaker" });
      }
    });

    channelRef.current = ch;
    return () => {
      ch.untrack();
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [userId]);

  const startTalking = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      streamRef.current = stream;

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      pcRef.current = pc;

      stream.getTracks().forEach((t) => pc.addTrack(t, stream));

      pc.onicecandidate = (ev) => {
        if (ev.candidate && channelRef.current) {
          channelRef.current.send({
            type: "broadcast",
            event: "ice-candidate-speaker",
            payload: { candidate: ev.candidate.toJSON() },
          });
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      channelRef.current?.send({
        type: "broadcast",
        event: "offer",
        payload: { sdp: pc.localDescription },
      });

      setTalking(true);
    } catch (e: any) {
      console.error("Mic error:", e);
      setError("Erro ao acessar microfone");
    }
  }, []);

  const stopTalking = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
    setTalking(false);

    channelRef.current?.send({
      type: "broadcast",
      event: "hangup",
      payload: {},
    });
  }, []);

  const shareLink = useCallback(() => {
    if (!userId) return;
    const url = `${window.location.origin}/intercom?uid=${userId}`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      window.prompt("Copie o link:", url);
    });
  }, [userId]);

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
        className="fixed bottom-20 right-5 z-[100] w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95"
        style={{
          ...glassStyle,
          width: 44,
          height: 44,
        }}
        title="Intercomunicador"
      >
        <Radio size={20} className="text-white/80" />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-20 right-5 z-[100] rounded-2xl overflow-hidden animate-fade-in"
      style={{ ...glassStyle, width: 280 }}
    >
      {/* Header row */}
      <div className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        {/* Talk button */}
        <button
          onMouseDown={startTalking}
          onMouseUp={stopTalking}
          onMouseLeave={() => { if (talking) stopTalking(); }}
          onTouchStart={startTalking}
          onTouchEnd={stopTalking}
          disabled={!listenerOnline}
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110 active:scale-95 disabled:opacity-30"
          style={{ backgroundColor: talking ? "#ef4444" : "#268ffa" }}
          title={talking ? "Transmitindo..." : "Pressione para falar"}
        >
          {talking ? <MicOff size={14} className="text-white" /> : <Mic size={14} className="text-white" />}
        </button>

        {/* Info */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <p className="text-white text-xs font-bold truncate">Intercomunicador</p>
          <div className="flex items-center gap-1">
            <div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: listenerOnline ? "#22c55e" : talking ? "#ef4444" : "#666" }}
            />
            <span className="text-white/40 text-[10px] truncate">
              {talking ? "Transmitindo..." : listenerOnline ? "Receptor online" : "Receptor offline"}
            </span>
          </div>
        </div>

        {/* Audio bars when talking */}
        {talking && (
          <div className="flex items-center gap-[2px] mr-1">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-[3px] rounded-full"
                style={{
                  backgroundColor: "#268ffa",
                  height: `${6 + Math.random() * 10}px`,
                  animation: `pulse 0.${4 + i}s ease-in-out infinite alternate`,
                }}
              />
            ))}
          </div>
        )}

        {/* Share button */}
        <button
          onClick={shareLink}
          className="text-white/50 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all"
          title={copied ? "Link copiado!" : "Compartilhar link do receptor"}
        >
          {copied ? <Check size={14} className="text-green-400" /> : <Share2 size={14} />}
        </button>

        {/* Close */}
        <button
          onClick={() => { stopTalking(); setOpen(false); }}
          className="text-white/50 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all"
          title="Fechar"
        >
          <X size={14} />
        </button>
      </div>

      {error && (
        <div className="px-3 py-1.5" style={{ backgroundColor: "rgba(239,68,68,0.15)" }}>
          <p className="text-[10px] text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
