import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Home, Sun, FileText, Mic2, PlaySquare, Music, CalendarDays, Settings, LogOut, Loader2, ShoppingBag, ChevronDown, ChevronUp, MessageSquareQuote, Tag, Image, ExternalLink, MonitorPlay, Heart, ShoppingCart, Film, Users, Newspaper, CloudSun, Wrench, Scissors, Menu, X, Monitor, Radio, Swords, HelpCircle } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import seloNexohub from "@/assets/selo-nexohub.png";
import logoMenu from "@/assets/logo-menu.png";
import logoFooter from "@/assets/logo-footer.png";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { useLayoutColors, defaultLayoutColors } from "@/hooks/useLayoutColors";
import { useGlobalMusicSync } from "@/hooks/useGlobalMusicSync";

// Lazy-load all tab pages for faster initial render
const ApresentadorForm = lazy(() => import("./ApresentadorForm"));
const ProgramaForm = lazy(() => import("./ProgramaForm"));
const PrevisaoTempo = lazy(() => import("./PrevisaoTempo"));
const RoteiroPrograma = lazy(() => import("./RoteiroPrograma"));
const WeatherWidget = lazy(() => import("./WeatherWidget"));
const OnAirWidget = lazy(() => import("./OnAirWidget"));
const MusicaNoAr = lazy(() => import("./MusicaNoAr"));
const AgendaPage = lazy(() => import("./AgendaPage"));
const MusicWidget = lazy(() => import("./MusicWidget"));
const XmlLinkRow = lazy(() => import("./XmlLinkRow"));
const ConfiguracoesPage = lazy(() => import("./ConfiguracoesPage"));
import { getEmpresaConfig } from "./ConfiguracoesPage";
import { getMusicData } from "@/lib/musicData";
const TestemunhaisPage = lazy(() => import("./TestemunhaisPage"));
const PromocoesPage = lazy(() => import("./PromocoesPage"));
const LogosPatrocinadoresPage = lazy(() => import("./LogosPatrocinadoresPage"));
const VideoPlayer = lazy(() => import("./VideoPlayer"));
const TopLikedSongs = lazy(() => import("./TopLikedSongs"));
const MusicasCurtidasPage = lazy(() => import("./MusicasCurtidasPage"));
const ShoppingPage = lazy(() => import("./ShoppingPage"));
const PreRollPage = lazy(() => import("./PreRollPage"));
const CortesVideoPage = lazy(() => import("./CortesVideoPage"));
const VmixPage = lazy(() => import("./VmixPage"));
const TeleprompterPage = lazy(() => import("./TeleprompterPage"));
const CustomizableDashboard = lazy(() => import("./CustomizableDashboard"));
const PropostasPage = lazy(() => import("./PropostasPage"));
const ConfigTelaPromoPage = lazy(() => import("./ConfigTelaPromoPage"));
const CenariosPage = lazy(() => import("./CenariosPage"));
const MessageNotification = lazy(() => import("./MessageNotification"));
const FansPage = lazy(() => import("./FansPage"));
const BroadcastPage = lazy(() => import("./BroadcastPage"));
const BatalhaMusicalPage = lazy(() => import("./BatalhaMusicalPage"));
const EnquetePage = lazy(() => import("./EnquetePage"));
const QuizPage = lazy(() => import("./QuizPage"));
const IntercomWidget = lazy(() => import("./IntercomWidget"));

import DashboardSkeleton from "./skeletons/DashboardSkeleton";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import BotsStatusBox from "./BotsStatusBox";

type Page = "dashboard" | "previsao" | "noticias" | "apresentadores" | "programas" | "musica" | "agenda" | "configuracoes" | "testemunhais" | "promocoes" | "logos" | "curtidas" | "shopping" | "preroll" | "cortevideo" | "playerconfig" | "vmix" | "propostas" | "tp" | "cenario" | "fans" | "configtelapromo" | "broadcast" | "batalha" | "enquete" | "quiz";

// Sidebar structured menu
interface MenuChild {
  icon: typeof Home;
  label: string;
  page: Page;
  separator?: boolean;
  permKey?: string;
}
interface MenuItem {
  icon: typeof Home;
  label: string;
  page?: Page;
  children?: MenuChild[];
}

const sidebarMenu: MenuItem[] = [
  { icon: Home, label: "home", page: "dashboard" },
  {
    icon: Users, label: "cadastros", children: [
      { icon: Mic2, label: "apresentadores", page: "apresentadores" },
      { icon: PlaySquare, label: "programas", page: "programas" },
      { icon: CloudSun, label: "cidade tempo", page: "previsao" },
    ]
  },
  { icon: FileText, label: "roteiro de programa", page: "noticias" },
  { icon: Music, label: "música no ar", page: "musica" },
  { icon: CalendarDays, label: "agenda", page: "agenda" },
  {
    icon: MonitorPlay, label: "player", children: [
      { icon: Settings, label: "configurações", page: "playerconfig" },
      { icon: Film, label: "anúncios", page: "preroll" },
      { icon: Heart, label: "fãs", page: "fans" },
      { icon: ExternalLink, label: "módulo externo", page: undefined as unknown as Page },
    ]
  },
  {
    icon: ShoppingBag, label: "comercial", children: [
      { icon: MessageSquareQuote, label: "citações", page: "testemunhais" },
      { icon: Tag, label: "promoções", page: "promocoes" },
      { icon: ExternalLink, label: "tela promo", page: undefined as unknown as Page, permKey: "telapromo" },
      { icon: Settings, label: "config tela promo", page: "configtelapromo", separator: true },
      { icon: ShoppingCart, label: "shopping", page: "shopping", separator: true },
      { icon: FileText, label: "propostas comerciais", page: "propostas" },
    ]
  },
  {
    icon: Monitor, label: "vmix", children: [
      { icon: Monitor, label: "vmix control", page: undefined as unknown as Page },
      { icon: Radio, label: "broadcast", page: "broadcast" },
      { icon: Image, label: "logos", page: "logos" },
      { icon: MonitorPlay, label: "cenários", page: "cenario" },
      { icon: Swords, label: "batalha musical", page: "batalha" },
      { icon: HelpCircle, label: "enquete", page: "enquete" },
      { icon: HelpCircle, label: "quiz", page: "quiz" },
    ]
  },
  {
    icon: Wrench, label: "ferramentas", children: [
      { icon: Scissors, label: "corte de vídeo", page: "cortevideo" },
      { icon: ExternalLink, label: "abrir TP externo", page: undefined as unknown as Page },
    ]
  },
];

// Map menu items to module keys for plan filtering
const menuToModuleKey: Record<string, string> = {
  "cadastros": "cadastros",
  "previsão do tempo": "previsao",
  "roteiro de programa": "noticias",
  "música no ar": "musica",
  "agenda": "agenda",
  "player": "player",
  "comercial": "comercial",
  "vmix": "vmix",
  "ferramentas": "ferramentas",
};

const pageTitle: Record<Page, string> = {
  dashboard: "Home",
  previsao: "Previsão do Tempo",
  noticias: "Roteiro de Programa",
  apresentadores: "Cadastro de Apresentadores",
  programas: "Cadastro de Programas",
  musica: "Música no Ar",
  agenda: "Agenda",
  curtidas: "Músicas Curtidas",
  configuracoes: "Configurações",
  testemunhais: "Comercial — Citações",
  promocoes: "Comercial — Promoções",
  logos: "Comercial — Logos Patrocinadores",
  shopping: "Comercial — Shopping",
  preroll: "Player — Anúncios",
  propostas: "Comercial — Propostas Comerciais",
  cortevideo: "Ferramentas — Cortes de Vídeo",
  tp: "Ferramentas — TP",
  playerconfig: "Player — Configurações",
  vmix: "vMix — Controle de Transmissão",
  cenario: "vMix — Cenários",
  broadcast: "vMix — Broadcast",
  fans: "Player — Fãs",
  configtelapromo: "Comercial — Config Tela Promo",
  batalha: "vMix — Batalha Musical",
  enquete: "vMix — Enquete",
  quiz: "vMix — Quiz",
};

