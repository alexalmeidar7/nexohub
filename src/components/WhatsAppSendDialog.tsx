import { useState, useEffect } from "react";
import { X, Loader2, Send, Plus, Trash2, Copy, MessageCircle, Phone } from "lucide-react";
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
    participantes: { nome: string; categoria?: string; cargo?: string; instagram?: string; whatsapp?: string }[];
    conteudoTexto: string;
    _expressFormatted?: string;
  };
}

export default function WhatsAppSendDialog({ open, onClose, roteiroData }: WhatsAppSendDialogProps) {
  const [formattedText, setFormattedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [novoWhatsapp, setNovoWhatsapp] = useState("");

  useEffect(() => {
    if (open) {
      const existing = roteiroData.participantes
        .filter(p => p.whatsapp?.trim())
        .map(p => ({ nome: p.nome, whatsapp: p.whatsapp!.trim() }));
      setContatos(existing);
      if (roteiroData._expressFormatted) {
        setFormattedText(roteiroData._expressFormatted);
        setLoading(false);
      } else {
        setFormattedText("");
        formatWithAI();
      }
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
      if (data?.error) { toast.error(data.error); return; }
      setFormattedText(data?.text || "");
    } catch (err: any) {
      console.error("Erro ao formatar:", err);
      toast.error("Erro ao formatar roteiro para WhatsApp");
      setFormattedText(`*${roteiroData.titulo || "Roteiro"}*\n${roteiroData.programaNome} · ${roteiroData.estudio}\n${roteiroData.data} ${roteiroData.horario}\n\n${roteiroData.conteudoTexto.substring(0, 3000)}`);
    } finally {
      setLoading(false);
    }
  };

  const addContato = () => {
    if (!novoNome.trim() && !novoWhatsapp.trim()) return;
    const phone = novoWhatsapp.trim().replace(/\D/g, "");
    if (!phone) { toast.error("Insira um número válido"); return; }
    setContatos(prev => [...prev, { nome: novoNome.trim() || "Sem nome", whatsapp: phone }]);
    setNovoNome("");
    setNovoWhatsapp("");
  };

  const removeContato = (idx: number) => setContatos(prev => prev.filter((_, i) => i !== idx));

  const copiarMensagem = async () => {
    if (!formattedText.trim()) { toast.error("Sem texto para copiar"); return; }
    try {
      await navigator.clipboard.writeText(formattedText);
      toast.success("Mensagem copiada!");
    } catch { toast.error("Não foi possível copiar"); }
  };

  const enviar = async () => {
    if (!formattedText.trim()) { toast.error("Aguarde a formatação"); return; }
    if (contatos.length === 0) { toast.error("Adicione pelo menos um contato"); return; }
    try { await navigator.clipboard.writeText(formattedText); } catch { /* ok */ }
    const text = encodeURIComponent(formattedText);
    contatos.forEach((c, i) => {
      const phone = c.whatsapp.startsWith("55") ? c.whatsapp : `55${c.whatsapp}`;
      setTimeout(() => { window.open(`whatsapp://send?phone=${phone}&text=${text}`, "_blank"); }, i * 700);
    });
    toast.success(`Abrindo WhatsApp para ${contatos.length} contato(s)`);
    setTimeout(onClose, 1600);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div
        className="relative rounded-2xl shadow-2xl flex flex-col w-full max-w-md max-h-[85vh] overflow-hidden animate-scale-in"
        style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header with WhatsApp green stripe */}
        <div className="relative px-5 py-4" style={{ background: "linear-gradient(135deg, #25d366, #128c7e)" }}>
          <button onClick={onClose} className="absolute top-3 right-3 p-1 rounded-full hover:bg-white/20 transition" style={{ color: "#fff" }}>
            <X size={16} />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "rgba(255,255,255,0.2)" }}>
              <MessageCircle size={18} style={{ color: "#fff" }} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Enviar por WhatsApp</h3>
              <p className="text-[10px] text-white/70">{roteiroData.programaNome} · {roteiroData.data}</p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Message preview */}
          <div>
            <label className="text-[10px] font-bold uppercase mb-1.5 flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              📝 Mensagem
            </label>
            {loading ? (
              <div className="flex items-center gap-2 py-8 justify-center rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 95%, #25d366)" }}>
                <Loader2 size={16} className="animate-spin" style={{ color: "#25d366" }} />
                <span className="text-[11px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>Formatando...</span>
              </div>
            ) : (
              <div className="relative">
                <textarea
                  value={formattedText}
                  onChange={e => setFormattedText(e.target.value)}
                  rows={10}
                  className="w-full rounded-xl px-3.5 py-3 text-[11px] outline-none resize-y leading-relaxed"
                  style={{
                    backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 92%, #25d366)",
                    border: "1px solid color-mix(in srgb, #25d366 20%, transparent)",
                    color: "var(--layout-page-text, #1a1a1a)",
                    fontFamily: "'SF Mono', 'Fira Code', monospace",
                  }}
                />
                {/* WhatsApp bubble tail decoration */}
                <div className="absolute -top-1 left-4 w-3 h-3 rotate-45" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 92%, #25d366)" }} />
              </div>
            )}
          </div>

          {/* Contacts section */}
          <div>
            <label className="text-[10px] font-bold uppercase mb-1.5 flex items-center gap-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
              <Phone size={10} /> Destinatários
              {contatos.length > 0 && (
                <span className="ml-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ backgroundColor: "color-mix(in srgb, #25d366 15%, transparent)", color: "#25d366" }}>
                  {contatos.length}
                </span>
              )}
            </label>

            {contatos.length > 0 && (
              <div className="space-y-1 mb-2.5">
                {contatos.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg group" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 95%, var(--layout-border-color, #333))" }}>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style={{ backgroundColor: "color-mix(in srgb, #25d366 15%, transparent)", color: "#25d366" }}>
                      {c.nome.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{c.nome}</p>
                      <p className="text-[9px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 45%, transparent)" }}>{c.whatsapp}</p>
                    </div>
                    <button onClick={() => removeContato(i)} className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 transition" style={{ color: "#ef4444" }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Add contact row */}
            <div className="flex gap-1.5 items-center">
              <input
                value={novoNome}
                onChange={e => setNovoNome(e.target.value)}
                placeholder="Nome"
                className="flex-1 px-3 py-2 rounded-lg text-[11px] outline-none"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 95%, var(--layout-border-color, #333))", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
              />
              <input
                value={novoWhatsapp}
                onChange={e => {
                  const digits = e.target.value.replace(/\D/g, "").slice(0, 11);
                  let masked = digits;
                  if (digits.length > 7) masked = `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
                  else if (digits.length > 2) masked = `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
                  else if (digits.length > 0) masked = `(${digits}`;
                  setNovoWhatsapp(masked);
                }}
                placeholder="(XX) XXXXX-XXXX"
                className="flex-1 px-3 py-2 rounded-lg text-[11px] outline-none"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 95%, var(--layout-border-color, #333))", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
                onKeyDown={e => { if (e.key === "Enter") addContato(); }}
              />
              <button
                onClick={addContato}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:opacity-80 transition shrink-0"
                style={{ backgroundColor: "color-mix(in srgb, #25d366 12%, transparent)", color: "#25d366" }}
              >
                <Plus size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center justify-between gap-2" style={{ borderTop: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 12%, transparent)" }}>
          <button onClick={onClose} className="px-3 py-2 rounded-lg text-[11px] font-semibold hover:opacity-70 transition" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
            Cancelar
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={copiarMensagem}
              disabled={loading || !formattedText.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[11px] font-bold hover:opacity-90 transition disabled:opacity-30"
              style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 90%, var(--layout-border-color, #333))", color: "var(--layout-page-text, #1a1a1a)" }}
            >
              <Copy size={12} /> Copiar
            </button>
            <button
              onClick={enviar}
              disabled={loading || !formattedText.trim() || contatos.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[11px] font-bold text-white hover:opacity-90 transition disabled:opacity-30"
              style={{ backgroundColor: "#25d366" }}
            >
              <Send size={12} /> Enviar ({contatos.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
