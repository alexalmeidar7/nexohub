import { useState, useEffect, useRef } from "react";
import { scrollToForm } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findClientAccountById, findClientAccountByEmail, POSITIVA_USER_ID, isPositivaStationAccount } from "@/lib/clientAuthAccounts";
import { Loader2, Trash2, Upload, ImageIcon, Pencil, X, Save, Tag, Calendar, Check, Bold, Italic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { confirmDialog } from "@/lib/confirmDialog";
import LazyRichTextEditor from "./LazyRichTextEditor";
import DOMPurify from 'dompurify';

const CYAN = "#0055ff";
const LIME = "#0055ff";
const CARD_BG = "#ffffff";
const DARK = "#002132";
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
  user_id?: string | null;
  created_at?: string | null;
}

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  padding: "0 20px",
  fontFamily: FONT,
  fontSize: 12,
  color: "#0f172a",
  outline: "none",
  textTransform: "uppercase",
};

const labelStyle: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
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
  background: "#0055ff",
  color: "#fff",
  padding: "0 24px",
  fontFamily: FONT,
  fontWeight: 800,
  fontSize: 12,
  letterSpacing: 1.5,
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  border: "none",
  cursor: "pointer",
  boxShadow: "0 4px 14px rgba(0, 85, 255, 0.25)",
};

const limeBtn: React.CSSProperties = { ...primaryBtn };
const ghostBtn: React.CSSProperties = {
  ...primaryBtn,
  background: "#f8fafc",
  color: "#334155",
  border: "1px solid #cbd5e1",
  boxShadow: "none",
};

function getFirstFiveWords(htmlOrText?: string | null): string {
  if (!htmlOrText) return "";
  const plain = htmlOrText
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "";
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length <= 5) return words.join(" ");
  return words.slice(0, 5).join(" ") + "...";
}