interface DashboardProps {
  onLogout?: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const { user } = useAuth();
  const layoutColors = useLayoutColors();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const menuLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearMenuLeaveTimer = useCallback(() => {
    if (menuLeaveTimer.current) {
      clearTimeout(menuLeaveTimer.current);
      menuLeaveTimer.current = null;
    }
  }, []);
  const scheduleCloseMenu = useCallback(() => {
    clearMenuLeaveTimer();
    menuLeaveTimer.current = setTimeout(() => setHoveredMenu(null), 450);
  }, [clearMenuLeaveTimer]);
  const [noArCollapsed, setNoArCollapsed] = useState(false);
  const [empresa, setEmpresa] = useState<import("./ConfiguracoesPage").EmpresaConfig>({} as any);
  const [enabledModules, setEnabledModules] = useState<Set<string> | null>(null);
  const [planModules, setPlanModules] = useState<Set<string> | null>(null);
  const [subUserModules, setSubUserModules] = useState<Set<string> | null>(null); // null = not a sub-user
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null); // parent_user_id for sub-users
  const [parentEmail, setParentEmail] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [onAirThumb, setOnAirThumb] = useState<string | null>(null);
  const prevThumbRef = useRef<string | null>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [contentScrollProgress, setContentScrollProgress] = useState(0);
  const [showContentScrollIndicator, setShowContentScrollIndicator] = useState(false);

  useEffect(() => () => clearMenuLeaveTimer(), [clearMenuLeaveTimer]);

  // Helper: find current on-air program and fetch only its thumb
  const findCurrentOnAirThumb = useCallback(async (overrideUserId?: string) => {
    const uid = overrideUserId || effectiveUserId || user?.id;
    if (!uid) return null;
    const { data } = await supabase
      .from("programas")
      .select("id, dias_semana, horario_inicio, horario_fim")
      .eq("user_id", uid)
      .eq("ativo", true)
      .ilike("estudio", "%fm%");
    if (!data) return null;

    const now = new Date();
    const DIAS_MAP: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
    const diaAtual = DIAS_MAP[now.getDay()];
    const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const current = data.find((p: any) =>
      (p.dias_semana || []).includes(diaAtual) && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim
    );
    if (!current) return null;

    const { data: thumbData } = await supabase
      .from("programas")
      .select("thumb")
      .eq("id", current.id)
      .maybeSingle();
    if (thumbData?.thumb) return thumbData.thumb;
    return null;
  }, [user, effectiveUserId]);

  const updateContentScrollIndicator = useCallback(() => {
    const el = contentScrollRef.current;

    if (!el || currentPage === "dashboard") {
      setShowContentScrollIndicator(false);
      setContentScrollProgress(0);
      return;
    }

    const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0);

    if (maxScroll <= 4) {
      setShowContentScrollIndicator(false);
      setContentScrollProgress(0);
      return;
    }

    setShowContentScrollIndicator(true);
    setContentScrollProgress(Math.min(Math.max(el.scrollTop / maxScroll, 0), 1));
  }, [currentPage]);

  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;

    let frame = 0;
    const syncIndicator = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateContentScrollIndicator);
    };

    syncIndicator();

    el.addEventListener("scroll", syncIndicator, { passive: true });
    window.addEventListener("resize", syncIndicator);

    const resizeObserver = new ResizeObserver(syncIndicator);
    resizeObserver.observe(el);
    if (el.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(el.firstElementChild);
    }

    const mutationObserver = new MutationObserver(syncIndicator);
    mutationObserver.observe(el, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", syncIndicator);
      window.removeEventListener("resize", syncIndicator);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [currentPage, updateContentScrollIndicator]);

  // Single batched initial load — all queries in parallel (NO thumb in batch)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadAll = async () => {
      const [modulesRes, empresaRes, subUserRes] = await Promise.all([
        supabase.from("client_modules").select("module_key, enabled").eq("user_id", user.id),
        supabase.from("empresa_config").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("sub_users").select("allowed_modules, parent_user_id, ativo").eq("auth_user_id", user.id).maybeSingle(),
      ]);

      if (cancelled) return;

      // Check if this user is a sub-user
      if (subUserRes.data && subUserRes.data.ativo) {
        const parentId = subUserRes.data.parent_user_id;
        setSubUserModules(new Set(subUserRes.data.allowed_modules || []));
        setEffectiveUserId(parentId);
        // For sub-users, load the PARENT's modules and empresa config
        const [parentModulesRes, parentEmpresaRes, parentProfileRes] = await Promise.all([
          supabase.from("client_modules").select("module_key, enabled").eq("user_id", parentId),
          supabase.from("empresa_config").select("*").eq("user_id", parentId).maybeSingle(),
          supabase.from("profiles").select("email").eq("user_id", parentId).maybeSingle(),
        ]);
        if (cancelled) return;
        if (parentProfileRes.data?.email) setParentEmail(parentProfileRes.data.email);
        if (parentModulesRes.data && parentModulesRes.data.length > 0) {
          setEnabledModules(new Set(parentModulesRes.data.filter((m: any) => m.enabled).map((m: any) => m.module_key)));
        }
        const pd = parentEmpresaRes.data;
        if (pd) {
          const parentCfg = {
            nome: pd.nome || "", logo: pd.logo || "", backgroundUrl: pd.background_url || "",
            endereco: pd.endereco || "", telefoneComercial: pd.telefone_comercial || "",
            telefoneParticipacao: pd.telefone_participacao || "", site: pd.site || "",
            instagram: pd.instagram || "", facebook: pd.facebook || "", youtube: pd.youtube || "",
            plano: pd.plano || "",
          };
          setEmpresa(parentCfg);
          if (parentCfg.plano) {
            supabase.from("planos").select("enabled_modules").eq("name", parentCfg.plano).maybeSingle().then(({ data }) => {
              if (!cancelled && data?.enabled_modules) setPlanModules(new Set(data.enabled_modules));
            });
          }
          setInitialLoading(false);

          // Fetch thumb for sub-user using parent's data
          const thumb = await findCurrentOnAirThumb(parentId);
          if (!cancelled) {
            const finalThumb = thumb || parentCfg.backgroundUrl || null;
            prevThumbRef.current = finalThumb;
            setOnAirThumb(finalThumb);
          }
          return;
        }
      }

      // Modules
      if (modulesRes.data && modulesRes.data.length > 0) {
        setEnabledModules(new Set(modulesRes.data.filter((m: any) => m.enabled).map((m: any) => m.module_key)));
      }

      // Empresa config
      const d = empresaRes.data;
      const cfg = d ? {
        nome: d.nome || "", logo: d.logo || "", backgroundUrl: d.background_url || "",
        endereco: d.endereco || "", telefoneComercial: d.telefone_comercial || "",
        telefoneParticipacao: d.telefone_participacao || "", site: d.site || "",
        instagram: d.instagram || "", facebook: d.facebook || "", youtube: d.youtube || "",
        plano: d.plano || "",
      } : ({} as any);
      setEmpresa(cfg);

      // Plan modules — fire and forget
      if (cfg.plano) {
        supabase.from("planos").select("enabled_modules").eq("name", cfg.plano).maybeSingle().then(({ data }) => {
          if (!cancelled && data?.enabled_modules) setPlanModules(new Set(data.enabled_modules));
        });
      }

      setInitialLoading(false);

      // Fetch thumb AFTER initial load (non-blocking, only for current program)
      const thumb = await findCurrentOnAirThumb();
      if (!cancelled) {
        // Fallback: use empresa background image if no program thumb
        const finalThumb = thumb || cfg.backgroundUrl || null;
        prevThumbRef.current = finalThumb;
        setOnAirThumb(finalThumb);
      }
    };

    loadAll();
    return () => { cancelled = true; };
  }, [user, findCurrentOnAirThumb]);

  // Poll on-air thumb every 30s (lightweight: no base64 in batch)
  useEffect(() => {
    if (!user || initialLoading) return;
    const poll = async () => {
      const thumb = await findCurrentOnAirThumb();
      if (thumb !== prevThumbRef.current) {
        prevThumbRef.current = thumb;
        setOnAirThumb(thumb);
      }
    };
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [user, initialLoading, findCurrentOnAirThumb]);

  const isModuleEnabled = (page: Page): boolean => {
    // Pages that are always accessible regardless of plan
    if (page === "dashboard") return true;

    // Sub-users: only allow modules explicitly assigned + always-accessible pages
    if (subUserModules !== null) {
      if (page === "configuracoes") return false;
      // Granular check: the page key itself is stored in allowed_modules
      return subUserModules.has(page);
    }

    // Normal user flow
    if (
      page === "configuracoes" ||
      page === "playerconfig" ||
      page === "cortevideo" ||
      page === "tp" ||
      page === "fans" ||
      page === "apresentadores" ||
      page === "programas" ||
      page === "previsao"
    ) {
      return true;
    }

    const modulesSource = planModules ?? enabledModules;
    if (!modulesSource) return true;

    if (page === "testemunhais" || page === "promocoes" || page === "configtelapromo" || page === "logos" || page === "preroll" || page === "shopping" || page === "propostas") {
      return modulesSource.has("comercial");
    }

    if (page === "cenario" || page === "vmix" || page === "broadcast" || page === "batalha" || page === "enquete" || page === "quiz") {
      return modulesSource.has("vmix");
    }

    return modulesSource.has(page);
  };

  useEffect(() => {
    if (
      currentPage !== "dashboard" &&
      currentPage !== "configuracoes" &&
      currentPage !== "playerconfig" &&
      currentPage !== "fans" &&
      
      !isModuleEnabled(currentPage)
    ) {
      setCurrentPage("dashboard");
    }
  }, [currentPage, enabledModules, planModules]);

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.children) {
      toggleMenu(item.label);
    } else if (item.page) {
      setCurrentPage(item.page);
      setMobileMenuOpen(false);
      setHoveredMenu(null);
    }
  };

  const handleChildClick = (child: { label: string; page?: Page }, parentLabel: string) => {
    if (parentLabel === "player" && child.label === "módulo externo") {
      const email = parentEmail || user?.email || "";
      const slug = email.split("@")[0] || "";
      window.open(`/user/${slug}/nexohub/player`, "_blank");
      setHoveredMenu(null);
      return;
    }
    if ((parentLabel === "ferramentas" || parentLabel === "comercial") && child.label === "tela promo") {
      const email = parentEmail || user?.email || "";
      const slug = email.split("@")[0] || "";
      window.open(`/user/${slug}/nexohub/telapromo`, "_blank");
      setHoveredMenu(null);
      return;
    }
    if (parentLabel === "ferramentas" && child.label === "abrir TP externo") {
      window.open("/tp-externo", "_blank");
      setHoveredMenu(null);
      return;
    }
    if (parentLabel === "vmix" && child.label === "vmix control") {
      window.open("/vmix-control", "_blank");
      setHoveredMenu(null);
      return;
    }
    if (child.page) {
      setCurrentPage(child.page);
      setMobileMenuOpen(false);
      setHoveredMenu(null);
    }
  };

  const isItemActive = (item: MenuItem): boolean => {
    if (item.page === currentPage) return true;
    if (item.children) return item.children.some(c => c.page === currentPage);
    return false;
  };

  // Auto-expand parent when child is active
  useEffect(() => {
    sidebarMenu.forEach(item => {
      if (item.children?.some(c => c.page === currentPage)) {
        setExpandedMenus(prev => new Set(prev).add(item.label));
      }
    });
  }, [currentPage]);

  if (initialLoading) {
    return <DashboardSkeleton />;
  }

  // Determine the base background from layout settings
  const layoutBg = (() => {
    if (layoutColors.homeBgType === "image" && layoutColors.homeBgImage) {
      return { backgroundImage: `url(${layoutColors.homeBgImage})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" } as React.CSSProperties;
    }
    if (layoutColors.homeBgColor && layoutColors.homeBgColor !== defaultLayoutColors.homeBgColor) {
      return { background: `linear-gradient(135deg, ${layoutColors.homeBgColor} 0%, #000000 100%)` } as React.CSSProperties;
    }
    // Default: grayscale gradient
    return { background: "linear-gradient(135deg, #333333 0%, #000000 100%)" } as React.CSSProperties;
  })();

  const isDashboard = currentPage === "dashboard";
 
  return (
    <div className="h-screen flex animate-fade-in overflow-hidden relative" style={{ backgroundColor: layoutColors.pageBg }}>
      <DashboardRuntimeEffects pauseMusicSync={currentPage === "musica"} />

      {/* Background layers (full page, behind sidebar) */}
      {isDashboard && (
        <>
          <div
            className="absolute inset-0 z-0 transition-opacity duration-1000"
            style={{ ...layoutBg, opacity: onAirThumb ? 0 : 1 }}
          />
          {onAirThumb && (
            <div
              key={onAirThumb}
              className="absolute inset-0 z-0 animate-fade-in"
              style={{
                backgroundImage: `url(${onAirThumb})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
              }}
            />
          )}
          <div className="absolute inset-0 z-0" style={{ background: "rgba(0,0,0,0.3)" }} />
        </>
      )}

      {/* ===== LEFT SIDEBAR (desktop) ===== */}
      <div className="hidden lg:flex flex-shrink-0 z-[60] items-stretch py-3 pl-3 overflow-visible">
        <aside
          className="flex flex-col items-center py-4 gap-2 rounded-2xl relative overflow-visible"
          style={{
            width: "58px",
            backgroundColor: layoutColors.navBg,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          }}
        >

        <div className="flex-1 flex flex-col items-center gap-1 px-1 overflow-visible">
          {sidebarMenu.filter(item => {
            // Sub-user: only show menus for allowed modules
            if (subUserModules !== null) {
              if (item.label === "home") return true;
              // For items with children, show if any child page is allowed
              if (item.children) {
                return item.children.some(c => (c.permKey && subUserModules.has(c.permKey)) || (c.page && subUserModules.has(c.page)));
              }
              // For standalone items, check the page directly
              return item.page ? subUserModules.has(item.page) : false;
            }
            if (item.label === "home" || item.label === "cadastros" || item.label === "ferramentas") return true;
            const modKey = menuToModuleKey[item.label];
            if (!modKey) return true;
            if (planModules) return planModules.has(modKey);
            if (enabledModules) return enabledModules.has(modKey);
            return true;
          }).map((item) => {
            const active = isItemActive(item);
            const Icon = item.icon;
            const isOpen = hoveredMenu === item.label;

            return (
              <div
                key={item.label}
                className="relative"
                onMouseEnter={() => {
                  clearMenuLeaveTimer();
                  if (item.children) setHoveredMenu(item.label);
                }}
                onMouseLeave={scheduleCloseMenu}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        if (item.children) {
                          setHoveredMenu(prev => prev === item.label ? null : item.label);
                        } else if (item.page) {
                          setCurrentPage(item.page);
                        }
                      }}
                      className="w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        backgroundColor: active ? layoutColors.accentColor : "transparent",
                      }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = `${layoutColors.navText}1a`; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      <Icon size={18} style={{ color: active ? layoutColors.navText : `${layoutColors.navText}99` }} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right"><p className="text-xs capitalize">{item.label}</p></TooltipContent>
                </Tooltip>

                {/* Sidebar flyout submenu */}
                {item.children && isOpen && (
                  <div
                    className="absolute left-full top-0 ml-2 z-[70] animate-in fade-in slide-in-from-left-2 duration-200"
                    onMouseEnter={clearMenuLeaveTimer}
                    onMouseLeave={scheduleCloseMenu}
                  >
                    <div
                      className="rounded-2xl py-2 min-w-[190px]"
                      style={{
                        backgroundColor: layoutColors.navBg,
                        border: `1px solid ${layoutColors.borderColor}33`,
                        boxShadow: "0 16px 48px rgba(0,0,0,0.3)",
                      }}
                    >
                      <p className="px-4 pb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: `${layoutColors.navText}66` }}>{item.label}</p>
                      {(subUserModules !== null ? item.children.filter(c => c.permKey ? subUserModules.has(c.permKey) : (!c.page || subUserModules.has(c.page))) : item.children).map((child, ci) => {
                        const ChildIcon = child.icon;
                        const childActive = currentPage === child.page;
                        return (
                          <div key={child.label} className="animate-in fade-in slide-in-from-left-1" style={{ animationDelay: `${ci * 30}ms`, animationFillMode: "both" }}>
                            {child.separator && ci > 0 && (
                              <div className="mx-3 my-1" style={{ borderTop: `1px solid ${layoutColors.navText}15` }} />
                            )}
                            <button
                              onClick={() => handleChildClick(child, item.label)}
                              className="w-full text-left px-4 py-2 text-xs flex items-center gap-2 transition-all"
                              style={{ color: childActive ? layoutColors.accentColor : `${layoutColors.navText}cc` }}
                              onMouseEnter={e => { e.currentTarget.style.backgroundColor = `${layoutColors.navText}0d`; e.currentTarget.style.color = layoutColors.accentColor; }}
                              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = childActive ? layoutColors.accentColor : `${layoutColors.navText}cc`; }}
                            >
                              <ChildIcon size={13} />
                              <span>{child.label}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex flex-col items-center gap-2 mt-auto pb-2">
          <Suspense fallback={<div className="w-10 h-10" />}>
            <MessageNotification />
          </Suspense>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCurrentPage("configuracoes")}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{ color: `${layoutColors.navText}80` }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${layoutColors.navText}1a`; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <Settings size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right"><p className="text-xs">Configurações</p></TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onLogout}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                style={{ color: layoutColors.accentColor }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${layoutColors.navText}1a`; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <LogOut size={18} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right"><p className="text-xs">Sair</p></TooltipContent>
          </Tooltip>
        </div>
        </aside>
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative z-[1]">

        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 pt-3 pb-2 relative z-[1]">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
            {mobileMenuOpen ? <X size={20} className="text-white" /> : <Menu size={20} className="text-white" />}
          </button>
          <h1 className="font-bold text-lg truncate flex-1 ml-3" style={{ color: isDashboard ? layoutColors.navText : layoutColors.pageText }}>{empresa.nome || "Dashboard"}</h1>
          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all mr-2"
            style={{ backgroundColor: `${layoutColors.accentColor}26`, color: layoutColors.accentColor }}
          >
            <LogOut size={10} /> Sair
          </button>
          <ServerClock />
        </div>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="w-[280px] flex flex-col h-full overflow-y-auto" style={{ backgroundColor: layoutColors.navBg }}>
              <div className="flex items-center justify-between px-4 pt-3 pb-2">
                <img src={seloNexohub} alt="NexoHUB" className="h-4" />
                <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-full" style={{ backgroundColor: layoutColors.buttonBg }}>
                  <X size={16} className="text-white" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 py-2">
                {sidebarMenu.filter(item => {
                  if (subUserModules !== null) {
                    if (item.label === "home") return true;
                    if (item.children) {
                      return item.children.some(c => (c.permKey && subUserModules.has(c.permKey)) || (c.page && subUserModules.has(c.page)));
                    }
                    return item.page ? subUserModules.has(item.page) : false;
                  }
                  if (item.label === "home" || item.label === "cadastros" || item.label === "ferramentas") return true;
                  const modKey = menuToModuleKey[item.label];
                  if (!modKey) return true;
                  if (planModules) return planModules.has(modKey);
                  if (enabledModules) return enabledModules.has(modKey);
                  return true;
                }).map(item => {
                  const Icon = item.icon;
                  const active = isItemActive(item);
                  const expanded = expandedMenus.has(item.label);
                  return (
                    <div key={item.label}>
                      <button onClick={() => handleMenuClick(item)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs transition-all"
                        style={{ color: active ? layoutColors.accentColor : `${layoutColors.navText}cc`, backgroundColor: active ? `${layoutColors.accentColor}1a` : "transparent" }}
                      >
                        <Icon size={16} />
                        <span className="flex-1 text-left capitalize">{item.label}</span>
                        {item.children && (expanded ? <ChevronUp size={12} style={{ color: `${layoutColors.navText}40` }} /> : <ChevronDown size={12} style={{ color: `${layoutColors.navText}40` }} />)}
                      </button>
                      {item.children && expanded && (
                        <div className="ml-6 space-y-0.5 mt-0.5">
                          {(subUserModules !== null ? item.children.filter(c => c.permKey ? subUserModules.has(c.permKey) : (!c.page || subUserModules.has(c.page))) : item.children).map(child => {
                            const ChildIcon = child.icon;
                            const childActive = currentPage === child.page;
                            return (
                              <button key={child.label} onClick={() => handleChildClick(child, item.label)}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] transition-all"
                                style={{ color: childActive ? layoutColors.accentColor : `${layoutColors.navText}99` }}
                              >
                                <ChildIcon size={12} />
                                <span>{child.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
              <div className="px-4 py-4" style={{ borderTop: `1px solid ${layoutColors.borderColor}1a` }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: layoutColors.buttonBg, color: layoutColors.buttonText }}>
                    {empresa.nome ? empresa.nome.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate" style={{ color: layoutColors.navText }}>{empresa.nome || "Empresa"}</p>
                    <button onClick={onLogout} className="text-[10px] underline hover:opacity-70 mt-0.5" style={{ color: layoutColors.accentColor }}>sair</button>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
          </div>
        )}

        {/* ===== TOP HEADER BAR (desktop) ===== */}
        <div className="hidden lg:flex items-center justify-between px-8 pt-6 pb-2 relative z-[10]">
          <div className="flex items-center gap-4">
            <img src={logoMenu} alt="NexoHUB" className="h-10 w-auto" style={{ filter: (() => {
              const bg = layoutColors.pageBg?.toLowerCase() || "#ffffff";
              const m = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
              const isLight = bg === "#ffffff" || bg === "#fff" || bg === "white" || (m ? (parseInt(m[1],16)*0.299 + parseInt(m[2],16)*0.587 + parseInt(m[3],16)*0.114) > 186 : false);
              return isLight ? "grayscale(1) brightness(0.75) opacity(0.6)" : "none";
            })() }} />
            <div>
              {!isDashboard && (
                <p className="text-xs font-medium tracking-widest uppercase mb-0.5" style={{ color: layoutColors.accentColor }}>
                  {pageTitle[currentPage]}
                </p>
              )}
              <h1 className="text-2xl font-light" style={{ color: isDashboard ? layoutColors.navText : layoutColors.pageText }}>
                {empresa.nome || "NexoHUB"}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ServerClock />
          </div>
        </div>

        {/* ===== MAIN CONTENT AREA ===== */}
        <div className="flex-1 min-h-0 px-3 lg:px-6 pb-4 relative z-[1]">
          {currentPage !== "dashboard" && (
            <div className="flex items-center gap-3 mb-4 ml-1">
              <button
                onClick={() => setCurrentPage("dashboard")}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
                style={{
                  backgroundColor: `${layoutColors.accentColor}15`,
                  color: layoutColors.accentColor,
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = `${layoutColors.accentColor}25`; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = `${layoutColors.accentColor}15`; }}
              >
                <ChevronDown className="rotate-90" size={14} />
                <span>Voltar</span>
              </button>
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold opacity-30 select-none" style={{ color: layoutColors.pageText }}>
                <span>Home</span>
                <span className="opacity-50">/</span>
                <span style={{ color: layoutColors.accentColor, opacity: 1 }}>{pageTitle[currentPage]}</span>
              </div>
            </div>
          )}
          <div className="relative flex-1 h-full">
            <div ref={contentScrollRef} className={`flex-1 h-full overflow-y-auto overflow-x-hidden rounded-2xl ${currentPage !== "dashboard" ? "mv-content-area" : ""}`} style={currentPage === "dashboard" ? {} : { padding: "1.25rem" }}>
            <Suspense fallback={<ModulePageSkeleton />}>
              {currentPage === "dashboard" && <CustomizableDashboard onNavigate={setCurrentPage} />}
              {currentPage === "previsao" && <PrevisaoTempo />}
              {currentPage === "noticias" && <RoteiroPrograma />}
              {currentPage === "apresentadores" && <ApresentadorForm />}
              {currentPage === "programas" && <ProgramaForm />}
              {/* MusicaNoAr stays mounted in background so local-XML upload to storage keeps running while user navigates other pages */}
              <div style={{ display: currentPage === "musica" ? "block" : "none" }}>
                <MusicaNoAr effectiveUserId={effectiveUserId} />
              </div>
              {currentPage === "agenda" && <AgendaPage />}
              {currentPage === "curtidas" && <MusicasCurtidasPage />}
              {currentPage === "configuracoes" && <ConfiguracoesPage section="empresa" />}
              {currentPage === "playerconfig" && <ConfiguracoesPage section="player" />}
              {currentPage === "testemunhais" && <TestemunhaisPage effectiveUserId={effectiveUserId} />}
              {currentPage === "promocoes" && <PromocoesPage effectiveUserId={effectiveUserId} />}
              {currentPage === "configtelapromo" && <ConfigTelaPromoPage />}
              {currentPage === "logos" && <LogosPatrocinadoresPage effectiveUserId={effectiveUserId} />}
              {currentPage === "shopping" && <ShoppingPage />}
              {currentPage === "preroll" && <PreRollPage />}
              {currentPage === "cortevideo" && <CortesVideoPage />}
              {currentPage === "vmix" && <VmixPage />}
              {currentPage === "propostas" && <PropostasPage />}
              {currentPage === "tp" && <TeleprompterPage />}
              {currentPage === "cenario" && <CenariosPage />}
              {currentPage === "broadcast" && <BroadcastPage />}
              {currentPage === "batalha" && <BatalhaMusicalPage />}
              {currentPage === "enquete" && <EnquetePage />}
              {currentPage === "quiz" && <QuizPage />}
              {currentPage === "fans" && <FansPage radioName={empresa?.nome || undefined} />}
              
            </Suspense>
            </div>
            {currentPage !== "dashboard" && showContentScrollIndicator && (
              <div
                className="absolute inset-y-4 right-1 z-20 flex items-stretch"
                style={{ width: "14px", cursor: "pointer", pointerEvents: "auto" }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const track = e.currentTarget;
                  const rect = track.getBoundingClientRect();
                  const scrollEl = contentScrollRef.current;
                  if (!scrollEl) return;
                  const setScrollFromY = (clientY: number) => {
                    const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
                    scrollEl.scrollTop = ratio * (scrollEl.scrollHeight - scrollEl.clientHeight);
                  };
                  setScrollFromY(e.clientY);
                  const onMove = (ev: MouseEvent) => { ev.preventDefault(); setScrollFromY(ev.clientY); };
                  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              >
                <div className="relative h-full w-full flex items-stretch justify-center">
                  <div
                    className="absolute top-0 bottom-0 w-[2px]"
                    style={{ background: "color-mix(in srgb, var(--layout-page-text, hsl(var(--background))) 25%, transparent)", borderRadius: "1px" }}
                  />
                  <div
                    className="absolute transition-[top] duration-100 hover:scale-110"
                    style={{
                      width: "8px",
                      height: "28px",
                      borderRadius: "4px",
                      top: `clamp(0px, calc(${contentScrollProgress * 100}% - 14px), calc(100% - 28px))`,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--layout-accent-color, hsl(var(--destructive)))",
                      boxShadow: "0 1px 6px rgba(0,0,0,0.3)",
                      cursor: "grab",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-center gap-2 px-4 pb-3 pt-1 relative z-[1]">
          <img src={logoFooter} alt="Nexo" className="h-4" style={{ opacity: 0.5, filter: (() => {
            const bg = layoutColors.pageBg?.toLowerCase() || "#ffffff";
            const isLight = bg === "#ffffff" || bg === "#fff" || bg === "white" || (() => {
              const m = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
              if (!m) return false;
              const lum = (parseInt(m[1],16)*0.299 + parseInt(m[2],16)*0.587 + parseInt(m[3],16)*0.114);
              return lum > 186;
            })();
            return isLight ? "grayscale(1) brightness(0.85) opacity(0.5)" : isDashboard ? "none" : "brightness(0) opacity(0.4)";
          })() }} />
          <span className="text-[9px]" style={{ color: `${isDashboard ? layoutColors.navText : layoutColors.pageText}66` }}>© 2026 Todos os direitos reservados.</span>
        </footer>
      </div>

      {subUserModules === null && isDashboard && (
        <>
          <Suspense fallback={null}><IntercomWidget /></Suspense>
          <BotsStatusBox />
        </>
      )}
    </div>
  );
}

function DashboardRuntimeEffects({ pauseMusicSync = false }: { pauseMusicSync?: boolean }) {
  useGlobalMusicXmlUpload();
  useGlobalMusicSync(!pauseMusicSync);
  return null;
}

/* ========== DASHBOARD HOME ========== */
const WIDGETS_ORDER_KEY = "masterview_widgets_order";

interface WidgetCard {
  id: string;
  bg: string;
  render: (onNavigate: (page: Page) => void) => React.ReactNode;
}

const defaultWidgets: WidgetCard[] = [
  { id: "weather", bg: "glass", render: (nav) => <WeatherWidget onNavigate={nav} /> },
  { id: "top10", bg: "glass", render: () => <TopLikedSongs /> },
  { id: "agenda", bg: "glass", render: () => <DashboardAgenda /> },
  { id: "noar", bg: "glass-dark", render: () => <OnAirWidget /> },
  { id: "comercial", bg: "glass", render: () => <ComercialWidgets /> },
];

function DashboardHome({ empresa, onNavigate }: { empresa: import("./ConfiguracoesPage").EmpresaConfig; onNavigate: (page: Page) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(WIDGETS_ORDER_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return defaultWidgets.map(w => w.id);
  });
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const orderedWidgets = widgetOrder
    .map(id => defaultWidgets.find(w => w.id === id))
    .filter(Boolean) as WidgetCard[];

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== draggedId) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const newOrder = [...widgetOrder];
    const fromIdx = newOrder.indexOf(draggedId);
    const toIdx = newOrder.indexOf(targetId);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedId);
    setWidgetOrder(newOrder);
    localStorage.setItem(WIDGETS_ORDER_KEY, JSON.stringify(newOrder));
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  // Proximity scroll: smooth scroll when mouse near edges
  const scrollAnimRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const edgeZone = 80; // px from edge to trigger scroll

    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }

    let speed = 0;
    if (x < edgeZone) {
      speed = -((edgeZone - x) / edgeZone) * 8;
    } else if (x > rect.width - edgeZone) {
      speed = ((x - (rect.width - edgeZone)) / edgeZone) * 8;
    }

    if (speed !== 0) {
      const tick = () => {
        if (container) {
          container.scrollLeft += speed;
          scrollAnimRef.current = requestAnimationFrame(tick);
        }
      };
      scrollAnimRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className="animate-fade-in flex gap-3 overflow-x-auto scrollbar-hide h-[180px] lg:h-[225px]"
      style={{ scrollBehavior: "auto" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {orderedWidgets.map(widget => (
         <div
          key={widget.id}
          className={`dashboard-widget-card rounded-2xl p-3 lg:p-4 flex-shrink-0 overflow-hidden relative ${
             draggedId === widget.id ? "opacity-50 scale-95" : ""
          } ${dragOverId === widget.id ? "ring-2" : ""}`}
           style={{
             background: widget.bg === "glass-dark"
               ? "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 55%, transparent)"
               : "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 18%, transparent)",
             backdropFilter: "blur(32px) saturate(1.6)",
             WebkitBackdropFilter: "blur(32px) saturate(1.6)",
             boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1)",
             border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)",
             borderRadius: "20px",
           }}
          onDragOver={(e) => handleDragOver(e, widget.id)}
          onDrop={(e) => handleDrop(e, widget.id)}
          onDragEnd={handleDragEnd}
        >
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, widget.id)}
            className="absolute top-0 left-0 right-0 h-[28px] z-10 cursor-grab active:cursor-grabbing"
          />
          <Suspense fallback={<Loader2 className="animate-spin text-gray-400" size={16} />}>
            {widget.render(onNavigate)}
          </Suspense>
        </div>
      ))}
    </div>
  );
}

const DashboardAgendaWithStyles = ({ onNavigate, feriadoHoje, selectedDate, dayEvents, eventDates, feriadoDates, calMonth, setCalMonth, setSelectedDate }: any) => (
  <div className="flex flex-col h-full w-full">
    <style>{`
      .dashboard-calendar .has-event-dot { position: relative; }
      .dashboard-calendar .has-event-dot::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 2px; height: 2px; background: var(--layout-accent-color, #2563eb); border-radius: 50%; }
      .dashboard-calendar .is-feriado-dot { position: relative; }
      .dashboard-calendar .is-feriado-dot::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 3px; height: 3px; background: #ef4444; border-radius: 50%; }
      .dashboard-calendar .rdp-day_today { border: 1px solid var(--layout-accent-color, #2563eb); font-weight: bold; }
    `}</style>
    <div className="flex items-center justify-between mb-2 shrink-0">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-bold" style={{ color: "var(--layout-widget-text, #ffffff)" }}>📅 Agenda {selectedDate && `— ${format(selectedDate, "dd/MM")}`}</p>
        {feriadoHoje && (
          <span className="text-[8px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-tighter animate-pulse shadow-sm shadow-red-500/50">
            Feriado
          </span>
        )}
      </div>
      <button
        onClick={() => onNavigate("agenda")}
        className="text-[10px] font-semibold hover:opacity-70 flex items-center gap-1"
        style={{ color: "var(--layout-widget-text, #ffffff)", opacity: 0.6 }}
      >
        ver tudo <ExternalLink size={10} />
      </button>
    </div>

    <div className="flex gap-2 flex-1 min-h-0">
      <div className="w-[105px] lg:w-[125px] shrink-0">
        <DashboardCalendar
          selected={selectedDate}
          onSelect={setSelectedDate}
          eventDates={eventDates}
          feriadoDates={feriadoDates}
          month={calMonth}
          onMonthChange={setCalMonth}
        />
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto pr-1 space-y-1.5 scrollbar-hide">
        {feriadoHoje && (
          <div className="p-1.5 rounded-lg bg-red-500/15 border border-red-500/30 mb-1">
            <div className="flex items-center gap-1">
              <Star size={9} className="text-red-500 fill-red-500" />
              <p className="text-[9px] font-black text-red-500 uppercase tracking-tight">Feriado Nacional</p>
            </div>
            <p className="text-[10px] font-bold text-red-400 leading-tight mt-0.5">{feriadoHoje}</p>
          </div>
        )}
        {dayEvents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30">
            <CalendarDays size={18} className="mb-1" style={{ color: "var(--layout-widget-text, #ffffff)" }} />
            <p className="text-[9px]" style={{ color: "var(--layout-widget-text, #ffffff)" }}>Vazio</p>
          </div>
        ) : (
          dayEvents.map((evt: any) => (
            <div
              key={evt.id}
              onClick={() => {
                sessionStorage.setItem("agenda_focus_event", evt.id);
                onNavigate("agenda");
              }}
              className="p-1.5 rounded-lg cursor-pointer transition-all hover:bg-white/10 active:scale-[0.98] border border-white/5"
              style={{
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <p className="text-[10px] font-bold truncate" style={{ color: "var(--layout-widget-text, #ffffff)" }}>{evt.programa?.nome}</p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[8px] opacity-60" style={{ color: "var(--layout-widget-text, #ffffff)" }}>
                  {evt.tipo_evento === "gravacao" ? `🎬 ${evt.horario_gravacao || ""}` : evt.programa?.horario_inicio}
                </span>
                <span className={`text-[7px] font-black px-1 rounded-sm ${evt.prioridade === "alta" ? "bg-red-500/30 text-red-400" : "bg-white/10 text-white/50"}`}>
                  {evt.prioridade?.toUpperCase()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
);

/* ========== SERVER CLOCK ========== */
function ServerClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const seconds = String(now.getSeconds()).padStart(2, "0");

  return (
    <div className="text-right">
      <span className="font-light tracking-wider inline-flex items-start" style={{ fontFamily: "Poppins, sans-serif", fontSize: "26px", lineHeight: 1.1, color: "var(--layout-nav-text, #ffffff)" }}>
        {hours}
        <span className="font-light inline-block" style={{ fontSize: "12px", width: "18px", textAlign: "left", marginTop: "2px", color: "var(--layout-nav-text, #ffffff)", opacity: 0.7 }}>{seconds}</span>
      </span>
    </div>
  );
}

/* ========== UNIFIED XML FIELD ========== */
const WEATHER_KEY = "masterview_last_city";

const weatherLabelsMap: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve", 75: "Neve forte",
  80: "Pancadas leves", 81: "Pancadas", 82: "Pancadas fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade severa",
};

function weatherCodeToWbIcon(code: number): string {
  const map: Record<number, string> = {
    0: "c01d", 1: "c02d", 2: "c02d", 3: "c04d",
    45: "a05d", 48: "a05d", 51: "d01d", 53: "d02d", 55: "d03d",
    61: "r01d", 63: "r02d", 65: "r03d", 71: "s01d", 73: "s02d", 75: "s03d",
    80: "r04d", 81: "r05d", 82: "r06d", 95: "t01d", 96: "t04d", 99: "t05d",
  };
  const codes = Object.keys(map).map(Number);
  const closest = codes.reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return map[closest] || "c01d";
}

function UnifiedXmlField() {
  const { user } = useAuth();
  const [xmlContent, setXmlContent] = useState("");

  useEffect(() => {
    const update = async () => {
      let weatherXml = "";
      let newsXml = "";
      let musicXml = "";

      const savedCity = localStorage.getItem(WEATHER_KEY);
      if (savedCity) {
        try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(savedCity)}&count=1&language=pt`);
          const geo = await geoRes.json();
          if (geo.results?.length) {
            const { latitude, longitude, name } = geo.results[0];
            const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=2`);
            const d = await wx.json();
            const wbIcon = weatherCodeToWbIcon(d.current.weather_code);
            const iconUrl = `https://www.weatherbit.io/static/img/icons/${wbIcon}.png`;
            const closestWc = Object.keys(weatherLabelsMap).map(Number).reduce((prev, curr) => (Math.abs(curr - d.current.weather_code) < Math.abs(prev - d.current.weather_code) ? curr : prev));
            const condLabel = weatherLabelsMap[closestWc] || "Desconhecido";
            let amanhaXml = "";
            if (d.daily.temperature_2m_min[1] != null) {
              const twCode = d.daily.weather_code[1] ?? 0;
              const twIcon = `https://www.weatherbit.io/static/img/icons/${weatherCodeToWbIcon(twCode)}.png`;
              const twClosest = Object.keys(weatherLabelsMap).map(Number).reduce((prev, curr) => (Math.abs(curr - twCode) < Math.abs(prev - twCode) ? curr : prev));
              const twLabel = weatherLabelsMap[twClosest] || "Desconhecido";
              amanhaXml = `\n    <amanha>\n      <temperatura_minima>${Math.round(d.daily.temperature_2m_min[1])}Cº</temperatura_minima>\n      <temperatura_maxima>${Math.round(d.daily.temperature_2m_max[1])}Cº</temperatura_maxima>\n      <url_imagem_icone>${twIcon}</url_imagem_icone>\n      <descricao_tempo>${twLabel}</descricao_tempo>\n    </amanha>`;
            }
            weatherXml = `  <tempo>\n    <cidade>${name}</cidade>\n    <temperatura>${Math.round(d.current.temperature_2m)}Cº</temperatura>\n    <descricao>${condLabel}</descricao>\n    <icone_url>${iconUrl}</icone_url>\n    <minima>${Math.round(d.daily.temperature_2m_min[0])}Cº</minima>\n    <maxima>${Math.round(d.daily.temperature_2m_max[0])}Cº</maxima>\n    <humidade>${d.current.relative_humidity_2m}%</humidade>\n    <precipitacao>${d.daily.precipitation_probability_max[0] ?? 0}%</precipitacao>${amanhaXml}\n  </tempo>`;
          }
        } catch {}
      }

      try {
        const [newsRes, cotRes] = await Promise.all([
          supabase.from("selected_news").select("*"),
          supabase.from("selected_cotacoes").select("*"),
        ]);
        const news = newsRes.data || [];
        const cots = cotRes.data || [];
        if (news.length || cots.length) {
          const nXml = news.map((n: any) => `    <noticia>\n      <titulo>${n.title?.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</titulo>\n      <imagem>${n.image_url || ""}</imagem>\n    </noticia>`).join("\n");
          const cXml = cots.map((c: any) => `    <cotacao>\n      <nome>${c.name}</nome>\n      <valor>${c.value}</valor>\n    </cotacao>`).join("\n");
          newsXml = `  <noticias>\n${nXml}\n${cXml}\n  </noticias>`;
        }
      } catch {}

      const m = getMusicData(user?.id);
      if (m) {
        musicXml = `  <musica_agora>\n    <titulo>${m.music.titulo}</titulo>\n    <interprete>${m.music.artista}</interprete>\n    <capa>${m.music.capa || ""}</capa>\n  </musica_agora>`;
      }

      const parts = [weatherXml, newsXml, musicXml].filter(Boolean);
      if (parts.length > 0) {
        setXmlContent(`<?xml version="1.0" encoding="UTF-8"?>\n<masterview>\n${parts.join("\n")}\n</masterview>`);
      } else {
        setXmlContent("");
      }
    };
    update();
    const interval = setInterval(update, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!xmlContent) return null;

  return (
    <div className="space-y-2">
      <XmlLinkRow label="XML MASTERVIEW" xmlContent={xmlContent} compact />
    </div>
  );
}

/* ========== HOOKS ========== */
function useGlobalMusicXmlUpload() {
  const { user } = useAuth();
  const lastContentRef = useRef<string>("");

  useEffect(() => {
    if (!user) return;

    const uploadMusicXml = async () => {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("music_xml_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!settings?.music_xml_url) return;

      try {
        const m = getMusicData(user.id);
        const titulo = m?.music?.titulo || "Sem titulo";
        const interprete = m?.music?.artista || "Desconhecido";
        let capa = m?.music?.capa || "";

        // If cover is a base64 data URI, upload it as .png and use the public URL
        if (capa.startsWith("data:image")) {
          try {
            const res = await fetch(capa);
            const blob = await res.blob();
            const pngBlob = new Blob([blob], { type: "image/png" });
            await supabase.storage
              .from("xml-files")
              .upload("capa-atual.png", pngBlob, { upsert: true, contentType: "image/png" });
            const { data: urlData } = supabase.storage
              .from("xml-files")
              .getPublicUrl("capa-atual.png");
            capa = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : capa;
          } catch {}
        }

        const processedXml = `<?xml version="1.0" encoding="UTF-8"?>\n<musica_agora>\n  <titulo>${titulo}</titulo>\n  <interprete>${interprete}</interprete>\n  <capa>${capa}</capa>\n</musica_agora>`;
        
        if (processedXml === lastContentRef.current) return;
        lastContentRef.current = processedXml;

        const file = new Blob([processedXml], { type: "application/xml" });
        await supabase.storage
          .from("xml-files")
          .upload("musica-agora.xml", file, { upsert: true, contentType: "application/xml" });
      } catch {}
    };

    // Faster first sync, then regular polling
    const startTimer = setTimeout(uploadMusicXml, 4000);
    const interval = setInterval(uploadMusicXml, 15000);
    return () => { clearTimeout(startTimer); clearInterval(interval); };
  }, [user]);
}


/* ========== COMERCIAL WIDGETS ========== */
function ComercialWidgets() {
  const { user } = useAuth();
  const [totalLogos, setTotalLogos] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ count }] = await Promise.all([
        supabase.from("logos_patrocinadores").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("ativo", true),
      ]);
      setTotalLogos(count || 0);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  if (loading) return (
    <div className="animate-pulse">
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-3.5 h-3.5 rounded" style={{ backgroundColor: "var(--layout-button-bg, #0f1058333)", opacity: 0.2 }} />
        <div className="w-28 h-3 rounded bg-white/10" />
      </div>
      <div className="w-12 h-8 rounded bg-white/10 mb-1" />
      <div className="w-36 h-2.5 rounded bg-white/5" />
    </div>
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold" style={{ color: "var(--layout-widget-text, #ffffff)" }}>🏆 Patrocinadores Ativos</p>
        <span className="text-[10px] font-semibold" style={{ color: "var(--layout-widget-text, #ffffff)", opacity: 0.7 }}>no ar</span>
      </div>
      <p className="text-3xl font-bold" style={{ color: "var(--layout-widget-text, #ffffff)" }}>{totalLogos}</p>
      <p className="text-[10px] mt-1" style={{ color: "var(--layout-widget-text, #ffffff)", opacity: 0.5 }}>logos vinculadas a programas</p>
    </div>
  );
}

/* ========== DASHBOARD AGENDA ========== */
function DashboardAgenda() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [calMonth, setCalMonth] = useState(new Date());

  const feriadosNacionais = [
    { dia: 1, mes: 1, nome: "Confraternização Universal" },
    { dia: 21, mes: 4, nome: "Tiradentes" },
    { dia: 1, mes: 5, nome: "Dia do Trabalhador" },
    { dia: 7, mes: 9, nome: "Independência do Brasil" },
    { dia: 12, mes: 10, nome: "Nossa Senhora Aparecida" },
    { dia: 2, mes: 11, nome: "Finados" },
    { dia: 15, mes: 11, nome: "Proclamação da República" },
    { dia: 20, mes: 11, nome: "Consciência Negra" },
    { dia: 25, mes: 12, nome: "Natal" },
  ];

  const getFeriadoNome = (date?: Date) => {
    if (!date) return null;
    const f = feriadosNacionais.find(h => h.dia === date.getDate() && h.mes === (date.getMonth() + 1));
    return f ? f.nome : null;
  };

  const feriadoDates = feriadosNacionais.map(f => {
    const d = new Date();
    return new Date(d.getFullYear(), f.mes - 1, f.dia);
  });

  const feriadoDates = feriadosNacionais.map(f => {
    const d = new Date();
    return new Date(d.getFullYear(), f.mes - 1, f.dia);
  });

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const { data: evts } = await supabase
        .from("agenda_eventos")
        .select("*")
        .eq("user_id", user.id)
        .order("data");
      if (!evts) { setEventos([]); setLoading(false); return; }
      const programaIds = evts.map((e: any) => e.programa_id).filter(Boolean);
      const { data: progs } = programaIds.length
        ? await supabase.from("programas").select("*").in("id", programaIds)
        : { data: [] };
      setEventos(evts.map((e: any) => ({
        ...e,
        programa: (progs || []).find((p: any) => p.id === e.programa_id),
      })));
      setLoading(false);
    };
    fetchData();
  }, [user]);

  const eventMatchesDate = (evt: any, dateStr: string) => {
    if (evt.data === dateStr) return true;
    const evtDate = new Date(evt.data + "T12:00:00");
    const checkDate = new Date(dateStr + "T12:00:00");
    if (checkDate < evtDate) return false;
    if (evt.recorrencia === "semanal") return evtDate.getDay() === checkDate.getDay();
    if (evt.recorrencia === "mensal") return evtDate.getDate() === checkDate.getDate();
    return false;
  };

  const getCalendarDates = () => {
    const dates: Date[] = [];
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    for (const evt of eventos) {
      if (evt.recorrencia === "unico") {
        dates.push(new Date(evt.data + "T12:00:00"));
      } else {
        const d = new Date(start);
        while (d <= end) {
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (eventMatchesDate(evt, ds)) dates.push(new Date(d));
          d.setDate(d.getDate() + 1);
        }
      }
    }
    return dates;
  };
  const eventDates = getCalendarDates();

  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000); // Update every 30s to catch passed end times
    return () => clearInterval(timer);
  }, []);

  const todayStr = format(now, "yyyy-MM-dd");
  const currentTime = format(now, "HH:mm");

  const selDateStr = selectedDate
    ? format(selectedDate, "yyyy-MM-dd")
    : "";

  const dayEvents = eventos.filter((e) => {
    const matchesDate = eventMatchesDate(e, selDateStr);
    if (!matchesDate) return false;

    // Filter out completed or cancelled events
    if (e.status === "concluido" || e.status === "cancelado") return false;

    // Filter out events where recording has ended (only for today)
    const isToday = selDateStr === todayStr;
    if (isToday && e.horario_gravacao_fim && e.horario_gravacao_fim < currentTime) {
      return false;
    }

    return true;
  });

  const feriadoHoje = getFeriadoNome(selectedDate || new Date());

  if (loading) {
    return (
      <div className="flex flex-col h-full animate-pulse">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-3.5 h-3.5 rounded bg-white/10" />
          <div className="w-14 h-3 rounded bg-white/10" />
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="w-full aspect-square rounded bg-white/5" />
          ))}
        </div>
        <div className="mt-1 space-y-1">
          <div className="h-6 rounded-lg" style={{ backgroundColor: "var(--layout-button-bg, #0f1058333)", opacity: 0.15 }} />
        </div>
      </div>
    );
  }



  const prevMonth = () => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1));
  const nextMonth = () => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1));

  const monthLabel = calMonth.toLocaleDateString("pt-BR", { month: "short", year: "numeric" });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header: icon + AGENDA + month nav */}
      <div className="flex items-center gap-1.5 mb-1">
        <CalendarDays size={14} style={{ color: "var(--layout-button-bg, #0f1058333)" }} />
        <span className="font-bold text-xs uppercase tracking-wide" style={{ color: "var(--layout-widget-text, #ffffff)" }}>Agenda</span>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={prevMonth} className="w-4 h-4 flex items-center justify-center rounded hover:opacity-70">
            <ChevronDown size={10} className="rotate-90" style={{ color: "var(--layout-button-bg, #0f1058333)" }} />
          </button>
          <span className="text-[9px] font-semibold capitalize" style={{ color: "var(--layout-button-bg, #0f1058333)", minWidth: "55px", textAlign: "center" }}>{monthLabel}</span>
          <button onClick={nextMonth} className="w-4 h-4 flex items-center justify-center rounded hover:opacity-70">
            <ChevronDown size={10} className="-rotate-90" style={{ color: "var(--layout-button-bg, #0f1058333)" }} />
          </button>
        </div>
      </div>
      <DashboardCalendar
        selected={selectedDate}
        onSelect={setSelectedDate}
        eventDates={eventDates}
        month={calMonth}
        onMonthChange={setCalMonth}
      />
      {dayEvents.length > 0 && (
        <div className="mt-1 space-y-1 overflow-y-auto flex-1 scrollbar-hide">
          {dayEvents.map((evt: any) => (
            <div key={evt.id} className="rounded-lg px-2 py-1 text-[10px]" style={{ backgroundColor: "var(--layout-button-bg, #0f1058333)", color: "var(--layout-button-text, #fff)" }}>
              <p className="font-semibold">{evt.programa?.nome || "Evento"}</p>
              {evt.programa && <p className="opacity-70">{evt.programa.horario_inicio} - {evt.programa.horario_fim}</p>}
            </div>
          ))}
        </div>
      )}
      <DashboardAgendaWithStyles
        onNavigate={onNavigate}
        feriadoHoje={feriadoHoje}
        selectedDate={selectedDate}
        dayEvents={dayEvents}
        eventDates={eventDates}
        feriadoDates={feriadoDates}
        calMonth={calMonth}
        setCalMonth={setCalMonth}
        setSelectedDate={setSelectedDate}
      />
    </div>
  );
}

function DashboardCalendar({ selected, onSelect, eventDates, feriadoDates, month, onMonthChange }: {
  selected: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  eventDates: Date[];
  feriadoDates: Date[];
  month: Date;
  onMonthChange: (d: Date) => void;
}) {
  return (
    <CalendarUI
      mode="single"
      selected={selected}
      onSelect={onSelect}
      month={month}
      onMonthChange={onMonthChange}
      locale={ptBR}
      modifiers={{ hasEvent: eventDates, isFeriado: feriadoDates }}
      modifiersClassNames={{ 
        hasEvent: "has-event-dot",
        isFeriado: "is-feriado-dot"
      }}
      className="p-0 pointer-events-auto dashboard-calendar"
      classNames={{
        months: "w-full",
        month: "w-full space-y-0",
        caption: "hidden",
        nav: "hidden",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "flex-1 text-center font-medium",
        row: "flex w-full",
        cell: "flex-1 text-center p-0",
        day: "h-[24px] w-[24px] p-0 font-normal text-[14px] mx-auto flex items-center justify-center rounded-full hover:text-white transition-colors",
        day_selected: "!bg-[#0d0446] !text-white",
        day_today: "font-bold",
        day_outside: "opacity-30",
      }}
      modifiers={{ hasEvent: eventDates }}
      modifiersStyles={{
        hasEvent: { backgroundColor: "var(--layout-button-bg, #0f1058333)", fontWeight: "bold", color: "var(--layout-button-text, #fff)", borderRadius: "50%" },
      }}
      styles={{
        day: { color: "var(--layout-widget-text, #ffffff)", fontSize: "14px" },
        head_cell: { color: "var(--layout-widget-text, #ffffff)", opacity: 0.5, fontSize: "10px", padding: 0 },
      }}
    />
  );
}
