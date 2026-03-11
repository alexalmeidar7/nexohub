import { useState, useEffect, useRef } from "react";
import { MessageSquare, Loader2, Trash2, RotateCw, X, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

interface TpMessageProps {
  user: User;
  onBack: () => void;
}

export default function TpMessage({ user, onBack }: TpMessageProps) {
  const [msgText, setMsgText] = useState("");
  const [msgSending, setMsgSending] = useState(false);
  const [sendStatus, setSendStatus] = useState<"idle" | "sent" | "error">("idle");
  const [msgHistory, setMsgHistory] = useState<{ text: string; ts: number }[]>(() => {
    try { return JSON.parse(localStorage.getItem("tp-msg-history") || "[]"); } catch { return []; }
  });

  // Persistent channel — subscribe once, reuse for all sends
  const channelRef = useRef<any>(null);
  const channelReadyRef = useRef(false);

  useEffect(() => {
    const ch = supabase.channel(`tp-msg-${user.id}`);
    ch.subscribe((status) => { channelReadyRef.current = status === "SUBSCRIBED"; });
    channelRef.current = ch;
    return () => {
      channelReadyRef.current = false;
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  }, [user.id]);

  async function sendMsg(text: string) {
    if (!text.trim()) return;
    setMsgSending(true);
    setSendStatus("idle");
    const msg = { text: text.trim(), subject: "Mensagem", ts: Date.now() };

    // Save to history
    const newHistory = [{ text: text.trim(), ts: Date.now() }, ...msgHistory].slice(0, 50);
    setMsgHistory(newHistory);
    localStorage.setItem("tp-msg-history", JSON.stringify(newHistory));

    try {
      // Wait for channel readiness (up to 1.5s)
      if (!channelReadyRef.current) {
        await new Promise<void>((resolve) => {
          const started = Date.now();
          const check = setInterval(() => {
            if (channelReadyRef.current || Date.now() - started > 1500) {
              clearInterval(check);
              resolve();
            }
          }, 50);
        });
      }

      if (!channelReadyRef.current) {
        throw new Error("Canal não conectado");
      }

      await channelRef.current.send({ type: "broadcast", event: "tp-message", payload: msg });
      setSendStatus("sent");
      setMsgText("");
      setTimeout(() => setSendStatus("idle"), 3000);
    } catch (err) {
      console.error("Erro ao enviar mensagem:", err);
      setSendStatus("error");
      setTimeout(() => setSendStatus("idle"), 5000);
    }
    setMsgSending(false);
  }

  function clearHistory() {
    setMsgHistory([]);
    localStorage.removeItem("tp-msg-history");
  }

  return (
    <div
      tabIndex={-1}
      onKeyDown={(e) => { if (e.key === "Escape") onBack(); }}
      style={{
        height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        backgroundColor: "#0f1058", fontFamily: "'Poppins', 'Inter', sans-serif", gap: "20px", outline: "none",
      }}
      ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus(); }}
    >
      <div style={{
        background: "linear-gradient(135deg, #0d0446, #1a0a6e)", borderRadius: "20px",
        padding: "32px", width: "min(450px, 90%)", border: "1px solid rgba(74,144,226,0.3)",
        boxShadow: "0 16px 48px rgba(0,0,0,0.4)", position: "relative",
      }}>
        <button
          onClick={onBack}
          style={{
            position: "absolute", top: "14px", right: "14px",
            background: "none", border: "none", cursor: "pointer",
            display: "flex", alignItems: "center", gap: "4px", padding: "4px",
          }}
        >
          <X size={16} color="rgba(255,255,255,0.5)" />
          <span style={{ fontSize: "9px", color: "rgba(255,255,255,0.3)", fontWeight: 600 }}>esc</span>
        </button>

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
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (msgText.trim() && !msgSending) sendMsg(msgText);
            }
            if (e.key === "Escape") onBack();
          }}
          placeholder="Digite sua mensagem..."
          rows={5}
          maxLength={500}
          style={{
            width: "100%", background: "#ffffff", color: "#0d0446", border: "1px solid rgba(74,144,226,0.2)",
            borderRadius: "10px", padding: "12px", fontSize: "13px", resize: "none", outline: "none",
          }}
        />
        {/* Character counter */}
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: "4px" }}>
          <div>
            {sendStatus === "sent" && (
              <span style={{ color: "#22c55e", fontSize: "12px", fontWeight: 600 }}>✓ Mensagem enviada!</span>
            )}
            {sendStatus === "error" && (
              <span style={{ color: "#ef4444", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>
                <AlertCircle size={12} /> Falha ao enviar. Tente novamente.
              </span>
            )}
          </div>
          <span style={{ fontSize: "10px", color: msgText.length > 450 ? "#ef4444" : "rgba(255,255,255,0.25)" }}>
            {msgText.length}/500
          </span>
        </div>
        <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
          <button
            onClick={() => sendMsg(msgText)}
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
                    onClick={() => sendMsg(h.text)}
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
