import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Radio, X, Volume2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const CHANNEL_NAME = "intercom-signal";

export default function IntercomWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [talking, setTalking] = useState(false);
  const [listenerOnline, setListenerOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const userId = user?.id;

  // Setup signaling channel
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

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-5 z-50 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110"
        style={{ backgroundColor: "#268ffa", color: "#fff" }}
        title="Intercomunicador"
      >
        <Radio size={22} />
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-20 right-5 z-50 w-64 rounded-2xl shadow-2xl overflow-hidden"
      style={{ backgroundColor: "#0f1058", color: "#fff", border: "1px solid #268ffa33" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: "#268ffa22" }}>
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Radio size={16} />
          Intercomunicador
        </div>
        <button onClick={() => { stopTalking(); setOpen(false); }} className="hover:opacity-70">
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col items-center gap-3">
        {/* Status */}
        <div className="flex items-center gap-2 text-xs">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: listenerOnline ? "#22c55e" : "#ef4444" }}
          />
          {listenerOnline ? "Receptor online" : "Receptor offline"}
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}

        {/* Talk button */}
        <button
          onMouseDown={startTalking}
          onMouseUp={stopTalking}
          onMouseLeave={() => { if (talking) stopTalking(); }}
          onTouchStart={startTalking}
          onTouchEnd={stopTalking}
          disabled={!listenerOnline}
          className="w-20 h-20 rounded-full flex items-center justify-center transition-all active:scale-95 disabled:opacity-40"
          style={{
            backgroundColor: talking ? "#ef4444" : "#268ffa",
            boxShadow: talking ? "0 0 30px #ef444466" : "0 0 20px #268ffa44",
          }}
        >
          {talking ? <MicOff size={32} /> : <Mic size={32} />}
        </button>
        <p className="text-[11px] opacity-60">
          {talking ? "Transmitindo..." : "Pressione para falar"}
        </p>

        {/* Audio level indicator */}
        {talking && (
          <div className="flex items-center gap-1">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="w-1.5 rounded-full animate-pulse"
                style={{
                  backgroundColor: "#268ffa",
                  height: `${8 + Math.random() * 16}px`,
                  animationDelay: `${i * 0.1}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
