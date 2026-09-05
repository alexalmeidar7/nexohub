import { useState, useEffect, useMemo, useRef } from "react";
import { 
  Package, Plus, Search, Trash2, Edit2, Image as ImageIcon, 
  Clock, Hash, Layers, Check, X, Tag, DollarSign, Upload, 
  ArrowUpRight, Radio, Filter, Save, AlertCircle, Sparkles
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import HouseMixPage, { type HouseMixTab } from "./HouseMixPage";
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
    const updated = list.map(p => {
      if (p.codigo && p.codigo.startsWith("PRD-")) {
        changed = true;
        return { ...p, codigo: p.codigo.replace("PRD-", "NXO-") };
      }
      return p;
    });
    if (changed) {
      localStorage.setItem(STORAGE_PRODUTOS_KEY, JSON.stringify(updated));
    }
    return updated;
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
      if (p.codigo.startsWith("NXO-")) {
        const numPart = parseInt(p.codigo.replace("NXO-", ""), 10);
        if (!isNaN(numPart) && numPart > maxNum) {
          maxNum = numPart;
        }
      } else if (p.codigo.startsWith("PRD-")) {
        const numPart = parseInt(p.codigo.replace("PRD-", ""), 10);
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
    } else {
      const nextCod = formData.codigo || generateNextCodigo(produtos);
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
    }

    handleResetForm();
  };

  const handleResetForm = () => {
    setEditingId(null);
    const nextCod = generateNextCodigo(produtos);
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
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = (id: string, nome: string) => {
    if (!confirm(`Deseja realmente excluir o produto "${nome}"?`)) return;
    const filtered = produtos.filter(p => p.id !== id);
    setProdutos(filtered);
    saveStoredProdutos(filtered);
    toast.success("Produto excluído!");
    if (editingId === id) {
      handleResetForm();
    }
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
    <div className="w-full space-y-8 pt-2 pb-16 font-sans animate-fade-in">
      {/* 1. SEÇÃO DE CADASTRO DE PRODUTO */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90">
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
              onClick={handleResetForm}
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
          <div className="overflow-x-auto rounded-2xl border border-slate-100">
            <table className="w-full border-collapse text-xs font-sans">
              <thead>
                <tr className="bg-[#14161a] text-white">
                  {["Cód.", "Foto", "Nome do Produto", "Categoria", "Medida", "Valor (R$)", "Ações"].map((h) => (
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
                {produtosFiltrados.map((prod) => (
                  <tr
                    key={prod.id}
                    className="hover:bg-slate-50/80 transition-colors"
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
        )}
      </section>

      {/* 3. SEÇÃO DE GESTÃO DO HOUSE MIX (Abaixo da Tabela de Produtos) */}
      <div className="pt-4 border-t border-slate-200/80">
        <HouseMixPage 
          accentColor={accentColor}
          adminModulosGroups={adminModulosGroups}
          subUsuarioModulosGroups={subUsuarioModulosGroups}
          onSelectGroup={onSelectGroup}
          onSelectChild={onSelectChild}
          onNavigate={onNavigate}
        />
      </div>

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
