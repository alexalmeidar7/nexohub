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

  const channelRef = useRef<any>(null);
  const channelReadyRef = useRef(false);

  useEffect(() => {
    const ch = supabase.channel(`tp-msg-${user.id}`, { config: { broadcast: { self: true } } });
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

    const newHistory = [{ text: text.trim(), ts: Date.now() }, ...msgHistory].slice(0, 50);
    setMsgHistory(newHistory);
    localStorage.setItem("tp-msg-history", JSON.stringify(newHistory));

    try {
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

      if (!channelReadyRef.current) throw new Error("Canal não conectado");

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
      className="h-screen flex flex-col items-center justify-center bg-tp font-sans gap-5 outline-none"
      ref={(el) => { if (el && !el.contains(document.activeElement)) el.focus(); }}
    >
      <div className="bg-gradient-to-br from-tp-surface to-tp-surface-light rounded-[20px] p-8 w-[min(450px,90%)] border border-tp-border shadow-[0_16px_48px_hsl(var(--tp-shadow))] relative">
        <button
          onClick={onBack}
          className="absolute top-3.5 right-3.5 bg-transparent border-none cursor-pointer flex items-center gap-1 p-1"
        >
          <X size={16} className="text-tp-muted-strong" />
          <span className="text-[9px] text-tp-foreground/30 font-semibold">esc</span>
        </button>

        <h3 className="text-tp-foreground text-base font-bold m-0 mb-1">
          <MessageSquare size={16} className="inline align-[-2px] mr-2" />
          Enviar Mensagem
        </h3>
        <p className="text-tp-muted text-[11px] m-0 mb-4">
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
          className="w-full bg-white text-tp-surface border border-tp-accent/20 rounded-[10px] p-3 text-[13px] resize-none outline-none focus:border-tp-accent/50"
        />
        {/* Character counter */}
        <div className="flex justify-between mt-1">
          <div>
            {sendStatus === "sent" && (
              <span className="text-green-500 text-xs font-semibold">✓ Mensagem enviada!</span>
            )}
            {sendStatus === "error" && (
              <span className="text-destructive text-xs font-semibold flex items-center gap-1">
                <AlertCircle size={12} /> Falha ao enviar. Tente novamente.
              </span>
            )}
          </div>
          <span className={`text-[10px] ${msgText.length > 450 ? "text-destructive" : "text-tp-foreground/25"}`}>
            {msgText.length}/500
          </span>
        </div>
        <div className="flex gap-2.5 mt-2.5">
          <button
            onClick={() => sendMsg(msgText)}
            disabled={!msgText.trim() || msgSending}
            className={`rounded-[10px] px-6 py-2.5 font-bold text-xs border-none ${
              msgText.trim()
                ? "bg-gradient-to-br from-tp-accent to-tp-accent-hover text-white cursor-pointer"
                : "bg-tp-foreground/5 text-tp-foreground/30 cursor-not-allowed"
            }`}
          >
            {msgSending ? <Loader2 size={14} className="animate-spin" /> : "Enviar"}
          </button>
          {msgHistory.length > 0 && (
            <button onClick={clearHistory} title="Apagar histórico" className="bg-transparent border border-destructive/30 rounded-[10px] px-4 py-2.5 cursor-pointer text-destructive/70 text-xs flex items-center gap-1.5">
              <Trash2 size={12} /> Limpar
            </button>
          )}
        </div>

        {msgHistory.length > 0 && (
          <div className="mt-5">
            <div className="text-[11px] font-bold text-tp-muted uppercase tracking-wider mb-2">
              Histórico
            </div>
            <div className="max-h-[180px] overflow-y-auto flex flex-col gap-1.5">
              {msgHistory.map((h, i) => (
                <div key={i} className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-2 border border-tp-foreground/[0.06]">
                  <span className="flex-1 text-tp-foreground/70 text-xs leading-relaxed overflow-hidden text-ellipsis whitespace-nowrap">
                    {h.text}
                  </span>
                  <span className="text-[10px] text-tp-foreground/25 whitespace-nowrap">
                    {new Date(h.ts).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <button
                    onClick={() => sendMsg(h.text)}
                    disabled={msgSending}
                    title="Reenviar"
                    className="bg-tp-accent/15 border border-tp-border rounded-md px-2 py-1 cursor-pointer flex items-center gap-1 text-tp-accent text-[10px] font-bold whitespace-nowrap"
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
