import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, Minus, Plus, Play, Pause, RotateCcw, Type, FileText, Maximize, FlipHorizontal2, FlipVertical2, Loader2, MessageSquare, Monitor, ArrowRight, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import logoNexo from "@/assets/logo-nexo.png";

interface Roteiro {
  id: string;
  programa_nome: string;
  titulo: string;
  data_programa: string;
  horario: string;
  conteudo_html: string;
  numero_roteiro: number | null;
}

function sanitizeInlineHtml(el: Element): string {
  let result = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent || "";
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase();
      const inner = sanitizeInlineHtml(node as Element);
      if (tag === "b" || tag === "strong") {
        result += `<b>${inner}</b>`;
      } else if (tag === "i" || tag === "em") {
        result += `<i>${inner}</i>`;
      } else if (tag === "u") {
        result += `<u>${inner}</u>`;
      } else if (tag === "mark") {
        result += `<mark style="background:#b4ff20;color:#000;text-shadow:none;border-radius:3px;padding:0 2px">${inner}</mark>`;
      } else if (tag === "span") {
        const style = (node as HTMLElement).getAttribute("style") || "";
        if (style.includes("background")) {
          result += `<mark style="background:#b4ff20;color:#000;text-shadow:none;border-radius:3px;padding:0 2px">${inner}</mark>`;
        } else if (style.includes("font-weight")) {
          result += `<b>${inner}</b>`;
        } else if (style.includes("font-style")) {
          result += `<i>${inner}</i>`;
        } else {
          result += inner;
        }
      } else {
        result += inner;
      }
    }
  });
  return result;
}

function extractRoteiroHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;

  const rows = div.querySelectorAll("tr[data-pergunta], table tr");
  const lines: string[] = [];

  if (rows.length > 0) {
    rows.forEach((row) => {
      if (row.querySelector("th")) return;
      if (row.getAttribute("data-action-row") === "true") return;
      if (row.querySelector("[contenteditable='false']") && !row.getAttribute("data-pergunta")) return;

      const cells = row.querySelectorAll("td");
      if (cells.length < 3) return;

      const elemento = (cells[1]?.textContent || "").trim();
      const descricaoHtml = sanitizeInlineHtml(cells[2]).trim();
      const descricaoText = (cells[2]?.textContent || "").trim();

      if (!elemento && !descricaoText) return;
      if (descricaoText === "[Insira a pergunta aqui]" || descricaoText === "[Insira o texto aqui]") return;

      if (elemento) lines.push(`<span style="font-size:0.6em;opacity:0.55;letter-spacing:2px">${elemento.toUpperCase()}</span>`);
      if (descricaoHtml) lines.push(descricaoHtml);
      lines.push("");
    });
  }

  if (lines.filter((l) => l.trim()).length > 0) {
    lines.push('<br/><br/><span style="opacity:0.4;font-size:0.5em;letter-spacing:3px">*** FIM DO TEXTO ***</span>');
    return lines.join("<br/>").trim();
  }

  // Fallback: preserve inline formatting from raw html
  return sanitizeInlineHtml(div) || div.textContent || "";
}

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

