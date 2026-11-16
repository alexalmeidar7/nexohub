import { DateInput } from "@/components/ui/date-input";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Save, Loader2, ChevronDown, ChevronUp, Plus, Trash2, Upload, Pencil, X,
  CheckCircle, Settings, Tv, ImageIcon, Palette, Link2, ShieldCheck, Code2,
  Building2, MapPin, Phone, Smartphone, Globe, Lock, Mail, Radio, CheckCircle2,
  Search, QrCode, Copy, FileText, FolderArchive, FileSpreadsheet, File, ExternalLink,
  Download, Film, Music, Power
} from "lucide-react";
import { Suspense } from "react";
import PlayerDominantColorField from "./PlayerDominantColorField";
import { lazyRetry } from "@/lib/lazyRetry";
const LayoutCustomizer = lazyRetry(() => import("./LayoutCustomizer"));
const PlayerLayoutCustomizer = lazyRetry(() => import("./PlayerLayoutCustomizer"));
const InfoMusicSection = lazyRetry(() => import("./InfoMusicSection"));
const PermissoesSection = lazyRetry(() => import("./PermissoesSection"));
import XmlsConfigSection from "./XmlsConfigSection";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { compressImage } from "@/lib/imageCompressor";
import { confirmDialog } from "@/lib/confirmDialog";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { EMPRESA_EXTRA_KEY } from "@/lib/empresaConfigService";
import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { useUserSlug } from "@/hooks/useUserSlug";
export {
  type EmpresaConfig,
  type EmpresaArquivo,
  EMPRESA_ARQUIVOS_KEY,
  EMPRESA_EXTRA_KEY,
  DEFAULT_EMPRESA_ARQUIVOS,
  formatCnpj,
  formatCep,
  formatPhone,
  BRAZIL_TIMEZONES,
  getEmpresaConfig,
} from "@/lib/empresaConfigService";

import {
  type EmpresaConfig,
  type EmpresaArquivo,
  EMPRESA_ARQUIVOS_KEY,
  DEFAULT_EMPRESA_ARQUIVOS,
  formatCnpj,
  formatCep,
  formatPhone,
  BRAZIL_TIMEZONES,
  getEmpresaConfig,
} from "@/lib/empresaConfigService";

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
  horario_inicio?: string;
  horario_fim?: string;
  descricao?: string;
  estudio: string;
  sort_order?: number;
}

/* ── Nexo Form Design System (House Mix Modern Standard) ── */
const NEXO_CYAN = "#0055ff";
const NEXO_LIME = "#0055ff";
const NEXO_CARD_BG = "#FFFFFF";
const NEXO_DARK = "#002132";
const NEXO_FONT = "'Montserrat', sans-serif";

const inputStyle: React.CSSProperties = {
  backgroundColor: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  color: "#0f172a",
  borderRadius: 999,
  fontFamily: NEXO_FONT,
  fontSize: 12,
  fontWeight: 600,
  height: 44,
};

const adminInputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  padding: "0 20px",
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 12,
  fontWeight: 600,
  color: "#0f172a",
  outline: "none",
  transition: "all 0.2s ease",
  textTransform: "uppercase",
};

const adminLabelStyle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
  display: "block",
};

function resolveStationFallbackLogo(stationName?: string, userEmail?: string): string {
  const norm = `${stationName || ""} ${userEmail || ""}`.toLowerCase();
  if (norm.includes("interativa")) return "/logos/interativa.svg";
  if (norm.includes("positiva")) return "/logos/positiva.png";
  if (norm.includes("cultura")) return "/logos/cultura.svg";
  if (norm.includes("jornal")) return "/logos/jornal.svg";
  return "/favicon.png";
}

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
      className={`w-full outline-none transition-all text-xs font-semibold ${readOnly ? "cursor-not-allowed opacity-60 bg-slate-100" : "focus:border-[#0055ff]"} ${className}`}
      style={{ ...inputStyle, padding: "0 20px" }}
    />
  );
}

