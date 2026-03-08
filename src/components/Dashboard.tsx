import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Home, Sun, FileText, Mic2, PlaySquare, Music, CalendarDays, Settings, LogOut, Loader2, ShoppingBag, ChevronDown, ChevronUp, MessageSquareQuote, Tag, Image, ExternalLink, MonitorPlay, Heart, ShoppingCart, Film, Users, Newspaper, CloudSun, Wrench, Scissors, Menu, X } from "lucide-react";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import seloNexohub from "@/assets/selo-nexohub.png";
import logoFooter from "@/assets/logo-footer.png";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";

// Lazy-load all tab pages for faster initial render
const ApresentadorForm = lazy(() => import("./ApresentadorForm"));
const ProgramaForm = lazy(() => import("./ProgramaForm"));
const PrevisaoTempo = lazy(() => import("./PrevisaoTempo"));
const NoticiasPanel = lazy(() => import("./NoticiasPanel"));
const WeatherWidget = lazy(() => import("./WeatherWidget"));
const OnAirWidget = lazy(() => import("./OnAirWidget"));
const MusicaNoAr = lazy(() => import("./MusicaNoAr"));
const AgendaPage = lazy(() => import("./AgendaPage"));
const MusicWidget = lazy(() => import("./MusicWidget"));
const XmlLinkRow = lazy(() => import("./XmlLinkRow"));
const ConfiguracoesPage = lazy(() => import("./ConfiguracoesPage"));
import { getEmpresaConfig } from "./ConfiguracoesPage";
import { getMusicData } from "./MusicaNoAr";
const TestemunhaisPage = lazy(() => import("./TestemunhaisPage"));
const PromocoesPage = lazy(() => import("./PromocoesPage"));
const LogosPatrocinadoresPage = lazy(() => import("./LogosPatrocinadoresPage"));
const VideoPlayer = lazy(() => import("./VideoPlayer"));
const TopLikedSongs = lazy(() => import("./TopLikedSongs"));
const MusicasCurtidasPage = lazy(() => import("./MusicasCurtidasPage"));
const ShoppingPage = lazy(() => import("./ShoppingPage"));
const PreRollPage = lazy(() => import("./PreRollPage"));
const CortesVideoPage = lazy(() => import("./CortesVideoPage"));
const MessageNotification = lazy(() => import("./MessageNotification"));
import DashboardSkeleton from "./skeletons/DashboardSkeleton";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { normalizeMusicText } from "@/lib/textEncoding";
type Page = "dashboard" | "previsao" | "noticias" | "apresentadores" | "programas" | "musica" | "agenda" | "configuracoes" | "testemunhais" | "promocoes" | "logos" | "curtidas" | "shopping" | "preroll" | "cortevideo";

// Sidebar structured menu
interface MenuItem {
  icon: typeof Home;
  label: string;
  page?: Page;
  children?: { icon: typeof Home; label: string; page: Page }[];
}

const sidebarMenu: MenuItem[] = [
  { icon: Home, label: "home", page: "dashboard" },
  {
    icon: Users, label: "cadastros", children: [
      { icon: Mic2, label: "Apresentadores", page: "apresentadores" },
      { icon: PlaySquare, label: "Programas", page: "programas" },
    ]
  },
  { icon: CloudSun, label: "previsão do tempo", page: "previsao" },
  { icon: Newspaper, label: "notícias", page: "noticias" },
  { icon: Music, label: "música no ar", page: "musica" },
  { icon: CalendarDays, label: "agenda", page: "agenda" },
  { icon: MonitorPlay, label: "player", page: undefined }, // opens new tab
  {
    icon: ShoppingBag, label: "comercial", children: [
      { icon: MessageSquareQuote, label: "Testemunhais", page: "testemunhais" },
      { icon: Tag, label: "Promoções", page: "promocoes" },
      { icon: Image, label: "Logos", page: "logos" },
      { icon: Film, label: "Pre Roll", page: "preroll" },
      { icon: ShoppingCart, label: "Shopping", page: "shopping" },
    ]
  },
  {
    icon: Wrench, label: "ferramentas", children: [
      { icon: Scissors, label: "Cortes de Vídeo", page: "cortevideo" },
    ]
  },
];

