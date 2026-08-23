import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Save, X, MessageSquareQuote, Calendar, Check, Bold, Italic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";
import ReactQuill from 'react-quill-new';
import 'react-quill-new/dist/quill.snow.css';
import DOMPurify from 'dompurify';

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";
const FONT = "'Montserrat', sans-serif";

interface Testemunhal {
  id: string;
  texto: string;
  data_inicio: string;
  data_fim: string;
  programa_id?: string | null;
  programa_ids?: string[] | null;
}

const getLinkedProgramIds = (item: Pick<Testemunhal, "programa_id" | "programa_ids">) => {
  const currentIds = Array.isArray(item.programa_ids)
    ? item.programa_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
    : [];

  // programa_ids is the current source of truth. programa_id only supports legacy rows
  // that were created before the multi-program field existed.
  return currentIds.length > 0
    ? Array.from(new Set(currentIds))
    : item.programa_id
      ? [item.programa_id]
      : [];
};

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#FFFFFF",
  border: `2px solid ${CYAN}`,
  padding: "0 20px",
  fontFamily: FONT,
  fontSize: 13,
  color: DARK,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: DARK,
  marginBottom: 8,
  display: "block",
};

const cardStyle: React.CSSProperties = {
  background: CARD_BG,
  borderRadius: 24,
  padding: 24,
  fontFamily: FONT,
};

const primaryBtn: React.CSSProperties = {
  height: 44,
  borderRadius: 999,
  background: CYAN,
  color: "#fff",
  padding: "0 22px",
  fontFamily: FONT,
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 1,
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "none",
  cursor: "pointer",
};

const limeBtn: React.CSSProperties = { ...primaryBtn, background: LIME, color: DARK };
const ghostBtn: React.CSSProperties = { ...primaryBtn, background: "#fff", color: DARK, border: `2px solid ${CYAN}` };

