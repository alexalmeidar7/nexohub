import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Minus, Send, Smile } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";

interface ChatMessage {
  id: string;
  nome: string;
  cidade: string;
  message: string;
  created_at: string;
}

interface PlayerChatProps {
  channelId: string;
  onClose: () => void;
}

export default function PlayerChat({ channelId, onClose }: PlayerChatProps) {
  const [joined, setJoined] = useState(false);
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Drag state
  const [pos, setPos] = useState({ x: window.innerWidth - 370, y: 85 });
  const dragRef = useRef<{ dragging: boolean; startX: number; startY: number; origX: number; origY: number }>({
    dragging: false, startX: 0, startY: 0, origX: 0, origY: 0,
  });
  const chatRef = useRef<HTMLDivElement>(null);

  const onDragStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    dragRef.current = { dragging: true, startX: clientX, startY: clientY, origX: pos.x, origY: pos.y };
  }, [pos]);

  useEffect(() => {
    const onMove = (e: MouseEvent | TouchEvent) => {
      if (!dragRef.current.dragging) return;
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
      const dx = clientX - dragRef.current.startX;
      const dy = clientY - dragRef.current.startY;
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - 300, dragRef.current.origX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 200, dragRef.current.origY + dy)),
      });
    };
    const onUp = () => { dragRef.current.dragging = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
  }, []);

  // Load messages
  useEffect(() => {
    if (!joined) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("player_chat_messages")
        .select("*")
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(data);
    };
    fetchMessages();

    const channel = supabase
      .channel("player-chat-" + channelId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "player_chat_messages",
        },
        (payload) => {
          setMessages((prev) => {
            const updated = [...prev, payload.new as ChatMessage];
            // Keep only last 100 messages
            return updated.slice(-100);
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [joined, channelId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleJoin = () => {
    if (!nome.trim() || !cidade.trim()) return;
    setJoined(true);
  };

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput("");
    setShowEmoji(false);
    await supabase.from("player_chat_messages").insert({
      channel_id: channelId,
      nome,
      cidade,
      message: msg,
    });
    // Cleanup: keep only last 100 messages per channel
    const { data: allMsgs } = await supabase
      .from("player_chat_messages")
      .select("id")
      .order("created_at", { ascending: true });
    if (allMsgs && allMsgs.length > 100) {
      const idsToDelete = allMsgs.slice(0, allMsgs.length - 100).map((m) => m.id);
      await supabase.from("player_chat_messages").delete().in("id", idsToDelete);
    }
  }, [input, channelId, nome, cidade]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const onEmojiClick = (emojiData: { emoji: string }) => {
    setInput((prev) => prev + emojiData.emoji);
    inputRef.current?.focus();
  };

  // Login popup
  if (!joined) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
        <div
          className="rounded-2xl border border-white/10 p-6 w-[340px] flex flex-col gap-4"
          style={{ backgroundColor: "rgba(15,15,15,0.97)" }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-white font-bold text-lg">Entrar no Chat</h3>
            <button onClick={onClose} className="text-white/50 hover:text-white">
              <X size={18} />
            </button>
          </div>
          <input
            placeholder="Seu nome"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/10 text-white px-3 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:border-[#e60000]"
            autoFocus
          />
          <input
            placeholder="Sua cidade"
            value={cidade}
            onChange={(e) => setCidade(e.target.value)}
            className="w-full rounded-lg bg-white/10 border border-white/10 text-white px-3 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:border-[#e60000]"
          />
          <button
            onClick={handleJoin}
            disabled={!nome.trim() || !cidade.trim()}
            className="w-full py-2 rounded-lg text-white font-bold text-sm transition-all disabled:opacity-40"
            style={{ backgroundColor: "#e60000" }}
          >
            Entrar
          </button>
        </div>
      </div>
    );
  }

  // Minimized
  if (minimized) {
    return (
      <div
        className="fixed z-[55] rounded-xl border border-white/10 px-4 py-2 flex items-center gap-3 cursor-pointer"
        style={{ backgroundColor: "rgba(15,15,15,0.95)", bottom: "110px", right: "80px" }}
        onClick={() => setMinimized(false)}
      >
        <span className="text-white text-sm font-bold">💬 Chat</span>
        <span className="text-white/40 text-xs">({messages.length})</span>
      </div>
    );
  }

  // Full chat — draggable
  return (
    <div
      ref={chatRef}
      className="fixed z-[55] w-[290px] flex flex-col rounded-2xl border border-white/10"
      style={{
        backgroundColor: "rgba(10,10,10,0.95)",
        left: `${pos.x}px`,
        top: `${pos.y}px`,
        height: "calc(100vh - 335px)",
        maxHeight: "500px",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/10 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
        onTouchStart={onDragStart}
      >
        <span className="text-white font-bold text-sm">💬 Chat ao Vivo</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMinimized(true)}
            className="text-white/50 hover:text-white"
            title="Minimizar"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={onClose}
            className="text-white/50 hover:text-white"
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3 chat-scroll">
        {messages.map((msg) => {
          const isMe = msg.nome === nome && msg.cidade === cidade;
          return (
            <div key={msg.id} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
              <span className="text-[10px] text-white/40 mb-0.5">
                <span className="font-bold text-white/60">{msg.nome}</span> • {msg.cidade}
              </span>
              <div
                className={`rounded-xl px-3 py-1.5 text-sm max-w-[85%] break-words ${
                  isMe
                    ? "bg-[#e60000] text-white"
                    : "bg-white/10 text-white/90"
                }`}
              >
                {msg.message}
              </div>
            </div>
          );
        })}
      </div>

      {/* Emoji picker */}
      {showEmoji && (
        <div className="absolute bottom-16 left-2 right-2 z-10">
          <EmojiPicker
            onEmojiClick={onEmojiClick}
            theme={Theme.DARK}
            width="100%"
            height={300}
            searchPlaceholder="Buscar emoji..."
          />
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-white/10 flex items-center gap-2">
        <button
          onClick={() => setShowEmoji(!showEmoji)}
          className={`text-white/50 hover:text-white transition-colors ${showEmoji ? "text-yellow-400" : ""}`}
        >
          <Smile size={20} />
        </button>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua mensagem..."
          className="flex-1 rounded-lg bg-white/10 border border-white/10 text-white px-3 py-2 text-sm placeholder:text-white/40 focus:outline-none focus:border-[#e60000]"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          className="text-white/70 hover:text-white disabled:opacity-30 transition-colors"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
