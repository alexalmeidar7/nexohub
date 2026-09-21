import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Users, KeyRound, Lock, Mail, Package, Link2, Copy, Check, 
  Trash2, Edit2, Plus, Search, ExternalLink, ShieldCheck, ShieldAlert,
  Sparkles, Eye, EyeOff, Radio, RefreshCw, AlertCircle, Building2, X
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { confirmDialog } from "@/lib/confirmDialog";
import { getStoredMetadata, DEFAULT_AGENCY_CLIENTS } from "./ClientesPage";
import { loadFinanceiroClients } from "@/lib/financeiroService";

export interface SubUsuarioConfig {
  id: string;
  nome: string;
  email: string;
  senha: string;
  perfil: "full" | "recepcao" | "locutor" | "producao" | "comercial";
  ativo?: boolean; // Liberado (true) ou Negado (false)
}

export interface HouseMixClientAccess {
  id: string;
  clienteId: string;
  clienteNome: string;
  clienteRazaoSocial?: string;
  clienteLogo?: string | null;
  emailAcesso: string;
  senhaAcesso: string;
  pacoteId: string;
  pacoteNome: string;
  usrSlug: string;
  subusuarios: SubUsuarioConfig[];
  ativo: boolean; // Liberado (true) ou Negado (false)
  createdAt: string;
  updatedAt?: string;
}

const STORAGE_KEY = "nexohub_housemix_acessos_v1";

const PERFIS_SUBUSUARIO = [
  { key: "full", label: "FULL", desc: "Acesso total aos módulos", color: "#0055ff", badgeBg: "bg-blue-50 text-[#0055ff] border-blue-200" },
  { key: "recepcao", label: "RECEPÇÃO", desc: "Atendimento e cadastros", color: "#0284c7", badgeBg: "bg-sky-50 text-sky-700 border-sky-200" },
  { key: "locutor", label: "LOCUTOR", desc: "Estúdio e no ar", color: "#7c3aed", badgeBg: "bg-purple-50 text-purple-700 border-purple-200" },
  { key: "producao", label: "PRODUÇÃO", desc: "Conteúdo e pautas", color: "#d97706", badgeBg: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "comercial", label: "COMERCIAL", desc: "Vendas e patrocínios", color: "#059669", badgeBg: "bg-emerald-50 text-emerald-700 border-emerald-200" },
] as const;

const DEFAULT_PLANOS = [
  { id: "house-basic", name: "House Mix Standard" },
  { id: "house-plus", name: "House Mix Nexo Max" },
  { id: "house-omni", name: "Pack Nexo Omni 360" },
  { id: "house-custom", name: "House Mix Personalizado" },
];

const INITIAL_SEED_ACESSOS: HouseMixClientAccess[] = [
  {
    id: "hm_cultura_fm",
    clienteId: "cli_cultura_fm",
    clienteNome: "CULTURA FM",
    clienteRazaoSocial: "A3 PRODUCOES E MARKETING LTDA",
    clienteLogo: null,
    emailAcesso: "culturafm973@gmail.com",
    senhaAcesso: "cultura2026",
    pacoteId: "house-plus",
    pacoteNome: "House Mix Nexo Max",
    usrSlug: "culturafm973",
    subusuarios: [],
    ativo: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "hm_radio_jornal",
    clienteId: "cli_radio_jornal",
    clienteNome: "RADIO JORNAL",
    clienteRazaoSocial: "RADIO JORNAL DE INHUMAS LTDA",
    clienteLogo: null,
    emailAcesso: "transmissao@jornalfm.com.br",
    senhaAcesso: "jornal2026",
    pacoteId: "house-plus",
    pacoteNome: "House Mix Nexo Max",
    usrSlug: "transmissao",
    subusuarios: [],
    ativo: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "hm_interativa_fm",
    clienteId: "cli_interativa_fm",
    clienteNome: "INTERATIVA FM",
    clienteRazaoSocial: "RADIO INTERATIVA FM LTDA",
    clienteLogo: null,
    emailAcesso: "interativafmgynaovivo@gmail.com",
    senhaAcesso: "interativa2026",
    pacoteId: "house-plus",
    pacoteNome: "House Mix Nexo Max",
    usrSlug: "interativafm",
    subusuarios: [
      {
        id: "sub_interativa_1",
        nome: "Comercial Interativa",
        email: "comercial@interativafm.net",
        senha: "interativacom",
        perfil: "comercial",
        ativo: true,
      },
    ],
    ativo: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: "hm_radio_positiva_fm",
    clienteId: "cli_radio_positiva_fm",
    clienteNome: "RADIO POSITIVA FM",
    clienteRazaoSocial: "RADIO POSITIVA FM LTDA",
    clienteLogo: null,
    emailAcesso: "positivafm@positivafm.com.br",
    senhaAcesso: "positiva2026",
    pacoteId: "house-plus",
    pacoteNome: "House Mix Nexo Max",
    usrSlug: "positivafm",
    subusuarios: [
      {
        id: "sub_positiva_1",
        nome: "Comercial Positiva",
        email: "comercial@positivafm.com.br",
        senha: "positivacom",
        perfil: "comercial",
        ativo: true,
      },
    ],
    ativo: true,
    createdAt: new Date().toISOString(),
  },
];

