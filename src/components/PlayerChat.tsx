import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Send, Smile } from "lucide-react";
import { PlayerBackButton } from "./player/PlayerBackButton";
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

export default function PlayerChat({ channelId, onClose, radioUserId }: PlayerChatProps) {
  const [joined, setJoined] = useState(false);
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Check if user is logged in and load profile
  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      let userLocation = "";
      try {
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        if (data.city && (data.region_code || data.country_name)) {
          userLocation = data.region_code ? `${data.city}, ${data.region_code}` : `${data.city}, ${data.country_name}`;
        }
      } catch (err) {
        console.warn("Failed to fetch location from IP", err);
        // Fallback: Tenta um segundo serviço se o primeiro falhar
        try {
          const res2 = await fetch("https://ip-api.com/json/");
          const data2 = await res2.json();
          if (data2.status === "success") {
            userLocation = data2.regionName ? `${data2.city}, ${data2.regionName}` : `${data2.city}, ${data2.country}`;
          }
        } catch (err2) {
          console.warn("Second location fallback failed", err2);
        }
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
          setCidade(userLocation);
        }
      } else {
        setCidade(userLocation);
      }
    };
    checkAuth();
  }, [radioUserId]);

  // Load messages + realtime + polling fallback
  useEffect(() => {
    if (!joined) return;

    const fetchMessages = async () => {
      const expirationDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Mantém o chat efêmero: toda mensagem expira 24 horas após o envio.
      await supabase
        .from("player_chat_messages")
        .delete()
        .eq("channel_id", channelId)
        .lt("created_at", expirationDate);

      const { data } = await supabase
        .from("player_chat_messages")
        .select("*")
        .eq("channel_id", channelId)
        .gte("created_at", expirationDate)
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
          const message = payload.new as ChatMessage;
          const expirationTime = Date.now() - 24 * 60 * 60 * 1000;
          if (new Date(message.created_at).getTime() < expirationTime) return;

          setMessages((prev) => {
            const filtered = prev.filter(m => !m.id.startsWith("optimistic-"));
            const updated = [...filtered, message];
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

  // Fetch city suggestions from IBGE
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (cidade.length < 3 || joined) {
        setSuggestions([]);
        return;
      }
      try {
        const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/municipios?nome=${encodeURIComponent(cidade)}&max=5`);
        const data = await response.json();
        if (Array.isArray(data)) {
          const formatted = data.map((item: any) => `${item.nome}, ${item.microrregiao.mesorregiao.UF.sigla}`);
          setSuggestions(formatted);
          setShowSuggestions(true);
        }
      } catch (err) {
        console.warn("Failed to fetch city suggestions", err);
      }
    };

    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
  }, [cidade, joined]);

  // Click outside suggestions to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showEmoji) {
          setShowEmoji(false);
        } else if (showSuggestions) {
          setShowSuggestions(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, showEmoji, showSuggestions]);

  const handleJoin = () => {
    if (!nome.trim() || !cidade.trim()) return;
    setJoined(true);
  };

  const handleSend = useCallback(async () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setInput("");
    setShowEmoji(false);
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
    const expirationDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await supabase
      .from("player_chat_messages")
      .delete()
      .eq("channel_id", channelId)
      .lt("created_at", expirationDate);

    const { data: allMsgs } = await supabase
      .from("player_chat_messages")
      .select("id")
      .eq("channel_id", channelId)
      .gte("created_at", expirationDate)
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
    return createPortal(
      <div className="fixed inset-0 z-[9999] flex items-center justify-end p-8 pointer-events-none animate-in fade-in duration-300">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 z-0 w-[min(760px,65vw)] pointer-events-none"
          style={{ background: "linear-gradient(to left, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 40%, rgba(0,0,0,0) 100%)" }}
        />
        <div
          className="relative z-10 w-[min(360px,calc(100vw-48px))] flex flex-col gap-6 pointer-events-auto animate-scale-in"
          style={{
            padding: "28px 26px 24px",
            borderRadius: 32,
            background: "rgba(35,35,38,0.95)",
            border: "1px solid rgba(255,255,255,0.06)",
            boxShadow: "0 40px 100px -20px rgba(0,0,0,0.95)",
            marginBottom: "140px",
            marginRight: "20px",
          }}
        >
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-[0.24em] font-bold text-white/50">chat ao vivo</span>
              <h3 className="text-white font-bold text-xl tracking-tight">Entrar no chat</h3>
            </div>
            <PlayerBackButton
              onClick={onClose}
              className="w-8 h-8"
              iconSize={14}
              aria-label="Voltar"
            />
          </div>
          <div className="flex flex-col gap-3">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-white/40 ml-1">Como quer ser chamado?</label>
              <input
                placeholder="Seu nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                className="player-chat-entry-input w-full rounded-2xl text-white px-5 py-4 text-sm placeholder:text-white/25 focus:outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
                autoFocus
              />
            </div>
            <div className="space-y-1 relative">
              <label className="text-[10px] uppercase tracking-wider text-white/40 ml-1">Sua localização</label>
              <input
                placeholder="Ex: São Paulo, SP"
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                onFocus={() => cidade.length >= 3 && setShowSuggestions(true)}
                className="player-chat-entry-input w-full rounded-2xl text-white px-5 py-4 text-sm placeholder:text-white/25 focus:outline-none transition-all"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.10)" }}
              />
              {showSuggestions && suggestions.length > 0 && (
                <div 
                  ref={suggestionsRef}
                  className="absolute left-0 right-0 top-full mt-2 z-[70] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200"
                  style={{ 
                    background: "rgba(35,35,38,0.98)", 
                    borderRadius: 20, 
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow: "0 10px 40px -10px rgba(0,0,0,0.8)"
                  }}
                >
                  {suggestions.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setCidade(s);
                        setShowSuggestions(false);
                      }}
                      className="w-full px-5 py-3 text-left text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors border-b border-white/5 last:border-0"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={handleJoin}
            disabled={!nome.trim() || !cidade.trim()}
            className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide transition-all disabled:opacity-30 hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "#fff", color: "#000" }}
          >
            Participar da conversa
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-end p-8 pointer-events-none animate-in fade-in duration-300">
      <div
        aria-hidden="true"
        className="absolute inset-y-0 right-0 z-0 w-[min(760px,65vw)] pointer-events-none"
        style={{ background: "linear-gradient(to left, rgba(0,0,0,0.72) 0%, rgba(0,0,0,0.38) 40%, rgba(0,0,0,0) 100%)" }}
      />
      <div
        className="relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-none"
        style={{ width: "360px", height: "clamp(320px, calc(100vh - 335px), 520px)", marginBottom: "140px", marginRight: "20px" }}
      >

      <div className="w-full h-full flex flex-col pointer-events-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-2 py-2 mb-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/40 opacity-60"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white"></span>
            </span>
            <span className="text-[9px] uppercase tracking-[0.2em] text-white/50 font-bold">chat ao vivo</span>
          </div>
          <PlayerBackButton
            onClick={onClose}
            className="w-8 h-8 focus-visible:ring-offset-2"
            iconSize={14}
            aria-label="Voltar"
          />
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-1 space-y-2.5 scrollbar-hide pb-4 mask-fade-out-top">
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
                  <div className="flex items-start gap-3 flex-1">
                    {avatarUrl && isMe ? (
                      <img src={avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5" />
                    ) : (
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.1)" }}
                      >
                        <span className="text-[11px] text-white/70 font-bold">{msg.nome.charAt(0).toUpperCase()}</span>
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-[11px] font-bold text-white/90 truncate">{msg.nome}</span>
                        <span className="text-[9px] text-white/30 truncate">{msg.cidade}</span>
                      </div>
                      <p className="text-[13px] leading-[1.4] text-white/85 break-words">{msg.message}</p>
                    </div>
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
                border: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <EmojiPicker onEmojiClick={onEmojiClick} theme={Theme.DARK} width={310} height={300} searchPlaceholder="Buscar emoji..." skinTonesDisabled previewConfig={{ showPreview: false }} />
            </div>
          </div>
        )}

        {/* Input */}
        <div className="mt-2 px-1 py-1 flex items-center gap-2">
          <div 
            className="flex-1 flex items-center gap-2 rounded-full px-4 py-3"
            style={{
              background: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.15)",
              boxShadow: "0 4px 20px rgba(0,0,0,0.2)"
            }}
          >
            <button onClick={() => setShowEmoji(!showEmoji)} className={`w-7 h-7 flex items-center justify-center transition-colors ${showEmoji ? "text-white" : "text-white/40 hover:text-white"}`}>
              <Smile size={18} />
            </button>
            <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown} placeholder="Participar da conversa..." className="flex-1 bg-transparent text-white text-[13px] placeholder:text-white/30 focus:outline-none" />
            <button onClick={handleSend} disabled={!input.trim()} className="w-7 h-7 flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20 transition-all">
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>
      </div>
    </div>,
    document.body,
  );
}