export default function TestemunhaisPage({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Testemunhal[]>([]);
  const [programas, setProgramas] = useState<{ id: string; nome: string }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showProgramCombo, setShowProgramCombo] = useState(false);
  const quillRef = useRef<ReactQuill>(null);
  const [form, setForm] = useState({
    texto: "",
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    programa_ids: [] as string[],
  });

  const ownerId = effectiveUserId || user?.id;

  const loadData = async () => {
    if (!ownerId) return;
    setLoading(true);
    const [ { data: tData }, { data: pData } ] = await Promise.all([
      supabase.from("testemunhais").select("*").eq("user_id", ownerId).order("created_at", { ascending: false }),
      supabase.from("programas").select("id, nome").eq("user_id", ownerId).order("nome")
    ]);
    if (tData) {
      setItems(tData.map(t => ({
        ...t,
        texto: t.texto || "",
      })) as Testemunhal[]);
    }
    if (pData) setProgramas(pData);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [ownerId]);

  const reset = () => {
    setForm({
      texto: "",
      data_inicio: new Date().toISOString().split("T")[0],
      data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      programa_ids: [],
    });
    setEditingId(null);
  };

  const handleSave = async () => {
    if (!ownerId) return;
    if (!form.texto.trim()) {
      toast({ title: "O texto da citação é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      user_id: ownerId,
      texto: form.texto.trim(),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      programa_ids: form.programa_ids,
      programa_id: form.programa_ids[0] ?? null,
    };

    const query = editingId
      ? supabase.from("testemunhais").update(payload).eq("id", editingId)
      : supabase.from("testemunhais").insert(payload);

    const { error } = await query;
    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "Citação atualizada" : "Citação cadastrada" });
    reset();
    loadData();
  };

  const handleEdit = (item: Testemunhal) => {
    const itemProgIds = getLinkedProgramIds(item);

    setEditingId(item.id);
    setForm({
      texto: item.texto || "",
      data_inicio: item.data_inicio,
      data_fim: item.data_fim,
      programa_ids: itemProgIds,
    });
    setShowProgramCombo(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog("Deseja excluir esta citação?"))) return;
    const { error } = await supabase.from("testemunhais").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Citação excluída" });
    loadData();
  };

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-6" style={{ fontFamily: FONT }}>
      <div id="module-header-title" style={{ display: "none" }}>ADS — Citações</div>

      <style>{`
        .nexo-quill-editor .ql-container {
          border-bottom-left-radius: 24px;
          border-bottom-right-radius: 24px;
          background: #FFFFFF;
          font-family: ${FONT};
          min-height: 200px;
        }
        .nexo-quill-editor .ql-toolbar {
          border-top-left-radius: 24px;
          border-top-right-radius: 24px;
          background: #FFFFFF;
          border-bottom: 1px solid ${CYAN}33;
        }
        .nexo-quill-editor .ql-editor {
          font-size: 14px;
          line-height: 1.6;
        }
      `}</style>

      <div style={cardStyle} className="mb-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h3
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
              color: DARK,
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            {editingId ? "Editar Citação" : "Cadastro de Citação"}
          </h3>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: DARK,
              background: "#FFFFFF",
              padding: "6px 16px",
              borderRadius: 999,
              border: `2px solid ${CYAN}`,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            ID: <span style={{ color: CYAN }}>{editingId ? editingId.slice(0, 8) : "—"}</span>
          </div>
        </div>
        
        <div className="space-y-4">
          <div>
            <label style={labelStyle}>Texto da Citação</label>
            <div className="nexo-quill-editor overflow-hidden rounded-[24px] border-2 border-[#00BFF0]">
              <ReactQuill
                ref={quillRef}
                theme="snow"
                value={form.texto}
                onChange={(content) => setForm(current => ({ ...current, texto: content }))}
                modules={{
                  toolbar: [
                    ['bold', 'italic'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['clean']
                  ],
                }}
                placeholder="Digite o conteúdo da citação..."
              />
            </div>
          </div>

          <div className="relative">
            <label style={labelStyle}>Programas (Selecione um ou mais)</label>
            <button
              type="button"
              onClick={() => setShowProgramCombo(!showProgramCombo)}
              style={{ ...pillInput, textAlign: 'left', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
            >
              <span className="truncate font-semibold">
                {form.programa_ids.length === 0 
                  ? "Selecione os programas..." 
                  : `${form.programa_ids.length} programa(s) selecionado(s)`}
              </span>
              <span className="text-[#00BFF0] ml-2">▼</span>
            </button>

            {form.programa_ids.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {form.programa_ids.map(pid => {
                  const prog = programas.find(p => p.id === pid);
                  return (
                    <span
                      key={pid}
                      className="inline-flex items-center gap-2 bg-white border-2 border-[#00BFF0] text-[#0A2540] text-[11px] font-bold uppercase tracking-wide px-3 py-1.5 rounded-full"
                    >
                      <Check size={12} className="text-[#00BFF0]" />
                      {prog?.nome || "Programa removido"}
                      <button
                        type="button"
                        onClick={() => setForm(current => ({ ...current, programa_ids: current.programa_ids.filter(id => id !== pid) }))}
                        className="text-[#0A2540]/50 hover:text-[#ff4d4f] transition-colors"
                        aria-label={`Remover ${prog?.nome || "programa"}`}
                      >
                        <X size={12} />
                      </button>
                    </span>
                  );
                })}
              </div>
            )}
            
            {showProgramCombo && (
              <>
                <div 
                  className="fixed inset-0 z-10" 
                  onClick={() => setShowProgramCombo(false)}
                />
                <div className="absolute left-0 right-0 top-full mt-2 bg-white border-2 border-[#00BFF0] rounded-3xl p-2 z-20 max-h-72 overflow-y-auto shadow-2xl space-y-1">
                  {programas.map(p => {
                    const selected = form.programa_ids.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          setForm(current => ({
                            ...current,
                            programa_ids: current.programa_ids.includes(p.id)
                              ? current.programa_ids.filter(id => id !== p.id)
                              : [...current.programa_ids, p.id],
                          }));
                        }}
                        className={`w-full text-left px-4 py-2.5 rounded-full flex items-center justify-between gap-3 transition-all ${selected ? 'bg-[#00BFF0] text-white shadow-md' : 'bg-[#D6F4FB]/60 text-[#0A2540] hover:bg-[#D6F4FB]'}`}
                      >
                        <span className="text-xs font-bold uppercase tracking-wide truncate">{p.nome}</span>
                        <span
                          className={`shrink-0 w-5 h-5 rounded-full flex items-center justify-center border-2 ${selected ? 'bg-white border-white' : 'border-[#00BFF0]/40'}`}
                        >
                          {selected && <Check size={12} className="text-[#00BFF0]" />}
                        </span>
                      </button>
                    );
                  })}
                  {programas.length === 0 && (
                    <div className="p-4 text-center text-gray-400 text-xs italic">
                      Nenhum programa cadastrado
                    </div>
                  )}
                </div>
              </>
            )}
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Data Início</label>
              <input type="date" style={pillInput} value={form.data_inicio} onChange={(e) => setForm(current => ({ ...current, data_inicio: e.target.value }))}/>
            </div>
            <div>
              <label style={labelStyle}>Data Fim (Validade)</label>
              <input type="date" style={pillInput} value={form.data_fim} onChange={(e) => setForm(current => ({ ...current, data_fim: e.target.value }))}/>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button style={limeBtn} onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingId ? "Atualizar" : "Cadastrar Citação"}
            </button>
            {editingId && <button style={ghostBtn} onClick={reset}><X size={16} /> Cancelar</button>}
          </div>
        </div>
      </div>

      <div style={cardStyle}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Calendar className="text-[#00BFF0]" /> Citações Cadastradas ({items.length})
        </h2>
        
        {items.length === 0 ? (
          <div className="p-8 text-center bg-white/50 rounded-2xl border border-dashed border-[#00BFF0]/30"><p className="text-sm text-[#0A2540]/60">POR EXEMPLO NO USUÁRO opec ou positiva estou edtando a promoção cadastradas BUTECO GL e ao clicar no lapis para editar o texto da edição e nome da da promoção nao esta aparecendo no formulário para ed</p></div>
        ) : (
          <div className="overflow-x-auto rounded-[24px] border border-[#00BFF0]/30 shadow-sm">
            <table className="w-full text-left border-collapse bg-white">
              <thead>
                <tr style={{ backgroundColor: CYAN }}>
                  <th className="p-4 text-[11px] uppercase font-black tracking-wider text-white border-r border-white/10">Programa</th>
                  <th className="p-4 text-[11px] uppercase font-black tracking-wider text-white border-r border-white/10">Citação</th>
                  <th className="p-4 text-[11px] uppercase font-black tracking-wider text-white border-r border-white/10">Validade</th>
                  <th className="p-4 text-[11px] uppercase font-black tracking-wider text-white">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr 
                    key={item.id} 
                    className="transition-colors"
                    style={{ backgroundColor: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC" }}
                  >
                    <td className="p-4 text-[11px] text-[#0A2540] border-r border-[#00BFF0]/10">
                      <div className="flex flex-wrap gap-1">
                        {getLinkedProgramIds(item).length > 0 ? (
                          getLinkedProgramIds(item).map(pid => {
                            const prog = programas.find(p => p.id === pid);
                            return prog ? (
                              <span key={pid} className="bg-[#00BFF0]/10 text-[#00BFF0] px-2 py-0.5 rounded-full font-bold">
                                {prog.nome}
                              </span>
                            ) : null;
                          })
                        ) : (
                          <span className="text-gray-400 italic">Nenhum</span>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-[13px] text-[#0A2540] border-r border-[#00BFF0]/10">
                      <div 
                        className="max-w-xs truncate line-clamp-2" 
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.texto) }}
                      />
                    </td>
                    <td className="p-4 text-[11px] font-bold text-[#0A2540]/70 whitespace-nowrap border-r border-[#00BFF0]/10">
                      {new Date(item.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4 flex gap-2">
                      <button 
                        style={{...ghostBtn, width: 32, height: 32, padding: 0, justifyContent: 'center', borderRadius: 8}} 
                        onClick={() => handleEdit(item)}
                        title="Editar"
                      >
                        <Pencil size={14}/>
                      </button>
                      <button 
                        style={{...ghostBtn, width: 32, height: 32, padding: 0, justifyContent: 'center', borderColor: '#ff4d4f', color: '#ff4d4f', borderRadius: 8}} 
                        onClick={() => handleDelete(item.id)}
                        title="Excluir"
                      >
                        <Trash2 size={14}/>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
