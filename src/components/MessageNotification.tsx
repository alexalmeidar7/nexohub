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
        {
          event: "INSERT",
          schema: "public",
          table: "admin_messages",
        },
        (payload) => {
          const msg = payload.new as any;
          if (msg.recipient_id === user.id || msg.is_broadcast) {
            setMessages((prev) => [msg as AdminMessage, ...prev].slice(0, 20));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
    supabase
      .from("admin_messages")
      .delete()
      .eq("id", msgId)
      .then(() => {
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
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
        style={{
          background: "rgba(255,255,255,0.12)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <Mail size={16} className="text-white" />
      </div>

      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full text-[9px] font-bold flex items-center justify-center animate-scale-in ring-2 ring-black/40"
          style={{ background: "linear-gradient(135deg, #960101, #be0101)", color: "#ffffff", boxShadow: "0 0 10px rgba(190,1,1,0.5)" }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}

      {hovering && (
        <div
          className="absolute right-0 top-full mt-2 w-[340px] rounded-2xl overflow-hidden animate-fade-in z-50"
          style={{
            background: "rgba(0, 0, 0, 0.85)",
            backdropFilter: "blur(40px) saturate(1.6)",
            WebkitBackdropFilter: "blur(40px) saturate(1.6)",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.03) inset",
          }}
          onMouseEnter={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <Bell size={13} style={{ color: "#be0101" }} />
              <span className="text-[11px] font-semibold text-white/90 tracking-wide uppercase">Notificações</span>
            </div>
            {unreadCount > 0 && (
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: "rgba(190,1,1,0.2)", color: "#be0101" }}
              >
                {unreadCount} nova{unreadCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 px-4 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <button
              onClick={() => setTab("novas")}
              className="text-[10px] font-semibold px-4 py-1.5 rounded-full transition-all duration-200"
              style={{
                background: tab === "novas" ? "linear-gradient(135deg, #960101, #be0101)" : "rgba(255,255,255,0.06)",
                color: tab === "novas" ? "#ffffff" : "rgba(255,255,255,0.5)",
                boxShadow: tab === "novas" ? "0 2px 12px rgba(190,1,1,0.3)" : "none",
              }}
            >
              Novas {unreadCount > 0 && `(${unreadCount})`}
            </button>
            <button
              onClick={() => setTab("lidas")}
              className="text-[10px] font-semibold px-4 py-1.5 rounded-full transition-all duration-200"
              style={{
                background: tab === "lidas" ? "linear-gradient(135deg, #960101, #be0101)" : "rgba(255,255,255,0.06)",
                color: tab === "lidas" ? "#ffffff" : "rgba(255,255,255,0.5)",
                boxShadow: tab === "lidas" ? "0 2px 12px rgba(190,1,1,0.3)" : "none",
              }}
            >
              Lidas
            </button>
          </div>

          {/* Message list */}
          <div className="max-h-[300px] overflow-y-auto widget-scroll">
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <Mail size={28} className="text-white/15" />
                <p className="text-[11px] text-white/30">
                  {tab === "novas" ? "Nenhuma mensagem nova" : "Nenhuma mensagem lida"}
                </p>
              </div>
            ) : (
              filteredMessages.map((msg, idx) => (
                <Collapsible
                  key={msg.id}
                  open={openMsgId === msg.id}
                  onOpenChange={(open) => {
                    if (open) {
                      setOpenMsgId(msg.id);
                    } else {
                      if (!msg.is_read) {
                        markAsRead(msg.id);
                      } else {
                        setOpenMsgId(null);
                      }
                    }
                  }}
                >
                  <div
                    className="px-4 py-3 transition-colors"
                    style={{
                      borderBottom: idx < filteredMessages.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
                      background: openMsgId === msg.id ? "rgba(190,1,1,0.08)" : "transparent",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      {/* Indicator dot */}
                      <div className="mt-1.5 shrink-0">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{
                            background: !msg.is_read ? "#be0101" : "rgba(255,255,255,0.15)",
                            boxShadow: !msg.is_read ? "0 0 8px rgba(190,1,1,0.5)" : "none",
                          }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-bold truncate" style={{ color: !msg.is_read ? "#be0101" : "rgba(255,255,255,0.9)" }}>{msg.subject}</p>
                          <div className="flex items-center gap-1 shrink-0">
                            <Clock size={9} className="text-white/30" />
                            <span className="text-[9px] text-white/35">{formatDate(msg.created_at)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5">
                          <CollapsibleTrigger asChild>
                            <button
                              className="text-[9px] font-semibold px-3 py-1 rounded-full transition-all duration-200 flex items-center gap-1"
                              style={{
                                background: openMsgId === msg.id ? "rgba(255,255,255,0.12)" : "rgba(190,1,1,0.15)",
                                color: openMsgId === msg.id ? "#ffffff" : "#be0101",
                              }}
                            >
                              {openMsgId === msg.id ? "Fechar" : "Ler"}
                              <ChevronRight
                                size={10}
                                className="transition-transform duration-200"
                                style={{ transform: openMsgId === msg.id ? "rotate(90deg)" : "rotate(0deg)" }}
                              />
                            </button>
                          </CollapsibleTrigger>
                          {tab === "lidas" && (
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}
                              className="p-1 rounded-full transition-all duration-200 hover:bg-red-500/20"
                              title="Excluir mensagem"
                            >
                              <Trash2 size={11} className="text-red-400/60 hover:text-red-400" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                    <CollapsibleContent className="mt-2.5 ml-5">
                      <div
                        className="text-[11px] leading-relaxed rounded-xl px-3.5 py-2.5"
                        style={{
                          color: "rgba(255,255,255,0.8)",
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {msg.message}
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
