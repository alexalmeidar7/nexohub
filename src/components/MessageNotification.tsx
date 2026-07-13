import { useState, useEffect, useRef } from "react";
import { Mail, Trash2, Bell, ChevronRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface AdminMessage {
  id: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
  sender_id: string;
}

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const INK = "#002132";

export default function MessageNotification() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [hovering, setHovering] = useState(false);
  const [openMsgId, setOpenMsgId] = useState<string | null>(null);
  const [tab, setTab] = useState<"novas" | "lidas">("novas");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = messages.filter((m) => !m.is_read).length;
  const filteredMessages = tab === "novas"
    ? messages.filter((m) => !m.is_read)
    : messages.filter((m) => m.is_read);

  useEffect(() => {
    if (!user) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("admin_messages")
        .select("id, subject, message, is_read, created_at")
        .or(`recipient_id.eq.${user.id},is_broadcast.eq.true`)
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setMessages(data as AdminMessage[]);
    };

    fetchMessages();

    const channel = supabase
      .channel(`user-messages-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_messages" },
        (payload) => {
          const msg = payload.new as any;
          if (msg.recipient_id === user.id || msg.is_broadcast) {
            setMessages((prev) => [msg as AdminMessage, ...prev].slice(0, 20));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  const markAsRead = (msgId: string) => {
    supabase
      .from("admin_messages")
      .update({ is_read: true })
      .eq("id", msgId)
      .then(() => {
        setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, is_read: true } : m));
        setOpenMsgId(null);
      });
  };

  const deleteMessage = (msgId: string) => {
    supabase.from("admin_messages").delete().eq("id", msgId).then(() => {
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    });
  };

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHovering(true);
  };
  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setHovering(false), 300);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMin / 60);
    const diffDays = Math.floor(diffHrs / 24);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin}min`;
    if (diffHrs < 24) return `${diffHrs}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  return (
    <div
      className="relative flex items-center justify-center"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="nexo-toolbar-btn w-9 h-9 rounded-xl flex items-center justify-center cursor-pointer transition-all"
        style={{ color: INK }}
      >
        <Mail size={18} />
      </div>

      {unreadCount > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[9px] font-black flex items-center justify-center animate-scale-in"
          style={{
            background: CYAN,
            color: "#fff",
            boxShadow: `0 0 0 2px #fff, 0 4px 10px ${CYAN}66`,
          }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}

      {hovering && (
        <div
          className="absolute top-full right-0 mt-3 w-[360px] rounded-3xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50"
          style={{
            background: "#ffffff",
            border: `1px solid ${CYAN}33`,
            boxShadow: `0 20px 50px rgba(0,33,50,0.18), 0 0 0 4px ${CYAN}0f`,
            fontFamily: "Montserrat, sans-serif",
          }}
          onMouseEnter={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4"
            style={{ background: "#D6F4FB" }}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: CYAN }}>
                <Bell size={14} color="#fff" />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: INK }}>
                  Mensagens
                </span>
                <span className="text-[9px] font-semibold uppercase tracking-wider" style={{ color: INK, opacity: 0.5 }}>
                  Central de notificações
                </span>
              </div>
            </div>
            {unreadCount > 0 && (
              <span
                className="text-[9px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider"
                style={{ background: CYAN, color: "#fff" }}
              >
                {unreadCount} nova{unreadCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 px-4 py-3" style={{ background: "#fff", borderBottom: `1px solid ${INK}0d` }}>
            {(["novas", "lidas"] as const).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className="text-[10px] font-black uppercase tracking-wider px-4 py-1.5 rounded-full transition-all"
                  style={{
                    background: active ? CYAN : "transparent",
                    color: active ? "#fff" : `${INK}99`,
                    border: active ? `1px solid ${CYAN}` : `1px solid ${INK}1a`,
                    boxShadow: active ? `0 4px 12px ${CYAN}40` : "none",
                  }}
                >
                  {t === "novas" ? `Novas${unreadCount > 0 ? ` (${unreadCount})` : ""}` : "Lidas"}
                </button>
              );
            })}
          </div>

          {/* Message list */}
          <div className="max-h-[320px] overflow-y-auto widget-scroll" style={{ background: "#fff" }}>
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${CYAN}14` }}>
                  <Mail size={20} style={{ color: CYAN, opacity: 0.7 }} />
                </div>
                <p className="text-[11px] font-semibold" style={{ color: INK, opacity: 0.5 }}>
                  {tab === "novas" ? "Nenhuma mensagem nova" : "Nenhuma mensagem lida"}
                </p>
              </div>
            ) : (
              filteredMessages.map((msg, idx) => {
                const isOpen = openMsgId === msg.id;
                return (
                  <Collapsible
                    key={msg.id}
                    open={isOpen}
                    onOpenChange={(open) => {
                      if (open) setOpenMsgId(msg.id);
                      else if (!msg.is_read) markAsRead(msg.id);
                      else setOpenMsgId(null);
                    }}
                  >
                    <div
                      className="px-4 py-3 transition-colors"
                      style={{
                        borderBottom: idx < filteredMessages.length - 1 ? `1px solid ${INK}0a` : "none",
                        background: isOpen ? "#D6F4FB" : "transparent",
                      }}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1.5 shrink-0">
                          <div
                            className="w-2 h-2 rounded-full"
                            style={{
                              background: !msg.is_read ? CYAN : `${INK}22`,
                              boxShadow: !msg.is_read ? `0 0 0 3px ${CYAN}22` : "none",
                            }}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className="text-[12px] font-black truncate"
                              style={{ color: !msg.is_read ? INK : `${INK}b3` }}
                            >
                              {msg.subject}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              <Clock size={9} style={{ color: `${INK}66` }} />
                              <span className="text-[9px] font-semibold" style={{ color: `${INK}80` }}>
                                {formatDate(msg.created_at)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2">
                            <CollapsibleTrigger asChild>
                              <button
                                className="text-[9px] font-black uppercase tracking-wider px-3 py-1 rounded-full transition-all flex items-center gap-1"
                                style={{
                                  background: isOpen ? INK : CYAN,
                                  color: "#fff",
                                }}
                              >
                                {isOpen ? "Fechar" : "Ler"}
                                <ChevronRight
                                  size={10}
                                  className="transition-transform"
                                  style={{ transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}
                                />
                              </button>
                            </CollapsibleTrigger>
                            {tab === "lidas" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}
                                className="p-1.5 rounded-full transition-all"
                                title="Excluir mensagem"
                                style={{ color: `${INK}66`, background: `${INK}0a` }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "#ff4d4d1a";
                                  e.currentTarget.style.color = "#e63946";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = `${INK}0a`;
                                  e.currentTarget.style.color = `${INK}66`;
                                }}
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <CollapsibleContent className="mt-3 ml-5">
                        <div
                          className="text-[12px] leading-relaxed rounded-2xl px-4 py-3"
                          style={{
                            color: INK,
                            background: "#fff",
                            border: `1px solid ${CYAN}33`,
                            boxShadow: `inset 0 0 0 2px ${CYAN}0d`,
                          }}
                        >
                          {msg.message}
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
