import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { Check, Send, Settings2, Smile, Volume2, VolumeX, X } from "lucide-react";
import { PlayerBackButton } from "./player/PlayerBackButton";
import EmojiPicker, { Theme } from "emoji-picker-react";

interface ChatMessage {
  id: string;
  nome: string;
  cidade: string;
  message: string;
  created_at: string;
  avatar_url?: string | null;
}

interface ChatPreferences {
  avatarUrl?: string;
  neighborhood?: string;
  soundEnabled?: boolean;
}

const CHAT_AVATARS = [
  "/avatars/usr-1.png",
  "/avatars/usr-2.png",
  "/avatars/usr-3.png",
  "/avatars/usr-4.png",
  "/avatars/usr-5.png",
  "/avatars/usr-6.png",
  "/avatars/usr-7.png",
  "/avatars/usr-8.png",
];

function readChatPreferences(key: string): ChatPreferences {
  try {
    return JSON.parse(localStorage.getItem(key) || "{}");
  } catch {
    return {};
  }
}

interface PlayerChatProps {
  channelId: string;
  onClose: () => void;
  shopOpen?: boolean;
  radioUserId?: string | null;
  sideBySide?: boolean;
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

export default function PlayerChat({ channelId, onClose, radioUserId, sideBySide = false }: PlayerChatProps) {
  const [joined, setJoined] = useState(false);
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string | null>(null);
  const [neighborhood, setNeighborhood] = useState("");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showChatSettings, setShowChatSettings] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldFollowLatestMessage = useRef(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const chatPreferencesKey = `player-chat-settings:${radioUserId || channelId}`;
  const chatCity = [neighborhood.trim(), cidade.trim()].filter(Boolean).join(", ");

  const saveChatPreferences = (patch: Partial<ChatPreferences>) => {
    const next = { ...readChatPreferences(chatPreferencesKey), ...patch };
    try {
      localStorage.setItem(chatPreferencesKey, JSON.stringify(next));
    } catch (error) {
      console.warn("Could not save chat preferences", error);
    }
    if (patch.avatarUrl !== undefined) setAvatarUrl(patch.avatarUrl || null);
    if (patch.neighborhood !== undefined) setNeighborhood(patch.neighborhood);
    if (patch.soundEnabled !== undefined) setSoundEnabled(patch.soundEnabled);
  };

  // Load the signed-in Player profile and join immediately when it has a name and city.
  useEffect(() => {
    let cancelled = false;
    const loadLocation = async () => {
      try {
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        if (data.city && (data.region_code || data.country_name)) {
          return data.region_code ? `${data.city}, ${data.region_code}` : `${data.city}, ${data.country_name}`;
        }
      } catch (err) {
        console.warn("Failed to fetch location from IP", err);
        try {
          const response = await fetch("https://ip-api.com/json/");
          const data = await response.json();
          if (data.status === "success" && data.city) {
            return data.regionName ? `${data.city}, ${data.regionName}` : `${data.city}, ${data.country}`;
          }
        } catch (fallbackError) {
          console.warn("Second location fallback failed", fallbackError);
        }
      }
      return "";
    };

    const checkAuth = async () => {
      const preferences = readChatPreferences(chatPreferencesKey);
      const { data: { session } } = await playerSupabase.auth.getSession();
      if (cancelled) return;

      if (session?.user) {
        const { data: scopedProfile } = radioUserId
          ? await playerSupabase
              .from("player_listener_profiles")
              .select("nome, cidade, avatar_url")
              .eq("auth_user_id", session.user.id)
              .eq("radio_user_id", radioUserId)
              .maybeSingle()
          : { data: null } as any;
        const { data: accountProfile } = await playerSupabase
          .from("profiles")
          .select("nome, cidade, estado, avatar_url")
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (cancelled) return;

        const metadata = session.user.user_metadata || {};
        const displayName = scopedProfile?.nome?.trim()
          || accountProfile?.nome?.trim()
          || metadata.full_name?.trim()
          || metadata.name?.trim()
          || session.user.email?.split("@")[0]
          || "";
        const savedCity = scopedProfile?.cidade?.trim()
          || [accountProfile?.cidade, accountProfile?.estado].filter(Boolean).join(", ");
        const location = savedCity || await loadLocation();
        if (cancelled) return;

        setNome(displayName);
        setCidade(location);
        const googleAvatar = scopedProfile?.avatar_url || accountProfile?.avatar_url || metadata.avatar_url || metadata.picture || null;
        setGoogleAvatarUrl(googleAvatar);
        setAvatarUrl(preferences.avatarUrl || googleAvatar || "/avatars/usr-default.png");
        setNeighborhood(preferences.neighborhood || "");
        setSoundEnabled(preferences.soundEnabled !== false);
        if (displayName && location) setJoined(true);
      } else {
        const location = await loadLocation();
        if (!cancelled) {
          setCidade(location);
          setAvatarUrl(preferences.avatarUrl || "/avatars/usr-default.png");
          setNeighborhood(preferences.neighborhood || "");
          setSoundEnabled(preferences.soundEnabled !== false);
        }
      }
    };

    void checkAuth();
    return () => { cancelled = true; };
  }, [radioUserId, chatPreferencesKey]);

  // Load messages + realtime + polling fallback
  useEffect(() => {
    if (!joined) return;

    const fetchMessages = async () => {
      const expirationDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      // Mantém o chat efêmero: toda mensagem expira 24 horas após o envio.
      await playerSupabase
        .from("player_chat_messages")
        .delete()
        .eq("channel_id", channelId)
        .lt("created_at", expirationDate);

      const { data } = await playerSupabase
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
    const channel = playerSupabase
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
      playerSupabase.removeChannel(channel);
      clearInterval(pollTimer);
    };
  }, [joined, channelId]);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current && shouldFollowLatestMessage.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleMessagesScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    shouldFollowLatestMessage.current =
      element.scrollHeight - element.scrollTop - element.clientHeight < 48;
  };

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
    if (inputRef.current) inputRef.current.style.height = "48px";
    setShowEmoji(false);
    shouldFollowLatestMessage.current = true;
    if (soundEnabled) {
      const audio = new Audio("/sounds/player-chat-message.mp3");
      audio.volume = 0.65;
      void audio.play().catch((error) => console.warn("Could not play chat message sound", error));
    }
    const optimisticMsg: ChatMessage = {
      id: "optimistic-" + Date.now(),
      nome,
      cidade: chatCity,
      message: msg,
      created_at: new Date().toISOString(),
      avatar_url: avatarUrl,
    };
    setMessages(prev => [...prev, optimisticMsg].slice(-100));
    const messagePayload = {
      channel_id: channelId,
      nome,
      cidade: chatCity,
      message: msg,
      avatar_url: avatarUrl,
    };
    const { error: insertError } = await playerSupabase.from("player_chat_messages").insert(messagePayload);
    // Keep chat working against a database before the additive avatar migration is applied.
    if (insertError && /avatar_url|column/i.test(insertError.message)) {
      await playerSupabase.from("player_chat_messages").insert({
        channel_id: channelId,
        nome,
        cidade: chatCity,
        message: msg,
      });
    }
    const expirationDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await playerSupabase
      .from("player_chat_messages")
      .delete()
      .eq("channel_id", channelId)
      .lt("created_at", expirationDate);

