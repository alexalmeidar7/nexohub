import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import AdminSkeleton from "@/components/skeletons/AdminSkeleton";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminLayout from "./AdminLayout";
import { usePageTitle } from "@/hooks/usePageTitle";

interface ClientOption {
  user_id: string;
  nome: string;
}

interface MessageRow {
  id: string;
  subject: string;
  message: string;
  is_broadcast: boolean;
  recipient_id: string | null;
  created_at: string;
}

function AdminMessagesContent() {
  const { user } = useAuth();
  const location = useLocation();
  const navState = location.state as { recipientId?: string; recipientNome?: string } | null;
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [recipient, setRecipient] = useState(navState?.recipientId || "all");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [{ data: empresas }, { data: msgs }] = await Promise.all([
      supabase.from("empresa_config").select("user_id, nome"),
      supabase.from("admin_messages").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setClients((empresas || []).map((e: any) => ({ user_id: e.user_id, nome: e.nome || "Sem nome" })));
    setHistory((msgs || []) as MessageRow[]);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Preencha o assunto e a mensagem.");
      return;
    }
    setSending(true);

    if (recipient === "all") {
      // broadcast to all clients
      const rows = clients.map((c) => ({
        sender_id: user!.id,
        recipient_id: c.user_id,
        subject: subject.trim(),
        message: message.trim(),
        is_broadcast: true,
      }));
      if (rows.length === 0) {
        toast.error("Nenhum cliente cadastrado.");
        setSending(false);
        return;
      }
      const { error } = await supabase.from("admin_messages").insert(rows);
      if (error) { toast.error("Erro ao enviar: " + error.message); setSending(false); return; }
    } else {
      const { error } = await supabase.from("admin_messages").insert({
        sender_id: user!.id,
        recipient_id: recipient,
        subject: subject.trim(),
        message: message.trim(),
        is_broadcast: false,
      });
      if (error) { toast.error("Erro ao enviar: " + error.message); setSending(false); return; }
    }

    toast.success("Mensagem enviada com sucesso!");
    setSubject("");
    setMessage("");
    setRecipient("all");
    setSending(false);
    loadData();
  };

  const getRecipientName = (row: MessageRow) => {
    if (row.is_broadcast) return "Todos os clientes";
    const c = clients.find((cl) => cl.user_id === row.recipient_id);
    return c?.nome || "Cliente removido";
  };

  if (loading) {
    return <AdminSkeleton variant="messages" />;
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Send Form */}
      <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
        <h3 className="text-lg font-semibold" style={{ color: "#0d0446" }}>Nova Mensagem</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block mb-1 font-medium" style={{ fontSize: "12px", color: "#6b7280" }}>Destinatário</label>
            <select
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid #e2e8f0", color: "#0d0446" }}
            >
              <option value="all">📢 Todos os clientes</option>
              {clients.map((c) => (
                <option key={c.user_id} value={c.user_id}>{c.nome}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1 font-medium" style={{ fontSize: "12px", color: "#6b7280" }}>Assunto</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Assunto da mensagem"
              className="w-full rounded-lg px-3 py-2 text-sm outline-none"
              style={{ border: "1px solid #e2e8f0", color: "#0d0446" }}
            />
          </div>
        </div>

        <div>
          <label className="block mb-1 font-medium" style={{ fontSize: "12px", color: "#6b7280" }}>Mensagem</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Escreva sua mensagem..."
            rows={4}
            className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
            style={{ border: "1px solid #e2e8f0", color: "#0d0446" }}
          />
        </div>

        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2 px-5 py-2 font-medium transition-all duration-200 rounded-full text-white"
          style={{ fontSize: "12px", backgroundColor: "#2ec0f6" }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#1da8d8")}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#2ec0f6")}
        >
          {sending ? <Loader2 className="animate-spin" size={14} /> : <Send size={14} />}
          Enviar Mensagem
        </button>
      </div>

      {/* History */}
      <div>
        <h3 className="text-lg font-semibold mb-4" style={{ color: "#0d0446" }}>Histórico de Mensagens</h3>
        {history.length === 0 ? (
          <p style={{ fontSize: "12px", color: "#6b7280" }}>Nenhuma mensagem enviada.</p>
        ) : (
          <div className="space-y-2">
            {history.map((msg) => (
              <div
                key={msg.id}
                className="rounded-xl px-5 py-3 transition-all duration-200"
                style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#2ec0f6")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium" style={{ fontSize: "12px", color: "#0d0446" }}>{msg.subject}</span>
                  <span style={{ fontSize: "10px", color: "#6b7280" }}>
                    {new Date(msg.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
                <p style={{ fontSize: "11px", color: "#374151" }} className="line-clamp-2">{msg.message}</p>
                <span
                  className="inline-block mt-1 px-2 py-0.5 rounded-full"
                  style={{ fontSize: "10px", backgroundColor: msg.is_broadcast ? "#dbeafe" : "#f0fdf4", color: msg.is_broadcast ? "#1e40af" : "#166534" }}
                >
                  {getRecipientName(msg)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminMessages() {
  usePageTitle("Admin Mensagens");
  return (
    <ProtectedRoute requiredRole="admin">
      <AdminLayout title="Mensagens">
        <AdminMessagesContent />
      </AdminLayout>
    </ProtectedRoute>
  );
}
