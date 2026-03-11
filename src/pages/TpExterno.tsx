import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, Minus, Plus, Play, Pause, RotateCcw, Type } from "lucide-react";

export default function TpExterno() {
  const [scrolling, setScrolling] = useState(false);
  const [fontSize, setFontSize] = useState(60);
  const [speed, setSpeed] = useState(2);
  const [showSetup, setShowSetup] = useState(false);
  const [inputText, setInputText] = useState("");
  const [displayText, setDisplayText] = useState(
    "Cole seu texto no botão de configuração ⚙️ para começar a leitura..."
  );
  const [clock, setClock] = useState("00:00");
  const [timerSeconds, setTimerSeconds] = useState(0);

  const scrollPosRef = useRef(50);
  const textRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>();
  const timerRef = useRef<ReturnType<typeof setInterval>>();

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

  const animate = useCallback(() => {
    if (scrolling && textRef.current) {
      scrollPosRef.current -= speed * 0.1;
      textRef.current.style.top = scrollPosRef.current + "%";
    }
    animRef.current = requestAnimationFrame(animate);
  }, [scrolling, speed]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [animate]);

  function handleSave() {
    if (inputText.trim()) {
      setDisplayText(inputText);
      scrollPosRef.current = 50;
      if (textRef.current) textRef.current.style.top = "50%";
      setTimerSeconds(0);
    }
    setShowSetup(false);
  }

  function handleReset() {
    setScrolling(false);
    scrollPosRef.current = 50;
    if (textRef.current) textRef.current.style.top = "50%";
    setTimerSeconds(0);
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", height: "100vh", overflow: "hidden", fontFamily: "'Inter', 'Segoe UI', sans-serif" }}>

      {/* ─── Sidebar ─── */}
      <div style={{
        background: "linear-gradient(180deg, #080830 0%, #0d0446 100%)",
        display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center",
        padding: "24px 0", borderRight: "1px solid rgba(74,144,226,0.15)",
      }}>
        {/* Top */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "9px", textTransform: "uppercase", fontWeight: 700, letterSpacing: "2px",
            color: "rgba(255,255,255,0.4)", lineHeight: 1.4,
          }}>
            TELE
            <br />PROMPTER
          </div>
          <div style={{
            fontSize: "24px", fontWeight: 700, color: "#4a90e2", marginTop: "8px",
            fontVariantNumeric: "tabular-nums",
          }}>
            {clock}
          </div>
          <div style={{
            width: "32px", height: "2px", background: "linear-gradient(90deg, transparent, #4a90e2, transparent)",
            margin: "12px auto",
          }} />
        </div>

        {/* Middle icons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
          <button
            onClick={() => setShowSetup(!showSetup)}
            title="Configurações"
            style={{
              background: showSetup ? "rgba(74,144,226,0.2)" : "rgba(255,255,255,0.05)",
              border: "1px solid rgba(74,144,226,0.3)", borderRadius: "12px",
              width: "44px", height: "44px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(74,144,226,0.25)"; e.currentTarget.style.borderColor = "#4a90e2"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = showSetup ? "rgba(74,144,226,0.2)" : "rgba(255,255,255,0.05)"; e.currentTarget.style.borderColor = "rgba(74,144,226,0.3)"; }}
          >
            <Settings size={18} color="#4a90e2" />
          </button>
          <button
            onClick={handleReset}
            title="Reiniciar"
            style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "12px", width: "44px", height: "44px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
          >
            <RotateCcw size={16} color="rgba(255,255,255,0.5)" />
          </button>
        </div>

        {/* Bottom timer */}
        <div style={{ textAlign: "center" }}>
          <div style={{
            fontSize: "8px", textTransform: "uppercase", letterSpacing: "1.5px",
            color: "rgba(255,255,255,0.3)", lineHeight: 1.3, fontWeight: 600,
          }}>
            tempo de
            <br />programa
          </div>
          <div style={{
            fontSize: "22px", fontWeight: 700, color: scrolling ? "#4a90e2" : "rgba(255,255,255,0.7)",
            marginTop: "4px", fontVariantNumeric: "tabular-nums",
            transition: "color 0.3s",
          }}>
            {timerDisplay}
          </div>
        </div>
      </div>

      {/* ─── Display Area ─── */}
      <div style={{ position: "relative", backgroundColor: "#020210", overflow: "hidden" }}>

        {/* Subtle vignette */}
        <div style={{
          position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5,
          background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)",
        }} />

        {/* Eyeline marker */}
        <div style={{
          position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 10,
        }}>
          <div style={{
            width: 0, height: 0,
            borderTop: "20px solid transparent", borderBottom: "20px solid transparent",
            borderLeft: "32px solid #4a90e2",
            filter: "drop-shadow(0 0 8px rgba(74,144,226,0.5))",
          }} />
        </div>
        {/* Right marker */}
        <div style={{
          position: "absolute", right: 0, top: "50%", transform: "translateY(-50%) rotate(180deg)", zIndex: 10,
        }}>
          <div style={{
            width: 0, height: 0,
            borderTop: "20px solid transparent", borderBottom: "20px solid transparent",
            borderLeft: "32px solid #4a90e2",
            filter: "drop-shadow(0 0 8px rgba(74,144,226,0.5))",
            opacity: 0.4,
          }} />
        </div>

        {/* Center line guide */}
        <div style={{
          position: "absolute", left: "40px", right: "40px", top: "50%",
          height: "1px", background: "rgba(74,144,226,0.08)", zIndex: 6,
        }} />

        {/* Scrolling text */}
        <div
          ref={textRef}
          style={{
            width: "75%", margin: "0 auto",
            fontSize: `${fontSize}px`, lineHeight: 1.5,
            textAlign: "center", whiteSpace: "pre-wrap",
            position: "absolute", top: "50%", left: "12.5%",
            transition: "font-size 0.2s",
            color: "#ffffff", textShadow: "0 2px 20px rgba(0,0,0,0.5)",
            fontWeight: 400,
          }}
        >
          {displayText}
        </div>

        {/* ─── Controls bar ─── */}
        <div style={{
          position: "absolute", bottom: "24px", left: "50%", transform: "translateX(-50%)",
          background: "rgba(11,11,48,0.9)", backdropFilter: "blur(20px)",
          padding: "10px 24px", borderRadius: "20px",
          display: "flex", alignItems: "center", gap: "12px",
          border: "1px solid rgba(74,144,226,0.2)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          zIndex: 20,
        }}>
          {/* Font size */}
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              onClick={() => setFontSize((s) => Math.max(20, s - 5))}
              style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px", padding: "6px 10px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 3, color: "#fff", fontSize: "11px", fontWeight: 700,
              }}
            >
              <Minus size={10} /> A
            </button>
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", minWidth: "30px", textAlign: "center" }}>{fontSize}px</span>
            <button
              onClick={() => setFontSize((s) => Math.min(120, s + 5))}
              style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: "8px", padding: "6px 10px", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 3, color: "#fff", fontSize: "11px", fontWeight: 700,
              }}
            >
              <Plus size={10} /> A
            </button>
          </div>

          {/* Divider */}
          <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />

          {/* Speed */}
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Type size={12} color="rgba(255,255,255,0.3)" />
            <input
              type="range" min={0} max={10} value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
              style={{ width: "120px", accentColor: "#4a90e2", height: "4px" }}
            />
            <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", minWidth: "14px" }}>{speed}</span>
          </div>

          {/* Divider */}
          <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />

          {/* Play/Pause */}
          <button
            onClick={() => setScrolling(!scrolling)}
            style={{
              background: scrolling
                ? "linear-gradient(135deg, #e24a4a, #c0392b)"
                : "linear-gradient(135deg, #4a90e2, #2d6dc0)",
              border: "none", borderRadius: "50%",
              width: "44px", height: "44px", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: scrolling
                ? "0 4px 16px rgba(226,74,74,0.4)"
                : "0 4px 16px rgba(74,144,226,0.4)",
              transition: "all 0.3s",
            }}
          >
            {scrolling ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" style={{ marginLeft: "2px" }} />}
          </button>
        </div>

        {/* ─── Setup Modal ─── */}
        {showSetup && (
          <>
            <div
              onClick={() => setShowSetup(false)}
              style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 90 }}
            />
            <div style={{
              position: "absolute", top: "50%", left: "50%", transform: "translate(-50%, -50%)",
              width: "min(600px, 80%)", maxHeight: "70vh",
              background: "linear-gradient(135deg, #0d0446, #1a0a6e)",
              border: "1px solid rgba(74,144,226,0.3)",
              zIndex: 100, padding: "28px", borderRadius: "16px",
              display: "flex", flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
            }}>
              <h3 style={{ margin: "0 0 4px", color: "#fff", fontSize: "16px", fontWeight: 700 }}>
                Configurações do Roteiro
              </h3>
              <p style={{ margin: "0 0 16px", color: "rgba(255,255,255,0.4)", fontSize: "12px" }}>
                Cole o texto que será exibido no teleprompter
              </p>
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Cole o texto aqui..."
                style={{
                  flex: 1, minHeight: "200px",
                  background: "rgba(0,0,0,0.3)", color: "#fff",
                  border: "1px solid rgba(255,255,255,0.1)",
                  padding: "14px", borderRadius: "10px", resize: "none",
                  fontSize: "14px", lineHeight: 1.6, outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "rgba(74,144,226,0.5)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
              />
              <div style={{ display: "flex", gap: "10px", marginTop: "16px" }}>
                <button
                  onClick={handleSave}
                  style={{
                    background: "linear-gradient(135deg, #4a90e2, #2d6dc0)",
                    color: "#fff", border: "none", borderRadius: "10px",
                    padding: "10px 24px", fontWeight: 700, cursor: "pointer",
                    fontSize: "13px", transition: "all 0.2s",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
                >
                  SALVAR E FECHAR
                </button>
                <button
                  onClick={() => setShowSetup(false)}
                  style={{
                    background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)",
                    border: "1px solid rgba(255,255,255,0.1)", borderRadius: "10px",
                    padding: "10px 20px", cursor: "pointer", fontSize: "13px",
                  }}
                >
                  Cancelar
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
