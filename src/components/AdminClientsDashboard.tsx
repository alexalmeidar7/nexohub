import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, Users, Radio, MonitorPlay, Layers, Search, Sparkles,
  DollarSign, MessageCircle, FileText, Music, ChevronRight, CheckCircle2,
  ExternalLink, ArrowUpRight
} from "lucide-react";

interface Empresa {
  user_id: string;
  nome: string | null;
  logo: string | null;
  plano: string | null;
  ativo: boolean;
  instagram_subs: number | null;
  youtube_subs: number | null;
  facebook_subs: number | null;
}

interface Canal {
  id: string;
  user_id: string;
  name: string;
  type: string;
  active: boolean;
}

interface ClienteRow {
  user_id: string;
  nome: string;
  logo: string | null;
  plano: string | null;
  subUsers: number;
  modules: number;
  canaisVideo: number;
  canaisAudio: number;
  social: number;
  produtos: string[];
}

const isVideo = (t?: string | null) => (t || "").toLowerCase().startsWith("video");
const isAudio = (t?: string | null) => (t || "").toLowerCase().startsWith("audio");

const compact = (n: number) =>
  n >= 1000 ? new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n) : String(n);

function KPI({ icon: Icon, label, value }: { icon: any; label: string; value: string | number }) {
  return (
    <div className="rounded-2xl bg-[#14161a] px-4 py-3.5 flex items-center gap-3.5 transition-all text-white">
      <div className="w-10 h-10 rounded-xl bg-black/40 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-[#9FCA1D]" />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-bold leading-none tabular-nums text-white">{value}</div>
        <div className="text-[11px] text-white/50 mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value, label }: { icon: any; value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-[#1a1d22]">
      <Icon className="w-3.5 h-3.5 text-white/40" />
      <div className="text-xs font-semibold leading-none tabular-nums text-white">{value}</div>
      <div className="text-[9px] text-white/40 leading-none">{label}</div>
    </div>
  );
}

interface AdminClientsDashboardProps {
  onNavigate?: (page: any) => void;
}

