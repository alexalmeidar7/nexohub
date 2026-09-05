import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, Users, Radio, MonitorPlay, Layers, Search, Sparkles,
  Plus, Music, ChevronRight, ExternalLink
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

function Metric({ icon: Icon, value, label }: { icon: any; value: string | number; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-2.5 rounded-xl bg-[#1a1d22]">
      <Icon className="w-3.5 h-3.5 text-white/40" />
      <div className="text-xs font-semibold leading-none tabular-nums text-white">{value}</div>
      <div className="text-[9px] text-white/40 leading-none">{label}</div>
    </div>
  );
}

// Icon for money stack from reference
function MoneyStackIcon() {
  return (
    <svg width="40" height="32" viewBox="0 0 48 38" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-white/40">
      <path d="M4 14l18-8 22 8-18 8-22-8z" />
      <path d="M4 21l18 8 22-8" />
      <path d="M4 28l18 8 22-8" />
      <circle cx="22" cy="14" r="3" fill="currentColor" fillOpacity="0.2" />
    </svg>
  );
}

// Icon for Info Music (Note + Equalizer lines) from reference
function MusicEqualizerIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" stroke="#000000" strokeWidth="2.4" strokeLinecap="round">
      <path d="M6 10h12" />
      <path d="M6 16h12" />
      <path d="M6 22h8" />
      <path d="M22 6v18a4 4 0 1 1-4-4h4" />
      <circle cx="18" cy="24" r="3.5" fill="#000000" />
    </svg>
  );
}

interface AdminClientsDashboardProps {
  onNavigate?: (page: any) => void;
}

export default function AdminClientsDashboard({ onNavigate }: AdminClientsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [busca, setBusca] = useState("");
  const [totalInfoMusic, setTotalInfoMusic] = useState<number>(7203);
  const [pendentesInfoMusic, setPendentesInfoMusic] = useState<number>(196);
  const [mrrFee, setMrrFee] = useState<number>(14000);

  useEffect(() => {
    (async () => {
      try {
        const [empRes, profRes, subRes, cmRes, chanRes, infoRes] = await Promise.all([
          supabase.from("empresa_config")
            .select("user_id, nome, logo, plano, ativo, instagram_subs, youtube_subs, facebook_subs")
            .eq("ativo", true)
            .order("nome"),
          supabase.from("profiles").select("user_id, email"),
          supabase.from("sub_users").select("parent_user_id, ativo"),
          supabase.from("client_modules").select("user_id, enabled"),
          supabase.from("streaming_channels").select("id, user_id, name, type, active"),
          supabase.from("infomusic").select("id", { count: "exact", head: true }),
        ]);

        if (infoRes.count && infoRes.count > 0) {
          setTotalInfoMusic(infoRes.count);
        }

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

        let sumMrr = 0;
        const rows: ClienteRow[] = empresas.map(e => {
          const meus = canais.filter(c => c.user_id === e.user_id && c.active);
          const override = localOverrides[e.user_id] || {};
          const defaultProducts = ["house_mix"];
          if ((e.plano || "").toLowerCase().includes("max")) defaultProducts.push("chatbot");

          const clientPrice = override.valorMensal !== undefined ? override.valorMensal : 1000;
          sumMrr += clientPrice;

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
        if (sumMrr > 0) {
          setMrrFee(sumMrr);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-fade-in font-sans pb-12">
      {/* 1. RESUMO GERAL BANNER (Matches media_1788614596625.png) */}
      <div className="rounded-3xl p-6 lg:p-8 bg-gradient-to-r from-[#090b10] via-[#0d1424] to-[#0038b8] text-white shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left: Section Title */}
          <div className="shrink-0">
            <h2 className="text-2xl lg:text-3xl font-black tracking-tight text-white leading-tight">
              resumo<br />geral
            </h2>
            <p className="text-xs text-white/60 font-light mt-2">
              visão geral da Nexo Brasil
            </p>
          </div>

          {/* Cards Row inside Banner */}
          <div className="flex flex-wrap items-center gap-4">
            {/* Card 1: Resumo Financeiro */}
            <div className="rounded-2xl bg-[#141720] p-5 text-white min-w-[250px] flex-1 sm:flex-initial flex flex-col justify-between h-36 relative shadow-inner">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-bold leading-tight">resumo</div>
                  <div className="text-xs font-bold leading-tight">financeiro</div>
                  <div className="text-xs font-semibold text-[#0055ff] mt-0.5">fee mensal</div>
                </div>
                <MoneyStackIcon />
              </div>

              <div>
                <div className="text-2xl font-extrabold tracking-tight">
                  R$ {mrrFee.toLocaleString("pt-BR")}<sup className="text-xs font-bold">,00</sup>
                </div>
                <div className="text-[10px] text-white/50 mt-1 flex items-center justify-between">
                  <span>clientes ativos: {clientes.length || 14}</span>
                </div>
              </div>

              {/* Blue plus button */}
              <button
                onClick={() => onNavigate?.("financeiro")}
                className="absolute bottom-3 right-3 w-5 h-5 rounded-full bg-[#0055ff] text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-sm"
                title="Ver Gestão Financeira"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* Card 2: Suporte Aberto */}
            <div className="rounded-2xl bg-[#141720] p-5 text-white min-w-[240px] flex-1 sm:flex-initial flex flex-col justify-between h-36 relative shadow-inner">
              <div>
                <div className="text-xs font-bold text-[#0055ff] leading-tight">suporte aberto</div>
                <div className="text-xs font-bold text-white leading-tight">para atendimento</div>
              </div>

              <div>
                <div className="text-3xl font-extrabold tracking-tight text-white">
                  02
                </div>
              </div>

              {/* Blue plus button */}
              <button
                onClick={() => onNavigate?.("chatbot")}
                className="absolute bottom-3 right-3 w-5 h-5 rounded-full bg-[#0055ff] text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-sm"
                title="Abrir Chatbot & Atendimento"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>

            {/* Card 3: Narrow plus action box */}
            <button
              onClick={() => onNavigate?.("clientes")}
              className="rounded-2xl bg-[#141720] text-white/60 hover:text-white hover:bg-[#1a1e2a] w-14 h-36 flex items-center justify-center transition-all shadow-inner"
              title="Cadastrar Novo Cliente"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. LOWER SECTION: INFO MUSIC CARD (Matches media_1788614596625.png) */}
      <div className="flex items-start">
        {/* Card Info Music (Exact match with reference) */}
        <div className="bg-white rounded-3xl p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/80 flex flex-col justify-between w-full sm:w-[320px] shrink-0 h-[280px]">
          <div>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-black text-black leading-tight">
                  info<br />music
                </h3>
                <p className="text-xs text-slate-400 font-medium mt-1">base de dados</p>
              </div>
              <MusicEqualizerIcon />
            </div>

            <div className="my-4">
              <div className="text-5xl font-black text-[#0047e1] tracking-tight">
                {totalInfoMusic.toLocaleString("pt-BR")}
              </div>
              <p className="text-xs text-slate-400 font-medium mt-1">infos cadastradas</p>
            </div>
          </div>

          <div>
            <button
              onClick={() => onNavigate?.("admininfomusic")}
              className="px-4 py-1.5 rounded-full bg-[#0047e1] text-white text-xs font-bold hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5"
            >
              infos pendentes: {pendentesInfoMusic}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
