import { useState, useEffect, useRef } from "react";
import { Settings, Minus, Plus, Play, Pause, RotateCcw, Type, FileText, FlipHorizontal2, FlipVertical2, SlidersHorizontal, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { Roteiro, extractRoteiroHtml, controlBtnStyle, tabBtnStyle } from "./tp-utils";

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

  const lastStateAtRef = useRef(0);

  // Listen for TP state broadcasts
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`tp-state-${user.id}`)
      .on("broadcast", { event: "tp-state" }, (payload: any) => {
        setTpState(payload.payload);
        lastStateAtRef.current = Date.now();
        setConnected(true);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user]);

  // Mark disconnected when heartbeat is stale (keepalive is every 2s)
  useEffect(() => {
    const id = setInterval(() => {
      if (!lastStateAtRef.current) { setConnected(false); return; }
      setConnected(Date.now() - lastStateAtRef.current < 4000);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  // Persistent command channel
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

  const scrolling = tpState?.scrolling ?? false;
  const speed = tpState?.speed ?? 2;
  const fontSize = tpState?.fontSize ?? 60;
  const flipH = tpState?.flipH ?? false;
  const flipV = tpState?.flipV ?? false;
  const displayText = tpState?.displayText ?? "";
  const isHtmlContent = tpState?.isHtmlContent ?? false;
  const timerSeconds = tpState?.timerSeconds ?? 0;
  const serverScrollPos = tpState?.scrollPos ?? 50;

  // Local scroll animation mirror
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

  // Keyboard controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showSetup) { e.preventDefault(); setShowSetup(false); return; }
      if (showSetup) return;
      if (e.code === "Space") { e.preventDefault(); sendCommand("toggle"); }
      if (e.code === "NumpadAdd" || (e.key === "+" && e.location === 3)) { e.preventDefault(); sendCommand("speed", Math.min(10, speed + 1)); }
      if (e.code === "NumpadSubtract" || (e.key === "-" && e.location === 3)) { e.preventDefault(); sendCommand("speed", Math.max(0, speed - 1)); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showSetup, speed]);

  // Mouse wheel
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
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      backgroundColor: "#0f1058", fontFamily: "'Poppins', 'Inter', sans-serif", padding: "20px",
    }}>
      {/* Header */}
      <div className="tp-ctrl-header" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px", flexWrap: "wrap", justifyContent: "center" }}>
        <SlidersHorizontal size={20} color="#4a90e2" />
        <span style={{ color: "#fff", fontSize: "16px", fontWeight: 700 }}>Controle Remoto do TP</span>
        <div style={{
          width: "10px", height: "10px", borderRadius: "50%",
          backgroundColor: connected && tpState ? "#22c55e" : "#ef4444",
          boxShadow: connected && tpState ? "0 0 8px rgba(34,197,94,0.5)" : "0 0 8px rgba(239,68,68,0.5)",
          marginLeft: "8px",
        }} />
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px" }}>
          {connected && tpState ? "TP Conectado" : "Aguardando TP..."}
        </span>
      </div>

      {/* TP Preview Mirror */}
      <div className="tp-ctrl-preview" style={{
        width: "min(900px, 90vw)", height: "min(500px, 55vh)", position: "relative",
        backgroundColor: "#020210", borderRadius: "12px", overflow: "hidden",
        border: "1px solid rgba(74,144,226,0.3)", boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
      }}>
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
        <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}>
          <div style={{ width: 0, height: 0, borderTop: "12px solid transparent", borderBottom: "12px solid transparent", borderLeft: "20px solid #4a90e2", filter: "drop-shadow(0 0 6px rgba(74,144,226,0.5))" }} />
        </div>
        <div style={{ position: "absolute", left: "24px", right: "24px", top: "50%", height: "1px", background: "rgba(74,144,226,0.3)", zIndex: 6 }} />

        <div ref={previewTextRef} style={{
          width: "75%", margin: "0 auto", fontSize: `${Math.max(14, fontSize * 0.3)}px`, lineHeight: 1.5,
          textAlign: "center", whiteSpace: "pre-wrap", position: "absolute",
          top: `${serverScrollPos}%`, left: "12.5%",
          color: "#ffffff", textShadow: "0 1px 8px rgba(0,0,0,0.5)", fontWeight: 400,
          transform: `${flipH ? "scaleX(-1)" : ""} ${flipV ? "scaleY(-1)" : ""}`.trim() || "none",
        }}>
          {isHtmlContent ? <span dangerouslySetInnerHTML={{ __html: displayText }} /> : displayText}
        </div>

        <div style={{
          position: "absolute", top: "12px", right: "16px", zIndex: 20,
          display: "flex", alignItems: "center", gap: "12px",
        }}>
          <span style={{ color: "rgba(255,255,255,0.4)", fontSize: "10px", fontWeight: 600 }}>{clock}</span>
          <span style={{
            color: scrolling ? "#4a90e2" : "rgba(255,255,255,0.5)",
            fontSize: "10px", fontWeight: 700, transition: "color 0.3s",
          }}>
            {scrolling ? "▶ RODANDO" : "⏸ PAUSADO"}
          </span>
          <span style={{ color: "rgba(255,255,255,0.3)", fontSize: "10px" }}>⏱ {timerDisplay}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="tp-ctrl-bar" style={{
        marginTop: "20px", display: "flex", alignItems: "center", gap: "12px",
        background: "rgba(11,11,48,0.9)", backdropFilter: "blur(20px)",
        padding: "12px 28px", borderRadius: "20px",
        border: "1px solid rgba(74,144,226,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button onClick={() => sendCommand("fontSize", Math.max(20, fontSize - 5))} style={{ ...controlBtnStyle, padding: "6px 10px", fontSize: "11px", fontWeight: 700 }}>
            <Minus size={10} /> A
          </button>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", minWidth: "30px", textAlign: "center" }}>{fontSize}px</span>
          <button onClick={() => sendCommand("fontSize", Math.min(120, fontSize + 5))} style={{ ...controlBtnStyle, padding: "6px 10px", fontSize: "11px", fontWeight: 700 }}>
            <Plus size={10} /> A
          </button>
        </div>
        <div className="tp-divider" style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Type size={12} color="rgba(255,255,255,0.3)" />
          <input type="range" min={0} max={10} value={speed}
            onChange={(e) => sendCommand("speed", Number(e.target.value))}
            className="tp-speed-slider" style={{ width: "120px", accentColor: "#4a90e2", height: "4px" }} />
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", minWidth: "14px" }}>{speed}</span>
        </div>
        <div className="tp-divider" style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
        <button onClick={() => sendCommand("toggle")} style={{
          background: scrolling ? "linear-gradient(135deg, #e24a4a, #c0392b)" : "linear-gradient(135deg, #4a90e2, #2d6dc0)",
          border: "none", borderRadius: "50%", width: "48px", height: "48px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: scrolling ? "0 4px 16px rgba(226,74,74,0.4)" : "0 4px 16px rgba(74,144,226,0.4)",
          transition: "all 0.3s",
        }}>
          {scrolling ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" style={{ marginLeft: "2px" }} />}
        </button>
        <div className="tp-divider" style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <button onClick={() => sendCommand("scrollStep", 80)} title="Scroll para cima" style={{ ...controlBtnStyle, padding: "4px 10px" }}>▲</button>
          <button onClick={() => sendCommand("scrollStep", -80)} title="Scroll para baixo" style={{ ...controlBtnStyle, padding: "4px 10px" }}>▼</button>
        </div>
        <div className="tp-divider" style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
        <button onClick={() => sendCommand("flipH")} title="Inverter H"
          style={{ ...controlBtnStyle, background: flipH ? "rgba(74,144,226,0.2)" : controlBtnStyle.background }}>
          <FlipHorizontal2 size={14} color={flipH ? "#4a90e2" : "rgba(255,255,255,0.5)"} />
        </button>
        <button onClick={() => sendCommand("flipV")} title="Inverter V"
          style={{ ...controlBtnStyle, background: flipV ? "rgba(74,144,226,0.2)" : controlBtnStyle.background }}>
          <FlipVertical2 size={14} color={flipV ? "#4a90e2" : "rgba(255,255,255,0.5)"} />
        </button>
        <div className="tp-divider" style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
        <button onClick={() => sendCommand("reset")} title="Reiniciar" style={controlBtnStyle}>
          <RotateCcw size={14} color="rgba(255,255,255,0.5)" />
        </button>
        <div className="tp-divider" style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
        <button onClick={() => setShowSetup(true)} title="Carregar texto" style={{
          ...controlBtnStyle, background: showSetup ? "rgba(74,144,226,0.2)" : controlBtnStyle.background,
        }}>
          <Settings size={14} color="#4a90e2" />
        </button>
      </div>

      {/* Back button */}
      <button onClick={onBack} style={{
        marginTop: "16px", background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "10px",
        padding: "8px 20px", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: "11px",
        display: "flex", alignItems: "center", gap: "6px",
      }}>
        <LogOut size={12} /> Voltar
      </button>

      {/* Setup Modal */}
      {showSetup && (
        <>
          <div onClick={() => setShowSetup(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 90 }} />
          <div className="tp-setup-modal" style={{
            position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
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
                {roteiros.length === 0 ? (
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
                  onClick={handleLoadManual}
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
  );
}
