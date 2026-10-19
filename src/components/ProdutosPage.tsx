import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Package, Plus, Search, Trash2, Edit2, Image as ImageIcon, 
  Clock, Hash, Layers, Check, X, Tag, DollarSign, Upload, 
  ArrowUpRight, Radio, Filter, Save, AlertCircle, Sparkles, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { scrollToForm } from "@/lib/utils";
import { confirmDialog } from "@/lib/confirmDialog";
import type { ModuloGroup, ModuloChild } from "./ModulosPage";

export type TipoMedida = "unidade" | "tempo" | "mensal" | "hora" | "projeto";

export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  categoria: string;
  tipo_medida: TipoMedida;
  tempo_duracao?: string; // ex: "00:00:30"
  foto_url?: string;
  valor: number;
  descricao: string;
  ativo: boolean;
  created_at: string;
}

const STORAGE_PRODUTOS_KEY = "nexohub_produtos_v1";
const STORAGE_CATEGORIAS_KEY = "nexohub_categorias_produtos_v1";

const DEFAULT_CATEGORIAS = [
  "Áudio & Produção",
  "Software & Plataforma",
  "Inteligência Artificial",
  "Design & Criativo",
  "Comercial & Marketing",
  "Consultoria & Serviços"
];

const DEFAULT_PRODUTOS: Produto[] = [
  {
    id: "prod-1",
    codigo: "NXO-001",
    nome: "Spot Comercial 30s",
    categoria: "Áudio & Produção",
    tipo_medida: "tempo",
    tempo_duracao: "00:00:30",
    valor: 350.00,
    descricao: "Produção de spot publicitário com locução profissional e trilha sincronizada.",
    ativo: true,
    created_at: "2026-01-10T00:00:00Z"
  },
  {
    id: "prod-2",
    codigo: "NXO-002",
    nome: "Vinheta Cantada de Emissora",
    categoria: "Áudio & Produção",
    tipo_medida: "unidade",
    valor: 600.00,
    descricao: "Identificação sonora personalizada para rádio e streaming com vozes harmônicas.",
    ativo: true,
    created_at: "2026-01-15T00:00:00Z"
  },
  {
    id: "prod-3",
    codigo: "NXO-003",
    nome: "Plataforma House Mix Streaming",
    categoria: "Software & Plataforma",
    tipo_medida: "mensal",
    valor: 590.00,
    descricao: "Sistema completo de automação, áudio/vídeo dual streaming, agenda e Info Music.",
    ativo: true,
    created_at: "2026-02-01T00:00:00Z"
  },
  {
    id: "prod-4",
    codigo: "NXO-004",
    nome: "Chatbot WhatsApp IA Oficial",
    categoria: "Inteligência Artificial",
    tipo_medida: "mensal",
    valor: 450.00,
    descricao: "Atendimento automático 24h via Meta Cloud com IA generativa para pedidos de música e recados.",
    ativo: true,
    created_at: "2026-02-10T00:00:00Z"
  },
  {
    id: "prod-5",
    codigo: "NXO-005",
    nome: "Aplicativo Smart TV OTT Nexo",
    categoria: "Software & Plataforma",
    tipo_medida: "mensal",
    valor: 850.00,
    descricao: "Canal interativo com player ao vivo para televisores Samsung Tizen, LG webOS e Android TV.",
    ativo: true,
    created_at: "2026-02-20T00:00:00Z"
  },
  {
    id: "prod-6",
    codigo: "NXO-006",
    nome: "Pack 10 Artes Redes Sociais",
    categoria: "Design & Criativo",
    tipo_medida: "unidade",
    valor: 490.00,
    descricao: "Criação de 10 peças promocionais (feed e stories) no formato 1:1 e 9:16.",
    ativo: true,
    created_at: "2026-03-01T00:00:00Z"
  },
  {
    id: "prod-7",
    codigo: "NXO-007",
    nome: "Pacote de Textos & Roteiros Comerciais",
    categoria: "Comercial & Marketing",
    tipo_medida: "unidade",
    valor: 650.00,
    descricao: "Redação publicitária profissional para rádio, TV e mídias sociais.",
    ativo: true,
    created_at: "2026-03-05T00:00:00Z"
  },
  {
    id: "prod-8",
    codigo: "NXO-008",
    nome: "Consultoria Técnica & Engenharia de Rádio",
    categoria: "Consultoria & Serviços",
    tipo_medida: "projeto",
    valor: 1200.00,
    descricao: "Consultoria completa de acústica, transmissão, processamento de áudio e automação de estúdios.",
    ativo: true,
    created_at: "2026-03-08T00:00:00Z"
  },
  {
    id: "prod-9",
    codigo: "NXO-009",
    nome: "Caneca Positiva FM 350ml",
    categoria: "Comercial & Marketing",
    tipo_medida: "unidade",
    valor: 9.90,
    descricao: "Caneca oficial personalizada da Positiva FM em cerâmica 350ml.",
    foto_url: "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/shopping/e4e56fbb-0e90-4664-90b9-fbcb4ba9f637/1772344567304.png",
    ativo: true,
    created_at: "2026-03-10T00:00:00Z"
  },
  {
    id: "prod-10",
    codigo: "NXO-010",
    nome: "Jingle Publicitário Completo (60s)",
    categoria: "Áudio & Produção",
    tipo_medida: "tempo",
    tempo_duracao: "00:01:00",
    valor: 1500.00,
    descricao: "Composição inédita, arranjo instrumental e gravação de vozes para identidade de marca.",
    ativo: true,
    created_at: "2026-03-12T00:00:00Z"
  },
  {
    id: "prod-11",
    codigo: "NXO-011",
    nome: "Transmissão Externa Blitz / Flash Ao Vivo",
    categoria: "Áudio & Produção",
    tipo_medida: "hora",
    valor: 400.00,
    descricao: "Cobertura externa de eventos e ações promocionais com locutor e link ao vivo.",
    ativo: true,
    created_at: "2026-03-14T00:00:00Z"
  },
  {
    id: "prod-12",
    codigo: "NXO-012",
    nome: "Cenário Virtual 3D para Estúdio Web",
    categoria: "Design & Criativo",
    tipo_medida: "projeto",
    valor: 950.00,
    descricao: "Modelagem de estúdio personalizado para vMix e OBS com ângulos de câmeras dinâmicos.",
    ativo: true,
    created_at: "2026-03-15T00:00:00Z"
  },
  {
    id: "prod-13",
    codigo: "NXO-013",
    nome: "Vídeo Comercial Pré-Roll ADS 30s",
    categoria: "Design & Criativo",
    tipo_medida: "tempo",
    tempo_duracao: "00:00:30",
    valor: 750.00,
    descricao: "Motion design e animação gráfica em alta definição para pré-roll em streaming e TV.",
    ativo: true,
    created_at: "2026-03-16T00:00:00Z"
  },
  {
    id: "prod-14",
    codigo: "NXO-014",
    nome: "Módulo Info Music com Base Sincronizada",
    categoria: "Software & Plataforma",
    tipo_medida: "mensal",
    valor: 350.00,
    descricao: "Metadados musicais automáticos, letras sincronizadas, biografias e curiosidades em tempo real.",
    ativo: true,
    created_at: "2026-03-18T00:00:00Z"
  },
  {
    id: "prod-15",
    codigo: "NXO-015",
    nome: "Pack Identidade Visual Completa (Brandbook)",
    categoria: "Design & Criativo",
    tipo_medida: "projeto",
    valor: 1800.00,
    descricao: "Criação de logotipo, paleta cromática, tipografia oficial, manual de aplicação e mockups.",
    ativo: true,
    created_at: "2026-03-20T00:00:00Z"
  },
  {
    id: "prod-16",
    codigo: "NXO-016",
    nome: "Gestão de Tráfego Pago & Campanhas Meta/Google",
    categoria: "Comercial & Marketing",
    tipo_medida: "mensal",
    valor: 900.00,
    descricao: "Estratégia, otimização de orçamento e relatórios analíticos de conversão em anúncios online.",
    ativo: true,
    created_at: "2026-03-22T00:00:00Z"
  },
  {
    id: "prod-17",
    codigo: "NXO-017",
    nome: "Locução Off Profissional (Pacote 5 Textos)",
    categoria: "Áudio & Produção",
    tipo_medida: "unidade",
    valor: 500.00,
    descricao: "Gravação de 5 textos institucionais ou promocionais em voz padrão sem trilha.",
    ativo: true,
    created_at: "2026-03-24T00:00:00Z"
  }
];

