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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    texto: "",
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  });

  const ownerId = effectiveUserId || user?.id;

  const loadData = async () => {
    if (!ownerId) return;
    const { data } = await supabase
      .from("testemunhais")
      .select("*")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false });
    if (data) setItems(data as Testemunhal[]);
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
      <div id="module-header-title" style={{ display: "none" }}>
        ADS — Citações
      </div>

      {/* Form Section */}
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Data Início</label>
              <input
                type="date"
                style={pillInput}
                value={form.data_inicio}
                onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}
              />
            </div>
            <div>
              <label style={labelStyle}>Data Fim (Validade)</label>
              <input
                type="date"
                style={pillInput}
                value={form.data_fim}
                onChange={(e) => setForm({ ...form, data_fim: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button style={limeBtn} onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingId ? "Atualizar" : "Cadastrar Citação"}
            </button>
            {editingId && (
              <button style={ghostBtn} onClick={reset}>
                <X size={16} /> Cancelar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* List Section */}
      <div style={cardStyle}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Calendar className="text-[#00BFF0]" /> Citações Cadastradas ({items.length})
        </h2>
        
        {items.length === 0 ? (
          <div className="p-8 text-center bg-white/50 rounded-2xl border border-dashed border-[#00BFF0]/30">
            <p className="text-sm text-[#0A2540]/60">Nenhuma citação cadastrada para este período.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {items.map((item) => (
              <div 
                key={item.id} 
                className="p-5 bg-white rounded-2xl shadow-sm border border-[#00BFF0]/10 flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="flex-1">
                  <div 
                    dangerouslySetInnerHTML={{ __html: item.texto }} 
                    className="text-sm text-[#0A2540] font-medium leading-relaxed"
                  />
                  <div className="flex items-center gap-2 mt-3">
                    <span className="text-[10px] bg-[#00BFF0]/10 text-[#00BFF0] px-2 py-1 rounded-full font-bold uppercase tracking-wider">
                      Validade: {new Date(item.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')} - {new Date(item.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button 
                    style={{ ...ghostBtn, width: 40, height: 40, padding: 0, justifyContent: 'center' }}
                    onClick={() => handleEdit(item)}
                    title="Editar"
                  >
                    <Pencil size={16} />
                  </button>
                  <button 
                    style={{ ...ghostBtn, width: 40, height: 40, padding: 0, justifyContent: 'center', borderColor: '#ff4d4f', color: '#ff4d4f' }}
                    onClick={() => handleDelete(item.id)}
                    title="Excluir"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
