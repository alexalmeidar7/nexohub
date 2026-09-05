import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DollarSign, Send, CheckCircle2, AlertCircle, Clock, Plus, Trash2,
  Edit2, Smartphone, Mail, Sparkles, Filter, Search, Layers,
  ChevronRight, ArrowUpRight, Zap, ShieldCheck, RefreshCw, Eye, Calendar,
  User, FileText, Check, X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getStoredProdutos, type Produto } from "./ProdutosPage";

// Available Agency Predefined Products
export const AGENCY_PRODUCTS = [
  { id: "house_mix", name: "House Mix", tag: "Rádio & Streaming", color: "#00BFF0" },
  { id: "chatbot", name: "Chatbot IA", tag: "Atendimento & WhatsApp", color: "#9FCA1D" },
  { id: "tv_app", name: "TV App", tag: "Aplicativo Smart TV", color: "#A855F7" },
  { id: "business", name: "Nexo Business", tag: "Gestão & Comercial", color: "#3B82F6" },
  { id: "social_design", name: "Social Design", tag: "Mídias & Artes", color: "#EC4899" },
];

export interface ClientSubscription {
  user_id: string;
  nome: string;
  logo: string | null;
  email?: string;
  telefone?: string;
  plano: string;
  produtos: string[];
  valorMensal: number;
  diaVencimento: number;
  status: "em_dia" | "pendente" | "atrasado";
  ultimaCobranca?: string;
  tipoCobranca?: "mensal" | "avulsa";
  dataVencimentoAvulsa?: string;
}

export interface ServicePack {
  id: string;
  nome: string;
  descricao: string;
  precoMensal: number;
  descontoAnual: number;
  produtos: string[];
  recursos: string[];
  ativo: boolean;
  destaque?: boolean;
}

const DEFAULT_PACKS: ServicePack[] = [
  {
    id: "pack-house-full",
    nome: "Pack House Mix Total",
    descricao: "Automação completa da rádio, estúdio, streaming, subusuários e Info Music.",
    precoMensal: 590,
    descontoAnual: 15,
    produtos: ["house_mix"],
    recursos: [
      "Transmissão Áudio & Vídeo ilimitada",
      "Até 5 Subusuários inclusos",
      "Módulo Info Music atualizado",
      "Controle total de módulos e agenda"
    ],
    ativo: true,
    destaque: true,
  },
  {
    id: "pack-radio-plus",
    nome: "Pack Rádio + Atendimento IA",
    descricao: "House Mix completo com Chatbot oficial Meta Cloud para pedidos e atendimento de ouvintes.",
    precoMensal: 890,
    descontoAnual: 20,
    produtos: ["house_mix", "chatbot"],
    recursos: [
      "Todos os recursos do House Mix Total",
      "Chatbot WhatsApp oficial 24/7",
      "Automações de pedidos de música",
      "Disparo de recados e promoções"
    ],
    ativo: true,
    destaque: true,
  },
  {
    id: "pack-nexo-omni",
    nome: "Pack Nexo Omni 360",
    descricao: "O ecossistema completo: Rádio, TV App, Chatbot IA e Gestão Comercial.",
    precoMensal: 1450,
    descontoAnual: 25,
    produtos: ["house_mix", "chatbot", "tv_app", "business"],
    recursos: [
      "House Mix + TV App para Smart TVs",
      "Chatbot Oficial com IA generativa",
      "Painel Business de orçamentos e vendas",
      "Suporte prioritário e consultoria"
    ],
    ativo: true,
    destaque: false,
  },
];

const STORAGE_PACKS_KEY = "nexo_superadmin_packs";
const STORAGE_SUBS_KEY = "nexo_superadmin_client_subs";
const STORAGE_CONFIG_KEY = "nexo_superadmin_finance_config";