export function getStoredProdutos(): Produto[] {
  try {
    const raw = localStorage.getItem(STORAGE_PRODUTOS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_PRODUTOS_KEY, JSON.stringify(DEFAULT_PRODUTOS));
      return DEFAULT_PRODUTOS;
    }
    const list: Produto[] = JSON.parse(raw);
    let changed = false;

    // Normalizar códigos PRD- para NXO-
    const normalized = list.map(p => {
      if (p.codigo && p.codigo.startsWith("PRD-")) {
        changed = true;
        return { ...p, codigo: p.codigo.replace("PRD-", "NXO-") };
      }
      return p;
    });

    // Garantir que todos os produtos padrão existam na lista
    const existingNames = new Set(normalized.map(p => p.nome.trim().toUpperCase()));
    DEFAULT_PRODUTOS.forEach(dp => {
      if (!existingNames.has(dp.nome.trim().toUpperCase()) && !normalized.some(p => p.id === dp.id)) {
        normalized.push(dp);
        changed = true;
      }
    });

    // 2. Verificar se há códigos duplicados, vazios ou inválidos
    const seenCodes = new Set<string>();
    let hasDuplicates = false;
    for (const p of normalized) {
      const c = (p.codigo || "").trim().toUpperCase();
      if (!c || seenCodes.has(c)) {
        hasDuplicates = true;
        break;
      }
      seenCodes.add(c);
    }

    // Se houver duplicações, re-sequencia todos mantendo a ordem cronológica
    if (hasDuplicates) {
      changed = true;
      // Ordena cronologicamente (os mais antigos primeiro: DEFAULT_PRODUTOS / criados antes)
      const sorted = [...normalized].sort((a, b) => {
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return timeA - timeB;
      });

      const reindexed = sorted.map((p, index) => ({
        ...p,
        codigo: `NXO-${String(index + 1).padStart(3, "0")}`
      }));

      // Mantém a visualização que o usuário tinha (ou na ordem que preferir)
      // Como a tabela mostra na ordem da lista, se colocarmos em ordem do mais recente para o mais antigo ou 1 a N:
      // Vamos manter a lista com os códigos sequenciais corretos.
      localStorage.setItem(STORAGE_PRODUTOS_KEY, JSON.stringify(reindexed));
      return reindexed;
    }

    if (changed) {
      localStorage.setItem(STORAGE_PRODUTOS_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    return DEFAULT_PRODUTOS;
  }
}

export function saveStoredProdutos(produtos: Produto[]) {
  try {
    localStorage.setItem(STORAGE_PRODUTOS_KEY, JSON.stringify(produtos));
  } catch (e) {
    console.error("Erro ao salvar produtos no localStorage:", e);
  }
}

export function generateNextCodigo(produtos: Produto[]): string {
  let maxNum = 0;
  produtos.forEach(p => {
    if (p.codigo) {
      const match = p.codigo.match(/\d+/);
      if (match) {
        const numPart = parseInt(match[0], 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      }
    }
  });
  return `NXO-${String(maxNum + 1).padStart(3, "0")}`;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#f8fafc",
  border: "1px solid rgba(226, 232, 240, 0.9)",
  padding: "0 18px",
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

interface ProdutosPageProps {
  accentColor?: string;
  adminModulosGroups?: ModuloGroup[];
  subUsuarioModulosGroups?: ModuloGroup[];
  onSelectGroup?: (group: ModuloGroup) => void;
  onSelectChild?: (child: ModuloChild, parentLabel: string) => void;
  onNavigate?: (page: string) => void;
}

export default function ProdutosPage({
  accentColor = "#0055ff",
  adminModulosGroups = [],
  subUsuarioModulosGroups = [],
  onSelectGroup,
  onSelectChild,
  onNavigate,
}: ProdutosPageProps) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [categorias, setCategorias] = useState<string[]>(DEFAULT_CATEGORIAS);
  const [busca, setBusca] = useState("");
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>("todas");
  const [editingId, setEditingId] = useState<string | null>(null);
  const formRef = useRef<HTMLElement | null>(null);

  // Form states
  const [formData, setFormData] = useState({
    codigo: "",
    nome: "",
    categoria: DEFAULT_CATEGORIAS[0],
    tipo_medida: "unidade" as TipoMedida,
    tempo_duracao: "00:00:30",
    valor: "",
    descricao: "",
    foto_url: ""
  });

  // Modal nova categoria
  const [modalNovaCategoriaOpen, setModalNovaCategoriaOpen] = useState(false);
  const [novaCategoriaNome, setNovaCategoriaNome] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Carrega produtos e categorias
  useEffect(() => {
    const loaded = getStoredProdutos();
    setProdutos(loaded);

    try {
      const rawCat = localStorage.getItem(STORAGE_CATEGORIAS_KEY);
      if (rawCat) {
        setCategorias(JSON.parse(rawCat));
      }
    } catch {}

    setFormData(prev => ({
      ...prev,
      codigo: generateNextCodigo(loaded)
    }));
  }, []);

  const handleSalvarProduto = () => {
    if (!formData.nome.trim()) {
      toast.error("O nome do produto é obrigatório.");
      return;
    }

    const valorNum = parseFloat(formData.valor.toString().replace(",", ".")) || 0;

    if (editingId) {
      const updated = produtos.map(p => {
        if (p.id === editingId) {
          return {
            ...p,
            codigo: formData.codigo || p.codigo,
            nome: formData.nome.trim(),
            categoria: formData.categoria,
            tipo_medida: formData.tipo_medida,
            tempo_duracao: formData.tipo_medida === "tempo" ? formData.tempo_duracao : undefined,
            valor: valorNum,
            descricao: formData.descricao.trim(),
            foto_url: formData.foto_url || p.foto_url
          };
        }
        return p;
      });

      setProdutos(updated);
      saveStoredProdutos(updated);
      toast.success("Produto atualizado com sucesso!");
      handleResetForm(updated);
    } else {
      // Garante código único sempre
      const existingCodes = new Set(produtos.map(p => (p.codigo || "").trim().toUpperCase()));
      let nextCod = (formData.codigo || "").trim().toUpperCase();
      if (!nextCod || existingCodes.has(nextCod)) {
        nextCod = generateNextCodigo(produtos);
      }

      const novoProduto: Produto = {
        id: `prod_${Date.now()}`,
        codigo: nextCod,
        nome: formData.nome.trim(),
        categoria: formData.categoria,
        tipo_medida: formData.tipo_medida,
        tempo_duracao: formData.tipo_medida === "tempo" ? formData.tempo_duracao : undefined,
        valor: valorNum,
        descricao: formData.descricao.trim(),
        foto_url: formData.foto_url,
        ativo: true,
        created_at: new Date().toISOString()
      };

      const nextList = [novoProduto, ...produtos];
      setProdutos(nextList);
      saveStoredProdutos(nextList);
      toast.success("Produto cadastrado com sucesso!");
      handleResetForm(nextList);
    }
  };

  const handleResetForm = (currentList?: Produto[]) => {
    setEditingId(null);
    const listToUse = currentList || produtos;
    const nextCod = generateNextCodigo(listToUse);
    setFormData({
      codigo: nextCod,
      nome: "",
      categoria: categorias[0] || "Geral",
      tipo_medida: "unidade",
      tempo_duracao: "00:00:30",
      valor: "",
      descricao: "",
      foto_url: ""
    });
  };

  const handleEdit = (prod: Produto) => {
    setEditingId(prod.id);
    setFormData({
      codigo: prod.codigo,
      nome: prod.nome,
      categoria: prod.categoria,
      tipo_medida: prod.tipo_medida,
      tempo_duracao: prod.tempo_duracao || "00:00:30",
      valor: prod.valor.toString(),
      descricao: prod.descricao,
      foto_url: prod.foto_url || ""
    });
    scrollToForm(formRef.current);
  };

  const handleDelete = async (id: string, nome: string) => {
    const confirmed = await confirmDialog({
      title: "Excluir Produto",
      message: `Deseja realmente excluir o produto "${nome}"?`,
      destructive: true,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar"
    });
    if (!confirmed) return;
    const filtered = produtos.filter(p => p.id !== id);
    setProdutos(filtered);
    saveStoredProdutos(filtered);
    toast.success("Produto excluído!");
    if (editingId === id) {
      handleResetForm(filtered);
    } else {
      setFormData(prev => ({
        ...prev,
        codigo: generateNextCodigo(filtered)
      }));
    }
  };

  const handleReorganizarCodigos = () => {
    // Reorganiza todos os produtos com numeração sequencial NXO-001, NXO-002...
    // mantendo a ordem de cadastro (created_at ou ordem da lista)
    const sorted = [...produtos].sort((a, b) => {
      const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return timeA - timeB;
    });

    const reindexed = sorted.map((p, idx) => ({
      ...p,
      codigo: `NXO-${String(idx + 1).padStart(3, "0")}`
    }));

    setProdutos(reindexed);
    saveStoredProdutos(reindexed);
    handleResetForm(reindexed);
    toast.success("Códigos sequenciais corrigidos com sucesso!");
  };

  const handleAddCategoria = () => {
    const nomeLimpo = novaCategoriaNome.trim();
    if (!nomeLimpo) {
      toast.error("Informe o nome da categoria.");
      return;
    }
    if (categorias.includes(nomeLimpo)) {
      toast.info("Esta categoria já existe.");
      setFormData(prev => ({ ...prev, categoria: nomeLimpo }));
      setModalNovaCategoriaOpen(false);
      setNovaCategoriaNome("");
      return;
    }

    const nextCategorias = [...categorias, nomeLimpo];
    setCategorias(nextCategorias);
    try {
      localStorage.setItem(STORAGE_CATEGORIAS_KEY, JSON.stringify(nextCategorias));
    } catch {}

    setFormData(prev => ({ ...prev, categoria: nomeLimpo }));
    setModalNovaCategoriaOpen(false);
    setNovaCategoriaNome("");
    toast.success(`Categoria "${nomeLimpo}" adicionada!`);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Por favor, selecione um arquivo de imagem válido.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setFormData(prev => ({ ...prev, foto_url: base64 }));
      toast.success("Foto carregada com sucesso!");
    };
    reader.readAsDataURL(file);
  };

  const produtosFiltrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    return produtos.filter(p => {
      const matchBusca = !q || 
        p.nome.toLowerCase().includes(q) || 
        p.codigo.toLowerCase().includes(q) ||
        p.descricao.toLowerCase().includes(q);
      const matchCat = categoriaFiltro === "todas" || p.categoria === categoriaFiltro;
      return matchBusca && matchCat;
    });
  }, [produtos, busca, categoriaFiltro]);

  return (
    <div className="w-full max-w-none mx-0 space-y-8 pt-2 pb-16 font-sans animate-fade-in">
      {/* 1. SEÇÃO DE CADASTRO DE PRODUTO */}
      <section ref={formRef} className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-black to-slate-800 text-white flex items-center justify-center shadow-md shrink-0">
              <Package className="w-5 h-5 text-[#0055ff]" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
                {editingId ? "Editar Produto" : "Cadastro de Produto"}
              </h2>
              <p className="text-xs text-slate-400 font-medium mt-0.5">
                Defina os produtos, serviços, valores e parâmetros de entrega da agência
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-[11px] font-bold text-slate-700 bg-[#f1f5f9] px-4 py-1.5 rounded-full uppercase tracking-wider flex items-center gap-1.5">
              <span>Código:</span>
              <span className="text-[#0055ff] font-extrabold">{formData.codigo || "NXO-001"}</span>
            </div>
          </div>
        </div>

        {/* Form Inputs Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          {/* Código do Produto (Automático) */}
          <div>
            <label style={labelStyle}>Código do Produto</label>
            <div className="relative">
              <input 
                style={{ ...inputStyle, background: "#f1f5f9", cursor: "not-allowed", fontWeight: 700 }}
                value={formData.codigo}
                readOnly
                title="Código gerado automaticamente em sequência"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#0055ff] uppercase">
                Auto
              </span>
            </div>
          </div>

          {/* Nome do Produto */}
          <div>
            <label style={labelStyle}>Nome do Produto</label>
            <input 
              style={inputStyle}
              value={formData.nome}
              onChange={e => setFormData(prev => ({ ...prev, nome: e.target.value }))}
              placeholder="Ex: Spot Comercial 30s"
            />
          </div>

          {/* Categoria do Produto + Botão '+' */}
          <div>
            <label style={labelStyle}>Categoria do Produto</label>
            <div className="flex items-center gap-2">
              <select
                style={{ ...inputStyle, paddingRight: 30 }}
                value={formData.categoria}
                onChange={e => setFormData(prev => ({ ...prev, categoria: e.target.value }))}
                className="appearance-none cursor-pointer"
              >
                {categorias.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setModalNovaCategoriaOpen(true)}
                className="w-11 h-11 rounded-full bg-[#14161a] hover:bg-[#0055ff] text-white flex items-center justify-center shrink-0 transition-all shadow-sm active:scale-95 cursor-pointer"
                title="Cadastrar nova categoria"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Campo de Medida */}
          <div>
            <label style={labelStyle}>Unidade de Medida</label>
            <select
              style={inputStyle}
              value={formData.tipo_medida}
              onChange={e => setFormData(prev => ({ ...prev, tipo_medida: e.target.value as TipoMedida }))}
              className="appearance-none cursor-pointer"
            >
              <option value="unidade">Por Unidade (Quantidade)</option>
              <option value="tempo">Por Tempo (hh:mm:ss)</option>
              <option value="mensal">Assinatura Mensal</option>
              <option value="hora">Por Hora Trabalhada</option>
              <option value="projeto">Por Projeto Fechado</option>
            </select>
          </div>

          {/* Se for por tempo: Duração (hh:mm:ss) */}
          {formData.tipo_medida === "tempo" ? (
            <div>
              <label style={labelStyle}>Duração (hh:mm:ss)</label>
              <input 
                style={inputStyle}
                value={formData.tempo_duracao}
                onChange={e => setFormData(prev => ({ ...prev, tempo_duracao: e.target.value }))}
                placeholder="00:00:30"
              />
            </div>
          ) : (
            <div>
              <label style={labelStyle}>Valor Base de Venda (R$)</label>
              <input 
                style={inputStyle}
                value={formData.valor}
                onChange={e => setFormData(prev => ({ ...prev, valor: e.target.value }))}
                placeholder="0,00"
              />
            </div>
          )}

          {/* Se tipo_medida era tempo, o campo valor fica ao lado */}
          {formData.tipo_medida === "tempo" && (
            <div>
              <label style={labelStyle}>Valor Base de Venda (R$)</label>
              <input 
                style={inputStyle}
                value={formData.valor}
                onChange={e => setFormData(prev => ({ ...prev, valor: e.target.value }))}
                placeholder="0,00"
              />
            </div>
          )}

          {/* Foto do Produto (Upload) */}
          <div className="lg:col-span-1">
            <label style={labelStyle}>Foto do Produto</label>
            <input 
              ref={fileInputRef}
              type="file" 
              accept="image/*" 
              onChange={handleImageUpload}
              className="hidden" 
            />
            <div className="flex items-center gap-3">
              {formData.foto_url ? (
                <div className="relative w-11 h-11 rounded-2xl overflow-hidden border border-slate-200 shrink-0 bg-slate-50">
                  <img src={formData.foto_url} alt="Preview" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setFormData(prev => ({ ...prev, foto_url: "" }))}
                    className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 flex items-center justify-center text-white transition-opacity"
                    title="Remover foto"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="w-11 h-11 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                  <ImageIcon size={18} />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-11 px-5 rounded-full bg-[#f8fafc] hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer flex-1"
              >
                <Upload size={14} /> {formData.foto_url ? "Trocar Foto" : "Fazer Upload"}
              </button>
            </div>
          </div>

          {/* Descrição do Produto */}
          <div className="md:col-span-2 lg:col-span-2">
            <label style={labelStyle}>Descrição e Escopo do Produto</label>
            <input 
              style={inputStyle}
              value={formData.descricao}
              onChange={e => setFormData(prev => ({ ...prev, descricao: e.target.value }))}
              placeholder="Descreva o que está incluso na entrega deste produto/serviço..."
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-7 pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
          {editingId && (
            <button
              onClick={() => handleResetForm()}
              className="h-11 px-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <X size={15} /> Cancelar
            </button>
          )}
          <button
            onClick={handleSalvarProduto}
            className="h-11 px-8 rounded-full bg-[#0055ff] hover:bg-[#0047d4] active:scale-95 text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer shadow-md hover:shadow-lg hover:shadow-blue-500/20"
          >
            <Save size={16} className="text-black" />
            {editingId ? "Atualizar Produto" : "Salvar Produto"}
          </button>
        </div>
      </section>

      {/* 2. TABELA DE PRODUTOS CADASTRADOS */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 text-[#002132]">
            <div className="w-9 h-9 rounded-xl bg-[#14161a] flex items-center justify-center text-[#0055ff]">
              <Package size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#002132]">
                Catálogo de Produtos Cadastrados
              </h3>
              <p className="text-xs text-slate-400">Produtos e serviços disponíveis para orçamentos e packs</p>
            </div>
            <span className="text-xs font-bold bg-[#f1f5f9] text-slate-700 px-3 py-1 rounded-full ml-1">
              {produtosFiltrados.length}
            </span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Filtro Categoria */}
            <select
              value={categoriaFiltro}
              onChange={e => setCategoriaFiltro(e.target.value)}
              className="h-10 px-4 rounded-full bg-[#f8fafc] border border-slate-200 text-xs font-semibold text-slate-700 outline-none cursor-pointer"
            >
              <option value="todas">Todas as categorias</option>
              {categorias.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {/* Reorganizar Sequência */}
            <button
              onClick={handleReorganizarCodigos}
              title="Corrigir e reorganizar todos os códigos sequenciais (NXO-001, NXO-002...)"
              className="h-10 px-4 rounded-full bg-[#f8fafc] hover:bg-[#e2e8f0] border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all cursor-pointer"
            >
              <RefreshCw size={13} className="text-[#0055ff]" />
              <span className="hidden sm:inline">Ajustar Sequência</span>
            </button>

            {/* Busca */}
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por código, nome ou descrição..."
                className="w-72 md:w-80 h-10 rounded-full bg-[#f8fafc] border border-slate-200/80 pl-10 pr-4 text-xs text-slate-800 placeholder-slate-400 outline-none focus:bg-white focus:border-[#0055ff] transition-all font-sans"
              />
            </div>
          </div>
        </div>

        {produtosFiltrados.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400 font-medium">
            Nenhum produto encontrado.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="overflow-x-auto overflow-y-auto max-h-[396px] rounded-2xl border border-slate-200/80 shadow-xs relative nexo-table-scroll bg-white">
              <table className="w-full border-collapse text-xs font-sans">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-[#f8fafc] text-slate-600 border-b border-slate-200">
                    {["Cód.", "Foto", "Nome do Produto", "Categoria", "Medida", "Valor (R$)", "Ações"].map((h) => (
                      <th
                        key={h}
                        className={`py-3 px-3 text-[10px] font-bold uppercase tracking-wider bg-[#f8fafc] ${
                          h === "Ações" ? "text-right pr-4" : "text-left pl-4"
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {produtosFiltrados.map((prod) => (
                    <tr
                      key={prod.id}
                      className="hover:bg-slate-50/80 transition-colors h-[58px]"
                    >
                      <td className="p-3 pl-4 font-extrabold text-[#0055ff] whitespace-nowrap">
                        {prod.codigo}
                      </td>
                      <td className="p-3">
                        {prod.foto_url ? (
                          <img src={prod.foto_url} alt={prod.nome} className="w-9 h-9 rounded-xl object-cover border border-slate-200" />
                        ) : (
                          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                            <Package size={15} />
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="font-bold text-slate-800 text-xs">{prod.nome}</div>
                        {prod.descricao && (
                          <div className="text-[11px] text-slate-400 truncate max-w-[280px] mt-0.5">
                            {prod.descricao}
                          </div>
                        )}
                      </td>
                      <td className="p-3">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                          <Tag size={10} className="text-[#0055ff]" />
                          {prod.categoria}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 whitespace-nowrap">
                        {prod.tipo_medida === "tempo" ? (
                          <span className="inline-flex items-center gap-1 text-slate-700 font-semibold">
                            <Clock size={12} className="text-amber-500" />
                            {prod.tempo_duracao || "Tempo"}
                          </span>
                        ) : (
                          <span className="capitalize">{prod.tipo_medida}</span>
                        )}
                      </td>
                      <td className="p-3 font-extrabold text-slate-900 whitespace-nowrap">
                        R$ {prod.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="p-3 pr-4 text-right">
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleEdit(prod)}
                            className="rounded-full text-slate-400 hover:text-[#0055ff] hover:bg-slate-100 h-8 w-8"
                            title="Editar produto"
                          >
                            <Edit2 size={14} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleDelete(prod.id, prod.nome)}
                            className="rounded-full text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8"
                            title="Excluir produto"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {produtosFiltrados.length > 6 && (
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-slate-400 font-medium">
                <span>Exibindo 6 produtos por vez (total: {produtosFiltrados.length})</span>
                <span className="text-slate-400 font-semibold">Role a tabela para ver os demais produtos ↓</span>
              </div>
            )}
          </div>
        )}
      </section>


      {/* MODAL: NOVA CATEGORIA */}
      <Dialog open={modalNovaCategoriaOpen} onOpenChange={setModalNovaCategoriaOpen}>
        <DialogContent className="max-w-md bg-white rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-base font-black text-[#002132] uppercase tracking-wider">
              Cadastrar Nova Categoria
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <label style={labelStyle}>Nome da Categoria</label>
              <input 
                style={inputStyle}
                value={novaCategoriaNome}
                onChange={e => setNovaCategoriaNome(e.target.value)}
                placeholder="Ex: Produção de Vídeo, Podcast, etc."
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => { setModalNovaCategoriaOpen(false); setNovaCategoriaNome(""); }}
                className="h-10 px-5 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddCategoria}
                className="h-10 px-6 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white text-xs font-extrabold uppercase tracking-wider"
              >
                Adicionar Categoria
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
