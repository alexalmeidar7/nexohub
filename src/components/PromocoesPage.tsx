import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X, Save, Tag, Calendar, Check, Bold, Italic } from "lucide-react";
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

interface Promocao {
  id: string;
  nome: string;
  texto: string;
  oferecimento: string;
  data_inicio: string;
  data_fim: string;
  imagem_url: string;
  banner_l_url: string;
  programa_ids?: string[];
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
    nome: "",
    texto: "",
    oferecimento: "",
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    imagem_url: "",
    banner_l_url: "",
    programa_ids: [] as string[],
  });
  const [uploading1, setUploading1] = useState(false);
  const [uploading2, setUploading2] = useState(false);

  const ownerId = effectiveUserId || user?.id;

  const loadData = async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data: promosData } = await supabase.from("promocoes").select("*").eq("user_id", ownerId).order("created_at", { ascending: false });
    if (promosData) setItems(promosData as Promocao[]);
    
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [ownerId]);

  const reset = () => {
    setForm({
      nome: "",
      texto: "",
      oferecimento: "",
      data_inicio: new Date().toISOString().split("T")[0],
      data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      imagem_url: "",
      banner_l_url: "",
      programa_ids: [],
    });
    setEditingId(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'imagem_url' | 'banner_l_url') => {
    const file = e.target.files?.[0];
    if (!file || !ownerId) return;

    const isField1 = field === 'imagem_url';
    if (isField1) setUploading1(true); else setUploading2(true);

    try {
      const fileExt = file.name.split('.').pop();
      const folder = isField1 ? 'promos' : 'promos_l';
      const fileName = `${ownerId}/${folder}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('comercial')
        .upload(fileName, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('comercial')
        .getPublicUrl(fileName);

      setForm(prev => ({ ...prev, [field]: publicUrl }));
      toast({ title: `Imagem ${isField1 ? '1' : '2'} enviada com sucesso` });
    } catch (error: any) {
      toast({ title: "Erro no upload", description: error.message, variant: "destructive" });
    } finally {
      if (isField1) setUploading1(false); else setUploading2(false);
    }
  };

  const handleSave = async () => {
    if (!ownerId) return;
    if (!form.nome.trim()) {
      toast({ title: "O nome da promoção é obrigatório", variant: "destructive" });
      return;
    }
    if (!form.texto.trim()) {
      toast({ title: "O texto da promoção é obrigatório", variant: "destructive" });
      return;
    }

    setSaving(true);
    const payload = {
      user_id: ownerId,
      nome: form.nome.trim(),
      texto: form.texto.trim(),
      oferecimento: form.oferecimento.trim(),
      data_inicio: form.data_inicio,
      data_fim: form.data_fim,
      imagem_url: form.imagem_url,
      banner_l_url: form.banner_l_url,
      programa_ids: form.programa_ids,
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

  const handleEdit = async (item: Promocao) => {
    // Re-read the selected row so consecutive edits never reuse stale list state.
    const { data: freshItem, error } = await supabase
      .from("promocoes")
      .select("*")
      .eq("id", item.id)
      .eq("user_id", ownerId ?? "")
      .maybeSingle();

    if (error) {
      toast({ title: "Erro ao carregar a promoção", description: error.message, variant: "destructive" });
      return;
    }

    const selectedItem = (freshItem ?? item) as Promocao;
    const itemProgIds = Array.isArray(selectedItem.programa_ids) ? [...selectedItem.programa_ids] : [];
    
    setEditingId(selectedItem.id);
    setForm({
      nome: selectedItem.nome || "",
      texto: selectedItem.texto || "",
      oferecimento: selectedItem.oferecimento || "",
      data_inicio: selectedItem.data_inicio,
      data_fim: selectedItem.data_fim,
      imagem_url: selectedItem.imagem_url || "",
      banner_l_url: selectedItem.banner_l_url || "",
      programa_ids: itemProgIds,
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

      <div style={cardStyle}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          <Tag className="text-[#00BFF0]" /> 
          {editingId ? `Editar Promoção: ${form.nome}` : "Nova Promoção"}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label style={labelStyle}>Nome da Promoção</label>
            <input 
              type="text" 
              style={pillInput} 
              value={form.nome} 
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Sorteio de Ingressos 2026"
            />
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Texto da Promoção</label>
              <div className="nexo-quill-editor overflow-hidden rounded-[24px] border-2 border-[#00BFF0]">
                <ReactQuill
                  theme="snow"
                  value={form.texto}
                  onChange={(content) => setForm({ ...form, texto: content })}
                  modules={{
                    toolbar: [
                      ['bold', 'italic'],
                      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                      ['clean']
                    ],
                  }}
                  placeholder="Ex: Ganhe um par de ingressos..."
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Oferecimento / Patrocínio</label>
              <div className="nexo-quill-editor overflow-hidden rounded-[24px] border-2 border-[#00BFF0]">
                <ReactQuill
                  theme="snow"
                  value={form.oferecimento}
                  onChange={(content) => setForm({ ...form, oferecimento: content })}
                  modules={{
                    toolbar: [
                      ['bold', 'italic'],
                      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                      ['clean']
                    ],
                  }}
                  placeholder="Ex: Oferecimento Pizzaria do Zé..."
                />
              </div>
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Imagem 1 - Banner Promoção</label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <div style={{...pillInput, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', overflow: 'hidden'}}>
                    {uploading1 ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    <span className="truncate text-xs">{form.imagem_url ? "Trocar Imagem 1" : "Upload Banner"}</span>
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'imagem_url')} disabled={uploading1} />
                  </div>
                </label>
                {form.imagem_url && (
                  <div className="w-11 h-11 rounded-lg border-2 border-[#00BFF0] overflow-hidden bg-white">
                    <img src={form.imagem_url} alt="Preview 1" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>
            <div>
              <label style={labelStyle}>Imagem 2 - Banner L</label>
              <div className="flex gap-2">
                <label className="flex-1">
                  <div style={{...pillInput, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', overflow: 'hidden'}}>
                    {uploading2 ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                    <span className="truncate text-xs">{form.banner_l_url ? "Trocar Imagem 2" : "Upload Banner L"}</span>
                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e, 'banner_l_url')} disabled={uploading2} />
                  </div>
                </label>
                {form.banner_l_url && (
                  <div className="w-11 h-11 rounded-lg border-2 border-[#00BFF0] overflow-hidden bg-white">
                    <img src={form.banner_l_url} alt="Preview 2" className="w-full h-full object-cover" />
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
                  <th className="p-4 text-xs uppercase font-bold w-[25%]">Nome da Promoção</th>
                  <th className="p-4 text-xs uppercase font-bold w-[20%]">Texto da Promoção</th>
                  <th className="p-4 text-xs uppercase font-bold w-[15%]">Patrocínio</th>
                  <th className="p-4 text-xs uppercase font-bold">Validade</th>
                  <th className="p-4 text-xs uppercase font-bold text-center">Banner</th>
                  <th className="p-4 text-xs uppercase font-bold text-center">Banner L</th>
                  <th className="p-4 text-xs uppercase font-bold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="border-b border-[#0A2540]/5 hover:bg-[#00BFF0]/5 transition-colors">
                    <td className="p-4 text-sm font-bold text-[#0A2540]">
                      {item.nome || "Sem Nome"}
                    </td>
                    <td className="p-4 text-sm text-[#0A2540]">
                      <div 
                        className="max-w-xs truncate line-clamp-2" 
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.texto) }}
                      />
                    </td>
                    <td className="p-4 text-sm text-[#0A2540]/70 italic">
                      <div 
                        className="max-w-xs truncate line-clamp-1" 
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(item.oferecimento) }}
                      />
                    </td>
                    <td className="p-4 text-xs text-[#0A2540]/70 whitespace-nowrap">
                      {new Date(item.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td className="p-4 text-center">
                      {item.imagem_url ? <Check size={18} className="text-green-500 mx-auto" /> : <X size={18} className="text-red-500 mx-auto" />}
                    </td>
                    <td className="p-4 text-center">
                      {item.banner_l_url ? <Check size={18} className="text-green-500 mx-auto" /> : <X size={18} className="text-red-500 mx-auto" />}
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
