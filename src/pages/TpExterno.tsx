import { useState, useEffect, useRef, useCallback } from "react";
import { Settings, Minus, Plus, Play, Pause, RotateCcw, Type, FileText, Maximize, FlipHorizontal2, FlipVertical2, Loader2, MessageSquare, Monitor, ArrowRight, LogOut, RotateCw, Trash2, SlidersHorizontal } from "lucide-react";
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

// Responsive styles injected once
const TP_RESPONSIVE_STYLES = `
  .tp-menu-buttons { display: flex; gap: 24px; flex-wrap: wrap; justify-content: center; }
  .tp-menu-btn { width: 180px; height: 180px; }
  .tp-screen-grid { display: grid; grid-template-columns: 90px 1fr; height: 100vh; }
  .tp-controls-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .tp-controls-bar .tp-divider { width: 1px; height: 24px; background: rgba(255,255,255,0.1); }
  .tp-speed-slider { width: 120px; }
  .tp-ctrl-preview { width: min(900px, 90vw); height: min(500px, 55vh); }
  .tp-ctrl-bar { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; }
  .tp-ctrl-bar .tp-divider { width: 1px; height: 24px; background: rgba(255,255,255,0.1); }
  .tp-msg-screen { width: min(500px, 90%); }

  @media (max-width: 768px) {
    .tp-menu-btn { width: 140px !important; height: 140px !important; }
    .tp-menu-buttons { gap: 12px !important; }
    .tp-screen-grid { grid-template-columns: 1fr !important; grid-template-rows: auto 1fr !important; }
    .tp-sidebar { flex-direction: row !important; padding: 8px 12px !important; border-right: none !important; border-bottom: 1px solid rgba(74,144,226,0.15) !important; justify-content: space-between !important; overflow-x: auto; }
    .tp-sidebar-top { flex-direction: row !important; gap: 12px !important; align-items: center !important; }
    .tp-sidebar-mid { flex-direction: row !important; gap: 8px !important; }
    .tp-sidebar-mid button { width: 36px !important; height: 36px !important; }
    .tp-sidebar-bottom { flex-direction: row !important; gap: 8px !important; align-items: center !important; }
    .tp-sidebar-bottom > div:first-child { display: none; }
    .tp-controls-bar { gap: 8px !important; padding: 8px 12px !important; border-radius: 14px !important; bottom: 8px !important; }
    .tp-controls-bar .tp-divider { display: none; }
    .tp-speed-slider { width: 80px !important; }
    .tp-ctrl-preview { width: 95vw !important; height: 35vh !important; }
    .tp-ctrl-bar { gap: 8px !important; padding: 8px 14px !important; }
    .tp-ctrl-bar .tp-divider { display: none; }
    .tp-setup-modal { width: 95% !important; padding: 16px !important; }
  }

  @media (max-width: 480px) {
    .tp-menu-btn { width: 110px !important; height: 110px !important; }
    .tp-menu-btn svg { width: 28px !important; height: 28px !important; }
    .tp-menu-btn span { font-size: 11px !important; }
    .tp-controls-bar { gap: 6px !important; padding: 6px 8px !important; }
    .tp-play-btn { width: 38px !important; height: 38px !important; }
    .tp-ctrl-preview { height: 30vh !important; }
  }
`;

