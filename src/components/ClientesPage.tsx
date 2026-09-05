import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { 
  Building2, Search, Users, Mail, Phone, Calendar, 
  UserCog, Trash2, Plus, Loader2, X, MapPin, 
  Briefcase, Activity, Save, Sparkles, Check
} from "lucide-react";
import { Button } from "@/components/ui/button";

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

interface ClienteMetadata {
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
}

const CLIENTES_METADATA_KEY = "nexohub_clientes_metadata_v1";

const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((val || "").trim());

function getStoredMetadata(): Record<string, ClienteMetadata> {
  try {
    const raw = localStorage.getItem(CLIENTES_METADATA_KEY);
    if (!raw) return {};
    const meta = JSON.parse(raw);
    
    // Purge any raw UUID keys from localStorage that may have leaked
    let cleaned = false;
    Object.keys(meta).forEach(k => {
      if (isUuid(k)) {
        const item = meta[k];
        const realName = item?.razao_social || item?.nome_empresarial;
        if (realName && !meta[realName]) {
          meta[realName] = item;
        }
        delete meta[k];
        cleaned = true;
      }
    });
    if (cleaned) {
      localStorage.setItem(CLIENTES_METADATA_KEY, JSON.stringify(meta));
    }

    return meta;
  } catch {
    return {};
  }
}

