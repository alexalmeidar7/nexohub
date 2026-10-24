import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { 
  Building2, Search, Users, Mail, Phone, Calendar, 
  UserCog, Trash2, Plus, Loader2, X, MapPin, 
  Briefcase, Activity, Save, Sparkles, Check,
  ChevronDown, Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { scrollToForm } from "@/lib/utils";
import { confirmDialog } from "@/lib/confirmDialog";
import ClientesPageSkeleton from "./skeletons/ClientesPageSkeleton";

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  padding: "0 20px",
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 12,
  color: "#0f172a",
  outline: "none",
  transition: "all 0.2s ease",
  textTransform: "uppercase",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: 1.2,
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
  display: "block",
};

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export interface ClienteMetadata {
  razao_social?: string;
  nome_empresarial?: string;
  cnpj?: string;
  cep?: string;
  endereco?: string;
  cidade?: string;
  estado?: string;
  telefone?: string;
  whatsapp_responsavel?: string;
  cliente_desde?: string;
  nome_contato?: string;
  email_cobranca?: string;
  categoria?: string;
  ativo?: boolean;
  email?: string;
  logo?: string | null;
  logo_url?: string | null;
}

export const CLIENTES_METADATA_KEY = "nexohub_clientes_metadata_v1";
export const CLIENTES_CATEGORIAS_KEY = "nexohub_clientes_categorias_v2";

export const DEFAULT_CLIENTE_CATEGORIAS: string[] = [];

