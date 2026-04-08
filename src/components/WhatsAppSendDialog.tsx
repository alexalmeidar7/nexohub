import { useState, useEffect, useRef } from "react";
import { X, Loader2, Send, Plus, Trash2, Copy, MessageCircle, Phone, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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
  const { user } = useAuth();
  const [formattedText, setFormattedText] = useState("");
  const [loading, setLoading] = useState(false);
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [novoNome, setNovoNome] = useState("");
  const [novoWhatsapp, setNovoWhatsapp] = useState("");
  const [searchResults, setSearchResults] = useState<{ nome: string; whatsapp: string; cargo: string }[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

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

  // Search apresentadores
  useEffect(() => {
    if (!novoNome.trim() || !user) { setSearchResults([]); return; }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("apresentadores")
        .select("nome, whatsapp, cargo")
        .eq("user_id", user.id)
        .ilike("nome", `%${novoNome}%`)
        .limit(5);
      if (data && data.length > 0) {
        setSearchResults(data.map(d => ({ nome: d.nome, whatsapp: d.whatsapp || "", cargo: d.cargo || "" })));
        setShowResults(true);
      } else {
        setSearchResults([]);
        setShowResults(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [novoNome, user]);

  // Close dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectFromSearch = (r: { nome: string; whatsapp: string }) => {
    if (contatos.some(c => c.nome === r.nome)) { toast.info("Já adicionado"); return; }
    if (!r.whatsapp.trim()) {
      setNovoNome(r.nome);
      setShowResults(false);
      toast.info("Sem WhatsApp cadastrado, preencha manualmente");
      return;
    }
    setContatos(prev => [...prev, { nome: r.nome, whatsapp: r.whatsapp.replace(/\D/g, "") }]);
    setNovoNome("");
    setNovoWhatsapp("");
    setShowResults(false);
    setSearchResults([]);
  };

  const formatWithAI = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("format-whatsapp", {
        body: {
          titulo: roteiroData.titulo,
          programaNome: roteiroData.programaNome,
          estudio: roteiroData.estudio,
          data: new Date().toLocaleDateString("pt-BR"),
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
      setFormattedText(`*${roteiroData.titulo || "Roteiro"}*\n${roteiroData.programaNome} · ${roteiroData.estudio}\n${new Date().toLocaleDateString("pt-BR")} ${roteiroData.horario}\n\n${roteiroData.conteudoTexto.substring(0, 3000)}`);
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
    setSearchResults([]);
    setShowResults(false);
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

  const inputStyle = {
    backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #fff) 95%, var(--layout-border-color, #333))",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)",
    color: "var(--layout-page-text, #1a1a1a)",
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div
        className="relative rounded-2xl shadow-2xl flex flex-col w-full max-w-md max-h-[85vh] overflow-hidden animate-scale-in"
        style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
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
              <p className="text-[10px] text-white/70">{roteiroData.programaNome} · {new Date().toLocaleDateString("pt-BR")}</p>
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

            {/* Search + Add contact */}
            <div ref={searchRef} className="relative">
              <div className="flex gap-1.5 items-center">
                <div className="relative flex-1">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 35%, transparent)" }} />
                  <input
                    value={novoNome}
                    onChange={e => { setNovoNome(e.target.value); if (e.target.value.trim()) setShowResults(true); }}
                    onFocus={() => { if (searchResults.length > 0) setShowResults(true); }}
                    placeholder="Buscar contato..."
                    className="w-full pl-7 pr-3 py-2 rounded-lg text-[11px] outline-none"
                    style={inputStyle}
                  />
                </div>
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
                  className="w-[130px] shrink-0 px-3 py-2 rounded-lg text-[11px] outline-none"
                  style={inputStyle}
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

              {/* Search results dropdown */}
              {showResults && searchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 25%, transparent)" }}>
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => selectFromSearch(r)}
                      className="w-full text-left px-3 py-2.5 text-[11px] hover:opacity-80 transition-all flex items-center gap-2"
                      style={{ color: "var(--layout-page-text, #1a1a1a)", borderBottom: i < searchResults.length - 1 ? "1px solid color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)" : "none" }}
                    >
                      <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold" style={{ backgroundColor: "color-mix(in srgb, #25d366 12%, transparent)", color: "#25d366" }}>
                        {r.nome.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold truncate block">{r.nome}</span>
                        {r.cargo && <span className="text-[9px] block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>{r.cargo}</span>}
                      </div>
                      {r.whatsapp ? (
                        <span className="text-[9px] shrink-0" style={{ color: "#25d366" }}>📱 {r.whatsapp}</span>
                      ) : (
                        <span className="text-[9px] shrink-0" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 35%, transparent)" }}>sem tel.</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
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