    const { data: allMsgs } = await playerSupabase
      .from("player_chat_messages")
      .select("id")
      .eq("channel_id", channelId)
      .gte("created_at", expirationDate)
      .order("created_at", { ascending: true });
    if (allMsgs && allMsgs.length > 100) {
      const idsToDelete = allMsgs.slice(0, allMsgs.length - 100).map((m) => m.id);
      await playerSupabase.from("player_chat_messages").delete().in("id", idsToDelete);
    }
  }, [input, channelId, nome, chatCity, soundEnabled, avatarUrl]);

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
    <div className="fixed inset-0 z-[9999] flex items-end justify-end p-8 pointer-events-none animate-in fade-in duration-300">
      <div
        className="relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pointer-events-none"
        style={{ width: sideBySide ? "min(360px, calc((100vw - 104px) / 2))" : "360px", height: "clamp(280px, calc(100vh - 250px), 620px)", marginBottom: "calc(6vh + 35px)", marginRight: "20px" }}
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowChatSettings((open) => !open)}
              className="w-8 h-8 rounded-full flex items-center justify-center text-white/65 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Configurações do chat"
              aria-expanded={showChatSettings}
            >
              <Settings2 size={15} />
            </button>
            <PlayerBackButton
              onClick={onClose}
              className="w-8 h-8 focus-visible:ring-offset-2"
              iconSize={14}
              aria-label="Voltar"
            />
          </div>
        </div>

        {showChatSettings && (
          <div
            className="absolute top-12 right-0 z-30 w-[min(320px,calc(100vw-64px))] max-h-[min(520px,65vh)] overflow-y-auto rounded-2xl p-4 text-white"
            style={{ background: "rgba(35,35,38,0.98)", border: "1px solid rgba(255,255,255,0.10)", backdropFilter: "blur(18px)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold">Configurações do chat</h3>
                <p className="text-[10px] text-white/45 mt-0.5">Preferências salvas neste dispositivo</p>
              </div>
              <button type="button" onClick={() => setShowChatSettings(false)} className="w-7 h-7 rounded-full border border-white/15 flex items-center justify-center text-white/65 hover:text-white" aria-label="Fechar configurações">
                <X size={13} />
              </button>
            </div>

            <div className="mb-4">
              <p className="text-[10px] uppercase tracking-wider text-white/45 font-bold mb-2">Avatar nas mensagens</p>
              <div className="grid grid-cols-5 gap-2">
                {[
                  ...(googleAvatarUrl ? [{ url: googleAvatarUrl, label: "Foto do Google" }] : []),
                  { url: "/avatars/usr-default.png", label: "Avatar padrão" },
                  ...CHAT_AVATARS.map((url, index) => ({ url, label: `Avatar ${index + 1}` })),
                ].map(({ url, label }) => (
                  <button
                    key={`${label}-${url}`}
                    type="button"
                    onClick={() => saveChatPreferences({ avatarUrl: url })}
                    className="relative w-10 h-10 rounded-full overflow-hidden border-2 transition-colors"
                    style={{ borderColor: avatarUrl === url ? "#fff" : "rgba(255,255,255,0.12)" }}
                    aria-label={label}
                    title={label}
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    {avatarUrl === url && <Check size={12} className="absolute right-0 bottom-0 rounded-full bg-white text-black p-0.5" />}
                  </button>
                ))}
              </div>
            </div>

            <label className="block mb-4">
              <span className="text-[10px] uppercase tracking-wider text-white/45 font-bold">Bairro</span>
              <input
                value={neighborhood}
                onChange={(event) => saveChatPreferences({ neighborhood: event.target.value })}
                placeholder="Seu bairro"
                className="mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/30 outline-none"
                style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)" }}
              />
              <span className="block mt-1 text-[10px] text-white/35">Local exibido: {[neighborhood.trim(), cidade.trim()].filter(Boolean).join(", ") || "não informado"}</span>
            </label>

            <button
              type="button"
              onClick={() => saveChatPreferences({ soundEnabled: !soundEnabled })}
              className="w-full flex items-center justify-between rounded-xl px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <span className="flex items-center gap-2 text-xs font-medium">{soundEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />} Som ao enviar</span>
              <span className={`relative w-9 h-5 rounded-full transition-colors ${soundEnabled ? "bg-white" : "bg-white/20"}`}>
                <span className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform ${soundEnabled ? "translate-x-[18px] bg-neutral-800" : "translate-x-0.5 bg-white"}`} />
              </span>
            </button>
          </div>
        )}

        {/* Messages */}
        <div
          ref={scrollRef}
          onScroll={handleMessagesScroll}
          className="flex-1 min-h-0 overflow-y-auto px-1 scrollbar-hide pb-4"
          style={{ maxHeight: "min(500px, calc(100vh - 390px))" }}
        >
          <div className="min-h-full flex flex-col justify-end gap-2.5">
            {messages.length === 0 && (
              <div className="flex-1 flex items-center justify-center text-center px-4">
                <span className="text-[12px] text-white/40 italic">Seja o primeiro a mandar uma mensagem</span>
              </div>
            )}
            {messages.map((msg) => {
              const isMe = msg.nome === nome && (msg.cidade === cidade || msg.cidade === chatCity);
              return (
                <div key={msg.id} className="flex flex-col gap-1.5 animate-in slide-in-from-bottom-2 duration-300">
                <div 
                  className="rounded-[24px] px-4 py-3 flex items-start gap-3"
                  style={{
                    background: "rgba(35,35,38,0.85)",
                    backdropFilter: "blur(12px)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    boxShadow: "none"
                  }}
                >
                  <div className="flex items-start gap-3 flex-1">
                    {(msg.avatar_url || (isMe ? avatarUrl : null)) ? (
                      <img
                        src={msg.avatar_url || (isMe ? avatarUrl || undefined : undefined)}
                        alt=""
                        onError={(event) => { event.currentTarget.src = "/avatars/usr-default.png"; }}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0 mt-0.5"
                      />
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
        <div className="mt-2 px-1 py-1 flex items-end gap-2">
          <div 
            className="flex-1 flex items-center gap-2 rounded-[20px] px-3 py-2"
            style={{
              background: "rgba(255,255,255,0.10)",
              backdropFilter: "blur(16px)",
              border: "1px solid rgba(255,255,255,0.10)",
              boxShadow: "none"
            }}
          >
            <button onClick={() => setShowEmoji(!showEmoji)} className={`w-7 h-7 shrink-0 self-center flex items-center justify-center transition-colors ${showEmoji ? "text-white" : "text-white/40 hover:text-white"}`}>
              <Smile size={18} />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.currentTarget.style.height = "auto";
                e.currentTarget.style.height = `${Math.min(Math.max(e.currentTarget.scrollHeight, 48), 144)}px`;
              }}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Participar da conversa..."
              className="flex-1 min-w-0 min-h-12 max-h-36 resize-none overflow-y-auto bg-transparent border rounded-lg shadow-none appearance-none px-2.5 py-1.5 text-white text-[13px] leading-5 placeholder:text-white/35 focus:outline-none focus:ring-0"
              style={{ height: "48px", border: "1px solid rgba(255,255,255,0.22)", borderRadius: "8px", outline: "none", boxShadow: "none" }}
            />
            <button onClick={handleSend} disabled={!input.trim()} className="w-7 h-7 shrink-0 self-center flex items-center justify-center text-white/40 hover:text-white disabled:opacity-20 transition-all">
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
