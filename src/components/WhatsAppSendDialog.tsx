import { useState, useEffect } from "react";
import { X, Loader2, Send, Plus, Trash2, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Contato {
  nome: string;
  whatsapp: string;
}

interface WhatsAppSendDialogProps {
  open: boolean;
  onClose: () => void;
  roteiroData: {
    titulo: string;
    programaNome: string;
    estudio: string;
    data: string;
    horario: string;
    participantes: { nome: string; categoria: string; cargo: string; instagram: string; whatsapp?: string }[];
    conteudoTexto: string;
  };
}

export default function WhatsAppSendDialog({ open, onClose, roteiroData }: WhatsAppSendDialogProps) {
  const [formattedText, setFormattedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [novoWhatsapp, setNovoWhatsapp] = useState("");

  // Pre-fill contacts from participantes that have whatsapp
  useEffect(() => {
    if (open) {
      const existing = roteiroData.participantes
        .filter(p => p.whatsapp?.trim())
        .map(p => ({ nome: p.nome, whatsapp: p.whatsapp!.trim() }));
      setContatos(existing);
      setFormattedText("");
      formatWithAI();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const formatWithAI = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("format-whatsapp", {
        body: {
          titulo: roteiroData.titulo,
          programaNome: roteiroData.programaNome,
          estudio: roteiroData.estudio,
          data: roteiroData.data,
          horario: roteiroData.horario,
          participantes: roteiroData.participantes,
          conteudoTexto: roteiroData.conteudoTexto,
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast.error(data.error);
        return;
      }
      setFormattedText(data?.text || "");
    } catch (err: any) {
      console.error("Erro ao formatar:", err);
      toast.error("Erro ao formatar roteiro para WhatsApp");
      // Fallback: use raw text
      setFormattedText(`*${roteiroData.titulo || "Roteiro"}*\n${roteiroData.programaNome} · ${roteiroData.estudio}\n${roteiroData.data} ${roteiroData.horario}\n\n${roteiroData.conteudoTexto.substring(0, 3000)}`);
    } finally {
      setLoading(false);
    }
  };

  const addContato = () => {
    if (!novoNome.trim() && !novoWhatsapp.trim()) return;
    const phone = novoWhatsapp.trim().replace(/\D/g, "");
    if (!phone) {
      toast.error("Insira um número de WhatsApp válido");
      return;
    }
    setContatos(prev => [...prev, { nome: novoNome.trim() || "Sem nome", whatsapp: phone }]);
    setNovoNome("");
    setNovoWhatsapp("");
  };

  const removeContato = (idx: number) => {
    setContatos(prev => prev.filter((_, i) => i !== idx));
  };

  const enviar = () => {
    if (!formattedText.trim()) {
      toast.error("Aguarde a formatação do texto");
      return;
    }
    if (contatos.length === 0) {
      toast.error("Adicione pelo menos um contato");
      return;
    }

    const text = encodeURIComponent(formattedText);

    contatos.forEach((c, i) => {
      const phone = c.whatsapp.startsWith("55") ? c.whatsapp : `55${c.whatsapp}`;
      setTimeout(() => {
        window.open(`https://web.whatsapp.com/send?phone=${phone}&text=${text}`, "_blank");
      }, i * 600); // stagger opens to avoid popup blocking
    });

    toast.success(`Abrindo WhatsApp para ${contatos.length} contato(s)...`);
    setTimeout(onClose, 1500);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center" style={{ backgroundColor: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        className="relative rounded-2xl shadow-2xl flex flex-col w-full max-w-lg max-h-[90vh] overflow-hidden"
        style={{ backgroundColor: "#0d0446" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <div className="flex items-center gap-2">
            <MessageSquare size={16} style={{ color: "#25d366" }} />
            <h3 className="text-sm font-bold text-white">Enviar Roteiro por WhatsApp</h3>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white transition"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Formatted text preview */}
          <div>
            <label className="text-[11px] font-bold uppercase mb-1.5 block" style={{ color: "rgba(255,255,255,0.5)" }}>
              Texto formatado (preview)
            </label>
            {loading ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <Loader2 size={18} className="animate-spin" style={{ color: "#25d366" }} />
                <span className="text-xs text-white/70">Formatando com IA...</span>
              </div>
            ) : (
              <textarea
                value={formattedText}
                onChange={e => setFormattedText(e.target.value)}
                rows={10}
                className="w-full rounded-lg px-3 py-2 text-xs outline-none resize-y"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  border: "1px solid rgba(255,255,255,0.1)",
                  color: "#fff",
                  fontFamily: "monospace",
                  lineHeight: 1.6,
                }}
              />
            )}
          </div>

          {/* Contacts */}
          <div>
            <label className="text-[11px] font-bold uppercase mb-1.5 block" style={{ color: "rgba(255,255,255,0.5)" }}>
              Destinatários
            </label>

            {/* Existing contacts */}
            {contatos.length > 0 && (
              <div className="space-y-1 mb-3">
                {contatos.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "rgba(255,255,255,0.06)" }}>
                    <span className="text-xs text-white flex-1">{c.nome} <span className="text-white/40">· {c.whatsapp}</span></span>
                    <button onClick={() => removeContato(i)} className="text-white/30 hover:text-red-400 transition"><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}

            {/* Add contact */}
            <div className="flex gap-2">
              <input
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                placeholder="Nome"
                className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
              />
              <input
                value={novoWhatsapp}
                onChange={e => setNovoWhatsapp(e.target.value)}
                placeholder="Nº WhatsApp"
                className="flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                style={{ backgroundColor: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
                onKeyDown={e => { if (e.key === "Enter") addContato(); }}
              />
              <button
                onClick={addContato}
                className="px-3 py-2 rounded-lg text-xs font-bold text-white hover:opacity-80 transition"
                style={{ backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex items-center justify-end gap-2" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-xs font-bold text-white/60 hover:text-white transition">
            cancelar
          </button>
          <button
            onClick={enviar}
            disabled={loading || !formattedText.trim() || contatos.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-bold text-white hover:opacity-90 transition disabled:opacity-40"
            style={{ backgroundColor: "#25d366" }}
          >
            <Send size={13} />
            enviar ({contatos.length})
          </button>
        </div>
      </div>
    </div>
  );
}
