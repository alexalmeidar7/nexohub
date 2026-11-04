import { DateInput } from "@/components/ui/date-input";
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { 
  FileText, Plus, Trash2, Send, Mail, Smartphone, Printer, 
  Search, Check, X, Building2, User, Phone, Calendar, 
  DollarSign, Clock, RefreshCw, Sparkles, Eye, Download,
  Layers, CheckCircle2, ChevronRight, Copy, AlertCircle, Briefcase, MapPin,
  Pencil, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { scrollToForm } from "@/lib/utils";
import { confirmDialog } from "@/lib/confirmDialog";
import { getStoredProdutos, type Produto, type TipoMedida } from "./ProdutosPage";

// Metadata storage key from ClientesPage
const CLIENTES_METADATA_KEY = "nexohub_clientes_metadata_v1";
const PROPOSTAS_STORAGE_KEY = "nexohub_orcamentos_salvos_v1";

interface ClienteItem {
  id: string;
  user_id?: string;
  nome: string;
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
  logo_url?: string | null;
  ativo?: boolean;
}

export interface ItemOrcamento {
  id: string;
  codigo: string;
  nome: string;
  descricao: string;
  tipo_medida: TipoMedida;
  tempo_duracao?: string;
  quantidade: number;
  valor: number;
}

export interface Orcamento {
  id: string;
  numero: string;
  data: string;
  validade_dias: number;
  tipo_recorrencia: "unico" | "mensal";
  cliente: ClienteItem;
  itens: ItemOrcamento[];
  desconto: number;
  observacoes: string;
  status: "rascunho" | "enviado" | "aprovado" | "recusado";
  created_at: string;
}

export default function PropostasPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id || null;
  const storageKey = targetUserId ? `nexohub_orcamentos_salvos_${targetUserId}` : PROPOSTAS_STORAGE_KEY;

  const [activeTab, setActiveTab] = useState<"novo" | "historico">("novo");
  const formRef = useRef<HTMLDivElement>(null);
  const [clientes, setClientes] = useState<ClienteItem[]>([]);
  const [produtosCatalogo, setProdutosCatalogo] = useState<Produto[]>([]);
  const [orcamentosSalvos, setOrcamentosSalvos] = useState<Orcamento[]>([]);

  // Current Budget State
  const [selectedCliente, setSelectedCliente] = useState<ClienteItem | null>(null);
  const [clienteBusca, setClienteBusca] = useState("");
  const [isBuscaAberta, setIsBuscaAberta] = useState(false);
  const [tipoRecorrencia, setTipoRecorrencia] = useState<"unico" | "mensal">("unico");
  const [validadeDias, setValidadeDias] = useState<number>(15);
  const [desconto, setDesconto] = useState<number>(0);
  const [observacoes, setObservacoes] = useState(
    "Orçamento válido por 15 dias. Pagamento via PIX ou boleto bancário. Produção e entrega iniciadas após aprovação formal."
  );

  // Budget Items - Começa com a lista vazia conforme solicitação
  const [itens, setItens] = useState<ItemOrcamento[]>([]);

  // State for adding products from search bar
  const [buscaProdutoInput, setBuscaProdutoInput] = useState("");
  const [selectedCatalogoProd, setSelectedCatalogoProd] = useState<Produto | null>(null);
  const [isBuscaProdDropdownOpen, setIsBuscaProdDropdownOpen] = useState(false);

  // Autocomplete state for product rows in table
  const [activeProdRowId, setActiveProdRowId] = useState<string | null>(null);

  // Modal: Quick Client Registration (com CNPJ e CEP inteligentes)
  const [isNovoClienteModalOpen, setIsNovoClienteModalOpen] = useState(false);
  const [loadingCnpjModal, setLoadingCnpjModal] = useState(false);
  const [loadingCepModal, setLoadingCepModal] = useState(false);

  const [novoClienteData, setNovoClienteData] = useState({
    cnpj: "",
    nome: "",
    nome_empresarial: "",
    cep: "",
    endereco: "",
    cidade: "",
    estado: "",
    telefone: "",
    whatsapp_responsavel: "",
    cliente_desde: new Date().toISOString().split("T")[0],
    nome_contato: "",
    email_cobranca: "",
    ativo: true,
  });

  const formatCnpjQuick = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 14);
    return digits
      .replace(/^(\d{2})(\d)/, "$1.$2")
      .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d)/, ".$1/$2")
      .replace(/(\d{4})(\d)/, "$1-$2");
  };

  const formatCepQuick = (val: string) => {
    const digits = val.replace(/\D/g, "").slice(0, 8);
    return digits.replace(/^(\d{5})(\d)/, "$1-$2");
  };

  const buscarCnpjModal = async (rawCnpj: string) => {
    const clean = rawCnpj.replace(/\D/g, "");
    if (clean.length !== 14) return;
    setLoadingCnpjModal(true);
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

      if (data) {
        const razao = data.razao_social || data.nome || "";
        const fantasia = data.nome_fantasia || data.fantasia || razao;
        const cepRaw = data.cep ? String(data.cep).replace(/\D/g, "") : "";
        const logradouro = data.logradouro || data.descricao_tipo_de_logradouro ? `${data.descricao_tipo_de_logradouro || ""} ${data.logradouro || ""}`.trim() : "";
        const num = data.numero && data.numero !== "SN" && data.numero !== "S/N" ? `, ${data.numero}` : "";
        const bairro = data.bairro ? ` - ${data.bairro}` : "";
        const fullEnd = logradouro ? `${logradouro}${num}${bairro}` : "";

        setNovoClienteData(prev => ({
          ...prev,
          nome: razao || prev.nome,
          nome_empresarial: fantasia || prev.nome_empresarial || razao,
          cep: cepRaw ? formatCepQuick(cepRaw) : prev.cep,
          endereco: fullEnd || prev.endereco,
          cidade: data.municipio || prev.cidade,
          estado: data.uf || prev.estado,
          telefone: prev.telefone || (data.ddd_telefone_1 || ""),
          email_cobranca: prev.email_cobranca || (data.email || ""),
        }));
        toast.success(`Razão Social localizada: ${razao || fantasia}`);
      }
    } catch { /* noop */ } finally {
      setLoadingCnpjModal(false);
    }
  };

  const buscarCepModal = async (rawCep: string) => {
    const clean = rawCep.replace(/\D/g, "");
    if (clean.length !== 8) return;
    setLoadingCepModal(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      if (res.ok) {
        const json = await res.json();
        if (!json.erro) {
          setNovoClienteData(prev => ({
            ...prev,
            endereco: json.logradouro ? `${json.logradouro}${json.bairro ? ` - ${json.bairro}` : ""}` : prev.endereco,
            cidade: json.localidade || prev.cidade,
            estado: json.uf || prev.estado,
          }));
          toast.success(`Endereço localizado: ${json.localidade} - ${json.uf}`);
        }
      }
    } catch { /* noop */ } finally {
      setLoadingCepModal(false);
    }
  };

  // Modal: Enviar Orçamento (WhatsApp, E-mail, PDF)
  const [isEnviarModalOpen, setIsEnviarModalOpen] = useState(false);
  const [orcamentoParaEnvio, setOrcamentoParaEnvio] = useState<Orcamento | null>(null);

  // Printable ref
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Load clients & products catalog
  useEffect(() => {
    loadClientes();
    setProdutosCatalogo(getStoredProdutos());
    loadOrcamentosSalvos();
  }, [targetUserId]);

  const loadClientes = async () => {
    try {
      let storedMeta: Record<string, any> = {};
      try {
        const raw = localStorage.getItem(CLIENTES_METADATA_KEY);
        if (raw) storedMeta = JSON.parse(raw);
      } catch { /* noop */ }

      // Fetch from Supabase logos_patrocinadores and empresa_config
      let logosQuery = supabase.from("logos_patrocinadores").select("id, user_id, nome, logo_url, ativo, created_at").eq("excluido", false);
      let empQuery = supabase.from("empresa_config").select("user_id, nome, logo, telefone_comercial, ativo").eq("ativo", true);
      if (targetUserId) {
        logosQuery = logosQuery.eq("user_id", targetUserId);
        empQuery = empQuery.eq("user_id", targetUserId);
      }

      const [logosRes, empRes] = await Promise.all([
        logosQuery,
        empQuery,
      ]);

      const list: ClienteItem[] = [];
      const seen = new Set<string>();

      (logosRes.data || []).forEach(item => {
        const name = item.nome?.trim();
        if (name && !seen.has(name.toUpperCase())) {
          seen.add(name.toUpperCase());
          const meta = storedMeta[item.id] || storedMeta[name] || {};
          list.push({
            id: item.id,
            user_id: item.user_id,
            nome: item.nome,
            nome_empresarial: meta.nome_empresarial || "",
            cnpj: meta.cnpj || "",
            telefone: meta.telefone || "",
            whatsapp_responsavel: meta.whatsapp_responsavel || "",
            endereco: meta.endereco || "",
            cliente_desde: meta.cliente_desde || item.created_at?.split("T")[0] || "",
            nome_contato: meta.nome_contato || "",
            email_cobranca: meta.email_cobranca || "",
            logo_url: item.logo_url,
          });
        }
      });

      (empRes.data || []).forEach(emp => {
        const name = emp.nome?.trim();
        if (name && !seen.has(name.toUpperCase())) {
          seen.add(name.toUpperCase());
          const meta = storedMeta[emp.user_id] || storedMeta[name] || {};
          list.push({
            id: emp.user_id,
            user_id: emp.user_id,
            nome: emp.nome,
            nome_empresarial: meta.nome_empresarial || "",
            cnpj: meta.cnpj || "",
            telefone: emp.telefone_comercial || meta.telefone || "",
            whatsapp_responsavel: meta.whatsapp_responsavel || "",
            endereco: meta.endereco || "",
            cliente_desde: meta.cliente_desde || "",
            nome_contato: meta.nome_contato || "",
            email_cobranca: meta.email_cobranca || "",
            logo_url: emp.logo,
          });
        }
      });

      // Include records saved purely in localStorage
      Object.keys(storedMeta).forEach(key => {
        const meta = storedMeta[key];
        const cName = (key.startsWith("local_") ? meta.nome_empresarial : key) || meta.nome || "Cliente";
        if (!seen.has(cName.toUpperCase())) {
          seen.add(cName.toUpperCase());
          list.push({
            id: key,
            nome: cName,
            nome_empresarial: meta.nome_empresarial || "",
            cnpj: meta.cnpj || "",
            telefone: meta.telefone || "",
            whatsapp_responsavel: meta.whatsapp_responsavel || "",
            endereco: meta.endereco || "",
            cliente_desde: meta.cliente_desde || "",
            nome_contato: meta.nome_contato || "",
            email_cobranca: meta.email_cobranca || "",
          });
        }
      });

      setClientes(list);
    } catch (err) {
      console.error("Erro ao carregar clientes para orçamento:", err);
    }
  };

  const loadOrcamentosSalvos = () => {
    try {
      const raw = localStorage.getItem(storageKey) || localStorage.getItem(PROPOSTAS_STORAGE_KEY);
      if (raw) {
        const parsed: Orcamento[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // Apagar automaticamente orçamentos com mais de 90 dias
          const now = Date.now();
          const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
          const validOrcamentos = parsed.filter((orc: Orcamento) => {
            const orcTime = new Date(orc.data || orc.created_at).getTime();
            if (isNaN(orcTime)) return true;
            return (now - orcTime) <= ninetyDaysMs;
          });

          if (validOrcamentos.length !== parsed.length) {
            localStorage.setItem(storageKey, JSON.stringify(validOrcamentos));
          }

          setOrcamentosSalvos(validOrcamentos);
          return;
        }
      }
      setOrcamentosSalvos([]);
    } catch { /* noop */ }
  };

  const saveOrcamentoInStorage = (orc: Orcamento) => {
    const now = Date.now();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const all = [orc, ...orcamentosSalvos.filter(o => o.id !== orc.id)];
    const valid = all.filter((o: Orcamento) => {
      const orcTime = new Date(o.data || o.created_at).getTime();
      if (isNaN(orcTime)) return true;
      return (now - orcTime) <= ninetyDaysMs;
    });
    setOrcamentosSalvos(valid);
    localStorage.setItem(storageKey, JSON.stringify(valid));
  };

  const handleDeleteOrcamento = async (orc: Orcamento) => {
    const confirmed = await confirmDialog({
      title: "Apagar Orçamento",
      message: `Deseja realmente apagar o orçamento ${orc.numero} (${orc.cliente.nome})?`,
      destructive: true,
      confirmLabel: "Apagar",
      cancelLabel: "Cancelar"
    });
    if (!confirmed) return;
    const updated = orcamentosSalvos.filter(o => o.id !== orc.id);
    setOrcamentosSalvos(updated);
    try {
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch { /* noop */ }
    toast.success(`Orçamento ${orc.numero} apagado com sucesso!`);
  };

  // Filtered clients for autocomplete
  const filteredClientes = useMemo(() => {
    if (!clienteBusca.trim()) return clientes.slice(0, 8);
    const q = clienteBusca.toLowerCase();
    return clientes.filter(c => 
      c.nome?.toLowerCase().includes(q) ||
      c.nome_empresarial?.toLowerCase().includes(q) ||
      c.nome_contato?.toLowerCase().includes(q) ||
      c.cnpj?.includes(q)
    );
  }, [clientes, clienteBusca]);

  // Handle Quick Client Save
  const handleSaveNovoCliente = async () => {
    if (!novoClienteData.nome.trim()) {
      toast.error("Informe pelo menos o Nome Fantasia do cliente.");
      return;
    }

    const newId = `cli_${Date.now()}`;
    const newClient: ClienteItem = {
      id: newId,
      nome: novoClienteData.nome.trim(),
      nome_empresarial: novoClienteData.nome_empresarial.trim(),
      cnpj: novoClienteData.cnpj.trim(),
      cep: novoClienteData.cep.trim(),
      endereco: novoClienteData.endereco.trim(),
      cidade: novoClienteData.cidade.trim(),
      estado: novoClienteData.estado.trim(),
      telefone: novoClienteData.telefone.trim(),
      whatsapp_responsavel: novoClienteData.whatsapp_responsavel.trim(),
      cliente_desde: novoClienteData.cliente_desde,
      nome_contato: novoClienteData.nome_contato.trim(),
      email_cobranca: novoClienteData.email_cobranca.trim(),
      ativo: novoClienteData.ativo,
    };

    // Save to localStorage metadata (so ClientesPage reads it)
    try {
      const raw = localStorage.getItem(CLIENTES_METADATA_KEY);
      const all = raw ? JSON.parse(raw) : {};
      all[newId] = {
        nome_empresarial: newClient.nome_empresarial,
        cnpj: newClient.cnpj,
        cep: newClient.cep,
        endereco: newClient.endereco,
        cidade: newClient.cidade,
        estado: newClient.estado,
        telefone: newClient.telefone,
        whatsapp_responsavel: newClient.whatsapp_responsavel,
        cliente_desde: newClient.cliente_desde,
        nome_contato: newClient.nome_contato,
        email_cobranca: newClient.email_cobranca,
        ativo: newClient.ativo,
      };
      all[newClient.nome] = all[newId];
      localStorage.setItem(CLIENTES_METADATA_KEY, JSON.stringify(all));
    } catch (err) {
      console.warn("Erro ao gravar localStorage cliente:", err);
    }

    // Try Supabase insert
    try {
      const { data: authData } = await supabase.auth.getUser();
      if (authData?.user?.id) {
        await supabase.from("logos_patrocinadores").insert({
          user_id: authData.user.id,
          nome: newClient.nome,
          ativo: newClient.ativo,
          excluido: false,
          data_final: "2099-12-31",
        });
      }
    } catch { /* offline fallback */ }

    // Update list & select client
    setClientes(prev => [newClient, ...prev]);
    setSelectedCliente(newClient);
    setClienteBusca("");
    setIsBuscaAberta(false);
    setIsNovoClienteModalOpen(false);
    toast.success(`Cliente ${newClient.nome} cadastrado e vinculado ao orçamento!`);
  };

  // Add Item Line (com suporte a produto selecionado ou digitado no campo de busca)
  const handleAddItem = () => {
    const nextNum = itens.length + 1;

    if (selectedCatalogoProd) {
      // Adiciona o produto que foi selecionado na busca
      const newItem: ItemOrcamento = {
        id: `item-${Date.now()}-${nextNum}`,
        codigo: selectedCatalogoProd.codigo || `NXO-${String(nextNum).padStart(3, "0")}`,
        nome: selectedCatalogoProd.nome,
        descricao: selectedCatalogoProd.descricao || "",
        tipo_medida: selectedCatalogoProd.tipo_medida || "unidade",
        tempo_duracao: selectedCatalogoProd.tempo_duracao,
        quantidade: 1,
        valor: selectedCatalogoProd.valor || 0,
      };
      setItens(prev => [...prev, newItem]);
      setBuscaProdutoInput("");
      setSelectedCatalogoProd(null);
      setIsBuscaProdDropdownOpen(false);
      toast.success(`Produto "${newItem.nome}" adicionado ao orçamento!`);
      return;
    }

    if (buscaProdutoInput.trim()) {
      // Verifica se bate exatamente com algum produto do catálogo
      const matched = produtosCatalogo.find(
        p => p.nome.toLowerCase() === buscaProdutoInput.trim().toLowerCase() ||
             p.codigo.toLowerCase() === buscaProdutoInput.trim().toLowerCase()
      );

      if (matched) {
        const newItem: ItemOrcamento = {
          id: `item-${Date.now()}-${nextNum}`,
          codigo: matched.codigo || `NXO-${String(nextNum).padStart(3, "0")}`,
          nome: matched.nome,
          descricao: matched.descricao || "",
          tipo_medida: matched.tipo_medida || "unidade",
          tempo_duracao: matched.tempo_duracao,
          quantidade: 1,
          valor: matched.valor || 0,
        };
        setItens(prev => [...prev, newItem]);
        setBuscaProdutoInput("");
        setIsBuscaProdDropdownOpen(false);
        toast.success(`Produto "${newItem.nome}" adicionado!`);
        return;
      }

      // Adiciona como item personalizado com o nome digitado
      const newItem: ItemOrcamento = {
        id: `item-${Date.now()}-${nextNum}`,
        codigo: `NXO-${String(nextNum).padStart(3, "0")}`,
        nome: buscaProdutoInput.trim(),
        descricao: "",
        tipo_medida: "unidade",
        quantidade: 1,
        valor: 0,
      };
      setItens(prev => [...prev, newItem]);
      setBuscaProdutoInput("");
      setIsBuscaProdDropdownOpen(false);
      toast.success(`Item "${newItem.nome}" adicionado! Preencha o valor.`);
      return;
    }

    // Se clicou sem digitar nada, cria uma linha vazia para preenchimento
    const newItem: ItemOrcamento = {
      id: `item-${Date.now()}-${nextNum}`,
      codigo: `NXO-${String(nextNum).padStart(3, "0")}`,
      nome: "",
      descricao: "",
      tipo_medida: "unidade",
      quantidade: 1,
      valor: 0,
    };
    setItens(prev => [...prev, newItem]);
  };

  // Remove Item Line (permite remover qualquer item, sem restrição)
  const handleRemoveItem = (id: string) => {
    setItens(prev => prev.filter(it => it.id !== id));
    toast.info("Produto removido do orçamento.");
  };

  // Update Item field
  const handleUpdateItem = (id: string, field: keyof ItemOrcamento, value: any) => {
    setItens(prev => prev.map(it => {
      if (it.id !== id) return it;
      return { ...it, [field]: value };
    }));
  };

  // Carrega orçamento do histórico no formulário para edição com scroll automático
  const handleEditarOrcamento = (orc: Orcamento) => {
    setSelectedCliente(orc.cliente);
    setItens(orc.itens || []);
    setTipoRecorrencia(orc.tipo_recorrencia || "unico");
    setValidadeDias(orc.validade_dias || 15);
    setDesconto(orc.desconto || 0);
    setObservacoes(orc.observacoes || "");
    setActiveTab("novo");
    scrollToForm(formRef.current);
    toast.info(`Orçamento ${orc.numero} carregado para edição`);
  };

  // Auto-complete product selection
  const handleSelectProductForLine = (lineId: string, prod: Produto) => {
    setItens(prev => prev.map(it => {
      if (it.id !== lineId) return it;
      return {
        ...it,
        codigo: prod.codigo || it.codigo,
        nome: prod.nome,
        descricao: prod.descricao || it.descricao,
        tipo_medida: prod.tipo_medida || "unidade",
        tempo_duracao: prod.tempo_duracao,
        valor: prod.valor,
      };
    }));
    setActiveProdRowId(null);
    toast.info(`Produto ${prod.nome} preenchido.`);
  };

  // Budget Calculations
  const subtotal = useMemo(() => {
    return itens.reduce((acc, it) => acc + ((Number(it.valor) || 0) * (Number(it.quantidade) || 1)), 0);
  }, [itens]);

  const total = useMemo(() => {
    const res = subtotal - (Number(desconto) || 0);
    return res > 0 ? res : 0;
  }, [subtotal, desconto]);

  // Prepare Orcamento Object com código único sequencial e seguro
  const buildOrcamentoObject = (): Orcamento => {
    const ano = new Date().getFullYear();
    const count = (orcamentosSalvos?.length || 0) + 1;
    const sequencial = String(count).padStart(4, "0");
    const num = `ORC-${ano}-${sequencial}`;

    return {
      id: `orc_${Date.now()}`,
      numero: num,
      data: new Date().toISOString().split("T")[0],
      validade_dias: validadeDias,
      tipo_recorrencia: tipoRecorrencia,
      cliente: selectedCliente || {
        id: "cli_avulso",
        nome: clienteBusca || "Cliente Comercial",
      },
      itens,
      desconto,
      observacoes,
      status: "enviado",
      created_at: new Date().toISOString(),
    };
  };

  // Handle Enviar Orçamento Click
  const handleOpenEnviarModal = () => {
    if (!selectedCliente && !clienteBusca.trim()) {
      toast.error("Por favor, selecione ou informe o cliente do orçamento.");
      return;
    }
    if (itens.length === 0) {
      toast.error("Adicione pelo menos um produto ao orçamento antes de enviar.");
      return;
    }
    if (itens.some(it => !it.nome.trim() || it.valor <= 0)) {
      toast.warning("Verifique se todos os produtos possuem nome e valor preenchidos.");
    }

    const orc = buildOrcamentoObject();
    setOrcamentoParaEnvio(orc);
    saveOrcamentoInStorage(orc);
    setIsEnviarModalOpen(true);
  };

  // Formatted Message for WhatsApp
  const generateWhatsAppMessage = (orc: Orcamento) => {
    const itensLines = orc.itens.map(it => {
      const descPart = it.descricao ? `\n  ${it.descricao}` : "";
      return `• *${it.codigo} - ${it.nome}* (${it.tipo_medida})${descPart}\n  Qtd: ${it.quantidade} x R$ ${it.valor.toFixed(2)} = *R$ ${(it.quantidade * it.valor).toFixed(2)}*`;
    }).join("\n\n");

    const recurrenceText = orc.tipo_recorrencia === "mensal" ? "recorrente mensal (assinatura)" : "pagamento único";
    const descText = orc.desconto > 0 ? `Subtotal: R$ ${subtotal.toFixed(2)}\nDesconto: - R$ ${orc.desconto.toFixed(2)}` : "";

    const parts = [
      `Olá, *${orc.cliente.nome_contato || orc.cliente.nome}*! 👋`,
      "",
      "Aqui está o *Orçamento Comercial Nexo Agência* preparado exclusivamente para a sua empresa:",
      "",
      `📋 *Proposta Comercial:* ${orc.numero}`,
      `🏢 *Cliente:* ${orc.cliente.nome}${orc.cliente.nome_empresarial ? ` (${orc.cliente.nome_empresarial})` : ""}`,
      `📅 *Validade:* ${orc.validade_dias} dias`,
      "",
      "*PRODUTOS & SERVIÇOS:*",
      itensLines,
      "",
      "━━━━━━━━━━━━━━━━━━━━",
      descText,
      `*VALOR TOTAL:* *R$ ${total.toFixed(2)}* (${recurrenceText})`,
      "━━━━━━━━━━━━━━━━━━━━",
      "",
      `📌 *Condições:* ${orc.observacoes}`,
      "",
      "Para aprovar este orçamento ou tirar dúvidas, basta responder por aqui. Estamos prontos para iniciar seu projeto! 🚀"
    ];

    return parts.filter(p => p !== undefined).join("\n");
  };

  // Dispatch via WhatsApp
  const handleSendWhatsApp = () => {
    if (!orcamentoParaEnvio) return;
    const phone = (orcamentoParaEnvio.cliente.whatsapp_responsavel || orcamentoParaEnvio.cliente.telefone || "").replace(/\D/g, "");
    if (!phone) {
      toast.error("Este cliente não possui telefone ou WhatsApp cadastrado. Preencha no cadastro do cliente.");
      return;
    }
    const fullPhone = phone.length <= 11 ? `55${phone}` : phone;
    const msg = generateWhatsAppMessage(orcamentoParaEnvio);
    window.open(`https://wa.me/${fullPhone}?text=${encodeURIComponent(msg)}`, "_blank");
    toast.success("Orçamento aberto no WhatsApp!");
  };

  // Dispatch via E-mail
  const handleSendEmail = () => {
    if (!orcamentoParaEnvio) return;
    const email = orcamentoParaEnvio.cliente.email_cobranca || "";
    const subject = `Orçamento Comercial Nexo ${orcamentoParaEnvio.numero} - ${orcamentoParaEnvio.cliente.nome}`;
    const body = generateWhatsAppMessage(orcamentoParaEnvio).replace(/\*/g, "");
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`, "_blank");
    toast.success("Orçamento preparado no cliente de e-mail!");
  };

  // Trigger Print / PDF - Gera documento limpo e formatado em janela própria, sem capturar o modal/popup
  const handlePrintPDF = () => {
    if (!orcamentoParaEnvio) return;

    const orc = orcamentoParaEnvio;
    const dataFormatada = new Date(orc.data).toLocaleDateString("pt-BR");
    const recurrenceLabel = orc.tipo_recorrencia === "mensal" ? "Recorrente Mensal (Assinatura)" : "Pagamento Único / Avulso";
    const subtotalOrc = orc.itens.reduce((acc, it) => acc + (Number(it.valor) || 0) * (Number(it.quantidade) || 1), 0);
    const totalOrc = Math.max(0, subtotalOrc - (Number(orc.desconto) || 0));

    const win = window.open("", "_blank");
    if (!win) {
      toast.error("Por favor, permita popups no navegador para gerar o PDF.");
      return;
    }

    const itemsHtml = orc.itens.map(it => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 700; color: #011c5b;">${it.codigo}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0;">
          <div style="font-weight: 700; color: #002132;">${it.nome}</div>
          ${it.descricao ? `<div style="font-size: 10px; color: #64748b; margin-top: 2px;">${it.descricao}</div>` : ""}
        </td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; text-transform: capitalize; color: #475569;">${it.tipo_medida}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #002132;">${it.quantidade}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; color: #475569;">R$ ${Number(it.valor).toFixed(2)}</td>
        <td style="padding: 10px 12px; border-bottom: 1px solid #e2e8f0; text-align: right; font-family: monospace; font-weight: 700; color: #002132;">R$ ${(Number(it.valor) * Number(it.quantidade)).toFixed(2)}</td>
      </tr>
    `).join("");

    win.document.write(`<!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="utf-8">
      <title>Orçamento Comercial - ${orc.numero}</title>
      <style>
        @page {
          size: A4;
          margin: 15mm;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          color: #002132;
          background: #ffffff;
          padding: 24px;
          font-size: 12px;
          line-height: 1.4;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
        }
        .header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          border-bottom: 2px solid #0055ff;
          padding-bottom: 16px;
          margin-bottom: 24px;
        }
        .logo-title {
          font-size: 22px;
          font-weight: 900;
          color: #002132;
          letter-spacing: -0.5px;
          text-transform: uppercase;
        }
        .logo-sub {
          font-size: 11px;
          color: #64748b;
          font-weight: 600;
          margin-top: 2px;
        }
        .logo-contact {
          font-size: 10px;
          color: #94a3b8;
          margin-top: 4px;
        }
        .doc-badge {
          text-align: right;
        }
        .doc-number {
          font-size: 18px;
          font-weight: 900;
          color: #0055ff;
          letter-spacing: 0.5px;
          font-family: monospace;
        }
        .doc-meta {
          font-size: 11px;
          color: #475569;
          margin-top: 4px;
        }
        .client-card {
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 24px;
        }
        .card-label {
          font-size: 10px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.8px;
          color: #0055ff;
          margin-bottom: 8px;
        }
        .client-name {
          font-size: 15px;
          font-weight: 800;
          color: #002132;
        }
        .client-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 6px 20px;
          margin-top: 8px;
          font-size: 11px;
          color: #334155;
        }
        .table-wrap {
          margin-bottom: 24px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          overflow: hidden;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
          text-align: left;
        }
        thead tr {
          background: #f1f5f9;
          color: #475569;
          font-size: 10px;
          font-weight: 800;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        th {
          padding: 10px 12px;
          border-bottom: 1px solid #cbd5e1;
        }
        .totals-section {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 24px;
        }
        .totals-box {
          width: 320px;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
        }
        .totals-row {
          display: flex;
          justify-content: space-between;
          padding: 4px 0;
          font-size: 11px;
          color: #475569;
        }
        .totals-row.discount {
          color: #dc2626;
        }
        .totals-row.grand {
          border-top: 2px solid #002132;
          margin-top: 8px;
          padding-top: 8px;
          font-size: 14px;
          font-weight: 900;
          color: #002132;
        }
        .conditions-card {
          border-top: 1px solid #e2e8f0;
          padding-top: 16px;
          margin-bottom: 36px;
        }
        .conditions-text {
          font-size: 10.5px;
          color: #475569;
          line-height: 1.5;
          margin-top: 4px;
        }
        .signatures {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 40px;
          margin-top: 48px;
          text-align: center;
          page-break-inside: avoid;
        }
        .signature-line {
          border-top: 1px solid #002132;
          padding-top: 6px;
          font-size: 11px;
          font-weight: 700;
          color: #002132;
        }
        @media print {
          body { padding: 0; }
          .no-print { display: none !important; }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <!-- CABEÇALHO DO ORÇAMENTO -->
        <div class="header">
          <div>
            <div class="logo-title">NEXO AGÊNCIA</div>
            <div class="logo-sub">Soluções em Radiodifusão, TV, IA & Mídia Digital</div>
            <div class="logo-contact">contato@nexobrasil.net • nexobrasil.net</div>
          </div>
          <div class="doc-badge">
            <div class="doc-number">${orc.numero}</div>
            <div class="doc-meta"><strong>Emissão:</strong> ${dataFormatada}</div>
            <div class="doc-meta"><strong>Validade:</strong> ${orc.validade_dias} dias</div>
            <div class="doc-meta"><strong>Cobrança:</strong> ${recurrenceLabel}</div>
          </div>
        </div>

        <!-- DADOS DO CLIENTE -->
        <div class="client-card">
          <div class="card-label">Dados do Cliente</div>
          <div class="client-name">${orc.cliente.nome}</div>
          <div class="client-grid">
            ${orc.cliente.nome_empresarial ? `<div><strong>Razão / Fantasia:</strong> ${orc.cliente.nome_empresarial}</div>` : ""}
            ${orc.cliente.cnpj ? `<div><strong>CNPJ:</strong> ${orc.cliente.cnpj}</div>` : ""}
            ${orc.cliente.nome_contato ? `<div><strong>Contato:</strong> ${orc.cliente.nome_contato}</div>` : ""}
            ${(orc.cliente.telefone || orc.cliente.whatsapp_responsavel) ? `<div><strong>Telefone / WhatsApp:</strong> ${orc.cliente.whatsapp_responsavel || orc.cliente.telefone}</div>` : ""}
            ${orc.cliente.email_cobranca ? `<div><strong>E-mail:</strong> ${orc.cliente.email_cobranca}</div>` : ""}
            ${orc.cliente.endereco ? `<div><strong>Endereço:</strong> ${orc.cliente.endereco}${orc.cliente.cidade ? ` - ${orc.cliente.cidade}/${orc.cliente.estado || ""}` : ""}</div>` : ""}
          </div>
        </div>

        <!-- LISTA DOS ITENS DO ORÇAMENTO -->
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th style="width: 90px;">Cód.</th>
                <th>Produto / Serviço</th>
                <th style="width: 100px; text-align: center;">Medida</th>
                <th style="width: 60px; text-align: center;">Qtd</th>
                <th style="width: 110px; text-align: right;">Unitário</th>
                <th style="width: 120px; text-align: right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>

        <!-- RESUMO DE VALORES DO ORÇAMENTO -->
        <div class="totals-section">
          <div class="totals-box">
            <div class="card-label" style="margin-bottom: 6px;">Resumo Financeiro</div>
            <div class="totals-row">
              <span>Tipo de Cobrança:</span>
              <strong style="color: #002132;">${orc.tipo_recorrencia === "mensal" ? "Recorrente Mensal" : "Pagamento Único"}</strong>
            </div>
            <div class="totals-row">
              <span>Subtotal:</span>
              <span style="font-family: monospace;">R$ ${subtotalOrc.toFixed(2)}</span>
            </div>
            ${orc.desconto > 0 ? `
            <div class="totals-row discount">
              <span>Desconto Aplicado:</span>
              <span style="font-family: monospace;">- R$ ${Number(orc.desconto).toFixed(2)}</span>
            </div>
            ` : ""}
            <div class="totals-row grand">
              <span>VALOR TOTAL:</span>
              <span style="font-family: monospace; color: #0055ff;">
                R$ ${totalOrc.toFixed(2)}${orc.tipo_recorrencia === "mensal" ? " /mês" : ""}
              </span>
            </div>
          </div>
        </div>

        <!-- CONDIÇÕES GERAIS -->
        ${orc.observacoes ? `
        <div class="conditions-card">
          <div class="card-label">Condições Gerais & Prazo de Entrega</div>
          <div class="conditions-text">${orc.observacoes}</div>
        </div>
        ` : ""}

        <!-- ASSINATURAS -->
        <div class="signatures">
          <div>
            <div class="signature-line">NEXO AGÊNCIA</div>
            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Emissão Comercial</div>
          </div>
          <div>
            <div class="signature-line">DE ACORDO: ${orc.cliente.nome.toUpperCase()}</div>
            <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Assinatura do Cliente / Responsável</div>
          </div>
        </div>
      </div>

      <script>
        window.onload = function() {
          setTimeout(function() {
            window.print();
          }, 400);
        };
      </script>
    </body>
    </html>`);

    win.document.close();
    toast.success("Documento pronto para impressão/salvar como PDF!");
  };

  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-16 font-sans animate-fade-in">
      {/* Top Header Card */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
            Emissão de Orçamento Comercial
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Crie orçamentos limpos e inteligentes vinculados ao catálogo de produtos da agência
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1.5 rounded-full bg-[#f8fafc] border border-slate-200/80">
            <button
              onClick={() => setActiveTab("novo")}
              className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === "novo" ? "bg-[#0055ff] text-white shadow-sm" : "text-slate-600 hover:text-black"
              }`}
            >
              Novo Orçamento
            </button>
            <button
              onClick={() => setActiveTab("historico")}
              className={`px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all ${
                activeTab === "historico" ? "bg-[#0055ff] text-white shadow-sm" : "text-slate-600 hover:text-black"
              }`}
            >
              Histórico ({orcamentosSalvos.length})
            </button>
          </div>
        </div>
      </section>

      {activeTab === "novo" ? (
        <div ref={formRef} className="bg-white rounded-3xl p-6 md:p-10 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-8">
          {/* SEÇÃO 1: CLIENTE DO ORÇAMENTO */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-black uppercase tracking-wider text-[#002132] flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#0055ff]" /> 1. Cliente da Proposta
              </label>

              {selectedCliente && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCliente(null);
                    setClienteBusca("");
                  }}
                  className="text-xs font-bold text-[#0055ff] hover:underline cursor-pointer"
                >
                  Trocar Cliente
                </button>
              )}
            </div>

            {selectedCliente ? (
              /* Cliente Selecionado Card */
              <div className="p-5 rounded-2xl bg-[#f8fafc] border border-slate-200/80 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center font-black text-[#002132] text-sm shadow-sm">
                    {selectedCliente.logo_url ? (
                      <img src={selectedCliente.logo_url} alt="" className="w-full h-full object-contain p-1 rounded-2xl" />
                    ) : (
                      selectedCliente.nome.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-black text-[#002132] flex items-center gap-2">
                      <span>{selectedCliente.nome}</span>
                      {selectedCliente.nome_empresarial && (
                        <span className="text-xs font-normal text-slate-500">
                          ({selectedCliente.nome_empresarial})
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1">
                      {selectedCliente.cnpj && <span>CNPJ: {selectedCliente.cnpj}</span>}
                      {selectedCliente.nome_contato && <span>• Contato: {selectedCliente.nome_contato}</span>}
                      {selectedCliente.whatsapp_responsavel && (
                        <span>• WhatsApp: {selectedCliente.whatsapp_responsavel}</span>
                      )}
                      {selectedCliente.email_cobranca && (
                        <span>• E-mail: {selectedCliente.email_cobranca}</span>
                      )}
                    </div>
                  </div>
                </div>

                <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-wider border border-emerald-100 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Cliente Vinculado
                </span>
              </div>
            ) : (
              /* Campo de Busca com Autocomplete e Opção de Cadastro Rápido */
              <div className="relative">
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={clienteBusca}
                    onChange={e => {
                      setClienteBusca(e.target.value);
                      setIsBuscaAberta(true);
                    }}
                    onFocus={() => setIsBuscaAberta(true)}
                    placeholder="Digite o nome da empresa ou cliente..."
                    className="w-full h-12 pl-11 pr-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs font-medium text-[#002132] outline-none focus:border-[#0055ff] transition-all"
                  />
                </div>

                {/* Dropdown Resultados */}
                {isBuscaAberta && (
                  <div className="absolute top-14 left-0 right-0 z-30 bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden max-h-72 overflow-y-auto">
                    {filteredClientes.length > 0 ? (
                      <div className="divide-y divide-slate-100">
                        {filteredClientes.map(cli => (
                          <div
                            key={cli.id}
                            onClick={() => {
                              setSelectedCliente(cli);
                              setIsBuscaAberta(false);
                            }}
                            className="p-3.5 hover:bg-slate-50 flex items-center justify-between cursor-pointer transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-xl bg-[#f8fafc] border border-slate-200 flex items-center justify-center font-bold text-xs text-[#002132]">
                                {cli.nome.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <div className="text-xs font-bold text-[#002132]">{cli.nome}</div>
                                <div className="text-[10px] text-slate-400">
                                  {cli.nome_empresarial || cli.nome_contato || cli.cnpj || "Sem razão social"}
                                </div>
                              </div>
                            </div>
                            <span className="text-[10px] font-bold text-[#0055ff] uppercase">Vincular</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-4 text-center text-xs text-slate-400">
                        Nenhum cliente encontrado para "{clienteBusca}".
                      </div>
                    )}

                    {/* BOTÃO CADASTRO RÁPIDO SOLICITADO */}
                    <div className="p-3 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] text-slate-500 font-medium">
                        Não encontrou a empresa na lista?
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setNovoClienteData({
                            nome: clienteBusca,
                            nome_empresarial: "",
                            cnpj: "",
                            telefone: "",
                            whatsapp_responsavel: "",
                            endereco: "",
                            cep: "",
                            cidade: "",
                            estado: "",
                            cliente_desde: new Date().toISOString().split("T")[0],
                            nome_contato: "",
                            email_cobranca: "",
                            ativo: true,
                          });
                          setIsBuscaAberta(false);
                          setIsNovoClienteModalOpen(true);
                        }}
                        className="px-4 py-2 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                      >
                        <Plus className="w-3.5 h-3.5 text-black stroke-[3]" /> Cadastrar Novo Cliente
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* SEÇÃO 2: TABELA DE PRODUTOS DO ORÇAMENTO */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[#002132] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#0055ff]" /> 2. Produtos & Serviços do Orçamento
                </label>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  Busque o produto pelo nome ou código no catálogo ao lado e clique em Adicionar Produto
                </p>
              </div>

              {/* Barra de busca de produto + Botão Adicionar Produto */}
              <div className="flex items-center gap-2 relative">
                <div className="relative w-72 sm:w-80">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={buscaProdutoInput}
                    onChange={e => {
                      setBuscaProdutoInput(e.target.value);
                      setSelectedCatalogoProd(null);
                      setIsBuscaProdDropdownOpen(true);
                    }}
                    onFocus={() => setIsBuscaProdDropdownOpen(true)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddItem();
                      }
                    }}
                    placeholder="Buscar produto por nome ou código..."
                    className="w-full h-10 pl-9 pr-8 rounded-full bg-[#f8fafc] border border-slate-200 text-xs font-semibold text-[#002132] outline-none focus:border-[#0055ff] focus:bg-white transition-all shadow-inner"
                  />
                  {buscaProdutoInput && (
                    <button
                      type="button"
                      onClick={() => {
                        setBuscaProdutoInput("");
                        setSelectedCatalogoProd(null);
                        setIsBuscaProdDropdownOpen(false);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Dropdown de sugestões do catálogo */}
                  {isBuscaProdDropdownOpen && (
                    <div className="absolute left-0 right-0 top-12 z-30 bg-white rounded-2xl shadow-xl border border-slate-200 max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {produtosCatalogo
                        .filter(p => {
                          if (!buscaProdutoInput.trim()) return true;
                          const term = buscaProdutoInput.toLowerCase();
                          return p.nome.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term) || (p.categoria && p.categoria.toLowerCase().includes(term));
                        })
                        .slice(0, 10)
                        .map(prod => (
                          <div
                            key={prod.id}
                            onClick={() => {
                              setSelectedCatalogoProd(prod);
                              setBuscaProdutoInput(`${prod.codigo} - ${prod.nome}`);
                              setIsBuscaProdDropdownOpen(false);
                            }}
                            className="p-3 hover:bg-blue-50/70 cursor-pointer flex items-center justify-between transition-colors text-left"
                          >
                            <div>
                              <div className="text-xs font-bold text-[#002132]">
                                <span className="text-[#0055ff] font-mono mr-1.5 font-bold">{prod.codigo}</span>
                                {prod.nome}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-2 mt-0.5">
                                <span>{prod.categoria || "Geral"}</span>
                                <span>•</span>
                                <span className="capitalize">Medida: {prod.tipo_medida}</span>
                              </div>
                            </div>
                            <div className="text-right pl-3">
                              <div className="text-xs font-black text-[#0055ff] font-mono">
                                R$ {Number(prod.valor).toFixed(2)}
                              </div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase">Selecionar</span>
                            </div>
                          </div>
                        ))}

                      {produtosCatalogo.filter(p => {
                        if (!buscaProdutoInput.trim()) return true;
                        const term = buscaProdutoInput.toLowerCase();
                        return p.nome.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term);
                      }).length === 0 && (
                        <div className="p-4 text-center text-xs text-slate-400">
                          Nenhum produto cadastrado com "{buscaProdutoInput}".
                          <div className="text-[10px] text-slate-500 mt-1">
                            Clique em "+ Adicionar Produto" para inserir como item avulso.
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAddItem}
                  className="h-10 px-5 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-4 h-4 text-black stroke-[3]" /> Adicionar Produto
                </button>
              </div>
            </div>

            {/* TABELA DE PRODUTOS */}
            <div className="border border-slate-200/90 rounded-2xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[850px]">
                  <thead>
                    <tr className="bg-[#f8fafc] border-b border-slate-200/90 text-[10px] font-black uppercase tracking-wider text-slate-500">
                      <th className="py-3 px-4 w-28">Cód.</th>
                      <th className="py-3 px-4 w-64">Nome do Produto</th>
                      <th className="py-3 px-4">Descrição</th>
                      <th className="py-3 px-4 w-32 text-center">Medida</th>
                      <th className="py-3 px-4 w-20 text-center">Qtd.</th>
                      <th className="py-3 px-4 w-36 text-right">Valor Unit. (R$)</th>
                      <th className="py-3 px-4 w-14 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {itens.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 px-4 text-center text-slate-400">
                          <div className="flex flex-col items-center justify-center gap-2">
                            <Layers className="w-8 h-8 text-slate-300 stroke-[1.5]" />
                            <div className="text-xs font-bold text-slate-600">Nenhum produto adicionado ao orçamento</div>
                            <p className="text-[11px] text-slate-400 max-w-md">
                              Digite o nome de um produto no campo de busca acima e clique em <strong>+ Adicionar Produto</strong> para incluí-lo nesta proposta.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      itens.map((item, index) => (
                        <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                          {/* Cód. Produto */}
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={item.codigo}
                              onChange={e => handleUpdateItem(item.id, "codigo", e.target.value)}
                              className="w-full h-9 px-2.5 rounded-lg bg-[#f8fafc] border border-slate-200 text-xs font-mono font-bold text-slate-700 outline-none uppercase"
                            />
                          </td>

                          {/* Nome do Produto com Autocomplete */}
                          <td className="py-3 px-4 relative">
                            <input
                              type="text"
                              value={item.nome}
                              onChange={e => {
                                handleUpdateItem(item.id, "nome", e.target.value);
                                setActiveProdRowId(item.id);
                              }}
                              onFocus={() => setActiveProdRowId(item.id)}
                              placeholder="Digite ou escolha produto..."
                              className="w-full h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs font-bold text-[#002132] outline-none focus:border-[#0055ff]"
                            />

                            {/* Sugestões do Catálogo */}
                            {activeProdRowId === item.id && (
                              <div className="absolute left-4 right-4 top-12 z-20 bg-white rounded-xl shadow-xl border border-slate-200 max-h-48 overflow-y-auto divide-y divide-slate-100">
                                {produtosCatalogo
                                  .filter(p => !item.nome || p.nome.toLowerCase().includes(item.nome.toLowerCase()) || p.codigo.toLowerCase().includes(item.nome.toLowerCase()))
                                  .map(prod => (
                                    <div
                                      key={prod.id}
                                      onClick={() => handleSelectProductForLine(item.id, prod)}
                                      className="p-2.5 hover:bg-blue-50 cursor-pointer flex items-center justify-between"
                                    >
                                      <div>
                                        <div className="text-xs font-bold text-[#002132]">
                                          <span className="text-[#0055ff] mr-1">{prod.codigo}</span> {prod.nome}
                                        </div>
                                        <div className="text-[10px] text-slate-400">
                                          {prod.categoria} • Medida: {prod.tipo_medida}
                                        </div>
                                      </div>
                                      <div className="text-xs font-extrabold text-[#002132] font-mono">
                                        R$ {prod.valor.toFixed(2)}
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            )}
                          </td>

                          {/* Descrição */}
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              value={item.descricao}
                              onChange={e => handleUpdateItem(item.id, "descricao", e.target.value)}
                              placeholder="Detalhes ou entregas inclusas..."
                              className="w-full h-9 px-3 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 outline-none"
                            />
                          </td>

                          {/* Medida */}
                          <td className="py-3 px-4 text-center">
                            <select
                              value={item.tipo_medida}
                              onChange={e => handleUpdateItem(item.id, "tipo_medida", e.target.value as any)}
                              className="h-9 px-2.5 rounded-lg bg-[#f8fafc] border border-slate-200 text-xs font-semibold text-slate-700 outline-none capitalize cursor-pointer w-full"
                            >
                              <option value="unidade">Unidade</option>
                              <option value="tempo">Tempo (hh:mm:ss)</option>
                              <option value="mensal">Mensal</option>
                              <option value="hora">Hora</option>
                              <option value="projeto">Projeto</option>
                            </select>
                          </td>

                          {/* Quantidade */}
                          <td className="py-3 px-4 text-center">
                            <input
                              type="number"
                              min={1}
                              value={item.quantidade}
                              onChange={e => handleUpdateItem(item.id, "quantidade", Number(e.target.value) || 1)}
                              className="w-full h-9 px-2 text-center rounded-lg bg-white border border-slate-200 text-xs font-bold text-slate-700 outline-none"
                            />
                          </td>

                          {/* Valor Unitário */}
                          <td className="py-3 px-4 text-right">
                            <input
                              type="number"
                              step="0.01"
                              value={item.valor}
                              onChange={e => handleUpdateItem(item.id, "valor", Number(e.target.value))}
                              className="w-full h-9 px-3 text-right rounded-lg bg-white border border-slate-200 text-xs font-bold font-mono text-[#002132] outline-none"
                            />
                          </td>

                          {/* Excluir Linha */}
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                              title="Excluir produto do orçamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* SEÇÃO 3: TIPO DE RECORRÊNCIA, CONDIÇÕES & TOTALIZAÇÃO */}
          <div className="pt-6 border-t border-slate-100 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
            {/* Esquerda: Recorrência e Observações */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[#002132] block mb-2">
                  Tipo de Cobrança da Proposta
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setTipoRecorrencia("unico")}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                      tipoRecorrencia === "unico"
                        ? "border-[#0055ff] bg-blue-50/40 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      tipoRecorrencia === "unico" ? "bg-[#0055ff] text-white" : "bg-slate-100 text-slate-400"
                    }`}>
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#002132] uppercase">Serviço Único</div>
                      <div className="text-[10px] text-slate-400">Pagamento avulso / pontual</div>
                    </div>
                  </div>

                  <div
                    onClick={() => setTipoRecorrencia("mensal")}
                    className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-3 ${
                      tipoRecorrencia === "mensal"
                        ? "border-[#0055ff] bg-blue-50/40 shadow-sm"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                      tipoRecorrencia === "mensal" ? "bg-[#0055ff] text-white" : "bg-slate-100 text-slate-400"
                    }`}>
                      <RefreshCw className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#002132] uppercase">Recorrente Mensal</div>
                      <div className="text-[10px] text-slate-400">Assinatura / Mensalidade</div>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[#002132] block mb-1">
                  Validade da Proposta (Dias)
                </label>
                <input
                  type="number"
                  min={1}
                  value={validadeDias}
                  onChange={e => setValidadeDias(Number(e.target.value) || 15)}
                  className="w-32 h-10 px-3 rounded-xl bg-[#f8fafc] border border-slate-200 text-xs font-bold text-[#002132] outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase tracking-wider text-[#002132] block mb-1">
                  Observações & Termos Gerais
                </label>
                <textarea
                  rows={3}
                  value={observacoes}
                  onChange={e => setObservacoes(e.target.value)}
                  className="w-full p-3 rounded-xl bg-[#f8fafc] border border-slate-200 text-xs text-slate-700 outline-none leading-relaxed"
                />
              </div>
            </div>

            {/* Direita: Totalizador & Botão de Envio */}
            <div className="bg-[#f8fafc] p-6 rounded-3xl border border-slate-200/90 space-y-4">
              <div className="text-xs font-black uppercase tracking-wider text-[#002132]">
                Resumo de Valores do Orçamento
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-500">
                  <span>Subtotal ({itens.length} {itens.length === 1 ? 'item' : 'itens'}):</span>
                  <span className="font-mono font-bold text-slate-700">R$ {subtotal.toFixed(2)}</span>
                </div>

                <div className="flex justify-between items-center text-slate-500">
                  <span>Desconto Comercial (R$):</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    value={desconto}
                    onChange={e => setDesconto(Number(e.target.value))}
                    className="w-28 h-8 px-2 text-right rounded-lg bg-white border border-slate-200 font-mono font-bold text-xs outline-none"
                  />
                </div>

                <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                  <div>
                    <span className="text-sm font-black uppercase tracking-wide text-[#002132]">
                      Total do Orçamento
                    </span>
                    <div className="text-[10px] text-slate-400 font-semibold">
                      {tipoRecorrencia === "mensal" ? "Cobrança Recorrente Mensal" : "Pagamento Único / Avulso"}
                    </div>
                  </div>

                  <div className="text-2xl font-black text-[#0055ff] font-mono">
                    R$ {total.toFixed(2)}
                    {tipoRecorrencia === "mensal" && <span className="text-xs text-slate-400 font-sans ml-1">/mês</span>}
                  </div>
                </div>
              </div>

              {/* BOTÃO ENVIAR ORÇAMENTO */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleOpenEnviarModal}
                  className="w-full h-12 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 shadow-md hover:shadow-lg transition-all active:scale-98 cursor-pointer"
                >
                  <Send className="w-4 h-4 text-black stroke-[3]" /> Enviar Orçamento
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* HISTÓRICO DE ORÇAMENTOS */
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="text-sm font-black text-[#002132] uppercase">
                Orçamentos Emitidos Recentemente
              </h3>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Histórico de propostas comerciais geradas no sistema
              </p>
            </div>
            <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-3 py-1 rounded-full flex items-center gap-1.5 border border-slate-200/60">
              <Clock className="w-3.5 h-3.5 text-[#0055ff]" />
              Limpeza automática após 90 dias
            </span>
          </div>

          {orcamentosSalvos.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs font-medium">
              Nenhum orçamento emitido ainda. Comece criando um novo orçamento!
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {orcamentosSalvos.map(orc => {
                const totalOrc = orc.itens.reduce((acc, it) => acc + (it.valor * it.quantidade), 0) - (orc.desconto || 0);
                return (
                  <div key={orc.id} className="py-4 flex flex-wrap items-center justify-between gap-4 hover:bg-slate-50/60 p-3 rounded-2xl transition-colors">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-[#0055ff]">{orc.numero}</span>
                        <span className="text-xs font-bold text-[#002132]">{orc.cliente.nome}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                          orc.tipo_recorrencia === "mensal" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                        }`}>
                          {orc.tipo_recorrencia === "mensal" ? "Mensal" : "Único"}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        Emitido em {new Date(orc.data).toLocaleDateString("pt-BR")} • {orc.itens.length} itens inclusos
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-sm font-black text-[#002132] font-mono">
                          R$ {totalOrc.toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400">Validade: {orc.validade_dias} dias</div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleEditarOrcamento(orc)}
                        className="px-3.5 py-2 rounded-full bg-[#f8fafc] hover:bg-[#0055ff] hover:text-white text-[#002132] text-xs font-bold transition-all border border-slate-200 cursor-pointer flex items-center gap-1.5"
                        title={`Carregar orçamento ${orc.numero} para edição`}
                      >
                        <Pencil className="w-3 h-3 text-[#0055ff] group-hover:text-white" /> Editar
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOrcamentoParaEnvio(orc);
                          setIsEnviarModalOpen(true);
                        }}
                        className="px-4 py-2 rounded-full bg-[#f8fafc] hover:bg-[#0055ff] hover:text-white text-[#002132] text-xs font-bold transition-all border border-slate-200 cursor-pointer flex items-center gap-1.5"
                      >
                        <Send className="w-3 h-3" /> Reenviar / PDF
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteOrcamento(orc)}
                        className="w-8 h-8 rounded-full bg-slate-50 hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors flex items-center justify-center border border-slate-200 cursor-pointer shrink-0"
                        title={`Apagar orçamento ${orc.numero}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CADASTRO RÁPIDO DE CLIENTE (9 CAMPOS DE CLIENTESPAGE) */}
      <Dialog open={isNovoClienteModalOpen} onOpenChange={setIsNovoClienteModalOpen}>
        <DialogContent className="bg-white rounded-3xl max-w-2xl p-6 md:p-8 border border-slate-200 shadow-2xl">
          <DialogHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <DialogTitle className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#0055ff]" /> Cadastro de Cliente
              </DialogTitle>
              <div className={`flex items-center gap-2.5 px-3 py-1 rounded-full border transition-all ${
                novoClienteData.ativo 
                  ? "bg-emerald-50/80 border-emerald-200 text-emerald-800" 
                  : "bg-rose-50/80 border-rose-200 text-rose-800"
              }`}>
                <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${novoClienteData.ativo ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} />
                  {novoClienteData.ativo ? "Ativo" : "Inativo"}
                </span>
                <Switch
                  checked={novoClienteData.ativo}
                  onCheckedChange={(checked) => setNovoClienteData(n => ({ ...n, ativo: checked }))}
                  className="data-[state=checked]:bg-emerald-600 data-[state=unchecked]:bg-slate-300 scale-90"
                />
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {/* LINHA 1: CNPJ (1º CAMPO) + RAZÃO SOCIAL (PREENCHIDA PELO CNPJ) + NOME EMPRESARIAL */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  CNPJ (1º Campo)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={novoClienteData.cnpj}
                    onChange={e => {
                      const formatted = formatCnpjQuick(e.target.value);
                      setNovoClienteData({ ...novoClienteData, cnpj: formatted });
                      if (formatted.replace(/\D/g, "").length === 14) buscarCnpjModal(formatted);
                    }}
                    onBlur={() => buscarCnpjModal(novoClienteData.cnpj)}
                    placeholder="00.000.000/0001-00"
                    maxLength={18}
                    className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] font-semibold outline-none"
                  />
                  {loadingCnpjModal && (
                    <Loader2 size={16} className="animate-spin text-[#0055ff] absolute right-4 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  Razão Social *
                </label>
                <input
                  type="text"
                  value={novoClienteData.nome}
                  onChange={e => setNovoClienteData({ ...novoClienteData, nome: e.target.value })}
                  placeholder="Nome da Empresa / Razão Social"
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] font-semibold outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  Nome Empresarial / Fantasia
                </label>
                <input
                  type="text"
                  value={novoClienteData.nome_empresarial}
                  onChange={e => setNovoClienteData({ ...novoClienteData, nome_empresarial: e.target.value })}
                  placeholder="Nome Fantasia da Empresa"
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none"
                />
              </div>
            </div>

            {/* LINHA 2: ENDEREÇO ANTES DE TELEFONE -> CEP + ENDEREÇO + CIDADE + ESTADO */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-4">
              <div className="md:col-span-3">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  CEP
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={novoClienteData.cep}
                    onChange={e => {
                      const formatted = formatCepQuick(e.target.value);
                      setNovoClienteData({ ...novoClienteData, cep: formatted });
                      if (formatted.replace(/\D/g, "").length === 8) buscarCepModal(formatted);
                    }}
                    onBlur={() => buscarCepModal(novoClienteData.cep)}
                    placeholder="00000-000"
                    maxLength={9}
                    className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none"
                  />
                  {loadingCepModal && (
                    <Loader2 size={16} className="animate-spin text-[#0055ff] absolute right-4 top-1/2 -translate-y-1/2" />
                  )}
                </div>
              </div>

              <div className="md:col-span-4">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  Endereço
                </label>
                <input
                  type="text"
                  value={novoClienteData.endereco}
                  onChange={e => setNovoClienteData({ ...novoClienteData, endereco: e.target.value })}
                  placeholder="Rua, Avenida, Número, Bairro"
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none"
                />
              </div>

              <div className="md:col-span-3">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  Cidade
                </label>
                <input
                  type="text"
                  value={novoClienteData.cidade}
                  onChange={e => setNovoClienteData({ ...novoClienteData, cidade: e.target.value })}
                  placeholder="Cidade"
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none"
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  Estado
                </label>
                <input
                  type="text"
                  value={novoClienteData.estado}
                  onChange={e => setNovoClienteData({ ...novoClienteData, estado: e.target.value.toUpperCase() })}
                  placeholder="UF"
                  maxLength={2}
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none uppercase"
                />
              </div>
            </div>

            {/* LINHA 3: TELEFONE + WHATSAPP + CONTATO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  Telefone Comercial
                </label>
                <input
                  type="text"
                  value={novoClienteData.telefone}
                  onChange={e => setNovoClienteData({ ...novoClienteData, telefone: e.target.value })}
                  placeholder="(00) 0000-0000"
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  WhatsApp Responsável
                </label>
                <input
                  type="text"
                  value={novoClienteData.whatsapp_responsavel}
                  onChange={e => setNovoClienteData({ ...novoClienteData, whatsapp_responsavel: e.target.value })}
                  placeholder="(00) 90000-0000"
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  Nome do Contato
                </label>
                <input
                  type="text"
                  value={novoClienteData.nome_contato}
                  onChange={e => setNovoClienteData({ ...novoClienteData, nome_contato: e.target.value })}
                  placeholder="Nome do diretor ou responsável comercial"
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none"
                />
              </div>
            </div>

            {/* LINHA 4: E-MAIL FINANCEIRO + CLIENTE DESDE */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  E-mail Cobrança Financeira
                </label>
                <input
                  type="email"
                  value={novoClienteData.email_cobranca}
                  onChange={e => setNovoClienteData({ ...novoClienteData, email_cobranca: e.target.value })}
                  placeholder="financeiro@empresa.com.br"
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-black tracking-wider text-slate-500 uppercase block mb-1">
                  Cliente Desde
                </label>
                <DateInput
                                  value={novoClienteData.cliente_desde}
                  onChange={e => setNovoClienteData({ ...novoClienteData, cliente_desde: e.target.value })}
                  className="w-full h-11 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs text-[#002132] outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsNovoClienteModalOpen(false)}
                className="px-5 py-2.5 rounded-full text-xs text-slate-500 hover:text-black font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNovoCliente}
                className="px-6 py-2.5 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-black uppercase tracking-wider transition-all shadow-md active:scale-95 cursor-pointer"
              >
                Salvar e Vincular Cliente
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: ENVIAR ORÇAMENTO (WHATSAPP, EMAIL E GERAR PDF) */}
      <Dialog open={isEnviarModalOpen} onOpenChange={setIsEnviarModalOpen}>
        <DialogContent className="bg-white rounded-3xl max-w-xl p-6 md:p-8 border border-slate-200 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase flex items-center gap-2">
              <Send className="w-5 h-5 text-[#0055ff]" /> Enviar Orçamento Comercial
            </DialogTitle>
          </DialogHeader>

          {orcamentoParaEnvio && (
            <div className="space-y-6 pt-2">
              <div className="p-4 rounded-2xl bg-blue-50/60 border border-blue-100 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-[#002132]">{orcamentoParaEnvio.cliente.nome}</div>
                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                    Proposta {orcamentoParaEnvio.numero} • R$ {total.toFixed(2)} ({orcamentoParaEnvio.tipo_recorrencia === "mensal" ? "Mensal" : "Único"})
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-blue-600 text-white text-[9px] font-black uppercase tracking-wider">
                  Pronto para Envio
                </span>
              </div>

              {/* 3 Opções de Envio */}
              <div className="space-y-3">
                {/* 1. WhatsApp */}
                <button
                  type="button"
                  onClick={handleSendWhatsApp}
                  className="w-full p-4 rounded-2xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all flex items-center justify-between group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-black flex items-center justify-center font-bold">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#002132] uppercase">Enviar via WhatsApp</div>
                      <div className="text-[10px] text-slate-400">
                        Dispara a mensagem formatada para {orcamentoParaEnvio.cliente.whatsapp_responsavel || orcamentoParaEnvio.cliente.telefone || "o contato"}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-600 transition-colors" />
                </button>

                {/* 2. E-mail */}
                <button
                  type="button"
                  onClick={handleSendEmail}
                  className="w-full p-4 rounded-2xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 transition-all flex items-center justify-between group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold">
                      <Mail className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#002132] uppercase">Enviar via E-mail</div>
                      <div className="text-[10px] text-slate-400">
                        Prepara e-mail profissional para {orcamentoParaEnvio.cliente.email_cobranca || "o e-mail do cliente"}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-600 transition-colors" />
                </button>

                {/* 3. Gerar PDF Formatado */}
                <button
                  type="button"
                  onClick={handlePrintPDF}
                  className="w-full p-4 rounded-2xl border border-slate-200 hover:border-[#002132] hover:bg-slate-50 transition-all flex items-center justify-between group cursor-pointer text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#002132] text-white flex items-center justify-center font-bold">
                      <Printer className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-[#002132] uppercase">Gerar PDF Formatado do Orçamento</div>
                      <div className="text-[10px] text-slate-400">
                        Visualização e impressão pronta em papel timbrado Nexo Agência
                      </div>
                    </div>
                  </div>
                  <Download className="w-4 h-4 text-slate-300 group-hover:text-black transition-colors" />
                </button>
              </div>

              {/* Botão Fechar */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsEnviarModalOpen(false)}
                  className="px-5 py-2.5 rounded-full text-xs text-slate-500 hover:text-black font-semibold cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* VISUALIZAÇÃO DE IMPRESSÃO / PDF (Oculta na tela, renderizada no window.print) */}
      <div className="hidden print:block print:fixed print:inset-0 print:bg-white print:p-8 print:z-[99999]" ref={printAreaRef}>
        {orcamentoParaEnvio && (
          <div className="max-w-[800px] mx-auto space-y-6 text-black font-sans">
            {/* Cabeçalho do PDF */}
            <div className="flex justify-between items-start border-b-2 border-black pb-4">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-tight">NEXO AGÊNCIA</h1>
                <p className="text-xs text-gray-600">Soluções em Radiodifusão, TV, IA & Mídia Digital</p>
                <p className="text-[10px] text-gray-500">financeiro@nexobrasil.net • nexobrasil.net</p>
              </div>
              <div className="text-right">
                <div className="text-lg font-black">{orcamentoParaEnvio.numero}</div>
                <div className="text-xs text-gray-600">Data: {new Date(orcamentoParaEnvio.data).toLocaleDateString("pt-BR")}</div>
                <div className="text-xs text-gray-600">Validade: {orcamentoParaEnvio.validade_dias} dias</div>
              </div>
            </div>

            {/* Dados do Cliente */}
            <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
              <div className="text-xs font-bold uppercase text-gray-500 mb-1">DADOS DO CLIENTE</div>
              <div className="text-sm font-bold">{orcamentoParaEnvio.cliente.nome}</div>
              {orcamentoParaEnvio.cliente.nome_empresarial && (
                <div className="text-xs text-gray-600">Razão Social: {orcamentoParaEnvio.cliente.nome_empresarial}</div>
              )}
              <div className="text-xs text-gray-600 flex gap-4 mt-1">
                {orcamentoParaEnvio.cliente.cnpj && <span>CNPJ: {orcamentoParaEnvio.cliente.cnpj}</span>}
                {orcamentoParaEnvio.cliente.nome_contato && <span>Contato: {orcamentoParaEnvio.cliente.nome_contato}</span>}
                {orcamentoParaEnvio.cliente.telefone && <span>Tel: {orcamentoParaEnvio.cliente.telefone}</span>}
              </div>
            </div>

            {/* Tabela de Produtos */}
            <table className="w-full text-left border-collapse border border-gray-200 text-xs">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200 text-gray-700">
                  <th className="p-2 w-20">CÓD.</th>
                  <th className="p-2">PRODUTO / SERVIÇO</th>
                  <th className="p-2 w-24 text-center">MEDIDA</th>
                  <th className="p-2 w-16 text-center">QTD</th>
                  <th className="p-2 w-28 text-right">UNITÁRIO</th>
                  <th className="p-2 w-28 text-right">TOTAL</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {orcamentoParaEnvio.itens.map(it => (
                  <tr key={it.id}>
                    <td className="p-2 font-mono font-bold">{it.codigo}</td>
                    <td className="p-2">
                      <div className="font-bold">{it.nome}</div>
                      {it.descricao && <div className="text-[10px] text-gray-500">{it.descricao}</div>}
                    </td>
                    <td className="p-2 text-center capitalize">{it.tipo_medida}</td>
                    <td className="p-2 text-center">{it.quantidade}</td>
                    <td className="p-2 text-right font-mono">R$ {it.valor.toFixed(2)}</td>
                    <td className="p-2 text-right font-mono font-bold">R$ {(it.valor * it.quantidade).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totalizador */}
            <div className="flex justify-end">
              <div className="w-64 space-y-1 text-xs text-right">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span className="font-mono">R$ {subtotal.toFixed(2)}</span>
                </div>
                {orcamentoParaEnvio.desconto > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Desconto:</span>
                    <span className="font-mono">- R$ {orcamentoParaEnvio.desconto.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-black text-sm border-t border-black pt-1">
                  <span>TOTAL:</span>
                  <span className="font-mono">
                    R$ {total.toFixed(2)} {orcamentoParaEnvio.tipo_recorrencia === "mensal" ? "/mês" : ""}
                  </span>
                </div>
              </div>
            </div>

            {/* Observações */}
            <div className="pt-4 border-t border-gray-200 text-xs">
              <div className="font-bold text-gray-700 uppercase mb-1">CONDIÇÕES GERAIS</div>
              <p className="text-gray-600 leading-relaxed">{orcamentoParaEnvio.observacoes}</p>
            </div>

            {/* Assinaturas */}
            <div className="pt-12 grid grid-cols-2 gap-12 text-center text-xs">
              <div>
                <div className="border-t border-black pt-2">Nexo Agência</div>
              </div>
              <div>
                <div className="border-t border-black pt-2">De acordo: {orcamentoParaEnvio.cliente.nome}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
