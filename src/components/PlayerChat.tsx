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
  shopOpen?: boolean;
  radioUserId?: string | null;
}

function formatMsgTime(iso: string): string {
  try {
    const d = new Date(iso);
    const day = String(d.getDate()).padStart(2, "0");
    const mon = String(d.getMonth() + 1).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const m = String(d.getMinutes()).padStart(2, "0");
    return `${day}/${mon} ${h}:${m}`;
  } catch {
    return "";
  }
}

export default function PlayerChat({ channelId, onClose, shopOpen = false, radioUserId }: PlayerChatProps) {
  const [joined, setJoined] = useState(false);
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [minimized, setMinimized] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Check if user is logged in and load profile
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: scopedProfile } = radioUserId ? await supabase
          .from("player_listener_profiles")
          .select("nome, cidade, avatar_url")
          .eq("auth_user_id", session.user.id)
          .eq("radio_user_id", radioUserId)
          .maybeSingle() : { data: null } as any;
        const { data: fallbackProfile } = !scopedProfile ? await supabase
          .from("profiles")
          .select("nome, cidade, avatar_url")
          .eq("user_id", session.user.id)
          .maybeSingle() : { data: null } as any;
        const profile = scopedProfile || fallbackProfile;
        if (profile?.nome) {
          setNome(profile.nome);
          setCidade(profile.cidade || "");
          setAvatarUrl(profile.avatar_url || null);
          setIsLoggedIn(true);
          setJoined(true);
        }
      }
    };
    checkAuth();
  }, [radioUserId]);

  // Load messages + realtime + polling fallback
  useEffect(() => {
    if (!joined) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("player_chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: true })
        .limit(100);
      if (data) setMessages(data);
    };
    fetchMessages();

    // Realtime
    const channel = supabase
      .channel("player-chat-" + channelId)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "player_chat_messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          setMessages((prev) => {
            const filtered = prev.filter(m => !m.id.startsWith("optimistic-"));
            const updated = [...filtered, payload.new as ChatMessage];
            return updated.slice(-100);
          });
        }
      )
      .subscribe();

    // Polling fallback every 5s
    const pollTimer = setInterval(fetchMessages, 5000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollTimer);
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
    // Optimistic update — show message instantly
    const optimisticMsg: ChatMessage = {
      id: "optimistic-" + Date.now(),
      nome,
      cidade,
      message: msg,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, optimisticMsg].slice(-100));
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
      .eq("channel_id", channelId)
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
      <div
        className="fixed inset-0 z-[60] flex items-center justify-center animate-fade-in"
        style={{
          background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.8) 100%)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
        }}
      >
        <div
          className="w-[360px] flex flex-col gap-5 animate-scale-in"
          style={{
            padding: "26px 26px 24px",
            borderRadius: 24,
            background: "linear-gradient(180deg, rgba(20,20,22,0.90) 0%, rgba(10,10,12,0.94) 100%)",
            border: "1px solid rgba(255,255,255,0.22)",
            backdropFilter: "blur(28px) saturate(140%)",
            WebkitBackdropFilter: "blur(28px) saturate(140%)",
            boxShadow: "0 34px 90px -25px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.12)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase tracking-[0.24em] text-white/50">chat ao vivo</span>
              <h3 className="text-white font-semibold text-lg tracking-tight mt-0.5">Entrar no chat</h3>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center border border-white/10 hover:bg-white/10 hover:border-white/25 transition"
              aria-label="Fechar"
            >
              <X size={15} className="text-white/70" />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <input
              placeholder="Seu nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="w-full rounded-xl text-white px-4 py-3 text-sm placeholder:text-white/35 focus:outline-none transition"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
              onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.30)")}
              onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.10)")}
              autoFocus
            />
            <input
              placeholder="Sua cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              className="w-full rounded-xl text-white px-4 py-3 text-sm placeholder:text-white/35 focus:outline-none transition"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
              onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.30)")}
              onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.10)")}
            />
          </div>
          <button
            onClick={handleJoin}
            disabled={!nome.trim() || !cidade.trim()}
            className="w-full py-3 rounded-xl text-sm font-semibold tracking-wide transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(230,230,230,0.85) 100%)",
              color: "#111",
              boxShadow: "0 10px 30px -10px rgba(255,255,255,0.25), inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            Entrar no chat
          </button>
          <p className="text-[11px] text-white/40 text-center leading-relaxed">
            Ao entrar, você concorda em manter o respeito na comunidade.
          </p>
        </div>
      </div>
    );
  }


  // Minimized
  if (minimized) {
    return (
      <div
        className="fixed z-[55] rounded-xl border border-white/10 px-4 py-2 flex items-center gap-3 cursor-pointer"
        style={{ backgroundColor: "rgba(15,15,15,0.95)", bottom: "165px", right: "calc(10% + 8px)" }}
        onClick={() => setMinimized(false)}
      >
        <span className="text-white text-sm font-bold">💬 Chat</span>
        <span className="text-white/40 text-xs">({messages.length})</span>
      </div>
    );
  }

  // Full chat — positioned same as shopping panel
  return (
    <div
      className="absolute left-0 right-0 z-[55] mx-auto animate-fade-in"
      style={{ bottom: "170px", width: "80%", paddingLeft: "8px", paddingRight: "8px" }}
    >
      <div className="ml-auto" style={{ maxWidth: "360px" }}>
        <div
          className="flex flex-col overflow-hidden"
          style={{
            height: "clamp(320px, calc(100vh - 335px), 520px)",
            borderRadius: 22,
            background: "linear-gradient(180deg, rgba(20,20,22,0.88) 0%, rgba(10,10,12,0.92) 100%)",
            border: "1px solid rgba(255,255,255,0.22)",
            backdropFilter: "blur(28px) saturate(140%)",
            WebkitBackdropFilter: "blur(28px) saturate(140%)",
            boxShadow: "0 30px 80px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.10)",

          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/60 opacity-60"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.22em] text-white/70 font-medium">chat ao vivo</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setMinimized(true)}
                className="w-7 h-7 rounded-full flex items-center justify-center border border-white/10 hover:bg-white/10 hover:border-white/25 transition"
                title="Minimizar"
              >
                <Minus size={13} className="text-white/70" />
              </button>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full flex items-center justify-center border border-white/10 hover:bg-white/10 hover:border-white/25 transition"
                title="Fechar"
              >
                <X size={13} className="text-white/70" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 chat-scroll">
            {messages.length === 0 && (
              <div className="h-full flex items-center justify-center text-center px-4">
                <span className="text-[12px] text-white/40 italic">Seja o primeiro a mandar uma mensagem</span>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.nome === nome && msg.cidade === cidade;
              return (
                <div key={msg.id} className={`flex gap-2 ${isMe ? "flex-row-reverse" : "flex-row"} animate-fade-in`}>
                  {/* Avatar */}
                  {isMe && avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 mt-3 border border-white/15" />
                  ) : (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-3"
                      style={{
                        background: "linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))",
                        border: "1px solid rgba(255,255,255,0.10)",
                      }}
                    >
                      <span className="text-[10px] text-white/70 font-semibold">{msg.nome.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className={`flex flex-col ${isMe ? "items-end" : "items-start"} max-w-[80%]`}>
                    <span className="text-[10px] text-white/45 mb-1 px-1">
                      <span className="font-semibold text-white/70">{msg.nome}</span>
                      <span className="text-white/30"> · {msg.cidade}</span>
                      <span className="ml-1.5 text-white/25">{formatMsgTime(msg.created_at)}</span>
                    </span>
                    <div
                      className="rounded-2xl px-3.5 py-2 text-[13px] leading-snug break-words"
                      style={
                        isMe
                          ? {
                              background: "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(230,230,230,0.88) 100%)",
                              color: "#111",
                              borderTopRightRadius: 6,
                              boxShadow: "0 6px 18px -8px rgba(255,255,255,0.2)",
                            }
                          : {
                              background: "rgba(255,255,255,0.07)",
                              color: "rgba(255,255,255,0.92)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              borderTopLeftRadius: 6,
                            }
                      }
                    >
                      {msg.message}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Emoji picker */}
          {showEmoji && (
            <div className="absolute bottom-16 left-0 right-0 z-10 flex justify-center px-2">
              <div
                className="rounded-2xl overflow-hidden shadow-2xl"
                style={{
                  background: "rgba(10,10,10,0.75)",
                  backdropFilter: "blur(20px)",
                  WebkitBackdropFilter: "blur(20px)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
              >
                <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  <span className="text-white/60 text-[11px] uppercase tracking-[0.18em]">emojis</span>
                  <button onClick={() => setShowEmoji(false)} className="text-white/40 hover:text-white transition-colors">
                    <X size={13} />
                  </button>
                </div>
                <EmojiPicker
                  onEmojiClick={onEmojiClick}
                  theme={Theme.DARK}
                  width={310}
                  height={300}
                  searchPlaceholder="Buscar emoji..."
                  skinTonesDisabled
                  previewConfig={{ showPreview: false }}
                />
              </div>
            </div>
          )}

          {/* Input */}
          <div
            className="px-3 py-3 flex items-center gap-2"
            style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
          >
            <button
              onClick={() => setShowEmoji(!showEmoji)}
              className={`w-9 h-9 rounded-full flex items-center justify-center border transition ${
                showEmoji
                  ? "bg-white/15 border-white/25 text-white"
                  : "border-white/10 text-white/60 hover:bg-white/10 hover:text-white"
              }`}
              aria-label="Emojis"
            >
              <Smile size={16} />
            </button>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem…"
              className="flex-1 rounded-full text-white px-4 py-2.5 text-[13px] placeholder:text-white/35 focus:outline-none transition"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.10)",
              }}
              onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.28)")}
              onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.10)")}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-105 active:scale-95"
              style={{
                background: input.trim()
                  ? "linear-gradient(180deg, rgba(255,255,255,0.95) 0%, rgba(230,230,230,0.85) 100%)"
                  : "rgba(255,255,255,0.06)",
                color: input.trim() ? "#111" : "rgba(255,255,255,0.4)",
                border: input.trim() ? "none" : "1px solid rgba(255,255,255,0.10)",
                boxShadow: input.trim() ? "0 6px 18px -8px rgba(255,255,255,0.35)" : "none",
              }}
              aria-label="Enviar"
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

