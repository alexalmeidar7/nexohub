import { useState, useEffect, useRef } from "react";
import { Save, Loader2, ChevronDown, ChevronUp, Plus, Trash2, Upload, Pencil, X, CheckCircle, Settings, Tv, ImageIcon, Palette, Link2 } from "lucide-react";
import { lazy, Suspense } from "react";
const LayoutCustomizer = lazy(() => import("./LayoutCustomizer"));
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { compressImage } from "@/lib/imageCompressor";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

export interface EmpresaConfig {
  nome: string;
  logo: string;
  backgroundUrl: string;
  endereco: string;
  telefoneComercial: string;
  telefoneParticipacao: string;
  site: string;
  instagram: string;
  facebook: string;
  youtube: string;
  plano: string;
}

export async function getEmpresaConfig(userId?: string): Promise<EmpresaConfig> {
  let query = supabase.from("empresa_config").select("*");
  if (userId) query = query.eq("user_id", userId);
  const { data } = await query.maybeSingle();
  if (!data) return {} as EmpresaConfig;
  return {
    nome: data.nome || "",
    logo: data.logo || "",
    backgroundUrl: data.background_url || "",
    endereco: data.endereco || "",
    telefoneComercial: data.telefone_comercial || "",
    telefoneParticipacao: data.telefone_participacao || "",
    site: data.site || "",
    instagram: data.instagram || "",
    facebook: data.facebook || "",
    youtube: data.youtube || "",
    plano: data.plano || "",
  };
}

interface Canal {
  id: string;
  numero_canal: string;
  name: string;
  logo_url: string;
  cover_url: string;
  background_url: string;
  url: string;
  type: string;
  active: boolean;
  catalog_name: string;
  is_hd: boolean;
  is_stereo: boolean;
  classificacao_etaria: string;
  horario_inicio: string;
  horario_fim: string;
  descricao: string;
}

/* ── Styled input helper ── */
const inputStyle: React.CSSProperties = {
  backgroundColor: "#ffffff",
  border: "1px solid #0d0446",
  color: "#0d0446",
  borderRadius: "20px",
};

