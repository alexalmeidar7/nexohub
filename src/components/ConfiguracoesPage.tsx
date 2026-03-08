import { useState, useEffect, useRef } from "react";
import { Save, Loader2, ChevronDown, ChevronUp, Plus, Trash2, Upload, Pencil, X, CheckCircle } from "lucide-react";
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

function CollapsibleBox({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.15)" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 transition-colors"
        style={{ backgroundColor: "#0d0446", color: "#ffffff" }}
      >
        <h3 className="text-lg font-semibold" style={{ color: "#ffffff" }}>{title}</h3>
        {open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="p-5 space-y-4" style={{ backgroundColor: "#ffffff" }}>{children}</div>}
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

  useEffect(() => {
    if (user) getEmpresaConfig(user.id).then(c => { setConfig(c); setLoading(false); });
    loadCanais();
  }, []);

  const loadCanais = async () => {
    setLoadingCanais(true);
    const { data } = await supabase.from("streaming_channels").select("*").order("numero_canal", { ascending: true });
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
    const payload: any = {
      name: canalMode === "catalog" ? (canalForm.name || canalForm.catalog_name) : canalForm.name,
      logo_url: canalForm.logo_url, cover_url: canalForm.cover_url,
      background_url: canalForm.background_url,
      url: canalForm.url, type: canalMode === "catalog" ? "catalog" : canalForm.type,
      catalog_name: canalMode === "catalog" ? canalForm.catalog_name : "",
      numero_canal: canalForm.numero_canal,
      is_hd: canalForm.is_hd, is_stereo: canalForm.is_stereo,
      classificacao_etaria: canalForm.classificacao_etaria,
    };
    setSavingCanal(true);
    if (editingCanal) {
      const { error } = await supabase.from("streaming_channels").update(payload).eq("id", editingCanal);
      setSavingCanal(false);
      if (error) { toast.error("Erro ao atualizar."); }
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
  };

  const handleEditCanal = (c: Canal) => {
    const isCatalog = c.type === "catalog";
    setCanalMode(isCatalog ? "catalog" : "live");
    setCanalForm({ numero_canal: String(c.numero_canal), name: c.name, logo_url: c.logo_url, cover_url: c.cover_url, background_url: c.background_url || "", url: c.url, type: isCatalog ? "audio_live" : c.type, catalog_name: c.catalog_name || "", is_hd: c.is_hd, is_stereo: c.is_stereo, classificacao_etaria: c.classificacao_etaria || "L" });
    setEditingCanal(c.id);
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
    <div className="animate-fade-in space-y-6 max-w-3xl">

      {/* Box 1: Configurações da Empresa */}
      {(section === "all" || section === "empresa") && <CollapsibleBox title="Configurações da Empresa">
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
          {field("Telefone Comercial", "telefoneComercial", "(00) 0000-0000")}
          {field("Telefone Participação", "telefoneParticipacao", "(00) 0000-0000")}
          {field("Site", "site", "https://www.exemplo.com")}
          {field("Instagram", "instagram", "https://instagram.com/empresa")}
          {field("Facebook", "facebook", "https://facebook.com/empresa")}
          {field("YouTube", "youtube", "https://youtube.com/empresa")}
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
      {(section === "all" || section === "player") && <CollapsibleBox title="Configurações do Player" defaultOpen={section === "player"}>
        <div className="space-y-6">
          {/* ── Header + Mode ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h3 className="text-lg font-bold" style={{ color: "#0d0446" }}>
              {editingCanal ? "✏️ Editar Canal" : "➕ Novo Canal"}
            </h3>
            <div className="flex rounded-full overflow-hidden" style={{ border: "2px solid #0d0446" }}>
              <button
                onClick={() => { setCanalMode("live"); setCanalForm(p => ({ ...p, type: "audio_live" })); }}
                className="px-4 py-1.5 text-xs font-bold transition-all"
                style={{ backgroundColor: canalMode === "live" ? "#0d0446" : "#ffffff", color: canalMode === "live" ? "#ffffff" : "#0d0446" }}
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
                className="px-4 py-1.5 text-xs font-bold transition-all"
                style={{ backgroundColor: canalMode === "catalog" ? "#0d0446" : "#ffffff", color: canalMode === "catalog" ? "#ffffff" : "#0d0446", borderLeft: "2px solid #0d0446" }}
              >
                📁 Catálogo
              </button>
            </div>
          </div>

          {/* ── Seção 1: Informações do Canal ── */}
          <fieldset className="rounded-xl p-4 space-y-3" style={{ border: "1px solid rgba(13,4,70,0.12)", backgroundColor: "rgba(13,4,70,0.02)" }}>
            <legend className="text-xs font-bold px-2 uppercase tracking-wider" style={{ color: "#0d0446" }}>Informações do Canal</legend>

            {canalMode === "live" ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold" style={{ color: "#0d0446" }}>Tipo de Transmissão</label>
                  <select value={canalForm.type} onChange={(e) => setCanalForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-4 py-1.5 outline-none text-sm"
                    style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "2px solid #0d0446" }}>
                    <option value="audio_live">Áudio ao vivo</option>
                    <option value="video_live">Vídeo ao vivo</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold" style={{ color: "#0d0446" }}>Nº do Canal</label>
                  <StyledInput value={canalForm.numero_canal} onChange={(e) => setCanalForm(p => ({ ...p, numero_canal: e.target.value }))} placeholder="Ex: 01" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold" style={{ color: "#0d0446" }}>Nome do Canal</label>
                  <StyledInput value={canalForm.name} onChange={(e) => setCanalForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Rádio FM" />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <label className="block text-xs font-semibold" style={{ color: "#0d0446" }}>URL do Streaming</label>
                  <StyledInput value={canalForm.url} onChange={(e) => setCanalForm(p => ({ ...p, url: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold" style={{ color: "#0d0446" }}>Tipo de Transmissão</label>
                  <div className="w-full px-4 py-1.5 text-sm" style={{ backgroundColor: "rgba(13,4,70,0.08)", color: "#0d0446", borderRadius: "20px", border: "2px solid rgba(13,4,70,0.2)" }}>
                    Gravado
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold" style={{ color: "#0d0446" }}>Nº do Canal</label>
                  <StyledInput value={canalForm.numero_canal} onChange={(e) => setCanalForm(p => ({ ...p, numero_canal: e.target.value }))} placeholder="Ex: 01" />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-semibold" style={{ color: "#0d0446" }}>Nome do Catálogo</label>
                  <StyledInput value={canalForm.catalog_name} onChange={(e) => setCanalForm(p => ({ ...p, catalog_name: e.target.value }))} placeholder="Ex: Podcasts" />
                </div>
                <div className="space-y-1 sm:col-span-3">
                  <label className="block text-xs font-semibold" style={{ color: "#0d0446" }}>URL da Playlist do YouTube</label>
                  <StyledInput value={canalForm.url} onChange={(e) => setCanalForm(p => ({ ...p, url: e.target.value }))} placeholder="https://youtube.com/playlist?list=..." />
                </div>
              </div>
            )}
          </fieldset>

          {/* ── Seção 2: Imagens ── */}
          <fieldset className="rounded-xl p-4 space-y-3" style={{ border: "1px solid rgba(13,4,70,0.12)", backgroundColor: "rgba(13,4,70,0.02)" }}>
            <legend className="text-xs font-bold px-2 uppercase tracking-wider" style={{ color: "#0d0446" }}>{canalMode === "catalog" ? "Imagens do Catálogo" : "Imagens do Canal"}</legend>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { key: "cover_url" as const, label: canalMode === "catalog" ? "Capa do Catálogo" : "Capa do Canal", hint: "1280 × 720", alt: "Capa" },
                { key: "logo_url" as const, label: canalMode === "catalog" ? "Thumb do Catálogo" : "Thumb do Canal", hint: "1920 × 1080", alt: "Thumb" },
                { key: "background_url" as const, label: canalMode === "catalog" ? "Logo do Catálogo" : "Logo do Canal", hint: "Transparente (PNG)", alt: "Logo" },
              ] as const).map(img => (
                <div key={img.key} className="flex flex-col items-center gap-2 p-3 rounded-lg" style={{ border: "1px dashed rgba(13,4,70,0.15)", backgroundColor: "#ffffff" }}>
                  {(canalForm as any)[img.key] ? (
                    <img src={(canalForm as any)[img.key]} alt={img.alt} className="w-full h-20 rounded-lg object-cover" style={{ border: "1px solid rgba(13,4,70,0.1)" }} />
                  ) : (
                    <div className="w-full h-20 rounded-lg flex items-center justify-center" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                      <Upload size={20} style={{ color: "rgba(13,4,70,0.2)" }} />
                    </div>
                  )}
                  <span className="text-xs font-semibold text-center" style={{ color: "#0d0446" }}>{img.label}</span>
                  <span className="text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>{img.hint}</span>
                  <button onClick={() => handleImageUpload(img.key)}
                    className="px-3 py-1 font-bold transition-all text-xs flex items-center gap-1 rounded-full"
                    style={btnSecondary}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
                  >
                    <Upload size={10} /> {(canalForm as any)[img.key] ? "Trocar" : "Upload"}
                  </button>
                </div>
              ))}
            </div>
          </fieldset>

          {/* ── Seção 3: Especificações + Ação ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex flex-wrap items-center gap-5">
              <label className="flex items-center gap-2 cursor-pointer" style={{ color: "#0d0446" }}>
                <input type="checkbox" checked={canalForm.is_hd} onChange={(e) => setCanalForm(p => ({ ...p, is_hd: e.target.checked }))}
                  className="w-4 h-4" style={{ accentColor: "#0d0446" }} />
                <span className="text-sm font-medium">HD</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer" style={{ color: "#0d0446" }}>
                <input type="checkbox" checked={canalForm.is_stereo} onChange={(e) => setCanalForm(p => ({ ...p, is_stereo: e.target.checked }))}
                  className="w-4 h-4" style={{ accentColor: "#0d0446" }} />
                <span className="text-sm font-medium">Áudio Estéreo</span>
              </label>
            </div>
            <div className="flex items-center gap-2">
              {editingCanal && (
                <button onClick={resetCanalForm}
                  className="px-4 py-2 font-bold transition-all flex items-center gap-1 rounded-full"
                  style={btnSecondary}
                >
                  <X size={14} /> Cancelar
                </button>
              )}
              <button onClick={handleAddCanal} disabled={savingCanal}
                className="px-6 py-2 font-bold transition-all flex items-center gap-2 disabled:opacity-70 rounded-full"
                style={btnPrimary}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
              >
                {savingCanal ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> {editingCanal ? "Salvar Alterações" : "Adicionar Canal"}</>}
              </button>
            </div>
          </div>
        </div>

        {/* Lista de canais — table style matching ApresentadorForm */}
        {loadingCanais ? (
          <div className="flex items-center gap-2 text-sm mt-4" style={{ color: "rgba(13,4,70,0.5)" }}><Loader2 size={14} className="animate-spin" /> Carregando canais...</div>
        ) : canais.length === 0 ? (
          <p className="text-sm mt-4" style={{ color: "rgba(13,4,70,0.5)" }}>Nenhum canal cadastrado.</p>
        ) : (
          <div className="mt-6">
            <h4 className="text-lg font-medium mb-4" style={{ color: "#0d0446" }}>Canais Cadastrados</h4>
            <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
              <table className="w-full text-sm" style={{ color: "#0d0446" }}>
                <thead>
                  <tr style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
                    <th className="px-4 py-2 text-left font-semibold">Canal</th>
                    <th className="px-4 py-2 text-left font-semibold">Nome</th>
                    <th className="px-4 py-2 text-left font-semibold">Tipo</th>
                    <th className="px-4 py-2 text-center font-semibold">Capa</th>
                    <th className="px-4 py-2 text-center font-semibold">Thumb</th>
                    <th className="px-4 py-2 text-center font-semibold">Editar</th>
                    <th className="px-4 py-2 text-center font-semibold">Excluir</th>
                  </tr>
                </thead>
                <tbody>
                  {canais.map((c, i) => (
                    <tr key={c.id} style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f8fc", borderTop: "1px solid rgba(13,4,70,0.08)" }}>
                      <td className="px-4 py-2">{c.type === "catalog" ? "—" : c.numero_canal || "—"}</td>
                      <td className="px-4 py-2 font-medium">
                        {c.name}
                        {c.catalog_name ? <span className="text-xs ml-1" style={{ color: "rgba(13,4,70,0.45)" }}>({c.catalog_name})</span> : null}
                      </td>
                      <td className="px-4 py-2">{typeLabels[c.type] || c.type}</td>
                      <td className="px-4 py-2 text-center">
                        {c.cover_url ? <CheckCircle size={16} className="inline" style={{ color: "#22c55e" }} /> : <span style={{ color: "rgba(13,4,70,0.25)" }}>—</span>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {c.logo_url ? <CheckCircle size={16} className="inline" style={{ color: "#22c55e" }} /> : <span style={{ color: "rgba(13,4,70,0.25)" }}>—</span>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => handleEditCanal(c)} title="Editar" className="hover:opacity-70 transition-opacity">
                          <Pencil size={14} style={{ color: "#0d0446" }} />
                        </button>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <button onClick={() => handleRemoveCanal(c.id)} title="Remover" className="hover:opacity-70 transition-opacity">
                          <Trash2 size={14} style={{ color: "#dc2626" }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CollapsibleBox>}
    </div>
  );
}