export default function AdminClientsDashboard({ onNavigate }: AdminClientsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [busca, setBusca] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<string>("all");

  useEffect(() => {
    (async () => {
      try {
        const [empRes, profRes, subRes, cmRes, chanRes] = await Promise.all([
          supabase.from("empresa_config")
            .select("user_id, nome, logo, plano, ativo, instagram_subs, youtube_subs, facebook_subs")
            .eq("ativo", true)
            .order("nome"),
          supabase.from("profiles").select("user_id, email"),
          supabase.from("sub_users").select("parent_user_id, ativo"),
          supabase.from("client_modules").select("user_id, enabled"),
          supabase.from("streaming_channels").select("id, user_id, name, type, active"),
        ]);

        const empresas = (empRes.data as Empresa[]) || [];
        const emails = new Map<string, string>();
        (profRes.data || []).forEach((p: any) => emails.set(p.user_id, p.email || ""));

        const subCount = new Map<string, number>();
        (subRes.data || []).forEach((s: any) => {
          if (s.ativo === false) return;
          subCount.set(s.parent_user_id, (subCount.get(s.parent_user_id) || 0) + 1);
        });

        const modCount = new Map<string, number>();
        (cmRes.data || []).forEach((m: any) => {
          if (!m.enabled) return;
          modCount.set(m.user_id, (modCount.get(m.user_id) || 0) + 1);
        });

        const canais = (chanRes.data as Canal[]) || [];

        // Check local subscriptions overrides if any
        let localOverrides: Record<string, any> = {};
        try {
          const saved = localStorage.getItem("nexo_superadmin_client_subs");
          if (saved) localOverrides = JSON.parse(saved);
        } catch { /* noop */ }

        const rows: ClienteRow[] = empresas.map(e => {
          const meus = canais.filter(c => c.user_id === e.user_id && c.active);
          const override = localOverrides[e.user_id] || {};
          const defaultProducts = ["house_mix"];
          if ((e.plano || "").toLowerCase().includes("max")) defaultProducts.push("chatbot");

          return {
            user_id: e.user_id,
            nome: e.nome || emails.get(e.user_id) || "Sem nome",
            logo: e.logo,
            plano: e.plano,
            subUsers: subCount.get(e.user_id) || 0,
            modules: modCount.get(e.user_id) || 0,
            canaisVideo: meus.filter(c => isVideo(c.type)).length,
            canaisAudio: meus.filter(c => isAudio(c.type)).length,
            social: (e.instagram_subs || 0) + (e.youtube_subs || 0) + (e.facebook_subs || 0),
            produtos: override.produtos || defaultProducts,
          };
        });

        setClientes(rows);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtrados = useMemo(() => {
    let list = clientes;
    if (selectedProduct !== "all") {
      list = list.filter(c => c.produtos.includes(selectedProduct));
    }
    const q = busca.trim().toLowerCase();
    if (!q) return list;
    return list.filter(c =>
      c.nome.toLowerCase().includes(q) || (c.plano || "").toLowerCase().includes(q));
  }, [clientes, busca, selectedProduct]);

  const totais = useMemo(() => ({
    clientes: clientes.length,
    video: clientes.reduce((a, c) => a + c.canaisVideo, 0),
    audio: clientes.reduce((a, c) => a + c.canaisAudio, 0),
    subs: clientes.reduce((a, c) => a + c.subUsers, 0),
  }), [clientes]);

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto animate-fade-in font-sans">
      {/* Top Header Bar (Flat design) */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-[#14161a] flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-[#9FCA1D]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-bold tracking-tight text-[#002132] leading-none">
                Painel Super Admin
              </h1>
              <span className="px-2 py-0.5 rounded-full bg-[#14161a] text-[#9FCA1D] text-[10px] font-bold">
                Gestão Geral
              </span>
            </div>
            <p className="text-xs text-[#002132]/60 mt-1">Clientes ativos e produtos da agência</p>
          </div>
        </div>

        {/* Search Bar (Rounded Flat) */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente ou pacote..."
            className="h-9 pl-9 pr-4 text-xs rounded-full bg-[#14161a] text-white placeholder-white/40 outline-none w-64 md:w-72"
          />
        </div>
      </div>

      {/* Agency Products Navigation & Quick Management */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-[11px] font-bold text-[#002132]/70 uppercase tracking-wider mr-2">
          Produtos da Agência:
        </span>
        
        {/* House Mix Hub button */}
        <button
          onClick={() => onNavigate?.("modulos")}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#14161a] text-white text-xs font-semibold hover:bg-[#1c2026] transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-[#00BFF0]" />
          <span>House Mix</span>
          <span className="text-[10px] text-white/40 bg-white/10 px-1.5 py-0.5 rounded-md">Módulos & Rádio</span>
        </button>

        {/* Financeiro button */}
        <button
          onClick={() => onNavigate?.("financeiro")}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#14161a] text-white text-xs font-semibold hover:bg-[#1c2026] transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Financeiro</span>
          <span className="text-[10px] text-emerald-400 bg-white/10 px-1.5 py-0.5 rounded-md">Cobranças & Packs</span>
        </button>

        {/* Chatbot button */}
        <button
          onClick={() => onNavigate?.("chatbot")}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#14161a] text-white text-xs font-semibold hover:bg-[#1c2026] transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-[#9FCA1D]" />
          <span>Chatbot</span>
          <span className="text-[10px] text-[#9FCA1D] bg-white/10 px-1.5 py-0.5 rounded-md">Atendimento IA</span>
        </button>

        {/* Orçamentos button */}
        <button
          onClick={() => onNavigate?.("propostas")}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#14161a] text-white text-xs font-semibold hover:bg-[#1c2026] transition-all"
        >
          <span className="w-2 h-2 rounded-full bg-[#A855F7]" />
          <span>Orçamentos</span>
          <span className="text-[10px] text-white/40 bg-white/10 px-1.5 py-0.5 rounded-md">E-mail & PDF</span>
        </button>

        {/* Subusuários */}
        <button
          onClick={() => onNavigate?.("subusuarios")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#14161a]/60 text-white/80 text-xs font-medium hover:bg-[#14161a] hover:text-white transition-all ml-auto"
        >
          <Users className="w-3.5 h-3.5 text-[#00BFF0]" /> Subusuários House Mix
        </button>

        {/* Info Music */}
        <button
          onClick={() => onNavigate?.("admininfomusic")}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#14161a]/60 text-white/80 text-xs font-medium hover:bg-[#14161a] hover:text-white transition-all"
        >
          <Music className="w-3.5 h-3.5 text-[#9FCA1D]" /> Info Music House Mix
        </button>
      </div>

      {/* 4 Main KPI Cards (Exact Flat Dark Box as in reference) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPI icon={Building2} label="Clientes ativos" value={totais.clientes} />
        <KPI icon={MonitorPlay} label="Canais de vídeo" value={totais.video} />
        <KPI icon={Radio} label="Canais de áudio" value={totais.audio} />
        <KPI icon={Users} label="Subusuários" value={totais.subs} />
      </div>

      {/* Clients Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-[#14161a] p-4 animate-pulse space-y-3">
              <div className="h-10 bg-white/5 rounded-xl" />
              <div className="h-8 bg-white/5 rounded-xl" />
              <div className="h-12 bg-white/5 rounded-xl" />
            </div>
          ))}
        </div>
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl bg-[#14161a] p-12 text-center text-sm text-white/50">
          Nenhum cliente ativo encontrado.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filtrados.map(c => (
            <div
              key={c.user_id}
              className="rounded-2xl bg-[#14161a] p-4 flex flex-col gap-3 text-white transition-all hover:bg-[#181b20]"
            >
              {/* Card Header: Logo, Name, Plan Badge, Active Dot */}
              <div className="flex items-center gap-3">
                {c.logo ? (
                  <img src={c.logo} alt={c.nome} className="w-11 h-11 rounded-xl object-contain bg-black/40 p-1 shrink-0" />
                ) : (
                  <div className="w-11 h-11 rounded-xl bg-black/40 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-white/40" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate leading-tight text-white">{c.nome}</div>
                  <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#8ba832]/20 text-[#9FCA1D] text-[10px] font-medium max-w-full">
                    <Layers className="w-3 h-3 shrink-0" />
                    <span className="truncate">{c.plano || "sem pacote"}</span>
                  </div>
                </div>
                {/* Active Indicator Dot */}
                <span className="shrink-0 w-2 h-2 rounded-full bg-[#9FCA1D]" />
              </div>

              {/* 4 Inner Metric Boxes */}
              <div className="grid grid-cols-4 gap-1.5">
                <Metric icon={Users} value={c.subUsers} label="subs" />
                <Metric icon={Radio} value={c.canaisAudio} label="áudio" />
                <Metric icon={MonitorPlay} value={c.canaisVideo} label="vídeo" />
                <Metric icon={Sparkles} value={compact(c.social)} label="social" />
              </div>

              {/* Card Footer: Modules + Shortcuts */}
              <div className="mt-auto pt-2 border-t border-white/5 flex items-center justify-between text-[11px] text-white/50">
                <span>{c.modules} módulos liberados</span>
                
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onNavigate?.("modulos")}
                    className="text-[10px] text-[#00BFF0] hover:underline"
                    title="Gerenciar módulos deste cliente"
                  >
                    Módulos
                  </button>
                  <span>•</span>
                  <button
                    onClick={() => onNavigate?.("financeiro")}
                    className="text-[10px] text-[#9FCA1D] hover:underline"
                    title="Cobrança e assinatura"
                  >
                    Financeiro
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