function StyledInput({ value, onChange, placeholder, type = "text", readOnly = false, className = "" }: {
  value: string; onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void; placeholder?: string; type?: string; readOnly?: boolean; className?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full px-4 py-1.5 outline-none transition-colors text-sm ${readOnly ? "cursor-not-allowed opacity-60" : ""} ${className}`}
      style={inputStyle}
      onFocus={e => { if (!readOnly) e.currentTarget.style.borderColor = "#2dbef3"; }}
      onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
    />
  );
}

function CollapsibleBox({ title, icon, children }: { title: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#ffffff", boxShadow: "0 4px 20px rgba(13,4,70,0.08)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 transition-colors"
        style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)", color: "#ffffff" }}
      >
        <div className="flex items-center gap-3">
          {icon}
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        {open ? <ChevronUp size={18} className="text-white/80" /> : <ChevronDown size={18} className="text-white/80" />}
      </button>
      {open && <div className="p-6 space-y-5" style={{ backgroundColor: "#ffffff" }}>{children}</div>}
    </div>
  );
}

export default function ConfiguracoesPage({ section = "all" }: { section?: "all" | "empresa" | "player" }) {
  const { user } = useAuth();
  const [config, setConfig] = useState<EmpresaConfig>({} as EmpresaConfig);
  const [loading, setLoading] = useState(true);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Credentials
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Canais
  const [canais, setCanais] = useState<Canal[]>([]);
  const [loadingCanais, setLoadingCanais] = useState(true);
  const [canalMode, setCanalMode] = useState<"live" | "catalog">("live");
  const [canalForm, setCanalForm] = useState({ numero_canal: "", name: "", logo_url: "", cover_url: "", background_url: "", url: "", type: "audio_live", catalog_name: "", is_hd: false, is_stereo: false, classificacao_etaria: "L" });
  const [savingCanal, setSavingCanal] = useState(false);
  const [editingCanal, setEditingCanal] = useState<string | null>(null);
  const [catalogContentMode, setCatalogContentMode] = useState<"playlist" | "individual">("playlist");
  const [newCatalogMode, setNewCatalogMode] = useState(false);
  const [programas, setProgramas] = useState<{ id: string; nome: string; descricao: string; horario_inicio: string; horario_fim: string; classificacao_etaria: string }[]>([]);
  const [selectedProgramaId, setSelectedProgramaId] = useState("");
  const [savedCatalogs, setSavedCatalogs] = useState<string[]>([]);
  const [videoCoverUrl, setVideoCoverUrl] = useState("");
  const [videoThumbUrl, setVideoThumbUrl] = useState("");
  const [videoDescription, setVideoDescription] = useState("");

  useEffect(() => {
    if (user) {
      getEmpresaConfig(user.id).then(c => { setConfig(c); setLoading(false); });
      supabase.from("programas").select("id, nome, descricao, horario_inicio, horario_fim, classificacao_etaria").eq("user_id", user.id).eq("ativo", true).order("nome").then(({ data }) => {
        if (data) setProgramas(data.map(p => ({ id: p.id, nome: p.nome, descricao: p.descricao || "", horario_inicio: p.horario_inicio, horario_fim: p.horario_fim, classificacao_etaria: p.classificacao_etaria || "L" })));
      });
    }
    loadCanais();
  }, []);

  const loadCanais = async () => {
    if (!user) return;
    setLoadingCanais(true);
    const { data } = await supabase.from("streaming_channels").select("*").eq("user_id", user.id).order("numero_canal", { ascending: true });
    if (data) {
      const seen = new Map<string, string>();
      const dupeIds: string[] = [];
      for (const d of data) {
        const key = `${d.name}||${d.url}`;
        if (seen.has(key)) { dupeIds.push(d.id); } else { seen.set(key, d.id); }
      }
      if (dupeIds.length > 0) await supabase.from("streaming_channels").delete().in("id", dupeIds);
      const filtered = data.filter(d => !dupeIds.includes(d.id));
      setCanais(filtered.map((d: any) => ({
        id: d.id, numero_canal: d.numero_canal || "", name: d.name, logo_url: d.logo_url || "",
        cover_url: d.cover_url || "", background_url: d.background_url || "", url: d.url, type: d.type, active: d.active,
        catalog_name: d.catalog_name || "",
        is_hd: d.is_hd || false, is_stereo: d.is_stereo || false,
        classificacao_etaria: d.classificacao_etaria || "L",
        horario_inicio: d.horario_inicio || "",
        horario_fim: d.horario_fim || "",
        descricao: d.descricao || "",
      })));
    }
    setLoadingCanais(false);
  };

  const saveConfig = (newConfig: EmpresaConfig) => {
    setConfig(newConfig);
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!user) return;
      await supabase.from("empresa_config").upsert({
        user_id: user.id, nome: newConfig.nome, logo: newConfig.logo, background_url: newConfig.backgroundUrl,
        endereco: newConfig.endereco,
        telefone_comercial: newConfig.telefoneComercial, telefone_participacao: newConfig.telefoneParticipacao,
        site: newConfig.site, instagram: newConfig.instagram, facebook: newConfig.facebook,
        youtube: newConfig.youtube, updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
    }, 500);
  };

  const uploadToStorage = async (file: File, folder: string): Promise<string | null> => {
    if (!user) return null;
    const compressed = await compressImage(file);
    const ext = compressed.name.split(".").pop() || "webp";
    const path = `${user.id}/${folder}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("empresa-assets").upload(path, compressed, { upsert: true });
    if (error) { toast.error("Erro no upload: " + error.message); return null; }
    const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
    return urlData.publicUrl;
  };

  const handleLogoUpload = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      toast.info("Enviando logo...");
      const url = await uploadToStorage(file, "logo");
      if (url) saveConfig({ ...config, logo: url });
    };
    input.click();
  };

  const handleBackgroundUpload = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      toast.info("Enviando imagem de fundo...");
      const url = await uploadToStorage(file, "background");
      if (url) saveConfig({ ...config, backgroundUrl: url });
    };
    input.click();
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) { toast.error("A senha deve ter no mínimo 6 caracteres."); return; }
    setSavingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) { toast.error("Erro ao alterar senha: " + error.message); }
    else { toast.success("Senha alterada com sucesso!"); setNewPassword(""); }
  };

  const handleImageUpload = (field: "logo_url" | "cover_url" | "background_url") => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      toast.info("Enviando imagem...");
      const url = await uploadToStorage(file, `canal-${field}`);
      if (url) setCanalForm(prev => ({ ...prev, [field]: url }));
    };
    input.click();
  };

  const handleAddCanal = async () => {
    if (!user) return;
    if (canalMode === "catalog") {
      if (!canalForm.catalog_name || !canalForm.url) { toast.error("Preencha Nome do Catálogo e URL da Playlist."); return; }
    } else {
      if (!canalForm.name || !canalForm.url) { toast.error("Preencha Nome e URL."); return; }
    }
    const selectedProg = programas.find(p => p.id === selectedProgramaId);
    const payload: any = {
      name: canalMode === "catalog" ? (canalForm.name || canalForm.catalog_name) : canalForm.name,
      logo_url: (canalMode === "catalog" && catalogContentMode === "individual" && videoThumbUrl) ? videoThumbUrl : canalForm.logo_url,
      cover_url: (canalMode === "catalog" && catalogContentMode === "individual" && videoCoverUrl) ? videoCoverUrl : canalForm.cover_url,
      background_url: canalForm.background_url,
      url: canalForm.url, type: canalMode === "catalog" ? "catalog" : canalForm.type,
      catalog_name: canalMode === "catalog" ? canalForm.catalog_name : "",
      numero_canal: canalForm.numero_canal,
      is_hd: canalForm.is_hd, is_stereo: canalForm.is_stereo,
      classificacao_etaria: canalForm.classificacao_etaria,
      horario_inicio: selectedProg?.horario_inicio || "",
      horario_fim: selectedProg?.horario_fim || "",
      descricao: videoDescription || selectedProg?.descricao || "",
    };
    setSavingCanal(true);
    if (editingCanal) {
      const { error, data: updatedRows } = await supabase.from("streaming_channels").update(payload).eq("id", editingCanal).eq("user_id", user.id).select("id");
      setSavingCanal(false);
      if (error) { toast.error("Erro ao atualizar: " + error.message); }
      else if (!updatedRows || updatedRows.length === 0) { toast.error("Não foi possível atualizar. Verifique as permissões."); }
      else { toast.success("Atualizado!"); resetCanalForm(); loadCanais(); }
    } else {
      const { error } = await supabase.from("streaming_channels").insert([{ ...payload, user_id: user.id }]);
      setSavingCanal(false);
      if (error) { toast.error("Erro ao salvar canal."); }
      else { toast.success("Canal adicionado!"); resetCanalForm(); loadCanais(); }
    }
  };

  const resetCanalForm = () => {
    setCanalForm({ numero_canal: "", name: "", logo_url: "", cover_url: "", background_url: "", url: "", type: "audio_live", catalog_name: "", is_hd: false, is_stereo: false, classificacao_etaria: "L" });
    setCanalMode("live");
    setEditingCanal(null);
    setCatalogContentMode("playlist");
    setNewCatalogMode(false);
    setSelectedProgramaId("");
    setVideoCoverUrl("");
    setVideoThumbUrl("");
    setVideoDescription("");
  };

  const handleEditCanal = (c: Canal) => {
    const isCatalog = c.type === "catalog";
    setCanalMode(isCatalog ? "catalog" : "live");
    setCanalForm({ numero_canal: String(c.numero_canal), name: c.name, logo_url: c.logo_url, cover_url: c.cover_url, background_url: c.background_url || "", url: c.url, type: isCatalog ? "audio_live" : c.type, catalog_name: c.catalog_name || "", is_hd: c.is_hd, is_stereo: c.is_stereo, classificacao_etaria: c.classificacao_etaria || "L" });
    setEditingCanal(c.id);
    // Restore catalog-specific fields
    if (isCatalog) {
      const isIndividual = !c.url || !c.url.includes("youtube.com/playlist");
      setCatalogContentMode(isIndividual ? "individual" : "playlist");
      setVideoCoverUrl(c.cover_url || "");
      setVideoThumbUrl(c.logo_url || "");
      setVideoDescription(c.background_url ? "" : "");
      setNewCatalogMode(false);
    }
  };

  const handleRemoveCanal = async (id: string) => {
    await supabase.from("streaming_channels").delete().eq("id", id);
    toast.success("Canal removido."); loadCanais();
  };

  const field = (label: string, key: keyof EmpresaConfig, placeholder: string) => (
    <div className="space-y-1">
      <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>{label}</label>
      <StyledInput
        value={(config[key] as string) || ""}
        onChange={(e) => saveConfig({ ...config, [key]: e.target.value })}
        placeholder={placeholder}
      />
    </div>
  );

  if (loading) return <ModulePageSkeleton />;

  const typeLabels: Record<string, string> = { audio_live: "Áudio ao vivo", video_live: "Vídeo ao vivo", video: "Vídeo ao vivo", youtube: "Vídeo do YouTube", catalog: "Catálogo" };

  const btnPrimary: React.CSSProperties = { backgroundColor: "#0d0446", color: "#ffffff", border: "2px solid #0d0446", borderRadius: "20px" };
  const btnSecondary: React.CSSProperties = { backgroundColor: "#ffffff", color: "#0d0446", border: "2px solid #0d0446", borderRadius: "20px" };

  return (
    <div className="animate-fade-in">
      <div className="rounded-2xl" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "20px" }}>
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(13,4,70,0.08)" }}>
            <Save size={20} style={{ color: "#0d0446" }} />
          </div>
          <div>
            <h3 className="text-base font-bold" style={{ color: "#0d0446" }}>Configurações</h3>
            <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>Gerencie os dados dos canais do player</p>
          </div>
        </div>
        <div className="space-y-5">

      {/* Box 1: Configurações da Empresa */}
      {(section === "all" || section === "empresa") && <CollapsibleBox title="Configurações da Empresa" icon={<Settings size={16} className="text-white/80" />}>
        <div className="space-y-4">
          {field("Nome da Empresa", "nome", "Nome da empresa")}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Logo da Empresa</label>
              <div className="flex items-center gap-4">
                {config.logo && <img src={config.logo} alt="Logo" className="w-16 h-16 rounded-lg object-contain" style={{ border: "1px solid #0d0446" }} />}
                <button onClick={handleLogoUpload}
                  className="px-4 py-1.5 font-bold transition-all text-xs flex items-center gap-1"
                  style={btnSecondary}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
                >
                  <Upload size={12} /> {config.logo ? "Trocar Logo" : "Carregar Logo"}
                </button>
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Imagem de Fundo do Painel</label>
              <div className="flex items-center gap-4">
                {config.backgroundUrl && <img src={config.backgroundUrl} alt="Fundo" className="w-16 h-16 rounded-lg object-cover" style={{ border: "1px solid #0d0446" }} />}
                <button onClick={handleBackgroundUpload}
                  className="px-4 py-1.5 font-bold transition-all text-xs flex items-center gap-1"
                  style={btnSecondary}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
                >
                  <Upload size={12} /> {config.backgroundUrl ? "Trocar Fundo" : "Carregar Fundo"}
                </button>
              </div>
            </div>
          </div>
          {field("Endereço", "endereco", "Endereço completo")}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {field("Telefone Comercial", "telefoneComercial", "(00) 0000-0000")}
            {field("Telefone Participação", "telefoneParticipacao", "(00) 0000-0000")}
          </div>
          {field("Site", "site", "https://www.exemplo.com")}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {field("Instagram", "instagram", "https://instagram.com/empresa")}
            {field("Facebook", "facebook", "https://facebook.com/empresa")}
            {field("YouTube", "youtube", "https://youtube.com/empresa")}
          </div>
        </div>

        {/* Credenciais */}
        <div className="pt-4 mt-4 space-y-3" style={{ borderTop: "1px solid rgba(13,4,70,0.15)" }}>
          <h4 className="text-sm font-semibold" style={{ color: "#0d0446" }}>Gestão de Acesso</h4>
          <div className="space-y-1">
            <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>E-mail de Login</label>
            <StyledInput value={user?.email || ""} readOnly />
          </div>
          <div className="space-y-1">
            <label className="block text-xs mb-1" style={{ color: "#0d0446", fontWeight: 600 }}>Alterar Senha</label>
            <div className="flex gap-2">
              <StyledInput
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha (mín. 6 caracteres)"
                className="flex-1"
              />
              <button onClick={handleChangePassword} disabled={savingPassword}
                className="px-5 py-2 font-bold transition-all text-xs disabled:opacity-50 flex items-center gap-1"
                style={btnPrimary}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
              >
                {savingPassword ? <Loader2 size={14} className="animate-spin" /> : "Salvar"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs pt-2" style={{ color: "rgba(13,4,70,0.5)" }}>
          <Save size={12} />
          <span>As configurações são salvas automaticamente.</span>
        </div>
      </CollapsibleBox>}

      {/* Box 2: Configurações do Player */}
      {(section === "all" || section === "player") && <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", boxShadow: "0 2px 12px rgba(13,4,70,0.06)" }}>
        <div className="w-full flex items-center justify-between px-5 py-3" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
          <h3 className="text-sm font-bold text-white">Configurações do Player</h3>
        </div>
        <div className="p-5 space-y-4">
        <div className="space-y-6">
          {/* ── Header + Mode ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4" style={{ borderBottom: "1px solid rgba(13,4,70,0.08)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
                {editingCanal ? <Pencil size={18} className="text-white" /> : <Plus size={18} className="text-white" />}
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: "#0d0446" }}>
                  {editingCanal ? "Editar Canal" : "Novo Canal"}
                </h3>
                <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>
                  {editingCanal ? "Atualize as informações do canal selecionado" : "Cadastre um novo canal de streaming"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setCanalMode("live"); setCanalForm(p => ({ ...p, type: "audio_live" })); }}
                className="px-5 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-xl"
                style={{
                  backgroundColor: canalMode === "live" ? "#0d0446" : "rgba(13,4,70,0.05)",
                  color: canalMode === "live" ? "#ffffff" : "#0d0446",
                  boxShadow: canalMode === "live" ? "0 4px 12px rgba(13,4,70,0.25)" : "none",
                }}
              >
                📡 Ao Vivo
              </button>
              <button
                onClick={() => {
                  setCanalMode("catalog");
                  const catalogCanais = canais.filter(c => c.type === "catalog");
                  const maxNum = catalogCanais.reduce((max, c) => {
                    const n = parseInt(c.numero_canal || "0", 10);
                    return n > max ? n : max;
                  }, 0);
                  setCanalForm(p => ({ ...p, type: "catalog", numero_canal: String(maxNum + 1).padStart(2, "0") }));
                }}
                className="px-5 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-xl"
                style={{
                  backgroundColor: canalMode === "catalog" ? "#0d0446" : "rgba(13,4,70,0.05)",
                  color: canalMode === "catalog" ? "#ffffff" : "#0d0446",
                  boxShadow: canalMode === "catalog" ? "0 4px 12px rgba(13,4,70,0.25)" : "none",
                }}
              >
                📁 Catálogo
              </button>
            </div>
          </div>

          {/* ── Seção 1: Informações do Canal ── */}
          <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: "#d9e9fa", boxShadow: "0 2px 8px rgba(13,4,70,0.06)" }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
                <Settings size={12} className="text-white" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#0d0446" }}>Informações do Canal</span>
            </div>

            {canalMode === "live" ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>Tipo de Transmissão</label>
                  <select value={canalForm.type} onChange={(e) => setCanalForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-4 py-2 outline-none text-sm font-medium cursor-pointer"
                    style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "2px solid #0d0446" }}>
                    <option value="audio_live">Áudio ao vivo</option>
                    <option value="video_live">Vídeo ao vivo</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>Nº do Canal</label>
                  <StyledInput value={canalForm.numero_canal} onChange={(e) => setCanalForm(p => ({ ...p, numero_canal: e.target.value }))} placeholder="Ex: 01" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>Nome do Canal</label>
                  <StyledInput value={canalForm.name} onChange={(e) => setCanalForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Rádio FM" />
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>URL do Streaming</label>
                  <StyledInput value={canalForm.url} onChange={(e) => setCanalForm(p => ({ ...p, url: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>Tipo de Transmissão</label>
                    <div className="w-full px-4 py-2 text-sm font-medium" style={{ backgroundColor: "rgba(13,4,70,0.08)", color: "#0d0446", borderRadius: "20px", border: "2px solid rgba(13,4,70,0.2)" }}>
                      Gravado
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>Nº do Canal</label>
                    <StyledInput value={canalForm.numero_canal} onChange={(e) => setCanalForm(p => ({ ...p, numero_canal: e.target.value }))} placeholder="Ex: 01" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>Nome do Catálogo</label>
                    {newCatalogMode || editingCanal ? (
                      <div className="flex gap-2">
                        <StyledInput value={canalForm.catalog_name} onChange={(e) => setCanalForm(p => ({ ...p, catalog_name: e.target.value }))} placeholder="Nome do novo catálogo" />
                        {!editingCanal && (
                          <>
                            <button onClick={() => {
                              if (!canalForm.catalog_name.trim()) { toast.error("Digite o nome do catálogo."); return; }
                              if (!savedCatalogs.includes(canalForm.catalog_name.trim())) {
                                setSavedCatalogs(prev => [...prev, canalForm.catalog_name.trim()]);
                              }
                              toast.success("Catálogo salvo na lista!");
                              setNewCatalogMode(false);
                            }}
                              className="px-3 py-1.5 text-xs font-bold rounded-full transition-all shrink-0 whitespace-nowrap flex items-center gap-1"
                              style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", border: "none" }}
                            >
                              <Save size={12} /> Salvar Catálogo
                            </button>
                            <button onClick={() => { setNewCatalogMode(false); setCanalForm(p => ({ ...p, catalog_name: "" })); }}
                              className="px-3 py-1.5 text-xs font-bold rounded-full transition-all shrink-0"
                              style={{ backgroundColor: "rgba(13,4,70,0.08)", color: "#0d0446" }}
                            >
                              Voltar
                            </button>
                          </>
                        )}
                      </div>
                    ) : (() => {
                      const existingCatalogs = [...new Set([
                        ...canais.filter(c => c.type === "catalog" && c.catalog_name).map(c => c.catalog_name),
                        ...savedCatalogs,
                      ])];
                      return (
                        <div className="flex gap-2">
                          <select
                            value={canalForm.catalog_name}
                            onChange={(e) => setCanalForm(p => ({ ...p, catalog_name: e.target.value, name: e.target.value }))}
                            className="w-full px-4 py-2 outline-none text-sm font-medium cursor-pointer"
                            style={{ backgroundColor: "#ffffff", color: "#0d0446", borderRadius: "20px", border: "1px solid #0d0446" }}
                          >
                            <option value="">Selecione um catálogo</option>
                            {existingCatalogs.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <button onClick={() => { setNewCatalogMode(true); setCanalForm(p => ({ ...p, catalog_name: "" })); }}
                            className="px-3 py-1.5 text-xs font-bold rounded-full transition-all shrink-0 whitespace-nowrap flex items-center gap-1"
                            style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff", border: "none" }}
                          >
                            <Plus size={12} /> Novo Catálogo
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Vincular Programa */}
                <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "rgba(139, 92, 246, 0.06)", border: "1px solid rgba(139, 92, 246, 0.15)" }}>
                  <div className="flex items-center gap-2">
                    <Link2 size={14} style={{ color: "#8b5cf6" }} />
                    <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#8b5cf6" }}>Vincular Programa</span>
                  </div>
                  <select
                    value={selectedProgramaId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setSelectedProgramaId(id);
                       if (id) {
                        const prog = programas.find(p => p.id === id);
                        if (prog) {
                          setCanalForm(p => ({
                            ...p,
                            classificacao_etaria: prog.classificacao_etaria || "L",
                            name: p.name || prog.nome,
                          }));
                          setVideoDescription(prog.descricao || "");
                        }
                      }
                    }}
                    className="w-full px-4 py-2 outline-none text-sm font-medium cursor-pointer"
                    style={{ backgroundColor: "#ffffff", color: "#0d0446", borderRadius: "20px", border: "1px solid #8b5cf6" }}
                  >
                    <option value="">Selecione um programa (opcional)</option>
                    {programas.map(p => (
                      <option key={p.id} value={p.id}>{p.nome}</option>
                    ))}
                  </select>
                  {selectedProgramaId && (() => {
                    const prog = programas.find(p => p.id === selectedProgramaId);
                    if (!prog) return null;
                    return (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                        <div className="rounded-lg p-3" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(139, 92, 246, 0.12)" }}>
                          <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "rgba(13,4,70,0.4)" }}>Horário</span>
                          <span className="text-sm font-semibold" style={{ color: "#0d0446" }}>{prog.horario_inicio} — {prog.horario_fim}</span>
                        </div>
                        <div className="rounded-lg p-3" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(139, 92, 246, 0.12)" }}>
                          <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "rgba(13,4,70,0.4)" }}>Classificação Etária</span>
                          <span className="text-sm font-semibold" style={{ color: "#0d0446" }}>{prog.classificacao_etaria || "Livre"}</span>
                        </div>
                        <div className="rounded-lg p-3 sm:col-span-1" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(139, 92, 246, 0.12)" }}>
                          <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "rgba(13,4,70,0.4)" }}>Descrição</span>
                          <span className="text-xs" style={{ color: "#0d0446" }}>{prog.descricao || "—"}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>


                <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "rgba(38, 143, 250, 0.06)", border: "1px solid rgba(38, 143, 250, 0.15)" }}>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#268ffa" }}>Modo de Cadastro</span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCatalogContentMode("playlist")}
                      className="flex-1 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left"
                      style={{
                        backgroundColor: catalogContentMode === "playlist" ? "#0d0446" : "#ffffff",
                        color: catalogContentMode === "playlist" ? "#ffffff" : "#0d0446",
                        border: `2px solid ${catalogContentMode === "playlist" ? "#0d0446" : "rgba(13,4,70,0.15)"}`,
                        boxShadow: catalogContentMode === "playlist" ? "0 4px 12px rgba(13,4,70,0.25)" : "none",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">🔗</span>
                        <span style={{ color: catalogContentMode === "playlist" ? "#ffffff" : "#0d0446" }}>Criar por URL de Playlist</span>
                      </div>
                      <p className="text-[10px] ml-7" style={{ color: catalogContentMode === "playlist" ? "rgba(255,255,255,0.85)" : "rgba(13,4,70,0.5)" }}>Importa automaticamente todos os vídeos da playlist</p>
                    </button>
                    <button
                      onClick={() => setCatalogContentMode("individual")}
                      className="flex-1 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left"
                      style={{
                        backgroundColor: catalogContentMode === "individual" ? "#0d0446" : "#ffffff",
                        color: catalogContentMode === "individual" ? "#ffffff" : "#0d0446",
                        border: `2px solid ${catalogContentMode === "individual" ? "#0d0446" : "rgba(13,4,70,0.15)"}`,
                        boxShadow: catalogContentMode === "individual" ? "0 4px 12px rgba(13,4,70,0.25)" : "none",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">📹</span>
                        <span style={{ color: catalogContentMode === "individual" ? "#ffffff" : "#0d0446" }}>Cadastrar Vídeos Individualmente</span>
                      </div>
                      <p className="text-[10px] ml-7" style={{ color: catalogContentMode === "individual" ? "rgba(255,255,255,0.85)" : "rgba(13,4,70,0.5)" }}>Adicione vídeos um a um com capas personalizadas</p>
                    </button>
                  </div>
                </div>

                {/* Campos de acordo com o modo */}
                {catalogContentMode === "playlist" ? (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>URL da Playlist do YouTube</label>
                    <StyledInput value={canalForm.url} onChange={(e) => setCanalForm(p => ({ ...p, url: e.target.value }))} placeholder="https://youtube.com/playlist?list=..." />
                    <p className="text-[10px] mt-1" style={{ color: "rgba(13,4,70,0.4)" }}>Todos os vídeos da playlist serão importados automaticamente para o catálogo.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>URL do Vídeo (YouTube)</label>
                      <StyledInput value={canalForm.url} onChange={(e) => setCanalForm(p => ({ ...p, url: e.target.value }))} placeholder="https://youtube.com/watch?v=..." />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>Nome do Programa/Vídeo</label>
                      <StyledInput value={canalForm.name} onChange={(e) => setCanalForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Episódio 01 - Título" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold" style={{ color: "#0d0446" }}>Descrição do Vídeo</label>
                      <textarea
                        value={videoDescription}
                        onChange={(e) => setVideoDescription(e.target.value)}
                        rows={3}
                        placeholder="Descreva o conteúdo do vídeo..."
                        className="w-full px-4 py-2 outline-none transition-colors text-sm resize-none"
                        style={inputStyle}
                        onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
                      />
                    </div>
                    {/* Upload de imagens do vídeo individual */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      {([
                        { url: videoCoverUrl, setUrl: setVideoCoverUrl, label: "Capa do Vídeo", hint: "1080 × 1920", folder: "video-cover" },
                        { url: videoThumbUrl, setUrl: setVideoThumbUrl, label: "Thumbnail do Vídeo", hint: "1920 × 1080", folder: "video-thumb" },
                      ] as const).map(img => (
                        <div key={img.folder} className="flex flex-col items-center gap-2.5 p-4 rounded-xl transition-all hover:shadow-md" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
                          {img.url ? (
                            <img src={img.url} alt={img.label} className="w-full h-24 rounded-xl object-contain" style={{ border: "1px solid rgba(13,4,70,0.08)" }} />
                          ) : (
                            <div className="w-full h-24 rounded-xl flex flex-col items-center justify-center gap-1" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "2px dashed rgba(13,4,70,0.12)" }}>
                              <Upload size={20} style={{ color: "rgba(13,4,70,0.2)" }} />
                              <span className="text-[9px]" style={{ color: "rgba(13,4,70,0.3)" }}>Arraste ou clique</span>
                            </div>
                          )}
                          <span className="text-xs font-bold text-center" style={{ color: "#0d0446" }}>{img.label}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: "rgba(13,4,70,0.5)", backgroundColor: "rgba(13,4,70,0.05)" }}>{img.hint}</span>
                          <button onClick={() => {
                            const input = document.createElement("input");
                            input.type = "file"; input.accept = "image/*";
                            input.onchange = async (e) => {
                              const file = (e.target as HTMLInputElement).files?.[0];
                              if (!file) return;
                              toast.info("Enviando imagem...");
                              const url = await uploadToStorage(file, img.folder);
                              if (url) img.setUrl(url);
                            };
                            input.click();
                          }}
                            className="w-full px-3 py-1.5 font-bold transition-all text-xs flex items-center justify-center gap-1 rounded-full"
                            style={btnSecondary}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
                          >
                            <Upload size={10} /> {img.url ? "Trocar" : "Upload"}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Seção 2: Imagens ── */}
          <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: "#d9e9fa", boxShadow: "0 2px 8px rgba(13,4,70,0.06)" }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
                <ImageIcon size={12} className="text-white" />
              </div>
              <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "#0d0446" }}>{canalMode === "catalog" ? "Imagens do Catálogo" : "Imagens do Canal"}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { key: "background_url" as const, label: canalMode === "catalog" ? "Logo do Catálogo" : "Logo do Canal", hint: "1080 × 1080 (PNG)", alt: "Logo" },
                { key: "cover_url" as const, label: canalMode === "catalog" ? "Capa do Catálogo" : "Capa do Canal", hint: "1080 × 1920", alt: "Capa" },
                { key: "logo_url" as const, label: canalMode === "catalog" ? "Thumb do Catálogo" : "Thumb do Canal", hint: "1920 × 1080", alt: "Thumb" },
              ] as const).map(img => (
                <div key={img.key} className="flex flex-col items-center gap-2.5 p-4 rounded-xl transition-all hover:shadow-md" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.08)" }}>
                  {(canalForm as any)[img.key] ? (
                    <img src={(canalForm as any)[img.key]} alt={img.alt} className="w-full h-24 rounded-xl object-contain" style={{ border: "1px solid rgba(13,4,70,0.08)", backgroundColor: img.key === "background_url" ? "#1a1a2e" : "transparent" }} />
                  ) : (
                    <div className="w-full h-24 rounded-xl flex flex-col items-center justify-center gap-1" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "2px dashed rgba(13,4,70,0.12)" }}>
                      <Upload size={20} style={{ color: "rgba(13,4,70,0.2)" }} />
                      <span className="text-[9px]" style={{ color: "rgba(13,4,70,0.3)" }}>Arraste ou clique</span>
                    </div>
                  )}
                  <span className="text-xs font-bold text-center" style={{ color: "#0d0446" }}>{img.label}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: "rgba(13,4,70,0.5)", backgroundColor: "rgba(13,4,70,0.05)" }}>{img.hint}</span>
                  <button onClick={() => handleImageUpload(img.key)}
                    className="w-full px-3 py-1.5 font-bold transition-all text-xs flex items-center justify-center gap-1 rounded-full"
                    style={btnSecondary}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
                  >
                    <Upload size={10} /> {(canalForm as any)[img.key] ? "Trocar" : "Upload"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* ── Seção 3: Especificações + Ação ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-2">
            <div className="rounded-xl p-4" style={{ background: "rgba(38, 143, 250, 0.08)", border: "1px solid rgba(38, 143, 250, 0.18)" }}>
              <span className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: "#268ffa" }}>Especificações:</span>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2.5 cursor-pointer group" style={{ color: "#0d0446" }}>
                  <input type="checkbox" checked={canalForm.is_hd} onChange={(e) => setCanalForm(p => ({ ...p, is_hd: e.target.checked }))}
                    className="w-4 h-4 rounded" style={{ accentColor: "#268ffa" }} />
                  <img src="/images/icon-fullhd.png" alt="FULL HD" className="h-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                  <span className="text-sm font-semibold group-hover:opacity-80 transition-opacity">FULL HD</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer group" style={{ color: "#0d0446" }}>
                  <input type="checkbox" checked={canalForm.is_stereo} onChange={(e) => setCanalForm(p => ({ ...p, is_stereo: e.target.checked }))}
                    className="w-4 h-4 rounded" style={{ accentColor: "#268ffa" }} />
                  <img src="/images/icon-stereo.png" alt="Stereo" className="h-4 opacity-80 group-hover:opacity-100 transition-opacity" />
                  <span className="text-sm font-semibold group-hover:opacity-80 transition-opacity">Áudio Estéreo</span>
                </label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editingCanal && (
                <button onClick={resetCanalForm}
                  className="px-5 py-2.5 font-bold transition-all flex items-center gap-1.5 rounded-full text-sm"
                  style={btnSecondary}
                >
                  <X size={14} /> Cancelar
                </button>
              )}
              <button onClick={handleAddCanal} disabled={savingCanal}
                className="px-6 py-2.5 font-bold transition-all flex items-center gap-2 disabled:opacity-70 rounded-full text-sm shadow-md"
                style={{ ...btnPrimary, background: "linear-gradient(135deg, #268ffa, #2dbef3)", border: "none", color: "#ffffff" }}
                onMouseEnter={e => { e.currentTarget.style.opacity = "0.9"; e.currentTarget.style.transform = "translateY(-1px)"; }}
                onMouseLeave={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                {savingCanal ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> {editingCanal ? "Salvar Alterações" : "Adicionar Canal"}</>}
              </button>
            </div>
          </div>
        </div>

        {/* Lista de canais */}
        {loadingCanais ? (
          <div className="flex items-center gap-2 text-sm mt-6 justify-center py-8" style={{ color: "rgba(13,4,70,0.5)" }}><Loader2 size={16} className="animate-spin" /> Carregando canais...</div>
        ) : canais.length === 0 ? (
          <div className="mt-6 text-center py-8 rounded-2xl" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "2px dashed rgba(13,4,70,0.1)" }}>
            <Tv size={32} className="mx-auto mb-2" style={{ color: "rgba(13,4,70,0.15)" }} />
            <p className="text-sm font-medium" style={{ color: "rgba(13,4,70,0.4)" }}>Nenhum canal cadastrado ainda</p>
            <p className="text-[11px] mt-0.5" style={{ color: "rgba(13,4,70,0.25)" }}>Use o formulário acima para adicionar seu primeiro canal</p>
          </div>
        ) : (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-4">
              <Tv size={16} style={{ color: "#268ffa" }} />
              <h4 className="text-base font-bold" style={{ color: "#0d0446" }}>Canais Cadastrados</h4>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(38,143,250,0.1)", color: "#268ffa" }}>{canais.length}</span>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: "1px solid rgba(13,4,70,0.08)" }}>
              <table className="w-full text-sm" style={{ color: "#0d0446" }}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)", color: "#ffffff" }}>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ minWidth: "80px", whiteSpace: "nowrap" }}>Canal</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Nome</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Capa</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Thumb</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {canais.map((c, i) => (
                    <tr key={c.id} className="transition-colors hover:bg-blue-50/50" style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f9fe", borderTop: "1px solid rgba(13,4,70,0.05)" }}>
                      <td className="px-4 py-3" style={{ minWidth: "80px", whiteSpace: "nowrap" }}>
                        <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-lg text-xs font-bold" style={{ backgroundColor: "rgba(38,143,250,0.1)", color: "#268ffa" }}>
                          {c.numero_canal || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold">{c.name}</span>
                        {c.catalog_name ? <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full" style={{ color: "rgba(13,4,70,0.5)", backgroundColor: "rgba(13,4,70,0.05)" }}>({c.catalog_name})</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: c.type === "catalog" ? "rgba(139,92,246,0.1)" : "rgba(38,143,250,0.1)", color: c.type === "catalog" ? "#8b5cf6" : "#268ffa" }}>
                          {typeLabels[c.type] || c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.cover_url ? <CheckCircle size={16} className="inline" style={{ color: "#22c55e" }} /> : <span className="text-[10px]" style={{ color: "rgba(13,4,70,0.2)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {c.logo_url ? <CheckCircle size={16} className="inline" style={{ color: "#22c55e" }} /> : <span className="text-[10px]" style={{ color: "rgba(13,4,70,0.2)" }}>—</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => handleEditCanal(c)} title="Editar" className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-sm" style={{ backgroundColor: "rgba(38,143,250,0.1)" }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(38,143,250,0.2)"; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(38,143,250,0.1)"; }}
                          >
                            <Pencil size={13} style={{ color: "#268ffa" }} />
                          </button>
                          <button onClick={() => handleRemoveCanal(c.id)} title="Remover" className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-sm" style={{ backgroundColor: "rgba(220,38,38,0.08)" }}
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(220,38,38,0.15)"; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(220,38,38,0.08)"; }}
                          >
                            <Trash2 size={13} style={{ color: "#dc2626" }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div></div>}

      {/* Box 3: Layout */}
      {(section === "all" || section === "empresa") && <CollapsibleBox title="Layout — Cores e Personalização" icon={<Palette size={16} className="text-white/80" />}>
        <Suspense fallback={<div className="flex items-center gap-2 text-xs py-8 justify-center" style={{ color: "rgba(13,4,70,0.5)" }}><Loader2 size={16} className="animate-spin" /> Carregando...</div>}>
          <LayoutCustomizer />
        </Suspense>
      </CollapsibleBox>}
        </div>
      </div>
    </div>
  );
}
