import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, Minus, Plus, Play, Pause, RotateCcw, Type, FileText, Maximize, FlipHorizontal2, FlipVertical2, MessageSquare, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Roteiro, extractRoteiroHtml, controlBtnStyle, tabBtnStyle } from "./tp-utils";

interface TpScreenProps {
  user: User | null;
  onBack: () => void;
}

export default function TpScreen({ user, onBack }: TpScreenProps) {
  const [scrolling, setScrolling] = useState(false);
  const [fontSize, setFontSize] = useState(60);
  const [speed, setSpeed] = useState(2);
  const [showSetup, setShowSetup] = useState(false);
  const [inputText, setInputText] = useState("");
  const [displayText, setDisplayText] = useState(
    "Clique em ⚙️ para selecionar um roteiro ou colar um texto..."
  );
  const [clock, setClock] = useState("00:00");
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [selectedRoteiroId, setSelectedRoteiroId] = useState<string>("");
  const [tab, setTab] = useState<"roteiros" | "manual">("roteiros");
  const [flipH, setFlipH] = useState(false);
  const [flipV, setFlipV] = useState(false);
  const [isHtmlContent, setIsHtmlContent] = useState(false);
  const [remoteActive, setRemoteActive] = useState(false);
  const remoteTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Message state
  const [incomingMsg, setIncomingMsg] = useState<{ text: string; subject: string } | null>(null);
  const [msgVisible, setMsgVisible] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const [messageLog, setMessageLog] = useState<{ text: string; subject: string; ts: number }[]>([]);
  const msgQueueRef = useRef<{ text: string; subject: string }[]>([]);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const isShowingRef = useRef(false);

  const scrollPosRef = useRef(50);
  const textRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>();
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Process next message in queue
  function processQueue() {
    if (isShowingRef.current || msgQueueRef.current.length === 0) return;
    const msg = msgQueueRef.current.shift()!;
    isShowingRef.current = true;
    setHasUnread(msgQueueRef.current.length > 0);
    setIncomingMsg(msg);
    setMsgVisible(true);
    setMessageLog(prev => [...prev, { ...msg, ts: Date.now() }].slice(-20));
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const playTone = (freq: number, start: number, dur: number, vol = 0.3) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start);
        gain.gain.setValueAtTime(vol, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + dur);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + dur);
      };
      playTone(880, 0, 0.15, 0.25);
      playTone(1100, 0.12, 0.15, 0.25);
      playTone(1320, 0.24, 0.2, 0.2);
    } catch (_) {}
    msgTimerRef.current = setTimeout(() => {
      setMsgVisible(false);
      setTimeout(() => {
        setIncomingMsg(null);
        isShowingRef.current = false;
        processQueue();
      }, 400);
    }, 5000);
  }

  function enqueueMessage(msg: { text: string; subject: string }) {
    msgQueueRef.current.push(msg);
    setHasUnread(true);
    processQueue();
  }

  // Realtime message listener (no localStorage fallback)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tp-msg-${user.id}`)
      .on("broadcast", { event: "tp-message" }, (payload: any) => {
        const msg = payload.payload as { text: string; subject: string };
        if (msg) enqueueMessage(msg);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    };
  }, [user]);

  function handleMsgIconClick() {
    if (incomingMsg && msgVisible) {
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      setMsgVisible(false);
      setTimeout(() => { setIncomingMsg(null); isShowingRef.current = false; processQueue(); }, 300);
      return;
    }
    if (msgQueueRef.current.length > 0 && !isShowingRef.current) processQueue();
    setHasUnread(false);
  }

  // Load roteiros
  useEffect(() => {
    if (!user) return;
    supabase
      .from("roteiros")
      .select("id, programa_nome, titulo, data_programa, horario, conteudo_html, numero_roteiro")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => { if (data) setRoteiros(data); });
  }, [user]);

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0"));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Timer
  useEffect(() => {
    if (scrolling) {
      timerRef.current = setInterval(() => setTimerSeconds((s) => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [scrolling]);

  const timerDisplay = (() => {
    const m = Math.floor(timerSeconds / 60).toString().padStart(2, "0");
    const s = (timerSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  })();

  // Scroll animation with deceleration
  const speedMultiplierRef = useRef(1);
  const animate = useCallback(() => {
    if (scrolling && textRef.current) {
      const textBottom = textRef.current.getBoundingClientRect().bottom;
      const containerMid = (textRef.current.parentElement?.getBoundingClientRect().bottom || window.innerHeight) * 0.5;
      const distToEnd = textBottom - containerMid;
      if (distToEnd < 300 && distToEnd > 0) {
        speedMultiplierRef.current = Math.max(0.05, distToEnd / 300);
      } else if (distToEnd <= 0) {
        speedMultiplierRef.current = 0;
        setScrolling(false);
      } else {
        speedMultiplierRef.current = 1;
      }
      scrollPosRef.current -= speed * 0.1 * speedMultiplierRef.current;
      textRef.current.style.top = scrollPosRef.current + "%";
    }
    animRef.current = requestAnimationFrame(animate);
  }, [scrolling, speed]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [animate]);

  // Keyboard
  useEffect(() => {
    const STEP = 80;
    const handleKey = (e: KeyboardEvent) => {
      if (showSetup) return;
      if (e.code === "Space") { e.preventDefault(); setScrolling((s) => !s); }
      if (e.code === "PageDown" || e.code === "ArrowDown") {
        e.preventDefault();
        if (textRef.current) {
          const containerH = textRef.current.parentElement?.clientHeight || 1;
          scrollPosRef.current -= (STEP / containerH) * 100;
          textRef.current.style.top = scrollPosRef.current + "%";
        }
      }
      if (e.code === "PageUp" || e.code === "ArrowUp") {
        e.preventDefault();
        if (textRef.current) {
          const containerH = textRef.current.parentElement?.clientHeight || 1;
          scrollPosRef.current += (STEP / containerH) * 100;
          textRef.current.style.top = scrollPosRef.current + "%";
        }
      }
      if (e.code === "NumpadAdd" || (e.key === "+" && e.location === 3)) { e.preventDefault(); setSpeed((s) => Math.min(10, s + 1)); }
      if (e.code === "NumpadSubtract" || (e.key === "-" && e.location === 3)) { e.preventDefault(); setSpeed((s) => Math.max(0, s - 1)); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showSetup]);

  // Mouse wheel
  useEffect(() => {
    const el = containerRef.current?.querySelector("[data-tp-display]") as HTMLElement | null;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (showSetup) return;
      e.preventDefault();
      if (textRef.current) {
        const containerH = textRef.current.parentElement?.clientHeight || 1;
        const step = 60;
        scrollPosRef.current += (e.deltaY > 0 ? -step : step) / containerH * 100;
        textRef.current.style.top = scrollPosRef.current + "%";
      }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [showSetup]);

  // Remote control listener
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tp-control-${user.id}`)
      .on("broadcast", { event: "tp-command" }, (payload: any) => {
        const cmd = payload.payload;
        if (!cmd) return;
        setRemoteActive(true);
        if (remoteTimeoutRef.current) clearTimeout(remoteTimeoutRef.current);
        remoteTimeoutRef.current = setTimeout(() => setRemoteActive(false), 5000);
        switch (cmd.action) {
          case "play": setScrolling(true); break;
          case "pause": setScrolling(false); break;
          case "toggle": setScrolling(s => !s); break;
          case "speed": setSpeed(cmd.value); break;
          case "fontSize": setFontSize(cmd.value); break;
          case "reset":
            setScrolling(false);
            scrollPosRef.current = 50;
            if (textRef.current) textRef.current.style.top = "50%";
            setTimerSeconds(0);
            break;
          case "scrollStep":
            if (textRef.current) {
              const containerH = textRef.current.parentElement?.clientHeight || 1;
              scrollPosRef.current += (cmd.value / containerH) * 100;
              textRef.current.style.top = scrollPosRef.current + "%";
            }
            break;
          case "flipH": setFlipH(f => !f); break;
          case "flipV": setFlipV(f => !f); break;
          case "loadText":
            setDisplayText(cmd.value.text);
            setIsHtmlContent(cmd.value.html);
            scrollPosRef.current = 50;
            if (textRef.current) textRef.current.style.top = "50%";
            setTimerSeconds(0);
            setScrolling(false);
            break;
        }
      });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Broadcast state to controller
  const stateChannelRef = useRef<any>(null);
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`tp-state-${user.id}`);
    ch.subscribe();
    stateChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); stateChannelRef.current = null; };
  }, [user]);

  // Smart broadcast — only send when state actually changes + slow keepalive
  const lastBroadcastRef = useRef<string>("");

  function buildStatePayload() {
    return {
      scrolling, speed, fontSize, flipH, flipV,
      displayText: displayText.substring(0, 2000),
      isHtmlContent, timerSeconds,
      scrollPos: scrollPosRef.current,
    };
  }

  function broadcastState() {
    if (!stateChannelRef.current) return;
    const payload = buildStatePayload();
    const signature = `${payload.scrolling}-${payload.speed}-${payload.fontSize}-${payload.flipH}-${payload.flipV}-${payload.isHtmlContent}-${Math.round(payload.scrollPos)}-${payload.timerSeconds}-${payload.displayText.length}`;
    if (signature === lastBroadcastRef.current) return;
    lastBroadcastRef.current = signature;
    stateChannelRef.current.send({ type: "broadcast", event: "tp-state", payload });
  }

  // Broadcast on any state change
  useEffect(() => { broadcastState(); }, [scrolling, speed, fontSize, flipH, flipV, displayText, isHtmlContent, timerSeconds]);

  // When scrolling, broadcast scroll position at ~10fps instead of 60fps
  useEffect(() => {
    if (!scrolling) return;
    const id = setInterval(() => {
      if (!stateChannelRef.current) return;
      const payload = buildStatePayload();
      lastBroadcastRef.current = "";  // force send
      stateChannelRef.current.send({ type: "broadcast", event: "tp-state", payload });
    }, 100);
    return () => clearInterval(id);
  }, [scrolling, speed, fontSize, flipH, flipV, isHtmlContent]);

  // Slow keepalive (every 2s) so controller knows TP is alive
  useEffect(() => {
    if (!stateChannelRef.current) return;
    const id = setInterval(() => {
      const payload = buildStatePayload();
      stateChannelRef.current?.send({ type: "broadcast", event: "tp-state", payload });
    }, 2000);
    return () => clearInterval(id);
  }, [user]);

  function applyText(text: string, html = false) {
    setDisplayText(text);
    setIsHtmlContent(html);
    scrollPosRef.current = 50;
    if (textRef.current) textRef.current.style.top = "50%";
    setTimerSeconds(0);
    setShowSetup(false);
  }

  function handleSaveManual() { if (inputText.trim()) applyText(inputText, false); }

  function handleLoadRoteiro() {
    const r = roteiros.find((x) => x.id === selectedRoteiroId);
    if (r) {
      const parsed = extractRoteiroHtml(r.conteudo_html);
      applyText(parsed || "Roteiro sem conteúdo de texto.", true);
    }
  }

  function handleReset() {
    setScrolling(false);
    scrollPosRef.current = 50;
    if (textRef.current) textRef.current.style.top = "50%";
    setTimerSeconds(0);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  return (
    <div ref={containerRef} className="tp-screen-grid" style={{ display: "grid", gridTemplateColumns: "90px 1fr", height: "100vh", overflow: "hidden", fontFamily: "'Inter', 'Segoe UI', sans-serif", backgroundColor: "#000" }}>

      {/* Sidebar */}
      <div className="tp-sidebar" style={{
        background: "linear-gradient(180deg, #080830 0%, #0d0446 100%)",
        display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center",
        padding: "24px 0", borderRight: "1px solid rgba(74,144,226,0.15)",
      }}>
        <div className="tp-sidebar-top" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "9px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "2px", color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
            TELE<br />PROMPTER
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#4a90e2", marginTop: "8px", fontVariantNumeric: "tabular-nums" }}>
            {clock}
          </div>
          <div style={{ width: "32px", height: "2px", background: "linear-gradient(90deg, transparent, #4a90e2, transparent)", margin: "12px auto" }} />
          <button onClick={handleMsgIconClick} title="Mensagens" style={{
            background: "none", border: "none", cursor: "pointer", position: "relative",
            marginTop: "4px", padding: "4px",
          }}>
            <MessageSquare size={20} color="rgba(255,255,255,0.5)" />
            {hasUnread && (
              <span style={{
                position: "absolute", top: "2px", right: "2px", width: "8px", height: "8px",
                borderRadius: "50%", backgroundColor: "#ef4444",
                boxShadow: "0 0 6px rgba(239,68,68,0.6)",
              }} />
            )}
          </button>
        </div>

        <div className="tp-sidebar-mid" style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
          <button onClick={() => setShowSetup(!showSetup)} title="Configurações" style={{
            background: showSetup ? "rgba(74,144,226,0.2)" : "rgba(255,255,255,0.05)",
            border: "1px solid rgba(74,144,226,0.3)", borderRadius: "12px",
            width: "44px", height: "44px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}>
            <Settings size={18} color="#4a90e2" />
          </button>
          <button onClick={handleReset} title="Reiniciar" style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px", width: "44px", height: "44px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}>
            <RotateCcw size={16} color="rgba(255,255,255,0.5)" />
          </button>
          <button onClick={onBack} title="Voltar ao menu" style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px", width: "44px", height: "44px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}>
            <LogOut size={16} color="rgba(255,255,255,0.5)" />
          </button>
        </div>

        <div className="tp-sidebar-bottom" style={{ textAlign: "center" }}>
          <div style={{ fontSize: "8px", textTransform: "uppercase", letterSpacing: "1.5px", color: "rgba(255,255,255,0.3)", lineHeight: 1.3, fontWeight: 600 }}>
            tempo de<br />programa
          </div>
          <div style={{
            fontSize: "22px", fontWeight: 700, color: scrolling ? "#4a90e2" : "rgba(255,255,255,0.7)",
            marginTop: "4px", fontVariantNumeric: "tabular-nums", transition: "color 0.3s",
          }}>
            {timerDisplay}
          </div>
        </div>
      </div>

      {/* Display Area */}
      <div data-tp-display style={{ position: "relative", backgroundColor: "#020210", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)" }} />

        {/* Remote control indicator */}
        <div style={{
          position: "absolute", top: "12px", left: "12px", zIndex: 20,
          display: "flex", alignItems: "center", gap: "6px",
          background: remoteActive ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${remoteActive ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.1)"}`,
          borderRadius: "8px", padding: "5px 10px", transition: "all 0.3s ease",
        }}>
          <div style={{
            width: "7px", height: "7px", borderRadius: "50%",
            backgroundColor: remoteActive ? "#22c55e" : "rgba(255,255,255,0.2)",
            boxShadow: remoteActive ? "0 0 8px rgba(34,197,94,0.6)" : "none",
            animation: remoteActive ? "tp-remote-blink 1s ease-in-out infinite" : "none",
          }} />
          <span style={{
            fontSize: "9px", fontWeight: 700, letterSpacing: "0.5px", textTransform: "uppercase",
            color: remoteActive ? "#22c55e" : "rgba(255,255,255,0.2)", transition: "color 0.3s",
          }}>
            Controle Remoto {remoteActive ? "Ativo" : "Inativo"}
          </span>
        </div>
        <style>{`
          @keyframes tp-remote-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        `}</style>

        {/* Highlight Banner */}
        {incomingMsg && (
          <div style={{
            position: "absolute", top: "24px", left: "50%", transform: "translateX(-50%)",
            zIndex: 50, transition: "opacity 0.3s, transform 0.3s",
            opacity: msgVisible ? 1 : 0, pointerEvents: msgVisible ? "auto" : "none",
          }}>
            <div style={{
              background: "rgba(13,4,70,0.92)", backdropFilter: "blur(20px)",
              borderRadius: "14px", padding: "16px 24px 10px", minWidth: "300px", maxWidth: "500px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)", overflow: "hidden", position: "relative",
              animation: msgVisible ? "tp-msg-border-pulse 1s ease-in-out infinite" : "none",
              border: "2px solid rgba(255,255,255,0.8)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <MessageSquare size={14} color="#4a90e2" />
                <span style={{ color: "#4a90e2", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
                  {incomingMsg.subject || "Mensagem"}
                </span>
              </div>
              <p style={{ color: "#fff", fontSize: "24px", fontWeight: 700, margin: 0, lineHeight: 1.4 }}>
                {incomingMsg.text}
              </p>
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: "3px", background: "rgba(255,255,255,0.1)" }}>
                <div style={{
                  height: "100%", background: "linear-gradient(90deg, #4a90e2, #2dbff4)",
                  borderRadius: "0 2px 2px 0",
                  animation: msgVisible ? "tp-msg-shrink 5s linear forwards" : "none",
                }} />
              </div>
            </div>
          </div>
        )}

        {/* Message Log */}
        {messageLog.length > 0 && (
          <div style={{
            position: "absolute", bottom: "16px", right: "16px", zIndex: 40,
            maxWidth: "360px", maxHeight: "40vh", overflowY: "auto",
            display: "flex", flexDirection: "column", gap: "6px", scrollbarWidth: "none",
          }}>
            {messageLog.slice(-5).map((m, i) => {
              const isLatest = i === messageLog.slice(-5).length - 1;
              const age = Date.now() - m.ts;
              const fading = age > 30000;
              return (
                <div key={m.ts + i} style={{
                  background: isLatest ? "rgba(13,4,70,0.85)" : "rgba(13,4,70,0.5)",
                  backdropFilter: "blur(12px)", borderRadius: "10px", padding: "8px 14px",
                  border: isLatest ? "1px solid rgba(74,144,226,0.5)" : "1px solid rgba(255,255,255,0.08)",
                  opacity: fading ? 0.5 : 1, transition: "opacity 0.5s",
                  animation: isLatest ? "tp-msg-log-in 0.3s ease-out" : "none",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "2px" }}>
                    <MessageSquare size={10} color={isLatest ? "#4a90e2" : "rgba(255,255,255,0.3)"} />
                    <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>
                      {new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p style={{
                    color: isLatest ? "#fff" : "rgba(255,255,255,0.7)",
                    fontSize: isLatest ? "16px" : "13px", fontWeight: isLatest ? 700 : 500,
                    margin: 0, lineHeight: 1.3,
                  }}>
                    {m.text}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        <style>{`
          @keyframes tp-msg-shrink { from { width: 100%; } to { width: 0%; } }
          @keyframes tp-msg-border-pulse {
            0%, 100% { border-color: rgba(255,255,255,0.9); box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 15px rgba(255,255,255,0.2); }
            50% { border-color: rgba(255,255,255,0.2); box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 5px rgba(255,255,255,0.05); }
          }
          @keyframes tp-msg-log-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        {/* Fade overlays */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "25%",
          background: "linear-gradient(to bottom, #020210 0%, rgba(2,2,16,0.85) 40%, rgba(2,2,16,0) 100%)",
          pointerEvents: "none", zIndex: 8,
        }} />
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: "15%",
          background: "linear-gradient(to top, #020210 0%, rgba(2,2,16,0) 100%)",
          pointerEvents: "none", zIndex: 8,
        }} />

        {/* Eyeline markers */}
        <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}>
          <div style={{ width: 0, height: 0, borderTop: "20px solid transparent", borderBottom: "20px solid transparent", borderLeft: "32px solid #4a90e2", filter: "drop-shadow(0 0 8px rgba(74,144,226,0.5))" }} />
        </div>
        <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%) rotate(180deg)", zIndex: 10 }}>
          <div style={{ width: 0, height: 0, borderTop: "20px solid transparent", borderBottom: "20px solid transparent", borderLeft: "32px solid #4a90e2", filter: "drop-shadow(0 0 8px rgba(74,144,226,0.5))", opacity: 0.4 }} />
        </div>
        <div style={{ position: "absolute", left: "40px", right: "40px", top: "50%", height: "1px", background: "rgba(74,144,226,0.3)", zIndex: 6 }} />

        {/* Text */}
        <div ref={textRef} style={{
          width: "75%", margin: "0 auto", fontSize: `${fontSize}px`, lineHeight: 1.5,
          textAlign: "center", whiteSpace: "pre-wrap", position: "absolute", top: "50%", left: "12.5%",
          transition: scrolling ? "font-size 0.2s" : "top 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), font-size 0.2s",
          color: "#ffffff", textShadow: "0 2px 20px rgba(0,0,0,0.5)", fontWeight: 400,
          transform: `${flipH ? "scaleX(-1)" : ""} ${flipV ? "scaleY(-1)" : ""}`.trim() || "none",
        }}>
          {isHtmlContent ? <span dangerouslySetInnerHTML={{ __html: displayText }} /> : displayText}
        </div>

        {/* Controls bar */}
        <div className="tp-controls-bar" style={{
          position: "absolute", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(11,11,48,0.9)", backdropFilter: "blur(20px)",
          padding: "10px 24px", borderRadius: "20px",
          display: "flex", alignItems: "center", gap: "12px",
          border: "1px solid rgba(74,144,226,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", zIndex: 20,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button onClick={() => setFontSize((s) => Math.max(20, s - 5))} style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px", padding: "6px 10px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 3, color: "#fff", fontSize: "11px", fontWeight: 700,
            }}>
              <Minus size={10} /> A
            </button>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", minWidth: "30px", textAlign: "center" }}>{fontSize}px</span>
            <button onClick={() => setFontSize((s) => Math.min(120, s + 5))} style={{
              background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
              borderRadius: "8px", padding: "6px 10px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 3, color: "#fff", fontSize: "11px", fontWeight: 700,
            }}>
              <Plus size={10} /> A
            </button>
          </div>
          <div className="tp-divider" style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Type size={12} color="rgba(255,255,255,0.3)" />
            <input type="range" min={0} max={10} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
              className="tp-speed-slider" style={{ width: "120px", accentColor: "#4a90e2", height: "4px" }} />
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", minWidth: "14px" }}>{speed}</span>
          </div>
          <div className="tp-divider" style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
          <button className="tp-play-btn" onClick={() => setScrolling(!scrolling)} style={{
            background: scrolling ? "linear-gradient(135deg, #e24a4a, #c0392b)" : "linear-gradient(135deg, #4a90e2, #2d6dc0)",
            border: "none", borderRadius: "50%", width: "44px", height: "44px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: scrolling ? "0 4px 16px rgba(226,74,74,0.4)" : "0 4px 16px rgba(74,144,226,0.4)",
            transition: "all 0.3s",
          }}>
            {scrolling ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" style={{ marginLeft: "2px" }} />}
          </button>
          <div className="tp-divider" style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
          <button onClick={() => setFlipH((f) => !f)} title="Inverter horizontalmente"
            style={{ ...controlBtnStyle, background: flipH ? "rgba(74,144,226,0.2)" : controlBtnStyle.background }}>
            <FlipHorizontal2 size={14} color={flipH ? "#4a90e2" : "rgba(255,255,255,0.5)"} />
          </button>
          <button onClick={() => setFlipV((f) => !f)} title="Inverter verticalmente"
            style={{ ...controlBtnStyle, background: flipV ? "rgba(74,144,226,0.2)" : controlBtnStyle.background }}>
            <FlipVertical2 size={14} color={flipV ? "#4a90e2" : "rgba(255,255,255,0.5)"} />
          </button>
          <button onClick={toggleFullscreen} title="Tela cheia" style={controlBtnStyle}>
            <Maximize size={14} color="rgba(255,255,255,0.5)" />
          </button>
        </div>

        {/* Setup Modal */}
        {showSetup && (
          <>
            <div onClick={() => setShowSetup(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 90 }} />
            <div className="tp-setup-modal" style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              width: "min(650px, 85%)", maxHeight: "75vh",
              background: "linear-gradient(135deg, #0d0446, #1a0a6e)",
              border: "1px solid rgba(74,144,226,0.3)",
              zIndex: 100, padding: "28px", borderRadius: "16px",
              display: "flex", flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)", overflow: "hidden",
            }}>
              <h3 style={{ margin: "0 0 4px", color: "#fff", fontSize: "16px", fontWeight: 700 }}>
                Carregar Texto no Teleprompter
              </h3>
              <p style={{ margin: "0 0 16px", color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
                Selecione um roteiro salvo ou cole um texto manualmente
              </p>

              <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
                <button onClick={() => setTab("roteiros")} style={tabBtnStyle(tab === "roteiros")}>
                  <FileText size={12} style={{ display: "inline", marginRight: "6px", verticalAlign: "-2px" }} />
                  Roteiros Salvos
                </button>
                <button onClick={() => setTab("manual")} style={tabBtnStyle(tab === "manual")}>
                  Texto Manual
                </button>
              </div>

              {tab === "roteiros" ? (
                <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
                  {!user ? (
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
                      Faça login para acessar seus roteiros salvos.
                    </p>
                  ) : roteiros.length === 0 ? (
                    <p style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px", textAlign: "center", padding: "40px 0" }}>
                      Nenhum roteiro encontrado.
                    </p>
                  ) : (
                    <>
                      <div style={{
                        flex: 1, overflowY: "auto", borderRadius: "10px",
                        border: "1px solid rgba(255,255,255,0.1)", marginBottom: "12px",
                      }}>
                        {roteiros.map((r) => {
                          const isSelected = selectedRoteiroId === r.id;
                          return (
                            <button
                              key={r.id}
                              onClick={() => setSelectedRoteiroId(r.id)}
                              style={{
                                width: "100%", textAlign: "left", padding: "12px 14px",
                                background: isSelected ? "rgba(74,144,226,0.15)" : "transparent",
                                border: "none", borderBottom: "1px solid rgba(255,255,255,0.06)",
                                cursor: "pointer", transition: "all 0.15s",
                                display: "flex", flexDirection: "column", gap: "2px",
                              }}
                              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}
                              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{ color: isSelected ? "#4a90e2" : "#fff", fontSize: "13px", fontWeight: 600 }}>
                                  {r.programa_nome || "Sem programa"}
                                </span>
                                {r.numero_roteiro && (
                                  <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "11px" }}>#{r.numero_roteiro}</span>
                                )}
                              </div>
                              <span style={{ color: "rgba(255,255,255,0.35)", fontSize: "11px" }}>
                                {r.data_programa} {r.horario ? `· ${r.horario}` : ""} {r.titulo ? `· ${r.titulo}` : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={handleLoadRoteiro}
                        disabled={!selectedRoteiroId}
                        style={{
                          background: selectedRoteiroId ? "linear-gradient(135deg, #4a90e2, #2d6dc0)" : "rgba(255,255,255,0.05)",
                          color: selectedRoteiroId ? "#fff" : "rgba(255,255,255,0.3)",
                          border: "none", borderRadius: "10px", padding: "10px 24px",
                          fontWeight: 700, cursor: selectedRoteiroId ? "pointer" : "not-allowed",
                          fontSize: "13px", alignSelf: "flex-start", transition: "all 0.2s",
                        }}
                      >
                        CARREGAR ROTEIRO
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Cole o texto aqui..."
                    style={{
                      flex: 1, minHeight: "180px", background: "rgba(0,0,0,0.3)", color: "#fff",
                      border: "1px solid rgba(255,255,255,0.1)", padding: "14px", borderRadius: "10px",
                      resize: "none", fontSize: "14px", lineHeight: 1.6, outline: "none",
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(74,144,226,0.5)"; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                  />
                  <button
                    onClick={handleSaveManual}
                    disabled={!inputText.trim()}
                    style={{
                      marginTop: "12px",
                      background: inputText.trim() ? "linear-gradient(135deg, #4a90e2, #2d6dc0)" : "rgba(255,255,255,0.05)",
                      color: inputText.trim() ? "#fff" : "rgba(255,255,255,0.3)",
                      border: "none", borderRadius: "10px", padding: "10px 24px",
                      fontWeight: 700, cursor: inputText.trim() ? "pointer" : "not-allowed",
                      fontSize: "13px", alignSelf: "flex-start",
                    }}
                  >
                    CARREGAR TEXTO
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowSetup(false)}
                style={{
                  marginTop: "12px", background: "none", color: "rgba(255,255,255,0.4)",
                  border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px",
                  padding: "8px 16px", cursor: "pointer", fontSize: "12px", alignSelf: "flex-start",
                }}
              >
                Cancelar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