function saveStoredMetadata(key: string, meta: ClienteMetadata) {
  try {
    const all = getStoredMetadata();
    // Never store with a UUID key to prevent duplicate listings
    if (isUuid(key)) {
      if (meta.razao_social) {
        all[meta.razao_social] = { ...(all[meta.razao_social] || {}), ...meta };
      }
    } else {
      all[key] = { ...(all[key] || {}), ...meta };
    }
    localStorage.setItem(CLIENTES_METADATA_KEY, JSON.stringify(all));
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

export default function ClientesPage() {
  const { role, user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

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
    email_cobranca: ""
  });

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
        const razao = data.razao_social || data.razao || data.nome || "";
        const fantasia = data.nome_fantasia || data.fantasia || razao;
        const cepRaw = data.cep ? String(data.cep).replace(/\D/g, "") : "";
        const logradouro = data.logradouro || data.descricao_tipo_de_logradouro 
          ? `${data.descricao_tipo_de_logradouro || ""} ${data.logradouro || ""}`.trim() 
          : "";
        const numero = data.numero && data.numero !== "SN" && data.numero !== "S/N" ? `, ${data.numero}` : "";
        const bairro = data.bairro ? ` - ${data.bairro}` : "";
        const fullEndereco = logradouro ? `${logradouro}${numero}${bairro}` : "";
        const municipio = data.municipio || "";
        const uf = data.uf || "";
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
          email_cobranca: prev.email_cobranca || (data.email || ""),
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
        const street = data.logradouro || data.street || "";
        const bairro = data.bairro || data.neighborhood || "";
        const city = data.localidade || data.city || "";
        const state = data.uf || data.state || "";

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

  const load = async () => {
    setLoading(true);
    try {
      const storedMeta = getStoredMetadata();

      const { data: logosData } = await supabase
        .from("logos_patrocinadores")
        .select("id, user_id, nome, logo_url, ativo, created_at")
        .eq("excluido", false)
        .order("nome");
      
      const { data: agendaData } = await supabase
        .from("blitz_promocionais")
        .select("*");

      const uniqueClients: Cliente[] = [];
      const seenNames = new Set<string>();
      const seenCnpjs = new Set<string>();
      const seenIds = new Set<string>();

      (logosData || []).forEach(item => {
        let name = (item.nome || "").trim();
        if (!name) return;

        // Never allow raw UUIDs as client names
        if (isUuid(name)) {
          const metaCandidate = storedMeta[name] || storedMeta[item.id] || {};
          if (metaCandidate.razao_social || metaCandidate.nome_empresarial) {
            name = (metaCandidate.razao_social || metaCandidate.nome_empresarial)!.trim();
          } else {
            // Ignore rogue UUID entries in Supabase
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

        uniqueClients.push({
          id: item.id,
          user_id: item.user_id,
          nome: name,
          nome_empresarial: meta.nome_empresarial || "",
          logo_url: item.logo_url,
          ativo: item.ativo,
          cnpj: meta.cnpj || "",
          cep: meta.cep || "",
          cliente_desde: meta.cliente_desde || item.created_at?.split('T')[0] || "",
          telefone_comercial: meta.telefone || "(00) 0000-0000",
          whatsapp_responsavel: meta.whatsapp_responsavel || "",
          endereco: meta.endereco || "Endereço não cadastrado",
          cidade: meta.cidade || "",
          estado: meta.estado || "",
          nome_contato: meta.nome_contato || "",
          executiva_venda: meta.nome_contato || "Não atribuído",
          email_cobranca: meta.email_cobranca || ""
        });
      });

      // Include local offline clients from storedMeta only if not already in list
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

        uniqueClients.push({
          id: key,
          user_id: user?.id || "",
          nome: candidateName,
          nome_empresarial: meta.nome_empresarial || "",
          logo_url: null,
          ativo: true,
          cnpj: meta.cnpj || "",
          cep: meta.cep || "",
          cliente_desde: meta.cliente_desde || new Date().toISOString().split('T')[0],
          telefone_comercial: meta.telefone || "(00) 0000-0000",
          whatsapp_responsavel: meta.whatsapp_responsavel || "",
          endereco: meta.endereco || "Endereço não cadastrado",
          cidade: meta.cidade || "",
          estado: meta.estado || "",
          nome_contato: meta.nome_contato || "",
          executiva_venda: meta.nome_contato || "Não atribuído",
          email_cobranca: meta.email_cobranca || ""
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
  }, []);

  const handleSave = async () => {
    if (!novo.nome.trim()) {
      toast.error("Razão Social é obrigatória.");
      return;
    }

    setCriando(true);
    try {
      const cleanName = novo.nome.trim();

      const metaToSave: ClienteMetadata = {
        razao_social: cleanName,
        nome_empresarial: novo.nome_empresarial.trim(),
        cnpj: novo.cnpj.trim(),
        cep: novo.cep.trim(),
        endereco: novo.endereco.trim(),
        cidade: novo.cidade.trim(),
        estado: novo.estado.trim(),
        telefone: novo.telefone.trim(),
        whatsapp_responsavel: novo.whatsapp_responsavel.trim(),
        cliente_desde: novo.cliente_desde,
        nome_contato: novo.nome_contato.trim(),
        email_cobranca: novo.email_cobranca.trim()
      };

      if (editingId) {
        if (!editingId.startsWith("local_") && !isUuid(editingId)) {
          await supabase
            .from("logos_patrocinadores")
            .update({
              nome: cleanName,
            } as any)
            .eq("id", editingId);
        }

        saveStoredMetadata(cleanName, metaToSave);
        toast.success("Dados do cliente atualizados com sucesso!");
      } else {
        const { data: insertedData, error } = await supabase.from("logos_patrocinadores").insert({
          nome: cleanName,
          user_id: user?.id,
          ativo: true,
          excluido: false,
          data_final: new Date(new Date().getFullYear() + 10, 11, 31).toISOString().split('T')[0] 
        } as any).select().maybeSingle();

        saveStoredMetadata(cleanName, metaToSave);
        toast.success("Cliente cadastrado com sucesso!");
      }

      setEditingId(null);
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
        email_cobranca: ""
      });
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar cliente.");
    } finally {
      setCriando(false);
    }
  };

  const handleEdit = (cliente: Cliente) => {
    setEditingId(cliente.id);
    const storedMeta = getStoredMetadata();
    const meta = storedMeta[cliente.id] || storedMeta[cliente.nome || ""] || {};

    setNovo({
      cnpj: cliente.cnpj || meta.cnpj || "",
      nome: cliente.nome || "",
      nome_empresarial: cliente.nome_empresarial || meta.nome_empresarial || "",
      cep: cliente.cep || meta.cep || "",
      endereco: cliente.endereco !== "Endereço não cadastrado" ? (cliente.endereco || meta.endereco || "") : (meta.endereco || ""),
      cidade: cliente.cidade || meta.cidade || "",
      estado: cliente.estado || meta.estado || "",
      telefone: cliente.telefone_comercial !== "(00) 0000-0000" ? (cliente.telefone_comercial || "") : "",
      whatsapp_responsavel: cliente.whatsapp_responsavel || "",
      cliente_desde: cliente.cliente_desde || "",
      nome_contato: cliente.nome_contato || cliente.executiva_venda || "",
      email_cobranca: cliente.email_cobranca || ""
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (cliente: Cliente) => {
    if (!confirm(`Deseja realmente excluir o cadastro de "${cliente.nome}"?`)) return;

    try {
      // 1. Mark as excluded in Supabase if exists
      if (cliente.id && !cliente.id.startsWith("local_")) {
        await supabase
          .from("logos_patrocinadores")
          .update({ excluido: true } as any)
          .eq("id", cliente.id);
        
        // In case it was inserted with nome = cliente.nome
        if (cliente.nome) {
          await supabase
            .from("logos_patrocinadores")
            .update({ excluido: true } as any)
            .eq("nome", cliente.nome);
        }
      }

      // 2. Remove from localStorage metadata
      const storedMeta = getStoredMetadata();
      delete storedMeta[cliente.id];
      if (cliente.nome) delete storedMeta[cliente.nome];
      if (cliente.nome_empresarial) delete storedMeta[cliente.nome_empresarial];
      localStorage.setItem(CLIENTES_METADATA_KEY, JSON.stringify(storedMeta));

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
    return (
      <div className="p-12 flex items-center justify-center">
        <Loader2 className="animate-spin text-[#0055ff]" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* 1. Form Section (Centered, Clean Flat Modern Style) */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90">
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
                onChange={e => setNovo(n => ({...n, nome: e.target.value}))}
                placeholder="Nome da Empresa / Razão Social"
              />
            </Field>

            <Field label="Nome Empresarial">
              <input 
                style={inputStyle}
                value={novo.nome_empresarial} 
                onChange={e => setNovo(n => ({...n, nome_empresarial: e.target.value}))}
                placeholder="Nome Empresarial / Nome Fantasia"
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
                onChange={e => setNovo(n => ({...n, endereco: e.target.value}))}
                placeholder="Rua, Avenida, Número, Bairro"
              />
            </Field>

            <Field label="Cidade (Preenchida pelo CEP)" className="md:col-span-3">
              <input 
                style={inputStyle}
                value={novo.cidade} 
                onChange={e => setNovo(n => ({...n, cidade: e.target.value}))}
                placeholder="Cidade"
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
                onChange={e => setNovo(n => ({...n, nome_contato: e.target.value}))}
                placeholder="Nome do contato responsável"
              />
            </Field>
          </div>

          {/* LINHA 4: E-MAIL COBRANÇA FINANCEIRA + CLIENTE DESDE */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="E-mail Cobrança Financeira" className="md:col-span-2">
              <input 
                type="email"
                style={inputStyle}
                value={novo.email_cobranca} 
                onChange={e => setNovo(n => ({...n, email_cobranca: e.target.value}))}
                placeholder="financeiro@empresa.com.br"
              />
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
                  email_cobranca: ""
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

      {/* 2. Registered Clients Section (Centered, Clean Flat Modern Style) */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 text-[#002132]">
            <div className="w-9 h-9 rounded-xl bg-[#14161a] flex items-center justify-center text-[#9FCA1D]">
              <Building2 size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#002132]">
                Clientes Cadastrados
              </h3>
              <p className="text-xs text-slate-400">Total de contas corporativas da agência</p>
            </div>
            <span className="text-xs font-bold bg-[#f1f5f9] text-slate-700 px-3 py-1 rounded-full ml-1">
              {filtrados.length}
            </span>
          </div>

          <div className="relative">
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar razão social, nome empresarial, CNPJ, cidade..."
              className="w-72 md:w-80 h-10 rounded-full bg-[#f8fafc] border border-slate-200/80 pl-10 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-[#0055ff] transition-all font-sans"
            />
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            Nenhum cliente encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-[#14161a] text-white">
                  {[
                    "Razão Social / Nome Empresarial", 
                    "CNPJ", 
                    "Endereço / Cidade",
                    "Nome do Contato", 
                    "Telefone / WhatsApp", 
                    "E-mail Financeiro", 
                    "Eventos", 
                    "Ações"
                  ].map((h) => (
                    <th
                      key={h}
                      className={`p-3 text-[10px] font-bold uppercase tracking-wider ${
                        h === "Ações" ? "text-right pr-4" : "text-left pl-4"
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
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="p-3 pl-4">
                      <div className="font-semibold text-slate-800">{cliente.nome}</div>
                      {cliente.nome_empresarial && (
                        <div className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {cliente.nome_empresarial}
                        </div>
                      )}
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap font-mono">{cliente.cnpj || "—"}</td>
                    <td className="p-3 text-slate-600">
                      <div>
                        {cliente.endereco && cliente.endereco !== "Endereço não cadastrado" ? (
                          <span>{cliente.endereco}</span>
                        ) : (
                          <span className="text-slate-400">Endereço não cadastrado</span>
                        )}
                        {cliente.cidade && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            {cliente.cidade}{cliente.estado ? ` - ${cliente.estado}` : ""}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <UserCog size={13} className="text-slate-400 shrink-0" />
                        <span>{cliente.nome_contato || cliente.executiva_venda || "—"}</span>
                      </div>
                    </td>
                    <td className="p-3 text-slate-600 whitespace-nowrap">
                      {cliente.whatsapp_responsavel ? (
                        <div className="flex flex-col text-[11px]">
                          <span className="font-semibold text-emerald-600">
                            {cliente.whatsapp_responsavel} <span className="text-[9px] font-normal uppercase text-slate-400">(Whats)</span>
                          </span>
                          {cliente.telefone_comercial && cliente.telefone_comercial !== "(00) 0000-0000" && (
                            <span className="text-slate-400 text-[10px]">{cliente.telefone_comercial}</span>
                          )}
                        </div>
                      ) : (
                        <span>{cliente.telefone_comercial || "—"}</span>
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
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold uppercase">
                        <Activity size={11} className="text-[#0055ff]" />
                        {getEventosCliente(cliente.nome)} Eventos
                      </span>
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
    </div>
  );
}
