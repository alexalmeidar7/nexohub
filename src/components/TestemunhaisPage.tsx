import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Pencil, Save, X, MessageSquareQuote, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";

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
  programa_ids: string[];
}

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
    const [ { data: testemunhais }, { data: pData } ] = await Promise.all([
      supabase.from("testemunhais").select("*").eq("user_id", ownerId).order("created_at", { ascending: false }),
      supabase.from("programas").select("id, nome").eq("user_id", ownerId).eq("ativo", true)
    ]);
    if (testemunhais) setItems(testemunhais as Testemunhal[]);
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
    setEditingId(item.id);
    setForm({
      texto: item.texto,
      data_inicio: item.data_inicio,
      data_fim: item.data_fim,
      programa_ids: item.programa_ids || [],
    });
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

      <div style={cardStyle}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <MessageSquareQuote className="text-[#00BFF0]" /> 
          {editingId ? "Editar Citação" : "Nova Citação"}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label style={labelStyle}>Texto da Citação</label>
            <textarea
              style={{ ...pillInput, height: 120, borderRadius: 24, padding: "16px 20px", resize: "none" }}
              value={form.texto}
              onChange={(e) => setForm({ ...form, texto: e.target.value })}
              placeholder="Digite o conteúdo da citação..."
            />
          </div>

          <div>
            <label style={labelStyle}>Programas (Selecione um ou mais)</label>
            <div className="flex flex-wrap gap-2">
              {programas.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    const next = form.programa_ids.includes(p.id) 
                      ? form.programa_ids.filter(id => id !== p.id)
                      : [...form.programa_ids, p.id];
                    setForm({...form, programa_ids: next});
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-bold transition-all ${
                    form.programa_ids.includes(p.id) ? "bg-[#00BFF0] text-white" : "bg-white border border-[#00BFF0] text-[#0A2540]"
                  }`}
                >
                  {p.nome}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Data Início</label>
              <input type="date" style={pillInput} value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}/>
            </div>
            <div>
              <label style={labelStyle}>Data Fim (Validade)</label>
              <input type="date" style={pillInput} value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })}/>
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
          <div className="p-8 text-center bg-white/50 rounded-2xl border border-dashed border-[#00BFF0]/30"><p className="text-sm text-[#0A2540]/60">Nenhuma citação cadastrada.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#00BFF0]/20 text-[#00BFF0]">
                  <th className="p-3 text-xs uppercase font-bold">Citação</th>
                  <th className="p-3 text-xs uppercase font-bold">Validade</th>
                  <th className="p-3 text-xs uppercase font-bold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-[#0A2540]/5 hover:bg-[#00BFF0]/5">
                    <td className="p-3 text-sm text-[#0A2540]" dangerouslySetInnerHTML={{ __html: item.texto }}></td>
                    <td className="p-3 text-xs text-[#0A2540]/70">
                      {new Date(item.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')} - 
                      {new Date(item.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-3 flex gap-2">
                      <button style={{...ghostBtn, width: 32, height: 32, padding: 0, justifyContent: 'center'}} onClick={() => handleEdit(item)}><Pencil size={14}/></button>
                      <button style={{...ghostBtn, width: 32, height: 32, padding: 0, justifyContent: 'center', borderColor: '#ff4d4f', color: '#ff4d4f'}} onClick={() => handleDelete(item.id)}><Trash2 size={14}/></button>
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
