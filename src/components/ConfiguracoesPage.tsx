import { useState, useEffect, useRef } from "react";
import { Save, Loader2, ChevronDown, ChevronUp, Plus, Trash2, Upload, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

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
}

export async function getEmpresaConfig(): Promise<EmpresaConfig> {
  const { data } = await supabase.from("empresa_config").select("*").maybeSingle();
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
  };
}

interface Canal {
  id: string;
  numero_canal: string;
  name: string;
  logo_url: string;
  cover_url: string;
  url: string;
  type: string;
  active: boolean;
}

function CollapsibleBox({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-muted/60 hover:bg-muted transition-colors"
      >
        <h3 className="text-lg font-semibold text-primary">{title}</h3>
        {open ? <ChevronUp size={18} className="text-muted-foreground" /> : <ChevronDown size={18} className="text-muted-foreground" />}
      </button>
      {open && <div className="p-5 space-y-4">{children}</div>}
    </div>
  );
}

export default function ConfiguracoesPage() {
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
  const [canalForm, setCanalForm] = useState({ numero_canal: "", name: "", logo_url: "", cover_url: "", url: "", type: "audio_live" });
  const [savingCanal, setSavingCanal] = useState(false);
  const [editingCanal, setEditingCanal] = useState<string | null>(null);

  useEffect(() => {
    getEmpresaConfig().then(c => { setConfig(c); setLoading(false); });
    loadCanais();
  }, []);

  const loadCanais = async () => {
    setLoadingCanais(true);
    const { data } = await supabase.from("streaming_channels").select("*").order("numero_canal", { ascending: true });
    if (data) setCanais(data.map((d: any) => ({
      id: d.id, numero_canal: d.numero_canal || "", name: d.name, logo_url: d.logo_url || "",
      cover_url: d.cover_url || "", url: d.url, type: d.type, active: d.active,
    })));
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

  const handleLogoUpload = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => saveConfig({ ...config, logo: ev.target?.result as string });
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleBackgroundUpload = () => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => saveConfig({ ...config, backgroundUrl: ev.target?.result as string });
      reader.readAsDataURL(file);
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

  const handleImageUpload = (field: "logo_url" | "cover_url") => {
    const input = document.createElement("input");
    input.type = "file"; input.accept = "image/*";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => setCanalForm(prev => ({ ...prev, [field]: ev.target?.result as string }));
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const handleAddCanal = async () => {
    if (!user || !canalForm.name || !canalForm.url) { toast.error("Preencha Nome e URL do canal."); return; }
    setSavingCanal(true);
    if (editingCanal) {
      const { error } = await supabase.from("streaming_channels").update({
        numero_canal: canalForm.numero_canal, name: canalForm.name,
        logo_url: canalForm.logo_url, cover_url: canalForm.cover_url, url: canalForm.url, type: canalForm.type,
      }).eq("id", editingCanal);
      setSavingCanal(false);
      if (error) { toast.error("Erro ao atualizar canal."); }
      else { toast.success("Canal atualizado!"); resetCanalForm(); loadCanais(); }
    } else {
      const { error } = await supabase.from("streaming_channels").insert([{
        user_id: user.id, numero_canal: canalForm.numero_canal, name: canalForm.name,
        logo_url: canalForm.logo_url, cover_url: canalForm.cover_url, url: canalForm.url, type: canalForm.type,
      }]);
      setSavingCanal(false);
      if (error) { toast.error("Erro ao salvar canal."); }
      else { toast.success("Canal adicionado!"); resetCanalForm(); loadCanais(); }
    }
  };

  const resetCanalForm = () => {
    setCanalForm({ numero_canal: "", name: "", logo_url: "", cover_url: "", url: "", type: "audio_live" });
    setEditingCanal(null);
  };

  const handleEditCanal = (c: Canal) => {
    setCanalForm({ numero_canal: String(c.numero_canal), name: c.name, logo_url: c.logo_url, cover_url: c.cover_url, url: c.url, type: c.type });
    setEditingCanal(c.id);
  };

  const handleRemoveCanal = async (id: string) => {
    await supabase.from("streaming_channels").delete().eq("id", id);
    toast.success("Canal removido."); loadCanais();
  };

  const field = (label: string, key: keyof EmpresaConfig, placeholder: string) => (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-muted-foreground">{label}</label>
      <input
        value={(config[key] as string) || ""}
        onChange={(e) => saveConfig({ ...config, [key]: e.target.value })}
        placeholder={placeholder}
        className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary text-sm"
      />
    </div>
  );

  if (loading) return <div className="flex items-center gap-2 text-muted-foreground"><Loader2 size={16} className="animate-spin" /> Carregando...</div>;

  const typeLabels: Record<string, string> = { audio_live: "Áudio ao vivo", video: "Vídeo ao vivo", youtube: "Vídeo do YouTube" };

  return (
    <div className="animate-fade-in space-y-6 max-w-3xl">

      {/* Box 1: Configurações da Empresa */}
      <CollapsibleBox title="Configurações da Empresa">
        <div className="space-y-4">
          {field("Nome da Empresa", "nome", "Nome da empresa")}
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Logo da Empresa</label>
            <div className="flex items-center gap-4">
              {config.logo && <img src={config.logo} alt="Logo" className="w-16 h-16 rounded-lg object-contain border border-border" />}
              <button onClick={handleLogoUpload} className="bg-muted border border-border px-4 py-2 rounded-lg text-foreground hover:bg-muted/80 transition-all text-xs">
                {config.logo ? "Trocar Logo" : "Carregar Logo"}
              </button>
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
        <div className="border-t border-border pt-4 mt-4 space-y-3">
          <h4 className="text-sm font-semibold text-muted-foreground">Gestão de Acesso</h4>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">E-mail de Login</label>
            <input value={user?.email || ""} readOnly className="w-full bg-muted/50 border border-border p-3 rounded-lg text-foreground/70 text-sm cursor-not-allowed" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Alterar Senha</label>
            <div className="flex gap-2">
              <input
                type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha (mín. 6 caracteres)"
                className="flex-1 bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary text-sm"
              />
              <button onClick={handleChangePassword} disabled={savingPassword}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50">
                {savingPassword ? <Loader2 size={14} className="animate-spin" /> : "Salvar"}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2">
          <Save size={12} />
          <span>As configurações são salvas automaticamente.</span>
        </div>
      </CollapsibleBox>

      {/* Box 2: Cadastro de Canais */}
      <CollapsibleBox title="Cadastro de Canais" defaultOpen={false}>
        {/* Formulário */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Número do Canal</label>
            <input value={canalForm.numero_canal} onChange={(e) => setCanalForm(p => ({ ...p, numero_canal: e.target.value as any }))}
              className="w-full bg-muted border border-border p-3 rounded-lg text-foreground text-sm outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Nome do Canal</label>
            <input value={canalForm.name} onChange={(e) => setCanalForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Rádio FM"
              className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Logo do Canal</label>
            <div className="flex items-center gap-2">
              {canalForm.logo_url && <img src={canalForm.logo_url} alt="Logo" className="w-10 h-10 rounded object-contain border border-border" />}
              <button onClick={() => handleImageUpload("logo_url")} className="bg-muted border border-border px-3 py-2 rounded-lg text-foreground hover:bg-muted/80 text-xs flex items-center gap-1">
                <Upload size={12} /> {canalForm.logo_url ? "Trocar" : "Upload"}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Thumb do Canal</label>
            <div className="flex items-center gap-2">
              {canalForm.cover_url && <img src={canalForm.cover_url} alt="Thumb" className="w-10 h-10 rounded object-contain border border-border" />}
              <button onClick={() => handleImageUpload("cover_url")} className="bg-muted border border-border px-3 py-2 rounded-lg text-foreground hover:bg-muted/80 text-xs flex items-center gap-1">
                <Upload size={12} /> {canalForm.cover_url ? "Trocar" : "Upload"}
              </button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Tipo de Transmissão</label>
            <select value={canalForm.type} onChange={(e) => setCanalForm(p => ({ ...p, type: e.target.value }))}
              className="w-full bg-muted border border-border p-3 rounded-lg text-foreground text-sm outline-none focus:ring-1 focus:ring-primary">
              <option value="audio_live">Áudio ao vivo</option>
              <option value="video">Vídeo ao vivo</option>
              <option value="youtube">Vídeo do YouTube</option>
            </select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">
              {canalForm.type === "youtube" ? "URL da playlist do YouTube" : "URL do Streaming"}
            </label>
            <input value={canalForm.url} onChange={(e) => setCanalForm(p => ({ ...p, url: e.target.value }))} placeholder={canalForm.type === "youtube" ? "https://youtube.com/playlist?list=..." : "https://..."}
              className="w-full bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground text-sm outline-none focus:ring-1 focus:ring-primary" />
          </div>
          <div className="flex items-end gap-2 sm:col-span-2">
            <button onClick={handleAddCanal} disabled={savingCanal}
              className="bg-primary text-primary-foreground px-5 py-3 rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2 flex-1 justify-center">
              {savingCanal ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> {editingCanal ? "Salvar Alterações" : "Adicionar Canal"}</>}
            </button>
            {editingCanal && (
              <button onClick={resetCanalForm} className="bg-muted border border-border px-5 py-3 rounded-lg text-sm font-semibold text-foreground hover:bg-muted/80 transition-colors">
                Cancelar
              </button>
            )}
          </div>
        </div>

        {/* Lista de canais */}
        {loadingCanais ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 size={14} className="animate-spin" /> Carregando canais...</div>
        ) : canais.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum canal cadastrado.</p>
        ) : (
          <div className="space-y-2 mt-4">
            <h4 className="text-sm font-semibold text-muted-foreground">Canais Cadastrados</h4>
            {canais.map(c => (
              <div key={c.id} className="flex items-center gap-3 bg-muted/40 border border-border rounded-lg p-3">
                {c.logo_url ? <img src={c.logo_url} alt="" className="w-8 h-8 rounded object-contain" /> : <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">{c.numero_canal}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{typeLabels[c.type] || c.type} • Canal {c.numero_canal}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleEditCanal(c)} className="text-primary hover:text-primary/80 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => handleRemoveCanal(c.id)} className="text-destructive hover:text-destructive/80 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CollapsibleBox>
    </div>
  );
}
