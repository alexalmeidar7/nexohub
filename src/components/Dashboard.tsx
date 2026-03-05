import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Home, Sun, FileText, Mic2, PlaySquare, Music, CalendarDays, Settings, LogOut, Loader2, ShoppingBag, ChevronDown, ChevronUp, MessageSquareQuote, Tag, Image, ExternalLink, MonitorPlay, Heart, ShoppingCart, Film, Mail, Users, Newspaper, CloudSun } from "lucide-react";
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

type Page = "dashboard" | "previsao" | "noticias" | "apresentadores" | "programas" | "musica" | "agenda" | "configuracoes" | "testemunhais" | "promocoes" | "logos" | "curtidas" | "shopping" | "preroll";

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
];

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
};

interface DashboardProps {
  onLogout?: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [empresa, setEmpresa] = useState<import("./ConfiguracoesPage").EmpresaConfig>({} as any);
  const [enabledModules, setEnabledModules] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!user) return;
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
      });
  }, [user]);

  const isModuleEnabled = (page: Page): boolean => {
    if (page === "dashboard" || page === "configuracoes") return true;
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

  useEffect(() => {
    getEmpresaConfig().then(setEmpresa);
  }, []);

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
      window.open("/player", "_blank");
      return;
    }
    if (item.children) {
      toggleMenu(item.label);
    } else if (item.page) {
      setCurrentPage(item.page);
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

  return (
    <div className="min-h-screen flex flex-col" style={{
      backgroundColor: "#268ffa",
      paddingTop: "40px",
      ...(empresa.backgroundUrl ? {
        backgroundImage: `url(${empresa.backgroundUrl})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      } : {}),
    }}>
      <div className="flex pb-0 gap-3" style={{ height: "650px", paddingLeft: "50px", paddingRight: "50px", paddingTop: "12px" }}>
        {/* === SIDEBAR === */}
        <aside className="flex flex-col rounded-[24px] overflow-hidden flex-shrink-0 backdrop-blur-xl" style={{ backgroundColor: "rgba(0, 0, 0, 0.90)", width: "400px", height: "650px" }}>
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
              {enabledModules ? enabledModules.size : "—"}
            </span>
          </div>

          {/* Menu items with scroll */}
          <nav className="flex-1 overflow-y-auto px-3 space-y-0.5 sidebar-scroll">
            {sidebarMenu.map(item => {
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
                <p className="text-white text-xs font-bold truncate">{empresa.nome || "Empresa"}</p>
                <p className="text-white/50 text-[10px] truncate">{user?.email || ""}</p>
                <button onClick={onLogout} className="text-[10px] underline hover:opacity-70 transition-colors mt-0.5" style={{ color: "#268ffa" }}>
                  sair
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* === MAIN CONTENT === */}
        <main className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between mb-3" style={{ marginLeft: "25px" }}>
            <div>
              <h1 className="font-bold text-white" style={{ fontSize: "45px", lineHeight: 1.1 }}>{empresa.nome || "Dashboard"}</h1>
              <p className="text-white/60 text-xs">{user?.email || ""}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ backgroundColor: "#0d0446" }}>
                  <Mail size={16} className="text-white" />
                </div>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-[9px] font-bold flex items-center justify-center" style={{ backgroundColor: "#268ffa", color: "#0d0446" }}>3</span>
              </div>
              <ServerClock />
            </div>
          </div>

          {/* Content area */}
          <div className={`flex-1 overflow-y-auto overflow-x-hidden rounded-2xl ${currentPage === "dashboard" ? "flex flex-col" : ""}`} style={currentPage === "dashboard" ? {} : { backgroundColor: "#111", padding: "2rem" }}>
            <Suspense fallback={<div className="flex justify-center py-16"><Loader2 className="animate-spin text-white" size={28} /></div>}>
              {currentPage === "dashboard" && (
                <DashboardHome empresa={empresa} />
              )}
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
            </Suspense>
          </div>
        </main>
      </div>

      {/* === FOOTER === */}
      <footer className="flex items-center gap-3 px-6 mt-auto pb-6">
        <img src={logoFooter} alt="Nexo" className="h-5 opacity-80" />
        <span className="text-white/60 text-[11px]">Copyrighted 2026 - Todos os direitos reservados.</span>
      </footer>
    </div>
  );
}

/* ========== DASHBOARD HOME ========== */
function DashboardHome({ empresa }: { empresa: import("./ConfiguracoesPage").EmpresaConfig }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollLeft = () => {
    scrollRef.current?.scrollBy({ left: -370, behavior: "smooth" });
  };
  const scrollRight = () => {
    scrollRef.current?.scrollBy({ left: 370, behavior: "smooth" });
  };

  return (
    <div className="animate-fade-in flex flex-col justify-end flex-1">
      <div className="relative">
        {/* Left arrow */}
        <button
          onClick={scrollLeft}
          className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 z-10 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
        >
          <ChevronDown size={16} className="rotate-90" />
        </button>

        {/* Scrollable cards row */}
        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto scrollbar-hide"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {/* Card 1 - No Ar */}
          <div className="rounded-2xl p-4 flex-shrink-0 overflow-hidden" style={{ backgroundColor: "#0c0441", width: "350px", height: "225px", scrollSnapAlign: "start" }}>
            <Suspense fallback={<Loader2 className="animate-spin text-white/50" size={16} />}>
              <OnAirWidget />
            </Suspense>
          </div>

          {/* Card 2 - Tempo */}
          <div className="rounded-2xl p-4 bg-white flex-shrink-0 overflow-hidden" style={{ width: "350px", height: "225px", scrollSnapAlign: "start" }}>
            <Suspense fallback={<Loader2 className="animate-spin text-gray-400" size={16} />}>
              <WeatherWidget />
            </Suspense>
          </div>

          {/* Card 3 - Top 10 */}
          <div className="rounded-2xl p-4 bg-white flex-shrink-0 overflow-hidden" style={{ width: "350px", height: "225px", scrollSnapAlign: "start" }}>
            <Suspense fallback={<Loader2 className="animate-spin text-gray-400" size={16} />}>
              <TopLikedSongs />
            </Suspense>
          </div>

          {/* Card 4 - Agenda */}
          <div className="rounded-2xl p-4 bg-white flex-shrink-0 overflow-hidden" style={{ width: "350px", height: "225px", scrollSnapAlign: "start" }}>
            <Suspense fallback={<Loader2 className="animate-spin text-gray-400" size={16} />}>
              <DashboardAgenda />
            </Suspense>
          </div>

          {/* Card 5 - Patrocinadores */}
          <div className="rounded-2xl p-4 bg-white flex-shrink-0 overflow-hidden" style={{ width: "350px", height: "225px", scrollSnapAlign: "start" }}>
            <Suspense fallback={<Loader2 className="animate-spin text-gray-400" size={16} />}>
              <ComercialWidgets />
            </Suspense>
          </div>
        </div>

        {/* Right arrow */}
        <button
          onClick={scrollRight}
          className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 z-10 w-8 h-8 rounded-full bg-black/40 text-white flex items-center justify-center hover:bg-black/60 transition-colors"
        >
          <ChevronDown size={16} className="-rotate-90" />
        </button>
      </div>
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

  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="text-right">
      <p className="text-xl font-light text-white tracking-wider" style={{ fontFamily: "Poppins, sans-serif" }}>{time}</p>
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
        const titulo = doc.querySelector("nome_musica")?.textContent || doc.querySelector("titulo")?.textContent || doc.querySelector("title")?.textContent || "Sem título";
        const artista = doc.querySelector("interprete")?.textContent || doc.querySelector("nome_interprete")?.textContent || doc.querySelector("artista")?.textContent || doc.querySelector("artist")?.textContent || "Desconhecido";
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
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl, { cache: "no-store" });
        const text = await res.text();
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

  if (loading) return null;

  return (
    <div>
      <p className="text-xs text-gray-500 mb-2 font-semibold">🏷️ Patrocinadores Ativos</p>
      <p className="text-3xl font-bold text-gray-800">{totalLogos}</p>
      <p className="text-[10px] text-gray-400 mt-1">logos vinculadas a programas</p>
    </div>
  );
}

/* ========== DASHBOARD AGENDA ========== */
function DashboardAgenda() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());

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
      <div className="flex items-center gap-2">
        <Loader2 size={14} className="text-gray-400 animate-spin" />
        <span className="text-gray-400 text-xs">Carregando...</span>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-600 mb-2">📅 Agenda</h4>
      <DashboardCalendar
        selected={selectedDate}
        onSelect={setSelectedDate}
        eventDates={eventDates}
      />
      {dayEvents.length > 0 && (
        <div className="mt-2 space-y-1">
          {dayEvents.map((evt: any) => (
            <div key={evt.id} className="rounded-lg px-3 py-2 text-xs" style={{ backgroundColor: "#d8f96c" }}>
              <p className="font-semibold text-gray-700">{evt.programa?.nome || "Evento"}</p>
              {evt.programa && <p className="text-gray-600">{evt.programa.horario_inicio} - {evt.programa.horario_fim}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardCalendar({ selected, onSelect, eventDates }: {
  selected: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  eventDates: Date[];
}) {
  return (
    <CalendarUI
      mode="single"
      selected={selected}
      onSelect={onSelect}
      locale={ptBR}
      className="p-0 pointer-events-auto [&_.rdp-day]:h-7 [&_.rdp-day]:w-7 [&_.rdp-day]:text-xs [&_.rdp-day]:text-gray-700 [&_.rdp-day_button]:text-gray-700 [&_.rdp-head_cell]:text-gray-500"
      classNames={{
        caption_label: "text-sm font-semibold text-gray-600",
        nav_button: "h-7 w-7 bg-transparent p-0 text-gray-600 hover:text-gray-900 hover:bg-gray-200 inline-flex items-center justify-center rounded-md",
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",
      }}
      modifiers={{ hasEvent: eventDates }}
      modifiersStyles={{
        hasEvent: { backgroundColor: "#d8f96c", fontWeight: "bold", color: "#333" },
      }}
      styles={{
        day: { color: "#555" },
      }}
    />
  );
}