// Map menu items to module keys for plan filtering
const menuToModuleKey: Record<string, string> = {
  "cadastros": "cadastros",
  "previsão do tempo": "previsao",
  "notícias": "noticias",
  "música no ar": "musica",
  "agenda": "agenda",
  "player": "player",
  "comercial": "comercial",
  "ferramentas": "ferramentas",
};

const pageTitle: Record<Page, string> = {
  dashboard: "Home",
  previsao: "Previsão do Tempo",
  noticias: "Notícias",
  apresentadores: "Cadastro de Apresentadores",
  programas: "Cadastro de Programas",
  musica: "Música no Ar",
  agenda: "Agenda",
  curtidas: "Músicas Curtidas",
  configuracoes: "Configurações",
  testemunhais: "Comercial — Testemunhais",
  promocoes: "Comercial — Promoções",
  logos: "Comercial — Logos Patrocinadores",
  shopping: "Comercial — Shopping",
  preroll: "Comercial — Pré-Roll",
  cortevideo: "Ferramentas — Cortes de Vídeo",
};

interface DashboardProps {
  onLogout?: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [noArCollapsed, setNoArCollapsed] = useState(false);
  const [empresa, setEmpresa] = useState<import("./ConfiguracoesPage").EmpresaConfig>({} as any);
  const [enabledModules, setEnabledModules] = useState<Set<string> | null>(null);
  const [planModules, setPlanModules] = useState<Set<string> | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase
        .from("client_modules")
        .select("module_key, enabled")
        .eq("user_id", user.id)
        .then(({ data }) => {
          if (data && data.length > 0) {
            const enabled = new Set(data.filter((m: any) => m.enabled).map((m: any) => m.module_key));
            setEnabledModules(enabled);
          } else {
            setEnabledModules(null);
          }
        }),
      getEmpresaConfig(user.id).then(cfg => {
        setEmpresa(cfg);
        // Load plan modules
        if (cfg.plano) {
          supabase.from("planos").select("enabled_modules").eq("name", cfg.plano).maybeSingle().then(({ data }) => {
            if (data?.enabled_modules) {
              setPlanModules(new Set(data.enabled_modules));
            }
          });
        }
      }),
    ]).finally(() => setInitialLoading(false));
  }, [user]);

  const isModuleEnabled = (page: Page): boolean => {
    if (page === "dashboard" || page === "configuracoes" || page === "cortevideo") return true;
    if (!enabledModules) return true;
    if (page === "testemunhais" || page === "promocoes" || page === "logos" || page === "preroll" || page === "shopping") {
      return enabledModules.has("comercial");
    }
    return enabledModules.has(page);
  };

  useEffect(() => {
    if (enabledModules !== null && currentPage !== "dashboard" && currentPage !== "configuracoes" && !isModuleEnabled(currentPage)) {
      setCurrentPage("dashboard");
    }
  }, [currentPage, enabledModules]);

  useGlobalMusicXmlUpload();
  useGlobalMusicSync();

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.label === "player") {
      window.open("/user/nexohub/player", "_blank");
      return;
    }
    if (item.children) {
      toggleMenu(item.label);
    } else if (item.page) {
      setCurrentPage(item.page);
      setMobileMenuOpen(false);
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

  return (
    <div className="h-screen flex flex-col animate-fade-in overflow-hidden" style={{
      backgroundColor: "#268ffa",
      ...(empresa.backgroundUrl ? {
        backgroundImage: `url(${empresa.backgroundUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
        animation: "fade-in 1s ease-out",
      } : {}),
    }}>
      {/* Mobile top bar */}
      <div className="lg:hidden flex items-center justify-between px-4 pt-3 pb-2">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
          {mobileMenuOpen ? <X size={20} className="text-white" /> : <Menu size={20} className="text-white" />}
        </button>
        <h1 className="text-white font-bold text-lg truncate flex-1 ml-3">{empresa.nome || "Dashboard"}</h1>
        <ServerClock />
      </div>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-[280px] flex flex-col h-full overflow-y-auto" style={{ backgroundColor: "rgba(0, 0, 0, 0.92)" }}>
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <img src={seloNexohub} alt="NexoHUB" className="h-4" />
              <button onClick={() => setMobileMenuOpen(false)} className="p-1.5 rounded-full" style={{ backgroundColor: "#268ffa" }}>
                <X size={16} className="text-white" />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 py-2">
              {sidebarMenu.filter(item => {
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
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${active ? "text-[#268ffa]" : "text-white hover:bg-white/5"}`}>
                      <Icon size={16} className={active ? "text-[#268ffa]" : "text-white"} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.children && (expanded ? <ChevronUp size={12} className="text-white/30" /> : <ChevronDown size={12} className="text-white/30" />)}
                    </button>
                    {item.children && expanded && (
                      <div className="ml-6 space-y-0.5 mt-0.5">
                        {item.children.map(child => {
                          const ChildIcon = child.icon;
                          const childActive = currentPage === child.page;
                          return (
                            <button key={child.page} onClick={() => { setCurrentPage(child.page); setMobileMenuOpen(false); }}
                              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-colors ${childActive ? "text-[#268ffa]" : "text-white"}`}>
                              <ChildIcon size={12} className={childActive ? "text-[#268ffa]" : "text-white"} />
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
            <div className="px-4 py-4 border-t border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: "#268ffa" }}>
                  {empresa.nome ? empresa.nome.charAt(0).toUpperCase() : "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-white text-xs font-bold truncate">{empresa.nome || "Empresa"}</p>
                  <button onClick={onLogout} className="text-[10px] underline hover:opacity-70 mt-0.5" style={{ color: "#268ffa" }}>sair</button>
                </div>
              </div>
            </div>
          </div>
          <div className="flex-1" onClick={() => setMobileMenuOpen(false)} />
        </div>
      )}

      <div className="flex gap-[30px] pt-3 flex-1 min-h-0 px-4 lg:px-[50px]" style={{ paddingTop: "12px" }}>
        {/* === LEFT COLUMN: SIDEBAR === */}
        <div className={`hidden lg:flex flex-col gap-5 flex-shrink-0 transition-all duration-300`} style={{ width: sidebarCollapsed ? "48px" : "400px" }}>
          {/* === SIDEBAR === */}
          <aside className="flex flex-col rounded-[24px] overflow-hidden relative" style={{ backgroundColor: "rgba(0, 0, 0, 0.70)", height: "560px" }}>
            {/* Collapse toggle */}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="absolute top-2 right-2 z-20 p-1 rounded-full transition-colors"
              style={{ backgroundColor: "#268ffa" }}
              title={sidebarCollapsed ? "Expandir menu" : "Recolher menu"}
            >
              {sidebarCollapsed ? <ChevronDown size={14} className="text-white rotate-[-90deg]" /> : <ChevronUp size={14} className="text-white rotate-[-90deg]" />}
            </button>
            {/* Selo + Settings */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <img src={seloNexohub} alt="NexoHUB" className="h-4" />
              <button
                onClick={() => setCurrentPage("configuracoes")}
                className="p-1.5 rounded-full transition-colors"
                style={{ backgroundColor: "#268ffa" }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#0d0446"; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#268ffa"; }}
              >
                <Settings size={16} className="text-white" />
              </button>
            </div>

            {/* Module header */}
            <div className="mx-3 mb-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest text-white/70 flex items-center justify-between" style={{ backgroundColor: "#0d0446" }}>
              <span>módulos ativos</span>
              <span className="bg-white/20 text-white rounded-full px-2 py-0.5 text-[9px] font-bold normal-case tracking-normal">
                {planModules ? planModules.size : (enabledModules ? enabledModules.size : "—")}
              </span>
            </div>

            {/* Menu items with scroll */}
            <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 sidebar-scroll">
              {sidebarMenu.filter(item => {
                // Home and cadastros always show
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
                    <button
                      onClick={() => handleMenuClick(item)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs transition-colors ${
                        active ? "text-[#268ffa]" : "text-white hover:bg-white/5"
                      }`}
                      onMouseEnter={e => { if (!active) { e.currentTarget.style.color = "#268ffa"; } }}
                      onMouseLeave={e => { if (!active) { e.currentTarget.style.color = ""; } }}
                    >
                      <Icon size={14} className={active ? "text-[#268ffa]" : "text-white"} />
                      <span className="flex-1 text-left">{item.label}</span>
                      {item.children && (
                        expanded ? <ChevronUp size={12} className="text-white/30" /> : <ChevronDown size={12} className="text-white/30" />
                      )}
                    </button>
                    {item.children && expanded && (
                      <div className="ml-6 space-y-0.5 mt-0.5">
                        {item.children.map(child => {
                          const ChildIcon = child.icon;
                          const childActive = currentPage === child.page;
                          return (
                            <button
                              key={child.page}
                              onClick={() => setCurrentPage(child.page)}
                              className={`w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[11px] transition-colors ${
                                childActive ? "text-[#268ffa]" : "text-white"
                              }`}
                              onMouseEnter={e => { if (!childActive) { e.currentTarget.style.color = "#268ffa"; } }}
                              onMouseLeave={e => { if (!childActive) { e.currentTarget.style.color = ""; } }}
                            >
                              <ChildIcon size={12} className={childActive ? "text-[#268ffa]" : "text-white"} />
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

            {/* XML Master */}
            <div className="px-3 py-2 border-t border-white/10">
              <Suspense fallback={null}>
                <UnifiedXmlField />
              </Suspense>
            </div>

            {/* User profile at bottom */}
            <div className="px-4 py-4 border-t border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: "#268ffa" }}>
                  {empresa.nome ? empresa.nome.charAt(0).toUpperCase() : "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-white text-xs font-bold truncate">{empresa.nome || "Empresa"}</p>
                    {empresa.plano && (
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold flex-shrink-0" style={{ backgroundColor: "#268ffa", color: "#fff" }}>
                        {empresa.plano}
                      </span>
                    )}
                  </div>
                  <p className="text-white/50 text-[10px] truncate">{user?.email || ""}</p>
                  <button onClick={onLogout} className="text-[10px] underline hover:opacity-70 transition-colors mt-0.5" style={{ color: "#268ffa" }}>
                    sair
                  </button>
                </div>
              </div>
            </div>
          </aside>

        </div>

        {/* === MAIN CONTENT === */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Header - desktop only */}
          <div className="hidden lg:flex items-center justify-between mb-3" style={{ marginLeft: "25px" }}>
            <div>
              <h1 className="font-bold text-white" style={{ fontSize: "45px", lineHeight: 1.1 }}>{empresa.nome || "Dashboard"}</h1>
              <p className="text-white/60 text-xs">{user?.email || ""}</p>
            </div>
            <div className="flex items-center gap-3" style={{ marginRight: "50px" }}>
              <Suspense fallback={<div className="w-9 h-9 rounded-full" style={{ backgroundColor: "#0d0446" }} />}>
                <MessageNotification />
              </Suspense>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      const slug = user?.email?.split("@")[0] || "";
                      window.open(`/user/${slug}/nexohub/player`, "_blank");
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
                    style={{ backgroundColor: "#0d0446" }}
                  >
                    <MonitorPlay size={16} className="text-white" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p className="text-xs">Player Externo</p></TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      const slug = user?.email?.split("@")[0] || "";
                      window.open(`/user/${slug}/nexohub/telapromo`, "_blank");
                    }}
                    className="w-9 h-9 rounded-full flex items-center justify-center transition-opacity hover:opacity-80"
                    style={{ backgroundColor: "#0d0446" }}
                  >
                    <Tag size={16} className="text-white" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p className="text-xs">Tela Promoções</p></TooltipContent>
              </Tooltip>
              <ServerClock />
            </div>
          </div>

          {/* Content area */}
          <div className={`flex-1 overflow-y-auto overflow-x-hidden rounded-2xl ${currentPage !== "dashboard" ? "mv-content-area" : ""}`} style={currentPage === "dashboard" ? {} : { padding: "1rem" }}>
            <Suspense fallback={<ModulePageSkeleton />}>
              {currentPage === "previsao" && <PrevisaoTempo />}
              {currentPage === "noticias" && <NoticiasPanel />}
              {currentPage === "apresentadores" && <ApresentadorForm />}
              {currentPage === "programas" && <ProgramaForm />}
              {currentPage === "musica" && <MusicaNoAr />}
              {currentPage === "agenda" && <AgendaPage />}
              {currentPage === "curtidas" && <MusicasCurtidasPage />}
              {currentPage === "configuracoes" && <ConfiguracoesPage />}
              {currentPage === "testemunhais" && <TestemunhaisPage />}
              {currentPage === "promocoes" && <PromocoesPage />}
              {currentPage === "logos" && <LogosPatrocinadoresPage />}
              {currentPage === "shopping" && <ShoppingPage />}
              {currentPage === "preroll" && <PreRollPage />}
              {currentPage === "cortevideo" && <CortesVideoPage />}
            </Suspense>
          </div>
        </main>
      </div>

      {/* === NO AR + WIDGET LIST ROW === */}
      {currentPage === "dashboard" && (
        <div className="flex flex-col lg:flex-row gap-3 lg:gap-5 px-4 lg:px-[50px] pt-2">
          {/* No Ar box - collapsible */}
          <div className="flex-shrink-0 w-full lg:w-auto">
            <button
              onClick={() => setNoArCollapsed(!noArCollapsed)}
              className="lg:hidden flex items-center gap-2 mb-1 px-3 py-1.5 rounded-lg text-xs font-bold text-white"
              style={{ backgroundColor: "#0c0441" }}
            >
              {noArCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              No Ar
            </button>
            <div
              className={`rounded-2xl p-4 overflow-hidden transition-all duration-300 ${noArCollapsed ? "hidden lg:block" : "block"}`}
              style={{ backgroundColor: "#0c0441", width: "100%", height: noArCollapsed ? 0 : undefined }}
            >
              <div className="w-full lg:w-[400px] h-[180px] lg:h-[225px]">
                <Suspense fallback={null}>
                  <OnAirWidget />
                </Suspense>
              </div>
            </div>
          </div>
          {/* Widget list */}
          <div className="flex-1 min-w-0">
            <Suspense fallback={null}>
              <DashboardHome empresa={empresa} onNavigate={setCurrentPage} />
            </Suspense>
          </div>
        </div>
      )}

      {/* === FOOTER === */}
      <footer className="flex items-center gap-3 px-4 lg:px-[50px] pb-2 pt-3">
        <img src={logoFooter} alt="Nexo" className="h-5 opacity-80" />
        <span className="text-white/60 text-[11px] hidden sm:inline">Copyrighted 2026 - Todos os direitos reservados.</span>
      </footer>
    </div>
  );
}

/* ========== DASHBOARD HOME ========== */
const WIDGETS_ORDER_KEY = "masterview_widgets_order";

interface WidgetCard {
  id: string;
  bg: string;
  render: (onNavigate: (page: Page) => void) => React.ReactNode;
}

const defaultWidgets: WidgetCard[] = [
  { id: "weather", bg: "#ffffff", render: (nav) => <WeatherWidget onNavigate={nav} /> },
  { id: "top10", bg: "#ffffff", render: () => <TopLikedSongs /> },
  { id: "agenda", bg: "#ffffff", render: () => <DashboardAgenda /> },
  { id: "comercial", bg: "#ffffff", render: () => <ComercialWidgets /> },
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
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {orderedWidgets.map(widget => (
        <div
          key={widget.id}
          className={`dashboard-widget-card rounded-2xl p-3 lg:p-4 flex-shrink-0 overflow-hidden relative ${
            draggedId === widget.id ? "opacity-50 scale-95" : ""
          } ${dragOverId === widget.id ? "ring-2 ring-[#268ffa]" : ""}`}
          style={{ backgroundColor: widget.bg }}
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
      <span className="font-light text-white tracking-wider inline-flex items-start" style={{ fontFamily: "Poppins, sans-serif", fontSize: "45px", lineHeight: 1.1 }}>
        {hours}
        <span className="font-light text-white/70 inline-block" style={{ fontSize: "18px", width: "28px", textAlign: "left", marginTop: "4px" }}>{seconds}</span>
      </span>
    </div>
  );
}

/* ========== UNIFIED XML FIELD ========== */
const WEATHER_KEY = "masterview_last_city";

function UnifiedXmlField() {
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
            const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=1`);
            const d = await wx.json();
            weatherXml = `  <tempo>\n    <cidade>${name}</cidade>\n    <temperatura>${Math.round(d.current.temperature_2m)}</temperatura>\n    <humidade>${d.current.relative_humidity_2m}</humidade>\n    <condicao_codigo>${d.current.weather_code}</condicao_codigo>\n    <minima>${Math.round(d.daily.temperature_2m_min[0])}</minima>\n    <maxima>${Math.round(d.daily.temperature_2m_max[0])}</maxima>\n    <chance_chuva>${d.daily.precipitation_probability_max[0] ?? 0}</chance_chuva>\n  </tempo>`;
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

      const m = getMusicData();
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
    const interval = setInterval(update, 5000);
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
        const res = await fetch(settings.music_xml_url, { cache: "no-store" });
        const text = await res.text();
        if (text === lastContentRef.current) return;
        lastContentRef.current = text;

        const file = new Blob([text], { type: "application/xml" });
        await supabase.storage
          .from("xml-files")
          .upload("musica-agora.xml", file, { upsert: true, contentType: "application/xml" });
      } catch {}
    };

    uploadMusicXml();
    const interval = setInterval(uploadMusicXml, 5000);
    return () => clearInterval(interval);
  }, [user]);
}

function useGlobalMusicSync() {
  const { user } = useAuth();
  const coverCacheRef = useRef<Record<string, string>>({});

  useEffect(() => {
    if (!user) return;

    const MUSIC_DATA_KEY = "masterview_music_data";
    const MUSIC_START_KEY = "masterview_music_start";


    const parseXml = (xmlStr: string) => {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(xmlStr, "application/xml");
        if (doc.querySelector("parsererror")) return null;
        const titulo = normalizeMusicText(doc.querySelector("nome_musica")?.textContent || doc.querySelector("titulo")?.textContent || doc.querySelector("title")?.textContent || "Sem título");
        const artista = normalizeMusicText(doc.querySelector("interprete")?.textContent || doc.querySelector("nome_interprete")?.textContent || doc.querySelector("artista")?.textContent || doc.querySelector("artist")?.textContent || "Desconhecido");
        const duracaoStr = doc.querySelector("duracao")?.textContent || doc.querySelector("duration")?.textContent || "0";
        const capa = doc.querySelector("capa")?.textContent || doc.querySelector("cover")?.textContent || "";
        let duracao = 0;
        if (duracaoStr.includes(":")) {
          const parts = duracaoStr.split(":").map(Number);
          if (parts.length === 2) duracao = parts[0] * 60 + parts[1];
          else if (parts.length === 3) duracao = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else {
          duracao = parseFloat(duracaoStr) || 0;
          if (duracao > 600) duracao = duracao / 1000;
        }
        return { titulo, artista, duracao, capa };
      } catch { return null; }
    };

    const fetchAndSync = async () => {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("music_xml_url")
        .eq("user_id", user.id)
        .maybeSingle();
      const url = settings?.music_xml_url;
      if (!url) return;

      try {
        const { data: rssData, error: rssError } = await supabase.functions.invoke("fetch-rss", {
          body: { url },
        });
        if (rssError || !rssData?.content) return;

        const text = rssData.content;
        const data = parseXml(text);
        if (!data) return;

        if (!data.capa) {
          const cacheKey = `${data.artista}-${data.titulo}`;
          if (coverCacheRef.current[cacheKey]) {
            data.capa = coverCacheRef.current[cacheKey];
          } else {
            try {
              const query = encodeURIComponent(`${data.artista} ${data.titulo}`);
              const itunesRes = await fetch(`https://itunes.apple.com/search?term=${query}&media=music&limit=1`);
              const itunesData = await itunesRes.json();
              if (itunesData.results?.length > 0) {
                const cover = itunesData.results[0].artworkUrl100?.replace("100x100", "600x600") || "";
                if (cover) {
                  data.capa = cover;
                  coverCacheRef.current[cacheKey] = cover;
                }
              }
            } catch {}
          }
        }

        const prevRaw = localStorage.getItem(MUSIC_DATA_KEY);
        const prev = prevRaw ? JSON.parse(prevRaw) : null;
        if (!prev || prev.titulo !== data.titulo || prev.artista !== data.artista) {
          localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify(data));
          localStorage.setItem(MUSIC_START_KEY, Date.now().toString());
        } else if (data.capa && (!prev.capa || prev.capa !== data.capa)) {
          localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...prev, capa: data.capa }));
        }
      } catch {}
    };

    fetchAndSync();
    const interval = setInterval(fetchAndSync, 2000);
    return () => clearInterval(interval);
  }, [user]);
}

/* ========== COMERCIAL WIDGETS ========== */
function ComercialWidgets() {
  const { user } = useAuth();
  const [totalLogos, setTotalLogos] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      const [{ count }] = await Promise.all([
        supabase.from("logos_patrocinadores").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("ativo", true),
      ]);
      setTotalLogos(count || 0);
      setLoading(false);
    };
    fetch();
  }, [user]);

  if (loading) return (
    <div className="animate-pulse" style={{ color: "#0d0446" }}>
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-3.5 h-3.5 rounded bg-[#268ffa]/20" />
        <div className="w-28 h-3 rounded bg-[#268ffa]/20" />
      </div>
      <div className="w-12 h-8 rounded bg-[#0d0446]/10 mb-1" />
      <div className="w-36 h-2.5 rounded bg-[#0d0446]/5" />
    </div>
  );

  return (
    <div style={{ color: "#0d0446" }}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold" style={{ color: "#268ffa" }}>🏆 Patrocinadores Ativos</p>
        <span className="text-[10px] font-semibold" style={{ color: "#0d0446" }}>no ar</span>
      </div>
      <p className="text-3xl font-bold" style={{ color: "#0d0446" }}>{totalLogos}</p>
      <p className="text-[10px] mt-1" style={{ color: "#0d0446", opacity: 0.5 }}>logos vinculadas a programas</p>
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

  const selDateStr = selectedDate
    ? `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
    : "";
  const dayEvents = eventos.filter((e) => eventMatchesDate(e, selDateStr));

  if (loading) {
    return (
      <div className="flex flex-col h-full animate-pulse">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-3.5 h-3.5 rounded bg-[#268ffa]/20" />
          <div className="w-14 h-3 rounded bg-[#268ffa]/20" />
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="w-full aspect-square rounded bg-[#0d0446]/5" />
          ))}
        </div>
        <div className="mt-1 space-y-1">
          <div className="h-6 rounded-lg bg-[#268ffa]/15" />
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
        <CalendarDays size={14} style={{ color: "#268ffa" }} />
        <span className="font-bold text-xs uppercase tracking-wide" style={{ color: "#268ffa" }}>Agenda</span>
        <div className="flex items-center gap-1 ml-auto">
          <button onClick={prevMonth} className="w-4 h-4 flex items-center justify-center rounded hover:opacity-70">
            <ChevronDown size={10} className="rotate-90" style={{ color: "#268ffa" }} />
          </button>
          <span className="text-[9px] font-semibold capitalize" style={{ color: "#268ffa", minWidth: "55px", textAlign: "center" }}>{monthLabel}</span>
          <button onClick={nextMonth} className="w-4 h-4 flex items-center justify-center rounded hover:opacity-70">
            <ChevronDown size={10} className="-rotate-90" style={{ color: "#268ffa" }} />
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
            <div key={evt.id} className="rounded-lg px-2 py-1 text-[10px]" style={{ backgroundColor: "#268ffa", color: "#fff" }}>
              <p className="font-semibold">{evt.programa?.nome || "Evento"}</p>
              {evt.programa && <p className="opacity-70">{evt.programa.horario_inicio} - {evt.programa.horario_fim}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardCalendar({ selected, onSelect, eventDates, month, onMonthChange }: {
  selected: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  eventDates: Date[];
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
      className="p-0 pointer-events-auto"
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
        day: "h-[24px] w-[24px] p-0 font-normal text-[14px] mx-auto flex items-center justify-center rounded-full hover:!bg-[#7fbcfa] hover:text-white transition-colors",
        day_selected: "!bg-[#0d0446] !text-white",
        day_today: "font-bold text-[#268ffa]",
        day_outside: "opacity-30",
      }}
      modifiers={{ hasEvent: eventDates }}
      modifiersStyles={{
        hasEvent: { backgroundColor: "#268ffa", fontWeight: "bold", color: "#fff", borderRadius: "50%" },
      }}
      styles={{
        day: { color: "#0d0446", fontSize: "14px" },
        head_cell: { color: "#0d0446", opacity: 0.4, fontSize: "10px", padding: 0 },
      }}
    />
  );
}