function generateSlug(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function generateRandomPassword(len = 8): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#";
  let res = "";
  for (let i = 0; i < len; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

export interface ClienteOption {
  id: string;
  nome: string;
  razaoSocial: string;
  cnpj?: string;
  logo?: string | null;
  email?: string;
  telefone?: string;
  cidade?: string;
}

/**
 * Componente ToggleSwitch reutilizável com indicador de status
 */
interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  labelOn?: string;
  labelOff?: string;
  size?: "xs" | "sm" | "md";
  disabled?: boolean;
  tooltip?: string;
}

function ToggleSwitch({
  checked,
  onChange,
  labelOn = "LIBERADO",
  labelOff = "NEGADO",
  size = "md",
  disabled = false,
  tooltip,
}: ToggleSwitchProps) {
  const isChecked = checked !== false;

  if (size === "xs") {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          onChange(!isChecked);
        }}
        title={tooltip || (isChecked ? "Acesso Liberado - Clique para Negar/Bloquear" : "Acesso Negado - Clique para Liberar")}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer select-none border ${
          isChecked
            ? "bg-emerald-50 text-emerald-700 border-emerald-300 hover:bg-emerald-100"
            : "bg-rose-50 text-rose-700 border-rose-300 hover:bg-rose-100"
        }`}
      >
        <span
          className={`w-1.5 h-1.5 rounded-full ${
            isChecked ? "bg-emerald-500 animate-pulse" : "bg-rose-500"
          }`}
        />
        <span>{isChecked ? labelOn : labelOff}</span>
      </button>
    );
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!isChecked);
      }}
      title={tooltip || (isChecked ? "Acesso Liberado - Clique para Negar/Bloquear" : "Acesso Negado - Clique para Liberar")}
      className={`inline-flex items-center gap-2 select-none cursor-pointer group ${
        disabled ? "opacity-50 cursor-not-allowed" : ""
      }`}
    >
      <div
        className={`relative inline-flex ${
          size === "sm" ? "h-5 w-9" : "h-6 w-11"
        } shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out border ${
          isChecked
            ? "bg-emerald-500 border-emerald-600 shadow-[0_2px_8px_rgba(16,185,129,0.35)]"
            : "bg-slate-300 border-slate-400 shadow-inner"
        }`}
      >
        <span
          className={`pointer-events-none inline-block ${
            size === "sm" ? "h-3.5 w-3.5" : "h-4.5 w-4.5"
          } rounded-full bg-white shadow-md transform ring-0 transition-transform duration-200 ease-in-out ${
            isChecked
              ? (size === "sm" ? "translate-x-4.5" : "translate-x-5.5")
              : "translate-x-0.5"
          } flex items-center justify-center`}
        >
          {isChecked ? (
            <Check className="w-2.5 h-2.5 text-emerald-600 stroke-[3]" />
          ) : (
            <X className="w-2.5 h-2.5 text-slate-400 stroke-[3]" />
          )}
        </span>
      </div>

      <span
        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all border flex items-center gap-1.5 ${
          isChecked
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 group-hover:bg-emerald-100 shadow-xs"
            : "bg-rose-50 text-rose-700 border-rose-200 group-hover:bg-rose-100 shadow-xs"
        }`}
      >
        <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? "bg-emerald-500" : "bg-rose-500"}`} />
        <span>{isChecked ? labelOn : labelOff}</span>
      </span>
    </div>
  );
}

export default function HouseMixAcessoUsuario() {
  const [acessos, setAcessos] = useState<HouseMixClientAccess[]>([]);
  const [clientesDisponiveis, setClientesDisponiveis] = useState<ClienteOption[]>([]);
  const [planosDisponiveis, setPlanosDisponiveis] = useState<{ id: string; name: string }[]>(DEFAULT_PLANOS);
  const [busca, setBusca] = useState("");
  const [showSenhaMaster, setShowSenhaMaster] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [clienteSearch, setClienteSearch] = useState("");
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [selectedClienteId, setSelectedClienteId] = useState("");
  const [selectedClienteNome, setSelectedClienteNome] = useState("");
  const [selectedClienteRazao, setSelectedClienteRazao] = useState("");
  const [selectedClienteLogo, setSelectedClienteLogo] = useState<string | null>(null);

  const [emailAcesso, setEmailAcesso] = useState("");
  const [senhaAcesso, setSenhaAcesso] = useState("");
  const [pacoteId, setPacoteId] = useState("");
  const [usrSlug, setUsrSlug] = useState("");
  const [formClienteAtivo, setFormClienteAtivo] = useState(true);

  const [subusuarios, setSubusuarios] = useState<SubUsuarioConfig[]>([]);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsClientDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Load Saved Acessos from localStorage or Seed Defaults
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Normalize ativo properties
          const normalized = parsed.map((item: any) => ({
            ...item,
            ativo: item.ativo !== false,
            subusuarios: (item.subusuarios || []).map((s: any) => ({
              ...s,
              ativo: s.ativo !== false,
            })),
          }));
          setAcessos(normalized);
          return;
        }
      }
      // Initial seed fallback
      setAcessos(INITIAL_SEED_ACESSOS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_SEED_ACESSOS));
    } catch (e) {
      console.error("Erro ao carregar acessos House Mix:", e);
      setAcessos(INITIAL_SEED_ACESSOS);
    }
  }, []);

  // Save Acessos helper
  const saveAcessos = (list: HouseMixClientAccess[]) => {
    setAcessos(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent("housemix:acessos-updated", { detail: list }));
    } catch (e) {
      console.error("Erro ao salvar acessos:", e);
    }
  };

  // Toggle Client Access Status (Liberar / Negar)
  const handleToggleClientAccess = (id: string) => {
    const target = acessos.find(a => a.id === id);
    if (!target) return;
    const newStatus = target.ativo === false ? true : false;
    const updated = acessos.map(a => a.id === id ? { ...a, ativo: newStatus, updatedAt: new Date().toISOString() } : a);
    saveAcessos(updated);
    if (newStatus) {
      toast.success(`Acesso ao sistema LIBERADO para "${target.clienteNome}"!`);
    } else {
      toast.warning(`Acesso ao sistema NEGADO/BLOQUEADO para "${target.clienteNome}".`);
    }
  };

  // Toggle Subusuario Access Status (Liberar / Negar)
  const handleToggleSubusuarioAccess = (clientId: string, subId: string) => {
    let subNome = "";
    let newSubStatus = true;
    const updated = acessos.map(a => {
      if (a.id === clientId) {
        const subs = (a.subusuarios || []).map(s => {
          if (s.id === subId) {
            newSubStatus = s.ativo === false ? true : false;
            subNome = s.nome;
            return { ...s, ativo: newSubStatus };
          }
          return s;
        });
        return { ...a, subusuarios: subs, updatedAt: new Date().toISOString() };
      }
      return a;
    });
    saveAcessos(updated);
    if (newSubStatus) {
      toast.success(`Acesso LIBERADO para o subusuário "${subNome}"!`);
    } else {
      toast.warning(`Acesso NEGADO para o subusuário "${subNome}".`);
    }
  };

  // Load registered clients & packs
  useEffect(() => {
    async function loadData() {
      // 1. Clientes
      try {
        const [mapped, storedMeta] = await Promise.all([
          loadFinanceiroClients(),
          getStoredMetadata(),
        ]);
        
        const list: ClienteOption[] = [];
        const seen = new Set<string>();

        const addClient = (
          id: string, 
          nome: string, 
          razaoSocial: string, 
          cnpj?: string, 
          logo?: string | null, 
          email?: string, 
          telefone?: string,
          cidade?: string
        ) => {
          const cleanNome = (nome || "").trim();
          const cleanRazao = (razaoSocial || cleanNome).trim();
          if (!cleanNome) return;
          const key = cleanNome.toUpperCase();
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              id: id || `cli_${Date.now()}_${list.length}`,
              nome: cleanNome,
              razaoSocial: cleanRazao,
              cnpj: cnpj || "",
              logo: logo || null,
              email: email || "",
              telefone: telefone || "",
              cidade: cidade || "",
            });
          }
        };

        // Add from Financeiro / Supabase
        mapped.forEach(c => {
          addClient(
            c.user_id,
            c.nome_empresarial || c.nome,
            c.razao_social || c.nome,
            c.cnpj,
            c.logo,
            c.email,
            c.telefone
          );
        });

        // Add from stored metadata in ClientesPage
        Object.entries(storedMeta).forEach(([k, meta]) => {
          addClient(
            k,
            meta.nome_empresarial || meta.razao_social || k,
            meta.razao_social || meta.nome_empresarial || k,
            meta.cnpj,
            null,
            meta.email_cobranca,
            meta.telefone || meta.whatsapp_responsavel,
            meta.cidade
          );
        });

        // Add from defaults
        Object.entries(DEFAULT_AGENCY_CLIENTS).forEach(([k, meta]) => {
          addClient(
            k,
            meta.nome_empresarial || meta.razao_social || k,
            meta.razao_social || meta.nome_empresarial || k,
            meta.cnpj,
            null,
            meta.email_cobranca,
            meta.telefone || meta.whatsapp_responsavel,
            meta.cidade
          );
        });

        setClientesDisponiveis(list);
      } catch (err) {
        console.error("Erro ao carregar clientes para House Mix:", err);
      }

      // 2. Planos
      try {
        const { data: planosDb } = await supabase.from("planos").select("id, name").order("price");
        if (planosDb && planosDb.length > 0) {
          setPlanosDisponiveis(planosDb.map(p => ({ id: p.id, name: p.name })));
        }
      } catch {
        /* use defaults */
      }
    }

    loadData();
  }, []);

  // When selecting client in form
  const handleSelectCliente = (c: ClienteOption) => {
    setSelectedClienteId(c.id);
    setSelectedClienteNome(c.nome);
    setSelectedClienteRazao(c.razaoSocial);
    setSelectedClienteLogo(c.logo || null);
    setClienteSearch(c.nome);
    setIsClientDropdownOpen(false);

    if (!emailAcesso && c.email) {
      setEmailAcesso(c.email.toLowerCase());
    }
    if (!senhaAcesso) {
      setSenhaAcesso(generateRandomPassword());
    }
    if (!usrSlug) {
      setUsrSlug(generateSlug(c.nome));
    }
    if (!pacoteId && planosDisponiveis.length > 0) {
      setPacoteId(planosDisponiveis[0].id);
    }
  };

  // Subusuários handlers (max 5)
  const handleAddSubusuario = () => {
    if (subusuarios.length >= 5) {
      toast.warning("Limite máximo de 5 subusuários por cliente atingido.");
      return;
    }
    const idx = subusuarios.length + 1;
    setSubusuarios(prev => [
      ...prev,
      {
        id: `sub_${Date.now()}_${idx}`,
        nome: `Subusuário ${idx}`,
        email: "",
        senha: generateRandomPassword(),
        perfil: idx === 1 ? "locutor" : idx === 2 ? "recepcao" : idx === 3 ? "producao" : "comercial",
        ativo: true,
      }
    ]);
  };

  const handleUpdateSubusuario = (id: string, patch: Partial<SubUsuarioConfig>) => {
    setSubusuarios(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const handleRemoveSubusuario = (id: string) => {
    setSubusuarios(prev => prev.filter(s => s.id !== id));
  };

  // Open Form for New Access
  const handleOpenNew = () => {
    setEditingId(null);
    setSelectedClienteId("");
    setSelectedClienteNome("");
    setSelectedClienteRazao("");
    setSelectedClienteLogo(null);
    setClienteSearch("");
    setEmailAcesso("");
    setSenhaAcesso(generateRandomPassword());
    setPacoteId(planosDisponiveis[0]?.id || "");
    setUsrSlug("");
    setFormClienteAtivo(true);
    setSubusuarios([]);
    setIsFormOpen(true);
  };

  // Open Form for Editing
  const handleOpenEdit = (item: HouseMixClientAccess) => {
    setEditingId(item.id);
    setSelectedClienteId(item.clienteId);
    setSelectedClienteNome(item.clienteNome);
    setSelectedClienteRazao(item.clienteRazaoSocial || item.clienteNome);
    setSelectedClienteLogo(item.clienteLogo || null);
    setClienteSearch(item.clienteNome);
    setEmailAcesso(item.emailAcesso);
    setSenhaAcesso(item.senhaAcesso);
    setPacoteId(item.pacoteId);
    setUsrSlug(item.usrSlug);
    setFormClienteAtivo(item.ativo !== false);
    setSubusuarios((item.subusuarios || []).map(s => ({
      ...s,
      ativo: s.ativo !== false,
    })));
    setIsFormOpen(true);
  };

  // Save Submission
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedClienteNome.trim()) {
      toast.error("Por favor, selecione ou digite o nome do cliente.");
      return;
    }
    if (!emailAcesso.trim()) {
      toast.error("Informe o e-mail de acesso principal.");
      return;
    }
    if (!senhaAcesso.trim()) {
      toast.error("Informe a senha de acesso.");
      return;
    }
    if (!usrSlug.trim()) {
      toast.error("Informe o USR SLUG para gerar o link do House Mix.");
      return;
    }

    const cleanSlug = generateSlug(usrSlug);
    // Check if slug is already used by another client
    const slugInUse = acessos.some(a => a.usrSlug === cleanSlug && a.id !== editingId);
    if (slugInUse) {
      toast.error(`O USR SLUG "${cleanSlug}" já está em uso por outro cliente.`);
      return;
    }

    const foundPacote = planosDisponiveis.find(p => p.id === pacoteId);
    const pacoteNome = foundPacote ? foundPacote.name : "House Mix Standard";

    if (editingId) {
      const updated = acessos.map(a => {
        if (a.id === editingId) {
          return {
            ...a,
            clienteId: selectedClienteId || a.clienteId,
            clienteNome: selectedClienteNome,
            clienteRazaoSocial: selectedClienteRazao || selectedClienteNome,
            clienteLogo: selectedClienteLogo || a.clienteLogo,
            emailAcesso: emailAcesso.trim(),
            senhaAcesso: senhaAcesso.trim(),
            pacoteId: pacoteId || a.pacoteId,
            pacoteNome: pacoteNome,
            usrSlug: cleanSlug,
            ativo: formClienteAtivo,
            subusuarios: subusuarios.map(s => ({ ...s, ativo: s.ativo !== false })),
            updatedAt: new Date().toISOString(),
          };
        }
        return a;
      });
      saveAcessos(updated);
      toast.success(`Acesso do cliente "${selectedClienteNome}" atualizado com sucesso!`);
    } else {
      const newAccess: HouseMixClientAccess = {
        id: `hm_access_${Date.now()}`,
        clienteId: selectedClienteId || `cli_${Date.now()}`,
        clienteNome: selectedClienteNome,
        clienteRazaoSocial: selectedClienteRazao || selectedClienteNome,
        clienteLogo: selectedClienteLogo || null,
        emailAcesso: emailAcesso.trim(),
        senhaAcesso: senhaAcesso.trim(),
        pacoteId: pacoteId || planosDisponiveis[0]?.id || "pack-standard",
        pacoteNome: pacoteNome,
        usrSlug: cleanSlug,
        subusuarios: subusuarios.map(s => ({ ...s, ativo: s.ativo !== false })),
        ativo: formClienteAtivo,
        createdAt: new Date().toISOString(),
      };
      saveAcessos([newAccess, ...acessos]);
      toast.success(`Cliente "${selectedClienteNome}" vinculado ao House Mix com sucesso!`);
    }

    setIsFormOpen(false);
  };

  // Delete handler
  const handleDeleteAccess = async (item: HouseMixClientAccess) => {
    const confirmed = await confirmDialog({
      title: "Remover Acesso do Cliente",
      message: `Deseja realmente desvincular o cliente "${item.clienteNome}" do House Mix? O link e as credenciais de acesso serão desativados.`,
      confirmLabel: "Remover Acesso",
      destructive: true,
    });
    if (!confirmed) return;

    const filtered = acessos.filter(a => a.id !== item.id);
    saveAcessos(filtered);
    toast.success("Acesso removido com sucesso!");
  };

  // Copy Access URL
  const handleCopyLink = (slugVal: string, id: string) => {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://app.nexobrasil.net";
    const fullUrl = `${origin}/housemix/${slugVal}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    toast.success("Link do House Mix copiado para a área de transferência!");
    setTimeout(() => setCopiedId(null), 2500);
  };

  // Filtered accesses for table
  const filteredAcessos = useMemo(() => {
    const q = busca.toLowerCase().trim();
    if (!q) return acessos;
    return acessos.filter(a => 
      a.clienteNome.toLowerCase().includes(q) ||
      (a.clienteRazaoSocial && a.clienteRazaoSocial.toLowerCase().includes(q)) ||
      a.emailAcesso.toLowerCase().includes(q) ||
      a.usrSlug.toLowerCase().includes(q) ||
      a.pacoteNome.toLowerCase().includes(q)
    );
  }, [acessos, busca]);

  // Clients matching autocomplete dropdown
  const filteredClientesDropdown = useMemo(() => {
    const q = clienteSearch.toLowerCase().trim();
    if (!q) return clientesDisponiveis;
    return clientesDisponiveis.filter(c => 
      c.nome.toLowerCase().includes(q) || 
      c.razaoSocial.toLowerCase().includes(q) ||
      (c.cnpj && c.cnpj.toLowerCase().includes(q)) ||
      (c.email && c.email.toLowerCase().includes(q)) ||
      (c.cidade && c.cidade.toLowerCase().includes(q))
    );
  }, [clientesDisponiveis, clienteSearch]);

  const originUrl = typeof window !== "undefined" ? window.location.origin : "https://app.nexobrasil.net";

  return (
    <div className="w-full space-y-6 animate-fade-in font-sans">
      {/* Top Banner da Seção: Acesso Usuário ao House Mix */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.03)] border border-slate-200/80">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#002132] to-[#01334e] text-white flex items-center justify-center shadow-sm shrink-0 border border-slate-800/10">
              <KeyRound className="w-6 h-6 text-[#0055ff]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-xl lg:text-2xl font-black tracking-tight text-[#002132]">
                  Acesso Usuário
                </h2>
                <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-[#0055ff]/10 text-[#0055ff] border border-[#0055ff]/20">
                  Vinculação & Gestão de Permissões House Mix
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Controle o acesso ao sistema House Mix para cada cliente e subusuário através dos toggles de liberação/bloqueio, com gestão de links exclusivos (USR SLUG) e perfis operacionais.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleOpenNew}
            className="h-11 px-6 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 shadow-[0_4px_16px_rgba(0,85,255,0.28)] hover:shadow-[0_6px_20px_rgba(0,85,255,0.38)] active:scale-95 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 text-white stroke-[3]" />
            <span>Vincular Novo Cliente</span>
          </button>
        </div>
      </section>

      {/* FORMULÁRIO MODAL / DRAWER DE VINCULAÇÃO */}
      {isFormOpen && (
        <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_8px_32px_rgba(0,33,50,0.08)] border-2 border-[#0055ff]/30 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between pb-5 border-b border-slate-100 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#0055ff]/10 text-[#0055ff] flex items-center justify-center font-black">
                {editingId ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="text-base font-black text-[#002132] uppercase tracking-wider">
                  {editingId ? `Editar Acesso: ${selectedClienteNome}` : "Vincular Cliente ao House Mix"}
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  Preencha os dados do cliente, status do acesso, credenciais, pacote e subusuários
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsFormOpen(false)}
              className="h-9 px-4 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
          </div>

          <form onSubmit={handleSubmitForm} className="space-y-6">
            {/* Status do Acesso Principal (Liberado / Negado) */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold ${
                  formClienteAtivo ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                }`}>
                  {formClienteAtivo ? <ShieldCheck className="w-5 h-5" /> : <ShieldAlert className="w-5 h-5" />}
                </div>
                <div>
                  <div className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Status do Acesso ao Sistema (Cliente)
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {formClienteAtivo 
                      ? "O cliente tem acesso total liberado aos módulos contratados no House Mix" 
                      : "O acesso do cliente ao sistema está bloqueado / negado"}
                  </div>
                </div>
              </div>

              <ToggleSwitch
                checked={formClienteAtivo}
                onChange={setFormClienteAtivo}
                labelOn="ACESSO LIBERADO"
                labelOff="ACESSO NEGADO"
                size="md"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {/* 1. CLIENTE (Busca nos clientes cadastrados) */}
              <div className="lg:col-span-2 relative" ref={dropdownRef}>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 block mb-1.5 flex items-center justify-between">
                  <span>1. Cliente (Busca nos Cadastrados) *</span>
                  {selectedClienteRazao && (
                    <span className="text-[10px] text-slate-400 font-normal">
                      Razão Social: {selectedClienteRazao}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={clienteSearch}
                    onFocus={() => setIsClientDropdownOpen(true)}
                    onClick={() => setIsClientDropdownOpen(true)}
                    onChange={e => {
                      setClienteSearch(e.target.value);
                      setIsClientDropdownOpen(true);
                      setSelectedClienteNome(e.target.value);
                      if (!usrSlug) setUsrSlug(generateSlug(e.target.value));
                    }}
                    placeholder="Digite para buscar emissora, razão social ou CNPJ cadastrado..."
                    className="w-full h-11 pl-10 pr-10 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:border-[#0055ff] focus:bg-white transition-all"
                    required
                  />
                  {clienteSearch && (
                    <button
                      type="button"
                      onClick={() => {
                        setClienteSearch("");
                        setSelectedClienteId("");
                        setSelectedClienteNome("");
                        setSelectedClienteRazao("");
                        setSelectedClienteLogo(null);
                        setIsClientDropdownOpen(true);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-200/60 transition-colors"
                      title="Limpar busca"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Dropdown de sugestões e clientes cadastrados */}
                {isClientDropdownOpen && (
                  <div className="absolute top-full left-0 right-0 mt-1.5 bg-white rounded-2xl shadow-2xl border border-slate-200 p-2 z-50 max-h-64 overflow-y-auto space-y-1 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-3 py-1.5 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 flex items-center justify-between">
                      <span>Clientes Cadastrados ({filteredClientesDropdown.length})</span>
                      <span className="text-[#0055ff]">Clique para selecionar</span>
                    </div>

                    {filteredClientesDropdown.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-400 font-medium">
                        Nenhum cliente cadastrado encontrado com "{clienteSearch}".
                      </div>
                    ) : (
                      filteredClientesDropdown.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectCliente(c);
                          }}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition-all flex items-center justify-between gap-3 cursor-pointer ${
                            selectedClienteId === c.id || selectedClienteNome === c.nome
                              ? "bg-blue-50/80 border border-blue-200 text-[#0055ff]"
                              : "hover:bg-slate-50 border border-transparent text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 rounded-xl bg-[#0055ff]/10 text-[#0055ff] border border-[#0055ff]/20 flex items-center justify-center font-black text-xs shrink-0">
                              {c.nome.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-slate-900 truncate text-xs">{c.nome}</p>
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">
                                {c.razaoSocial} {c.cnpj ? `• CNPJ: ${c.cnpj}` : ""} {c.cidade ? `• ${c.cidade}` : ""}
                              </p>
                            </div>
                          </div>
                          <span className="shrink-0 text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-[#0055ff] text-white shadow-xs">
                            Selecionar
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* 2. PACOTE (Vem da aba pacotes e planos) */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 block mb-1.5">
                  2. Pacote & Plano *
                </label>
                <div className="relative">
                  <Package className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={pacoteId}
                    onChange={e => setPacoteId(e.target.value)}
                    className="w-full h-11 pl-10 pr-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:border-[#0055ff] focus:bg-white transition-all cursor-pointer"
                    required
                  >
                    {planosDisponiveis.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 3. EMAIL ACESSO */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 block mb-1.5">
                  3. E-mail de Acesso (Mestre) *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={emailAcesso}
                    onChange={e => setEmailAcesso(e.target.value)}
                    placeholder="ex: admin@culturafm.com.br"
                    className="w-full h-11 pl-10 pr-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-[#0055ff] focus:bg-white transition-all font-mono"
                    required
                  />
                </div>
              </div>

              {/* 4. SENHA ACESSO */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-black uppercase tracking-wider text-slate-700">
                    4. Senha de Acesso *
                  </label>
                  <button
                    type="button"
                    onClick={() => setSenhaAcesso(generateRandomPassword())}
                    className="text-[10px] text-[#0055ff] font-bold hover:underline"
                  >
                    Gerar Aleatória
                  </button>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showSenhaMaster ? "text" : "password"}
                    value={senhaAcesso}
                    onChange={e => setSenhaAcesso(e.target.value)}
                    placeholder="Senha de acesso..."
                    className="w-full h-11 pl-10 pr-10 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-[#0055ff] focus:bg-white transition-all font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowSenhaMaster(prev => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showSenhaMaster ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 5. USR SLUG (Link do cliente com o House Mix) */}
              <div>
                <label className="text-[11px] font-black uppercase tracking-wider text-slate-700 block mb-1.5">
                  5. USR SLUG (Link do House Mix) *
                </label>
                <div className="relative">
                  <Link2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={usrSlug}
                    onChange={e => setUsrSlug(generateSlug(e.target.value))}
                    placeholder="ex: culturafm"
                    className="w-full h-11 pl-10 pr-4 rounded-2xl bg-slate-50 border border-slate-200 text-xs font-black text-[#0055ff] outline-none focus:border-[#0055ff] focus:bg-white transition-all font-mono tracking-wide"
                    required
                  />
                </div>
              </div>
            </div>

            {/* USR SLUG PREVIEW BANNER */}
            {usrSlug && (
              <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 flex items-center justify-between flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[#0055ff]">Link Exclusivo do Cliente:</span>
                  <span className="font-mono text-slate-700 font-semibold underline">
                    {originUrl}/housemix/{generateSlug(usrSlug)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyLink(generateSlug(usrSlug), "form_link")}
                  className="px-3 py-1 rounded-full bg-white text-[#0055ff] border border-blue-200 text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:bg-[#0055ff] hover:text-white transition-all cursor-pointer shadow-xs"
                >
                  <Copy className="w-3 h-3" />
                  <span>Copiar Link</span>
                </button>
              </div>
            )}

            {/* 6. SEÇÃO DE SUBUSUÁRIOS (ATÉ 5 SUBUSUÁRIOS) */}
            <div className="pt-5 border-t border-slate-100 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-[#0055ff]" />
                    <h4 className="text-xs font-black text-[#002132] uppercase tracking-wider">
                      Subusuários, Perfis Operacionais & Acessos (Até 5)
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                      {subusuarios.length} de 5 cadastrados
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Defina operadores com perfis específicos e use o toggle para liberar ou bloquear o acesso individual de cada subusuário.
                  </p>
                </div>

                {subusuarios.length < 5 && (
                  <button
                    type="button"
                    onClick={handleAddSubusuario}
                    className="h-9 px-4 rounded-full bg-[#0055ff]/10 hover:bg-[#0055ff] text-[#0055ff] hover:text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all border border-[#0055ff]/20 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar Subusuário</span>
                  </button>
                )}
              </div>

              {subusuarios.length === 0 ? (
                <div className="p-5 rounded-2xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                  Nenhum subusuário cadastrado ainda. Clique em "Adicionar Subusuário" para definir operadores para esta emissora.
                </div>
              ) : (
                <div className="space-y-3">
                  {subusuarios.map((sub, index) => (
                    <div 
                      key={sub.id} 
                      className={`p-4 rounded-2xl border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center transition-all ${
                        sub.ativo !== false 
                          ? "bg-slate-50/90 border-slate-200/90" 
                          : "bg-rose-50/30 border-rose-200/60"
                      }`}
                    >
                      <div className="lg:col-span-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          Identificação / Nome #{index + 1}
                        </label>
                        <input
                          type="text"
                          value={sub.nome}
                          onChange={e => handleUpdateSubusuario(sub.id, { nome: e.target.value })}
                          placeholder="Ex: Locução Manhã"
                          className="w-full h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-[#0055ff]"
                          required
                        />
                      </div>

                      <div className="lg:col-span-3">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          E-mail de Acesso
                        </label>
                        <input
                          type="email"
                          value={sub.email}
                          onChange={e => handleUpdateSubusuario(sub.id, { email: e.target.value })}
                          placeholder="locutor@culturafm.com"
                          className="w-full h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-[#0055ff] font-mono"
                          required
                        />
                      </div>

                      <div className="lg:col-span-2">
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Senha
                          </label>
                          <button
                            type="button"
                            onClick={() => handleUpdateSubusuario(sub.id, { senha: generateRandomPassword() })}
                            className="text-[9px] text-[#0055ff] font-bold hover:underline"
                          >
                            Gerar
                          </button>
                        </div>
                        <input
                          type="text"
                          value={sub.senha}
                          onChange={e => handleUpdateSubusuario(sub.id, { senha: e.target.value })}
                          placeholder="Senha..."
                          className="w-full h-9 px-3 rounded-xl bg-white border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-[#0055ff] font-mono"
                          required
                        />
                      </div>

                      <div className="lg:col-span-2">
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          Perfil / Permissão
                        </label>
                        <select
                          value={sub.perfil}
                          onChange={e => handleUpdateSubusuario(sub.id, { perfil: e.target.value as any })}
                          className="w-full h-9 px-2 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-800 outline-none focus:border-[#0055ff] cursor-pointer"
                        >
                          {PERFIS_SUBUSUARIO.map(p => (
                            <option key={p.key} value={p.key}>
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Toggle de Acesso Individual do Subusuário */}
                      <div className="lg:col-span-2 flex items-center justify-between lg:justify-end gap-2 pt-2 lg:pt-0">
                        <div className="flex flex-col items-start lg:items-end">
                          <span className="text-[9px] font-bold text-slate-400 uppercase mb-0.5">Acesso</span>
                          <ToggleSwitch
                            checked={sub.ativo !== false}
                            onChange={(chk) => handleUpdateSubusuario(sub.id, { ativo: chk })}
                            size="sm"
                            labelOn="ATIVO"
                            labelOff="BLOQ"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveSubusuario(sub.id)}
                          className="h-8 w-8 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 flex items-center justify-center transition-colors cursor-pointer mt-3"
                          title="Remover este subusuário"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Form Actions */}
            <div className="flex items-center justify-end gap-3 pt-5 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="h-11 px-6 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="h-11 px-8 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider shadow-[0_4px_16px_rgba(0,85,255,0.28)] active:scale-95 transition-all cursor-pointer"
              >
                {editingId ? "Salvar Alterações" : "Concluir Vinculação"}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* TABELA DE CLIENTES VINCULADOS AO HOUSE MIX */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.03)] border border-slate-200/80 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-black text-[#002132] uppercase tracking-wider">
              Clientes Vinculados ao House Mix ({filteredAcessos.length})
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Lista de emissoras com credenciais, toggles de acesso ao sistema, pacote contratado e subusuários
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por cliente, e-mail ou slug..."
              className="w-full h-10 pl-10 pr-4 rounded-full bg-slate-50 border border-slate-200 text-xs font-medium text-slate-800 outline-none focus:border-[#0055ff] focus:bg-white transition-all"
            />
          </div>
        </div>

        {filteredAcessos.length === 0 ? (
          <div className="py-16 text-center space-y-3 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0055ff] flex items-center justify-center mx-auto">
              <KeyRound className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-700">
              Nenhum cliente vinculado ao House Mix encontrado.
            </p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Clique no botão "Vincular Novo Cliente" acima para cadastrar os acessos, pacotes e subusuários de uma emissora.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[1100px]">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] font-black uppercase tracking-wider text-slate-400 bg-slate-50/70 rounded-2xl">
                  <th className="py-3.5 px-4 rounded-l-2xl">Cliente (Emissora)</th>
                  <th className="py-3.5 px-4">E-mail de Acesso</th>
                  <th className="py-3.5 px-4">Pacote Contratado</th>
                  <th className="py-3.5 px-4 text-center">Acesso Sistema</th>
                  <th className="py-3.5 px-4 text-center">Subusuários & Acessos</th>
                  <th className="py-3.5 px-4">USR SLUG (Link House Mix)</th>
                  <th className="py-3.5 px-4 text-center rounded-r-2xl">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-sans">
                {filteredAcessos.map(item => {
                  const accessUrl = `${originUrl}/housemix/${item.usrSlug}`;
                  const isCopied = copiedId === item.id;
                  const isClienteAtivo = item.ativo !== false;

                  return (
                    <tr 
                      key={item.id} 
                      className={`transition-colors group ${
                        isClienteAtivo 
                          ? "hover:bg-blue-50/20" 
                          : "bg-rose-50/15 hover:bg-rose-50/30"
                      }`}
                    >
                      {/* 1. Cliente */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-3">
                          {item.clienteLogo ? (
                            <img
                              src={item.clienteLogo}
                              alt={item.clienteNome}
                              className={`w-10 h-10 rounded-2xl object-contain bg-slate-50 p-1 shrink-0 border ${
                                isClienteAtivo ? "border-slate-200" : "border-rose-200 grayscale opacity-75"
                              }`}
                            />
                          ) : (
                            <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center font-black text-xs shrink-0 ${
                              isClienteAtivo 
                                ? "bg-blue-50 border-blue-200 text-[#0055ff]" 
                                : "bg-rose-50 border-rose-200 text-rose-500"
                            }`}>
                              {item.clienteNome.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-bold text-[#002132] group-hover:text-[#0055ff] transition-colors text-sm flex items-center gap-2">
                              <span>{item.clienteNome}</span>
                              {!isClienteAtivo && (
                                <span className="px-1.5 py-0.2 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-700 border border-rose-200">
                                  Bloqueado
                                </span>
                              )}
                            </div>
                            {item.clienteRazaoSocial && item.clienteRazaoSocial !== item.clienteNome && (
                              <div className="text-[10px] text-slate-400 font-medium">
                                {item.clienteRazaoSocial}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* 2. Email Acesso */}
                      <td className="py-4 px-4">
                        <div className="font-mono text-slate-700 text-xs font-semibold">
                          {item.emailAcesso}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          Senha: ••••••••
                        </div>
                      </td>

                      {/* 3. Pacote */}
                      <td className="py-4 px-4">
                        <span className="px-3 py-1 rounded-full bg-blue-50 text-[#0055ff] border border-blue-200/80 text-[11px] font-bold">
                          {item.pacoteNome}
                        </span>
                      </td>

                      {/* 4. Acesso ao Sistema (Toggle Cliente) */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex justify-center">
                          <ToggleSwitch
                            checked={isClienteAtivo}
                            onChange={() => handleToggleClientAccess(item.id)}
                            size="sm"
                            labelOn="LIBERADO"
                            labelOff="NEGADO"
                            tooltip={isClienteAtivo ? "Acesso liberado. Clique para bloquear emissora." : "Acesso bloqueado. Clique para liberar emissora."}
                          />
                        </div>
                      </td>

                      {/* 5. Subusuários com Toggles Individuais */}
                      <td className="py-4 px-4">
                        <div className="flex flex-col items-center gap-2 min-w-[200px]">
                          {/* Counter Badge */}
                          <div className="flex items-center gap-1.5">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-black text-[10px] border border-slate-200">
                              {item.subusuarios?.length || 0}/5 subusuários
                            </span>
                            {item.subusuarios && item.subusuarios.length > 0 && (
                              <span className="text-[10px] text-emerald-600 font-bold">
                                ({item.subusuarios.filter(s => s.ativo !== false).length} ativos)
                              </span>
                            )}
                          </div>

                          {/* Lista de subusuários com Toggle individual */}
                          {item.subusuarios && item.subusuarios.length > 0 ? (
                            <div className="w-full space-y-1.5 max-w-[240px]">
                              {item.subusuarios.map(s => {
                                const pDef = PERFIS_SUBUSUARIO.find(p => p.key === s.perfil);
                                const isSubAtivo = s.ativo !== false;

                                return (
                                  <div 
                                    key={s.id}
                                    className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 text-[11px] transition-all ${
                                      isSubAtivo 
                                        ? "bg-white border-slate-200/90 shadow-xs" 
                                        : "bg-rose-50/50 border-rose-200/80 opacity-80"
                                    }`}
                                  >
                                    <div className="min-w-0 flex items-center gap-1.5">
                                      <span 
                                        className={`px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase border shrink-0 ${pDef?.badgeBg || "bg-slate-100"}`}
                                        title={`${pDef?.label} - ${pDef?.desc}`}
                                      >
                                        {pDef?.label.slice(0, 3)}
                                      </span>
                                      <span className="font-semibold text-slate-800 truncate text-[11px]" title={s.nome}>
                                        {s.nome}
                                      </span>
                                    </div>

                                    {/* Toggle do Subusuário */}
                                    <ToggleSwitch
                                      checked={isSubAtivo}
                                      onChange={() => handleToggleSubusuarioAccess(item.id, s.id)}
                                      size="xs"
                                      labelOn="OK"
                                      labelOff="OFF"
                                      tooltip={isSubAtivo ? `Subusuário ${s.nome} ativo. Clique para bloquear.` : `Subusuário ${s.nome} bloqueado. Clique para liberar.`}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">
                              Nenhum subusuário
                            </span>
                          )}
                        </div>
                      </td>

                      {/* 6. USR SLUG (Link) */}
                      <td className="py-4 px-4">
                        <div className="flex items-center gap-2">
                          <div className="px-2.5 py-1 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-bold text-[#0055ff] truncate max-w-[180px]" title={accessUrl}>
                            /{item.usrSlug}
                          </div>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(item.usrSlug, item.id)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-[#0055ff] hover:text-white text-slate-500 transition-all cursor-pointer shrink-0 shadow-xs"
                            title="Copiar Link Completo de Acesso"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                          <a
                            href={`/housemix/${item.usrSlug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors shrink-0 shadow-xs"
                            title="Abrir página do cliente"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </td>

                      {/* 7. Ações */}
                      <td className="py-4 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(item)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-[#002132] hover:text-white text-slate-600 transition-all cursor-pointer shadow-xs"
                            title="Editar Dados de Acesso e Subusuários"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAccess(item)}
                            className="p-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-all cursor-pointer shadow-xs"
                            title="Excluir Vinculação"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