export default function TpExterno() {
  const { user, loading: authLoading, signOut } = useAuth();
  usePageTitle("NexoHub - Tele Prompter");

  // Inject responsive styles once
  useEffect(() => {
    const id = "tp-responsive-styles";
    if (!document.getElementById(id)) {
      const style = document.createElement("style");
      style.id = id;
      style.textContent = TP_RESPONSIVE_STYLES;
      document.head.appendChild(style);
    }
    return () => { document.getElementById(id)?.remove(); };
  }, []);

  // Flow: "login" → "menu" → "tp" | "mensagem" | "controlar"
  const [step, setStep] = useState<"login" | "menu" | "tp" | "mensagem" | "controlar">("login");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [msgSent, setMsgSent] = useState(false);
  const [msgHistory, setMsgHistory] = useState<{ text: string; ts: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem("tp-msg-history") || "[]"); } catch { return []; }
  });

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

  async function sendMsg(text: string) {
    if (!text.trim() || !user) return;
    setMsgSending(true);
    const msg = { text: text.trim(), subject: "Mensagem", ts: Date.now() };
    // Save to localStorage queue for TP
    const queue = JSON.parse(localStorage.getItem("tp-msg-queue") || "[]");
    queue.push(msg);
    localStorage.setItem("tp-msg-queue", JSON.stringify(queue));
    // Save to history
    const newHistory = [{ text: text.trim(), ts: Date.now() }, ...msgHistory].slice(0, 50);
    setMsgHistory(newHistory);
    localStorage.setItem("tp-msg-history", JSON.stringify(newHistory));
    // Broadcast
    try {
      const channel = supabase.channel(`tp-msg-${user.id}`);
      await channel.subscribe();
      await channel.send({ type: "broadcast", event: "tp-message", payload: msg });
      supabase.removeChannel(channel);
    } catch (_) {}
    setMsgSending(false);
    setMsgSent(true);
    setMsgText("");
    setTimeout(() => setMsgSent(false), 3000);
  }

  async function handleSendMessage() { await sendMsg(msgText); }

  async function handleResend(text: string) { await sendMsg(text); }

  function clearHistory() {
    setMsgHistory([]);
    localStorage.removeItem("tp-msg-history");
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
        <div className="tp-menu-buttons" style={{ display: "flex", gap: "24px" }}>
          <button
            className="tp-menu-btn"
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
            className="tp-menu-btn"
            onClick={() => setStep("controlar")}
            style={{
              width: "180px", height: "180px", borderRadius: "20px", border: "1px solid rgba(74,144,226,0.3)",
              background: "linear-gradient(135deg, rgba(13,4,70,0.9), rgba(26,10,110,0.9))",
              cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px",
              transition: "all 0.2s", boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#4a90e2"; e.currentTarget.style.transform = "scale(1.04)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "rgba(74,144,226,0.3)"; e.currentTarget.style.transform = "scale(1)"; }}
          >
            <SlidersHorizontal size={40} color="#4a90e2" />
            <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>Controlar TP</span>
          </button>
          <button
            className="tp-menu-btn"
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
            {msgHistory.length > 0 && (
              <button onClick={clearHistory} title="Apagar histórico" style={{
                background: "none", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px",
                padding: "10px 16px", cursor: "pointer", color: "rgba(239,68,68,0.7)", fontSize: "12px",
                display: "flex", alignItems: "center", gap: "6px",
              }}>
                <Trash2 size={12} /> Limpar
              </button>
            )}
          </div>

          {/* Histórico */}
          {msgHistory.length > 0 && (
            <div style={{ marginTop: "20px" }}>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px" }}>
                Histórico
              </div>
              <div style={{ maxHeight: "180px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px" }}>
                {msgHistory.map((h, i) => (
                  <div key={i} style={{
                    display: "flex", alignItems: "center", gap: "8px",
                    background: "rgba(0,0,0,0.2)", borderRadius: "8px", padding: "8px 12px",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}>
                    <span style={{ flex: 1, color: "rgba(255,255,255,0.7)", fontSize: "12px", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {h.text}
                    </span>
                    <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.25)", whiteSpace: "nowrap" }}>
                      {new Date(h.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <button
                      onClick={() => handleResend(h.text)}
                      disabled={msgSending}
                      title="Reenviar"
                      style={{
                        background: "rgba(74,144,226,0.15)", border: "1px solid rgba(74,144,226,0.3)",
                        borderRadius: "6px", padding: "4px 8px", cursor: "pointer",
                        display: "flex", alignItems: "center", gap: "4px",
                        color: "#4a90e2", fontSize: "10px", fontWeight: 700, whiteSpace: "nowrap",
                      }}
                    >
                      <RotateCw size={10} /> Reenviar
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ─── Controlar TP Screen ───
  if (step === "controlar") {
    return <TpController user={user} onBack={() => setStep("menu")} />;
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

  // Message queue state
  const [incomingMsg, setIncomingMsg] = useState<{ text: string; subject: string } | null>(null);
  const [msgVisible, setMsgVisible] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
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

    // Wait 3s then show
    msgTimerRef.current = setTimeout(() => {
      setIncomingMsg(msg);
      setMsgVisible(true);
      // Auto-close after 5s, then process next
      msgTimerRef.current = setTimeout(() => {
        setMsgVisible(false);
        setTimeout(() => {
          setIncomingMsg(null);
          isShowingRef.current = false;
          processQueue();
        }, 400);
      }, 5000);
    }, 3000);
  }

  function enqueueMessage(msg: { text: string; subject: string }) {
    msgQueueRef.current.push(msg);
    setHasUnread(true);
    processQueue();
  }

  // Check localStorage queue on mount + listen for storage events + realtime
  useEffect(() => {
    if (!user) return;

    function drainLocalStorage() {
      const queue = JSON.parse(localStorage.getItem("tp-msg-queue") || "[]");
      if (queue.length > 0) {
        localStorage.setItem("tp-msg-queue", "[]");
        queue.forEach((msg: any) => enqueueMessage(msg));
      }
    }

    drainLocalStorage();

    const onStorage = (e: StorageEvent) => {
      if (e.key === "tp-msg-queue") drainLocalStorage();
    };
    window.addEventListener("storage", onStorage);

    const channel = supabase
      .channel(`tp-msg-${user.id}`)
      .on("broadcast", { event: "tp-message" }, (payload: any) => {
        const msg = payload.payload as { text: string; subject: string };
        // Remove from localStorage to avoid duplicate
        const queue = JSON.parse(localStorage.getItem("tp-msg-queue") || "[]");
        const filtered = queue.filter((q: any) => q.text !== msg.text || Math.abs((q.ts || 0) - ((msg as any).ts || 0)) > 2000);
        localStorage.setItem("tp-msg-queue", JSON.stringify(filtered));
        enqueueMessage(msg);
      })
      .subscribe();

    return () => {
      window.removeEventListener("storage", onStorage);
      supabase.removeChannel(channel);
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    };
  }, [user]);

  function handleMsgIconClick() {
    if (incomingMsg && msgVisible) {
      // Close current, advance queue
      if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
      setMsgVisible(false);
      setTimeout(() => {
        setIncomingMsg(null);
        isShowingRef.current = false;
        processQueue();
      }, 300);
      return;
    }
    // Force process queue
    if (msgQueueRef.current.length > 0 && !isShowingRef.current) {
      processQueue();
    }
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

  // ─── Remote control listener ───
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`tp-control-${user.id}`)
      .on("broadcast", { event: "tp-command" }, (payload: any) => {
        const cmd = payload.payload;
        if (!cmd) return;
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
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ─── Broadcast state to controller ───
  const stateChannelRef = useRef<any>(null);
  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`tp-state-${user.id}`);
    ch.subscribe();
    stateChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); stateChannelRef.current = null; };
  }, [user]);

  // Broadcast state changes periodically
  useEffect(() => {
    if (!stateChannelRef.current) return;
    const id = setInterval(() => {
      stateChannelRef.current?.send({
        type: "broadcast", event: "tp-state",
        payload: {
          scrolling, speed, fontSize, flipH, flipV,
          displayText: displayText.substring(0, 200),
          isHtmlContent, timerSeconds, scrollPos: scrollPosRef.current,
        },
      });
    }, 500);
    return () => clearInterval(id);
  }, [scrolling, speed, fontSize, flipH, flipV, displayText, isHtmlContent, timerSeconds]);

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
    <div ref={containerRef} className="tp-screen-grid" style={{ display: "grid", gridTemplateColumns: "90px 1fr", height: "100vh", overflow: "hidden", fontFamily: "'Inter', 'Segoe UI', sans-serif", backgroundColor: "#000" }}>

      {/* ─── Sidebar ─── */}
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
              boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
              overflow: "hidden", position: "relative",
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
        <style>{`
          @keyframes tp-msg-shrink { from { width: 100%; } to { width: 0%; } }
          @keyframes tp-msg-border-pulse {
            0%, 100% { border-color: rgba(255,255,255,0.9); box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 15px rgba(255,255,255,0.2); }
            50% { border-color: rgba(255,255,255,0.2); box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 5px rgba(255,255,255,0.05); }
          }
        `}</style>

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

/* ═══════════════════════════════════════════════════════════════
   TP Controller — remote control for an active TP session
   ═══════════════════════════════════════════════════════════════ */
function TpController({ user, onBack }: { user: any; onBack: () => void }) {
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

  // Listen for TP state broadcasts
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`tp-state-${user.id}`)
      .on("broadcast", { event: "tp-state" }, (payload: any) => {
        setTpState(payload.payload);
        setConnected(true);
      })
      .subscribe();

    // If no state received in 5s, mark as disconnected
    const timeout = setTimeout(() => {
      setConnected((c) => c);
    }, 5000);

    return () => { supabase.removeChannel(ch); clearTimeout(timeout); };
  }, [user]);

  // Send command to TP
  async function sendCommand(action: string, value?: any) {
    if (!user) return;
    const ch = supabase.channel(`tp-control-${user.id}`);
    await ch.subscribe();
    await ch.send({ type: "broadcast", event: "tp-command", payload: { action, value } });
    supabase.removeChannel(ch);
  }

  const scrolling = tpState?.scrolling ?? false;
  const speed = tpState?.speed ?? 2;
  const fontSize = tpState?.fontSize ?? 60;
  const flipH = tpState?.flipH ?? false;
  const flipV = tpState?.flipV ?? false;
  const displayText = tpState?.displayText ?? "";
  const isHtmlContent = tpState?.isHtmlContent ?? false;
  const timerSeconds = tpState?.timerSeconds ?? 0;
  const scrollPos = tpState?.scrollPos ?? 50;

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
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
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
      <div style={{
        width: "min(900px, 90vw)", height: "min(500px, 55vh)", position: "relative",
        backgroundColor: "#020210", borderRadius: "12px", overflow: "hidden",
        border: "1px solid rgba(74,144,226,0.3)", boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
      }}>
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

        {/* Eyeline */}
        <div style={{ position: "absolute", left: 0, top: "50%", transform: "translateY(-50%)", zIndex: 10 }}>
          <div style={{ width: 0, height: 0, borderTop: "12px solid transparent", borderBottom: "12px solid transparent", borderLeft: "20px solid #4a90e2", filter: "drop-shadow(0 0 6px rgba(74,144,226,0.5))" }} />
        </div>
        <div style={{ position: "absolute", left: "24px", right: "24px", top: "50%", height: "1px", background: "rgba(74,144,226,0.3)", zIndex: 6 }} />

        {/* Text preview */}
        <div style={{
          width: "75%", margin: "0 auto", fontSize: `${Math.max(14, fontSize * 0.3)}px`, lineHeight: 1.5,
          textAlign: "center", whiteSpace: "pre-wrap", position: "absolute",
          top: `${scrollPos}%`, left: "12.5%",
          color: "#ffffff", textShadow: "0 1px 8px rgba(0,0,0,0.5)", fontWeight: 400,
          transform: `${flipH ? "scaleX(-1)" : ""} ${flipV ? "scaleY(-1)" : ""}`.trim() || "none",
          transition: "top 0.5s ease-out",
        }}>
          {isHtmlContent ? <span dangerouslySetInnerHTML={{ __html: displayText }} /> : displayText}
        </div>

        {/* Status overlay */}
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
      <div style={{
        marginTop: "20px", display: "flex", alignItems: "center", gap: "12px",
        background: "rgba(11,11,48,0.9)", backdropFilter: "blur(20px)",
        padding: "12px 28px", borderRadius: "20px",
        border: "1px solid rgba(74,144,226,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
      }}>
        {/* Font size */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <button onClick={() => sendCommand("fontSize", Math.max(20, fontSize - 5))} style={{
            ...controlBtnStyle, padding: "6px 10px", fontSize: "11px", fontWeight: 700,
          }}>
            <Minus size={10} /> A
          </button>
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.3)", minWidth: "30px", textAlign: "center" }}>{fontSize}px</span>
          <button onClick={() => sendCommand("fontSize", Math.min(120, fontSize + 5))} style={{
            ...controlBtnStyle, padding: "6px 10px", fontSize: "11px", fontWeight: 700,
          }}>
            <Plus size={10} /> A
          </button>
        </div>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />

        {/* Speed */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Type size={12} color="rgba(255,255,255,0.3)" />
          <input type="range" min={0} max={10} value={speed}
            onChange={(e) => sendCommand("speed", Number(e.target.value))}
            style={{ width: "120px", accentColor: "#4a90e2", height: "4px" }} />
          <span style={{ fontSize: "10px", color: "rgba(255,255,255,0.4)", minWidth: "14px" }}>{speed}</span>
        </div>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />

        {/* Play/Pause */}
        <button onClick={() => sendCommand("toggle")} style={{
          background: scrolling ? "linear-gradient(135deg, #e24a4a, #c0392b)" : "linear-gradient(135deg, #4a90e2, #2d6dc0)",
          border: "none", borderRadius: "50%", width: "48px", height: "48px", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: scrolling ? "0 4px 16px rgba(226,74,74,0.4)" : "0 4px 16px rgba(74,144,226,0.4)",
          transition: "all 0.3s",
        }}>
          {scrolling ? <Pause size={20} color="#fff" /> : <Play size={20} color="#fff" style={{ marginLeft: "2px" }} />}
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />

        {/* Scroll step buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
          <button onClick={() => sendCommand("scrollStep", 80)} title="Scroll para cima" style={{ ...controlBtnStyle, padding: "4px 10px" }}>
            ▲
          </button>
          <button onClick={() => sendCommand("scrollStep", -80)} title="Scroll para baixo" style={{ ...controlBtnStyle, padding: "4px 10px" }}>
            ▼
          </button>
        </div>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />

        {/* Flip */}
        <button onClick={() => sendCommand("flipH")} title="Inverter H"
          style={{ ...controlBtnStyle, background: flipH ? "rgba(74,144,226,0.2)" : controlBtnStyle.background }}>
          <FlipHorizontal2 size={14} color={flipH ? "#4a90e2" : "rgba(255,255,255,0.5)"} />
        </button>
        <button onClick={() => sendCommand("flipV")} title="Inverter V"
          style={{ ...controlBtnStyle, background: flipV ? "rgba(74,144,226,0.2)" : controlBtnStyle.background }}>
          <FlipVertical2 size={14} color={flipV ? "#4a90e2" : "rgba(255,255,255,0.5)"} />
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />

        {/* Reset */}
        <button onClick={() => sendCommand("reset")} title="Reiniciar" style={controlBtnStyle}>
          <RotateCcw size={14} color="rgba(255,255,255,0.5)" />
        </button>

        <div style={{ width: "1px", height: "24px", background: "rgba(255,255,255,0.1)" }} />

        {/* Load text */}
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

      {/* ─── Setup Modal ─── */}
      {showSetup && (
        <>
          <div onClick={() => setShowSetup(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 90 }} />
          <div style={{
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
