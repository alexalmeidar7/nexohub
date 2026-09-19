import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2, Users, Radio, MonitorPlay, Layers, Search, Sparkles,
  Plus, Music, ChevronRight, ExternalLink, Eye, EyeOff
} from "lucide-react";
import { getStoredMetadata } from "./ClientesPage";
import { fetchFinanceiroMRR } from "@/lib/financeiroService";
import { CLIENT_ACCOUNTS } from "@/lib/clientAuthAccounts";
import AdminDashboardSkeleton from "./skeletons/AdminDashboardSkeleton";
import AgoraNasRadiosWidget from "./AgoraNasRadiosWidget";
import { getInfoMusicRealCounts } from "./AdminInfoMusicPage";

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
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-black">
      <path d="M9 18V5l12-2v13" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="6" cy="18" r="3" fill="currentColor"/>
      <circle cx="18" cy="16" r="3" fill="currentColor"/>
      {/* Equalizer lines next to note */}
      <line x1="2" y1="7" x2="2" y2="13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <line x1="5" y1="9" x2="5" y2="11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

interface AdminClientsDashboardProps {
  onNavigate?: (page: any) => void;
}

async function fetchSuporteMessagesCount(): Promise<number> {
  // 1. Consulta chamados de suporte abertos
  try {
    const rawTickets = localStorage.getItem("nexohub_suporte_tickets_v1");
    if (rawTickets) {
      const tickets = JSON.parse(rawTickets);
      if (Array.isArray(tickets)) {
        const open = tickets.filter((t: any) => t.status !== "solucionado").length;
        if (open > 0) return open;
      }
    }
  } catch {}

  try {
    // 2. Consulta mensagens no Supabase com hashtag #suporte
    const { data: msgs, error } = await supabase
      .from("wa_messages")
      .select("id, body")
      .ilike("body", "%#suporte%");

    if (!error && msgs && msgs.length > 0) {
      return msgs.length;
    }
  } catch (err) {
    console.error("Erro ao buscar mensagens #suporte do Supabase:", err);
  }

  // 3. Consulta mensagens locais/demo do chatbot
  try {
    const rawDemo = localStorage.getItem("nexohub_chatbot_messages_v1");
    if (rawDemo) {
      const parsed = JSON.parse(rawDemo);
      let count = 0;
      if (Array.isArray(parsed)) {
        count = parsed.filter((m: any) => (m.body || "").toLowerCase().includes("#suporte")).length;
      } else if (typeof parsed === "object") {
        Object.values(parsed).forEach((list: any) => {
          if (Array.isArray(list)) {
            count += list.filter((m: any) => (m.body || "").toLowerCase().includes("#suporte")).length;
          }
        });
      }
      return count;
    }
  } catch {}

  // 4. Se não houver mensagens ou chamados, retorna 0
  return 0;
}

