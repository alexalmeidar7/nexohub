import { useState, useEffect, useRef } from "react";
import { Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface AdminMessage {
  id: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

export default function MessageNotification() {
  const { user } = useAuth();
  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [hovering, setHovering] = useState(false);
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
          className="absolute right-0 top-full mt-2 w-72 rounded-xl shadow-2xl overflow-hidden animate-fade-in z-50"
          style={{ backgroundColor: "#0d0446", border: "1px solid rgba(255,255,255,0.1)" }}
          onMouseEnter={() => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }}
          onMouseLeave={handleMouseLeave}
        >
          <div className="px-4 py-2 border-b border-white/10">
            <p className="text-white text-xs font-bold">Mensagens</p>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-white/50 text-[11px] px-4 py-6 text-center">Nenhuma mensagem.</p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className="px-4 py-3 border-b border-white/5 hover:bg-white/5 transition-colors"
                >
                  <p className="text-white text-[11px] font-semibold truncate">{msg.subject}</p>
                  <p className="text-white/60 text-[10px] line-clamp-2 mt-0.5">{msg.message}</p>
                  <p className="text-white/30 text-[9px] mt-1">
                    {new Date(msg.created_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
