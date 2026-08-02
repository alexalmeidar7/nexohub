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
      
      let userLocation = "";
      try {
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        if (data.city && data.region_code) {
          userLocation = `${data.city}, ${data.region_code}`;
        }
      } catch (err) {
        console.warn("Failed to fetch location from IP", err);
      }

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
          setCidade(profile.cidade || userLocation || "");
          setAvatarUrl(profile.avatar_url || null);
          setIsLoggedIn(true);
          setJoined(true);
        } else {
          // Logged in but no profile name yet
          setCidade(userLocation);
        }
      } else {
        // Not logged in, still pre-fill location
        setCidade(userLocation);
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
          background: "transparent",
        }}
      >
        <div
          className="w-[360px] flex flex-col gap-6 animate-scale-in"
          style={{
            padding: "28px 26px 24px",
            borderRadius: 32,
            background: "linear-gradient(180deg, rgba(25,25,28,0.92) 0%, rgba(12,12,14,0.96) 100%)",
            border: "none",
            boxShadow: "0 40px 100px -20px rgba(0,0,0,0.95)",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/50">chat ao vivo</span>
              <h3 className="text-white font-bold text-xl tracking-tight">Entrar no chat</h3>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center border border-white/10 hover:bg-white/15 hover:border-white/25 transition-all group"
              aria-label="Fechar"
            >
              <X size={16} className="text-white/60 group-hover:text-white group-hover:scale-110 transition-transform" />
            </button>
          </div>
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40 ml-1">Como quer ser chamado?</label>
              <input
                placeholder="Seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="w-full rounded-2xl text-white px-5 py-4 text-sm placeholder:text-white/25 focus:outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
                onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.35)")}
                onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.10)")}
                autoFocus
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40 ml-1">Sua localização</label>
              <input
                placeholder="Ex: São Paulo, SP"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                className="w-full rounded-2xl text-white px-5 py-4 text-sm placeholder:text-white/25 focus:outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.10)",
                }}
                onFocus={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.35)")}
                onBlur={(e) => (e.currentTarget.style.border = "1px solid rgba(255,255,255,0.10)")}
              />
            </div>
          </div>
          <button
            onClick={handleJoin}
            disabled={!nome.trim() || !cidade.trim()}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide transition-all disabled:opacity-30 disabled:cursor-not-allowed hover:scale-[1.02] active:scale-[0.98]"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(235,235,235,1) 100%)",
              color: "#000",
              boxShadow: "0 10px 30px -10px rgba(255,255,255,0.3), inset 0 1px 0 rgba(255,255,255,0.6)",
            }}
          >
            Participar da conversa
          </button>
          <p className="text-[11px] text-white/30 text-center leading-relaxed font-medium">
            Ao entrar, você concorda com nossas diretrizes de comunidade.
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

  // Full chat - Floating bubble style
  return (
    <div
      className="absolute z-[55] animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-none"
      style={{ bottom: "170px", right: "20px", width: "360px", height: "clamp(320px, calc(100vh - 335px), 520px)" }}
    >
      {/* Background Gradient Shadow for the whole right area */}
      <div 
        className="fixed inset-y-0 right-0 w-[500px] pointer-events-none transition-opacity duration-700 ease-in-out"
        style={{
          background: "linear-gradient(to left, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)",
          zIndex: -1,
          opacity: minimized ? 0 : 1
        }}
      />

      <div className="w-full h-full flex flex-col pointer-events-auto">
        {/* Header - Transparent/Minimal */}
        <div className="flex items-center justify-between px-2 py-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/40 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/50 font-bold">chat ao vivo</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center bg-black/20 hover:bg-black/40 border border-white/10 transition-all group"
            title="Fechar"
          >
            <X size={14} className="text-white/60 group-hover:text-white" />
          </button>
        </div>

        {/* Messages - No main box background */}
        <div 
          ref={scrollRef} 
          className="flex-1 overflow-y-auto px-1 space-y-2.5 chat-scroll pb-4 mask-fade-top"
        >
          {messages.length === 0 && (
            <div className="h-full flex items-center justify-center text-center px-4">
              <span className="text-[12px] text-white/40 italic">Seja o primeiro a mandar uma mensagem</span>
            </div>
          )}
          {messages.map((msg) => {
            const isMe = msg.nome === nome && msg.cidade === cidade;
            return (
              <div key={msg.id} className="flex flex-col gap-1.5 animate-in slide-in-from-bottom-2 duration-300">
                <div 
                  className="rounded-[24px] px-4 py-3 flex items-start gap-3"
                  style={{
                    background: "rgba(35,35,38,0.85)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    boxShadow: "0 8px 32px -4px rgba(0,0,0,0.4)"
                  }}
                >
                  {avatarUrl && isMe ? (
                    <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5" />
                  ) : (
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{
                        background: "linear-gradient(135deg, rgba(255,255,255,0.1), rgba(255,255,255,0.05))",
                        border: "1px solid rgba(255,255,255,0.1)",
                      }}
                    >
                      <span className="text-[11px] text-white/70 font-bold">{msg.nome.charAt(0).toUpperCase()}</span>
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[11px] font-bold text-white/90 truncate">{msg.nome}</span>
                      <span className="text-[9px] text-white/30 truncate">{msg.cidade}</span>
                    </div>
                    <p className="text-[13px] leading-[1.4] text-white/85 break-words">
                      {msg.message}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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

          {/* Input - Now a floating pill */}
          <div
            className="mt-2 px-1 py-1 flex items-center gap-2"
          >
            <div 
              className="flex-1 flex items-center gap-2 rounded-full px-4 py-3"
              style={{
                background: "rgba(255,255,255,0.1)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.15)",
                boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
              }}
            >
              <button
                onClick={() => setShowEmoji(!showEmoji)}
                className={`w-7 h-7 flex items-center justify-center transition-colors ${
                  showEmoji ? "text-white" : "text-white/40 hover:text-white"
                }`}
              >
                <Smile size={18} />
              </button>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Participar da conversa..."
                className="flex-1 bg-transparent text-white text-[13px] placeholder:text-white/30 focus:outline-none"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim()}
                className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20 transition-all"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
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