export default function AdminClientsDashboard({ onNavigate }: AdminClientsDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [clientes, setClientes] = useState<ClienteRow[]>([]);
  const [busca, setBusca] = useState("");
  const [totalInfoMusic, setTotalInfoMusic] = useState<number>(0);
  const [pendentesInfoMusic, setPendentesInfoMusic] = useState<number>(0);
  const [mrrFee, setMrrFee] = useState<number>(0);
  const [clientesAtivosCount, setClientesAtivosCount] = useState<number>(0);
  const [suporteAbertoCount, setSuporteAbertoCount] = useState<number>(0);
  const [showFeeValor, setShowFeeValor] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      try {
        const [empRes, profRes, subRes, cmRes, chanRes, logosRes] = await Promise.all([
          supabase.from("empresa_config")
            .select("user_id, nome, logo, plano, ativo, instagram_subs, youtube_subs, facebook_subs")
            .eq("ativo", true)
            .order("nome"),
          supabase.from("profiles").select("user_id, email"),
          supabase.from("sub_users").select("parent_user_id, ativo"),
          supabase.from("client_modules").select("user_id, enabled"),
          supabase.from("streaming_channels").select("id, user_id, name, type, active"),
          supabase.from("logos_patrocinadores")
            .select("id, user_id, nome, logo_url, ativo, created_at")
            .eq("excluido", false)
            .order("nome"),
        ]);

        // Carrega contagem real de Info Music diretamente da mesma base do House Mix > Info Music
        try {
          const infoStats = await getInfoMusicRealCounts();
          setTotalInfoMusic(infoStats.totalCadastradas);
          setPendentesInfoMusic(infoStats.pendentes);
        } catch (err) {
          console.warn("Erro ao carregar contagens de Info Music:", err);
        }

        // CARREGAR CLIENTES CADASTRADOS (Espelhando a mesma lógica de ClientesPage)
        const storedMeta = getStoredMetadata();
        const isUuid = (val: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test((val || "").trim());
        const seenNames = new Set<string>();
        const seenCnpjs = new Set<string>();
        let activeClientsFromCadastro = 0;

        // 1. Clientes de logos_patrocinadores
        (logosRes.data || []).forEach((item: any) => {
          let name = (item.nome || "").trim();
          if (!name) return;

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

          if (seenNames.has(upperName) || (cleanCnpj && seenCnpjs.has(cleanCnpj))) {
            return;
          }

          seenNames.add(upperName);
          if (cleanCnpj) seenCnpjs.add(cleanCnpj);

          const isAtivo = typeof meta.ativo === "boolean" ? meta.ativo : (item.ativo !== false);
          if (isAtivo) {
            activeClientsFromCadastro++;
          }
        });

        // 2. Clientes de empresa_config
        (empRes.data || []).forEach((emp: any) => {
          const name = (emp.nome || "").trim();
          if (!name || isUuid(name)) return;

          const upperName = name.toUpperCase();
          const meta = storedMeta[emp.user_id] || storedMeta[name] || storedMeta[upperName] || {};
          const cleanCnpj = (meta.cnpj || "").replace(/\D/g, "");

          if (seenNames.has(upperName) || (cleanCnpj && seenCnpjs.has(cleanCnpj))) {
            return;
          }

          seenNames.add(upperName);
          if (cleanCnpj) seenCnpjs.add(cleanCnpj);

          const isAtivo = typeof meta.ativo === "boolean" ? meta.ativo : (emp.ativo !== false);
          if (isAtivo) {
            activeClientsFromCadastro++;
          }
        });

        // 3. Clientes em storedMeta (incluindo clientes da agência)
        Object.keys(storedMeta).forEach(key => {
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

          if (meta.ativo !== false) {
            activeClientsFromCadastro++;
          }
        });

        setClientesAtivosCount(activeClientsFromCadastro);

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
        const seenUserIds = new Set<string>();
        const rows: ClienteRow[] = empresas.map(e => {
          seenUserIds.add(e.user_id);
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

        // Garantir que todas as emissoras do CLIENT_ACCOUNTS estejam listadas
        CLIENT_ACCOUNTS.forEach(acc => {
          if (acc.isAdmin || acc.isSubUser) return;
          if (seenUserIds.has(acc.id) || rows.some(r => r.nome.toUpperCase().includes(acc.nome.toUpperCase()) || acc.nome.toUpperCase().includes(r.nome.toUpperCase()))) {
            return;
          }
          seenUserIds.add(acc.id);
          const meus = canais.filter(c => c.user_id === acc.id && c.active);
          const override = localOverrides[acc.id] || localOverrides[acc.nome] || {};
          const isBasic = (acc.plano || "").toLowerCase().includes("basic") || acc.nome.toUpperCase().includes("NEXO BRASIL");
          const defaultProducts = isBasic ? ["house_mix"] : ["house_mix", "chatbot"];

          const clientPrice = override.valorMensal !== undefined ? override.valorMensal : (isBasic ? 590 : 890);
          sumMrr += clientPrice;

          rows.push({
            user_id: acc.id,
            nome: acc.nome,
            logo: null,
            plano: override.plano || acc.plano || "House Mix Nexo Max",
            subUsers: subCount.get(acc.id) || 1,
            modules: modCount.get(acc.id) || 12,
            canaisVideo: meus.filter(c => isVideo(c.type)).length || 1,
            canaisAudio: meus.filter(c => isAudio(c.type)).length || 1,
            social: (acc.audience?.redes) || (acc.audience?.instagram) || 100000,
            produtos: override.produtos || defaultProducts,
          });
        });

        setClientes(rows);

        // Obtém a contagem de mensagens de suporte aberto no chatbot
        try {
          const count = await fetchSuporteMessagesCount();
          setSuporteAbertoCount(count);
        } catch (err) {
          console.error("Erro ao obter contagem de suporte:", err);
        }

        // Obtém a receita mensal sincronizada exatamente com a página Financeiro
        try {
          const financeiroMrr = await fetchFinanceiroMRR();
          setMrrFee(financeiroMrr);
        } catch (err) {
          console.error("Erro ao obter MRR da página Financeiro:", err);
          if (sumMrr > 0) {
            setMrrFee(sumMrr);
          }
        }
      } finally {
        setLoading(false);
      }
    })();

    // Ouvinte em tempo real para sincronização quando a página Financeiro for atualizada
    const handleFinanceiroUpdate = async () => {
      try {
        const financeiroMrr = await fetchFinanceiroMRR();
        setMrrFee(financeiroMrr);
      } catch (err) {
        console.error("Erro ao sincronizar MRR financeiro:", err);
      }
    };

    // Ouvinte em tempo real para sincronização de mensagens de suporte (#suporte)
    const handleSuporteUpdate = async () => {
      try {
        const count = await fetchSuporteMessagesCount();
        setSuporteAbertoCount(count);
      } catch (err) {
        console.error("Erro ao sincronizar contagem de suporte:", err);
      }
    };

    // Canal Realtime para mensagens do chatbot
    const chSuporte = supabase
      .channel("dashboard-chatbot-suporte-sync")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_messages" },
        () => handleSuporteUpdate()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "wa_contacts" },
        () => handleSuporteUpdate()
      )
      .subscribe();

    window.addEventListener("nexo_financeiro_updated", handleFinanceiroUpdate);
    window.addEventListener("chatbot:unread_updated", handleSuporteUpdate);
    window.addEventListener("chatbot:suporte_updated", handleSuporteUpdate);
    window.addEventListener("storage", handleFinanceiroUpdate);
    window.addEventListener("storage", handleSuporteUpdate);

    return () => {
      supabase.removeChannel(chSuporte);
      window.removeEventListener("nexo_financeiro_updated", handleFinanceiroUpdate);
      window.removeEventListener("chatbot:unread_updated", handleSuporteUpdate);
      window.removeEventListener("chatbot:suporte_updated", handleSuporteUpdate);
      window.removeEventListener("storage", handleFinanceiroUpdate);
      window.removeEventListener("storage", handleSuporteUpdate);
    };
  }, []);

  if (loading) {
    return <AdminDashboardSkeleton />;
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto animate-fade-in font-sans pb-12">
      {/* 1. RESUMO GERAL BANNER (Living Aurora Ambient Lights) */}
      <div className="relative rounded-3xl p-6 lg:p-8 bg-[#080a11] text-white shadow-2xl overflow-hidden border border-white/[0.12]">
        {/* Animated Ambient Lights System */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden select-none">
          {/* Subtle top and side vignette to guarantee contrast on title and text */}
          <div className="absolute inset-0 bg-gradient-to-b from-[#080a11] via-[#080a11]/75 to-transparent z-[2]" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#080a11]/80 via-transparent to-[#080a11]/80 z-[2]" />

          {/* Light 1: Primary Swelling Blue Core (breathing & pulsing stronger periodically) */}
          <div 
            className="superadmin-light-core absolute -bottom-32 left-1/2 -translate-x-1/2 w-[120%] h-64 rounded-[100%] bg-gradient-to-t from-[#0055ff] via-[#003db8]/70 to-transparent pointer-events-none"
          />

          {/* Light 2: Radiant Cyan Wave (gives that crisp luminous glow) */}
          <div 
            className="superadmin-light-cyan absolute -bottom-24 left-1/4 w-[85%] h-52 rounded-[100%] bg-gradient-to-t from-[#00d2ff]/65 via-[#0055ff]/45 to-transparent pointer-events-none"
          />

          {/* Light 3: Drifting Indigo/Violet Depth Orb (drifts across bottom) */}
          <div 
            className="superadmin-light-drift absolute -bottom-28 right-12 w-[75%] h-56 rounded-full bg-gradient-to-t from-[#4f46e5]/55 via-[#2563eb]/35 to-transparent pointer-events-none"
          />

          {/* Light 4: Left Title Backlight Accent (subtle aura behind "resumo geral") */}
          <div 
            className="superadmin-light-accent absolute -bottom-16 -left-12 w-80 h-44 rounded-full bg-gradient-to-tr from-[#0055ff]/45 via-[#00d2ff]/25 to-transparent pointer-events-none"
          />

          {/* Glowing bottom line with animated light shimmer */}
          <div className="superadmin-light-border absolute bottom-0 inset-x-0 h-[2px] z-[3]" />
        </div>

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
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
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-xs font-semibold text-[#0055ff]">fee mensal</span>
                    <button
                      type="button"
                      onClick={() => setShowFeeValor(prev => !prev)}
                      className="text-white/40 hover:text-white transition-colors cursor-pointer p-0.5"
                      title={showFeeValor ? "Ocultar valor" : "Mostrar valor"}
                    >
                      {showFeeValor ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <MoneyStackIcon />
              </div>

              <div>
                <div className="flex items-center gap-2">
                  <div className="text-2xl font-thin tracking-tight select-none">
                    {showFeeValor ? (
                      (() => {
                        const formatted = mrrFee.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                        const [inteiro, centavos] = formatted.split(",");
                        return (
                          <>
                            R$ {inteiro}<sup className="text-xs font-thin">,{centavos}</sup>
                          </>
                        );
                      })()
                    ) : (
                      <span className="tracking-wider text-xl text-white/70 font-thin">R$ ******</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowFeeValor(prev => !prev)}
                    className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                    title={showFeeValor ? "Ocultar valor" : "Mostrar valor"}
                  >
                    {showFeeValor ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <div className="text-[10px] text-white/50 mt-1 flex items-center justify-between">
                  <span>clientes ativos: {clientesAtivosCount}</span>
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
                <div className="text-3xl font-extrabold tracking-tight text-white font-mono">
                  {String(suporteAbertoCount).padStart(2, "0")}
                </div>
              </div>

              {/* Blue plus button */}
              <button
                onClick={() => onNavigate?.("chatbot")}
                className="absolute bottom-3 right-3 w-5 h-5 rounded-full bg-[#0055ff] text-white flex items-center justify-center hover:scale-110 active:scale-95 transition-all shadow-sm cursor-pointer"
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

      {/* 2. LOWER SECTION: INFO MUSIC CARD + AGORA NAS RÁDIOS BOX */}
      <div className="flex items-start gap-5 flex-wrap lg:flex-nowrap w-full">
        {/* Card Info Music */}
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
              className="px-4 py-1.5 rounded-full bg-[#0047e1] text-white text-xs font-bold hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              infos pendentes: {pendentesInfoMusic}
            </button>
          </div>
        </div>

        {/* Card Agora nas Rádios (Box preto dinâmico com rotação a cada 5 segundos) */}
        <AgoraNasRadiosWidget />
      </div>
    </div>
  );
}
