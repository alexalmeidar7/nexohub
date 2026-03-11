import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, Minus, Plus, Play, Pause } from "lucide-react";

export default function TpExterno() {
  const [scrolling, setScrolling] = useState(false);
  const [fontSize, setFontSize] = useState(60);
  const [speed, setSpeed] = useState(2);
  const [showSetup, setShowSetup] = useState(false);
  const [inputText, setInputText] = useState("");
  const [displayText, setDisplayText] = useState(
    "Cole seu texto no botão de configuração (engrenagem) para começar a leitura..."
  );
  const [clock, setClock] = useState("00:00");
  const [timer, setTimer] = useState("00:00");
  const [timerSeconds, setTimerSeconds] = useState(0);

  const scrollPosRef = useRef(50);
  const textRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>();
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Clock
  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setClock(
        now.getHours().toString().padStart(2, "0") +
          ":" +
          now.getMinutes().toString().padStart(2, "0")
      );
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Program timer
  useEffect(() => {
    if (scrolling) {
      timerRef.current = setInterval(() => {
        setTimerSeconds((s) => s + 1);
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [scrolling]);

  useEffect(() => {
    const m = Math.floor(timerSeconds / 60)
      .toString()
      .padStart(2, "0");
    const s = (timerSeconds % 60).toString().padStart(2, "0");
    setTimer(`${m}:${s}`);
  }, [timerSeconds]);

  // Scroll animation
  const animate = useCallback(() => {
    if (scrolling && textRef.current) {
      scrollPosRef.current -= speed * 0.1;
      textRef.current.style.top = scrollPosRef.current + "%";
    }
    animRef.current = requestAnimationFrame(animate);
  }, [scrolling, speed]);

  useEffect(() => {
    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
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

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "80px 1fr",
        height: "100vh",
        margin: 0,
        padding: 0,
        backgroundColor: "#000",
        color: "#fff",
        fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <div
        style={{
          backgroundColor: "#0b0b30",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "20px 0",
          borderRight: "1px solid #1a1a4a",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              fontSize: "10px",
              textTransform: "uppercase",
              fontWeight: "bold",
            }}
          >
            NOME
            <br />
            DO TP
          </div>
          <div
            style={{
              fontSize: "20px",
              fontWeight: "bold",
              color: "#4a90e2",
              marginTop: "5px",
            }}
          >
            {clock}
          </div>
        </div>

        <button
          onClick={() => setShowSetup(!showSetup)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#4a90e2",
          }}
        >
          <Settings size={24} />
        </button>

        <div style={{ textAlign: "center", marginBottom: "20px" }}>
          <div style={{ fontSize: "8px", lineHeight: 1 }}>
            tempo de
            <br />
            programa
          </div>
          <div style={{ fontSize: "22px", fontWeight: "bold" }}>{timer}</div>
        </div>
      </div>

      {/* Display area */}
      <div
        style={{
          position: "relative",
          backgroundColor: "#000",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
        }}
      >
        {/* Eyeline marker */}
        <div
          style={{
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: 0,
            height: 0,
            borderTop: "25px solid transparent",
            borderBottom: "25px solid transparent",
            borderLeft: "40px solid #4a90e2",
            zIndex: 10,
          }}
        />

        {/* Text */}
        <div
          ref={textRef}
          style={{
            width: "80%",
            margin: "0 auto",
            fontSize: `${fontSize}px`,
            lineHeight: 1.5,
            textAlign: "center",
            whiteSpace: "pre-wrap",
            position: "absolute",
            top: "50%",
            left: "10%",
            transition: "font-size 0.2s",
          }}
        >
          {displayText}
        </div>

        {/* Controls bar */}
        <div
          style={{
            position: "absolute",
            bottom: "20px",
            left: "20px",
            background: "#0b0b30",
            padding: "10px 20px",
            borderRadius: "15px",
            display: "flex",
            alignItems: "center",
            gap: "15px",
            border: "1px solid #333",
            zIndex: 20,
          }}
        >
          <button
            onClick={() => setFontSize((s) => Math.max(20, s - 5))}
            style={{
              background: "#fff",
              border: "none",
              borderRadius: "5px",
              padding: "5px 12px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Minus size={12} /> A
          </button>
          <button
            onClick={() => setFontSize((s) => Math.min(120, s + 5))}
            style={{
              background: "#fff",
              border: "none",
              borderRadius: "5px",
              padding: "5px 12px",
              fontWeight: "bold",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Plus size={12} /> A
          </button>
          <span style={{ fontSize: "10px", color: "#fff" }}>velocidade</span>
          <input
            type="range"
            min={0}
            max={10}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value))}
            style={{ width: "150px", accentColor: "#4a90e2" }}
          />
          <button
            onClick={() => setScrolling(!scrolling)}
            style={{
              background: "#fff",
              border: "none",
              borderRadius: "50%",
              width: "40px",
              height: "40px",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {scrolling ? <Pause size={16} /> : <Play size={16} />}
          </button>
        </div>

        {/* Setup modal */}
        {showSetup && (
          <div
            style={{
              position: "absolute",
              top: "20%",
              left: "20%",
              width: "60%",
              height: "50%",
              background: "#111",
              border: "2px solid #4a90e2",
              zIndex: 100,
              padding: "20px",
              borderRadius: "10px",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <h3 style={{ margin: "0 0 10px", color: "#fff" }}>
              Configurações do Roteiro
            </h3>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Cole o texto aqui..."
              style={{
                flex: 1,
                background: "#222",
                color: "#fff",
                border: "none",
                padding: "10px",
                borderRadius: "5px",
                resize: "none",
                fontSize: "14px",
              }}
            />
            <button
              onClick={handleSave}
              style={{
                marginTop: "10px",
                background: "#4a90e2",
                color: "#fff",
                border: "none",
                borderRadius: "5px",
                padding: "10px 20px",
                fontWeight: "bold",
                cursor: "pointer",
                alignSelf: "flex-start",
              }}
            >
              SALVAR E FECHAR
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