export function getStoredCategorias(): string[] {
  try {
    const raw = localStorage.getItem(CLIENTES_CATEGORIAS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch {}
  return [];
}

export function saveStoredCategorias(categorias: string[]): void {
  try {
    localStorage.setItem(CLIENTES_CATEGORIAS_KEY, JSON.stringify(categorias));
  } catch {}
}

// Clientes originários do House Mix transformados em Clientes Oficiais da Agência
export const DEFAULT_AGENCY_CLIENTS: Record<string, ClienteMetadata> = {
  "POSITIVA FM 99.1": {
    razao_social: "RADIO POSITIVA FM LTDA",
    nome_empresarial: "POSITIVA FM",
    telefone: "(62) 3256-8677",
    whatsapp_responsavel: "(62) 99804-9910",
    categoria: "EMISSORA DE RÁDIO",
    cep: "74535-350",
    endereco: "RUA 250, 114 - ST. COIMBRA",
    cidade: "GOIÂNIA",
    estado: "GO",
    nome_contato: "COMERCIAL POSITIVA FM",
    email_cobranca: "comercial@positivafm.com.br",
    cliente_desde: "2023-03-15",
    ativo: true,
  },
  "INTERATIVA FM": {
    razao_social: "RADIO INTERATIVA FM LTDA",
    nome_empresarial: "INTERATIVA FM 94.9",
    telefone: "(62) 3226-9490",
    whatsapp_responsavel: "(62) 3226-9490",
    categoria: "EMISSORA DE RÁDIO",
    cep: "74223-901",
    endereco: "AVENIDA T-36, 3162 - SETOR BUENO",
    cidade: "GOIÂNIA",
    estado: "GO",
    nome_contato: "COMERCIAL INTERATIVA FM",
    email_cobranca: "comercial@interativafm.net",
    cliente_desde: "2023-08-01",
    ativo: true,
  },
  "JORNAL FM": {
    razao_social: "RADIO JORNAL DE INHUMAS LTDA",
    nome_empresarial: "JORNAL FM",
    telefone: "(62) 3511-2455",
    whatsapp_responsavel: "(62) 3511-2040",
    categoria: "EMISSORA DE RÁDIO",
    cep: "75400-486",
    endereco: "RUA DR. ANTÔNIO BALDUINO, 1652, CENTRO",
    cidade: "INHUMAS",
    estado: "GO",
    nome_contato: "COMERCIAL JORNAL FM",
    email_cobranca: "comercial@jornalfm.net",
    cliente_desde: "2023-11-10",
    ativo: true,
  },
  "CULTURA FM 97.3 FM": {
    razao_social: "A3 PRODUCOES E MARKETING LTDA",
    nome_empresarial: "CULTURA FM 97.3 FM",
    telefone: "(67) 3562-1375",
    whatsapp_responsavel: "(67) 99999-1375",
    categoria: "EMISSORA DE RÁDIO",
    endereco: "RUA 12, NÚMERO 963, CENTRO",
    cidade: "CHAPADÃO DO SUL",
    estado: "MS",
    nome_contato: "COMERCIAL CULTURA FM",
    email_cobranca: "comercial@culturanoticias.com.br",
    cliente_desde: "2024-01-15",
    ativo: true,
  },
  "NEXO BRASIL": {
    razao_social: "Nexo Soluções Visuais",
    nome_empresarial: "Nexo Soluções Visuais",
    categoria: "SERVIÇOS / CORPORATIVO",
    cidade: "GOIÂNIA",
    estado: "GO",
    nome_contato: "Alex Almeida",
    email_cobranca: "alex@nexobrasil.net",
    cliente_desde: "2022-05-01",
    ativo: true,
  },
};

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((val || "").trim());

export function getMetadataStorageKey(targetUserId?: string | null, isSuperAdmin?: boolean): string {
  if (!isSuperAdmin && targetUserId) {
    return `nexohub_clientes_metadata_${targetUserId}`;
  }
  return CLIENTES_METADATA_KEY;
}

export function getStoredMetadata(targetUserId?: string | null, isSuperAdmin?: boolean): Record<string, ClienteMetadata> {
  const storageKey = getMetadataStorageKey(targetUserId, isSuperAdmin);
  try {
    const raw = localStorage.getItem(storageKey);
    let meta: Record<string, ClienteMetadata> = {};
    if (raw) {
      try {
        meta = JSON.parse(raw);
      } catch {
        meta = {};
      }
    }

    let changed = false;

    // Auto-seed e preenchimento de campos vazios para SuperAdmin ou na chave global
    if (isSuperAdmin || (!targetUserId && storageKey === CLIENTES_METADATA_KEY)) {
      Object.entries(DEFAULT_AGENCY_CLIENTS).forEach(([name, def]) => {
        const upperName = name.trim().toUpperCase();
        const existingKey = Object.keys(meta).find(k => k.trim().toUpperCase() === upperName);
        if (!existingKey) {
          meta[name] = { ...def };
          changed = true;
        } else {
          // Preenche campos que estiverem em branco/vazios
          const current = meta[existingKey] || {};
          let updated = false;
          (Object.keys(def) as (keyof ClienteMetadata)[]).forEach((field) => {
            if (def[field] !== undefined && def[field] !== "" && (!current[field] || current[field] === "")) {
              (current as any)[field] = def[field];
              updated = true;
            }
          });
          if (updated) {
            meta[existingKey] = current;
            changed = true;
          }
        }
      });
    }
    
    // Purge any raw UUID keys from localStorage that may have leaked
    Object.keys(meta).forEach(k => {
      if (isUuid(k)) {
        const item = meta[k];
        const realName = item?.razao_social || item?.nome_empresarial;
        if (realName && !meta[realName]) {
          meta[realName] = item;
        }
        delete meta[k];
        changed = true;
      }
    });

    // Converte todas as informações de clientes já salvos para CAIXA ALTA (UPPERCASE)
    const upperMeta: Record<string, ClienteMetadata> = {};
    Object.keys(meta).forEach(k => {
      const item = meta[k];
      if (!item) return;

      const upperKey = k.trim().toUpperCase();
      const upperItem: ClienteMetadata = {
        ...item,
        razao_social: item.razao_social ? item.razao_social.trim().toUpperCase() : "",
        nome_empresarial: item.nome_empresarial ? item.nome_empresarial.trim().toUpperCase() : "",
        endereco: item.endereco ? item.endereco.trim().toUpperCase() : "",
        cidade: item.cidade ? item.cidade.trim().toUpperCase() : "",
        estado: item.estado ? item.estado.trim().toUpperCase() : "",
        nome_contato: item.nome_contato ? item.nome_contato.trim().toUpperCase() : "",
        email_cobranca: item.email_cobranca ? item.email_cobranca.trim().toUpperCase() : "",
        categoria: item.categoria ? item.categoria.trim().toUpperCase() : "",
      };

      if (
        k !== upperKey ||
        item.razao_social !== upperItem.razao_social ||
        item.nome_empresarial !== upperItem.nome_empresarial ||
        item.endereco !== upperItem.endereco ||
        item.cidade !== upperItem.cidade ||
        item.estado !== upperItem.estado ||
        item.nome_contato !== upperItem.nome_contato ||
        item.email_cobranca !== upperItem.email_cobranca ||
        item.categoria !== upperItem.categoria
      ) {
        changed = true;
      }

      upperMeta[upperKey] = upperItem;
    });
    meta = upperMeta;

    // Deduplicação inteligente de chaves com mesmo nome ou CNPJ
    const seenNames = new Map<string, string>();
    const seenCnpjs = new Map<string, string>();

    Object.keys(meta).forEach(k => {
      const item = meta[k];
      if (!item) return;
      const normName = (item.razao_social || item.nome_empresarial || k).trim().toUpperCase();
      const cleanCnpj = (item.cnpj || "").replace(/\D/g, "");

      if (seenNames.has(normName)) {
        const primaryKey = seenNames.get(normName)!;
        if (primaryKey !== k) {
          meta[primaryKey] = { ...item, ...meta[primaryKey] };
          delete meta[k];
          changed = true;
          return;
        }
      } else {
        seenNames.set(normName, k);
      }

      if (cleanCnpj && cleanCnpj.length === 14) {
        if (seenCnpjs.has(cleanCnpj)) {
          const primaryKey = seenCnpjs.get(cleanCnpj)!;
          if (primaryKey !== k) {
            meta[primaryKey] = { ...item, ...meta[primaryKey] };
            delete meta[k];
            changed = true;
            return;
          }
        } else {
          seenCnpjs.set(cleanCnpj, k);
        }
      }
    });

    if (changed) {
      localStorage.setItem(storageKey, JSON.stringify(meta));
    }

    return meta;
  } catch {
    return isSuperAdmin ? { ...DEFAULT_AGENCY_CLIENTS } : {};
  }
}

export function saveStoredMetadata(
  key: string,
  meta: ClienteMetadata,
  oldKeysToRemove?: string[],
  targetUserId?: string | null,
  isSuperAdmin?: boolean
) {
  const storageKey = getMetadataStorageKey(targetUserId, isSuperAdmin);
  try {
    const all = getStoredMetadata(targetUserId, isSuperAdmin);
    // Limpa chaves antigas se o cliente tiver sido renomeado
    if (oldKeysToRemove && oldKeysToRemove.length > 0) {
      oldKeysToRemove.forEach(k => {
        if (k && k !== key) {
          delete all[k];
        }
      });
    }

    // Salva sob a chave limpa (nome da empresa)
    if (isUuid(key)) {
      if (meta.razao_social) {
        all[meta.razao_social] = { ...(all[meta.razao_social] || {}), ...meta };
      }
      all[key] = { ...(all[key] || {}), ...meta };
    } else {
      all[key] = { ...(all[key] || {}), ...meta };
    }
    localStorage.setItem(storageKey, JSON.stringify(all));
  } catch (err) {
    console.warn("Erro ao salvar metadata de cliente:", err);
  }
}

interface Cliente {
  id: string;
  user_id: string;
  nome: string | null;
  nome_empresarial?: string | null;
  cnpj: string | null;
  cep?: string | null;
  endereco: string | null;
  cidade?: string | null;
  estado?: string | null;
  telefone_comercial: string | null;
  whatsapp_responsavel?: string | null;
  cliente_desde: string | null;
  nome_contato?: string | null;
  executiva_venda?: string | null;
  email_cobranca?: string | null;
  categoria?: string | null;
  ativo: boolean | null;
  logo_url?: string | null;
}

interface Evento {
  id: string;
  user_id: string;
  cliente_id: string;
  tipo: string;
  data: string;
  status: string;
}

export default function ClientesPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { role, user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const formRef = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [categorias, setCategorias] = useState<string[]>(() => getStoredCategorias());
  const [modalCategoriasOpen, setModalCategoriasOpen] = useState(false);
  const [novaCategoriaInput, setNovaCategoriaInput] = useState("");

  const [busca, setBusca] = useState(() => {
    try {
      const stored = sessionStorage.getItem("nexohub_cliente_filter");
      if (stored) {
        sessionStorage.removeItem("nexohub_cliente_filter");
        return stored;
      }
    } catch {}
    return "";
  });

  useEffect(() => {
    const handleFilter = (e: any) => {
      if (e?.detail?.term) {
        setBusca(e.detail.term);
      }
    };
    window.addEventListener("clientes:filter", handleFilter);
    return () => window.removeEventListener("clientes:filter", handleFilter);
  }, []);

  const [eventos, setEventos] = useState<Evento[]>([]);
  const [criando, setCriando] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingClient, setEditingClient] = useState<Cliente | null>(null);

  // Loading states for auto-fetching
  const [loadingCnpj, setLoadingCnpj] = useState(false);
  const [loadingCep, setLoadingCep] = useState(false);

  // Form State: CNPJ is 1st, then Razão Social, Nome Empresarial, CEP, Endereço, Cidade, Estado, Telefone...
  const [novo, setNovo] = useState({
    cnpj: "",
    nome: "", // Razão Social
    nome_empresarial: "", // Nome Fantasia
    cep: "",
    endereco: "",
    cidade: "",
    estado: "",
    telefone: "",
    whatsapp_responsavel: "",
    cliente_desde: "",
    nome_contato: "",
    email_cobranca: "",
    categoria: "",
    ativo: true,
  });

  // Categorias handlers
  const handleAddCategoria = (catName?: string) => {
    const name = (catName || novaCategoriaInput).trim().toUpperCase();
    if (!name) {
      toast.error("Informe o nome da categoria.");
      return;
    }
    if (categorias.some(c => c.toUpperCase() === name)) {
      toast.info(`A categoria "${name}" já existe.`);
      setNovo(prev => ({ ...prev, categoria: name }));
      setNovaCategoriaInput("");
      setModalCategoriasOpen(false);
      return;
    }
    const updated = [...categorias, name];
    setCategorias(updated);
    saveStoredCategorias(updated);
    setNovo(prev => ({ ...prev, categoria: name }));
    setNovaCategoriaInput("");
    toast.success(`Categoria "${name}" cadastrada e selecionada!`);
  };

  const handleDeleteCategoria = async (catToDelete: string) => {
    const confirmed = await confirmDialog({
      title: "Excluir Categoria",
      message: `Deseja realmente excluir a categoria "${catToDelete}"? Ela será removida da lista.`,
      destructive: true,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar"
    });
    if (!confirmed) return;

    const updated = categorias.filter(c => c !== catToDelete);
    setCategorias(updated);
    saveStoredCategorias(updated);
    if (novo.categoria === catToDelete) {
      setNovo(prev => ({ ...prev, categoria: "" }));
    }
    toast.success(`Categoria "${catToDelete}" removida com sucesso.`);
  };

  // Formatting helpers
  const formatCnpj = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  };

  const formatCep = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 8);
    return digits.replace(/^(\d{5})(\d)/, "$1-$2");
  };

  const formatPhone = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 10) {
      return digits.replace(/^(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    }
    return digits.replace(/^(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  };

  // Buscar dados da empresa pelo CNPJ
  const buscarCnpj = async (rawCnpj: string) => {
    const clean = rawCnpj.replace(/\D/g, "");
    if (clean.length !== 14) return;

    setLoadingCnpj(true);
    try {
      let data: any = null;

      // 1. MinhaReceita API
      try {
        const res = await fetch(`https://minhareceita.org/${clean}`);
        if (res.ok) data = await res.json();
      } catch { /* fallback */ }

      // 2. Fallback Publica CNPJ WS
      if (!data) {
        try {
          const res2 = await fetch(`https://publica.cnpj.ws/cnpj/${clean}`);
          if (res2.ok) data = await res2.json();
        } catch { /* fallback */ }
      }

      // 3. Fallback BrasilAPI
      if (!data) {
        try {
          const res3 = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
          if (res3.ok) data = await res3.json();
        } catch { /* noop */ }
      }

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

        setNovo(prev => ({
          ...prev,
          nome: razao || prev.nome,
          nome_empresarial: fantasia || prev.nome_empresarial || razao,
          cep: cepRaw ? formatCep(cepRaw) : prev.cep,
          endereco: fullEndereco || prev.endereco,
          cidade: municipio || prev.cidade,
          estado: uf || prev.estado,
          telefone: prev.telefone || (ddd ? formatPhone(ddd) : ""),
          email_cobranca: prev.email_cobranca || (data.email ? String(data.email).toUpperCase() : ""),
        }));

        toast.success(`Razão Social localizada: ${razao || fantasia}`);
      } else {
        toast.info("CNPJ não encontrado nas bases públicas ou indisponível no momento.");
      }
    } catch (err) {
      console.error("Erro ao buscar CNPJ:", err);
    } finally {
      setLoadingCnpj(false);
    }
  };

  // Buscar dados de endereço pelo CEP
  const buscarCep = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, "");
    if (clean.length !== 8) return;

    setLoadingCep(true);
    try {
      let data: any = null;

      // 1. ViaCEP
      try {
        const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
        if (res.ok) {
          const json = await res.json();
          if (!json.erro) data = json;
        }
      } catch { /* fallback */ }

      // 2. Fallback BrasilAPI
      if (!data) {
        try {
          const res2 = await fetch(`https://brasilapi.com.br/api/cep/v1/${clean}`);
          if (res2.ok) data = await res2.json();
        } catch { /* noop */ }
      }

      if (data) {
        const street = (data.logradouro || data.street || "").toUpperCase();
        const bairro = (data.bairro || data.neighborhood || "").toUpperCase();
        const city = (data.localidade || data.city || "").toUpperCase();
        const state = (data.uf || data.state || "").toUpperCase();

        setNovo(prev => ({
          ...prev,
          endereco: street ? `${street}${bairro ? ` - ${bairro}` : ""}` : prev.endereco,
          cidade: city || prev.cidade,
          estado: state || prev.estado,
        }));

        toast.success(`Endereço localizado: ${city} - ${state}`);
      } else {
        toast.info("CEP não localizado na base dos Correios.");
      }
    } catch (err) {
      console.error("Erro ao buscar CEP:", err);
    } finally {
      setLoadingCep(false);
    }
  };

  const handleCnpjChange = (val: string) => {
    const formatted = formatCnpj(val);
    setNovo(prev => ({ ...prev, cnpj: formatted }));
    const clean = formatted.replace(/\D/g, "");
    if (clean.length === 14) {
      buscarCnpj(clean);
    }
  };

  const handleCepChange = (val: string) => {
    const formatted = formatCep(val);
    setNovo(prev => ({ ...prev, cep: formatted }));
    const clean = formatted.replace(/\D/g, "");
    if (clean.length === 8) {
      buscarCep(clean);
    }
  };

  const isSuperAdmin = role === "admin";
  const isScopedToStation = !isSuperAdmin || (Boolean(effectiveUserId) && effectiveUserId !== user?.id);

  const load = async () => {
    setLoading(true);
    try {
      const storedMeta = getStoredMetadata(targetUserId, !isScopedToStation);

      let logosQuery = supabase
        .from("logos_patrocinadores")
        .select("id, user_id, nome, logo_url, ativo, created_at")
        .eq("excluido", false);

      if (isScopedToStation && targetUserId) {
        logosQuery = logosQuery.eq("user_id", targetUserId);
      }

      let agendaQuery = supabase
        .from("blitz_promocionais")
        .select("*");

      if (isScopedToStation && targetUserId) {
        agendaQuery = agendaQuery.eq("user_id", targetUserId);
      }

      const [logosRes, empRes, agendaRes] = await Promise.all([
        logosQuery.order("nome"),
        !isScopedToStation
          ? supabase
              .from("empresa_config")
              .select("user_id, nome, logo, telefone_comercial, telefone_participacao, ativo, created_at")
              .order("nome")
          : Promise.resolve({ data: [] }),
        agendaQuery
      ]);

      const logosData = logosRes.data || [];
      const empData = (empRes as any)?.data || [];
      const agendaData = agendaRes.data || [];

      const uniqueClients: Cliente[] = [];
      const seenNames = new Set<string>();
      const seenCnpjs = new Set<string>();
      const seenIds = new Set<string>();

      // 1. Clientes vindos de logos_patrocinadores (patrocinadores / clientes do usuário/estação)
      logosData.forEach(item => {
        let name = (item.nome || "").trim();
        if (!name) return;

        // Never allow raw UUIDs as client names
        if (isUuid(name)) {
          const metaCandidate = storedMeta[name] || storedMeta[item.id] || {};
          if (metaCandidate.razao_social || metaCandidate.nome_empresarial) {
            name = (metaCandidate.razao_social || metaCandidate.nome_empresarial)!.trim();
          } else {
            return;
          }
        }

        const upperName = name.toUpperCase();
        const meta = storedMeta[item.id] || storedMeta[name] || storedMeta[upperName] || {};
        const cleanCnpj = (meta.cnpj || "").replace(/\D/g, "");

        // Prevent duplicate company names or duplicate CNPJs
        if (seenNames.has(upperName) || (cleanCnpj && seenCnpjs.has(cleanCnpj))) {
          return;
        }

        seenNames.add(upperName);
        seenIds.add(item.id);
        if (cleanCnpj) seenCnpjs.add(cleanCnpj);

        const clienteAtivo = typeof meta.ativo === "boolean" ? meta.ativo : (item.ativo !== false);
        const tel = meta.telefone || "";

        uniqueClients.push({
          id: item.id,
          user_id: item.user_id,
          nome: name.toUpperCase(),
          nome_empresarial: (meta.nome_empresarial || "").toUpperCase(),
          logo_url: item.logo_url,
          ativo: clienteAtivo,
          cnpj: meta.cnpj || "",
          cep: meta.cep || "",
          cliente_desde: meta.cliente_desde || item.created_at?.split('T')[0] || "",
          telefone_comercial: tel,
          whatsapp_responsavel: meta.whatsapp_responsavel || tel,
          endereco: (meta.endereco && meta.endereco !== "Endereço não cadastrado" ? meta.endereco : "").toUpperCase(),
          cidade: (meta.cidade || "").toUpperCase(),
          estado: (meta.estado || "").toUpperCase(),
          nome_contato: (meta.nome_contato && meta.nome_contato !== "Não atribuído" ? meta.nome_contato : "").toUpperCase(),
          executiva_venda: (meta.nome_contato && meta.nome_contato !== "Não atribuído" ? meta.nome_contato : "").toUpperCase(),
          email_cobranca: (meta.email_cobranca || "").toUpperCase(),
          categoria: (meta.categoria || "").toUpperCase(),
        });
      });

      // 2. Clientes vindos de empresa_config (apenas se for visão global da Agência / Super Admin)
      if (!isScopedToStation) {
        empData.forEach(emp => {
          const name = (emp.nome || "").trim();
          if (!name || isUuid(name)) return;

          const upperName = name.toUpperCase();
          const meta = storedMeta[emp.user_id] || storedMeta[name] || storedMeta[upperName] || {};
          const cleanCnpj = (meta.cnpj || "").replace(/\D/g, "");

          if (seenNames.has(upperName) || (cleanCnpj && seenCnpjs.has(cleanCnpj))) {
            return;
          }

          seenNames.add(upperName);
          seenIds.add(emp.user_id);
          if (cleanCnpj) seenCnpjs.add(cleanCnpj);

          const clienteAtivo = typeof meta.ativo === "boolean" ? meta.ativo : (emp.ativo !== false);
          const tel = meta.telefone || emp.telefone_comercial || emp.telefone_participacao || "";

          uniqueClients.push({
            id: emp.user_id,
            user_id: emp.user_id,
            nome: name.toUpperCase(),
            nome_empresarial: (meta.nome_empresarial || name).toUpperCase(),
            logo_url: emp.logo || null,
            ativo: clienteAtivo,
            cnpj: meta.cnpj || "",
            cep: meta.cep || "",
            cliente_desde: meta.cliente_desde || emp.created_at?.split('T')[0] || "",
            telefone_comercial: tel,
            whatsapp_responsavel: meta.whatsapp_responsavel || tel,
            endereco: (meta.endereco && meta.endereco !== "Endereço não cadastrado" ? meta.endereco : "").toUpperCase(),
            cidade: (meta.cidade || "").toUpperCase(),
            estado: (meta.estado || "").toUpperCase(),
            nome_contato: (meta.nome_contato && meta.nome_contato !== "Não atribuído" ? meta.nome_contato : "").toUpperCase(),
            executiva_venda: (meta.nome_contato && meta.nome_contato !== "Não atribuído" ? meta.nome_contato : "").toUpperCase(),
            email_cobranca: (meta.email_cobranca || "").toUpperCase(),
            categoria: (meta.categoria || "").toUpperCase(),
          });
        });
      }

      // 3. Clientes registrados em storedMeta da estação/usuário
      Object.keys(storedMeta).forEach(key => {
        // Skip any UUID keys
        if (isUuid(key)) return;

        const meta = storedMeta[key];
        const candidateName = (meta.razao_social || meta.nome_empresarial || (key.startsWith("local_") ? "" : key) || "").trim();
        if (!candidateName || isUuid(candidateName)) return;

        const upper = candidateName.toUpperCase();
        const cleanCnpj = (meta.cnpj || "").replace(/\D/g, "");

        if (seenNames.has(upper) || (cleanCnpj && seenCnpjs.has(cleanCnpj))) {
          return;
        }

        seenNames.add(upper);
        if (cleanCnpj) seenCnpjs.add(cleanCnpj);

        const tel = meta.telefone || "";

        uniqueClients.push({
          id: key,
          user_id: targetUserId || user?.id || "",
          nome: candidateName.toUpperCase(),
          nome_empresarial: (meta.nome_empresarial || "").toUpperCase(),
          logo_url: null,
          ativo: meta.ativo !== false,
          cnpj: meta.cnpj || "",
          cep: meta.cep || "",
          cliente_desde: meta.cliente_desde || new Date().toISOString().split('T')[0],
          telefone_comercial: tel,
          whatsapp_responsavel: meta.whatsapp_responsavel || tel,
          endereco: (meta.endereco && meta.endereco !== "Endereço não cadastrado" ? meta.endereco : "").toUpperCase(),
          cidade: (meta.cidade || "").toUpperCase(),
          estado: (meta.estado || "").toUpperCase(),
          nome_contato: (meta.nome_contato && meta.nome_contato !== "Não atribuído" ? meta.nome_contato : "").toUpperCase(),
          executiva_venda: (meta.nome_contato && meta.nome_contato !== "Não atribuído" ? meta.nome_contato : "").toUpperCase(),
          email_cobranca: (meta.email_cobranca || "").toUpperCase(),
          categoria: (meta.categoria || "").toUpperCase(),
        });
      });

      setClientes(uniqueClients);
      setEventos((agendaData as any[]) || []);
    } catch (err) {
      console.error("Erro ao carregar clientes:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [targetUserId]);

  const handleSave = async () => {
    if (!novo.nome.trim()) {
      toast.error("Razão Social é obrigatória.");
      return;
    }

    setCriando(true);
    try {
      const cleanName = novo.nome.trim().toUpperCase();

      const metaToSave: ClienteMetadata = {
        razao_social: cleanName,
        nome_empresarial: novo.nome_empresarial.trim().toUpperCase(),
        cnpj: novo.cnpj.trim(),
        cep: novo.cep.trim(),
        endereco: novo.endereco.trim().toUpperCase(),
        cidade: novo.cidade.trim().toUpperCase(),
        estado: novo.estado.trim().toUpperCase(),
        telefone: novo.telefone.trim(),
        whatsapp_responsavel: novo.whatsapp_responsavel.trim(),
        cliente_desde: novo.cliente_desde,
        nome_contato: novo.nome_contato.trim().toUpperCase(),
        email_cobranca: novo.email_cobranca.trim().toUpperCase(),
        categoria: novo.categoria.trim().toUpperCase(),
        ativo: novo.ativo,
      };

      if (editingId) {
        const oldId = editingId;
        const oldName = (editingClient?.nome || "").trim();
        const oldNomeEmpresarial = (editingClient?.nome_empresarial || "").trim();

        // 1. Atualização no banco de dados Supabase
        if (!oldId.startsWith("local_")) {
          if (isUuid(oldId)) {
            await supabase
              .from("logos_patrocinadores")
              .update({
                nome: cleanName,
                ativo: novo.ativo,
              } as any)
              .eq("id", oldId);

            if (!isScopedToStation) {
              await supabase
                .from("empresa_config")
                .update({
                  nome: cleanName,
                  ativo: novo.ativo,
                  telefone_comercial: novo.telefone.trim(),
                } as any)
                .eq("user_id", oldId);
            }
          } else {
            const nameToMatch = oldName || oldId;
            let updateQuery = supabase
              .from("logos_patrocinadores")
              .update({
                nome: cleanName,
                ativo: novo.ativo,
              } as any)
              .eq("nome", nameToMatch);
            
            if (isScopedToStation && targetUserId) {
              updateQuery = updateQuery.eq("user_id", targetUserId);
            }
            await updateQuery;
          }
        }

        // 2. Chaves antigas a remover do storedMeta caso o nome tenha sido alterado
        const keysToRemove = [oldId, oldName, oldNomeEmpresarial].filter(Boolean) as string[];
        saveStoredMetadata(cleanName, metaToSave, keysToRemove, targetUserId, !isScopedToStation);

        // 3. Atualiza estado imediatamente no frontend para o cliente editado
        setClientes(prev =>
          prev.map(c => {
            if (c.id === oldId || (oldName && c.nome === oldName)) {
              return {
                ...c,
                nome: cleanName,
                nome_empresarial: novo.nome_empresarial.trim().toUpperCase(),
                cnpj: novo.cnpj.trim(),
                cep: novo.cep.trim(),
                endereco: novo.endereco.trim().toUpperCase(),
                cidade: novo.cidade.trim().toUpperCase(),
                estado: novo.estado.trim().toUpperCase(),
                telefone_comercial: novo.telefone.trim(),
                whatsapp_responsavel: novo.whatsapp_responsavel.trim(),
                cliente_desde: novo.cliente_desde,
                nome_contato: novo.nome_contato.trim().toUpperCase(),
                executiva_venda: novo.nome_contato.trim().toUpperCase(),
                email_cobranca: novo.email_cobranca.trim().toUpperCase(),
                categoria: novo.categoria.trim().toUpperCase(),
                ativo: novo.ativo,
              };
            }
            return c;
          })
        );

        toast.success("Dados do cliente atualizados com sucesso!");
      } else {
        // Novo cadastro
        let newId: string | null = null;
        try {
          const { data: insertedData } = await supabase.from("logos_patrocinadores").insert({
            nome: cleanName,
            user_id: targetUserId || user?.id,
            ativo: novo.ativo,
            excluido: false,
            data_final: new Date(new Date().getFullYear() + 10, 11, 31).toISOString().split('T')[0] 
          } as any).select().maybeSingle();

          if (insertedData?.id) {
            newId = insertedData.id;
          }
        } catch { /* se offline ou sem permissão na tabela, mantém em storedMeta */ }

        saveStoredMetadata(cleanName, metaToSave, [], targetUserId, !isScopedToStation);
        if (newId) {
          const stored = getStoredMetadata(targetUserId, !isScopedToStation);
          stored[newId] = metaToSave;
          const storageKey = getMetadataStorageKey(targetUserId, !isScopedToStation);
          localStorage.setItem(storageKey, JSON.stringify(stored));
        }

        toast.success("Cliente cadastrado com sucesso!");
      }

      setEditingId(null);
      setEditingClient(null);
      setNovo({
        cnpj: "",
        nome: "",
        nome_empresarial: "",
        cep: "",
        endereco: "",
        cidade: "",
        estado: "",
        telefone: "",
        whatsapp_responsavel: "",
        cliente_desde: "",
        nome_contato: "",
        email_cobranca: "",
        categoria: "",
        ativo: true,
      });

      await load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar cliente.");
    } finally {
      setCriando(false);
    }
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingId(cliente.id);
    setEditingClient(cliente);
    const storedMeta = getStoredMetadata(targetUserId, !isScopedToStation);
    const meta = storedMeta[cliente.id] || storedMeta[cliente.nome || ""] || {};

    const cleanEnd = (cliente.endereco && cliente.endereco !== "Endereço não cadastrado") 
      ? cliente.endereco 
      : (meta.endereco && meta.endereco !== "Endereço não cadastrado" ? meta.endereco : "");

    const cleanTel = (cliente.telefone_comercial && cliente.telefone_comercial !== "(00) 0000-0000") 
      ? cliente.telefone_comercial 
      : (meta.telefone && meta.telefone !== "(00) 0000-0000" ? meta.telefone : "");

    const cleanContato = (cliente.nome_contato && cliente.nome_contato !== "Não atribuído") 
      ? cliente.nome_contato 
      : (meta.nome_contato && meta.nome_contato !== "Não atribuído" ? meta.nome_contato : (cliente.executiva_venda && cliente.executiva_venda !== "Não atribuído" ? cliente.executiva_venda : ""));

    setNovo({
      cnpj: cliente.cnpj || meta.cnpj || "",
      nome: (cliente.nome || "").toUpperCase(),
      nome_empresarial: (cliente.nome_empresarial || meta.nome_empresarial || "").toUpperCase(),
      cep: cliente.cep || meta.cep || "",
      endereco: (cleanEnd || "").toUpperCase(),
      cidade: (cliente.cidade || meta.cidade || "").toUpperCase(),
      estado: (cliente.estado || meta.estado || "").toUpperCase(),
      telefone: cleanTel || "",
      whatsapp_responsavel: cliente.whatsapp_responsavel || meta.whatsapp_responsavel || "",
      cliente_desde: cliente.cliente_desde || meta.cliente_desde || "",
      nome_contato: (cleanContato || "").toUpperCase(),
      email_cobranca: (cliente.email_cobranca || meta.email_cobranca || "").toUpperCase(),
      categoria: cliente.categoria || meta.categoria || "",
      ativo: typeof cliente.ativo === "boolean" ? cliente.ativo : (meta.ativo !== false),
    });

    scrollToForm(formRef.current);
  };

  // Toggle rápido de ativo / inativo direto na tabela
  const handleToggleAtivo = async (cliente: Cliente) => {
    const novoStatus = !cliente.ativo;
    try {
      if (cliente.id && !cliente.id.startsWith("local_")) {
        // Tenta atualizar em logos_patrocinadores
        await supabase
          .from("logos_patrocinadores")
          .update({ ativo: novoStatus } as any)
          .eq("id", cliente.id);

        if (!isScopedToStation) {
          await supabase
            .from("empresa_config")
            .update({ ativo: novoStatus } as any)
            .eq("user_id", cliente.user_id || cliente.id);
        }
      }

      if (cliente.nome) {
        const storedMeta = getStoredMetadata(targetUserId, !isScopedToStation);
        const currentMeta = storedMeta[cliente.id] || storedMeta[cliente.nome] || {};
        currentMeta.ativo = novoStatus;
        saveStoredMetadata(cliente.nome, currentMeta, [], targetUserId, !isScopedToStation);
      }

      setClientes(prev => prev.map(c => c.id === cliente.id ? { ...c, ativo: novoStatus } : c));
      toast.success(`Cliente "${cliente.nome}" agora está ${novoStatus ? "ATIVO" : "INATIVO"}.`);
    } catch (err) {
      console.error("Erro ao alterar status do cliente:", err);
      toast.error("Erro ao alterar status do cliente.");
    }
  };

  const handleDelete = async (cliente: Cliente) => {
    const confirmed = await confirmDialog({
      title: "Excluir Cliente",
      message: `Deseja realmente excluir o cadastro de "${cliente.nome}"? Esta ação não pode ser desfeita.`,
      destructive: true,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar"
    });
    if (!confirmed) return;

    try {
      // 1. Mark as excluded in Supabase if exists
      if (cliente.id && !cliente.id.startsWith("local_")) {
        await supabase
          .from("logos_patrocinadores")
          .update({ excluido: true } as any)
          .eq("id", cliente.id);
        
        // In case it was inserted with nome = cliente.nome
        if (cliente.nome) {
          let delQuery = supabase
            .from("logos_patrocinadores")
            .update({ excluido: true } as any)
            .eq("nome", cliente.nome);

          if (isScopedToStation && targetUserId) {
            delQuery = delQuery.eq("user_id", targetUserId);
          }
          await delQuery;
        }
      }

      // 2. Remove from localStorage metadata
      const storedMeta = getStoredMetadata(targetUserId, !isScopedToStation);
      delete storedMeta[cliente.id];
      if (cliente.nome) delete storedMeta[cliente.nome];
      if (cliente.nome_empresarial) delete storedMeta[cliente.nome_empresarial];
      const storageKey = getMetadataStorageKey(targetUserId, !isScopedToStation);
      localStorage.setItem(storageKey, JSON.stringify(storedMeta));

      // 3. Update state
      setClientes(prev => prev.filter(c => c.id !== cliente.id && c.nome !== cliente.nome));
      toast.success("Cliente excluído com sucesso!");
    } catch (err) {
      console.error("Erro ao excluir cliente:", err);
      toast.error("Erro ao excluir cliente.");
    }
  };

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    if (!q) return clientes;
    return clientes.filter(c => 
      c.nome?.toLowerCase().includes(q) || 
      (c.nome_empresarial && c.nome_empresarial.toLowerCase().includes(q)) ||
      (c.categoria && c.categoria.toLowerCase().includes(q)) ||
      (c.cnpj && c.cnpj.includes(q)) ||
      (c.cidade && c.cidade.toLowerCase().includes(q)) ||
      (c.nome_contato && c.nome_contato.toLowerCase().includes(q)) ||
      (c.email_cobranca && c.email_cobranca.toLowerCase().includes(q)) ||
      (c.telefone_comercial && c.telefone_comercial.includes(q)) ||
      (c.whatsapp_responsavel && c.whatsapp_responsavel.includes(q))
    );
  }, [clientes, busca]);

  const getEventosCliente = (clienteNome: string | null) => {
    if (!clienteNome) return 0;
    const q = clienteNome.trim().toUpperCase();
    return eventos.filter(e => (e as any).cliente?.trim().toUpperCase() === q).length;
  };

  if (loading) {
    return <ClientesPageSkeleton />;
  }

  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* 1. Form Section (Centered, Clean Flat Modern Style) */}
      <section ref={formRef} className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
              {editingId ? "Editar cliente" : "Cadastro de cliente"}
            </h2>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              Gestão de clientes corporativos e contratos da Nexo Agência
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* TOGGLE CLIENTE ATIVO / INATIVO */}
            <div className={`flex items-center gap-3 px-4 py-1.5 rounded-full border transition-all ${
              novo.ativo 
                ? "bg-emerald-50/80 border-emerald-200 text-emerald-800" 
                : "bg-rose-50/80 border-rose-200 text-rose-800"
            }`}>
              <span className="text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${novo.ativo ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                {novo.ativo ? "Cliente Ativo" : "Cliente Inativo"}
              </span>
              <Switch
                checked={novo.ativo}
                onCheckedChange={(checked) => setNovo(n => ({ ...n, ativo: checked }))}
                className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300"
              />
            </div>

            <div className="text-[11px] font-bold text-slate-700 bg-[#f1f5f9] px-4 py-1.5 rounded-full uppercase tracking-wider">
              Data do cadastro: <span className="text-[#0055ff]">{editingId ? "—" : new Date().toLocaleDateString("pt-BR")}</span>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {/* LINHA 1: CNPJ (1º CAMPO) + RAZÃO SOCIAL (PREENCHIDA PELO CNPJ) + NOME EMPRESARIAL */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="CNPJ (1º Campo)">
              <div className="relative">
                <input 
                  style={inputStyle}
                  value={novo.cnpj} 
                  onChange={e => handleCnpjChange(e.target.value)}
                  onBlur={() => buscarCnpj(novo.cnpj)}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                />
                {loadingCnpj ? (
                  <Loader2 size={16} className="animate-spin text-[#0055ff] absolute right-4 top-1/2 -translate-y-1/2" />
                ) : (
                  <button
                    type="button"
                    onClick={() => buscarCnpj(novo.cnpj)}
                    title="Buscar dados do CNPJ"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0055ff] transition-colors p-1"
                  >
                    <Search size={14} />
                  </button>
                )}
              </div>
            </Field>

            <Field label="Razão Social (Preenchida pelo CNPJ)">
              <input 
                style={inputStyle}
                value={novo.nome} 
                onChange={e => setNovo(n => ({...n, nome: e.target.value.toUpperCase()}))}
                placeholder="NOME DA EMPRESA / RAZÃO SOCIAL"
              />
            </Field>

            <Field label="Nome Empresarial">
              <input 
                style={inputStyle}
                value={novo.nome_empresarial} 
                onChange={e => setNovo(n => ({...n, nome_empresarial: e.target.value.toUpperCase()}))}
                placeholder="NOME EMPRESARIAL / NOME FANTASIA"
              />
            </Field>
          </div>

          {/* LINHA 2: ENDEREÇO (ANTES DO TELEFONE) -> CEP + ENDEREÇO + CIDADE + ESTADO */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-4">
            <Field label="CEP" className="md:col-span-3">
              <div className="relative">
                <input 
                  style={inputStyle}
                  value={novo.cep} 
                  onChange={e => handleCepChange(e.target.value)}
                  onBlur={() => buscarCep(novo.cep)}
                  placeholder="00000-000"
                  maxLength={9}
                />
                {loadingCep ? (
                  <Loader2 size={16} className="animate-spin text-[#0055ff] absolute right-4 top-1/2 -translate-y-1/2" />
                ) : (
                  <button
                    type="button"
                    onClick={() => buscarCep(novo.cep)}
                    title="Buscar endereço via CEP"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0055ff] transition-colors p-1"
                  >
                    <Search size={14} />
                  </button>
                )}
              </div>
            </Field>

            <Field label="Endereço (Preenchido pelo CEP)" className="md:col-span-4">
              <input 
                style={inputStyle}
                value={novo.endereco} 
                onChange={e => setNovo(n => ({...n, endereco: e.target.value.toUpperCase()}))}
                placeholder="RUA, AVENIDA, NÚMERO, BAIRRO"
              />
            </Field>

            <Field label="Cidade (Preenchida pelo CEP)" className="md:col-span-3">
              <input 
                style={inputStyle}
                value={novo.cidade} 
                onChange={e => setNovo(n => ({...n, cidade: e.target.value.toUpperCase()}))}
                placeholder="CIDADE"
              />
            </Field>

            <Field label="Estado" className="md:col-span-2">
              <input 
                style={inputStyle}
                value={novo.estado} 
                onChange={e => setNovo(n => ({...n, estado: e.target.value.toUpperCase()}))}
                placeholder="UF"
                maxLength={2}
                className="uppercase"
              />
            </Field>
          </div>

          {/* LINHA 3: TELEFONE + WHATSAPP + NOME DO CONTATO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Telefone Comercial">
              <input 
                style={inputStyle}
                value={novo.telefone} 
                onChange={e => setNovo(n => ({...n, telefone: formatPhone(e.target.value)}))}
                placeholder="(00) 0000-0000"
                maxLength={15}
              />
            </Field>

            <Field label="WhatsApp Responsável">
              <input 
                style={inputStyle}
                value={novo.whatsapp_responsavel} 
                onChange={e => setNovo(n => ({...n, whatsapp_responsavel: formatPhone(e.target.value)}))}
                placeholder="(00) 90000-0000"
                maxLength={15}
              />
            </Field>

            <Field label="Nome do Contato">
              <input 
                style={inputStyle}
                value={novo.nome_contato} 
                onChange={e => setNovo(n => ({...n, nome_contato: e.target.value.toUpperCase()}))}
                placeholder="NOME DO CONTATO RESPONSÁVEL"
              />
            </Field>
          </div>

          {/* LINHA 4: E-MAIL COBRANÇA FINANCEIRA + CATEGORIA DO CLIENTE (COM BOTÃO '+') + CLIENTE DESDE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="E-mail Cobrança Financeira">
              <input 
                type="email"
                style={inputStyle}
                value={novo.email_cobranca} 
                onChange={e => setNovo(n => ({...n, email_cobranca: e.target.value.toUpperCase()}))}
                placeholder="FINANCEIRO@EMPRESA.COM.BR"
              />
            </Field>

            <Field label="Categoria do Cliente">
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Select
                    value={novo.categoria || undefined}
                    onValueChange={(val) => setNovo(n => ({ ...n, categoria: val }))}
                  >
                    <SelectTrigger 
                      className="w-full h-11 rounded-full bg-[#f8fafc] border border-slate-200/90 px-5 text-xs text-[#0f172a] uppercase font-bold focus:ring-1 focus:ring-[#0055ff] focus:border-[#0055ff]"
                    >
                      <SelectValue placeholder={categorias.length === 0 ? "NENHUMA CATEGORIA CADASTRADA (+)" : "SELECIONE A CATEGORIA..."} />
                    </SelectTrigger>
                    <SelectContent className="max-h-60 rounded-2xl border border-slate-200/90 shadow-xl bg-white/95 backdrop-blur-md p-1.5">
                      {categorias.length === 0 ? (
                        <div className="py-6 px-4 text-center text-xs text-slate-400 font-medium">
                          Nenhuma categoria cadastrada.<br />
                          Clique no botão <span className="text-[#0055ff] font-bold">+</span> ao lado para adicionar.
                        </div>
                      ) : (
                        categorias.map(cat => (
                          <SelectItem key={cat} value={cat} className="text-xs font-bold uppercase cursor-pointer rounded-xl my-0.5">
                            {cat}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {novo.categoria && (
                  <button
                    type="button"
                    onClick={() => setNovo(n => ({ ...n, categoria: "" }))}
                    title="Desmarcar categoria"
                    className="w-11 h-11 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-xs"
                  >
                    <X size={16} />
                  </button>
                )}

                {novo.categoria && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCategoria(novo.categoria)}
                    title={`Excluir categoria "${novo.categoria}" do sistema`}
                    className="w-11 h-11 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/70 flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-xs"
                  >
                    <Trash2 size={16} />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setModalCategoriasOpen(true)}
                  title="Cadastrar ou gerenciar categorias"
                  className="w-11 h-11 rounded-full bg-[#0055ff] hover:bg-[#0047d4] active:scale-95 text-white flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-sm hover:shadow-md hover:shadow-blue-500/20"
                >
                  <Plus size={18} strokeWidth={2.5} />
                </button>
              </div>
            </Field>

            <Field label="Cliente Desde">
              <input 
                type="date"
                style={inputStyle}
                value={novo.cliente_desde} 
                onChange={e => setNovo(n => ({...n, cliente_desde: e.target.value}))}
              />
            </Field>
          </div>
        </div>

        <div className="mt-7 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          {editingId && (
            <button
              onClick={() => {
                setEditingId(null);
                setEditingClient(null);
                setNovo({
                  cnpj: "",
                  nome: "",
                  nome_empresarial: "",
                  cep: "",
                  endereco: "",
                  cidade: "",
                  estado: "",
                  telefone: "",
                  whatsapp_responsavel: "",
                  cliente_desde: "",
                  nome_contato: "",
                  email_cobranca: "",
                  categoria: "",
                  ativo: true,
                });
              }}
              className="h-11 px-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <X size={15} /> Cancelar
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={criando}
            className="h-11 px-8 rounded-full bg-[#0055ff] hover:bg-[#0047d4] active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg hover:shadow-blue-500/20 disabled:opacity-50"
          >
            {criando ? (
              <Loader2 className="animate-spin text-black" size={16} />
            ) : (
              <Save size={16} className="text-black" />
            )}
            {editingId ? "Atualizar Dados" : "Salvar Cliente"}
          </button>
        </div>
      </section>

      {/* 2. Registered Clients Section (Centered, Clean Flat Modern Style com Tons de Azul) */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.03)] border border-[#d0deff]/80 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 text-[#011c5b]">
            <div className="w-10 h-10 rounded-2xl bg-[#d0deff]/40 flex items-center justify-center text-[#011c5b] border border-[#d0deff]">
              <Building2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-[#011c5b]">
                Clientes Cadastrados
              </h3>
              <p className="text-xs text-slate-500 font-medium">Total de contas corporativas da agência</p>
            </div>
            <span className="text-xs font-black bg-[#d0deff]/30 text-[#011c5b] border border-[#d0deff] px-3 py-1 rounded-full ml-1">
              {filtrados.length}
            </span>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar razão social, nome empresarial, CNPJ, categoria, cidade..."
              className="w-72 md:w-80 h-10 rounded-full bg-slate-50 border border-slate-200/80 pl-10 pr-4 text-xs text-[#011c5b] placeholder-slate-400 outline-none focus:bg-white focus:border-[#0055ff] transition-all font-sans"
            />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-[#d0deff]/70 shadow-xs">
            <table className="w-full border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-slate-50/90 text-[#011c5b] border-b border-[#d0deff]">
                  {[
                    "Nome Empresarial / Razão Social", 
                    "CNPJ", 
                    "Endereço / Cidade",
                    "Nome do Contato", 
                    "Telefone / WhatsApp", 
                    "E-mail Financeiro", 
                    "Status",
                    "Ações"
                  ].map((h) => (
                    <th
                      key={h}
                      className={`p-3.5 text-[10px] font-black uppercase tracking-wider ${
                        h === "Ações" ? "text-right pr-4" : h === "Status" ? "text-center" : "text-left pl-4"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((cliente, idx) => (
                  <tr
                    key={cliente.id || idx}
                    className={`hover:bg-slate-50/80 transition-colors ${cliente.ativo === false ? "opacity-60 bg-slate-50/40" : ""}`}
                  >
                    <td className="p-3 pl-4">
                      <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${cliente.ativo !== false ? "bg-emerald-500" : "bg-rose-400"}`} />
                        <div>
                          <div className="font-bold text-slate-800">
                            {cliente.nome_empresarial || cliente.nome}
                          </div>
                          {cliente.nome && (cliente.nome_empresarial ? cliente.nome !== cliente.nome_empresarial : false) && (
                            <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                              {cliente.nome}
                            </div>
                          )}
                          {cliente.categoria && (
                            <div className="mt-1 flex items-center gap-1">
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-50 text-[#0055ff] border border-blue-100">
                                <Tag size={9} /> {cliente.categoria}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap font-mono">{cliente.cnpj || "—"}</td>
                    <td className="p-3 text-slate-600">
                      <div>
                        {cliente.endereco && cliente.endereco !== "Endereço não cadastrado" ? (
                          <span>{cliente.endereco}</span>
                        ) : !cliente.cidade ? (
                          <span className="text-slate-400">—</span>
                        ) : null}
                        {cliente.cidade && (
                          <div className={`text-[11px] text-slate-500 font-medium ${cliente.endereco && cliente.endereco !== "Endereço não cadastrado" ? "mt-0.5" : ""}`}>
                            {cliente.cidade}{cliente.estado ? ` - ${cliente.estado}` : ""}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-slate-600">
                      {cliente.nome_contato || cliente.executiva_venda ? (
                        <div className="flex items-center gap-1.5">
                          <UserCog size={13} className="text-slate-400 shrink-0" />
                          <span>{cliente.nome_contato || cliente.executiva_venda}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {cliente.whatsapp_responsavel ? (
                        <div className="flex flex-col text-[11px]">
                          <span className="font-semibold text-emerald-600">
                            {cliente.whatsapp_responsavel} <span className="text-[9px] font-normal uppercase text-slate-400">(Whats)</span>
                          </span>
                          {cliente.telefone_comercial && cliente.telefone_comercial !== cliente.whatsapp_responsavel && cliente.telefone_comercial !== "(00) 0000-0000" && (
                            <span className="text-slate-400 text-[10px]">{cliente.telefone_comercial}</span>
                          )}
                        </div>
                      ) : cliente.telefone_comercial && cliente.telefone_comercial !== "(00) 0000-0000" ? (
                        <span>{cliente.telefone_comercial}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="p-3 text-slate-600">
                      {cliente.email_cobranca ? (
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Mail size={12} className="text-slate-400 shrink-0" />
                          <span className="truncate max-w-[180px]">{cliente.email_cobranca}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    {/* COLUNA STATUS COM TOGGLE */}
                    <td className="p-3 text-center">
                      <div className="inline-flex items-center gap-2">
                        <Switch
                          checked={cliente.ativo !== false}
                          onCheckedChange={() => handleToggleAtivo(cliente)}
                          className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300 scale-90"
                          title={cliente.ativo !== false ? "Clique para desativar cliente" : "Clique para ativar cliente"}
                        />
                        <span className={`text-[10px] font-black uppercase tracking-wider ${
                          cliente.ativo !== false ? "text-emerald-700" : "text-slate-400"
                        }`}>
                          {cliente.ativo !== false ? "Ativo" : "Inativo"}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 pr-4 text-right">
                      <div className="flex justify-end gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleEdit(cliente)}
                          className="rounded-full text-slate-400 hover:text-[#0055ff] hover:bg-slate-100 h-8 w-8"
                          title="Editar dados"
                        >
                          <UserCog size={15} />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(cliente)}
                          className="rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 h-8 w-8"
                          title="Excluir cliente"
                        >
                          <Trash2 size={15} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Modal de Gestão de Categorias de Clientes */}
      {modalCategoriasOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-2xl border border-slate-100 space-y-6 animate-scale-in">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 text-[#0055ff] flex items-center justify-center border border-blue-100">
                  <Tag size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black uppercase tracking-wider text-[#002132]">
                    Categorias de Clientes
                  </h3>
                  <p className="text-xs text-slate-400 font-medium">
                    Cadastre ou gerencie as categorias da agência
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalCategoriasOpen(false);
                  setNovaCategoriaInput("");
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {/* Input para nova categoria */}
            <div className="space-y-2">
              <label style={labelStyle}>Nova Categoria</label>
              <div className="flex items-center gap-2">
                <input
                  style={inputStyle}
                  value={novaCategoriaInput}
                  onChange={e => setNovaCategoriaInput(e.target.value.toUpperCase())}
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCategoria();
                    }
                  }}
                  placeholder="EX: SUPERMERCADO, EVENTOS, GOVERNO..."
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => handleAddCategoria()}
                  className="h-11 px-5 rounded-full bg-[#0055ff] hover:bg-[#0047d4] active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-1.5 transition-all shrink-0 cursor-pointer shadow-sm"
                >
                  <Plus size={16} strokeWidth={2.5} /> Adicionar
                </button>
              </div>
            </div>

            {/* Lista de categorias existentes */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label style={labelStyle}>Categorias Cadastradas ({categorias.length})</label>
                <span className="text-[10px] text-slate-400 font-medium">Clique para selecionar</span>
              </div>
              <div className="max-h-56 overflow-y-auto pr-1 space-y-1.5 rounded-2xl border border-slate-100 p-2 bg-slate-50/50">
                {categorias.length === 0 ? (
                  <div className="py-8 text-center text-xs text-slate-400 font-medium leading-relaxed">
                    Nenhuma categoria cadastrada ainda.<br />
                    Digite um nome acima e clique em <span className="text-[#0055ff] font-bold">Adicionar</span>.
                  </div>
                ) : (
                  categorias.map(cat => (
                    <div
                      key={cat}
                      className={`flex items-center justify-between px-3.5 py-2 rounded-xl transition-all ${
                        novo.categoria === cat
                          ? "bg-blue-50 border border-blue-200 text-[#0055ff]"
                          : "bg-white hover:bg-slate-100/80 border border-slate-100 text-slate-700"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setNovo(prev => ({ ...prev, categoria: cat }));
                          setModalCategoriasOpen(false);
                          toast.success(`Categoria "${cat}" selecionada!`);
                        }}
                        className="flex items-center gap-2 flex-1 text-left cursor-pointer font-bold text-xs uppercase tracking-wide truncate"
                      >
                        <Tag size={13} className={novo.categoria === cat ? "text-[#0055ff]" : "text-slate-400"} />
                        <span className="truncate">{cat}</span>
                        {novo.categoria === cat && (
                          <span className="text-[10px] bg-[#0055ff] text-white px-2 py-0.5 rounded-full font-bold ml-1">
                            Selecionada
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteCategoria(cat);
                        }}
                        title={`Excluir categoria "${cat}"`}
                        className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors ml-2 cursor-pointer"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setModalCategoriasOpen(false);
                  setNovaCategoriaInput("");
                }}
                className="h-10 px-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
