import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, Minus, Plus, Play, Pause, RotateCcw, Type, FileText, Maximize, FlipHorizontal2, FlipVertical2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface Roteiro {
  id: string;
  programa_nome: string;
  titulo: string;
  data_programa: string;
  horario: string;
  conteudo_html: string;
  numero_roteiro: number | null;
}

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

export default function TpExterno() {
  const { user } = useAuth();
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

  const scrollPosRef = useRef(50);
  const textRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>();
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Load roteiros
  useEffect(() => {
    if (!user) return;
    supabase
      .from("roteiros")
      .select("id, programa_nome, titulo, data_programa, horario, conteudo_html, numero_roteiro")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30)
      .then(({ data }) => {
        if (data) setRoteiros(data);
      });
  }, [user]);

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.getHours().toString().padStart(2, "0") + ":" +
        now.getMinutes().toString().padStart(2, "0")
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Program timer — starts with play, resets when text returns to top
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

  // Scroll animation — auto-reset timer when text scrolls past top
  const animate = useCallback(() => {
    if (scrolling && textRef.current) {
      scrollPosRef.current -= speed * 0.1;
      textRef.current.style.top = scrollPosRef.current + "%";

      // Check if text scrolled past the top — reset
      const textBottom = textRef.current.getBoundingClientRect().bottom;
      if (textBottom < 0) {
        scrollPosRef.current = 50;
        textRef.current.style.top = "50%";
        setTimerSeconds(0);
      }
    }
    animRef.current = requestAnimationFrame(animate);
  }, [scrolling, speed]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [animate]);

  // Spacebar toggle play/pause
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !showSetup) {
        e.preventDefault();
        setScrolling((s) => !s);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showSetup]);

  function applyText(text: string) {
    setDisplayText(text);
    scrollPosRef.current = 50;
    if (textRef.current) textRef.current.style.top = "50%";
    setTimerSeconds(0);
    setShowSetup(false);
  }

  function handleSaveManual() {
    if (inputText.trim()) applyText(inputText);
  }

  function handleLoadRoteiro() {
    const r = roteiros.find((x) => x.id === selectedRoteiroId);
    if (r) {
      const plainText = stripHtml(r.conteudo_html);
      applyText(plainText || "Roteiro sem conteúdo de texto.");
    }
  }

  function handleReset() {
    setScrolling(false);
    scrollPosRef.current = 50;
    if (textRef.current) textRef.current.style.top = "50%";
    setTimerSeconds(0);
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "rgba(74,144,226,0.2)" : "transparent",
    border: active ? "1px solid rgba(74,144,226,0.4)" : "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px", padding: "8px 16px", cursor: "pointer",
    color: active ? "#4a90e2" : "rgba(255,255,255,0.5)",
    fontSize: "12px", fontWeight: 600, transition: "all 0.2s",
  });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", height: "100vh", overflow: "hidden", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* ─── Sidebar ─── */}
      <div style={{
        background: "linear-gradient(180deg, #080830 0%, #0d0446 100%)",
        display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center",
        padding: "24px 0", borderRight: "1px solid rgba(74,144,226,0.15)",
      }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "9px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "2px", color: "rgba(255,255,255,0.4)", lineHeight: 1.4 }}>
            TELE<br />PROMPTER
          </div>
          <div style={{ fontSize: "24px", fontWeight: 700, color: "#4a90e2", marginTop: "8px", fontVariantNumeric: "tabular-nums" }}>
            {clock}
          </div>
          <div style={{ width: "32px", height: "2px", background: "linear-gradient(90deg, transparent, #4a90e2, transparent)", margin: "12px auto" }} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
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
        </div>

        <div style={{ textAlign: "center" }}>
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

      {/* ─── Display Area ─── */}
      <div style={{ position: "relative", backgroundColor: "#020210", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)" }} />

        {/* Eyeline markers */}
        <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}>
          <div style={{ width: 0, height: 0, borderTop: "20px solid transparent", borderBottom: "20px solid transparent", borderLeft: "32px solid #4a90e2", filter: "drop-shadow(0 0 8px rgba(74,144,226,0.5))" }} />
        </div>
        <div style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%) rotate(180deg)", zIndex: 10 }}>
          <div style={{ width: 0, height: 0, borderTop: "20px solid transparent", borderBottom: "20px solid transparent", borderLeft: "32px solid #4a90e2", filter: "drop-shadow(0 0 8px rgba(74,144,226,0.5))", opacity: 0.4 }} />
        </div>
        <div style={{ position: "absolute", left: "40px", right: "40px", top: "50%", height: "1px", background: "rgba(74,144,226,0.08)", zIndex: 6 }} />

        {/* Text */}
        <div ref={textRef} style={{
          width: "75%", margin: "0 auto", fontSize: `${fontSize}px`, lineHeight: 1.5,
          textAlign: "center", whiteSpace: "pre-wrap", position: "absolute", top: "50%", left: "12.5%",
          transition: "font-size 0.2s", color: "#ffffff", textShadow: "0 2px 20px rgba(0,0,0,0.5)", fontWeight: 400,
        }}>
          {displayText}
        </div>

        {/* ─── Controls bar ─── */}
        <div style={{
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
          <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Type size={12} color="rgba(255,255,255,0.3)" />
            <input type="range" min={0} max={10} value={speed} onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ width: "120px", accentColor: "#4a90e2", height: "4px" }} />
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", minWidth: "14px" }}>{speed}</span>
          </div>
          <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
          <button onClick={() => setScrolling(!scrolling)} style={{
            background: scrolling ? "linear-gradient(135deg, #e24a4a, #c0392b)" : "linear-gradient(135deg, #4a90e2, #2d6dc0)",
            border: "none", borderRadius: "50%", width: "44px", height: "44px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            boxShadow: scrolling ? "0 4px 16px rgba(226,74,74,0.4)" : "0 4px 16px rgba(74,144,226,0.4)",
            transition: "all 0.3s",
          }}>
            {scrolling ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" style={{ marginLeft: "2px" }} />}
          </button>
        </div>

        {/* ─── Setup Modal ─── */}
        {showSetup && (
          <>
            <div onClick={() => setShowSetup(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 90 }} />
            <div style={{
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

              {/* Tabs */}
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