function getPlainText(htmlOrText?: string | null): string {
  if (!htmlOrText) return "";
  return htmlOrText
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default function PromocoesPage({ effectiveUserId }: { effectiveUserId?: string | null }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Promocao[]>([]);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);
  
  const [form, setForm] = useState({
    nome: "",
    texto: "",
    oferecimento: "",
    data_inicio: new Date().toISOString().split("T")[0],
    data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    imagem_url: "",
    banner_l_url: "",
  });
  const [uploading1, setUploading1] = useState(false);
  const [uploading2, setUploading2] = useState(false);

  const clientAcc = (effectiveUserId && findClientAccountById(effectiveUserId)) ||
                    (user?.id && findClientAccountById(user.id)) ||
                    (user?.email && findClientAccountByEmail(user.email));
  const ownerId = effectiveUserId || clientAcc?.parentUserId || clientAcc?.id || user?.id;
  const ownerSlug = clientAcc?.slug || (user as any)?.user_metadata?.slug || "";
  const isPositivaStation = isPositivaStationAccount(ownerId) || isPositivaStationAccount(ownerSlug);

  const getLocalStorageKey = (uId: string) => `nexohub_promocoes_${uId}`;

  const getStoredPromos = (uId: string): Promocao[] => {
    try {
      const raw = localStorage.getItem(getLocalStorageKey(uId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          if (!isPositivaStation) {
            const cleaned = parsed.filter((p: any) => p.user_id !== POSITIVA_USER_ID);
            if (cleaned.length !== parsed.length) {
              localStorage.setItem(getLocalStorageKey(uId), JSON.stringify(cleaned));
            }
            return cleaned;
          }
          return parsed;
        }
      }
    } catch {}
    return [];
  };

  const saveStoredPromos = (uId: string, list: Promocao[]) => {
    try {
      const toSave = isPositivaStation ? list : list.filter((p: any) => (p as any).user_id !== POSITIVA_USER_ID);
      localStorage.setItem(getLocalStorageKey(uId), JSON.stringify(toSave));
    } catch {}
  };

  const loadData = async () => {
    if (!ownerId) return;
    const cachedItems = getStoredPromos(ownerId).filter(p => p.user_id === ownerId);
    if (cachedItems.length > 0) {
      setItems(cachedItems);
      setLoading(false);
    } else {
      setLoading(true);
    }
    let itemsList: Promocao[] = [];
    let onlineLoaded = false;
    try {
      const { data, error } = await supabase.from("promocoes").select("*").eq("user_id", ownerId).order("created_at", { ascending: false });
      if (!error && data) {
        itemsList = data as Promocao[];
        onlineLoaded = true;
      }
    } catch (error) {
      console.warn("Erro ao carregar promoções:", error);
    }
    // A leitura pública é uma segunda fonte online, nunca uma mistura com cache local.
    if (!onlineLoaded) {
      try {
        const { data, error } = await supabase.functions.invoke("public-promo-data", { body: { slug: ownerId } });
        if (!error && Array.isArray(data?.promocoes)) {
          itemsList = data.promocoes.filter((promo: Promocao) => promo.user_id === ownerId);
          onlineLoaded = true;
        }
      } catch (error) {
        console.warn("Erro ao carregar promoções públicas:", error);
      }
    }
    const current = onlineLoaded ? itemsList : getStoredPromos(ownerId).filter(p => p.user_id === ownerId);
    setItems(current);
    if (onlineLoaded) saveStoredPromos(ownerId, current);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, [ownerId, ownerSlug, user?.email]);

  const reset = () => {
    setForm({
      nome: "",
      texto: "",
      oferecimento: "",
      data_inicio: new Date().toISOString().split("T")[0],
      data_fim: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      imagem_url: "",
      banner_l_url: "",
    });
    setEditingId(null);
    setSaving(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'imagem_url' | 'banner_l_url') => {
    const file = e.target.files?.[0];
    if (!file || !ownerId) return;

    const isField1 = field === 'imagem_url';
    if (isField1) setUploading1(true); else setUploading2(true);

    try {
      const fileExt = file.name.split('.').pop();
      const folder = isField1 ? 'promos' : 'promos_l';
      const fileName = `${ownerId}/${folder}/${crypto.randomUUID()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('comercial')
        .upload(fileName, file, { upsert: false });

      if (uploadError) {
        toast({ title: `Imagem ${isField1 ? '1' : '2'} não enviada`, description: uploadError.message, variant: "destructive" });
        return;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('comercial')
        .getPublicUrl(fileName);

      setForm(prev => ({ ...prev, [field]: publicUrl }));
      toast({ title: `Imagem ${isField1 ? '1' : '2'} enviada com sucesso` });
    } catch (error: any) {
      toast({ title: `Imagem ${isField1 ? '1' : '2'} não enviada`, description: error?.message || "Verifique sua conexão.", variant: "destructive" });
    } finally {
      if (isField1) setUploading1(false); else setUploading2(false);
    }
  };

  const handleSave = async () => {
    if (!ownerId || uploading1 || uploading2 || saving) return;
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
    };

    try {
      const result = editingId
        ? await supabase.from("promocoes").update(payload).eq("id", editingId).eq("user_id", ownerId).select("*").single()
        : await supabase.from("promocoes").insert([payload]).select("*").single();
      if (result.error || !result.data) throw new Error(result.error?.message || "A gravação não foi confirmada.");
      const saved = result.data as Promocao;
      const updatedList = editingId ? items.map(p => p.id === editingId ? saved : p) : [saved, ...items];
      setItems(updatedList);
      saveStoredPromos(ownerId, updatedList);
      toast({ title: editingId ? "Promoção atualizada com sucesso" : "Promoção cadastrada com sucesso" });
      reset();
    } catch (err: any) {
      toast({ title: "Não foi possível salvar a promoção", description: err?.message || "Verifique sua conexão e tente novamente.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async (item: Promocao) => {
    if (!ownerId) return;

    setEditingId(item.id);
    setForm({
      nome: item.nome || "",
      texto: item.texto || "",
      oferecimento: item.oferecimento || "",
      data_inicio: item.data_inicio || new Date().toISOString().split("T")[0],
      data_fim: item.data_fim || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      imagem_url: item.imagem_url || "",
      banner_l_url: item.banner_l_url || "",
    });

    scrollToForm(formRef.current);
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirmDialog({
      title: "Excluir Promoção",
      message: "Tem certeza que deseja excluir esta promoção?",
      confirmLabel: "Excluir",
      destructive: true
    });
    if (!confirmed || !ownerId) return;

    // Atualiza localmente imediatamente
    const currentStored = getStoredPromos(ownerId);
    const updated = currentStored.filter(i => i.id !== id);
    saveStoredPromos(ownerId, updated);
    setItems(prev => prev.filter(i => i.id !== id));

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        const { error } = await supabase.from("promocoes").delete().eq("id", id);
        if (error) console.warn("Supabase delete promo warning:", error.message);
      }
    } catch (e) {
      console.warn("Erro ao excluir promoção no Supabase:", e);
    }
    toast({ title: "Promoção excluída" });
  };

  if (loading) return <ModulePageSkeleton variant="form" />;

  return (
    <div className="nexo-scope space-y-6 w-full max-w-none mx-0" style={{ fontFamily: FONT }}>
      <div id="module-header-title" style={{ display: "none" }}>ADS — Promoções</div>

      <style>{`
        .nexo-quill-editor {
          border: 2px solid #0055ff !important;
          border-radius: 24px !important;
          background: #FFFFFF;
          transition: all 0.2s ease;
        }
        .nexo-quill-editor:focus-within {
          border-color: #0055ff !important;
          box-shadow: 0 0 0 4px rgba(0, 85, 255, 0.12) !important;
        }
        .nexo-quill-editor .ql-container {
          border: none !important;
          border-bottom-left-radius: 22px;
          border-bottom-right-radius: 22px;
          background: #FFFFFF;
          font-family: ${FONT};
          min-height: 200px;
        }
        .nexo-quill-editor .ql-toolbar {
          border: none !important;
          border-top-left-radius: 22px;
          border-top-right-radius: 22px;
          background: #FFFFFF;
          border-bottom: 1px solid rgba(0, 85, 255, 0.15) !important;
        }
        .nexo-quill-editor .ql-editor {
          font-size: 14px;
          line-height: 1.6;
        }
        #root .nexo-scope input.promo-input-highlight {
          border: 2px solid #0055ff !important;
          background: #ffffff !important;
          transition: all 0.2s ease;
        }
        #root .nexo-scope input.promo-input-highlight:focus {
          border-color: #0055ff !important;
          box-shadow: 0 0 0 4px rgba(0, 85, 255, 0.12) !important;
        }
      `}</style>

      <div ref={formRef} style={cardStyle}>
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-[#002132]">
          <Tag className="text-[#0055ff]" /> 
          {editingId ? `Editar Promoção: ${form.nome}` : "Nova Promoção"}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label style={labelStyle}>Nome da Promoção</label>
            <input 
              type="text" 
              style={{ ...pillInput, border: "2px solid #0055ff", background: "#ffffff" }}
              className="promo-input-highlight w-full h-11 px-5 rounded-full outline-none"
              value={form.nome} 
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
              placeholder="Ex: Sorteio de Ingressos 2026"
            />
          </div>


          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label style={labelStyle}>Texto da Promoção</label>
              <div className="nexo-quill-editor overflow-hidden rounded-[24px] border-2 border-[#0055ff]">
                <LazyRichTextEditor
                  key={`texto-${editingId || "novo"}`}
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
                  placeholder="Ex: Ganhe um par de ingressos..."
                />
              </div>
            </div>
            <div>
              <label style={labelStyle}>Oferecimento / Patrocínio</label>
              <div className="nexo-quill-editor overflow-hidden rounded-[24px] border-2 border-[#0055ff]">
                <LazyRichTextEditor
                  key={`oferecimento-${editingId || "novo"}`}
                  theme="snow"
                  value={form.oferecimento}
                  onChange={(content) => setForm(current => ({ ...current, oferecimento: content }))}
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
                  <div className="w-11 h-11 rounded-lg border-2 border-[#0055ff] overflow-hidden bg-white">
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
                  <div className="w-11 h-11 rounded-lg border-2 border-[#0055ff] overflow-hidden bg-white">
                    <img src={form.banner_l_url} alt="Preview 2" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button style={limeBtn} onClick={handleSave} disabled={saving || uploading1 || uploading2}>
              {saving || uploading1 || uploading2 ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              {editingId ? "Atualizar" : "Cadastrar Promoção"}
            </button>
            {editingId && <button style={ghostBtn} onClick={reset}><X size={16} /> Cancelar</button>}
          </div>
        </div>
      </div>

      <section
        style={{
          background: "#FFFFFF",
          borderRadius: 24,
          padding: 32,
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
          fontFamily: FONT,
        }}
      >
        <div className="flex items-center justify-between mb-8">
          <h2
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
              color: DARK,
              textTransform: "uppercase",
              margin: 0,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <Calendar size={24} style={{ color: CYAN }} /> 
            Promoções Cadastradas
          </h2>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: DARK,
              background: CARD_BG,
              padding: "6px 16px",
              borderRadius: 999,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Total: <span style={{ color: CYAN }}>{items.length}</span>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="p-12 text-center bg-[#F8FAFC] rounded-2xl border-2 border-dashed border-[#E2E8F0]">
            <p className="text-sm text-[#64748B] font-medium">Nenhuma promoção cadastrada.</p>
          </div>
        ) : (
          <div className="overflow-x-auto" style={{ borderRadius: 24, border: `1px solid ${CYAN}22` }}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr style={{ background: CYAN }}>
                  <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Nome da Promoção</th>
                  <th style={{ padding: "16px 14px", width: "150px", maxWidth: "160px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Texto</th>
                  <th style={{ padding: "16px 14px", width: "150px", maxWidth: "160px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Patrocínio</th>
                  <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none" }}>Validade</th>
                  <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none", textAlign: "center" }}>Banner</th>
                  <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none", textAlign: "center" }}>Banner L</th>
                  <th style={{ padding: "16px 20px", color: "#FFFFFF", fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase", border: "none", textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => (
                  <tr 
                    key={item.id} 
                    style={{ 
                      background: idx % 2 === 0 ? "#FFFFFF" : "#F8FAFC",
                      transition: "background 0.2s ease"
                    }}
                    className="hover:bg-[#F1F5F9]"
                  >
                    <td style={{ padding: "14px 20px", fontSize: 13, fontWeight: 700, color: DARK }}>
                      {item.nome || "Sem Nome"}
                    </td>
                    <td 
                      style={{ padding: "14px 14px", width: "150px", maxWidth: "160px", fontSize: 13, color: DARK }}
                      title={getPlainText(item.texto)}
                    >
                      <div className="truncate font-normal">
                        {getFirstFiveWords(item.texto) || "—"}
                      </div>
                    </td>
                    <td 
                      style={{ padding: "14px 14px", width: "150px", maxWidth: "160px", fontSize: 13, color: DARK, fontStyle: "italic" }}
                      title={getPlainText(item.oferecimento)}
                    >
                      <div className="truncate font-normal">
                        {getFirstFiveWords(item.oferecimento) || "—"}
                      </div>
                    </td>
                    <td style={{ padding: "14px 20px", fontSize: 12, color: DARK, whiteSpace: "nowrap", fontWeight: 600 }}>
                      {new Date(item.data_fim + 'T12:00:00').toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "center" }}>
                      {item.imagem_url ? <Check size={18} style={{ color: "#22C55E", margin: "auto" }} /> : <X size={18} style={{ color: "#EF4444", margin: "auto" }} />}
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "center" }}>
                      {item.banner_l_url ? <Check size={18} style={{ color: "#22C55E", margin: "auto" }} /> : <X size={18} style={{ color: "#EF4444", margin: "auto" }} />}
                    </td>
                    <td style={{ padding: "14px 20px", textAlign: "right" }}>
                      <div style={{ display: "inline-flex", gap: 8 }}>
                        <button
                          onClick={() => handleEdit(item)}
                          style={{
                            width: 32, height: 32, borderRadius: 12,
                            background: CARD_BG, border: "none", cursor: "pointer",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: DARK, transition: "all 0.2s"
                          }}
                          className="hover:scale-110 active:scale-95"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          style={{
                            width: 32, height: 32, borderRadius: 12,
                            background: "#FEE2E2", border: "none", cursor: "pointer",
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            color: "#DC2626", transition: "all 0.2s"
                          }}
                          className="hover:scale-110 active:scale-95"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
