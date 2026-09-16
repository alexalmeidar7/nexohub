import { useState, useEffect, useRef } from "react";
import { Mail, Trash2, Bell, ChevronRight, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
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

    const acc = (user?.id && findClientAccountById(user.id)) || (user?.email && findClientAccountByEmail(user.email));
    const rawUid = acc?.parentUserId || acc?.id || user?.id || null;
    const targetUid = rawUid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawUid) ? rawUid : null;

    const fetchMessages = async () => {
      let query = supabase
        .from("admin_messages")
        .select("id, subject, message, is_read, created_at");

      if (targetUid) {
        query = query.or(`recipient_id.eq.${targetUid},is_broadcast.eq.true`);
      } else {
        query = query.eq("is_broadcast", true);
      }

      const { data } = await query
        .order("created_at", { ascending: false })
        .limit(20);
      if (data) setMessages(data as AdminMessage[]);
    };

    fetchMessages();

    const channel = supabase
      .channel(`user-messages-${targetUid || user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_messages" },
        (payload) => {
          const msg = payload.new as any;
          if ((targetUid && msg.recipient_id === targetUid) || msg.is_broadcast) {
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
      className="relative flex items-center justify-center shrink-0"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="w-9 h-9 shrink-0 rounded-full bg-[#0055ff] hover:bg-[#0042cc] text-white flex items-center justify-center cursor-pointer transition-all shadow-[0_4px_14px_rgba(0,85,255,0.25)] hover:scale-105 active:scale-95"
        title="Central de Mensagens"
      >
        <Mail size={16} className="text-white" />
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
          className="absolute top-full right-0 mt-6 w-[360px] rounded-3xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-50 before:content-[''] before:absolute before:-top-6 before:left-0 before:right-0 before:h-6"
          style={{
            background: "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.9)",
            boxShadow: "0 20px 50px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)",
          }}
          onMouseEnter={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
          onMouseLeave={handleMouseLeave}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 bg-slate-50/80 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#0055ff]/10 text-[#0055ff]">
                <Bell size={14} />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="text-xs font-bold text-slate-900">
                  Mensagens
                </span>
                <span className="text-[10px] text-slate-400 font-medium">
                  Central de notificações
                </span>
              </div>
            </div>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#0055ff] text-white shadow-sm">
                {unreadCount} nova{unreadCount > 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 px-4 py-2.5 bg-white border-b border-slate-100">
            {(["novas", "lidas"] as const).map((t) => {
              const active = tab === t;
              return (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`text-[10px] font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full transition-all ${
                    active
                      ? "bg-[#0055ff] text-white shadow-[0_4px_12px_rgba(0,85,255,0.25)]"
                      : "bg-slate-100/70 text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {t === "novas" ? `Novas${unreadCount > 0 ? ` (${unreadCount})` : ""}` : "Lidas"}
                </button>
              );
            })}
          </div>

          {/* Message list */}
          <div className="max-h-[320px] overflow-y-auto widget-scroll bg-white">
            {filteredMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <div className="w-12 h-12 rounded-full flex items-center justify-center bg-[#0055ff]/10 text-[#0055ff]">
                  <Mail size={20} />
                </div>
                <p className="text-xs font-semibold text-slate-400">
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
                      className={`px-4 py-3 transition-colors ${
                        idx < filteredMessages.length - 1 ? "border-b border-slate-100" : ""
                      } ${isOpen ? "bg-slate-50/70" : "hover:bg-slate-50/40"}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1.5 shrink-0">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              !msg.is_read ? "bg-[#0055ff] ring-2 ring-[#0055ff]/30" : "bg-slate-300"
                            }`}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p
                              className={`text-xs truncate ${
                                !msg.is_read ? "font-bold text-slate-900" : "font-medium text-slate-500"
                              }`}
                            >
                              {msg.subject}
                            </p>
                            <div className="flex items-center gap-1 shrink-0">
                              <Clock size={9} className="text-slate-400" />
                              <span className="text-[10px] font-medium text-slate-400">
                                {formatDate(msg.created_at)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 mt-2">
                            <CollapsibleTrigger asChild>
                              <button
                                className={`text-[9px] font-bold uppercase tracking-wider px-3 py-1 rounded-full transition-all flex items-center gap-1 ${
                                  isOpen ? "bg-slate-800 text-white" : "bg-[#0055ff] text-white hover:bg-[#0042cc] shadow-sm"
                                }`}
                              >
                                {isOpen ? "Fechar" : "Ler"}
                                <ChevronRight
                                  size={10}
                                  className={`transition-transform duration-200 ${isOpen ? "rotate-90" : "rotate-0"}`}
                                />
                              </button>
                            </CollapsibleTrigger>
                            {tab === "lidas" && (
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}
                                className="p-1.5 rounded-full transition-all text-slate-400 hover:text-red-600 hover:bg-red-50"
                                title="Excluir mensagem"
                              >
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                      <CollapsibleContent className="mt-2.5 ml-5">
                        <div className="text-xs leading-relaxed rounded-2xl px-3.5 py-2.5 bg-white border border-slate-200/80 text-slate-700 shadow-sm">
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
