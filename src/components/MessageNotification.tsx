import { useState, useEffect, useRef } from "react";
import { Mail, ChevronDown } from "lucide-react";
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
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = messages.filter((m) => !m.is_read).length;

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

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setHovering(true);
    // Mark unread as read
    if (user && unreadCount > 0) {
      const unreadIds = messages.filter((m) => !m.is_read).map((m) => m.id);
      supabase
        .from("admin_messages")
        .update({ is_read: true })
        .in("id", unreadIds)
        .then(() => {
          setMessages((prev) => prev.map((m) => ({ ...m, is_read: true })));
        });
    }
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setHovering(false), 300);
  };

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
        style={{ backgroundColor: "#0d0446" }}
      >
        <Mail size={16} className="text-white" />
      </div>

      {unreadCount > 0 && (
        <span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center animate-scale-in"
          style={{ backgroundColor: "#ef4444", color: "#ffffff" }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}

      {hovering && (
        <div
          className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-2xl overflow-hidden animate-fade-in z-50"
          style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.12)" }}
          onMouseEnter={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
          onMouseLeave={handleMouseLeave}
        >
          <div className="px-4 py-2 border-b" style={{ borderColor: "rgba(13,4,70,0.1)", backgroundColor: "#0d0446" }}>
            <p className="text-white text-xs font-bold">Mensagens</p>
          </div>
          <div className="max-h-[280px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#268ffa #f0f0f0" }}>
            {messages.length === 0 ? (
              <p className="text-[11px] px-4 py-6 text-center" style={{ color: "rgba(13,4,70,0.4)" }}>Nenhuma mensagem.</p>
            ) : (
              messages.map((msg) => (
                <Collapsible
                  key={msg.id}
                  open={openMsgId === msg.id}
                  onOpenChange={(open) => setOpenMsgId(open ? msg.id : null)}
                >
                  <div className="px-4 py-3 border-b" style={{ borderColor: "rgba(13,4,70,0.06)" }}>
                    <p className="text-[11px] font-bold truncate" style={{ color: "#268ffa" }}>{msg.subject}</p>
                    <p className="text-[9px] mt-0.5" style={{ color: "rgba(13,4,70,0.5)" }}>
                      {new Date(msg.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <CollapsibleTrigger asChild>
                      <button
                        className="mt-1.5 text-[10px] font-semibold px-3 py-1 rounded-full transition-colors"
                        style={{ backgroundColor: "#0d0446", color: "#ffffff" }}
                      >
                        {openMsgId === msg.id ? "Fechar" : "Abrir mensagem"}
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="mt-2">
                      <p className="text-[11px] leading-relaxed" style={{ color: "#0d0446" }}>{msg.message}</p>
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
