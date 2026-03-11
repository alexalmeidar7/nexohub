import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, Minus, Plus, Play, Pause, RotateCcw, Type, FileText, Maximize, FlipHorizontal2, FlipVertical2, MessageSquare, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Roteiro, extractRoteiroHtml, tpControlBtnClasses, tpControlBtnActiveClasses } from "./tp-utils";

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

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tp-msg-${user.id}`, { config: { broadcast: { self: true } } })
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

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(now.getHours().toString().padStart(2, "0") + ":" + now.getMinutes().toString().padStart(2, "0"));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
      .channel(`tp-control-${user.id}`, { config: { broadcast: { self: true } } })
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
          case "requestState":
            queueStateBroadcast(true);
            break;
        }
      });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Broadcast state to controller (reliable queue)
  const stateChannelRef = useRef<any>(null);
  const stateReadyRef = useRef(false);
  const stateSendingRef = useRef(false);
  const pendingStateRef = useRef<any>(null);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`tp-state-${user.id}`, { config: { broadcast: { self: true } } });
    ch.subscribe((status) => {
      stateReadyRef.current = status === "SUBSCRIBED";
      if (stateReadyRef.current) {
        void flushStateQueue();
      }
    });
    stateChannelRef.current = ch;
    return () => {
      stateReadyRef.current = false;
      stateSendingRef.current = false;
      pendingStateRef.current = null;
      supabase.removeChannel(ch);
      stateChannelRef.current = null;
    };
  }, [user]);

  const lastBroadcastRef = useRef<string>("");

  // Keep a ref with latest state to avoid stale closures in intervals/handlers
  const latestStateRef = useRef({ scrolling, speed, fontSize, flipH, flipV, displayText, isHtmlContent, timerSeconds });
  useEffect(() => {
    latestStateRef.current = { scrolling, speed, fontSize, flipH, flipV, displayText, isHtmlContent, timerSeconds };
  }, [scrolling, speed, fontSize, flipH, flipV, displayText, isHtmlContent, timerSeconds]);

  function buildStatePayload() {
    const s = latestStateRef.current;
    return {
      scrolling: s.scrolling,
      speed: s.speed,
      fontSize: s.fontSize,
      flipH: s.flipH,
      flipV: s.flipV,
      displayText: s.displayText.substring(0, 2000),
      isHtmlContent: s.isHtmlContent,
      timerSeconds: s.timerSeconds,
      scrollPos: scrollPosRef.current,
    };
  }

  async function flushStateQueue() {
    if (stateSendingRef.current || !stateReadyRef.current || !stateChannelRef.current) return;
    stateSendingRef.current = true;

    while (pendingStateRef.current && stateReadyRef.current && stateChannelRef.current) {
      const payload = pendingStateRef.current;
      pendingStateRef.current = null;
      try {
        await stateChannelRef.current.send({ type: "broadcast", event: "tp-state", payload });
      } catch (err) {
        console.error("Erro ao enviar estado TP:", err);
        pendingStateRef.current = payload;
        break;
      }
    }

    stateSendingRef.current = false;
  }

  function queueStateBroadcast(force = false) {
    const payload = buildStatePayload();
    const signature = `${payload.scrolling}-${payload.speed}-${payload.fontSize}-${payload.flipH}-${payload.flipV}-${payload.isHtmlContent}-${Math.round(payload.scrollPos)}-${payload.timerSeconds}-${payload.displayText.length}`;

    if (!force && signature === lastBroadcastRef.current) return;
    lastBroadcastRef.current = signature;
    pendingStateRef.current = payload;
    void flushStateQueue();
  }

  useEffect(() => {
    queueStateBroadcast(false);
  }, [scrolling, speed, fontSize, flipH, flipV, displayText, isHtmlContent, timerSeconds]);

  useEffect(() => {
    if (!scrolling) return;
    const id = setInterval(() => {
      queueStateBroadcast(true);
    }, 100);
    return () => clearInterval(id);
  }, [scrolling]);

  useEffect(() => {
    const id = setInterval(() => {
      queueStateBroadcast(true);
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
    <div ref={containerRef} className="tp-screen-grid overflow-hidden font-['Inter','Segoe_UI',sans-serif] bg-black" style={{ display: "grid", gridTemplateColumns: "90px 1fr", height: "100vh" }}>

      {/* Sidebar */}
      <div className="tp-sidebar bg-gradient-to-b from-[hsl(240,75%,7%)] to-tp-surface flex flex-col justify-between items-center py-6 border-r border-tp-accent/15">
        <div className="tp-sidebar-top text-center">
          <div className="text-[9px] uppercase font-bold tracking-[2px] text-tp-muted leading-tight">
            TELE<br />PROMPTER
          </div>
          <div className="text-2xl font-bold text-tp-accent mt-2 tabular-nums">
            {clock}
          </div>
          <div className="w-8 h-0.5 bg-gradient-to-r from-transparent via-tp-accent to-transparent mx-auto my-3" />
          <button onClick={handleMsgIconClick} title="Mensagens" className="bg-transparent border-none cursor-pointer relative mt-1 p-1">
            <MessageSquare size={20} className="text-tp-muted-strong" />
            {hasUnread && (
              <span className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-destructive shadow-[0_0_6px_hsl(var(--destructive)/0.6)]" />
            )}
          </button>
        </div>

        <div className="tp-sidebar-mid flex flex-col gap-4 items-center">
          <button onClick={() => setShowSetup(!showSetup)} title="Configurações" className={`rounded-xl w-11 h-11 cursor-pointer flex items-center justify-center transition-all border ${showSetup ? "bg-tp-accent/20 border-tp-border" : "bg-tp-foreground/5 border-tp-border"}`}>
            <Settings size={18} className="text-tp-accent" />
          </button>
          <button onClick={handleReset} title="Reiniciar" className="bg-tp-foreground/5 border border-tp-border-subtle rounded-xl w-11 h-11 cursor-pointer flex items-center justify-center transition-all">
            <RotateCcw size={16} className="text-tp-muted-strong" />
          </button>
          <button onClick={onBack} title="Voltar ao menu" className="bg-tp-foreground/5 border border-tp-border-subtle rounded-xl w-11 h-11 cursor-pointer flex items-center justify-center transition-all">
            <LogOut size={16} className="text-tp-muted-strong" />
          </button>
        </div>

        <div className="tp-sidebar-bottom text-center">
          <div className="text-[8px] uppercase tracking-[1.5px] text-tp-foreground/30 leading-tight font-semibold">
            tempo de<br />programa
          </div>
          <div className={`text-[22px] font-bold mt-1 tabular-nums transition-colors ${scrolling ? "text-tp-accent" : "text-tp-foreground/70"}`}>
            {timerDisplay}
          </div>
        </div>
      </div>

      {/* Display Area */}
      <div data-tp-display className="relative bg-tp-display overflow-hidden">
        <div className="absolute inset-0 pointer-events-none z-[5]" style={{ background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)" }} />

        {/* Remote control indicator */}
        <div className={`absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 transition-all border ${remoteActive ? "bg-green-500/15 border-green-500/50" : "bg-tp-foreground/5 border-tp-border-subtle"}`}>
          <div className={`w-[7px] h-[7px] rounded-full ${remoteActive ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)] animate-[tp-remote-blink_1s_ease-in-out_infinite]" : "bg-tp-foreground/20"}`} />
          <span className={`text-[9px] font-bold tracking-wider uppercase transition-colors ${remoteActive ? "text-green-500" : "text-tp-foreground/20"}`}>
            Controle Remoto {remoteActive ? "Ativo" : "Inativo"}
          </span>
        </div>
        <style>{`
          @keyframes tp-remote-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
        `}</style>

        {/* Highlight Banner */}
        {incomingMsg && (
          <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 transition-all duration-300" style={{ opacity: msgVisible ? 1 : 0, pointerEvents: msgVisible ? "auto" : "none" }}>
            <div className="bg-tp-surface/[0.92] backdrop-blur-[20px] rounded-[14px] px-6 pt-4 pb-2.5 min-w-[300px] max-w-[500px] shadow-[0_12px_40px_hsl(var(--tp-shadow))] overflow-hidden relative border-2 border-tp-foreground/80" style={{ animation: msgVisible ? "tp-msg-border-pulse 1s ease-in-out infinite" : "none" }}>
              <div className="flex items-center gap-2 mb-1.5">
                <MessageSquare size={14} className="text-tp-accent" />
                <span className="text-tp-accent text-[11px] font-bold uppercase tracking-wider">
                  {incomingMsg.subject || "Mensagem"}
                </span>
              </div>
              <p className="text-tp-foreground text-2xl font-bold m-0 leading-relaxed">
                {incomingMsg.text}
              </p>
              <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-tp-foreground/10">
                <div className="h-full bg-gradient-to-r from-tp-accent to-sky-400 rounded-r-sm" style={{ animation: msgVisible ? "tp-msg-shrink 5s linear forwards" : "none" }} />
              </div>
            </div>
          </div>
        )}

        {/* Message Log */}
        {messageLog.length > 0 && (
          <div className="absolute bottom-4 right-4 z-40 max-w-[360px] max-h-[40vh] overflow-y-auto flex flex-col gap-1.5" style={{ scrollbarWidth: "none" }}>
            {messageLog.slice(-5).map((m, i) => {
              const isLatest = i === messageLog.slice(-5).length - 1;
              const age = Date.now() - m.ts;
              const fading = age > 30000;
              return (
                <div key={m.ts + i} className={`backdrop-blur-[12px] rounded-[10px] px-3.5 py-2 ${isLatest ? "bg-tp-surface/85 border border-tp-accent/50" : "bg-tp-surface/50 border border-tp-foreground/[0.08]"}`} style={{
                  opacity: fading ? 0.5 : 1, transition: "opacity 0.5s",
                  animation: isLatest ? "tp-msg-log-in 0.3s ease-out" : "none",
                }}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <MessageSquare size={10} className={isLatest ? "text-tp-accent" : "text-tp-foreground/30"} />
                    <span className="text-[9px] text-tp-muted font-semibold">
                      {new Date(m.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className={`m-0 leading-tight ${isLatest ? "text-tp-foreground text-base font-bold" : "text-tp-foreground/70 text-[13px] font-medium"}`}>
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
            0%, 100% { border-color: hsl(var(--tp-foreground) / 0.9); box-shadow: 0 12px 40px hsl(var(--tp-shadow)), 0 0 15px hsl(var(--tp-foreground) / 0.2); }
            50% { border-color: hsl(var(--tp-foreground) / 0.2); box-shadow: 0 12px 40px hsl(var(--tp-shadow)), 0 0 5px hsl(var(--tp-foreground) / 0.05); }
          }
          @keyframes tp-msg-log-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        `}</style>

        {/* Fade overlays */}
        <div className="absolute top-0 left-0 right-0 h-1/4 bg-gradient-to-b from-tp-display via-tp-display/85 to-transparent pointer-events-none z-[8]" />
        <div className="absolute bottom-0 left-0 right-0 h-[15%] bg-gradient-to-t from-tp-display to-transparent pointer-events-none z-[8]" />

        {/* Eyeline markers */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
          <div className="w-0 h-0 border-t-[20px] border-t-transparent border-b-[20px] border-b-transparent border-l-[32px] border-l-tp-accent drop-shadow-[0_0_8px_hsl(var(--tp-accent)/0.5)]" />
        </div>
        <div className="absolute right-0 top-1/2 -translate-y-1/2 rotate-180 z-10">
          <div className="w-0 h-0 border-t-[20px] border-t-transparent border-b-[20px] border-b-transparent border-l-[32px] border-l-tp-accent opacity-40 drop-shadow-[0_0_8px_hsl(var(--tp-accent)/0.5)]" />
        </div>
        <div className="absolute left-10 right-10 top-1/2 h-px bg-tp-accent/30 z-[6]" />

        {/* Text */}
        <div ref={textRef} className="absolute text-tp-foreground font-normal" style={{
          width: "75%", fontSize: `${fontSize}px`, lineHeight: 1.5,
          textAlign: "center", whiteSpace: "pre-wrap", top: "50%", left: "12.5%",
          transition: scrolling ? "font-size 0.2s" : "top 0.35s cubic-bezier(0.25, 0.1, 0.25, 1), font-size 0.2s",
          textShadow: "0 2px 20px rgba(0,0,0,0.5)",
          transform: `${flipH ? "scaleX(-1)" : ""} ${flipV ? "scaleY(-1)" : ""}`.trim() || "none",
        }}>
          {isHtmlContent ? <span dangerouslySetInnerHTML={{ __html: displayText }} /> : displayText}
        </div>

        {/* Controls bar */}
        <div className="tp-controls-bar absolute bottom-6 left-1/2 -translate-x-1/2 bg-tp-control backdrop-blur-[20px] px-6 py-2.5 rounded-[20px] flex items-center gap-3 border border-tp-accent/20 shadow-[0_8px_32px_hsl(var(--tp-shadow))] z-20">
          <div className="flex items-center gap-1">
            <button onClick={() => setFontSize((s) => Math.max(20, s - 5))} className={`${tpControlBtnClasses} px-2.5 py-1.5 text-[11px] font-bold gap-0.5`}>
              <Minus size={10} /> A
            </button>
            <span className="text-[10px] text-tp-foreground/30 min-w-[30px] text-center">{fontSize}px</span>
            <button onClick={() => setFontSize((s) => Math.min(120, s + 5))} className={`${tpControlBtnClasses} px-2.5 py-1.5 text-[11px] font-bold gap-0.5`}>
              <Plus size={10} /> A
            </button>
          </div>
          <div className="tp-divider w-px h-6 bg-tp-border-subtle" />
          <div className="flex items-center gap-2">
            <Type size={12} className="text-tp-foreground/30" />
            <input type="range" min={0} max={10} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
              className="tp-speed-slider w-[120px] h-1 accent-tp-accent" />
            <span className="text-[10px] text-tp-muted min-w-[14px]">{speed}</span>
          </div>
          <div className="tp-divider w-px h-6 bg-tp-border-subtle" />
          <button className={`tp-play-btn border-none rounded-full w-11 h-11 cursor-pointer flex items-center justify-center transition-all ${
            scrolling
              ? "bg-gradient-to-br from-red-500 to-red-700 shadow-[0_4px_16px_rgba(226,74,74,0.4)]"
              : "bg-gradient-to-br from-tp-accent to-tp-accent-hover shadow-[0_4px_16px_hsl(var(--tp-accent)/0.4)]"
          }`} onClick={() => setScrolling(!scrolling)}>
            {scrolling ? <Pause size={18} className="text-white" /> : <Play size={18} className="text-white ml-0.5" />}
          </button>
          <div className="tp-divider w-px h-6 bg-tp-border-subtle" />
          <button onClick={() => setFlipH((f) => !f)} title="Inverter horizontalmente"
            className={`${tpControlBtnClasses} ${flipH ? tpControlBtnActiveClasses : ""}`}>
            <FlipHorizontal2 size={14} className={flipH ? "text-tp-accent" : "text-tp-muted-strong"} />
          </button>
          <button onClick={() => setFlipV((f) => !f)} title="Inverter verticalmente"
            className={`${tpControlBtnClasses} ${flipV ? tpControlBtnActiveClasses : ""}`}>
            <FlipVertical2 size={14} className={flipV ? "text-tp-accent" : "text-tp-muted-strong"} />
          </button>
          <button onClick={toggleFullscreen} title="Tela cheia" className={tpControlBtnClasses}>
            <Maximize size={14} className="text-tp-muted-strong" />
          </button>
        </div>

        {/* Setup Modal */}
        {showSetup && (
          <>
            <div onClick={() => setShowSetup(false)} className="absolute inset-0 bg-black/60 z-[90]" />
            <div className="tp-setup-modal absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[75vh] bg-gradient-to-br from-tp-surface to-tp-surface-light border border-tp-border z-[100] p-7 rounded-2xl flex flex-col shadow-[0_24px_64px_hsl(var(--tp-shadow))] overflow-hidden" style={{ width: "min(650px, 85%)" }}>
              <h3 className="m-0 mb-1 text-tp-foreground text-base font-bold">
                Carregar Texto no Teleprompter
              </h3>
              <p className="m-0 mb-4 text-tp-muted text-xs">
                Selecione um roteiro salvo ou cole um texto manualmente
              </p>

              <div className="flex gap-2 mb-4">
                <button onClick={() => setTab("roteiros")} className={`rounded-lg px-4 py-2 cursor-pointer text-xs font-semibold transition-all border ${tab === "roteiros" ? "bg-tp-accent/20 border-tp-accent/40 text-tp-accent" : "bg-transparent border-tp-border-subtle text-tp-muted-strong"}`}>
                  <FileText size={12} className="inline mr-1.5 align-[-2px]" />
                  Roteiros Salvos
                </button>
                <button onClick={() => setTab("manual")} className={`rounded-lg px-4 py-2 cursor-pointer text-xs font-semibold transition-all border ${tab === "manual" ? "bg-tp-accent/20 border-tp-accent/40 text-tp-accent" : "bg-transparent border-tp-border-subtle text-tp-muted-strong"}`}>
                  Texto Manual
                </button>
              </div>

              {tab === "roteiros" ? (
                <div className="flex-1 flex flex-col min-h-0">
                  {!user ? (
                    <p className="text-tp-muted-strong text-[13px] text-center py-10">
                      Faça login para acessar seus roteiros salvos.
                    </p>
                  ) : roteiros.length === 0 ? (
                    <p className="text-tp-muted-strong text-[13px] text-center py-10">
                      Nenhum roteiro encontrado.
                    </p>
                  ) : (
                    <>
                      <div className="flex-1 overflow-y-auto rounded-[10px] border border-tp-border-subtle mb-3">
                        {roteiros.map((r) => {
                          const isSelected = selectedRoteiroId === r.id;
                          return (
                            <button
                              key={r.id}
                              onClick={() => setSelectedRoteiroId(r.id)}
                              className={`w-full text-left px-3.5 py-3 border-none cursor-pointer transition-all flex flex-col gap-0.5 border-b border-b-tp-foreground/[0.06] ${isSelected ? "bg-tp-accent/15" : "bg-transparent hover:bg-tp-foreground/[0.04]"}`}
                            >
                              <div className="flex items-center gap-2">
                                <span className={`text-[13px] font-semibold ${isSelected ? "text-tp-accent" : "text-tp-foreground"}`}>
                                  {r.programa_nome || "Sem programa"}
                                </span>
                                {r.numero_roteiro && (
                                  <span className="text-tp-foreground/30 text-[11px]">#{r.numero_roteiro}</span>
                                )}
                              </div>
                              <span className="text-tp-foreground/[0.35] text-[11px]">
                                {r.data_programa} {r.horario ? `· ${r.horario}` : ""} {r.titulo ? `· ${r.titulo}` : ""}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={handleLoadRoteiro}
                        disabled={!selectedRoteiroId}
                        className={`rounded-[10px] px-6 py-2.5 font-bold text-[13px] self-start transition-all border-none ${
                          selectedRoteiroId
                            ? "bg-gradient-to-br from-tp-accent to-tp-accent-hover text-white cursor-pointer"
                            : "bg-tp-foreground/5 text-tp-foreground/30 cursor-not-allowed"
                        }`}
                      >
                        CARREGAR ROTEIRO
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="Cole o texto aqui..."
                    className="flex-1 min-h-[180px] bg-black/30 text-tp-foreground border border-tp-border-subtle p-3.5 rounded-[10px] resize-none text-sm leading-relaxed outline-none focus:border-tp-accent/50"
                  />
                  <button
                    onClick={handleSaveManual}
                    disabled={!inputText.trim()}
                    className={`mt-3 rounded-[10px] px-6 py-2.5 font-bold text-[13px] self-start border-none ${
                      inputText.trim()
                        ? "bg-gradient-to-br from-tp-accent to-tp-accent-hover text-white cursor-pointer"
                        : "bg-tp-foreground/5 text-tp-foreground/30 cursor-not-allowed"
                    }`}
                  >
                    CARREGAR TEXTO
                  </button>
                </div>
              )}

              <button
                onClick={() => setShowSetup(false)}
                className="mt-3 bg-transparent text-tp-muted border border-tp-border-subtle rounded-[10px] px-4 py-2 cursor-pointer text-xs self-start"
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
