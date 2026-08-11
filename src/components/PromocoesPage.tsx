import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X, Save, Tag, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";

const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";
const FONT = "'Montserrat', sans-serif";

interface Promocao {
  id: string;
  texto: string;
  oferecimento: string;
  data_inicio: string;
  data_fim: string;
  imagem_url: string;
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

export default function PromocoesPage({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Promocao[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    texto: "",
    oferecimento: "",
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    imagem_url: "",
  });
  const [uploading, setUploading] = useState(false);

  const ownerId = effectiveUserId || user?.id;

  const loadData = async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("promocoes")
      .select("*")
      .eq("user_id", ownerId)
      .order("created_at", { ascending: false });
    if (data) setItems(data as Promocao[]);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [ownerId]);

  const reset = () => {
    setForm({
      texto: "",
      oferecimento: "",
      data_inicio: new Date().toISOString().split("T")[0],
      data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      imagem_url: "",
    });
    setEditingId(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !ownerId) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${ownerId}/promos/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('comercial')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('comercial')
        .getPublicUrl(fileName);

      setForm({ ...form, imagem_url: publicUrl });
      toast({ title: "Imagem enviada com sucesso" });
    } catch (error: any) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!ownerId) return;
    if (!form.texto.trim()) {
      toast({ title: "O texto da promoção é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      user_id: ownerId,
      texto: form.texto.trim(),
      oferecimento: form.oferecimento.trim(),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      imagem_url: form.imagem_url,
    };

    const query = editingId
      ? supabase.from("promocoes").update(payload).eq("id", editingId)
      : supabase.from("promocoes").insert(payload);

    const { error } = await query;
    setSaving(false);

    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: editingId ? "Promoção atualizada" : "Promoção cadastrada" });
    reset();
    loadData();
  };

  const handleEdit = (item: Promocao) => {
    setEditingId(item.id);
    setForm({
      texto: item.texto,
      oferecimento: item.oferecimento || "",
      data_inicio: item.data_inicio,
      data_fim: item.data_fim,
      imagem_url: item.imagem_url || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog("Deseja excluir esta promoção?"))) return;
    const { error } = await supabase.from("promocoes").delete().eq("id", id);
    if (error) {
      toast({ title: "Erro ao excluir", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Promoção excluída" });
    loadData();
  };

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-6" style={{ fontFamily: FONT }}>
      <div id="module-header-title" style={{ display: "none" }}>ADS — Promoções</div>

      {/* Form Section */}
      <div style={cardStyle}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Tag className="text-[#00BFF0]" /> 
          {editingId ? "Editar Promoção" : "Nova Promoção"}
        </h2>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Texto da Promoção</label>
              <textarea
                style={{ ...pillInput, height: 100, borderRadius: 20, padding: "12px 20px", resize: "none" }}
                value={form.texto}
                onChange={(e) => setForm({ ...form, texto: e.target.value })}
                placeholder="Ex: Ganhe um par de ingressos..."
              />
            </div>
            <div>
              <label style={labelStyle}>Oferecimento / Patrocínio</label>
              <textarea
                style={{ ...pillInput, height: 100, borderRadius: 20, padding: "12px 20px", resize: "none" }}
                value={form.oferecimento}
                onChange={(e) => setForm({ ...form, oferecimento: e.target.value })}
                placeholder="Ex: Oferecimento Pizzaria do Zé..."
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label style={labelStyle}>Data Início</label>
              <input type="date" style={pillInput} value={form.data_inicio} onChange={(e) => setForm({ ...form, data_inicio: e.target.value })}/>
            </div>
            <div>
              <label style={labelStyle}>Data Fim (Validade)</label>
              <input type="date" style={pillInput} value={form.data_fim} onChange={(e) => setForm({ ...form, data_fim: e.target.value })}/>
            </div>
            <div>
              <label style={labelStyle}>Imagem da Promoção</label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <div style={{...pillInput, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', overflow: 'hidden'}}>
                    {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    <span className="truncate text-xs">{form.imagem_url ? "Trocar Imagem" : "Upload Imagem"}</span>
                    <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} disabled={uploading} />
                  </div>
                </label>
                {form.imagem_url && (
                  <div className="w-11 h-11 rounded-full border-2 border-[#00BFF0] overflow-hidden bg-white">
                    <img src={form.imagem_url} alt="Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button style={limeBtn} onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingId ? "Atualizar" : "Cadastrar Promoção"}
            </button>
            {editingId && <button style={ghostBtn} onClick={reset}><X size={16} /> Cancelar</button>}
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div style={cardStyle}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Calendar className="text-[#00BFF0]" /> Promoções Cadastradas ({items.length})
        </h2>
        
        {items.length === 0 ? (
          <div className="p-8 text-center bg-white/50 rounded-2xl border border-dashed border-[#00BFF0]/30"><p className="text-sm text-[#0A2540]/60">Nenhuma promoção cadastrada.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse bg-white rounded-2xl overflow-hidden shadow-sm">
              <thead>
                <tr className="border-b border-[#00BFF0]/20 text-[#00BFF0]">
                  <th className="p-4 text-xs uppercase font-bold w-16">Imagem</th>
                  <th className="p-4 text-xs uppercase font-bold">Promoção</th>
                  <th className="p-4 text-xs uppercase font-bold">Oferecimento</th>
                  <th className="p-4 text-xs uppercase font-bold">Validade</th>
                  <th className="p-4 text-xs uppercase font-bold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-[#0A2540]/5 hover:bg-[#00BFF0]/5 transition-colors">
                    <td className="p-4">
                      {item.imagem_url ? (
                        <img src={item.imagem_url} className="w-10 h-10 rounded-lg object-cover border border-[#00BFF0]/20" alt="" />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><ImageIcon size={16} className="text-gray-400" /></div>
                      )}
                    </td>
                    <td className="p-4 text-sm text-[#0A2540]" dangerouslySetInnerHTML={{ __html: item.texto }}></td>
                    <td className="p-4 text-sm text-[#0A2540]/70 italic">{item.oferecimento || "-"}</td>
                    <td className="p-4 text-xs text-[#0A2540]/70 whitespace-nowrap">
                      {new Date(item.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR')} - 
                      {new Date(item.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4 flex gap-2">
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