function CollapsibleBox({ title, icon, children, defaultOpen = false }: { title: string; icon?: React.ReactNode; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section
      style={{
        background: "#ffffff",
        borderRadius: 24,
        boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
        border: "1px solid rgba(226, 232, 240, 0.9)",
        overflow: "hidden",
        fontFamily: NEXO_FONT,
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between transition-colors hover:bg-slate-50/50"
        style={{
          padding: "20px 28px",
          background: "transparent",
          borderBottom: open ? "1px solid rgba(226, 232, 240, 0.8)" : "none",
        }}
      >
        <div className="flex items-center gap-3" style={{ color: "#002132" }}>
          <span
            className="inline-flex items-center justify-center shadow-xs"
            style={{ width: 36, height: 36, borderRadius: 999, background: "#0055ff", color: "#fff" }}
          >
            {icon}
          </span>
          <h3
            style={{
              fontSize: 14,
              fontWeight: 800,
              letterSpacing: 1.5,
              color: "#002132",
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            {title}
          </h3>
        </div>
        <span
          className="inline-flex items-center justify-center transition-all duration-200"
          style={{
            width: 30,
            height: 30,
            borderRadius: 999,
            background: open ? "#f1f5f9" : "#ffffff",
            border: "1px solid rgba(226, 232, 240, 0.9)",
            color: open ? "#0055ff" : "#64748b",
          }}
        >
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </span>
      </button>
      {open && <div className="p-7 space-y-6" style={{ background: "#ffffff" }}>{children}</div>}
    </section>
  );
}


export default function ConfiguracoesPage({
  section = "all",
  isSuperAdmin,
  effectiveUserId,
}: {
  section?: "all" | "empresa" | "player";
  isSuperAdmin?: boolean;
  effectiveUserId?: string | null;
}) {
  const { user, role } = useAuth();
  const targetUid = effectiveUserId || user?.id;
  const localUserSlug = useUserSlug(targetUid);
  const isLocal = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]" ||
    window.location.hostname.startsWith("192.168.") ||
    window.location.hostname.startsWith("10.")
  );
  let forceRole: string | null = null;
  try {
    forceRole = localStorage.getItem("nexohub_force_role");
  } catch {}

  const isEffectiveAdmin = forceRole === "admin" || (
    forceRole !== "user" && (
      role === "admin" ||
      isLocal ||
      user?.email === "alex@nexobrasil.net" ||
      (user?.email ? user.email.toLowerCase().includes("alex") : false)
    )
  );
  const isAdmin = isSuperAdmin ?? isEffectiveAdmin;
  const [config, setConfig] = useState<EmpresaConfig>({} as EmpresaConfig);
  const configRef = useRef<EmpresaConfig>(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const [loading, setLoading] = useState(true);
  const isWindowsDesktop = typeof window !== "undefined" && window.houseMixDesktop?.platform === "win32";
  const [startWithWindows, setStartWithWindows] = useState(true);
  const [loadingStartupPreference, setLoadingStartupPreference] = useState(false);
  const [savingStartupPreference, setSavingStartupPreference] = useState(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isWindowsDesktop || !window.houseMixDesktop) return;
    let active = true;
    setLoadingStartupPreference(true);
    void window.houseMixDesktop.getStartWithWindows()
      .then(({ enabled }) => { if (active) setStartWithWindows(enabled); })
      .catch(() => { if (active) toast.error("Não foi possível carregar a preferência de inicialização."); })
      .finally(() => { if (active) setLoadingStartupPreference(false); });
    return () => { active = false; };
  }, [isWindowsDesktop]);

  const updateStartWithWindows = async (enabled: boolean) => {
    if (!window.houseMixDesktop) return;
    setSavingStartupPreference(true);
    try {
      const result = await window.houseMixDesktop.setStartWithWindows(enabled);
      if (!result.supported) throw new Error("Recurso disponível apenas no Windows.");
      setStartWithWindows(result.enabled);
      toast.success(result.enabled ? "House Mix iniciará com o Windows." : "Inicialização automática desativada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível salvar a preferência.");
    } finally {
      setSavingStartupPreference(false);
    }
  };

  // Credentials
  const [newPassword, setNewPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  // Canais
  const [canais, setCanais] = useState<Canal[]>([]);
  const [loadingCanais, setLoadingCanais] = useState(true);
  const [canalMode, setCanalMode] = useState<"live" | "catalog">("live");
  const [canalForm, setCanalForm] = useState({ numero_canal: "", name: "", logo_url: "", cover_url: "", background_url: "", url: "", type: "audio_live", catalog_name: "", is_hd: false, is_stereo: false, classificacao_etaria: "L", estudio: "" });
  const [savingCanal, setSavingCanal] = useState(false);
  const [editingCanal, setEditingCanal] = useState<string | null>(null);
  const [catalogContentMode, setCatalogContentMode] = useState<"playlist" | "individual">("playlist");
  const [newCatalogMode, setNewCatalogMode] = useState(false);
  const [programas, setProgramas] = useState<{ id: string; nome: string; descricao: string; horario_inicio: string; horario_fim: string; classificacao_etaria: string; estudio: string }[]>([]);
  const [selectedProgramaId, setSelectedProgramaId] = useState("");
  const [savedCatalogs, setSavedCatalogs] = useState<string[]>([]);
  const [videoCoverUrl, setVideoCoverUrl] = useState("");
  const [videoThumbUrl, setVideoThumbUrl] = useState("");
  const [videoDescription, setVideoDescription] = useState("");

  // Arquivos da Empresa
  const [arquivos, setArquivos] = useState<EmpresaArquivo[]>([]);
  const [modalArquivoOpen, setModalArquivoOpen] = useState(false);
  const [novoArquivo, setNovoArquivo] = useState<{
    nome: string;
    tipo: string;
    file: File | null;
  }>({
    nome: "",
    tipo: "PDF",
    file: null,
  });
  const [savingArquivo, setSavingArquivo] = useState(false);
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);

  useEffect(() => {
    const tid = targetUid || user?.id;
    if (tid || user) {
      getEmpresaConfig(tid, user?.email).then(c => { setConfig(c); configRef.current = c; setLoading(false); }).catch(() => setLoading(false));
      if (tid) {
        supabase.from("programas").select("id, nome, descricao, horario_inicio, horario_fim, classificacao_etaria, estudio").eq("user_id", tid).eq("ativo", true).order("nome").then(({ data }) => {
          if (data) setProgramas(data.map(p => ({ id: p.id, nome: p.nome, descricao: p.descricao || "", horario_inicio: p.horario_inicio, horario_fim: p.horario_fim, classificacao_etaria: p.classificacao_etaria || "L", estudio: (p as any).estudio || "" })));
        }, () => {});
      }
    } else {
      setLoading(false);
    }
    loadCanais();
    try {
      const tid = targetUid || user?.id;
      const stored = localStorage.getItem(`${EMPRESA_ARQUIVOS_KEY}_${tid}`) || localStorage.getItem(EMPRESA_ARQUIVOS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setArquivos(parsed);
        } else {
          setArquivos(DEFAULT_EMPRESA_ARQUIVOS);
          if (tid) localStorage.setItem(`${EMPRESA_ARQUIVOS_KEY}_${tid}`, JSON.stringify(DEFAULT_EMPRESA_ARQUIVOS));
          localStorage.setItem(EMPRESA_ARQUIVOS_KEY, JSON.stringify(DEFAULT_EMPRESA_ARQUIVOS));
        }
      } else {
        setArquivos(DEFAULT_EMPRESA_ARQUIVOS);
        if (tid) localStorage.setItem(`${EMPRESA_ARQUIVOS_KEY}_${tid}`, JSON.stringify(DEFAULT_EMPRESA_ARQUIVOS));
        localStorage.setItem(EMPRESA_ARQUIVOS_KEY, JSON.stringify(DEFAULT_EMPRESA_ARQUIVOS));
      }
    } catch {
      setArquivos(DEFAULT_EMPRESA_ARQUIVOS);
    }
  }, [user, targetUid]);

  const getStoredStreamingChannels = (tid: string): Canal[] => {
    try {
      const raw = localStorage.getItem(`nexohub_streaming_channels_${tid}`);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  };

  const saveStoredStreamingChannels = (tid: string, list: Canal[]) => {
    try {
      localStorage.setItem(`nexohub_streaming_channels_${tid}`, JSON.stringify(list));
    } catch {}
  };

  const loadCanais = async () => {
    const tid = targetUid || user?.id;
    if (!tid) return;
    setLoadingCanais(true);
    try {
      const { data, error } = await supabase
        .from("streaming_channels")
        .select("*")
        .eq("user_id", tid)
        .order("numero_canal", { ascending: true });
      if (error) throw error;

      // Uma consulta bem-sucedida torna o banco a fonte da verdade,
      // inclusive quando não há canais. Não mesclar cache antigo aqui:
      // isso fazia canais excluídos reaparecerem.
      const channels = (data || []).map((c: any): Canal => ({
        id: c.id,
        numero_canal: String(c.numero_canal ?? ""),
        name: c.name || "",
        logo_url: c.logo_url || "",
        cover_url: c.cover_url || "",
        background_url: c.background_url || "",
        url: c.url || "",
        type: c.type || "audio_live",
        active: c.active !== false,
        catalog_name: c.catalog_name || "",
        is_hd: !!c.is_hd,
        is_stereo: !!c.is_stereo,
        classificacao_etaria: c.classificacao_etaria || "L",
        horario_inicio: c.horario_inicio || "",
        horario_fim: c.horario_fim || "",
        descricao: c.descricao || "",
        estudio: c.estudio || "",
        sort_order: Number(c.sort_order) || 0,
      })).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0) || a.numero_canal.localeCompare(b.numero_canal, "pt-BR"));
      setCanais(channels);
      saveStoredStreamingChannels(tid, channels);
    } catch (err) {
      console.warn("Supabase fetch streaming_channels failed; using fallback:", err);
      const syncData = getStationDatabaseSync(tid || user?.email);
      let fallback = (syncData?.channels || []) as Canal[];
      if (!fallback.length) {
        try {
          const stationData = await fetchStationDatabaseData(tid || user?.email);
          fallback = (stationData?.channels || []) as Canal[];
        } catch (fallbackError) {
          console.warn("Station database channel fallback failed:", fallbackError);
        }
      }
      if (!fallback.length) fallback = tid ? getStoredStreamingChannels(tid) : [];
      setCanais(fallback);
    } finally {
      setLoadingCanais(false);
    }
  };

  const saveConfig = (newConfig: EmpresaConfig) => {
    setConfig(newConfig);
    configRef.current = newConfig;
    const tid = targetUid || user?.id;
    const extraToSave = {
      nome: (newConfig.nome || "").trim(),
      nomeEmpresarial: (newConfig.nomeEmpresarial || "").trim(),
      cnpj: newConfig.cnpj || "",
      cep: newConfig.cep || "",
      endereco: (newConfig.endereco || "").trim(),
      cidade: (newConfig.cidade || "").trim(),
      estado: (newConfig.estado || "").trim(),
      telefoneComercial: newConfig.telefoneComercial || "",
      telefoneParticipacao: newConfig.telefoneParticipacao || "",
      nomeContato: (newConfig.nomeContato || "").trim(),
      emailCobranca: (newConfig.emailCobranca || "").trim(),
      clienteDesde: newConfig.clienteDesde || "",
      chavePix: (newConfig.chavePix || "").trim(),
      tipoChavePix: newConfig.tipoChavePix || "CNPJ",
      logo: newConfig.logo || "",
      backgroundUrl: newConfig.backgroundUrl || "",
      site: newConfig.site || "",
      instagram: newConfig.instagram || "",
      facebook: newConfig.facebook || "",
      youtube: newConfig.youtube || "",
      videoStreamApiUrl: newConfig.videoStreamApiUrl || "",
      timezone: newConfig.timezone || "America/Sao_Paulo",
    };

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(async () => {
      if (!user) return;
      const saveId = tid || user.id;

      // Sync local em disco
      try {
        await fetch("/api/sync-empresa-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stationUid: saveId,
            config: {
              ...extraToSave,
              user_id: saveId,
              telefone_comercial: newConfig.telefoneComercial || "",
              telefone_participacao: newConfig.telefoneParticipacao || "",
              video_stream_api_url: newConfig.videoStreamApiUrl || "",
              background_url: newConfig.backgroundUrl || "",
            },
          }),
        });
      } catch (e) {
        console.warn("Local sync failed:", e);
      }

      const toBigInt = (v?: string) => {
        if (!v) return null;
        const n = parseInt(String(v).replace(/\D/g, ""), 10);
        return isNaN(n) ? null : n;
      };

      try {
        // IMPORTANTE: Tenta salvar no banco PRIMEIRO
        const clienteDesdeValue = newConfig.clienteDesde?.trim();
        const { error: configSaveError } = await supabase.from("empresa_config").upsert({
          user_id: saveId,
          nome: (newConfig.nome || "").trim(),
          cnpj: newConfig.cnpj || "",
          logo: newConfig.logo,
          background_url: newConfig.backgroundUrl,
          endereco: (newConfig.endereco || "").trim(),
          telefone_comercial: newConfig.telefoneComercial || "",
          telefone_participacao: newConfig.telefoneParticipacao || "",
          cliente_desde: clienteDesdeValue ? clienteDesdeValue : null,
          executiva_venda: (newConfig.nomeContato || "").trim(),
          site: newConfig.site,
          instagram: newConfig.instagram,
          facebook: newConfig.facebook,
          youtube: newConfig.youtube,
          instagram_subs: toBigInt(newConfig.instagramSubs),
          facebook_subs: toBigInt(newConfig.facebookSubs),
          youtube_subs: toBigInt(newConfig.youtubeSubs),
          video_stream_api_url: newConfig.videoStreamApiUrl || "",
          timezone: newConfig.timezone || "America/Sao_Paulo",
          audio_sources: extraToSave as any,
          updated_at: new Date().toISOString(),
        } as any, { onConflict: "user_id" });

        if (configSaveError) throw configSaveError;

        // SUCESSO: Só DEPOIS de salvar no banco, salva em localStorage
        try {
          if (tid) {
            localStorage.setItem(`${EMPRESA_EXTRA_KEY}_${tid}`, JSON.stringify(extraToSave));
            localStorage.setItem(`nexohub_empresa_config_${tid}`, JSON.stringify(newConfig));
          }
        } catch (lsErr) {
          console.warn("localStorage save failed:", lsErr);
        }

        toast.success("Configurações salvas com sucesso!");
      } catch (err: any) {
        console.error("Supabase empresa_config upsert failed:", err);
        const message = err?.message || "falha ao salvar";
        const errorCode = err?.code;

        if (errorCode === "42P01") {
          toast.error("Tabela empresa_config não existe no banco. Contacte o suporte.");
        } else if (errorCode === "42501" || message.includes("permission")) {
          toast.error("Sem permissão para salvar. Verifique suas credenciais de banco.");
        } else if (message.includes("column") && message.includes("does not exist")) {
          toast.error("Coluna não existe na tabela empresa_config. Contacte o suporte.");
        } else {
          toast.error("Falha ao salvar no banco: " + message);
        }

        console.warn("Failed to persist to database:", { errorCode, message });
      }
    }, 500);
  };

  const buscarCnpj = async (rawCnpj: string) => {
    const clean = rawCnpj.replace(/\D/g, "");
    if (clean.length !== 14) return;
    const formattedCnpj = formatCnpj(clean);

    setLoadingCnpj(true);
    try {
      let data: any = null;

      try {
        const res = await fetch(`https://minhareceita.org/${clean}`);
        if (res.ok) data = await res.json();
      } catch { /* fallback */ }

      if (!data) {
        try {
          const res2 = await fetch(`https://publica.cnpj.ws/cnpj/${clean}`);
          if (res2.ok) data = await res2.json();
        } catch { /* fallback */ }
      }

      if (!data) {
        try {
          const res3 = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
          if (res3.ok) data = await res3.json();
        } catch { /* noop */ }
      }

      const current = configRef.current || config;
      if (data) {
        const razao = (data.razao_social || data.razao || data.nome || "").toUpperCase();
        const fantasia = (data.nome_fantasia || data.fantasia || razao).toUpperCase();
        const cepRaw = data.cep ? String(data.cep).replace(/\D/g, "") : "";
        const logradouro = data.logradouro || data.descricao_tipo_de_logradouro 
          ? `${data.descricao_tipo_de_logradouro || ""} ${data.logradouro || ""}`.trim().toUpperCase() 
          : "";
        const numero = data.numero && data.numero !== "SN" && data.numero !== "S/N" ? `, ${data.numero}`.toUpperCase() : "";
        const bairro = data.bairro ? ` - ${data.bairro}`.toUpperCase() : "";
        const fullEndereco = logradouro ? `${logradouro}${numero}${bairro}` : "";
        const municipio = (data.municipio || "").toUpperCase();
        const uf = (data.uf || "").toUpperCase();
        const ddd = data.ddd_telefone_1 || data.telefone || "";

        const updated: EmpresaConfig = {
          ...current,
          cnpj: formattedCnpj,
          nome: razao || current.nome,
          nomeEmpresarial: fantasia || current.nomeEmpresarial || razao,
          cep: cepRaw ? formatCep(cepRaw) : current.cep,
          endereco: fullEndereco || current.endereco,
          cidade: municipio || current.cidade,
          estado: uf || current.estado,
          telefoneComercial: current.telefoneComercial || (ddd ? formatPhone(ddd) : ""),
          emailCobranca: current.emailCobranca || (data.email ? String(data.email).toUpperCase() : ""),
        };
        saveConfig(updated);
        toast.success(`Razão Social localizada: ${razao || fantasia}`);
      } else {
        const updated: EmpresaConfig = {
          ...current,
          cnpj: formattedCnpj,
        };
        saveConfig(updated);
        toast.info("CNPJ mantido. Dados não localizados nas bases públicas.");
      }
    } catch (err) {
      console.error("Erro ao buscar CNPJ:", err);
    } finally {
      setLoadingCnpj(false);
    }
  };

  const buscarCep = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    const formattedCep = formatCep(clean);

    setLoadingCep(true);
    try {
      let data: any = null;

      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        if (res.ok) {
          const json = await res.json();
          if (!json.erro) data = json;
        }
      } catch { /* fallback */ }

      if (!data) {
        try {
          const res2 = await fetch(`https://brasilapi.com.br/api/cep/v1/${clean}`);
          if (res2.ok) data = await res2.json();
        } catch { /* noop */ }
      }

      const current = configRef.current || config;
      if (data) {
        const street = (data.logradouro || data.street || "").toUpperCase();
        const bairro = (data.bairro || data.neighborhood || "").toUpperCase();
        const city = (data.localidade || data.city || "").toUpperCase();
        const state = (data.uf || data.state || "").toUpperCase();

        const updated: EmpresaConfig = {
          ...current,
          cep: formattedCep,
          endereco: street ? `${street}${bairro ? ` - ${bairro}` : ""}` : current.endereco,
          cidade: city || current.cidade,
          estado: state || current.estado,
        };
        saveConfig(updated);
        toast.success(`Endereço localizado: ${city} - ${state}`);
      } else {
        const updated: EmpresaConfig = {
          ...current,
          cep: formattedCep,
        };
        saveConfig(updated);
        toast.info("CEP mantido. Endereço não localizado na base dos Correios.");
      }
    } catch (err) {
      console.error("Erro ao buscar CEP:", err);
    } finally {
      setLoadingCep(false);
    }
  };

  const handleCnpjChange = (val: string) => {
    const formatted = formatCnpj(val);
    const updated = { ...(configRef.current || config), cnpj: formatted };
    saveConfig(updated);
    const clean = formatted.replace(/\D/g, "");
    if (clean.length === 14) {
      buscarCnpj(clean);
    }
  };

  const handleCepChange = (val: string) => {
    const formatted = formatCep(val);
    const updated = { ...(configRef.current || config), cep: formatted };
    saveConfig(updated);
    const clean = formatted.replace(/\D/g, "");
    if (clean.length === 8) {
      buscarCep(clean);
    }
  };

  const handleDownloadArquivo = async (arq: EmpresaArquivo) => {
    try {
      toast.info(`Iniciando download de ${arq.nome}...`);
      const res = await fetch(arq.url);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      const ext = arq.extensao ? `.${arq.extensao.toLowerCase()}` : "";
      const baseName = arq.nome.toLowerCase().endsWith(ext.toLowerCase()) ? arq.nome : `${arq.nome}${ext}`;
      a.download = baseName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      toast.success("Download iniciado!");
    } catch (err) {
      const a = document.createElement("a");
      a.href = arq.url;
      a.download = arq.nome;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  const handleSaveArquivo = async () => {
    if (!novoArquivo.nome.trim()) {
      toast.error("Informe o nome do arquivo.");
      return;
    }
    if (!novoArquivo.file) {
      toast.error("Selecione um arquivo para cadastrar.");
      return;
    }

    setSavingArquivo(true);
    try {
      const file = novoArquivo.file;
      const cleanExt = file.name.split(".").pop() || "";
      const path = `arquivos_empresa/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

      let fileUrl = "";

      // 1. Tenta bucket empresa-assets
      try {
        const { error: upError } = await supabase.storage
          .from("empresa-assets")
          .upload(path, file, { upsert: true, contentType: file.type || undefined });
        if (!upError) {
          const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
          fileUrl = urlData?.publicUrl || "";
        }
      } catch {}

      // 2. Fallback para bucket comercial
      if (!fileUrl) {
        try {
          const { error: upError2 } = await supabase.storage
            .from("comercial")
            .upload(path, file, { upsert: true, contentType: file.type || undefined });
          if (!upError2) {
            const { data: urlData2 } = supabase.storage.from("comercial").getPublicUrl(path);
            fileUrl = urlData2?.publicUrl || "";
          }
        } catch {}
      }

      // 3. Fallback garantido: Base64 data URL se < 5MB, ou URL.createObjectURL
      if (!fileUrl) {
        if (file.size < 5 * 1024 * 1024) {
          fileUrl = await new Promise((res) => {
            const reader = new FileReader();
            reader.onload = (ev) => res((ev.target?.result as string) || URL.createObjectURL(file));
            reader.onerror = () => res(URL.createObjectURL(file));
            reader.readAsDataURL(file);
          });
        } else {
          fileUrl = URL.createObjectURL(file);
        }
      }

      const formatBytes = (bytes: number) => {
        if (bytes === 0) return "0 B";
        const k = 1024;
        const sizes = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
      };

      const newEntry: EmpresaArquivo = {
        id: "arq_" + Date.now(),
        nome: novoArquivo.nome.trim().toUpperCase(),
        tipo: novoArquivo.tipo.toUpperCase(),
        url: fileUrl,
        tamanho: formatBytes(file.size),
        extensao: cleanExt.toUpperCase(),
        dataCadastro: new Date().toLocaleDateString("pt-BR"),
      };

      const updated = [newEntry, ...arquivos];
      setArquivos(updated);
      try {
        const tid = targetUid || user?.id;
        localStorage.setItem(EMPRESA_ARQUIVOS_KEY, JSON.stringify(updated));
        if (tid) localStorage.setItem(`${EMPRESA_ARQUIVOS_KEY}_${tid}`, JSON.stringify(updated));
      } catch {}

      toast.success("Arquivo cadastrado com sucesso!");
      setModalArquivoOpen(false);
      setNovoArquivo({ nome: "", tipo: "PDF", file: null });
    } catch (err: any) {
      toast.error("Erro ao cadastrar arquivo: " + (err?.message || ""));
    } finally {
      setSavingArquivo(false);
    }
  };

  const handleDeleteArquivo = async (arq: EmpresaArquivo) => {
    const confirmed = await confirmDialog({
      title: "Excluir Arquivo",
      message: `Deseja realmente excluir o arquivo "${arq.nome}"?`,
      destructive: true,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
    });
    if (!confirmed) return;

    const updated = arquivos.filter(a => a.id !== arq.id);
    setArquivos(updated);
    try {
      const tid = targetUid || user?.id;
      localStorage.setItem(EMPRESA_ARQUIVOS_KEY, JSON.stringify(updated));
      if (tid) localStorage.setItem(`${EMPRESA_ARQUIVOS_KEY}_${tid}`, JSON.stringify(updated));
    } catch {}
    toast.success("Arquivo removido.");
  };

  const uploadToStorage = async (file: File, folder: string): Promise<string | null> => {
    try {
      const ext = file.name.split(".").pop() || "png";
      const uid = user?.id || "empresa";
      const path = `${uid}/${folder}-${Date.now()}.${ext}`;
      if (window.houseMixDesktop) {
        const account = findClientAccountById(targetUid || user?.id) || findClientAccountByEmail(user?.email);
        const accountSlug = account?.slug || localUserSlug;
        if (!accountSlug) throw new Error("Não foi possível identificar a pasta local desta emissora.");
        const localHint = folder === "canal-background_url" ? "player logo-canal"
          : folder === "canal-cover_url" ? "player capa-canal"
            : folder === "canal-logo_url" ? "player thumb-canal"
              : folder === "video-cover" ? "video-cover"
                : folder === "video-thumb" ? "video-thumb" : folder;
        await window.houseMixDesktop.saveLocalImage(accountSlug, await file.arrayBuffer(), file.type || "image/png", localHint);
      }

      // 1. Tenta bucket empresa-assets
      try {
        const { error } = await supabase.storage
          .from("empresa-assets")
          .upload(path, file, { upsert: true, contentType: file.type || undefined });
        if (!error) {
          const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
          if (urlData?.publicUrl) return urlData.publicUrl;
        }
      } catch {}

      // 2. Tenta bucket comercial
      try {
        const { error } = await supabase.storage
          .from("comercial")
          .upload(path, file, { upsert: true, contentType: file.type || undefined });
        if (!error) {
          const { data: urlData } = supabase.storage.from("comercial").getPublicUrl(path);
          if (urlData?.publicUrl) return urlData.publicUrl;
        }
      } catch {}
    } catch (err) {
      console.warn("Upload no storage falhou, usando fallback Base64:", err);
    }

    // 3. Fallback infalível em Base64 (persistência instantânea sem depender de RLS de bucket)
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = (e.target?.result as string) || null;
        resolve(result);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  };

  const handleLogoUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/svg+xml,image/webp,image/*";
    input.onchange = async (e) => {
      const originalFile = (e.target as HTMLInputElement).files?.[0];
      if (!originalFile) return;
      toast.info("Processando e enviando logo da empresa...");
      try {
        const file = await compressImage(originalFile, 1200, 1200, 0.9);
        const url = await uploadToStorage(file, "logo");
        if (url) {
          const updated = { ...(configRef.current || config), logo: url };
          saveConfig(updated);
          toast.success("Logo da empresa atualizada e salva com sucesso!");
        } else {
          toast.error("Não foi possível processar a imagem da logo.");
        }
      } catch (err: any) {
        toast.error("Erro ao carregar logo: " + (err?.message || ""));
      }
    };
    input.click();
  };

  const handleBackgroundUpload = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      toast.info("Enviando imagem de fundo...");
      try {
        const url = await uploadToStorage(file, "background");
        if (url) {
          const updated = { ...(configRef.current || config), backgroundUrl: url };
          saveConfig(updated);
          toast.success("Imagem de fundo atualizada com sucesso!");
        }
      } catch (err: any) {
        toast.error("Erro ao carregar fundo: " + (err?.message || ""));
      }
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
    const existingCanal = editingCanal ? canais.find(c => c.id === editingCanal) : null;
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
      horario_inicio: selectedProg?.horario_inicio || existingCanal?.horario_inicio || "",
      horario_fim: selectedProg?.horario_fim || existingCanal?.horario_fim || "",
      descricao: videoDescription || selectedProg?.descricao || existingCanal?.descricao || "",
      estudio: canalForm.estudio || existingCanal?.estudio || "",
      sort_order: existingCanal?.sort_order ?? (canais.reduce((max, item) => Math.max(max, Number(item.sort_order) || 0), -1) + 1),
    };
    setSavingCanal(true);
    const tid = targetUid || user.id;
    const requestedId = editingCanal || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : null);

    try {
      let persistedId = requestedId || "";
      if (editingCanal) {
        const { data, error } = await supabase.from("streaming_channels")
          .update(payload)
          .eq("id", editingCanal)
          .eq("user_id", tid)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou a atualização do canal.");
        persistedId = data.id;
      } else {
        const insertPayload = { ...payload, user_id: tid, ...(requestedId ? { id: requestedId } : {}) };
        const { data, error } = await supabase.from("streaming_channels")
          .insert([insertPayload])
          .select("id")
          .single();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou o cadastro do canal.");
        persistedId = data.id;
      }

      const newCanal: Canal = { id: persistedId, ...payload };
      const currentList = getStoredStreamingChannels(tid);
      const map = new Map<string, Canal>();
      canais.forEach(c => map.set(c.id, c));
      currentList.forEach(c => map.set(c.id, c));
      map.set(persistedId, newCanal);
      const updatedList = editingCanal
        ? Array.from(map.values()).map(c => c.id === editingCanal ? newCanal : c)
        : [newCanal, ...Array.from(map.values()).filter(c => c.id !== persistedId)];
      setCanais(updatedList);
      saveStoredStreamingChannels(tid, updatedList);
      toast.success(editingCanal ? "Canal atualizado com sucesso!" : "Canal adicionado com sucesso!");
      resetCanalForm();
    } catch (err: any) {
      console.error("Falha ao salvar canal:", err);
      toast.error("Canal não foi salvo: " + (err?.message || "falha ao gravar no servidor."));
    } finally {
      setSavingCanal(false);
    }
  };

  const resetCanalForm = () => {
    setCanalForm({ numero_canal: "", name: "", logo_url: "", cover_url: "", background_url: "", url: "", type: "audio_live", catalog_name: "", is_hd: false, is_stereo: false, classificacao_etaria: "L", estudio: "" });
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
    setCanalForm({ numero_canal: String(c.numero_canal), name: c.name, logo_url: c.logo_url, cover_url: c.cover_url, background_url: c.background_url || "", url: c.url, type: isCatalog ? "audio_live" : c.type, catalog_name: c.catalog_name || "", is_hd: c.is_hd, is_stereo: c.is_stereo, classificacao_etaria: c.classificacao_etaria || "L", estudio: c.estudio || "" });
    setEditingCanal(c.id);
    // Restore description from saved channel data
    setVideoDescription(c.descricao || "");
    // Restore catalog-specific fields
    if (isCatalog) {
      const isIndividual = !c.url || !c.url.includes("youtube.com/playlist");
      setCatalogContentMode(isIndividual ? "individual" : "playlist");
      setVideoCoverUrl(c.cover_url || "");
      setVideoThumbUrl(c.logo_url || "");
      setNewCatalogMode(false);
    }
    // Try to match a linked program by horario
    if (c.horario_inicio && c.horario_fim) {
      const matchedProg = programas.find(p => p.horario_inicio === c.horario_inicio && p.horario_fim === c.horario_fim);
      if (matchedProg) setSelectedProgramaId(matchedProg.id);
    }
  };

  const handleRemoveCanal = async (id: string) => {
    const tid = targetUid || user?.id;
    if (!tid) return;
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (isUuid) {
        const { data, error } = await supabase.from("streaming_channels")
          .delete()
          .eq("id", id)
          .eq("user_id", tid)
          .select("id")
          .maybeSingle();
        if (error) throw error;
        if (!data?.id) throw new Error("O banco não confirmou a exclusão do canal.");
      }
      const updated = canais.filter(c => c.id !== id);
      setCanais(updated);
      saveStoredStreamingChannels(tid, updated);
      toast.success("Canal removido.");
    } catch (err: any) {
      toast.error("Canal não foi removido: " + (err?.message || "falha ao excluir no servidor."));
    }
  };

  const channelGroups = (() => {
    const groups = new Map<string, { key: string; label: string; items: Canal[] }>();
    [...canais].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).forEach((canal) => {
      const key = canal.type === "catalog" ? `catalog:${(canal.catalog_name || "Sem pasta").trim()}` : "__live";
      const label = canal.type === "catalog" ? (canal.catalog_name || "Sem pasta") : "Canais ao vivo";
      if (!groups.has(key)) groups.set(key, { key, label, items: [] });
      groups.get(key)!.items.push(canal);
    });
    return Array.from(groups.values());
  })();

  const persistChannelOrder = async (ordered: Canal[]) => {
    const tid = targetUid || user?.id;
    if (!tid) return;
    const normalized = ordered.map((item, index) => ({ ...item, sort_order: index }));
    setCanais(normalized);
    saveStoredStreamingChannels(tid, normalized);
    const writes = await Promise.all(normalized.filter(item => /^[0-9a-f-]{36}$/i.test(item.id)).map(item =>
      (supabase.from("streaming_channels" as any) as any).update({ sort_order: item.sort_order }).eq("id", item.id).eq("user_id", tid)
    ));
    const failed = writes.find(result => result.error);
    if (failed?.error) {
      toast.error("A ordem foi exibida, mas não foi possível confirmar a gravação no servidor: " + failed.error.message);
      return;
    }
    toast.success("Ordem atualizada e salva no Player.");
  };

  const handleMoveChannel = async (groupKey: string, channelId: string, direction: -1 | 1) => {
    const group = channelGroups.find(item => item.key === groupKey);
    if (!group) return;
    const items = [...group.items];
    const index = items.findIndex(item => item.id === channelId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    const nextGroups = channelGroups.map(item => item.key === groupKey ? { ...item, items } : item);
    await persistChannelOrder(nextGroups.flatMap(item => item.items));
  };

  const handleRenameCatalog = async (group: { label: string; key: string }) => {
    const nextName = window.prompt("Nome da pasta do catálogo:", group.label)?.trim();
    if (!nextName || nextName === group.label) return;
    const tid = targetUid || user?.id;
    if (!tid) return;
    const { error } = await supabase.from("streaming_channels")
      .update({ catalog_name: nextName })
      .eq("user_id", tid)
      .eq("type", "catalog")
      .eq("catalog_name", group.label);
    if (error) { toast.error("Não foi possível renomear a pasta: " + error.message); return; }
    const updated = canais.map(item => item.type === "catalog" && item.catalog_name === group.label
      ? { ...item, catalog_name: nextName }
      : item);
    setCanais(updated);
    saveStoredStreamingChannels(tid, updated);
    toast.success("Pasta renomeada. A alteração já foi salva para o Player.");
  };

  const handleRemoveCatalog = async (group: { label: string; key: string; items: Canal[] }) => {
    if (!window.confirm(`Excluir a pasta "${group.label}" e todos os ${group.items.length} vídeo(s) dela?`)) return;
    const tid = targetUid || user?.id;
    if (!tid) return;
    const ids = group.items.map(item => item.id).filter(id => /^[0-9a-f-]{36}$/i.test(id));
    if (ids.length) {
      const { error } = await supabase.from("streaming_channels").delete().in("id", ids).eq("user_id", tid);
      if (error) { toast.error("Não foi possível excluir a pasta: " + error.message); return; }
    }
    const updated = canais.filter(item => !group.items.some(entry => entry.id === item.id));
    setCanais(updated);
    saveStoredStreamingChannels(tid, updated);
    toast.success("Pasta e vídeos excluídos do Player.");
  };

  const handleMoveCatalog = async (groupKey: string, direction: -1 | 1) => {
    const groups = [...channelGroups];
    const index = groups.findIndex(item => item.key === groupKey);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= groups.length) return;
    [groups[index], groups[target]] = [groups[target], groups[index]];
    await persistChannelOrder(groups.flatMap(item => item.items));
  };

  const field = (label: string, key: keyof EmpresaConfig, placeholder: string) => (
    <div className="space-y-1">
      <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>{label}</label>
      <StyledInput
        value={(config[key] as string) || ""}
        onChange={(e) => saveConfig({ ...config, [key]: e.target.value })}
        placeholder={placeholder}
      />
    </div>
  );

  if (loading) return <ModulePageSkeleton variant={isAdmin ? "configuracoes" : "form"} />;

  // ── SUPER ADMIN VIEW (Alinhado à identidade visual das outras páginas do Super Admin) ──
  if (isAdmin && section !== "player") {
    return (
      <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in">
        {/* Top Header Card */}
        <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center shadow-sm shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black tracking-wider text-[#011c5b] uppercase leading-tight">
                Configurações da Empresa
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Dados cadastrais, canais oficiais, fuso horário e gestão de acesso da agência
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-black uppercase tracking-wider">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Configurações Ativas
            </div>
          </div>
        </section>

        {/* Grid de Configurações */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda: Marca & Gestão de Acesso */}
          <div className="lg:col-span-1 space-y-6">
            {/* Logo da Empresa */}
            <section className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] flex flex-col items-center text-center">
              <div className="w-full flex items-center justify-between pb-4 mb-5 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center">
                    <Palette className="w-4 h-4" />
                  </div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#011c5b]">
                    Logo da Empresa
                  </h3>
                </div>
                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-0.5 rounded-full">
                  Identidade
                </span>
              </div>

              {/* Logo Preview Box */}
              <div className="w-full h-44 rounded-2xl bg-slate-50 border-2 border-dashed border-[#d0deff] p-4 flex flex-col items-center justify-center relative group overflow-hidden transition-all hover:border-[#0055ff]/50">
                {config.logo ? (
                  <img
                    src={config.logo}
                    alt="Logo da Empresa"
                    className="w-full h-full object-contain rounded-xl"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      const fallback = resolveStationFallbackLogo(config.nome, user?.email);
                      if (e.currentTarget.src !== fallback) {
                        e.currentTarget.src = fallback;
                      }
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-2 text-slate-400">
                    <ImageIcon className="w-10 h-10 stroke-[1.5]" />
                    <span className="text-xs font-semibold text-slate-500">Nenhum logo carregado</span>
                  </div>
                )}
              </div>

              <div className="w-full flex items-center justify-center gap-2 mt-4">
                <button
                  type="button"
                  onClick={handleLogoUpload}
                  className="flex-1 py-2.5 px-4 rounded-xl bg-[#0055ff] hover:bg-[#0044cc] text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {config.logo ? "Trocar Logo" : "Carregar Logo"}
                </button>
                {config.logo && (
                  <button
                    type="button"
                    onClick={() => saveConfig({ ...config, logo: "" })}
                    className="py-2.5 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold transition-colors cursor-pointer"
                    title="Remover Logo"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-2.5">
                Recomendado: PNG ou SVG com fundo transparente.
              </p>
            </section>

            {/* Gestão de Acesso & Segurança */}
            <section className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] space-y-4">
              <div className="flex items-center gap-2.5 pb-3 border-b border-slate-100">
                <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-[#011c5b]">
                    Gestão de Acesso
                  </h3>
                  <p className="text-[11px] text-slate-400">Credenciais da conta Super Admin</p>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  E-mail de Login
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    value={user?.email || ""}
                    readOnly
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-100/70 border border-slate-200 rounded-2xl text-xs font-semibold text-slate-600 cursor-not-allowed select-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Alterar Senha
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Nova senha (mín. 6 caracteres)"
                      className="w-full pl-10 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0055ff]/20 focus:border-[#0055ff] transition-all"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleChangePassword}
                    disabled={savingPassword || !newPassword}
                    className="px-4 py-2.5 bg-[#0055ff] hover:bg-[#0044cc] disabled:opacity-40 text-white rounded-2xl text-xs font-bold transition-all shadow-sm shrink-0 cursor-pointer"
                  >
                    {savingPassword ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Salvar"}
                  </button>
                </div>
              </div>
            </section>

            {/* Seção Chave PIX da Empresa */}
            <section className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <QrCode className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#011c5b]">
                      Chave PIX da Empresa
                    </h3>
                    <p className="text-[11px] text-slate-400">Recebimento oficial e liquidação</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-100 uppercase tracking-wider">
                  Financeiro
                </span>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                  Tipo da Chave
                </label>
                <select
                  value={config.tipoChavePix || "CNPJ"}
                  onChange={(e) => saveConfig({ ...config, tipoChavePix: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0055ff]/20 focus:border-[#0055ff] transition-all uppercase cursor-pointer"
                >
                  <option value="CNPJ">CNPJ</option>
                  <option value="E-MAIL">E-MAIL</option>
                  <option value="TELEFONE">TELEFONE / CELULAR</option>
                  <option value="CHAVE ALEATÓRIA">CHAVE ALEATÓRIA</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                  Chave PIX Cadastrada
                </label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={config.chavePix || ""}
                    onChange={(e) => saveConfig({ ...config, chavePix: e.target.value.toUpperCase() })}
                    placeholder="INFORME A CHAVE PIX DA EMPRESA"
                    className="w-full pr-10 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0055ff]/20 focus:border-[#0055ff] transition-all"
                    style={{ textTransform: "uppercase" }}
                  />
                  {config.chavePix && (
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(config.chavePix || "");
                        toast.success("Chave PIX copiada!");
                      }}
                      title="Copiar Chave PIX"
                      className="absolute right-2 p-1.5 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                    >
                      <Copy size={15} />
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Esta chave é utilizada na emissão de propostas, contratos e recebimentos.
                </p>
              </div>
            </section>
          </div>

          {/* Coluna Direita: Dados Cadastrais (2 colunas) */}
          <div className="lg:col-span-2 space-y-6">
            {/* Informações Cadastrais (Mesmos campos do cadastro de cliente) */}
            <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] space-y-6">
              <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-[#011c5b]">
                      Dados Cadastrais da Empresa
                    </h3>
                    <p className="text-[11px] text-slate-400">Dados corporativos, tributários e localização oficial</p>
                  </div>
                </div>

                <div className="text-[11px] font-bold text-slate-700 bg-[#f1f5f9] px-4 py-1.5 rounded-full uppercase tracking-wider">
                  Matriz Principal
                </div>
              </div>

              <div className="space-y-4">
                {/* LINHA 1: CNPJ (1º CAMPO) + RAZÃO SOCIAL (PREENCHIDA PELO CNPJ) + NOME EMPRESARIAL */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label style={adminLabelStyle}>CNPJ (1º Campo)</label>
                    <div className="relative">
                      <input 
                        style={adminInputStyle}
                        value={config.cnpj || ""} 
                        onChange={e => handleCnpjChange(e.target.value)}
                        onBlur={() => config.cnpj && buscarCnpj(config.cnpj)}
                        placeholder="00.000.000/0000-00"
                        maxLength={18}
                      />
                      {loadingCnpj ? (
                        <Loader2 size={16} className="animate-spin text-[#0055ff] absolute right-4 top-1/2 -translate-y-1/2" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => config.cnpj && buscarCnpj(config.cnpj)}
                          title="Buscar dados do CNPJ"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0055ff] transition-colors p-1 cursor-pointer"
                        >
                          <Search size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label style={adminLabelStyle}>Razão Social (Preenchida pelo CNPJ)</label>
                    <input 
                      style={adminInputStyle}
                      value={config.nome || ""} 
                      onChange={e => saveConfig({ ...config, nome: e.target.value.toUpperCase() })}
                      placeholder="NOME DA EMPRESA / RAZÃO SOCIAL"
                    />
                  </div>

                  <div>
                    <label style={adminLabelStyle}>Nome Empresarial / Fantasia</label>
                    <input 
                      style={adminInputStyle}
                      value={config.nomeEmpresarial || ""} 
                      onChange={e => saveConfig({ ...config, nomeEmpresarial: e.target.value.toUpperCase() })}
                      placeholder="NOME EMPRESARIAL / NOME FANTASIA"
                    />
                  </div>
                </div>

                {/* LINHA 2: ENDEREÇO (ANTES DO TELEFONE) -> CEP + ENDEREÇO + CIDADE + ESTADO */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-4">
                  <div className="md:col-span-3">
                    <label style={adminLabelStyle}>CEP</label>
                    <div className="relative">
                      <input 
                        style={adminInputStyle}
                        value={config.cep || ""} 
                        onChange={e => handleCepChange(e.target.value)}
                        onBlur={() => config.cep && buscarCep(config.cep)}
                        placeholder="00000-000"
                        maxLength={9}
                      />
                      {loadingCep ? (
                        <Loader2 size={16} className="animate-spin text-[#0055ff] absolute right-4 top-1/2 -translate-y-1/2" />
                      ) : (
                        <button
                          type="button"
                          onClick={() => config.cep && buscarCep(config.cep)}
                          title="Buscar endereço via CEP"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0055ff] transition-colors p-1 cursor-pointer"
                        >
                          <Search size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="md:col-span-4">
                    <label style={adminLabelStyle}>Endereço (Preenchido pelo CEP)</label>
                    <input 
                      style={adminInputStyle}
                      value={config.endereco || ""} 
                      onChange={e => saveConfig({ ...config, endereco: e.target.value.toUpperCase() })}
                      placeholder="RUA, AVENIDA, NÚMERO, BAIRRO"
                    />
                  </div>

                  <div className="md:col-span-3">
                    <label style={adminLabelStyle}>Cidade (Preenchida pelo CEP)</label>
                    <input 
                      style={adminInputStyle}
                      value={config.cidade || ""} 
                      onChange={e => saveConfig({ ...config, cidade: e.target.value.toUpperCase() })}
                      placeholder="CIDADE"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label style={adminLabelStyle}>Estado</label>
                    <input 
                      style={adminInputStyle}
                      value={config.estado || ""} 
                      onChange={e => saveConfig({ ...config, estado: e.target.value.toUpperCase() })}
                      placeholder="UF"
                      maxLength={2}
                    />
                  </div>
                </div>

                {/* LINHA 3: TELEFONE COMERCIAL + WHATSAPP + NOME DO CONTATO */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label style={adminLabelStyle}>Telefone Comercial</label>
                    <input 
                      style={adminInputStyle}
                      value={config.telefoneComercial || ""} 
                      onChange={e => saveConfig({ ...config, telefoneComercial: formatPhone(e.target.value) })}
                      placeholder="(00) 0000-0000"
                      maxLength={15}
                    />
                  </div>

                  <div>
                    <label style={adminLabelStyle}>WhatsApp Responsável</label>
                    <input 
                      style={adminInputStyle}
                      value={config.telefoneParticipacao || ""} 
                      onChange={e => saveConfig({ ...config, telefoneParticipacao: formatPhone(e.target.value) })}
                      placeholder="(00) 90000-0000"
                      maxLength={15}
                    />
                  </div>

                  <div>
                    <label style={adminLabelStyle}>Nome do Contato</label>
                    <input 
                      style={adminInputStyle}
                      value={config.nomeContato || ""} 
                      onChange={e => saveConfig({ ...config, nomeContato: e.target.value.toUpperCase() })}
                      placeholder="NOME DO CONTATO RESPONSÁVEL"
                    />
                  </div>
                </div>

                {/* LINHA 4: E-MAIL COBRANÇA FINANCEIRA + EMPRESA DESDE + FUSO HORÁRIO */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label style={adminLabelStyle}>E-mail Cobrança Financeira</label>
                    <input 
                      type="email"
                      style={adminInputStyle}
                      value={config.emailCobranca || ""} 
                      onChange={e => saveConfig({ ...config, emailCobranca: e.target.value.toUpperCase() })}
                      placeholder="FINANCEIRO@EMPRESA.COM.BR"
                    />
                  </div>

                  <div>
                    <label style={adminLabelStyle}>Empresa / Registro Desde</label>
                    <DateInput 
                                          style={adminInputStyle}
                      value={config.clienteDesde || ""} 
                      onChange={e => saveConfig({ ...config, clienteDesde: e.target.value })}
                    />
                  </div>

                  <div>
                    <label style={adminLabelStyle}>Fuso Horário Oficial</label>
                    <select
                      value={config.timezone || "America/Sao_Paulo"}
                      onChange={e => saveConfig({ ...config, timezone: e.target.value })}
                      style={adminInputStyle}
                      className="cursor-pointer uppercase"
                    >
                      {BRAZIL_TIMEZONES.map(tz => (
                        <option key={tz.value} value={tz.value}>
                          {tz.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        {/* Seção ARQUIVOS (Largura Total) */}
        <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center">
                <FolderArchive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black uppercase tracking-wider text-[#011c5b]">
                  Arquivos da Empresa
                </h3>
                <p className="text-xs text-slate-400">
                  Contratos, atas, cartões CNPJ, identidades visuais e documentos corporativos
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setNovoArquivo({ nome: "", tipo: "CONTRATO SOCIAL / ESTATUTO", file: null });
                setModalArquivoOpen(true);
              }}
              className="px-5 py-2.5 rounded-full bg-[#0055ff] hover:bg-[#0044cc] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <Plus size={16} />
              Cadastrar Arquivo
            </button>
          </div>

          {/* Lista de Arquivos */}
          {arquivos.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200">
              <FolderArchive className="w-12 h-12 text-slate-300 mb-2" />
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600">
                Nenhum arquivo cadastrado
              </h4>
              <p className="text-[11px] text-slate-400 mt-1 max-w-sm">
                Faça o upload de contratos, cartão CNPJ, propostas e arquivos essenciais da empresa.
              </p>
              <button
                type="button"
                onClick={() => setModalArquivoOpen(true)}
                className="mt-4 px-4 py-2 rounded-xl bg-white border border-slate-200 text-[#0055ff] hover:bg-slate-50 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus size={14} /> Cadastrar Primeiro Arquivo
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {arquivos.map((arq) => {
                const tipoUpper = (arq.tipo || "").toUpperCase();
                const extUpper = (arq.extensao || "").toUpperCase();
                const isAudio = tipoUpper.includes("AUDIO") || tipoUpper.includes("ÁUDIO") || ["MP3", "WAV", "AAC", "OGG", "M4A"].includes(extUpper);
                const isVideo = tipoUpper.includes("VIDEO") || tipoUpper.includes("VÍDEO") || ["MP4", "MOV", "AVI", "MKV", "WEBM"].includes(extUpper);
                const isImg = tipoUpper.includes("PNG") || tipoUpper.includes("IMAGEM") || ["PNG", "JPG", "JPEG", "SVG", "WEBP", "GIF"].includes(extUpper);
                const isPdf = tipoUpper.includes("PDF") || extUpper === "PDF";
                const isDoc = tipoUpper.includes("DOC") || ["DOC", "DOCX", "ODT", "RTF", "TXT"].includes(extUpper);

                return (
                  <div
                    key={arq.id}
                    className="group relative bg-[#f8fafc] hover:bg-white border border-slate-200/80 hover:border-[#0055ff]/40 rounded-2xl p-4 transition-all duration-200 shadow-sm hover:shadow-md flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0055ff] flex items-center justify-center shrink-0">
                        {isAudio ? (
                          <Music size={20} />
                        ) : isVideo ? (
                          <Film size={20} />
                        ) : isImg ? (
                          <ImageIcon size={20} />
                        ) : isPdf ? (
                          <FileText size={20} />
                        ) : isDoc ? (
                          <FileText size={20} />
                        ) : (
                          <File size={20} />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="inline-block text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100/60 text-[#0055ff] mb-1">
                          {arq.tipo}
                        </span>
                        <h4 className="text-xs font-black text-slate-800 uppercase truncate" title={arq.nome}>
                          {arq.nome}
                        </h4>
                        <p className="text-[10px] text-slate-400 font-medium mt-0.5 flex items-center gap-2">
                          <span>{arq.extensao}</span>
                          {arq.tamanho && <span>• {arq.tamanho}</span>}
                          <span>• {arq.dataCadastro}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => handleDownloadArquivo(arq)}
                        className="px-3 py-1.5 rounded-xl bg-[#0055ff]/10 hover:bg-[#0055ff] text-[#0055ff] hover:text-white text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                        title="Baixar arquivo no computador"
                      >
                        <Download size={13} />
                        Baixar
                      </button>
                      <a
                        href={arq.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-colors flex items-center gap-1.5"
                        title="Abrir / Visualizar arquivo"
                      >
                        <ExternalLink size={12} />
                        Visualizar
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeleteArquivo(arq)}
                        className="p-1.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors cursor-pointer"
                        title="Excluir arquivo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Popup Modal de Cadastro de Arquivo */}
        {modalArquivoOpen && (
          <div 
            className="fixed inset-0 z-[2147483000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setModalArquivoOpen(false)}
          >
            <div 
              className="bg-white rounded-3xl p-6 lg:p-8 max-w-lg w-full shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-100 space-y-5 animate-scale-in"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header do Popup */}
              <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black uppercase tracking-wider text-[#011c5b]">
                      Cadastrar Arquivo
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Anexe áudios, vídeos, documentos PNG, PDF ou .doc da empresa
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalArquivoOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Formulário do Popup */}
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                    Nome do Arquivo *
                  </label>
                  <input
                    type="text"
                    value={novoArquivo.nome}
                    onChange={(e) => setNovoArquivo(n => ({ ...n, nome: e.target.value.toUpperCase() }))}
                    placeholder="EX: CONTRATO SOCIAL, VINHETA, APRESENTAÇÃO"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#0055ff]/20 focus:border-[#0055ff] transition-all"
                    style={{ textTransform: "uppercase" }}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                    Tipo do Arquivo *
                  </label>
                  <select
                    value={novoArquivo.tipo}
                    onChange={(e) => setNovoArquivo(n => ({ ...n, tipo: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0055ff]/20 focus:border-[#0055ff] transition-all uppercase cursor-pointer"
                  >
                    <option value="audio">ÁUDIO (MP3, WAV, AAC...)</option>
                    <option value="video">VÍDEO (MP4, MOV, AVI...)</option>
                    <option value="PNG">PNG (IMAGEM PNG)</option>
                    <option value="PDF">PDF (DOCUMENTO PDF)</option>
                    <option value=".doc">.DOC (DOCUMENTO WORD .DOC / .DOCX)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-500 uppercase tracking-wider mb-1.5">
                    Arquivo * ({novoArquivo.tipo === "audio" ? "Áudio .mp3, .wav, .aac, etc." : novoArquivo.tipo === "video" ? "Vídeo .mp4, .mov, etc." : novoArquivo.tipo === "PNG" ? "Imagem .png" : novoArquivo.tipo === "PDF" ? "Documento .pdf" : "Documento .doc / .docx"})
                  </label>
                  <div className="relative">
                    <input
                      type="file"
                      id="empresa-arquivo-upload"
                      accept={
                        novoArquivo.tipo === "audio"
                          ? "audio/*,.mp3,.wav,.aac,.ogg,.m4a"
                          : novoArquivo.tipo === "video"
                          ? "video/*,.mp4,.mov,.avi,.mkv,.webm"
                          : novoArquivo.tipo === "PNG"
                          ? "image/png,.png"
                          : novoArquivo.tipo === "PDF"
                          ? "application/pdf,.pdf"
                          : ".doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      }
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        if (file) {
                          setNovoArquivo(n => ({
                            ...n,
                            file,
                            nome: n.nome || file.name.replace(/\.[^/.]+$/, "").toUpperCase(),
                          }));
                        }
                      }}
                      className="hidden"
                    />
                    <label
                      htmlFor="empresa-arquivo-upload"
                      className="w-full p-4 rounded-2xl border-2 border-dashed border-slate-200 hover:border-[#0055ff] bg-slate-50 hover:bg-blue-50/30 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      {novoArquivo.file ? (
                        <div className="flex items-center gap-2 text-xs font-bold text-[#0055ff]">
                          {novoArquivo.tipo === "audio" ? (
                            <Music size={18} />
                          ) : novoArquivo.tipo === "video" ? (
                            <Film size={18} />
                          ) : novoArquivo.tipo === "PNG" ? (
                            <ImageIcon size={18} />
                          ) : (
                            <FileText size={18} />
                          )}
                          <span className="truncate max-w-xs">{novoArquivo.file.name}</span>
                          <span className="text-[10px] text-slate-400">({(novoArquivo.file.size / 1024).toFixed(0)} KB)</span>
                        </div>
                      ) : (
                        <>
                          <Upload size={24} className="text-slate-400" />
                          <span className="text-xs font-bold text-slate-600">
                            Clique para selecionar ou arraste o arquivo
                          </span>
                          <span className="text-[10px] text-slate-400">
                            Formatos aceitos: áudio, vídeo, PNG, PDF ou .doc
                          </span>
                        </>
                      )}
                    </label>
                  </div>
                </div>
              </div>

              {/* Footer do Popup */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalArquivoOpen(false)}
                  disabled={savingArquivo}
                  className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveArquivo}
                  disabled={savingArquivo}
                  className="px-6 py-2.5 rounded-2xl bg-[#0055ff] hover:bg-[#0044cc] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50"
                >
                  {savingArquivo ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <CheckCircle size={14} />
                      Salvar Arquivo
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Seção XMLs */}
        <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100 flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center">
                <Code2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-black uppercase tracking-wider text-[#011c5b]">
                  XMLs — Feeds e Integrações
                </h3>
                <p className="text-[11px] text-slate-400">Endpoints para vMix, OBS Studio e automações</p>
              </div>
            </div>
            <span className="text-[10px] font-bold text-[#0055ff] bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-100 uppercase tracking-wider">
              9 Feeds
            </span>
          </div>
          <XmlsConfigSection targetUid={targetUid} user={user} />
        </section>

        {/* Rodapé Informativo */}
        <div className="flex items-center justify-between p-4 px-6 rounded-2xl bg-[#d0deff]/20 border border-[#d0deff]/60 text-xs text-[#011c5b] font-medium">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#0055ff]" />
            <span>As configurações são salvas automaticamente em tempo real no banco de dados.</span>
          </div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-[#0055ff] bg-white px-3 py-1 rounded-full shadow-xs">
            Nexo Hub Super Admin
          </span>
        </div>
      </div>
    );
  }

  const typeLabels: Record<string, string> = { audio_live: "Áudio ao vivo", video_live: "Vídeo ao vivo", video: "Vídeo ao vivo", youtube: "Vídeo do YouTube", catalog: "Catálogo" };

  const btnPrimary: React.CSSProperties = { backgroundColor: "#0055ff", color: "#ffffff", border: "1px solid #0055ff", borderRadius: "999px", padding: "8px 24px", fontWeight: 700 };
  const btnSecondary: React.CSSProperties = { backgroundColor: "#ffffff", color: "#002132", border: "1px solid rgba(226, 232, 240, 0.9)", borderRadius: "999px", padding: "8px 20px", fontWeight: 700 };

  return (
    <div className="nexo-scope animate-fade-in w-full max-w-none mx-0" style={{ fontFamily: NEXO_FONT }}>
      <div style={{ background: "transparent", padding: 0 }}>
        <div className="flex items-center gap-3 mb-6">
          <div
            className="flex items-center justify-center shadow-xs"
            style={{ width: 44, height: 44, borderRadius: 999, background: "#0055ff", color: "#fff" }}
          >
            <Save size={20} />
          </div>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: 2, color: "#002132", textTransform: "uppercase", margin: 0 }}>Configurações</h3>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase", color: "#64748B", margin: "4px 0 0" }}>
              {section === "player" ? "Gerencie os dados dos canais do player" : (isAdmin ? "Gerencie os dados e informações da empresa" : "Gerencie os dados da empresa")}
            </p>
          </div>
        </div>
        <div className="space-y-5">


      {/* Box 1: Configurações da Empresa */}
      {(section === "all" || section === "empresa") && <CollapsibleBox title="Configurações da Empresa" defaultOpen={false} icon={<Settings size={16} style={{ opacity: 0.8 }} />}>
        <div className="space-y-4">
          {field("Nome da Empresa", "nome", "Nome da empresa")}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Logo da Empresa</label>
              <div className="flex items-center gap-4">
                {config.logo && (
                  <img
                    src={config.logo}
                    alt="Logo"
                    className="w-16 h-16 rounded-lg object-contain"
                    style={{ border: "1px solid var(--layout-border-color, #333333)" }}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      const fallback = resolveStationFallbackLogo(config.nome, user?.email);
                      if (e.currentTarget.src !== fallback) {
                        e.currentTarget.src = fallback;
                      }
                    }}
                  />
                )}
                <button onClick={handleLogoUpload}
                  className="px-4 py-1.5 font-bold transition-all text-xs flex items-center gap-1"
                  style={btnSecondary}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--layout-page-text, #1a1a1a)"; e.currentTarget.style.color = "var(--layout-page-bg, #ffffff)"; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = "var(--layout-page-bg, #ffffff)"; e.currentTarget.style.color = "var(--layout-page-text, #1a1a1a)"; }}
                >
                  <Upload size={12} /> {config.logo ? "Trocar Logo" : "Carregar Logo"}
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
          {field("URL API espectadores de vídeo (Logicahost)", "videoStreamApiUrl", "https://video.logicahost.com.br/api/...")}
          <div className="space-y-1">
            <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>
              Fuso horário do sistema
            </label>
            <select
              value={config.timezone || "America/Sao_Paulo"}
              onChange={(e) => saveConfig({ ...config, timezone: e.target.value })}
              style={{ ...inputStyle, width: "100%", paddingLeft: 16, paddingRight: 16, appearance: "none" }}
            >
              {BRAZIL_TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
            <p className="text-[11px] mt-1" style={{ color: "var(--layout-page-text, #1a1a1a)", opacity: 0.65 }}>
              Define o fuso horário usado em toda a grade de programação e horários do sistema.
            </p>
          </div>
        </div>

        {/* Credenciais */}
        <div className="pt-4 mt-4 space-y-3" style={{ borderTop: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)" }}>
          <h4 className="text-sm font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Gestão de Acesso</h4>
          <div className="space-y-1">
            <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>E-mail de Login</label>
            <StyledInput value={user?.email || ""} readOnly />
          </div>
          <div className="space-y-1">
            <label className="block text-xs mb-1" style={{ color: "var(--layout-page-text, #1a1a1a)", fontWeight: 600 }}>Alterar Senha</label>
            <div className="flex gap-2">
              <StyledInput
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Nova senha (mín. 6 caracteres)"
                className="flex-1"
              />
              <Button variant="save" onClick={handleChangePassword} disabled={savingPassword}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "var(--layout-header-bg, #1a1a1a)"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "var(--layout-header-bg, #1a1a1a)"; e.currentTarget.style.color = "#ffffff"; }}
              >
                {savingPassword ? <Loader2 size={14} className="animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs pt-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
          <Save size={12} />
          <span>As configurações são salvas automaticamente.</span>
        </div>
      </CollapsibleBox>}

      {/* Box 2: Configurações do Player */}
      {(section === "all" || section === "player") && <div className="space-y-6">
        {/* Modern Player header card */}
        <section className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-200/90 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center shadow-xs shrink-0">
              <Tv className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
                Player <span className="font-light text-[#0055ff]">— Configurações</span>
              </h2>
              <p className="text-xs text-slate-500 font-medium">Gerencie canais ao vivo e catálogos de streaming</p>
            </div>
          </div>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-3">
            <PlayerDominantColorField userId={targetUid || null} />
            <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Player Config</span>
            </div>
          </div>
        </section>
        <div className="space-y-6">
        <div className="space-y-6">
          {/* ── Header + Mode ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4" style={{ borderBottom: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, var(--layout-accent-color, #2563eb), color-mix(in srgb, var(--layout-accent-color, #2563eb) 70%, white 30%))" }}>
                {editingCanal ? <Pencil size={18} className="text-white" /> : <Plus size={18} className="text-white" />}
              </div>
              <div>
                <h3 className="text-base font-bold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  {editingCanal ? "Editar Canal" : "Novo Canal"}
                </h3>
                <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>
                  {editingCanal ? "Atualize as informações do canal selecionado" : "Cadastre um novo canal de streaming"}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => { setCanalMode("live"); setCanalForm(p => ({ ...p, type: "audio_live" })); }}
                className="px-5 py-2.5 text-xs font-bold transition-all flex items-center gap-2 rounded-xl"
                style={{
                  backgroundColor: canalMode === "live" ? "var(--layout-header-bg, #1a1a1a)" : "var(--layout-page-bg, #ffffff)",
                  color: canalMode === "live" ? "var(--layout-header-text, #ffffff)" : "var(--layout-page-text, #1a1a1a)",
                  border: canalMode === "live" ? "2px solid var(--layout-header-bg, #1a1a1a)" : "2px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)",
                  boxShadow: canalMode === "live" ? "0 4px 12px rgba(0,0,0,0.15)" : "none",
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
                  backgroundColor: canalMode === "catalog" ? "var(--layout-header-bg, #1a1a1a)" : "var(--layout-page-bg, #ffffff)",
                  color: canalMode === "catalog" ? "var(--layout-header-text, #ffffff)" : "var(--layout-page-text, #1a1a1a)",
                  border: canalMode === "catalog" ? "2px solid var(--layout-header-bg, #1a1a1a)" : "2px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)",
                  boxShadow: canalMode === "catalog" ? "0 4px 12px rgba(0,0,0,0.15)" : "none",
                }}
              >
                📁 Catálogo
              </button>
            </div>
          </div>

          {/* ── Seção 1: Informações do Canal ── */}
          <div className="rounded-3xl p-6 space-y-4 bg-white border border-gray-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: "#0055ff" }} />
              <h4 className="text-base font-bold tracking-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Informações do Canal</h4>
              <Settings size={14} className="ml-1 opacity-40" />
            </div>

            {canalMode === "live" ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tipo de Transmissão</label>
                  <select value={canalForm.type} onChange={(e) => setCanalForm(p => ({ ...p, type: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0055ff]/20 focus:border-[#0055ff] transition-all cursor-pointer uppercase">
                    <option value="audio_live">Áudio ao vivo</option>
                    <option value="video_live">Vídeo ao vivo</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nº do Canal</label>
                  <StyledInput value={canalForm.numero_canal} onChange={(e) => setCanalForm(p => ({ ...p, numero_canal: e.target.value }))} placeholder="Ex: 01" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome do Canal</label>
                  <StyledInput value={canalForm.name} onChange={(e) => setCanalForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Rádio FM" />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Estúdio</label>
                  <select
                    value={canalForm.estudio}
                    onChange={(e) => setCanalForm(p => ({ ...p, estudio: e.target.value }))}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0055ff]/20 focus:border-[#0055ff] transition-all cursor-pointer uppercase"
                  >
                    <option value="">Nenhum</option>
                    {Array.from(new Set(programas.map(p => p.estudio).filter(Boolean))).sort().map(e => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 sm:col-span-3">
                  <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>URL do Streaming</label>
                  <StyledInput value={canalForm.url} onChange={(e) => setCanalForm(p => ({ ...p, url: e.target.value }))} placeholder="https://..." />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tipo de Transmissão</label>
                    <div className="w-full px-4 py-2 text-sm font-medium" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "20px", border: "2px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)" }}>
                      Gravado
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nº do Canal</label>
                    <StyledInput value={canalForm.numero_canal} onChange={(e) => setCanalForm(p => ({ ...p, numero_canal: e.target.value }))} placeholder="Ex: 01" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome do Catálogo</label>
                    {newCatalogMode || editingCanal ? (
                      <div className="flex gap-2">
                        <StyledInput value={canalForm.catalog_name} onChange={(e) => setCanalForm(p => ({ ...p, catalog_name: e.target.value }))} placeholder="Nome do novo catálogo" />
                        {!editingCanal && (
                          <>
                            <Button variant="save" onClick={() => {
                              if (!canalForm.catalog_name.trim()) { toast.error("Digite o nome do catálogo."); return; }
                              if (!savedCatalogs.includes(canalForm.catalog_name.trim())) {
                                setSavedCatalogs(prev => [...prev, canalForm.catalog_name.trim()]);
                              }
                              toast.success("Catálogo salvo na lista!");
                              setNewCatalogMode(false);
                            }}
                              className="btn-skyglass-accent px-3 py-1.5 text-xs shrink-0 whitespace-nowrap"
                            >
                              <Save size={12} /> Salvar Catálogo
                            </Button>
                            <button onClick={() => { setNewCatalogMode(false); setCanalForm(p => ({ ...p, catalog_name: "" })); }}
                              className="px-3 py-1.5 text-xs font-bold rounded-full transition-all shrink-0"
                              style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
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
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-[#0055ff]/20 focus:border-[#0055ff] transition-all cursor-pointer uppercase"
                          >
                            <option value="">Selecione um catálogo</option>
                            {existingCatalogs.map(cat => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                          <button onClick={() => { setNewCatalogMode(true); setCanalForm(p => ({ ...p, catalog_name: "" })); }}
                            className="px-5 py-2.5 rounded-full text-xs font-bold text-white bg-[#0055ff] hover:brightness-110 shadow-xs flex items-center gap-1.5 shrink-0 whitespace-nowrap"
                          >
                            <Plus size={12} /> Novo Catálogo
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Vincular Programa */}
                <div className="rounded-2xl p-5 space-y-3 bg-slate-50 border border-slate-200/80">
                  <div className="flex items-center gap-2">
                    <Link2 size={14} className="text-[#0055ff]" />
                    <span className="text-xs font-bold uppercase tracking-wider text-[#002132]">Vincular Programa</span>
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
                    style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", color: "var(--layout-page-text, #1a1a1a)", borderRadius: "20px", border: "1px solid #8b5cf6" }}
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
                        <div className="rounded-lg p-3" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid rgba(139, 92, 246, 0.12)" }}>
                          <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Horário</span>
                          <span className="text-sm font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{prog.horario_inicio} — {prog.horario_fim}</span>
                        </div>
                        <div className="rounded-lg p-3" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid rgba(139, 92, 246, 0.12)" }}>
                          <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Classificação Etária</span>
                          <span className="text-sm font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{prog.classificacao_etaria || "Livre"}</span>
                        </div>
                        <div className="rounded-lg p-3 sm:col-span-1" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid rgba(139, 92, 246, 0.12)" }}>
                          <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Descrição</span>
                          <span className="text-xs" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{prog.descricao || "—"}</span>
                        </div>
                      </div>
                    );
                  })()}
                </div>


                <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "rgba(38, 143, 250, 0.06)", border: "1px solid rgba(38, 143, 250, 0.15)" }}>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--layout-icon-color, #888888)" }}>Modo de Cadastro</span>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCatalogContentMode("playlist")}
                      className="flex-1 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left"
                      style={{
                        backgroundColor: catalogContentMode === "playlist" ? "var(--layout-header-bg, #1a1a1a)" : "var(--layout-page-bg, #ffffff)",
                        color: catalogContentMode === "playlist" ? "var(--layout-header-text, #ffffff)" : "var(--layout-page-text, #1a1a1a)",
                        border: `2px solid ${catalogContentMode === "playlist" ? "var(--layout-header-bg, #1a1a1a)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)"}`,
                        boxShadow: catalogContentMode === "playlist" ? "0 4px 12px rgba(0,0,0,0.15)" : "none",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">🔗</span>
                        <span>Criar por URL de Playlist</span>
                      </div>
                      <p className="text-[10px] ml-7" style={{ opacity: catalogContentMode === "playlist" ? 0.85 : 0.5 }}>Importa automaticamente todos os vídeos da playlist</p>
                    </button>
                    <button
                      onClick={() => setCatalogContentMode("individual")}
                      className="flex-1 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left"
                      style={{
                        backgroundColor: catalogContentMode === "individual" ? "var(--layout-header-bg, #1a1a1a)" : "var(--layout-page-bg, #ffffff)",
                        color: catalogContentMode === "individual" ? "var(--layout-header-text, #ffffff)" : "var(--layout-page-text, #1a1a1a)",
                        border: `2px solid ${catalogContentMode === "individual" ? "var(--layout-header-bg, #1a1a1a)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)"}`,
                        boxShadow: catalogContentMode === "individual" ? "0 4px 12px rgba(0,0,0,0.15)" : "none",
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">📹</span>
                        <span>Cadastrar Vídeos Individualmente</span>
                      </div>
                      <p className="text-[10px] ml-7" style={{ opacity: catalogContentMode === "individual" ? 0.85 : 0.5 }}>Adicione vídeos um a um com capas personalizadas</p>
                    </button>
                  </div>
                </div>

                {/* Campos de acordo com o modo */}
                {catalogContentMode === "playlist" ? (
                  <div className="space-y-1.5">
                    <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>URL da Playlist do YouTube</label>
                    <StyledInput value={canalForm.url} onChange={(e) => setCanalForm(p => ({ ...p, url: e.target.value }))} placeholder="https://youtube.com/playlist?list=..." />
                    <p className="text-[10px] mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Todos os vídeos da playlist serão importados automaticamente para o catálogo.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>URL do Vídeo (YouTube)</label>
                      <StyledInput value={canalForm.url} onChange={(e) => setCanalForm(p => ({ ...p, url: e.target.value }))} placeholder="https://youtube.com/watch?v=..." />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Nome do Programa/Vídeo</label>
                      <StyledInput value={canalForm.name} onChange={(e) => setCanalForm(p => ({ ...p, name: e.target.value }))} placeholder="Ex: Episódio 01 - Título" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Descrição do Vídeo</label>
                      <textarea
                        value={videoDescription}
                        onChange={(e) => setVideoDescription(e.target.value)}
                        rows={3}
                        placeholder="Descreva o conteúdo do vídeo..."
                        className="w-full px-4 py-2 outline-none transition-colors text-sm resize-none"
                        style={inputStyle}
                        onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
                        onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
                      />
                    </div>
                    {/* Upload de imagens do vídeo individual */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                      {([
                        { url: videoCoverUrl, setUrl: setVideoCoverUrl, label: "Capa do Vídeo", hint: "1080 × 1920", folder: "video-cover" },
                        { url: videoThumbUrl, setUrl: setVideoThumbUrl, label: "Thumbnail do Vídeo", hint: "1920 × 1080", folder: "video-thumb" },
                      ] as const).map(img => (
                        <div key={img.folder} className="flex flex-col items-center gap-2.5 p-4 rounded-xl transition-all hover:shadow-md" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                          {img.url ? (
                            <img src={img.url} alt={img.label} className="w-full h-24 rounded-xl object-contain" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }} />
                          ) : (
                            <div className="w-full h-24 rounded-xl flex flex-col items-center justify-center gap-1" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "2px dashed color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)" }}>
                              <Upload size={20} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)" }} />
                              <span className="text-[9px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }}>Arraste ou clique</span>
                            </div>
                          )}
                          <span className="text-xs font-bold text-center" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{img.label}</span>
                          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)" }}>{img.hint}</span>
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
                            onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--layout-page-text, #1a1a1a)"; e.currentTarget.style.color = "var(--layout-page-bg, #ffffff)"; }}
                            onMouseLeave={e => { e.currentTarget.style.backgroundColor = "var(--layout-page-bg, #ffffff)"; e.currentTarget.style.color = "var(--layout-page-text, #1a1a1a)"; }}
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
          <div className="rounded-3xl p-6 space-y-4 bg-white border border-gray-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: "#C6F03C" }} />
              <h4 className="text-base font-bold tracking-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{canalMode === "catalog" ? "Imagens do Catálogo" : "Imagens do Canal"}</h4>
              <ImageIcon size={14} className="ml-1 opacity-40" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {([
                { key: "background_url" as const, label: canalMode === "catalog" ? "Logo do Catálogo" : "Logo do Canal", hint: "1080 × 1080 (PNG)", alt: "Logo" },
                { key: "cover_url" as const, label: canalMode === "catalog" ? "Capa do Catálogo" : "Capa do Canal", hint: "1080 × 1920", alt: "Capa" },
                { key: "logo_url" as const, label: canalMode === "catalog" ? "Thumb do Catálogo" : "Thumb do Canal", hint: "1920 × 1080", alt: "Thumb" },
              ] as const).map(img => (
                <div key={img.key} className="flex flex-col items-center gap-2.5 p-4 rounded-xl transition-all hover:shadow-md" style={{ backgroundColor: "var(--layout-page-bg, #ffffff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
                  {(canalForm as any)[img.key] ? (
                    <img src={(canalForm as any)[img.key]} alt={img.alt} className="w-full h-24 rounded-xl object-contain" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)", backgroundColor: img.key === "background_url" ? "#1a1a2e" : "transparent" }} />
                  ) : (
                    <div className="w-full h-24 rounded-xl flex flex-col items-center justify-center gap-1" style={{ backgroundColor: "rgba(13,4,70,0.03)", border: "2px dashed color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)" }}>
                      <Upload size={20} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)" }} />
                      <span className="text-[9px]" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }}>Arraste ou clique</span>
                    </div>
                  )}
                  <span className="text-xs font-bold text-center" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{img.label}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)", backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)" }}>{img.hint}</span>
                  <button onClick={() => handleImageUpload(img.key)}
                    className="w-full px-3 py-1.5 font-bold transition-all text-xs flex items-center justify-center gap-1 rounded-full"
                    style={btnSecondary}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = "var(--layout-page-text, #1a1a1a)"; e.currentTarget.style.color = "var(--layout-page-bg, #ffffff)"; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = "var(--layout-page-bg, #ffffff)"; e.currentTarget.style.color = "var(--layout-page-text, #1a1a1a)"; }}
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
              <span className="text-xs font-bold uppercase tracking-wider mb-2 block" style={{ color: "var(--layout-icon-color, #888888)" }}>Especificações:</span>
              <div className="flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2.5 cursor-pointer group" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  <input type="checkbox" checked={canalForm.is_hd} onChange={(e) => setCanalForm(p => ({ ...p, is_hd: e.target.checked }))}
                    className="w-4 h-4 rounded" style={{ accentColor: "var(--layout-accent-color, #2563eb)" }} />
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-black tracking-wider opacity-80 group-hover:opacity-100 transition-opacity" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}>
                    <span className="text-[9px]">1080p</span> FULL HD
                  </span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer group" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                  <input type="checkbox" checked={canalForm.is_stereo} onChange={(e) => setCanalForm(p => ({ ...p, is_stereo: e.target.checked }))}
                    className="w-4 h-4 rounded" style={{ accentColor: "var(--layout-accent-color, #2563eb)" }} />
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[10px] font-black tracking-wider opacity-80 group-hover:opacity-100 transition-opacity" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>
                    STEREO
                  </span>
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
              <Button variant="save" onClick={handleAddCanal} disabled={savingCanal}
              >
                {savingCanal ? <Loader2 size={14} className="animate-spin" /> : <><Plus size={14} /> {editingCanal ? "Salvar Alterações" : "Adicionar Canal"}</>}
              </Button>
            </div>
          </div>
        </div>

        {/* Lista de canais */}
        {loadingCanais ? (
          <div className="flex items-center gap-2 text-sm mt-6 justify-center py-8" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}><Loader2 size={16} className="animate-spin" /> Carregando canais...</div>
        ) : canais.length === 0 ? (
          <div className="mt-6 text-center py-8 rounded-2xl" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "2px dashed color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)" }}>
            <Tv size={32} className="mx-auto mb-2" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)" }} />
            <p className="text-sm font-medium" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Nenhum canal cadastrado ainda</p>
            <p className="text-[11px] mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 25%, transparent)" }}>Use o formulário acima para adicionar seu primeiro canal</p>
          </div>
        ) : (
          <div className="rounded-3xl p-6 bg-white border border-gray-100" style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-1.5 h-6 rounded-full bg-gray-800" />
                <h4 className="text-base font-bold tracking-tight" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Canais cadastrados</h4>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{String(canais.length).padStart(2, "0")} cadastrados</span>
            </div>
            <div className="rounded-2xl overflow-hidden shadow-sm" style={{ border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 30%, transparent)" }}>
              <table className="w-full text-sm" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>
                <thead>
                  <tr style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #1a1a1a), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider" style={{ minWidth: "80px", whiteSpace: "nowrap" }}>Canal</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Nome</th>
                    <th className="px-4 py-3 text-left font-semibold text-xs uppercase tracking-wider">Tipo</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Capa</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Thumb</th>
                    <th className="px-4 py-3 text-center font-semibold text-xs uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {channelGroups.flatMap((group, groupIndex) => [
                    <tr key={`folder-${group.key}`} className="bg-slate-50/90 border-t-2 border-slate-200">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <FolderArchive size={17} className="text-blue-600" />
                          <span className="text-xs font-extrabold uppercase tracking-wide text-slate-800">{group.label}</span>
                          <span className="text-[10px] text-slate-400">{group.items.length} vídeo(s)/canal(is)</span>
                          <div className="ml-auto flex items-center gap-1">
                            <button type="button" onClick={() => void handleMoveCatalog(group.key, -1)} disabled={groupIndex === 0} title="Mover pasta para cima" className="rounded-md p-1.5 text-slate-500 hover:bg-white disabled:opacity-25"><ChevronUp size={14} /></button>
                            {group.key !== "__live" && <>
                              <button type="button" onClick={() => void handleRenameCatalog(group)} title="Renomear pasta" className="rounded-md p-1.5 text-slate-500 hover:bg-white"><Pencil size={13} /></button>
                              <button type="button" onClick={() => void handleRemoveCatalog(group)} title="Excluir pasta e vídeos" className="rounded-md p-1.5 text-rose-500 hover:bg-rose-50"><Trash2 size={13} /></button>
                            </>}
                            <button type="button" onClick={() => void handleMoveCatalog(group.key, 1)} disabled={groupIndex === channelGroups.length - 1} title="Mover pasta para baixo" className="rounded-md p-1.5 text-slate-500 hover:bg-white disabled:opacity-25"><ChevronDown size={14} /></button>
                          </div>
                        </div>
                      </td>
                    </tr>,
                    ...group.items.map((c, i) => (
                    <tr key={c.id} className="transition-colors hover:bg-blue-50/50" style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f9fe", borderTop: "1px solid rgba(13,4,70,0.05)" }}>
                      <td className="px-4 py-3 pl-8" style={{ minWidth: "80px", whiteSpace: "nowrap" }}>
                        <span className="inline-flex items-center justify-center min-w-[32px] h-7 px-2 rounded-lg text-xs font-bold" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: "var(--layout-icon-color, #888888)" }}>
                          {c.numero_canal || "—"}
                        </span>
                      </td>
                      <td className="px-4 py-3"><span className="font-semibold">{c.name}</span></td>
                      <td className="px-4 py-3">
                        <span className="text-[11px] font-medium px-2.5 py-1 rounded-full" style={{ backgroundColor: c.type === "catalog" ? "rgba(139,92,246,0.1)" : "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)", color: c.type === "catalog" ? "#8b5cf6" : "var(--layout-accent-color, #2563eb)" }}>
                          {typeLabels[c.type] || c.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">{c.cover_url ? <CheckCircle size={16} className="inline" style={{ color: "#22c55e" }} /> : <span className="text-[10px]">—</span>}</td>
                      <td className="px-4 py-3 text-center">{c.logo_url ? <CheckCircle size={16} className="inline" style={{ color: "#22c55e" }} /> : <span className="text-[10px]">—</span>}</td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" onClick={() => void handleMoveChannel(group.key, c.id, -1)} disabled={i === 0} title="Mover vídeo para cima" className="w-7 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-25"><ChevronUp size={13} /></button>
                          <button type="button" onClick={() => void handleMoveChannel(group.key, c.id, 1)} disabled={i === group.items.length - 1} title="Mover vídeo para baixo" className="w-7 h-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 disabled:opacity-25"><ChevronDown size={13} /></button>
                          <button onClick={() => handleEditCanal(c)} title="Editar" className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-sm" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #2563eb) 10%, transparent)" }}><Pencil size={13} style={{ color: "var(--layout-icon-color, #888888)" }} /></button>
                          <button onClick={() => handleRemoveCanal(c.id)} title="Remover" className="w-8 h-8 rounded-lg flex items-center justify-center transition-all hover:shadow-sm" style={{ backgroundColor: "rgba(220,38,38,0.08)" }}><Trash2 size={13} style={{ color: "#dc2626" }} /></button>
                        </div>
                      </td>
                    </tr>
                    ))
                  ])}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div></div>}

      {/* Box 4: Player Layout */}
      {!isAdmin && (section === "all" || section === "player") && <CollapsibleBox title="Layout do Player — Cores e Personalização" icon={<Tv size={16} style={{ opacity: 0.8 }} />}>
        <Suspense fallback={<div className="flex items-center gap-2 text-xs py-8 justify-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}><Loader2 size={16} className="animate-spin" /> Carregando...</div>}>
          <PlayerLayoutCustomizer />
        </Suspense>
      </CollapsibleBox>}


      {/* Box 5: Permissões */}
      {!isAdmin && (section === "all" || section === "empresa") && <CollapsibleBox title="Permissões — Sub-Usuários" icon={<ShieldCheck size={16} style={{ opacity: 0.8 }} />}>
        <Suspense fallback={<div className="flex items-center gap-2 text-xs py-8 justify-center" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}><Loader2 size={16} className="animate-spin" /> Carregando...</div>}>
          <PermissoesSection />
        </Suspense>
      </CollapsibleBox>}

      {/* Box 6: XMLs */}
      {(section === "all" || section === "empresa") && <CollapsibleBox title="XMLs" icon={<Code2 size={16} style={{ opacity: 0.8 }} />}>
        <XmlsConfigSection targetUid={targetUid} user={user} />
      </CollapsibleBox>}

      {isWindowsDesktop && (section === "all" || section === "empresa") && (
        <CollapsibleBox title="Inicialização do Windows" icon={<Power size={16} style={{ opacity: 0.8 }} />}>
          <label className="flex items-center justify-between gap-6 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-4 cursor-pointer">
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-800">Iniciar com Windows</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                Ao iniciar o computador, abre o House Mix Desktop. Após restaurar sua sessão, o app abre Música no Ar e retoma a leitura da origem XML configurada.
              </span>
            </span>
            <input
              type="checkbox"
              checked={startWithWindows}
              disabled={loadingStartupPreference || savingStartupPreference}
              onChange={(event) => void updateStartWithWindows(event.target.checked)}
              className="h-5 w-5 shrink-0 cursor-pointer accent-[#0055ff] disabled:cursor-wait"
              aria-label="Iniciar com Windows"
            />
          </label>
        </CollapsibleBox>
      )}
        </div>
      </div>

    </div>
  );
}

function EventTypesConfigSection() {
  const { user } = useAuth();
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("event_types_config")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.event_types_config) {
          setConfig(data.event_types_config);
        } else {
          // Fallback to default if not set
          setConfig({
            "live": {"color": "#2563eb", "label": "LIVE"},
            "gravacao": {"color": "#ef4444", "label": "GRAVAÇÃO"},
            "reuniao": {"color": "#8b5cf6", "label": "REUNIÃO"},
            "outro": {"color": "#6b7280", "label": "OUTRO"}
          });
        }
        setLoading(false);
      });
  }, [user]);

  const handleUpdate = (type: string, field: string, value: string) => {
    setConfig((prev: any) => ({
      ...prev,
      [type]: {
        ...prev[type],
        [field]: field === "label" ? value.toUpperCase() : value
      }
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("profiles")
      .update({ event_types_config: config })
      .eq("user_id", user.id)
      .select("user_id")
      .maybeSingle();

    setSaving(false);
    if (error || !data?.user_id) {
      toast.error(error?.message || "O banco não confirmou o salvamento das configurações.");
    } else {
      toast.success("Configurações de eventos salvas!");
      // Dispatch event to update other components
      window.dispatchEvent(new Event("layout-colors-updated"));
    }
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="animate-spin" size={20} /></div>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Object.keys(config || {}).map((type) => (
          <div key={type} className="p-4 rounded-xl space-y-3" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "1px solid rgba(13,4,70,0.06)" }}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Tipo: {type}</span>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: config[type].color }} />
                <span className="text-[10px] font-bold" style={{ color: config[type].color }}>{config[type].label}</span>
              </div>
            </div>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Rótulo (Texto)</label>
              <StyledInput 
                value={config[type].label} 
                onChange={(e) => handleUpdate(type, "label", e.target.value)} 
                placeholder="Ex: LIVE" 
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Cor do Evento</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={config[type].color}
                  onChange={(e) => handleUpdate(type, "color", e.target.value)}
                  className="w-10 h-10 rounded-lg cursor-pointer border-none p-0 shrink-0"
                  style={{ WebkitAppearance: "none", background: "none" }}
                />
                <StyledInput 
                  value={config[type].color} 
                  onChange={(e) => handleUpdate(type, "color", e.target.value)} 
                  placeholder="#000000"
                  className="font-mono"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="flex justify-end">
        <Button variant="save" 
          onClick={handleSave} 
          disabled={saving}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Salvando..." : "Salvar Configurações de Eventos"}
        </Button>
      </div>
    </div>
  );
}

function JournalisticPromptSection() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("journalistic_prompt")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        if (data?.journalistic_prompt) {
          setPrompt(data.journalistic_prompt);
        }
        setLoading(false);
      });
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    const { data, error } = await supabase
      .from("profiles")
      .update({ journalistic_prompt: prompt })
      .eq("user_id", user.id)
      .select("user_id")
      .maybeSingle();

    setSaving(false);
    if (error || !data?.user_id) {
      toast.error(error?.message || "O banco não confirmou o salvamento das diretrizes.");
    } else {
      toast.success("Diretrizes jornalísticas salvas!");
    }
  };

  if (loading) return <div className="flex justify-center py-4"><Loader2 className="animate-spin" size={20} /></div>;

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl space-y-3" style={{ backgroundColor: "rgba(13,4,70,0.02)", border: "1px solid rgba(13,4,70,0.06)" }}>
        <p className="text-[10px] font-medium" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
          Configure as instruções que a IA deve seguir ao gerar ou melhorar textos de matérias jornalísticas. 
          Use para definir tom de voz, estrutura, duração e estilo.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={6}
          placeholder="Ex: Você é um redator sênior de telejornalismo. Escreva textos diretos, use linguagem clara e garanta pelo menos 5 parágrafos densos..."
          className="w-full px-4 py-3 outline-none transition-colors text-sm resize-none"
          style={inputStyle}
          onFocus={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #2563eb)"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #1a1a1a)"; }}
        />
      </div>
      
      <div className="flex justify-end">
        <Button variant="save" 
          onClick={handleSave} 
          disabled={saving}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          {saving ? "Salvando..." : "Salvar Diretrizes"}
        </Button>
      </div>
    </div>
  );
}