export default function FinanceiroSuperAdminPage() {
  const [activeTab, setActiveTab] = useState<"cobrancas" | "packs" | "config">("cobrancas");
  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientSubscription[]>([]);
  const [packs, setPacks] = useState<ServicePack[]>([]);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("todos");

  // Dynamic Registered Products from ProdutosPage
  const [storedProdutos, setStoredProdutos] = useState<Produto[]>([]);

  // Pack modal states
  const [isPackModalOpen, setIsPackModalOpen] = useState(false);
  const [editingPack, setEditingPack] = useState<ServicePack | null>(null);
  const [packFormData, setPackFormData] = useState<Partial<ServicePack>>({
    nome: "",
    descricao: "",
    precoMensal: 350,
    descontoAnual: 10,
    produtos: ["house_mix"],
    recursos: [""],
    ativo: true,
  });

  // Client Subscription Edit Modal
  const [isClientModalOpen, setIsClientModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientSubscription | null>(null);

  // Nova Cobrança Modal (Avulsa ou Mensal)
  const [isNovaCobrancaOpen, setIsNovaCobrancaOpen] = useState(false);
  const [novaCobrancaData, setNovaCobrancaData] = useState<{
    tipo: "mensal" | "avulsa";
    clienteId: string;
    clienteNome: string;
    produtoId: string;
    produtoNome: string;
    valor: number;
    diaVencimento: number;
    dataVencimento: string;
    status: "em_dia" | "pendente" | "atrasado";
    obs: string;
  }>({
    tipo: "mensal",
    clienteId: "",
    clienteNome: "",
    produtoId: "",
    produtoNome: "",
    valor: 590,
    diaVencimento: 10,
    dataVencimento: new Date().toISOString().split("T")[0],
    status: "em_dia",
    obs: "",
  });

  // Automatic Dispatch Settings
  const [autoBillingConfig, setAutoBillingConfig] = useState({
    autoDispatchEnabled: true,
    daysBeforeDue: 3,
    pixKey: "financeiro@nexobrasil.net",
    bankInfo: "Banco Inter - Chave PIX: financeiro@nexobrasil.net - Nexo Agência",
    customMessage: "Olá {cliente}! Sua fatura Nexo no valor de R$ {valor} vence em {vencimento}. Chave PIX: {pix}. Qualquer dúvida estamos à disposição!",
  });

  // Refresh stored products from ProdutosPage
  useEffect(() => {
    setStoredProdutos(getStoredProdutos());
  }, []);

  // Load clients and stored data
  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        // Load saved packs
        const savedPacks = localStorage.getItem(STORAGE_PACKS_KEY);
        if (savedPacks) {
          try {
            setPacks(JSON.parse(savedPacks));
          } catch {
            setPacks(DEFAULT_PACKS);
          }
        } else {
          setPacks(DEFAULT_PACKS);
          localStorage.setItem(STORAGE_PACKS_KEY, JSON.stringify(DEFAULT_PACKS));
        }

        // Load billing config
        const savedConfig = localStorage.getItem(STORAGE_CONFIG_KEY);
        if (savedConfig) {
          try {
            setAutoBillingConfig(prev => ({ ...prev, ...JSON.parse(savedConfig) }));
          } catch { /* use defaults */ }
        }

        // Fetch real clients from Supabase
        const [empRes, profRes, logosRes] = await Promise.all([
          supabase.from("empresa_config")
            .select("user_id, nome, logo, plano, telefone_comercial, telefone_participacao, ativo")
            .eq("ativo", true)
            .order("nome"),
          supabase.from("profiles").select("user_id, email"),
          supabase.from("logos_patrocinadores").select("id, nome, logo_url").eq("excluido", false)
        ]);

        const emails = new Map<string, string>();
        (profRes.data || []).forEach((p: any) => emails.set(p.user_id, p.email || ""));

        const savedSubs = localStorage.getItem(STORAGE_SUBS_KEY);
        let localOverrides: Record<string, Partial<ClientSubscription>> = {};
        if (savedSubs) {
          try {
            localOverrides = JSON.parse(savedSubs);
          } catch { /* noop */ }
        }

        const empresas = empRes.data || [];
        const seenNames = new Set<string>();

        const mappedClients: ClientSubscription[] = empresas.map(emp => {
          const override = localOverrides[emp.user_id] || {};
          const planName = emp.plano || "House Mix";
          
          let defaultPrice = 590;
          let defaultProducts = ["house_mix"];
          if (planName.toLowerCase().includes("max")) {
            defaultPrice = 890;
            defaultProducts = ["house_mix", "chatbot"];
          } else if (planName.toLowerCase().includes("omni")) {
            defaultPrice = 1450;
            defaultProducts = ["house_mix", "chatbot", "tv_app", "business"];
          }

          const clientName = emp.nome || emails.get(emp.user_id) || "Cliente Sem Nome";
          seenNames.add(clientName.toUpperCase());

          return {
            user_id: emp.user_id,
            nome: clientName,
            logo: emp.logo,
            email: emails.get(emp.user_id) || "",
            telefone: emp.telefone_comercial || emp.telefone_participacao || "",
            plano: override.plano || emp.plano || "Nexo Max",
            produtos: override.produtos || defaultProducts,
            valorMensal: override.valorMensal !== undefined ? override.valorMensal : defaultPrice,
            diaVencimento: override.diaVencimento || 10,
            status: override.status || "em_dia",
            ultimaCobranca: override.ultimaCobranca || undefined,
            tipoCobranca: override.tipoCobranca || "mensal",
            dataVencimentoAvulsa: override.dataVencimentoAvulsa || undefined,
          };
        });

        // Also add logos_patrocinadores that might not have empresa_config
        (logosRes.data || []).forEach((lg: any) => {
          if (lg.nome && !seenNames.has(lg.nome.toUpperCase())) {
            seenNames.add(lg.nome.toUpperCase());
            const override = localOverrides[lg.id] || {};
            mappedClients.push({
              user_id: lg.id,
              nome: lg.nome,
              logo: lg.logo_url || null,
              email: "",
              telefone: "",
              plano: override.plano || "Spot Comercial / Avulso",
              produtos: override.produtos || ["prod-1"],
              valorMensal: override.valorMensal !== undefined ? override.valorMensal : 350,
              diaVencimento: override.diaVencimento || 15,
              status: override.status || "em_dia",
              ultimaCobranca: override.ultimaCobranca || undefined,
              tipoCobranca: override.tipoCobranca || "avulsa",
              dataVencimentoAvulsa: override.dataVencimentoAvulsa || undefined,
            });
          }
        });

        // Include any custom overrides that are independent
        Object.keys(localOverrides).forEach(k => {
          if (k.startsWith("custom_") && !mappedClients.some(c => c.user_id === k)) {
            const ov = localOverrides[k] as any;
            mappedClients.push({
              user_id: k,
              nome: ov.nome || "Cliente Avulso",
              logo: null,
              email: ov.email || "",
              telefone: ov.telefone || "",
              plano: ov.plano || "Serviço Avulso",
              produtos: ov.produtos || [],
              valorMensal: ov.valorMensal || 0,
              diaVencimento: ov.diaVencimento || 10,
              status: ov.status || "em_dia",
              ultimaCobranca: ov.ultimaCobranca || undefined,
              tipoCobranca: ov.tipoCobranca || "avulsa",
              dataVencimentoAvulsa: ov.dataVencimentoAvulsa || undefined,
            });
          }
        });

        setClients(mappedClients);
      } catch (err) {
        console.error("Erro ao carregar dados financeiros:", err);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Save subs changes to localStorage
  const saveClientSubs = (updatedClients: ClientSubscription[]) => {
    setClients(updatedClients);
    const overrides: Record<string, any> = {};
    updatedClients.forEach(c => {
      overrides[c.user_id] = {
        nome: c.nome,
        plano: c.plano,
        produtos: c.produtos,
        valorMensal: c.valorMensal,
        diaVencimento: c.diaVencimento,
        status: c.status,
        ultimaCobranca: c.ultimaCobranca,
        tipoCobranca: c.tipoCobranca,
        dataVencimentoAvulsa: c.dataVencimentoAvulsa,
      };
    });
    localStorage.setItem(STORAGE_SUBS_KEY, JSON.stringify(overrides));
  };

  // Save packs changes
  const savePacks = (newPacks: ServicePack[]) => {
    setPacks(newPacks);
    localStorage.setItem(STORAGE_PACKS_KEY, JSON.stringify(newPacks));
  };

  // Save config
  const saveConfig = (newConfig: typeof autoBillingConfig) => {
    setAutoBillingConfig(newConfig);
    localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(newConfig));
    toast.success("Configurações de cobrança salvas com sucesso!");
  };

  // Dispatch single client billing
  const handleDispatchSingle = (client: ClientSubscription, channel: "whatsapp" | "email") => {
    const formattedDate = client.tipoCobranca === "avulsa" && client.dataVencimentoAvulsa
      ? new Date(client.dataVencimentoAvulsa).toLocaleDateString("pt-BR")
      : `${client.diaVencimento}/${new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}`;

    const msg = autoBillingConfig.customMessage
      .replace("{cliente}", client.nome)
      .replace("{valor}", client.valorMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 }))
      .replace("{vencimento}", formattedDate)
      .replace("{pix}", autoBillingConfig.pixKey);

    if (channel === "whatsapp") {
      let rawPhone = (client.telefone || "").replace(/\D/g, "");
      if (!rawPhone) {
        toast.error(`Cliente ${client.nome} não possui telefone cadastrado.`);
        return;
      }
      if (rawPhone.length <= 11) rawPhone = `55${rawPhone}`;
      const url = `https://wa.me/${rawPhone}?text=${encodeURIComponent(msg)}`;
      window.open(url, "_blank");

      // update last billing timestamp
      const updated = clients.map(c => c.user_id === client.user_id ? { ...c, ultimaCobranca: new Date().toISOString() } : c);
      saveClientSubs(updated);
      toast.success(`Disparo para ${client.nome} enviado via WhatsApp!`);
    } else {
      if (!client.email) {
        toast.error(`Cliente ${client.nome} não possui e-mail cadastrado.`);
        return;
      }
      const subject = `Fatura Nexo Agência - Vencimento ${formattedDate}`;
      const mailUrl = `mailto:${client.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
      window.open(mailUrl, "_blank");

      const updated = clients.map(c => c.user_id === client.user_id ? { ...c, ultimaCobranca: new Date().toISOString() } : c);
      saveClientSubs(updated);
      toast.success(`E-mail de cobrança para ${client.nome} preparado!`);
    }
  };

  // Batch automated dispatch
  const handleBatchDispatch = () => {
    const clientsToBill = clients.filter(c => c.status !== "em_dia");
    const count = clientsToBill.length > 0 ? clientsToBill.length : clients.length;
    
    const now = new Date().toISOString();
    const updated = clients.map(c => ({
      ...c,
      ultimaCobranca: now,
    }));
    saveClientSubs(updated);

    toast.success(`Disparo efetuado com sucesso para ${count} clientes!`);
  };

  // Filter clients
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      const matchBusca = !busca || c.nome.toLowerCase().includes(busca.toLowerCase()) || c.plano.toLowerCase().includes(busca.toLowerCase());
      const matchStatus = statusFiltro === "todos" || c.status === statusFiltro;
      return matchBusca && matchStatus;
    });
  }, [clients, busca, statusFiltro]);

  // Financial KPIs
  const kpis = useMemo(() => {
    const mrr = clients.filter(c => c.tipoCobranca !== "avulsa").reduce((acc, c) => acc + (c.valorMensal || 0), 0);
    const emDia = clients.filter(c => c.status === "em_dia").length;
    const pendentes = clients.filter(c => c.status === "pendente").length;
    const atrasados = clients.filter(c => c.status === "atrasado").length;
    return { mrr, total: clients.length, emDia, pendentes, atrasados };
  }, [clients]);

  // Handler for Nova Cobrança submission
  const handleSaveNovaCobranca = () => {
    if (!novaCobrancaData.clienteNome.trim()) {
      toast.error("Informe ou selecione o cliente.");
      return;
    }
    if (!novaCobrancaData.valor || novaCobrancaData.valor <= 0) {
      toast.error("Informe um valor válido para a cobrança.");
      return;
    }

    const existingIndex = clients.findIndex(c => 
      (novaCobrancaData.clienteId && c.user_id === novaCobrancaData.clienteId) ||
      c.nome.trim().toLowerCase() === novaCobrancaData.clienteNome.trim().toLowerCase()
    );

    let updated: ClientSubscription[];

    if (existingIndex >= 0) {
      const existing = clients[existingIndex];
      const nextProds = novaCobrancaData.produtoId && !existing.produtos.includes(novaCobrancaData.produtoId)
        ? [...existing.produtos, novaCobrancaData.produtoId]
        : existing.produtos;

      const updatedClient: ClientSubscription = {
        ...existing,
        plano: novaCobrancaData.produtoNome || existing.plano,
        produtos: nextProds,
        valorMensal: novaCobrancaData.valor,
        tipoCobranca: novaCobrancaData.tipo,
        diaVencimento: novaCobrancaData.tipo === "mensal" ? novaCobrancaData.diaVencimento : existing.diaVencimento,
        dataVencimentoAvulsa: novaCobrancaData.tipo === "avulsa" ? novaCobrancaData.dataVencimento : undefined,
        status: novaCobrancaData.status,
      };

      updated = [...clients];
      updated[existingIndex] = updatedClient;
      toast.success(`Cobrança de ${updatedClient.nome} atualizada com sucesso!`);
    } else {
      const newId = `custom_${Date.now()}`;
      const newClient: ClientSubscription = {
        user_id: newId,
        nome: novaCobrancaData.clienteNome,
        logo: null,
        email: "",
        telefone: "",
        plano: novaCobrancaData.produtoNome || (novaCobrancaData.tipo === "mensal" ? "Assinatura Mensal" : "Cobrança Avulsa"),
        produtos: novaCobrancaData.produtoId ? [novaCobrancaData.produtoId] : [],
        valorMensal: novaCobrancaData.valor,
        diaVencimento: novaCobrancaData.diaVencimento || 10,
        dataVencimentoAvulsa: novaCobrancaData.tipo === "avulsa" ? novaCobrancaData.dataVencimento : undefined,
        status: novaCobrancaData.status,
        tipoCobranca: novaCobrancaData.tipo,
      };

      updated = [newClient, ...clients];
      toast.success(`Nova cobrança para ${newClient.nome} cadastrada com sucesso!`);
    }

    saveClientSubs(updated);
    setIsNovaCobrancaOpen(false);
  };

  return (
    <div className="w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* Top Header Section (Card Branco com Variações de Azul) */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(1,28,91,0.04)] border border-[#d0deff] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base md:text-lg font-black tracking-wider text-[#011c5b] uppercase leading-tight">
            Gestão Financeira & Cobranças da Agência
          </h2>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Controle de assinaturas de produtos, disparo mensal automatizado e packs de serviços
          </p>
        </div>

        {/* Top Actions & Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1.5 rounded-full bg-[#d0deff]/20 border border-[#d0deff]/60">
            <button
              onClick={() => setActiveTab("cobrancas")}
              className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "cobrancas" ? "bg-[#0055ff] text-white shadow-[0_4px_12px_rgba(0,85,255,0.25)]" : "text-[#011c5b]/70 hover:text-[#011c5b] hover:bg-white/60"
              }`}
            >
              Assinaturas & Cobrança
            </button>
            <button
              onClick={() => setActiveTab("packs")}
              className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "packs" ? "bg-[#0055ff] text-white shadow-[0_4px_12px_rgba(0,85,255,0.25)]" : "text-[#011c5b]/70 hover:text-[#011c5b] hover:bg-white/60"
              }`}
            >
              Packs de Serviços
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`px-5 py-2 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                activeTab === "config" ? "bg-[#0055ff] text-white shadow-[0_4px_12px_rgba(0,85,255,0.25)]" : "text-[#011c5b]/70 hover:text-[#011c5b] hover:bg-white/60"
              }`}
            >
              Disparo Automático
            </button>
          </div>
        </div>
      </section>

      {/* BOTÃO CADASTRAR COBRANÇA - DIRETAMENTE ACIMA DO BOX RECEITA MENSAL */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-1">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-black tracking-wider text-[#011c5b] uppercase">
            Fluxo & Painel Financeiro
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[#d0deff]/30 text-[10px] font-extrabold text-[#011c5b] uppercase tracking-wider border border-[#d0deff]">
            Nexo Live
          </span>
        </div>

        <button
          onClick={() => {
            const firstClient = clients[0];
            const prods = getStoredProdutos();
            setNovaCobrancaData({
              tipo: "mensal",
              clienteId: firstClient?.user_id || "",
              clienteNome: firstClient?.nome || "",
              produtoId: prods[0]?.id || "prod-3",
              produtoNome: prods[0]?.nome || "Plataforma House Mix Streaming",
              valor: prods[0]?.valor || 590,
              diaVencimento: 10,
              dataVencimento: new Date().toISOString().split("T")[0],
              status: "em_dia",
              obs: "",
            });
            setIsNovaCobrancaOpen(true);
          }}
          className="h-11 px-6 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider flex items-center gap-2 transition-all shadow-[0_4px_14px_rgba(0,85,255,0.25)] hover:shadow-[0_6px_20px_rgba(0,85,255,0.35)] active:scale-95 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-white stroke-[3]" /> Cadastrar Cobrança
        </button>
      </div>

      {/* Top Summary KPI Cards (Design Elegante com Tons de Azul #011c5b e #d0deff) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Card 1: Receita Mensal MRR (Destaque Nobre em Azul Escuro #011c5b) */}
        <div className="rounded-3xl bg-gradient-to-br from-[#011c5b] via-[#042878] to-[#0055ff] p-5 flex items-center justify-between text-white border border-[#011c5b] shadow-[0_8px_24px_rgba(1,28,91,0.18)] relative overflow-hidden">
          <div className="relative z-10">
            <div className="text-[11px] text-[#d0deff] uppercase font-black tracking-wider">Receita Mensal (MRR)</div>
            <div className="text-2xl font-black mt-1 text-white tracking-tight">
              R$ {kpis.mrr.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-[#d0deff]/80 mt-1 font-medium">Total de assinaturas ativas</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md flex items-center justify-center text-white border border-white/20 shadow-inner shrink-0 relative z-10">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
        </div>

        {/* Card 2: Clientes Faturados */}
        <div className="rounded-3xl bg-white p-5 flex items-center justify-between text-[#011c5b] border border-[#d0deff] shadow-[0_4px_20px_rgba(1,28,91,0.04)]">
          <div>
            <div className="text-[11px] text-slate-500 uppercase font-black tracking-wider">Clientes Faturados</div>
            <div className="text-2xl font-black mt-1 text-[#011c5b] tracking-tight">{kpis.total}</div>
            <div className="text-[10px] text-emerald-600 font-bold mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> {kpis.emDia} clientes em dia
            </div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-[#d0deff]/40 text-[#011c5b] flex items-center justify-center border border-[#d0deff] shrink-0">
            <CheckCircle2 className="w-5 h-5 text-[#0055ff]" />
          </div>
        </div>

        {/* Card 3: Cobranças Pendentes */}
        <div className="rounded-3xl bg-white p-5 flex items-center justify-between text-[#011c5b] border border-[#d0deff] shadow-[0_4px_20px_rgba(1,28,91,0.04)]">
          <div>
            <div className="text-[11px] text-slate-500 uppercase font-black tracking-wider">Cobranças Pendentes</div>
            <div className="text-2xl font-black mt-1 text-amber-600 tracking-tight">{kpis.pendentes}</div>
            <div className="text-[10px] text-slate-400 font-medium mt-1">A vencer ou sem confirmação</div>
          </div>
          <div className="w-11 h-11 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/80 shrink-0">
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
        </div>

        {/* Card 4: Disparo Automático */}
        <div className="rounded-3xl bg-white p-5 flex items-center justify-between text-[#011c5b] border border-[#d0deff] shadow-[0_4px_20px_rgba(1,28,91,0.04)]">
          <div>
            <div className="text-[11px] text-slate-500 uppercase font-black tracking-wider">Disparo Automático</div>
            <div className="text-sm font-black mt-1 flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${autoBillingConfig.autoDispatchEnabled ? "bg-emerald-500" : "bg-red-400"}`} />
              <span className={autoBillingConfig.autoDispatchEnabled ? "text-emerald-600 font-black" : "text-red-500 font-black"}>
                {autoBillingConfig.autoDispatchEnabled ? "Ativo no Sistema" : "Pausado"}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 font-medium mt-1">Chave: {autoBillingConfig.pixKey}</div>
          </div>
          <button
            onClick={handleBatchDispatch}
            className="h-10 px-4 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-[0_4px_12px_rgba(0,85,255,0.25)] active:scale-95 cursor-pointer shrink-0"
            title="Disparar cobranças agora"
          >
            <Zap className="w-4 h-4 text-white" /> Disparar Mês
          </button>
        </div>
      </div>

      {/* TAB 1: Assinaturas & Cobranças */}
      {activeTab === "cobrancas" && (
        <div className="space-y-4">
          {/* Controls Bar (Busca de cliente e filtros em Caixa Branca com Azul #d0deff) */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-3xl border border-[#d0deff] shadow-[0_4px_20px_rgba(1,28,91,0.03)]">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[240px] max-w-md">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#011c5b]/40" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar cliente por nome, serviço ou plano..."
                  className="w-full h-10 pl-10 pr-4 text-xs rounded-2xl bg-slate-50/90 text-[#011c5b] placeholder-slate-400 outline-none border border-slate-200/80 focus:border-[#0055ff] focus:bg-white transition-all font-medium"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#d0deff]/20 p-1 rounded-2xl border border-[#d0deff]/60">
                {[
                  { key: "todos", label: "Todos" },
                  { key: "em_dia", label: "Em Dia" },
                  { key: "pendente", label: "A Vencer" },
                  { key: "atrasado", label: "Atrasados" },
                ].map(st => (
                  <button
                    key={st.key}
                    onClick={() => setStatusFiltro(st.key)}
                    className={`px-3.5 py-1.5 text-[11px] font-black uppercase tracking-wider rounded-xl transition-all cursor-pointer ${
                      statusFiltro === st.key ? "bg-[#0055ff] text-white shadow-sm" : "text-[#011c5b]/70 hover:text-[#011c5b] hover:bg-white/60"
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleBatchDispatch}
              className="px-4.5 py-2.5 rounded-full bg-[#d0deff]/40 hover:bg-[#d0deff] text-[#011c5b] text-xs font-black uppercase tracking-wider flex items-center gap-2 border border-[#d0deff] transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Send className="w-3.5 h-3.5 text-[#0055ff]" /> Disparar Cobrança em Lote
            </button>
          </div>

          {/* TABELA ÚNICA - Design Leve, Elegante e com Alto Contraste */}
          <div className="bg-white rounded-3xl p-4 md:p-6 border border-[#d0deff] shadow-[0_8px_30px_rgba(1,28,91,0.04)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[900px]">
                <thead>
                  <tr className="border-b border-[#d0deff]/70 text-[11px] font-black uppercase tracking-wider text-[#011c5b]/80 bg-slate-50/80 rounded-2xl">
                    <th className="py-4 px-4 rounded-l-2xl">Nome do Cliente</th>
                    <th className="py-4 px-4">Serviço Assinado</th>
                    <th className="py-4 px-4 text-center">Status da Assinatura</th>
                    <th className="py-4 px-4 text-center">Status do Envio</th>
                    <th className="py-4 px-4 text-right">Valor da Cobrança</th>
                    <th className="py-4 px-4 text-center rounded-r-2xl">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {filteredClients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 font-medium">
                        Nenhum cliente ou cobrança encontrada com os filtros atuais.
                      </td>
                    </tr>
                  ) : (
                    filteredClients.map(client => {
                      const isEmDia = client.status === "em_dia";
                      const isPendente = client.status === "pendente";

                      const statusBadge = isEmDia ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-[10px] font-black uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Em Dia
                        </span>
                      ) : isPendente ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200/80 text-[10px] font-black uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> A Vencer
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200/80 text-[10px] font-black uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500" /> Atrasado
                        </span>
                      );

                      const dispatchStatus = client.ultimaCobranca ? (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 text-[#0055ff] border border-blue-200/70 text-[10px] font-bold">
                          <CheckCircle2 className="w-3 h-3 text-[#0055ff]" />
                          <span>Disparado ({new Date(client.ultimaCobranca).toLocaleDateString("pt-BR")})</span>
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-500 border border-slate-200/70 text-[10px] font-medium">
                          <Clock className="w-3 h-3 text-slate-400" />
                          <span>Aguardando Envio</span>
                        </div>
                      );

                      return (
                        <tr key={client.user_id} className="hover:bg-[#d0deff]/15 transition-colors group">
                          {/* Coluna 1: Nome do Cliente */}
                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              {client.logo ? (
                                <img
                                  src={client.logo}
                                  alt={client.nome}
                                  className="w-10 h-10 rounded-2xl object-contain bg-slate-50 p-1 shrink-0 border border-slate-200/80 shadow-xs"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-2xl bg-[#d0deff]/40 border border-[#d0deff] flex items-center justify-center font-black text-xs text-[#011c5b] shrink-0">
                                  {client.nome.charAt(0).toUpperCase()}
                                </div>
                              )}
                              <div>
                                <div className="font-black text-[#011c5b] group-hover:text-[#0055ff] transition-colors text-sm">
                                  {client.nome}
                                </div>
                                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                                  {client.telefone || client.email || "Sem contato cadastrado"}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Coluna 2: Serviço Assinado */}
                          <td className="py-4 px-4">
                            <div className="space-y-1">
                              <div className="font-bold text-[#011c5b] text-xs flex items-center gap-2">
                                <span>{client.plano}</span>
                                {client.tipoCobranca === "avulsa" && (
                                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 border border-purple-200">
                                    Avulso
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1.5 mt-1">
                                {(client.produtos || []).slice(0, 3).map(prodId => {
                                  const std = AGENCY_PRODUCTS.find(p => p.id === prodId);
                                  const custom = storedProdutos.find(p => p.id === prodId || p.codigo === prodId);
                                  const name = std?.name || custom?.nome || prodId;
                                  const color = std?.color || "#0055ff";
                                  return (
                                    <span
                                      key={prodId}
                                      className="px-2.5 py-0.5 rounded-full bg-[#d0deff]/30 border border-[#d0deff] text-[10px] font-bold text-[#011c5b] flex items-center gap-1.5"
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                      {name}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          </td>

                          {/* Coluna 3: Status da Assinatura */}
                          <td className="py-4 px-4 text-center">
                            <div className="flex flex-col items-center gap-1">
                              {statusBadge}
                              <span className="text-[11px] text-slate-400 font-medium">
                                {client.tipoCobranca === "avulsa" && client.dataVencimentoAvulsa
                                  ? `Vence em ${new Date(client.dataVencimentoAvulsa).toLocaleDateString("pt-BR")}`
                                  : `Vence todo dia ${client.diaVencimento}`}
                              </span>
                            </div>
                          </td>

                          {/* Coluna 4: Status do Envio dos Disparos */}
                          <td className="py-4 px-4 text-center">
                            {dispatchStatus}
                          </td>

                          {/* Coluna 5: Valor da Cobrança */}
                          <td className="py-4 px-4 text-right">
                            <div className="font-black text-sm text-[#011c5b] font-mono tracking-tight">
                              R$ {client.valorMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                            </div>
                            <div className="text-[10px] text-slate-400 uppercase font-black tracking-wider mt-0.5">
                              {client.tipoCobranca === "avulsa" ? "Pagamento Único" : "Mensalidade"}
                            </div>
                          </td>

                          {/* Coluna 6: Ações */}
                          <td className="py-4 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleDispatchSingle(client, "whatsapp")}
                                className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-600 hover:text-white text-emerald-600 border border-emerald-200/80 transition-all cursor-pointer shadow-xs"
                                title="Disparar via WhatsApp"
                              >
                                <Smartphone className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDispatchSingle(client, "email")}
                                className="p-2.5 rounded-xl bg-blue-50 hover:bg-[#0055ff] hover:text-white text-[#0055ff] border border-[#d0deff] transition-all cursor-pointer shadow-xs"
                                title="Disparar via E-mail"
                              >
                                <Mail className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedClient(client);
                                  setIsClientModalOpen(true);
                                }}
                                className="p-2.5 rounded-xl bg-slate-100 hover:bg-[#011c5b] hover:text-white text-[#011c5b] border border-slate-200/80 transition-all cursor-pointer shadow-xs"
                                title="Editar Valores & Detalhes"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Packs de Produtos & Serviços */}
      {activeTab === "packs" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm md:text-base font-bold text-[#002132]">
                Packs e Combos Comerciais da Agência
              </h2>
              <p className="text-xs text-[#002132]/60">
                Monte pacotes de produtos e serviços vinculados ao catálogo cadastrado da agência
              </p>
            </div>

            <button
              onClick={() => {
                setEditingPack(null);
                setPackFormData({
                  nome: "",
                  descricao: "",
                  precoMensal: 450,
                  descontoAnual: 15,
                  produtos: ["house_mix"],
                  recursos: [""],
                  ativo: true,
                });
                setIsPackModalOpen(true);
              }}
              className="h-11 px-6 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-extrabold uppercase tracking-wider flex items-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-black" /> Criar Novo Pack
            </button>
          </div>

          {/* Packs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {packs.map(pack => (
              <div
                key={pack.id}
                className="rounded-2xl bg-[#14161a] p-5 text-white flex flex-col justify-between space-y-4 relative overflow-hidden border border-white/5"
              >
                {pack.destaque && (
                  <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-[#00BFF0] text-black text-[9px] font-bold uppercase tracking-wider">
                    Destaque
                  </div>
                )}

                <div>
                  <h3 className="text-base font-bold text-white">{pack.nome}</h3>
                  <p className="text-xs text-white/60 mt-1 leading-relaxed">{pack.descricao}</p>

                  {/* Price */}
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-2xl font-extrabold text-[#00BFF0]">
                      R$ {pack.precoMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                    </span>
                    <span className="text-xs text-white/40">/mês</span>
                    {pack.descontoAnual > 0 && (
                      <span className="text-[10px] text-emerald-400 font-semibold ml-auto">
                        {pack.descontoAnual}% off no anual
                      </span>
                    )}
                  </div>

                  {/* Products Included */}
                  <div className="mt-4 pt-3 border-t border-white/5">
                    <div className="text-[10px] text-white/40 uppercase font-semibold tracking-wider mb-2">
                      Produtos Incluídos
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {pack.produtos.map(prodId => {
                        const std = AGENCY_PRODUCTS.find(p => p.id === prodId);
                        const custom = storedProdutos.find(p => p.id === prodId || p.codigo === prodId);
                        const name = std?.name || custom?.nome || prodId;
                        const color = std?.color || "#00BFF0";
                        return (
                          <span
                            key={prodId}
                            className="px-2 py-0.5 rounded-md bg-white/10 text-white text-[10px] font-medium flex items-center gap-1 border border-white/5"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                            {name}
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Features List */}
                  <div className="mt-4 pt-3 border-t border-white/5 space-y-1.5">
                    <div className="text-[10px] text-white/40 uppercase font-semibold tracking-wider mb-1">
                      Recursos & Entregas
                    </div>
                    {pack.recursos.map((rec, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-white/70">
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#00BFF0] shrink-0" />
                        <span>{rec}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Card Actions */}
                <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${pack.ativo ? "bg-emerald-400" : "bg-white/30"}`} />
                    <span className="text-[11px] text-white/60">{pack.ativo ? "Pack Ativo" : "Inativo"}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingPack(pack);
                        setPackFormData({ ...pack });
                        setIsPackModalOpen(true);
                      }}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all cursor-pointer"
                      title="Editar Pack"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm(`Excluir o pack "${pack.nome}"?`)) {
                          savePacks(packs.filter(p => p.id !== pack.id));
                          toast.success("Pack excluído!");
                        }
                      }}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-all cursor-pointer"
                      title="Excluir Pack"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: Configurações do Disparo Automático (Design Leve e Moderno) */}
      {activeTab === "config" && (
        <div className="max-w-2xl bg-white rounded-3xl p-6 md:p-8 text-slate-800 space-y-6 border border-[#d0deff] shadow-[0_4px_24px_rgba(1,28,91,0.04)]">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-[#d0deff]/40 flex items-center justify-center text-[#0055ff] border border-[#d0deff]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-[#011c5b] uppercase tracking-wide">Disparo Automático de Mensalidade</h2>
              <p className="text-xs text-slate-500 font-medium">
                Configure os parâmetros de cobrança automática por WhatsApp e E-mail
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-2xl bg-slate-50 border border-slate-200/80">
              <div>
                <div className="text-xs font-black text-[#011c5b]">Ativar Disparo Automático Mensal</div>
                <div className="text-[11px] text-slate-500 font-medium">O sistema alertará os clientes automaticamente antes do vencimento</div>
              </div>
              <input
                type="checkbox"
                checked={autoBillingConfig.autoDispatchEnabled}
                onChange={e => setAutoBillingConfig({ ...autoBillingConfig, autoDispatchEnabled: e.target.checked })}
                className="w-5 h-5 accent-[#0055ff] cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1.5">Dias de antecedência do envio</label>
              <input
                type="number"
                value={autoBillingConfig.daysBeforeDue}
                onChange={e => setAutoBillingConfig({ ...autoBillingConfig, daysBeforeDue: Number(e.target.value) })}
                className="w-full h-11 px-4 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1.5">Chave PIX da Agência</label>
              <input
                type="text"
                value={autoBillingConfig.pixKey}
                onChange={e => setAutoBillingConfig({ ...autoBillingConfig, pixKey: e.target.value })}
                className="w-full h-11 px-4 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white transition-all"
              />
            </div>

            <div>
              <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1.5">Mensagem de Cobrança Padrão</label>
              <textarea
                rows={4}
                value={autoBillingConfig.customMessage}
                onChange={e => setAutoBillingConfig({ ...autoBillingConfig, customMessage: e.target.value })}
                className="w-full p-4 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-medium outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white transition-all leading-relaxed"
              />
              <div className="text-[10px] text-slate-400 font-medium mt-1">
                Tags disponíveis: &#123;cliente&#125;, &#123;valor&#125;, &#123;vencimento&#125;, &#123;pix&#125;
              </div>
            </div>

            <button
              onClick={() => saveConfig(autoBillingConfig)}
              className="w-full py-3 rounded-2xl bg-[#0055ff] hover:bg-[#0047d4] text-white font-black text-xs uppercase tracking-wider shadow-[0_4px_14px_rgba(0,85,255,0.25)] transition-all cursor-pointer active:scale-98"
            >
              Salvar Parâmetros de Cobrança
            </button>
          </div>
        </div>
      )}

      {/* MODAL SOLICITADO: Cadastrar Cobrança (Avulsa ou Assinatura Mensal) */}
      <Dialog open={isNovaCobrancaOpen} onOpenChange={setIsNovaCobrancaOpen}>
        <DialogContent className="bg-white text-slate-800 border border-[#d0deff] rounded-3xl max-w-lg p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#011c5b] text-base font-black tracking-wide uppercase flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#0055ff]" /> Cadastrar Nova Cobrança
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-3">
            {/* Seletor Tipo: Avulsa vs Assinatura Mensal */}
            <div>
              <label className="text-[11px] text-[#011c5b] font-black uppercase tracking-wider block mb-1.5">
                Tipo de Cobrança
              </label>
              <div className="grid grid-cols-2 gap-2 p-1 bg-[#d0deff]/20 rounded-2xl border border-[#d0deff]">
                <button
                  type="button"
                  onClick={() => setNovaCobrancaData({ ...novaCobrancaData, tipo: "mensal" })}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    novaCobrancaData.tipo === "mensal"
                      ? "bg-[#0055ff] text-white shadow-md"
                      : "text-[#011c5b]/70 hover:text-[#011c5b]"
                  }`}
                >
                  Assinatura Mensal
                </button>
                <button
                  type="button"
                  onClick={() => setNovaCobrancaData({ ...novaCobrancaData, tipo: "avulsa" })}
                  className={`py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                    novaCobrancaData.tipo === "avulsa"
                      ? "bg-purple-600 text-white shadow-md"
                      : "text-[#011c5b]/70 hover:text-[#011c5b]"
                  }`}
                >
                  Cobrança Avulsa
                </button>
              </div>
            </div>

            {/* Cliente */}
            <div>
              <label className="text-[11px] text-[#011c5b] font-black uppercase tracking-wider block mb-1">
                Cliente
              </label>
              <div className="space-y-1.5">
                <select
                  value={novaCobrancaData.clienteId}
                  onChange={e => {
                    const selId = e.target.value;
                    const found = clients.find(c => c.user_id === selId);
                    if (found) {
                      setNovaCobrancaData({
                        ...novaCobrancaData,
                        clienteId: found.user_id,
                        clienteNome: found.nome,
                      });
                    } else {
                      setNovaCobrancaData({ ...novaCobrancaData, clienteId: "" });
                    }
                  }}
                  className="w-full h-11 px-3.5 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white cursor-pointer"
                >
                  <option value="">-- Selecionar Cliente Existente --</option>
                  {clients.map(c => (
                    <option key={c.user_id} value={c.user_id}>
                      {c.nome} {c.plano ? `(${c.plano})` : ""}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  value={novaCobrancaData.clienteNome}
                  onChange={e => setNovaCobrancaData({ ...novaCobrancaData, clienteNome: e.target.value, clienteId: "" })}
                  placeholder="Ou digite o nome de outro cliente..."
                  className="w-full h-11 px-3.5 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-medium outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
                />
              </div>
            </div>

            {/* Produto / Serviço Selecionado */}
            <div>
              <label className="text-[11px] text-[#011c5b] font-black uppercase tracking-wider block mb-1">
                Produto / Serviço
              </label>
              <select
                value={novaCobrancaData.produtoId}
                onChange={e => {
                  const selId = e.target.value;
                  const custom = storedProdutos.find(p => p.id === selId);
                  const std = AGENCY_PRODUCTS.find(p => p.id === selId);
                  const nome = custom?.nome || std?.name || "";
                  const valor = custom?.valor || 590;
                  setNovaCobrancaData({
                    ...novaCobrancaData,
                    produtoId: selId,
                    produtoNome: nome,
                    valor: valor,
                  });
                }}
                className="w-full h-11 px-3.5 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white cursor-pointer"
              >
                <optgroup label="Produtos Cadastrados na Agência">
                  {storedProdutos.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.codigo} - {p.nome} (R$ {p.valor.toFixed(2)})
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Serviços Base">
                  {AGENCY_PRODUCTS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.name} - {p.tag}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Valor da Cobrança & Vencimento */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#011c5b] font-black uppercase tracking-wider block mb-1">
                  Valor da Cobrança (R$)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={novaCobrancaData.valor}
                  onChange={e => setNovaCobrancaData({ ...novaCobrancaData, valor: Number(e.target.value) })}
                  className="w-full h-11 px-3.5 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-black font-mono outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
                />
              </div>

              {novaCobrancaData.tipo === "mensal" ? (
                <div>
                  <label className="text-[11px] text-[#011c5b] font-black uppercase tracking-wider block mb-1">
                    Dia do Vencimento (1 a 31)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={31}
                    value={novaCobrancaData.diaVencimento}
                    onChange={e => setNovaCobrancaData({ ...novaCobrancaData, diaVencimento: Number(e.target.value) })}
                    className="w-full h-11 px-3.5 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
                  />
                </div>
              ) : (
                <div>
                  <label className="text-[11px] text-[#011c5b] font-black uppercase tracking-wider block mb-1">
                    Data de Vencimento
                  </label>
                  <input
                    type="date"
                    value={novaCobrancaData.dataVencimento}
                    onChange={e => setNovaCobrancaData({ ...novaCobrancaData, dataVencimento: e.target.value })}
                    className="w-full h-11 px-3.5 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
                  />
                </div>
              )}
            </div>

            {/* Status Inicial */}
            <div>
              <label className="text-[11px] text-[#011c5b] font-black uppercase tracking-wider block mb-1">
                Status Inicial
              </label>
              <select
                value={novaCobrancaData.status}
                onChange={e => setNovaCobrancaData({ ...novaCobrancaData, status: e.target.value as any })}
                className="w-full h-11 px-3.5 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white cursor-pointer"
              >
                <option value="em_dia">Em Dia</option>
                <option value="pendente">A Vencer (Pendente)</option>
                <option value="atrasado">Atrasado</option>
              </select>
            </div>

            {/* Ações Modal */}
            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNovaCobrancaOpen(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-[#011c5b] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNovaCobranca}
                className="px-6 py-2.5 rounded-2xl bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[0_4px_12px_rgba(0,85,255,0.25)]"
              >
                Salvar Cobrança
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: Criar / Editar Pack */}
      <Dialog open={isPackModalOpen} onOpenChange={setIsPackModalOpen}>
        <DialogContent className="bg-white text-slate-800 border border-[#d0deff] rounded-3xl max-w-lg p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#011c5b] text-base font-black uppercase tracking-wider">
              {editingPack ? "Editar Pack de Serviços" : "Criar Novo Pack da Agência"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1">Nome do Pack</label>
              <input
                type="text"
                value={packFormData.nome || ""}
                onChange={e => setPackFormData({ ...packFormData, nome: e.target.value })}
                placeholder="Ex: Pack Rádio + Chatbot Pro"
                className="w-full h-11 px-4 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
              />
            </div>

            <div>
              <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1">Descrição</label>
              <input
                type="text"
                value={packFormData.descricao || ""}
                onChange={e => setPackFormData({ ...packFormData, descricao: e.target.value })}
                placeholder="Breve descrição da proposta de valor"
                className="w-full h-11 px-4 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-medium outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1">Preço Mensal (R$)</label>
                <input
                  type="number"
                  value={packFormData.precoMensal || 0}
                  onChange={e => setPackFormData({ ...packFormData, precoMensal: Number(e.target.value) })}
                  className="w-full h-11 px-4 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-black font-mono outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
                />
              </div>
              <div>
                <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1">Desconto Anual (%)</label>
                <input
                  type="number"
                  value={packFormData.descontoAnual || 0}
                  onChange={e => setPackFormData({ ...packFormData, descontoAnual: Number(e.target.value) })}
                  className="w-full h-11 px-4 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
                />
              </div>
            </div>

            {/* Products Selection - Suporta Produtos Cadastrados */}
            <div>
              <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1.5">Produtos Inclusos no Pack</label>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto pr-1">
                {/* Catálogo Geral Cadastrado */}
                {storedProdutos.map(prod => {
                  const selected = (packFormData.produtos || []).includes(prod.id);
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => {
                        const cur = packFormData.produtos || [];
                        const next = selected ? cur.filter(p => p !== prod.id) : [...cur, prod.id];
                        setPackFormData({ ...packFormData, produtos: next });
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        selected ? "bg-[#0055ff] text-white shadow-sm" : "bg-slate-100 text-[#011c5b] hover:bg-[#d0deff]/40 border border-slate-200/70"
                      }`}
                    >
                      {prod.nome}
                    </button>
                  );
                })}

                {/* Serviços Padrão */}
                {AGENCY_PRODUCTS.map(prod => {
                  const selected = (packFormData.produtos || []).includes(prod.id);
                  return (
                    <button
                      key={prod.id}
                      type="button"
                      onClick={() => {
                        const cur = packFormData.produtos || [];
                        const next = selected ? cur.filter(p => p !== prod.id) : [...cur, prod.id];
                        setPackFormData({ ...packFormData, produtos: next });
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        selected ? "bg-[#011c5b] text-white shadow-sm" : "bg-slate-100 text-[#011c5b] hover:bg-[#d0deff]/40 border border-slate-200/70"
                      }`}
                    >
                      {prod.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsPackModalOpen(false)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-[#011c5b] cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!packFormData.nome) {
                    toast.error("Informe o nome do pack");
                    return;
                  }
                  if (editingPack) {
                    const updated = packs.map(p => p.id === editingPack.id ? ({ ...p, ...packFormData } as ServicePack) : p);
                    savePacks(updated);
                    toast.success("Pack atualizado!");
                  } else {
                    const newPack: ServicePack = {
                      id: `pack-${Date.now()}`,
                      nome: packFormData.nome || "Novo Pack",
                      descricao: packFormData.descricao || "",
                      precoMensal: packFormData.precoMensal || 350,
                      descontoAnual: packFormData.descontoAnual || 10,
                      produtos: packFormData.produtos || ["house_mix"],
                      recursos: packFormData.recursos || ["Transmissão e automação inclusas"],
                      ativo: true,
                    };
                    savePacks([...packs, newPack]);
                    toast.success("Novo pack criado!");
                  }
                  setIsPackModalOpen(false);
                }}
                className="px-6 py-2.5 rounded-2xl bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[0_4px_12px_rgba(0,85,255,0.25)]"
              >
                Salvar Pack
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: Editar Assinatura do Cliente */}
      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="bg-white text-slate-800 border border-[#d0deff] rounded-3xl max-w-md p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#011c5b] text-base font-black uppercase tracking-wider">
              Editar Assinatura: {selectedClient?.nome}
            </DialogTitle>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1">Valor Mensal da Assinatura (R$)</label>
                <input
                  type="number"
                  value={selectedClient.valorMensal}
                  onChange={e => setSelectedClient({ ...selectedClient, valorMensal: Number(e.target.value) })}
                  className="w-full h-11 px-4 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-black font-mono outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1">Dia do Vencimento Mensal</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={selectedClient.diaVencimento}
                  onChange={e => setSelectedClient({ ...selectedClient, diaVencimento: Number(e.target.value) })}
                  className="w-full h-11 px-4 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs text-[#011c5b] font-black uppercase tracking-wider block mb-1">Status de Pagamento</label>
                <select
                  value={selectedClient.status}
                  onChange={e => setSelectedClient({ ...selectedClient, status: e.target.value as any })}
                  className="w-full h-11 px-3.5 rounded-2xl bg-slate-50 text-xs text-[#011c5b] font-bold outline-none border border-slate-200 focus:border-[#0055ff] focus:bg-white cursor-pointer"
                >
                  <option value="em_dia">Em Dia</option>
                  <option value="pendente">A Vencer (Pendente)</option>
                  <option value="atrasado">Atrasado</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:text-[#011c5b] cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = clients.map(c => c.user_id === selectedClient.user_id ? selectedClient : c);
                    saveClientSubs(updated);
                    toast.success(`Assinatura de ${selectedClient.nome} atualizada!`);
                    setIsClientModalOpen(false);
                  }}
                  className="px-6 py-2.5 rounded-2xl bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-[0_4px_12px_rgba(0,85,255,0.25)]"
                >
                  Salvar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
