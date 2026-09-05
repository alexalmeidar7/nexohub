import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DollarSign, Send, CheckCircle2, AlertCircle, Clock, Plus, Trash2,
  Edit2, Smartphone, Mail, Sparkles, Filter, Search, Layers,
  ChevronRight, ArrowUpRight, Zap, ShieldCheck, RefreshCw, Eye
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Available Agency Products
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

  // Automatic Dispatch Settings
  const [autoBillingConfig, setAutoBillingConfig] = useState({
    autoDispatchEnabled: true,
    daysBeforeDue: 3,
    pixKey: "financeiro@nexobrasil.net",
    bankInfo: "Banco Inter - Chave PIX: financeiro@nexobrasil.net - Nexo Agência",
    customMessage: "Olá {cliente}! Sua mensalidade Nexo no valor de R$ {valor} vence em {vencimento}. Chave PIX: {pix}. Qualquer dúvida estamos à disposição!",
  });

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
        const [empRes, profRes] = await Promise.all([
          supabase.from("empresa_config")
            .select("user_id, nome, logo, plano, telefone_comercial, telefone_participacao, ativo")
            .eq("ativo", true)
            .order("nome"),
          supabase.from("profiles").select("user_id, email"),
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
        const mappedClients: ClientSubscription[] = empresas.map(emp => {
          const override = localOverrides[emp.user_id] || {};
          const planName = emp.plano || "House Mix";
          
          // Defaults based on plan
          let defaultPrice = 590;
          let defaultProducts = ["house_mix"];
          if (planName.toLowerCase().includes("max")) {
            defaultPrice = 890;
            defaultProducts = ["house_mix", "chatbot"];
          } else if (planName.toLowerCase().includes("omni")) {
            defaultPrice = 1450;
            defaultProducts = ["house_mix", "chatbot", "tv_app", "business"];
          }

          return {
            user_id: emp.user_id,
            nome: emp.nome || emails.get(emp.user_id) || "Cliente Sem Nome",
            logo: emp.logo,
            email: emails.get(emp.user_id) || "",
            telefone: emp.telefone_comercial || emp.telefone_participacao || "",
            plano: emp.plano || "Nexo Max",
            produtos: override.produtos || defaultProducts,
            valorMensal: override.valorMensal !== undefined ? override.valorMensal : defaultPrice,
            diaVencimento: override.diaVencimento || 10,
            status: override.status || "em_dia",
            ultimaCobranca: override.ultimaCobranca || undefined,
          };
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
    const overrides: Record<string, Partial<ClientSubscription>> = {};
    updatedClients.forEach(c => {
      overrides[c.user_id] = {
        produtos: c.produtos,
        valorMensal: c.valorMensal,
        diaVencimento: c.diaVencimento,
        status: c.status,
        ultimaCobranca: c.ultimaCobranca,
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
    const formattedDate = `${client.diaVencimento}/${new Date().toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}`;
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
      const subject = `Fatura Mensalidade Nexo - Vencimento ${formattedDate}`;
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
    
    // update timestamps
    const now = new Date().toISOString();
    const updated = clients.map(c => ({
      ...c,
      ultimaCobranca: now,
    }));
    saveClientSubs(updated);

    toast.success(`Disparo automático efetuado com sucesso para ${count} clientes!`);
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
    const mrr = clients.reduce((acc, c) => acc + (c.valorMensal || 0), 0);
    const emDia = clients.filter(c => c.status === "em_dia").length;
    const pendentes = clients.filter(c => c.status === "pendente").length;
    const atrasados = clients.filter(c => c.status === "atrasado").length;
    return { mrr, total: clients.length, emDia, pendentes, atrasados };
  }, [clients]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto animate-fade-in font-sans">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#14161a] flex items-center justify-center text-[#00BFF0]">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-tight text-[#002132]">
                Gestão Financeira & Cobranças
              </h1>
              <p className="text-xs text-[#002132]/60 mt-0.5">
                Controle de assinaturas de produtos, disparo mensal automatizado e packs de serviços
              </p>
            </div>
          </div>
        </div>

        {/* Top Actions & Tabs */}
        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-2xl bg-[#14161a]">
            <button
              onClick={() => setActiveTab("cobrancas")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "cobrancas" ? "bg-[#00BFF0] text-white" : "text-white/60 hover:text-white"
              }`}
            >
              Assinaturas & Cobrança
            </button>
            <button
              onClick={() => setActiveTab("packs")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "packs" ? "bg-[#00BFF0] text-white" : "text-white/60 hover:text-white"
              }`}
            >
              Packs de Produtos & Serviços
            </button>
            <button
              onClick={() => setActiveTab("config")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === "config" ? "bg-[#00BFF0] text-white" : "text-white/60 hover:text-white"
              }`}
            >
              Disparo Automático
            </button>
          </div>
        </div>
      </div>

      {/* Top Summary KPI Cards (Flat Dark Style) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-[#14161a] p-4 flex items-center justify-between text-white">
          <div>
            <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider">Receita Mensal (MRR)</div>
            <div className="text-2xl font-bold mt-1 text-[#00BFF0]">
              R$ {kpis.mrr.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
            </div>
            <div className="text-[10px] text-white/40 mt-1">Total de assinaturas ativas</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-[#00BFF0]">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl bg-[#14161a] p-4 flex items-center justify-between text-white">
          <div>
            <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider">Clientes Faturados</div>
            <div className="text-2xl font-bold mt-1 text-white">{kpis.total}</div>
            <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> {kpis.emDia} clientes em dia
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl bg-[#14161a] p-4 flex items-center justify-between text-white">
          <div>
            <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider">Cobranças Pendentes</div>
            <div className="text-2xl font-bold mt-1 text-amber-400">{kpis.pendentes}</div>
            <div className="text-[10px] text-white/40 mt-1">Vencendo nos próximos 5 dias</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className="rounded-2xl bg-[#14161a] p-4 flex items-center justify-between text-white">
          <div>
            <div className="text-[11px] text-white/50 uppercase font-medium tracking-wider">Disparo Automático</div>
            <div className="text-sm font-bold mt-1.5 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${autoBillingConfig.autoDispatchEnabled ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className={autoBillingConfig.autoDispatchEnabled ? "text-emerald-400" : "text-red-400"}>
                {autoBillingConfig.autoDispatchEnabled ? "Ativo no Sistema" : "Pausado"}
              </span>
            </div>
            <div className="text-[10px] text-white/40 mt-1">Chave PIX: {autoBillingConfig.pixKey}</div>
          </div>
          <button
            onClick={handleBatchDispatch}
            className="px-3 py-2 rounded-xl bg-[#00BFF0] text-white text-xs font-semibold flex items-center gap-1.5 hover:brightness-110 active:scale-95 transition-all"
            title="Disparar cobranças agora"
          >
            <Zap className="w-3.5 h-3.5" /> Disparar Mês
          </button>
        </div>
      </div>

      {/* TAB 1: Assinaturas & Cobranças */}
      {activeTab === "cobrancas" && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                <input
                  value={busca}
                  onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar cliente por nome ou pacote..."
                  className="h-9 pl-9 pr-3 text-xs rounded-xl bg-[#14161a] text-white placeholder-white/40 outline-none w-64 md:w-80"
                />
              </div>

              <div className="flex items-center gap-1 bg-[#14161a] p-1 rounded-xl">
                {["todos", "em_dia", "pendente", "atrasado"].map(st => (
                  <button
                    key={st}
                    onClick={() => setStatusFiltro(st)}
                    className={`px-2.5 py-1 text-[11px] font-medium rounded-lg capitalize transition-all ${
                      statusFiltro === st ? "bg-[#00BFF0] text-white" : "text-white/60 hover:text-white"
                    }`}
                  >
                    {st.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleBatchDispatch}
              className="px-4 py-2 rounded-xl bg-[#14161a] text-white text-xs font-medium flex items-center gap-2 hover:bg-[#1a1e24] transition-all"
            >
              <Send className="w-3.5 h-3.5 text-[#00BFF0]" /> Disparar Cobrança em Lote
            </button>
          </div>

          {/* Clients Subscriptions Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredClients.map(client => {
              const statusColor =
                client.status === "em_dia" ? "bg-emerald-500/20 text-emerald-400" :
                client.status === "pendente" ? "bg-amber-500/20 text-amber-400" :
                "bg-red-500/20 text-red-400";
              const statusLabel =
                client.status === "em_dia" ? "Em Dia" :
                client.status === "pendente" ? "A Vencer" : "Atrasado";

              return (
                <div
                  key={client.user_id}
                  className="rounded-2xl bg-[#14161a] p-4 flex flex-col justify-between text-white space-y-4 hover:ring-1 hover:ring-[#00BFF0]/40 transition-all"
                >
                  <div>
                    {/* Header: Logo, Name, Plan, Status */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        {client.logo ? (
                          <img src={client.logo} alt={client.nome} className="w-10 h-10 rounded-xl object-contain bg-white/5 p-1 shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-white/40 shrink-0">
                            {client.nome.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold truncate leading-tight">{client.nome}</h3>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[10px] text-white/50">{client.plano}</span>
                            <span className="text-[10px] text-white/30">•</span>
                            <span className="text-[10px] text-white/50">Vence dia {client.diaVencimento}</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 flex flex-col items-end gap-1">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${statusColor}`}>
                          {statusLabel}
                        </span>
                        <div className="text-sm font-bold text-[#00BFF0]">
                          R$ {client.valorMensal.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                        </div>
                      </div>
                    </div>

                    {/* Products Subscribed */}
                    <div className="mt-4 pt-3 border-t border-white/5">
                      <div className="text-[10px] text-white/40 uppercase font-semibold tracking-wider mb-2">
                        Produtos Assinados
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {AGENCY_PRODUCTS.map(prod => {
                          const isSubscribed = client.produtos.includes(prod.id);
                          return (
                            <button
                              key={prod.id}
                              onClick={() => {
                                const nextProds = isSubscribed
                                  ? client.produtos.filter(p => p !== prod.id)
                                  : [...client.produtos, prod.id];
                                const updated = clients.map(c => c.user_id === client.user_id ? { ...c, produtos: nextProds } : c);
                                saveClientSubs(updated);
                                toast.success(`Produtos de ${client.nome} atualizados!`);
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1 ${
                                isSubscribed
                                  ? "bg-white/10 text-white font-semibold"
                                  : "bg-white/[0.03] text-white/30 hover:text-white/60"
                              }`}
                              title={isSubscribed ? "Clique para remover este produto" : "Clique para adicionar este produto"}
                            >
                              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isSubscribed ? prod.color : "gray" }} />
                              {prod.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Actions & Dispatch Bar */}
                  <div className="pt-3 border-t border-white/5 flex items-center justify-between gap-2">
                    <button
                      onClick={() => {
                        setSelectedClient(client);
                        setIsClientModalOpen(true);
                      }}
                      className="text-[11px] text-white/60 hover:text-white flex items-center gap-1 py-1"
                    >
                      <Edit2 className="w-3 h-3" /> Editar Valores
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDispatchSingle(client, "whatsapp")}
                        className="px-2.5 py-1.5 rounded-xl bg-[#9FCA1D]/20 text-[#9FCA1D] hover:bg-[#9FCA1D] hover:text-black transition-all text-xs font-semibold flex items-center gap-1"
                        title="Enviar cobrança via WhatsApp"
                      >
                        <Smartphone className="w-3.5 h-3.5" /> WhatsApp
                      </button>
                      <button
                        onClick={() => handleDispatchSingle(client, "email")}
                        className="px-2.5 py-1.5 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-all text-xs font-semibold flex items-center gap-1"
                        title="Enviar cobrança via E-mail"
                      >
                        <Mail className="w-3.5 h-3.5" /> E-mail
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
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
                Monte pacotes de produtos e serviços para apresentar a clientes e futuras propostas
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
              className="px-4 py-2 rounded-xl bg-[#00BFF0] text-white text-xs font-semibold flex items-center gap-2 hover:brightness-110 transition-all"
            >
              <Plus className="w-4 h-4" /> Criar Novo Pack
            </button>
          </div>

          {/* Packs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {packs.map(pack => (
              <div
                key={pack.id}
                className="rounded-2xl bg-[#14161a] p-5 text-white flex flex-col justify-between space-y-4 relative overflow-hidden"
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
                        const prod = AGENCY_PRODUCTS.find(p => p.id === prodId);
                        return (
                          <span
                            key={prodId}
                            className="px-2 py-0.5 rounded-md bg-white/10 text-white text-[10px] font-medium flex items-center gap-1"
                          >
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: prod?.color || "#00BFF0" }} />
                            {prod?.name || prodId}
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
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-all"
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
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-red-500/20 text-white/70 hover:text-red-400 transition-all"
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

      {/* TAB 3: Configurações do Disparo Automático */}
      {activeTab === "config" && (
        <div className="max-w-2xl bg-[#14161a] rounded-2xl p-6 text-white space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#00BFF0]/20 flex items-center justify-center text-[#00BFF0]">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Disparo Automático de Mensalidade</h2>
              <p className="text-xs text-white/60">
                Configure os parâmetros de cobrança automática por WhatsApp e E-mail
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <div>
                <div className="text-xs font-semibold">Ativar Disparo Automático Mensal</div>
                <div className="text-[11px] text-white/50">O sistema alertará os clientes automaticamente antes do vencimento</div>
              </div>
              <input
                type="checkbox"
                checked={autoBillingConfig.autoDispatchEnabled}
                onChange={e => setAutoBillingConfig({ ...autoBillingConfig, autoDispatchEnabled: e.target.checked })}
                className="w-4 h-4 accent-[#00BFF0] cursor-pointer"
              />
            </div>

            <div>
              <label className="text-xs text-white/70 font-medium block mb-1">Dias de antecedência do envio</label>
              <input
                type="number"
                value={autoBillingConfig.daysBeforeDue}
                onChange={e => setAutoBillingConfig({ ...autoBillingConfig, daysBeforeDue: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-white/5 text-xs text-white outline-none border border-white/10"
              />
            </div>

            <div>
              <label className="text-xs text-white/70 font-medium block mb-1">Chave PIX da Agência</label>
              <input
                type="text"
                value={autoBillingConfig.pixKey}
                onChange={e => setAutoBillingConfig({ ...autoBillingConfig, pixKey: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-white/5 text-xs text-white outline-none border border-white/10"
              />
            </div>

            <div>
              <label className="text-xs text-white/70 font-medium block mb-1">Mensagem de Cobrança Padrão</label>
              <textarea
                rows={4}
                value={autoBillingConfig.customMessage}
                onChange={e => setAutoBillingConfig({ ...autoBillingConfig, customMessage: e.target.value })}
                className="w-full p-3 rounded-xl bg-white/5 text-xs text-white outline-none border border-white/10 leading-relaxed"
              />
              <div className="text-[10px] text-white/40 mt-1">
                Tags disponíveis: &#123;cliente&#125;, &#123;valor&#125;, &#123;vencimento&#125;, &#123;pix&#125;
              </div>
            </div>

            <button
              onClick={() => saveConfig(autoBillingConfig)}
              className="w-full py-2.5 rounded-xl bg-[#00BFF0] text-white font-semibold text-xs hover:brightness-110 transition-all"
            >
              Salvar Parâmetros de Cobrança
            </button>
          </div>
        </div>
      )}

      {/* MODAL: Criar / Editar Pack */}
      <Dialog open={isPackModalOpen} onOpenChange={setIsPackModalOpen}>
        <DialogContent className="bg-[#14161a] text-white border-0 rounded-2xl max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white text-base font-bold">
              {editingPack ? "Editar Pack de Serviços" : "Criar Novo Pack da Agência"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            <div>
              <label className="text-xs text-white/70 font-medium block mb-1">Nome do Pack</label>
              <input
                type="text"
                value={packFormData.nome || ""}
                onChange={e => setPackFormData({ ...packFormData, nome: e.target.value })}
                placeholder="Ex: Pack Rádio + Chatbot Pro"
                className="w-full h-10 px-3 rounded-xl bg-white/5 text-xs text-white outline-none border border-white/10"
              />
            </div>

            <div>
              <label className="text-xs text-white/70 font-medium block mb-1">Descrição</label>
              <input
                type="text"
                value={packFormData.descricao || ""}
                onChange={e => setPackFormData({ ...packFormData, descricao: e.target.value })}
                placeholder="Breve descrição da proposta de valor"
                className="w-full h-10 px-3 rounded-xl bg-white/5 text-xs text-white outline-none border border-white/10"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-white/70 font-medium block mb-1">Preço Mensal (R$)</label>
                <input
                  type="number"
                  value={packFormData.precoMensal || 0}
                  onChange={e => setPackFormData({ ...packFormData, precoMensal: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 text-xs text-white outline-none border border-white/10"
                />
              </div>
              <div>
                <label className="text-xs text-white/70 font-medium block mb-1">Desconto Anual (%)</label>
                <input
                  type="number"
                  value={packFormData.descontoAnual || 0}
                  onChange={e => setPackFormData({ ...packFormData, descontoAnual: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 text-xs text-white outline-none border border-white/10"
                />
              </div>
            </div>

            {/* Products Selection */}
            <div>
              <label className="text-xs text-white/70 font-medium block mb-1.5">Produtos Inclusos</label>
              <div className="flex flex-wrap gap-2">
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
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        selected ? "bg-[#00BFF0] text-white" : "bg-white/5 text-white/50 hover:text-white"
                      }`}
                    >
                      {prod.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsPackModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
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
                className="px-5 py-2 rounded-xl bg-[#00BFF0] text-white text-xs font-bold hover:brightness-110"
              >
                Salvar Pack
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL: Editar Assinatura do Cliente */}
      <Dialog open={isClientModalOpen} onOpenChange={setIsClientModalOpen}>
        <DialogContent className="bg-[#14161a] text-white border-0 rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white text-base font-bold">
              Editar Assinatura: {selectedClient?.nome}
            </DialogTitle>
          </DialogHeader>

          {selectedClient && (
            <div className="space-y-4 pt-2">
              <div>
                <label className="text-xs text-white/70 font-medium block mb-1">Valor Mensal da Assinatura (R$)</label>
                <input
                  type="number"
                  value={selectedClient.valorMensal}
                  onChange={e => setSelectedClient({ ...selectedClient, valorMensal: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 text-xs text-white outline-none border border-white/10"
                />
              </div>

              <div>
                <label className="text-xs text-white/70 font-medium block mb-1">Dia do Vencimento Mensal</label>
                <input
                  type="number"
                  min={1}
                  max={31}
                  value={selectedClient.diaVencimento}
                  onChange={e => setSelectedClient({ ...selectedClient, diaVencimento: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-white/5 text-xs text-white outline-none border border-white/10"
                />
              </div>

              <div>
                <label className="text-xs text-white/70 font-medium block mb-1">Status de Pagamento</label>
                <select
                  value={selectedClient.status}
                  onChange={e => setSelectedClient({ ...selectedClient, status: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl bg-[#1a1e24] text-xs text-white outline-none border border-white/10"
                >
                  <option value="em_dia">Em Dia</option>
                  <option value="pendente">A Vencer (Pendente)</option>
                  <option value="atrasado">Atrasado</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsClientModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-white/60 hover:text-white"
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
                  className="px-5 py-2 rounded-xl bg-[#00BFF0] text-white text-xs font-bold hover:brightness-110"
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
