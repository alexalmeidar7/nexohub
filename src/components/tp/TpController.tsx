import { useState, useEffect, useRef } from "react";
import { Settings, Minus, Plus, Play, Pause, RotateCcw, Type, FileText, FlipHorizontal2, FlipVertical2, SlidersHorizontal, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Roteiro, extractRoteiroHtml, tpControlBtnClasses, tpControlBtnActiveClasses } from "./tp-utils";

interface TpControllerProps {
  user: User | null;
  onBack: () => void;
}

export default function TpController({ user, onBack }: TpControllerProps) {
  const [tpState, setTpState] = useState<any>(null);
  const [connected, setConnected] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [roteiros, setRoteiros] = useState<Roteiro[]>([]);
  const [selectedRoteiroId, setSelectedRoteiroId] = useState("");
  const [tab, setTab] = useState<"roteiros" | "manual">("roteiros");
  const [inputText, setInputText] = useState("");

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

  const lastStateAtRef = useRef(0);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`tp-state-${user.id}`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "tp-state" }, (payload: any) => {
        setTpState(payload.payload);
        lastStateAtRef.current = Date.now();
        setConnected(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  useEffect(() => {
    const id = setInterval(() => {
      if (!lastStateAtRef.current) { setConnected(false); return; }
      setConnected(Date.now() - lastStateAtRef.current < 4000);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const cmdChannelRef = useRef<any>(null);
  const cmdReadyRef = useRef(false);
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`tp-control-${user.id}`);
    ch.subscribe((status) => { cmdReadyRef.current = status === "SUBSCRIBED"; });
    cmdChannelRef.current = ch;
    return () => {
      cmdReadyRef.current = false;
      supabase.removeChannel(ch);
      cmdChannelRef.current = null;
    };
  }, [user]);

  async function sendCommand(action: string, value?: any) {
    if (!cmdChannelRef.current) return;
    if (!cmdReadyRef.current) {
      await new Promise<void>((resolve) => {
        const started = Date.now();
        const check = setInterval(() => {
          if (cmdReadyRef.current || Date.now() - started > 1000) { clearInterval(check); resolve(); }
        }, 40);
      });
    }
    await cmdChannelRef.current.send({
      type: "broadcast", event: "tp-command",
      payload: { action, value },
    });
  }

  // Handshake/fallback: ask TP to re-broadcast state while disconnected
  useEffect(() => {
    if (!user || connected) return;
    const id = setInterval(() => {
      void sendCommand("requestState");
    }, 1500);
    return () => clearInterval(id);
  }, [user, connected]);

  const scrolling = tpState?.scrolling ?? false;
  const speed = tpState?.speed ?? 2;
  const fontSize = tpState?.fontSize ?? 60;
  const flipH = tpState?.flipH ?? false;
  const flipV = tpState?.flipV ?? false;
  const displayText = tpState?.displayText ?? "";
  const isHtmlContent = tpState?.isHtmlContent ?? false;
  const timerSeconds = tpState?.timerSeconds ?? 0;
  const serverScrollPos = tpState?.scrollPos ?? 50;

  const localScrollRef = useRef(50);
  const previewTextRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localScrollRef.current = serverScrollPos;
    if (previewTextRef.current) previewTextRef.current.style.top = `${serverScrollPos}%`;
  }, [serverScrollPos]);

  useEffect(() => {
    if (!scrolling) return;
    let animId: number;
    const animate = () => {
      localScrollRef.current -= speed * 0.1;
      if (previewTextRef.current) previewTextRef.current.style.top = `${localScrollRef.current}%`;
      animId = requestAnimationFrame(animate);
    };
    animId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animId);
  }, [scrolling, speed]);

  const timerDisplay = (() => {
    const m = Math.floor(timerSeconds / 60).toString().padStart(2, "0");
    const s = (timerSeconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  })();

  const [clock, setClock] = useState("00:00");
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
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        if (showSetup) { setShowSetup(false); return; }
        onBack();
        return;
      }
      if (showSetup) return;
      if (e.code === "Space") { e.preventDefault(); sendCommand("toggle"); }
      if (e.code === "NumpadAdd" || (e.key === "+" && e.location === 3)) { e.preventDefault(); sendCommand("speed", Math.min(10, speed + 1)); }
      if (e.code === "NumpadSubtract" || (e.key === "-" && e.location === 3)) { e.preventDefault(); sendCommand("speed", Math.max(0, speed - 1)); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showSetup, speed, onBack]);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (showSetup) return;
      e.preventDefault();
      sendCommand("scrollStep", e.deltaY > 0 ? -60 : 60);
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, [showSetup]);

  function handleLoadRoteiro() {
    const r = roteiros.find((x) => x.id === selectedRoteiroId);
    if (r) {
      const parsed = extractRoteiroHtml(r.conteudo_html);
      sendCommand("loadText", { text: parsed || "Roteiro sem conteúdo.", html: true });
      setShowSetup(false);
    }
  }

  function handleLoadManual() {
    if (inputText.trim()) {
      sendCommand("loadText", { text: inputText.trim(), html: false });
      setShowSetup(false);
      setInputText("");
    }
  }

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-tp font-sans p-5">
      {/* Header */}
      <div className="tp-ctrl-header flex items-center gap-3 mb-4 flex-wrap justify-center">
        <SlidersHorizontal size={20} className="text-tp-accent" />
        <span className="text-tp-foreground text-base font-bold">Controle Remoto do TP</span>
        <div className={`w-2.5 h-2.5 rounded-full ml-2 ${connected && tpState ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.5)]"}`} />
        <span className="text-tp-muted text-[11px]">
          {connected && tpState ? "TP Conectado" : "Aguardando TP..."}
        </span>
      </div>

      {/* TP Preview Mirror */}
      <div className="tp-ctrl-preview relative bg-tp-display rounded-xl overflow-hidden border border-tp-border shadow-[0_16px_48px_hsl(var(--tp-shadow))]" style={{ width: "min(900px, 90vw)", height: "min(500px, 55vh)" }}>
        <div className="absolute top-0 left-0 right-0 h-1/4 bg-gradient-to-b from-tp-display via-tp-display/85 to-transparent pointer-events-none z-[8]" />
        <div className="absolute bottom-0 left-0 right-0 h-[15%] bg-gradient-to-t from-tp-display to-transparent pointer-events-none z-[8]" />
        <div className="absolute left-0 top-1/2 -translate-y-1/2 z-10">
          <div className="w-0 h-0 border-t-[12px] border-t-transparent border-b-[12px] border-b-transparent border-l-[20px] border-l-tp-accent drop-shadow-[0_0_6px_hsl(var(--tp-accent)/0.5)]" />
        </div>
        <div className="absolute left-6 right-6 top-1/2 h-px bg-tp-accent/30 z-[6]" />

        <div ref={previewTextRef} className="absolute text-tp-foreground font-normal" style={{
          width: "75%", fontSize: `${Math.max(14, fontSize * 0.3)}px`, lineHeight: 1.5,
          textAlign: "center", whiteSpace: "pre-wrap",
          top: `${serverScrollPos}%`, left: "12.5%",
          textShadow: "0 1px 8px rgba(0,0,0,0.5)",
          transform: `${flipH ? "scaleX(-1)" : ""} ${flipV ? "scaleY(-1)" : ""}`.trim() || "none",
        }}>
          {isHtmlContent ? <span dangerouslySetInnerHTML={{ __html: displayText }} /> : displayText}
        </div>

        <div className="absolute top-3 right-4 z-20 flex items-center gap-3">
          <span className="text-tp-muted text-[10px] font-semibold">{clock}</span>
          <span className={`text-[10px] font-bold transition-colors ${scrolling ? "text-tp-accent" : "text-tp-muted-strong"}`}>
            {scrolling ? "▶ RODANDO" : "⏸ PAUSADO"}
          </span>
          <span className="text-tp-foreground/30 text-[10px]">⏱ {timerDisplay}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="tp-ctrl-bar mt-5 flex items-center gap-3 bg-tp-control backdrop-blur-[20px] px-7 py-3 rounded-[20px] border border-tp-accent/20 shadow-[0_8px_32px_hsl(var(--tp-shadow))]">
        <div className="flex items-center gap-1">
          <button onClick={() => sendCommand("fontSize", Math.max(20, fontSize - 5))} className={`${tpControlBtnClasses} px-2.5 py-1.5 text-[11px] font-bold gap-0.5`}>
            <Minus size={10} /> A
          </button>
          <span className="text-[10px] text-tp-foreground/30 min-w-[30px] text-center">{fontSize}px</span>
          <button onClick={() => sendCommand("fontSize", Math.min(120, fontSize + 5))} className={`${tpControlBtnClasses} px-2.5 py-1.5 text-[11px] font-bold gap-0.5`}>
            <Plus size={10} /> A
          </button>
        </div>
        <div className="tp-divider w-px h-6 bg-tp-border-subtle" />
        <div className="flex items-center gap-2">
          <Type size={12} className="text-tp-foreground/30" />
          <input type="range" min={0} max={10} value={speed}
            onChange={(e) => sendCommand("speed", Number(e.target.value))}
            className="tp-speed-slider w-[120px] h-1 accent-tp-accent" />
          <span className="text-[10px] text-tp-muted min-w-[14px]">{speed}</span>
        </div>
        <div className="tp-divider w-px h-6 bg-tp-border-subtle" />
        <button onClick={() => sendCommand("toggle")} className={`border-none rounded-full w-12 h-12 cursor-pointer flex items-center justify-center transition-all ${
          scrolling
            ? "bg-gradient-to-br from-red-500 to-red-700 shadow-[0_4px_16px_rgba(226,74,74,0.4)]"
            : "bg-gradient-to-br from-tp-accent to-tp-accent-hover shadow-[0_4px_16px_hsl(var(--tp-accent)/0.4)]"
        }`}>
          {scrolling ? <Pause size={20} className="text-white" /> : <Play size={20} className="text-white ml-0.5" />}
        </button>
        <div className="tp-divider w-px h-6 bg-tp-border-subtle" />
        <div className="flex flex-col gap-1">
          <button onClick={() => sendCommand("scrollStep", 80)} title="Scroll para cima" className={`${tpControlBtnClasses} py-1 px-2.5`}>▲</button>
          <button onClick={() => sendCommand("scrollStep", -80)} title="Scroll para baixo" className={`${tpControlBtnClasses} py-1 px-2.5`}>▼</button>
        </div>
        <div className="tp-divider w-px h-6 bg-tp-border-subtle" />
        <button onClick={() => sendCommand("flipH")} title="Inverter H"
          className={`${tpControlBtnClasses} ${flipH ? tpControlBtnActiveClasses : ""}`}>
          <FlipHorizontal2 size={14} className={flipH ? "text-tp-accent" : "text-tp-muted-strong"} />
        </button>
        <button onClick={() => sendCommand("flipV")} title="Inverter V"
          className={`${tpControlBtnClasses} ${flipV ? tpControlBtnActiveClasses : ""}`}>
          <FlipVertical2 size={14} className={flipV ? "text-tp-accent" : "text-tp-muted-strong"} />
        </button>
        <div className="tp-divider w-px h-6 bg-tp-border-subtle" />
        <button onClick={() => sendCommand("reset")} title="Reiniciar" className={tpControlBtnClasses}>
          <RotateCcw size={14} className="text-tp-muted-strong" />
        </button>
        <div className="tp-divider w-px h-6 bg-tp-border-subtle" />
        <button onClick={() => setShowSetup(true)} title="Carregar texto"
          className={`${tpControlBtnClasses} ${showSetup ? tpControlBtnActiveClasses : ""}`}>
          <Settings size={14} className="text-tp-accent" />
        </button>
      </div>

      {/* Back button */}
      <button onClick={onBack} className="mt-4 bg-transparent border border-tp-border-subtle rounded-[10px] px-5 py-2 cursor-pointer text-tp-muted text-[11px] flex items-center gap-1.5">
        <LogOut size={12} /> Voltar
      </button>

      {/* Setup Modal */}
      {showSetup && (
        <>
          <div onClick={() => setShowSetup(false)} className="fixed inset-0 bg-black/60 z-[90]" />
          <div className="tp-setup-modal fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 max-h-[75vh] bg-gradient-to-br from-tp-surface to-tp-surface-light border border-tp-border z-[100] p-7 rounded-2xl flex flex-col shadow-[0_24px_64px_hsl(var(--tp-shadow))] overflow-hidden" style={{ width: "min(650px, 85%)" }}>
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
                {roteiros.length === 0 ? (
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
                  onClick={handleLoadManual}
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
  );
}