export default function TpExterno() {
  const { user, loading: authLoading, signOut } = useAuth();
  usePageTitle("Tele Prompter");

  // Flow: "login" → "menu" → "tp" | "mensagem"
  const [step, setStep] = useState<"login" | "menu" | "tp" | "mensagem">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgSent, setMsgSent] = useState(false);

  // Redirect to menu if already logged in
  useEffect(() => {
    if (!authLoading && user && step === "login") setStep("menu");
  }, [authLoading, user, step]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError("");
    if (!loginEmail.trim() || !loginPassword.trim()) {
      setLoginError("Preencha todos os campos");
      return;
    }
    setLoginLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail.trim(), password: loginPassword });
    setLoginLoading(false);
    if (error) {
      setLoginError("E-mail ou senha inválidos");
    } else {
      setStep("menu");
    }
  }

  async function handleSendMessage() {
    if (!msgText.trim() || !user) return;
    setMsgSending(true);
    // Send as admin_messages (broadcast from this user)
    await supabase.from("admin_messages").insert({
      sender_id: user.id,
      message: msgText.trim(),
      subject: "Mensagem do TP",
      is_broadcast: false,
      recipient_id: null,
    });
    setMsgSending(false);
    setMsgSent(true);
    setMsgText("");
    setTimeout(() => setMsgSent(false), 3000);
  }

  async function handleLogout() {
    await signOut();
    setStep("login");
  }

  // ─── Login Screen ───
  if (step === "login") {
    if (authLoading) {
      return (
        <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#0f1058" }}>
          <Loader2 size={32} color="#268ffa" className="animate-spin" />
        </div>
      );
    }
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "#0f1058", fontFamily: "'Poppins', 'Inter', sans-serif",
      }}>
        <form onSubmit={handleLogin} style={{
          background: "#fff", borderRadius: "2rem", padding: "40px 36px", width: "min(400px, 90%)",
          display: "flex", flexDirection: "column", alignItems: "center", gap: "16px",
        }}>
          <img src={logoNexo} alt="Nexo" style={{ height: "40px", marginBottom: "8px" }} />
          <h2 style={{ fontSize: "14px", fontWeight: 700, color: "#0d0446", margin: 0 }}>Acesso ao Teleprompter</h2>
          <input
            type="email" placeholder="E-mail" value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #c7d2e0",
              fontSize: "12px", outline: "none", color: "#0d0446",
            }}
          />
          <input
            type="password" placeholder="Senha" value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            style={{
              width: "100%", padding: "10px 14px", borderRadius: "10px", border: "1px solid #c7d2e0",
              fontSize: "12px", outline: "none", color: "#0d0446",
            }}
          />
          {loginError && <span style={{ fontSize: "11px", color: "#ef4444" }}>{loginError}</span>}
          <button type="submit" disabled={loginLoading} style={{
            width: "100%", padding: "10px", borderRadius: "10px", border: "none",
            backgroundColor: "#268ffa", color: "#fff", fontSize: "12px", fontWeight: 700,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
          }}>
            {loginLoading ? <Loader2 size={16} className="animate-spin" /> : <>Entrar <ArrowRight size={14} /></>}
          </button>
          <span style={{ fontSize: "10px", color: "rgba(13,4,70,0.4)", marginTop: "8px" }}>© Nexo Soluções Visuais</span>
        </form>
      </div>
    );
  }

  // ─── Menu Screen ───
  if (step === "menu") {
    return (
      <div style={{
        height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        backgroundColor: "#0f1058", fontFamily: "'Poppins', 'Inter', sans-serif", gap: "32px",
      }}>
        <img src={logoNexo} alt="Nexo" style={{ height: "36px", opacity: 0.9 }} />
        <div style={{ display: "flex", gap: "24px" }}>
          <button
            onClick={() => setStep("mensagem")}
            style={{
              width: "180px", height: "180px", borderRadius: "20px", border: "1px solid rgba(74,144,226,0.3)",
              background: "linear-gradient(135deg, rgba(13,4,70,0.9), rgba(26,10,110,0.9))",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px",
              transition: "all 0.2s", boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4a90e2"; e.currentTarget.style.transform = "scale(1.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(74,144,226,0.3)"; e.currentTarget.style.transform = "scale(1)"; }}
          >
            <MessageSquare size={40} color="#4a90e2" />
            <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>Mandar Mensagem</span>
          </button>
          <button
            onClick={() => setStep("tp")}
            style={{
              width: "180px", height: "180px", borderRadius: "20px", border: "1px solid rgba(74,144,226,0.3)",
              background: "linear-gradient(135deg, rgba(13,4,70,0.9), rgba(26,10,110,0.9))",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px",
              transition: "all 0.2s", boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4a90e2"; e.currentTarget.style.transform = "scale(1.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(74,144,226,0.3)"; e.currentTarget.style.transform = "scale(1)"; }}
          >
            <Monitor size={40} color="#4a90e2" />
            <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>Abrir TP</span>
          </button>
        </div>
        <button onClick={handleLogout} style={{
          background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "10px",
          padding: "8px 20px", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: "11px",
          display: "flex", alignItems: "center", gap: "6px", marginTop: "8px",
        }}>
          <LogOut size={12} /> Sair
        </button>
      </div>
    );
  }

  // ─── Mensagem Screen ───
  if (step === "mensagem") {
    return (
      <div style={{
        height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        backgroundColor: "#0f1058", fontFamily: "'Poppins', 'Inter', sans-serif", gap: "20px",
      }}>
        <div style={{
          background: "linear-gradient(135deg, #0d0446, #1a0a6e)", borderRadius: "20px",
          padding: "32px", width: "min(450px, 90%)", border: "1px solid rgba(74,144,226,0.3)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.4)",
        }}>
          <h3 style={{ color: "#fff", fontSize: "16px", fontWeight: 700, margin: "0 0 4px" }}>
            <MessageSquare size={16} style={{ display: "inline", verticalAlign: "-2px", marginRight: "8px" }} />
            Enviar Mensagem
          </h3>
          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: "11px", margin: "0 0 16px" }}>
            Envie uma mensagem para a produção
          </p>
          <textarea
            value={msgText}
            onChange={(e) => setMsgText(e.target.value)}
            placeholder="Digite sua mensagem..."
            rows={5}
            style={{
              width: "100%", background: "rgba(0,0,0,0.3)", color: "#fff", border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "10px", padding: "12px", fontSize: "13px", resize: "none", outline: "none",
            }}
          />
          {msgSent && <p style={{ color: "#22c55e", fontSize: "12px", marginTop: "8px" }}>✓ Mensagem enviada!</p>}
          <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
            <button
              onClick={handleSendMessage}
              disabled={!msgText.trim() || msgSending}
              style={{
                background: msgText.trim() ? "linear-gradient(135deg, #4a90e2, #2d6dc0)" : "rgba(255,255,255,0.05)",
                color: msgText.trim() ? "#fff" : "rgba(255,255,255,0.3)",
                border: "none", borderRadius: "10px", padding: "10px 24px",
                fontWeight: 700, cursor: msgText.trim() ? "pointer" : "not-allowed", fontSize: "12px",
              }}
            >
              {msgSending ? <Loader2 size={14} className="animate-spin" /> : "Enviar"}
            </button>
            <button onClick={() => setStep("menu")} style={{
              background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "10px",
              padding: "10px 20px", cursor: "pointer", color: "rgba(255,255,255,0.5)", fontSize: "12px",
            }}>
              Voltar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── TP Screen (step === "tp") ───
  return <TpScreen user={user} onBack={() => setStep("menu")} />;
}

/* ═══════════════════════════════════════════════════════════════
   TP Screen — extracted to its own component to keep state isolated
   ═══════════════════════════════════════════════════════════════ */
function TpScreen({ user, onBack }: { user: any; onBack: () => void }) {
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

  // Message notification state
  const [incomingMsg, setIncomingMsg] = useState<{ text: string; subject: string } | null>(null);
  const [msgVisible, setMsgVisible] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const msgTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const scrollPosRef = useRef(50);
  const textRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>();
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  // Subscribe to realtime messages for this user
  useEffect(() => {
    if (!user) return;

    // Load latest unread on mount
    supabase
      .from("admin_messages")
      .select("message, subject")
      .or(`recipient_id.eq.${user.id},is_broadcast.eq.true`)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          setHasUnread(true);
        }
      });

    const channel = supabase
      .channel("tp-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_messages",
        },
        (payload: any) => {
          const msg = payload.new;
          if (msg.recipient_id === user.id || msg.is_broadcast) {
            showMessage({ text: msg.message, subject: msg.subject });
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  function showMessage(msg: { text: string; subject: string }) {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    setIncomingMsg(msg);
    setMsgVisible(true);
    setHasUnread(false);
    msgTimerRef.current = setTimeout(() => {
      setMsgVisible(false);
      setTimeout(() => setIncomingMsg(null), 300);
    }, 5000);
  }

  function handleMsgIconClick() {
    if (incomingMsg && msgVisible) {
      // Close current message
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      setMsgVisible(false);
      setTimeout(() => setIncomingMsg(null), 300);
      return;
    }
    // Load latest unread
    if (!user) return;
    supabase
      .from("admin_messages")
      .select("message, subject")
      .or(`recipient_id.eq.${user.id},is_broadcast.eq.true`)
      .eq("is_read", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) {
          showMessage({ text: data[0].message, subject: data[0].subject });
        }
      });
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

  // Scroll animation — decelerate near end of text
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

  // Keyboard: Spacebar toggle, PageUp/PageDown scroll
  useEffect(() => {
    const STEP = 80; // pixels per key press
    const handleKey = (e: KeyboardEvent) => {
      if (showSetup) return;
      if (e.code === "Space") {
        e.preventDefault();
        setScrolling((s) => !s);
      }
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
      if (e.code === "NumpadAdd" || (e.key === "+" && e.location === 3)) {
        e.preventDefault();
        setSpeed((s) => Math.min(10, s + 1));
      }
      if (e.code === "NumpadSubtract" || (e.key === "-" && e.location === 3)) {
        e.preventDefault();
        setSpeed((s) => Math.max(0, s - 1));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [showSetup]);

  // Mouse wheel — adjust speed
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

  function applyText(text: string, html = false) {
    setDisplayText(text);
    setIsHtmlContent(html);
    scrollPosRef.current = 50;
    if (textRef.current) textRef.current.style.top = "50%";
    setTimerSeconds(0);
    setShowSetup(false);
  }

  function handleSaveManual() {
    if (inputText.trim()) applyText(inputText, false);
  }

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

  const controlBtnStyle: React.CSSProperties = {
    background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: "8px", padding: "6px 8px", cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff",
    transition: "all 0.2s",
  };

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? "rgba(74,144,226,0.2)" : "transparent",
    border: active ? "1px solid rgba(74,144,226,0.4)" : "1px solid rgba(255,255,255,0.1)",
    borderRadius: "8px", padding: "8px 16px", cursor: "pointer",
    color: active ? "#4a90e2" : "rgba(255,255,255,0.5)",
    fontSize: "12px", fontWeight: 600, transition: "all 0.2s",
  });

  return (
    <div ref={containerRef} style={{ display: "grid", gridTemplateColumns: "90px 1fr", height: "100vh", overflow: "hidden", fontFamily: "'Inter', 'Segoe UI', sans-serif", backgroundColor: "#000" }}>

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
          <button onClick={onBack} title="Voltar ao menu" style={{
            background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: "12px", width: "44px", height: "44px", cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s",
          }}>
            <LogOut size={16} color="rgba(255,255,255,0.5)" />
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
      <div data-tp-display style={{ position: "relative", backgroundColor: "#020210", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, background: "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.6) 100%)" }} />

        {/* ─── Message Balloon ─── */}
        {incomingMsg && (
          <div style={{
            position: "absolute", top: "24px", left: "50%", transform: "translateX(-50%)",
            zIndex: 50, transition: "opacity 0.3s, transform 0.3s",
            opacity: msgVisible ? 1 : 0,
            pointerEvents: msgVisible ? "auto" : "none",
          }}>
            <div style={{
              background: "rgba(13,4,70,0.92)", backdropFilter: "blur(20px)",
              borderRadius: "14px", padding: "16px 24px 10px", minWidth: "300px", maxWidth: "500px",
              border: "1px solid rgba(74,144,226,0.3)", boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              overflow: "hidden", position: "relative",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                <MessageSquare size={14} color="#4a90e2" />
                <span style={{ color: "#4a90e2", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1px" }}>
                  {incomingMsg.subject || "Mensagem"}
                </span>
              </div>
              <p style={{ color: "#fff", fontSize: "14px", margin: 0, lineHeight: 1.5 }}>
                {incomingMsg.text}
              </p>
              {/* Progress bar */}
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0, height: "3px",
                background: "rgba(255,255,255,0.1)",
              }}>
                <div style={{
                  height: "100%", background: "linear-gradient(90deg, #4a90e2, #2dbff4)",
                  borderRadius: "0 2px 2px 0",
                  animation: msgVisible ? "tp-msg-shrink 5s linear forwards" : "none",
                }} />
              </div>
            </div>
          </div>
        )}
        <style>{`@keyframes tp-msg-shrink { from { width: 100%; } to { width: 0%; } }`}</style>

        {/* Top fade-out overlay — text disappears smoothly */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: "25%",
          background: "linear-gradient(to bottom, #020210 0%, rgba(2,2,16,0.85) 40%, rgba(2,2,16,0) 100%)",
          pointerEvents: "none", zIndex: 8,
        }} />

        {/* Bottom fade overlay */}
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
          <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />
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
