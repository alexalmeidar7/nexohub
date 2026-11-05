import { useState, useEffect, useCallback, useRef, Suspense, Fragment } from "react";
import { createPortal } from "react-dom";
import { getPlayerVideoHost } from "@/lib/playerVideoHost";
import { Plus, Link2, BarChart3, CalendarDays, Music, Eye, Users, Mic2, PlaySquare, Newspaper, Settings, ShoppingBag, Tag, Image, Film, ShoppingCart, Monitor, Wrench, Scissors, MonitorPlay, ExternalLink, Loader2, MessageSquareQuote, Radio, Clock, Tv, FileText, CloudSun, ChevronDown, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Circle, User, Star, Minimize2, Maximize2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import { readMusicData, readMusicStart, musicDataKey, musicStartKey, MUSIC_DATA_EVENT, writeMusicData } from "@/lib/musicStorageKeys";
import { resolveEffectiveOnAir, getZonedNow } from "@/lib/onAirResolver";
import AudioSpectrum from "@/components/AudioSpectrum";
import AutoScrollText from "@/components/player/AutoScrollText";
import { lazyRetry } from "@/lib/lazyRetry";
import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { getSnapshotStreamingChannels } from "@/lib/supabaseDatabaseSnapshot";
import { fetchTrackCover, getTrackCoverSync } from "@/lib/musicCoverResolver";


/* Typewriter text component — animates character-by-character on text change */
function TypewriterText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const [displayed, setDisplayed] = useState("");
  const prevText = useRef(text);
  const [isTyping, setIsTyping] = useState(false);

  useEffect(() => {
    if (text === prevText.current && displayed === text) return;
    prevText.current = text;
    setIsTyping(true);
    setDisplayed("");
    let i = 0;
    const iv = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(iv); setIsTyping(false); }
    }, 30);
    return () => clearInterval(iv);
  }, [text]);

  useEffect(() => { if (!displayed && !isTyping) setDisplayed(text); }, []);

  return <span className={className} style={style}>{displayed}{isTyping && <span className="animate-pulse opacity-60">|</span>}</span>;
}

const AgendaPage = lazyRetry(() => import("./AgendaPage"));
const OnAirWidget = lazyRetry(() => import("./OnAirWidget"));
const AudienceWidget = lazyRetry(() => import("./AudienceWidget"));

type Page = "dashboard" | "previsao" | "noticias" | "apresentadores" | "programas" | "musica" | "agenda" | "configuracoes" | "testemunhais" | "promocoes" | "logos" | "curtidas" | "shopping" | "preroll" | "cortevideo" | "playerconfig" | "vmix";

interface DashboardItem {
  id: string;
  type: "link" | "widget";
  /** For links: which page or external URL */
  linkPage?: Page;
  linkExternal?: string;
  linkLabel?: string;
  linkIcon?: string;
  /** For widgets: which widget type */
  widgetType?: "agenda" | "musica" | "stats" | "weather" | "player";
}

const STORAGE_KEY = "nexohub_dashboard_items";

interface DashboardSettingsPayload {
  items?: DashboardItem[];
  layout_colors?: Record<string, unknown>;
  [key: string]: unknown;
}

const NUMERIC_KEY_REGEX = /^\d+$/;

function normalizeDashboardSettings(raw: unknown): DashboardSettingsPayload {
  if (Array.isArray(raw)) {
    return { items: raw as DashboardItem[] };
  }

  if (raw && typeof raw === "object") {
    const payload = { ...(raw as Record<string, unknown>) };
    const numericKeys = Object.keys(payload)
      .filter((key) => NUMERIC_KEY_REGEX.test(key))
      .sort((a, b) => Number(a) - Number(b));

    if (!Array.isArray(payload.items) && numericKeys.length > 0) {
      payload.items = numericKeys
        .map((key) => payload[key])
        .filter(Boolean) as DashboardItem[];
    }

    numericKeys.forEach((key) => {
      delete payload[key];
    });

    if (!Array.isArray(payload.items)) {
      payload.items = [];
    }

    return payload as DashboardSettingsPayload;
  }

  return { items: [] };
}



// Widgets descontinuados — removidos automaticamente ao carregar
const DEPRECATED_WIDGETS = new Set(["agenda", "musica", "weather"]);

const iconMap: Record<string, React.ComponentType<any>> = {
  Mic2, PlaySquare, Newspaper, Music, CalendarDays, Settings, MonitorPlay, MessageSquareQuote,
  Tag, Image, Film, ShoppingCart, Monitor, Scissors, ExternalLink, ShoppingBag, Wrench, Users, FileText,
};

function getIcon(name: string) {
  return iconMap[name] || Link2;
}

interface Props {
  onNavigate: (page: Page) => void;
  effectiveUserId?: string | null;
  isActive?: boolean;
}

export default function CustomizableDashboard({ onNavigate, effectiveUserId, isActive = true }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<DashboardItem[]>([]);
  // Using effectiveUserId from props if provided, otherwise using internal logic as fallback
  const [internalEffectiveUserId, setInternalEffectiveUserId] = useState<string | null>(null);
  const resolvedUserId = effectiveUserId || internalEffectiveUserId || user?.id;

  useEffect(() => {
    if (!user || effectiveUserId) return;
    let cancelled = false;
    supabase.from("sub_users").select("parent_user_id, ativo").eq("auth_user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setInternalEffectiveUserId(data?.ativo ? data.parent_user_id : user.id);
      });
    return () => { cancelled = true; };
  }, [user]);

  const dataUserId = resolvedUserId || effectiveUserId || user?.id;


  const [currentMusic, setCurrentMusic] = useState<{ titulo: string; artista: string; startedAt: number; duracao: number } | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());
  const [onAirSlot, setOnAirSlot] = useState<HTMLElement | null>(null);
  const [footerEl, setFooterEl] = useState<HTMLElement | null>(null);
  const [playerMaxHeight, setPlayerMaxHeight] = useState<number>(400);
  useEffect(() => {
    if (!isActive) return;
    const findSlot = () => {
      setOnAirSlot(document.getElementById("on-air-info-slot"));
      setFooterEl(document.querySelector("footer"));
    };
    findSlot();
    const obs = new MutationObserver(findSlot);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, [isActive]);

  // Dynamically compute player widget height so it fits between the blue on-air box and the page footer
  useEffect(() => {
    if (!isActive) return;
    const compute = () => {
      const anchorTop = onAirSlot?.getBoundingClientRect().bottom ?? 120;
      const footerTop = footerEl?.getBoundingClientRect().top ?? window.innerHeight;
      const isMobile = window.innerWidth < 640;
      const gap = isMobile ? 16 : 32;
      const floor = isMobile ? 55 : 138;
      const ceil = isMobile ? 199 : 260;
      const raw = (footerTop - anchorTop - gap) * 0.765;
      const available = Math.min(ceil, Math.max(floor, raw));
      setPlayerMaxHeight(available);
    };
    compute();
    window.addEventListener("resize", compute);
    const interval = window.setInterval(compute, 2000);
    return () => {
      window.removeEventListener("resize", compute);
      window.clearInterval(interval);
    };
  }, [onAirSlot, footerEl, isActive]);



  // Poll music from per-user localStorage (scoped to prevent cross-tenant leak)
  useEffect(() => {
    if (!dataUserId) return;
    const targetKey = musicDataKey(dataUserId);
    
    const pollMusic = () => {
      try {
        const parsed = readMusicData(dataUserId);
        if (parsed && parsed.titulo) {
          const startedAt = readMusicStart(dataUserId);
          setCurrentMusic(prev => {
            if (prev?.titulo === parsed.titulo && prev?.artista === (parsed.artista || "") && prev?.startedAt === (startedAt || 0)) return prev;
            return {
              titulo: parsed.titulo,
              artista: parsed.artista || "",
              startedAt: startedAt || 0,
              duracao: typeof parsed.duracao === "number" ? parsed.duracao : 0,
            };
          });
          return;
        }
      } catch {}
      setCurrentMusic(null);
    };

    pollMusic();
    
    // Cross-tab updates
    const onStorage = (e: StorageEvent) => {
      if (e.key === targetKey || e.key === musicStartKey(dataUserId)) pollMusic();
    };
    // Same-tab updates via writeMusicData helper
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || detail.userId === dataUserId) pollMusic();
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener(MUSIC_DATA_EVENT, onCustom as EventListener);
    const interval = setInterval(pollMusic, 2000);
    
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MUSIC_DATA_EVENT, onCustom as EventListener);
      clearInterval(interval);
    };
  }, [dataUserId]);

  // Tick every second to update elapsed time / progress bar for the current song
  useEffect(() => {
    if (!currentMusic) return;
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, [currentMusic?.titulo, currentMusic?.startedAt]);


  // Load dashboard items from DB (fallback to localStorage for migration)
  useEffect(() => {
    if (!user) return;
    const DEFAULT_ITEMS: DashboardItem[] = [];
    const stripDeprecated = (arr: DashboardItem[]) =>
      arr.filter(i => i.type !== "link" && !(i.type === "widget" && i.widgetType && (DEPRECATED_WIDGETS.has(i.widgetType) || i.widgetType === "player")));

    const loadItems = async () => {
      // Try DB first
      const { data, error } = await supabase
        .from("user_settings")
        .select("dashboard_items")
        .eq("user_id", dataUserId!)
        .maybeSingle();

      if (error) {
        console.error("Erro ao carregar dashboard_items:", error);
      }

      const normalized = normalizeDashboardSettings(data?.dashboard_items);

      if (Array.isArray(normalized.items) && normalized.items.length > 0) {
        const cleaned = stripDeprecated(normalized.items);
        setItems(cleaned);
        return;
      }

      // Migrate from localStorage if exists
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cleaned = stripDeprecated(parsed as DashboardItem[]);
            setItems(cleaned);
            return;
          }
        }
      } catch {
        // ignore invalid local data
      }

      // Seed defaults
      setItems(DEFAULT_ITEMS);
    };
    loadItems();
  }, [user, dataUserId]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollHint, setShowScrollHint] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      const canScroll = el.scrollHeight > el.clientHeight + 20;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20;
      setShowScrollHint(canScroll && !atBottom);
    };
    check();
    el.addEventListener("scroll", check);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [items]);

  return (
    <div ref={scrollRef} data-home-scroll className="flex flex-col h-full overflow-hidden relative pt-1">
      {/* DashboardPlayerWidget mounted headlessly — provides audio engine + emits player:music events */}
      <div style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none", opacity: 0, zIndex: -999 }}>
        <Suspense fallback={null}>
          <DashboardPlayerWidget
            dataUserId={dataUserId || undefined}
            isActive={isActive}
            onVideoChange={() => {}}
            onCompactChange={() => {}}
          />
        </Suspense>
      </div>

      {/* Spacer to push widgets to bottom */}
      <div className="flex-1" />

      {items.filter(i => i.type === "widget" && i.widgetType !== "player").length > 0 && (
        <div className="mb-2">
          <div className="flex items-center gap-2 mb-3 animate-fade-in">
            <p className="text-[10px] font-bold uppercase tracking-[0.15em]" style={{ color: "#002132" }}>Widgets</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" style={{ gridAutoRows: "auto" }}>
            {items.filter(i => i.type === "widget" && i.widgetType !== "player").map(item => {
              return (
                <Fragment key={item.id}>
                  <div className="relative">
                    <div
                      className="relative group rounded-3xl animate-fade-in flex flex-col"
                      style={{
                        background: "var(--layout-widget-bg, #1a1a1a)",
                        boxShadow: "0 4px 20px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
                        borderRadius: "24px",
                        height: "280px",
                        maxHeight: "280px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        className="flex items-center gap-2 px-5 py-3 flex-shrink-0"
                        style={{ borderBottom: `1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)` }}
                      >
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #0055ff) 15%, transparent)" }}>
                          {item.widgetType === "agenda" && <CalendarDays size={12} style={{ color: "var(--layout-accent-color, #0055ff)" }} />}
                          {item.widgetType === "musica" && <Music size={12} style={{ color: "var(--layout-accent-color, #0055ff)" }} />}
                          {item.widgetType === "stats" && <BarChart3 size={12} style={{ color: "var(--layout-accent-color, #0055ff)" }} />}
                          {item.widgetType === "weather" && <CloudSun size={12} style={{ color: "var(--layout-accent-color, #0055ff)" }} />}
                        </div>
                        <span className="text-[10px] font-semibold" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.6 }}>
                          {item.widgetType === "agenda" ? "Agenda" : item.widgetType === "musica" ? "No Ar" : item.widgetType === "weather" ? "Tempo" : "Estatísticas"}
                        </span>
                      </div>
                      <div className="p-4 flex-1 overflow-y-auto overflow-x-hidden widget-scroll">
                        <Suspense fallback={<Loader2 className="animate-spin" size={18} style={{ color: "var(--layout-icon-color, #888)", opacity: 0.4 }} />}>
                          {item.widgetType === "agenda" && <DashboardAgendaWidget dataUserId={dataUserId || undefined} onNavigate={onNavigate} />}
                          {item.widgetType === "musica" && <MusicProgramWidget dataUserId={dataUserId || undefined} />}
                          {item.widgetType === "stats" && <StatsWidget dataUserId={dataUserId || undefined} />}
                          {item.widgetType === "weather" && <DashboardWeatherWidget />}
                        </Suspense>
                      </div>
                    </div>
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}




      {/* Scroll down hint — visible on hover, auto-scrolls */}
      {showScrollHint && (
        <div
          className="sticky bottom-0 left-0 right-0 flex justify-center py-2 opacity-0 hover:opacity-100 transition-opacity duration-300 cursor-pointer"
          style={{ background: "linear-gradient(0deg, rgba(0,0,0,0.25) 0%, transparent 100%)" }}
          onMouseEnter={() => {
            const el = scrollRef.current;
            if (el) {
              const scrollInterval = setInterval(() => {
                if (!el || el.scrollTop + el.clientHeight >= el.scrollHeight - 5) {
                  clearInterval(scrollInterval);
                  return;
                }
                el.scrollTop += 3;
              }, 16);
              (el as any).__scrollInterval = scrollInterval;
            }
          }}
          onMouseLeave={() => {
            const el = scrollRef.current;
            if (el && (el as any).__scrollInterval) {
              clearInterval((el as any).__scrollInterval);
              delete (el as any).__scrollInterval;
            }
          }}
        >
          <ChevronDown size={18} className="text-white/50 animate-bounce" />
        </div>
      )}
    </div>
  );
}

/* ========== LINK PREVIEW COMPONENT ========== */
function LinkPreview({ page, external }: { page?: Page; external?: string }) {
  switch (page) {
    case "agenda": return <AgendaPreview />;
    case "musica": return <MusicaPreview dataUserId={undefined} />;
    case "noticias": return <NoticiasPreview />;
    case "apresentadores": return <ApresentadoresPreview />;
    case "programas": return <ProgramasPreview />;
    case "promocoes": return <PromosPreview />;
    case "preroll": return <PrerollPreview />;
    case "shopping": return <ShoppingPreview />;
    case "testemunhais": return <GenericPreview icon={MessageSquareQuote} text="Testemunhais ativos" />;
    case "logos": return <GenericPreview icon={Image} text="Logos de patrocinadores" />;
    case "configuracoes": return <GenericPreview icon={Settings} text="Configurações gerais" />;
    case "playerconfig": return <GenericPreview icon={Settings} text="Config. do Player" />;
    case "vmix": return <GenericPreview icon={Monitor} text="Controle de transmissão" />;
    case "cortevideo": return <GenericPreview icon={Scissors} text="Editor de vídeo" />;
    case "curtidas": return <GenericPreview icon={Music} text="Músicas curtidas" />;
    default:
      if (external === "player") return <GenericPreview icon={MonitorPlay} text="Player ao vivo" />;
      if (external === "telapromo") return <GenericPreview icon={Tag} text="Tela de promoções" />;
      return <GenericPreview icon={Link2} text="Atalho rápido" />;
  }
}

function GenericPreview({ icon: Icon, text }: { icon: React.ComponentType<any>; text: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={12} className="text-black/20" />
      <p className="text-black/40 text-[10px]">{text}</p>
    </div>
  );
}

function AgendaPreview() {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    const load = async () => {
      let targetUserId = user.id;
      const { data: subUser } = await supabase.from("sub_users").select("parent_user_id, ativo").eq("auth_user_id", user.id).maybeSingle();
      if (subUser?.ativo && subUser.parent_user_id) targetUserId = subUser.parent_user_id;

      supabase.from("agenda_eventos").select("data, descricao").eq("user_id", targetUserId).gte("data", today).order("data").limit(3)
        .then(({ data }) => { if (data) setEvents(data); });
    };
    load();
  }, [user]);

  const today = new Date();
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <p className="text-black/50 text-[10px] font-bold">{format(today, "dd MMM", { locale: ptBR }).toUpperCase()}</p>
      </div>
      {events.length === 0 ? (
        <p className="text-black/30 text-[10px]">Sem eventos próximos</p>
      ) : (
        <div className="space-y-1">
          {events.map((ev, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: "#be0101" }} />
              <p className="text-black/50 text-[10px] truncate">{ev.descricao || format(new Date(ev.data + "T12:00:00"), "dd/MM")}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MusicaPreview({ dataUserId: dataUserIdProp }: { dataUserId?: string } = {}) {
  const { user: previewUser } = useAuth();
  const dataUserId = dataUserIdProp || previewUser?.id;
  const [music, setMusic] = useState<any>(null);
  const [programa, setPrograma] = useState("");
  useEffect(() => {
    const update = () => {
      try {
        const d = readMusicData(dataUserId) as any;
        if (d) {
          if (d.titulo !== undefined || d.excecao) setMusic(d);
          if (d.programa) setPrograma(d.programa);
        }
      } catch {}
    };
    update();
    const iv = setInterval(update, 3000);
    return () => clearInterval(iv);
  }, [dataUserId]);
  return music ? (
    <div className="flex items-center gap-2.5">
      {(music.excecao?.capa_url || music.capa) ? (
        <img src={music.excecao?.capa_url || music.capa} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 shadow-md" />
      ) : (
        <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "color-mix(in srgb, var(--layout-accent-color) 14%, transparent)" }}>
          <Music size={16} style={{ color: "var(--layout-accent-color)" }} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-black text-[11px] font-bold truncate leading-tight">{music.titulo}</p>
        <p className="text-black/50 text-[10px] truncate">{music.artista}</p>
        {programa && (
          <p className="text-[9px] mt-0.5 truncate" style={{ color: "var(--layout-accent-color)" }}>🔴 {programa}</p>
        )}
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color) 8%, transparent)" }}>
        <Music size={14} className="text-black/20" />
      </div>
      <p className="text-black/30 text-[10px]">Sem música no ar</p>
    </div>
  );
}

function NoticiasPreview() {
  const { user } = useAuth();
  const [news, setNews] = useState<any[]>([]);
  useEffect(() => {
    if (!user) return;
    supabase.from("selected_news").select("title").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2)
      .then(({ data }) => { if (data) setNews(data); });
  }, [user]);
  return news.length > 0 ? (
    <div className="space-y-1">
      {news.map((n, i) => (
        <p key={i} className="text-black/50 text-[10px] truncate leading-tight">• {n.title}</p>
      ))}
    </div>
  ) : <p className="text-black/30 text-[10px]">Sem notícias salvas</p>;
}

function ApresentadoresPreview() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("apresentadores").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      .then(({ count: c }) => setCount(c || 0));
  }, [user]);
  return <p className="text-black/50 text-[10px]">{count} apresentador{count !== 1 ? "es" : ""} cadastrado{count !== 1 ? "s" : ""}</p>;
}

function ProgramasPreview() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("programas").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("ativo", true).ilike("estudio", "%fm%")
      .then(({ count: c }) => setCount(c || 0));
  }, [user]);
  return <p className="text-black/50 text-[10px]">{count} programa{count !== 1 ? "s" : ""} ativo{count !== 1 ? "s" : ""}</p>;
}

function PromosPreview() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    supabase.from("promocoes").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("data_fim", today)
      .then(({ count: c }) => setCount(c || 0));
  }, [user]);
  return <p className="text-black/50 text-[10px]">{count} promoção{count !== 1 ? "ões" : ""} ativa{count !== 1 ? "s" : ""}</p>;
}

function PrerollPreview() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("comercial_preroll").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true)
      .then(({ count: c }) => setCount(c || 0));
  }, [user]);
  return <p className="text-black/50 text-[10px]">{count} pre-roll{count !== 1 ? "s" : ""} ativo{count !== 1 ? "s" : ""}</p>;
}

function ShoppingPreview() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("shopping_products").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true)
      .then(({ count: c }) => setCount(c || 0));
  }, [user]);
  return <p className="text-black/50 text-[10px]">{count} produto{count !== 1 ? "s" : ""} ativo{count !== 1 ? "s" : ""}</p>;
}

/* ========== WIDGET: Agenda ========== */
function DashboardAgendaWidget({ dataUserId, onNavigate }: { dataUserId?: string; onNavigate: (page: Page) => void }) {
  const { user } = useAuth();
  const uid = dataUserId || user?.id;
  const [events, setEvents] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());

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

  const getFeriadoNome = (date: Date) => {
    const f = feriadosNacionais.find(h => h.dia === date.getDate() && h.mes === (date.getMonth() + 1));
    return f ? f.nome : null;
  };


  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 30000); // Atualiza a cada 30s para recalcular horários passados
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user || !uid) return;
    let cancelled = false;
    const load = async () => {
      const today = new Date();
      const todayStr = today.toISOString().split("T")[0];
      const [evtsRes, progsRes] = await Promise.all([
        supabase
          .from("agenda_eventos")
          .select("*, programa:programas(horario_inicio, horario_fim)")
          .eq("user_id", uid)
          .gte("data", todayStr)
          .not("status", "in", '("cancelado","concluido")')
          .order("data", { ascending: true })
          .limit(20),
        supabase
          .from("programas")
          .select("id, nome, horario_inicio, horario_fim, dias_semana, ativo")
          .eq("user_id", uid)
          .eq("ativo", true),
      ]);
      if (cancelled) return;

      const evts: any[] = evtsRes.data || [];
      const progs: any[] = progsRes.data || [];

      // Synthesize upcoming events from programs (next 7 days) so that a
      // freshly-configured account with programs but no manual events still
      // shows something in the dashboard agenda widget.
      const DAY_INDEX: Record<string, number> = {
        domingo: 0, segunda: 1, terca: 2, "terça": 2,
        quarta: 3, quinta: 4, sexta: 5, sabado: 6, "sábado": 6,
      };
      const synthetic: any[] = [];
      for (let offset = 0; offset < 7; offset++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
        const dow = d.getDay();
        const dStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        for (const p of progs) {
          const dias = Array.isArray(p.dias_semana) ? p.dias_semana : [];
          const matches = dias.some((s: string) => DAY_INDEX[String(s).trim().toLowerCase()] === dow);
          if (!matches) continue;
          synthetic.push({
            id: `prog-${p.id}-${dStr}`,
            data: dStr,
            descricao: p.nome,
            tipo_evento: "live",
            programa: { horario_inicio: p.horario_inicio, horario_fim: p.horario_fim },
            _synthetic: true,
            _sortKey: `${dStr} ${p.horario_inicio || "99:99"}`,
          });
        }
      }

      // Merge: prefer real events; only add synthetic if no real event covers same program+date
      const seen = new Set(evts.map((e: any) => `${e.data}|${e.programa_id || ""}`));
      const merged = [
        ...evts,
        ...synthetic.filter(s => {
          const progId = s.id.split("-")[1];
          return !seen.has(`${s.data}|${progId}`);
        }),
      ].sort((a, b) => {
        const ka = `${a.data} ${a.programa?.horario_inicio || a.horario_gravacao || "99:99"}`;
        const kb = `${b.data} ${b.programa?.horario_inicio || b.horario_gravacao || "99:99"}`;
        return ka.localeCompare(kb);
      });

      setEvents(merged);
    };
    load();
    return () => { cancelled = true; };
  }, [user, uid]);

  const todayStr = format(now, "yyyy-MM-dd");
  const currentTime = format(now, "HH:mm");

  const filteredEvents = events.filter(ev => {
    // Filtragem adicional no cliente para horário final da gravação
    const isToday = ev.data === todayStr;
    if (isToday && ev.horario_gravacao_fim && ev.horario_gravacao_fim < currentTime) {
      return false;
    }
    return true;
  }).slice(0, 5); // Mantém o limite visual de 5 itens

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={14} style={{ color: "var(--layout-accent-color)" }} />
        <p className="font-bold text-sm" style={{ color: "var(--layout-widget-text)" }}>Agenda de Eventos</p>
        {getFeriadoNome(now) && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-[8px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded-full uppercase tracking-tighter animate-pulse shadow-sm shadow-red-500/50 cursor-help">
                  Feriado
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="bg-red-600 text-white border-red-500">
                <p className="text-[10px] font-bold">{getFeriadoNome(now)}</p>
                <p className="text-[9px] opacity-90">{format(now, "dd/MM")}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {filteredEvents.length > 0 && (
          <span
            className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{
              background: "color-mix(in srgb, var(--layout-accent-color) 20%, transparent)",
              color: "var(--layout-accent-color)",
            }}
          >
            {filteredEvents.length}
          </span>
        )}
      </div>
      {filteredEvents.length === 0 ? (
        <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-widget-text) 35%, transparent)" }}>Nenhum evento próximo</p>
      ) : (
        <div className="space-y-1">
          {filteredEvents.map(ev => {
            const _now = new Date();
            const todayStr = `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
            const _tomorrow = new Date(_now.getFullYear(), _now.getMonth(), _now.getDate() + 1);
            const tomorrowStr = `${_tomorrow.getFullYear()}-${String(_tomorrow.getMonth() + 1).padStart(2, "0")}-${String(_tomorrow.getDate()).padStart(2, "0")}`;
            const isToday = ev.data === todayStr;
            const isTomorrow = ev.data === tomorrowStr;
            const evDate = new Date(ev.data + "T12:00:00");
            const day = evDate.toLocaleDateString("pt-BR", { day: "2-digit" });
            const month = evDate.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "").toUpperCase();
            const tipo = (ev.tipo_evento || "").toString().toUpperCase();
            const titulo = (ev.descricao || "Evento").split("/")[0].trim();
            return (
              <div
                key={ev.id}
                className={`agenda-event-item flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer ${isToday ? "agenda-today-pulse" : ""}`}
                style={{
                  background: "color-mix(in srgb, var(--layout-widget-text) 5%, transparent)",
                  border: isToday
                    ? "1px solid color-mix(in srgb, var(--layout-accent-color) 55%, transparent)"
                    : "1px solid color-mix(in srgb, var(--layout-widget-text) 8%, transparent)",
                  transition: "all 0.25s ease",
                }}
                onClick={() => {
                  try {
                    sessionStorage.setItem("agenda_focus_event", JSON.stringify({ id: ev.id, data: ev.data }));
                  } catch {}
                  onNavigate("agenda");
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = "var(--layout-widget-text)";
                  e.currentTarget.style.transform = "translateX(4px)";
                  e.currentTarget.style.borderColor = "var(--layout-widget-text)";
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = "color-mix(in srgb, var(--layout-widget-text) 5%, transparent)";
                  e.currentTarget.style.transform = "translateX(0)";
                  e.currentTarget.style.borderColor = isToday
                    ? "color-mix(in srgb, var(--layout-accent-color) 55%, transparent)"
                    : "color-mix(in srgb, var(--layout-widget-text) 8%, transparent)";
                }}
              >
                <div
                  className="flex flex-col items-center justify-center shrink-0 rounded-md px-1.5 py-1 leading-none"
                  style={{
                    background: "color-mix(in srgb, var(--layout-widget-text) 10%, transparent)",
                    minWidth: "36px",
                  }}
                >
                  <span className="text-sm font-black" style={{ color: "var(--layout-widget-text)" }}>{day}</span>
                  <span className="text-[8px] font-semibold tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-widget-text) 55%, transparent)" }}>{month}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate leading-tight" style={{ color: "var(--layout-widget-text)" }}>
                    {titulo}
                  </p>
                  {getFeriadoNome(evDate) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center gap-1 mt-0.5 cursor-help">
                            <Star size={8} className="text-red-500 fill-red-500" />
                            <span className="text-[8px] font-bold text-red-500 uppercase tracking-tight">Feriado</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-red-600 text-white border-red-500">
                          <p className="text-[10px] font-bold">{getFeriadoNome(evDate)}</p>
                          <p className="text-[9px] opacity-90">{format(evDate, "dd 'de' MMMM", { locale: ptBR })}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {(() => {
                    const isGravacao = (ev.tipo_evento || "").toString().toLowerCase() === "gravacao";
                    const horarioExibido = isGravacao
                      ? (ev.horario_gravacao || ev.programa?.horario_inicio)
                      : ev.programa?.horario_inicio;
                    return (
                  <div className="flex items-center gap-1.5 mt-1">
                    {horarioExibido && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-px rounded tabular-nums"
                        style={{
                          background: "color-mix(in srgb, var(--layout-accent-color) 18%, transparent)",
                          color: "var(--layout-widget-text)",
                        }}
                      >
                        {String(horarioExibido).slice(0, 5)}
                      </span>
                    )}
                    {tipo && (
                      <span
                        className="text-[8px] font-semibold px-1.5 py-px rounded uppercase tracking-wide"
                        style={{
                          background: "color-mix(in srgb, var(--layout-widget-text) 12%, transparent)",
                          color: "color-mix(in srgb, var(--layout-widget-text) 75%, transparent)",
                        }}
                      >
                        {tipo}
                      </span>
                    )}
                    {ev.local && (
                      <span className="text-[9px] truncate" style={{ color: "color-mix(in srgb, var(--layout-widget-text) 50%, transparent)" }}>
                        {ev.local}
                      </span>
                    )}
                    {(isToday || isTomorrow) && (
                      <span
                        className="text-[8px] font-bold ml-auto shrink-0 px-1.5 py-px rounded-full"
                        style={{
                          background: "var(--layout-accent-color)",
                          color: "#000",
                        }}
                      >
                        {isToday ? "HOJE" : "AMANHÃ"}
                      </span>
                    )}
                  </div>
                    );
                  })()}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="mt-auto pt-3">
        <button
          onClick={() => onNavigate("agenda")}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all hover:scale-105"
          style={{
            background: "rgba(255,255,255,0.08)",
            color: "var(--layout-accent-color)",
            boxShadow: "0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}
        >
          <Plus size={10} /> Adicionar evento
        </button>
      </div>
    </div>
  );
}

/* ========== WIDGET: Music + Program ========== */
function MusicProgramWidget({ dataUserId }: { dataUserId?: string } = {}) {
  const { user } = useAuth();
  const uid = dataUserId || user?.id;
  const [music, setMusic] = useState<{ titulo: string; artista: string; capa: string; excecao?: any } | null>(null);
  const [musicKey, setMusicKey] = useState(0);
  const [programa, setPrograma] = useState<string>("");
  const [currentProgram, setCurrentProgram] = useState<any>(null);
  const [programKey, setProgramKey] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [total, setTotal] = useState(0);

  // Fetch music data from localStorage
  useEffect(() => {
    let prevTitle = "";
    const update = () => {
      try {
        const d = readMusicData(dataUserId) as any;
        if (d) {
          if ((d.titulo !== undefined || d.excecao) && d.titulo !== prevTitle) {
            prevTitle = d.titulo;
            setMusic(d);
            setMusicKey(k => k + 1);
          }
          if (d.programa) setPrograma(d.programa);
        }
      } catch {}
    };
    update();
    const interval = setInterval(update, 3000);
    return () => clearInterval(interval);
  }, [dataUserId]);

  // Fetch current program from DB — usa fuso horário da empresa (evita
  // "sem programa" quando o navegador está em fuso diferente do da rádio).
  useEffect(() => {
    if (!uid) return;
    let prevProgramId = "";
    let cancelled = false;
    const fetchProgram = async () => {
      const [{ data: empresa }, { data: programas }] = await Promise.all([
        supabase
          .from("empresa_config")
          .select("timezone")
          .eq("user_id", uid)
          .maybeSingle(),
        supabase
          .from("programas")
          .select("*, apresentadores(nome, foto)")
          .eq("user_id", uid)
          .eq("ativo", true)
          .ilike("estudio", "%fm%"),
      ]);
      if (cancelled) return;
      const tz = empresa?.timezone || null;
      const { current } = resolveEffectiveOnAir((programas as any[]) || [], new Date(), tz);
      if (current) {
        if (current.id !== prevProgramId) {
          prevProgramId = current.id;
          setProgramKey(k => k + 1);
        }
        setCurrentProgram(current);
        const { hhmm } = getZonedNow(tz);
        const [nowH, nowM] = hhmm.split(":").map(Number);
        const [startH, startM] = String(current.horario_inicio).split(":").map(Number);
        const [endH, endM] = String(current.horario_fim).split(":").map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;
        const nowMin = nowH * 60 + nowM;
        setTotal(endMin - startMin);
        setElapsed(nowMin - startMin);
      } else {
        prevProgramId = "";
        setCurrentProgram(null);
      }
    };
    fetchProgram();
    const iv = setInterval(fetchProgram, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [uid]);


  // Update elapsed every minute
  useEffect(() => {
    if (!currentProgram) return;
    const iv = setInterval(() => {
      const now = new Date();
      const [startH, startM] = currentProgram.horario_inicio.split(":").map(Number);
      const startMin = startH * 60 + startM;
      const nowMin = now.getHours() * 60 + now.getMinutes();
      setElapsed(nowMin - startMin);
    }, 60000);
    return () => clearInterval(iv);
  }, [currentProgram]);

  const progressPercent = total > 0 ? Math.min(100, Math.max(0, (elapsed / total) * 100)) : 0;
  const apresentador = currentProgram?.apresentadores;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Music size={14} style={{ color: "var(--layout-icon-color, #888)" }} />
        <p className="font-bold text-sm" style={{ color: "var(--layout-widget-text, #fff)" }}>No Ar</p>
      </div>

      {/* Current Program */}
      {currentProgram && (
        <div key={`prog-${programKey}`} className="flex items-center gap-3 mb-3 px-3 py-2.5 rounded-xl animate-fade-in" style={{ background: `color-mix(in srgb, var(--layout-button-bg, #0f1058) 6%, transparent)` }}>
          {apresentador?.foto ? (
            <img src={apresentador.foto} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0" style={{ border: `2px solid color-mix(in srgb, var(--layout-button-bg, #0f1058) 30%, transparent)` }} />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: `color-mix(in srgb, var(--layout-button-bg, #0f1058) 15%, transparent)` }}>
              <Mic2 size={14} style={{ color: "var(--layout-icon-color, #888)" }} />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Radio size={10} className="animate-pulse flex-shrink-0" style={{ color: "var(--layout-button-bg, #0f1058)" }} />
              <p className="text-xs font-bold truncate" style={{ color: "var(--layout-widget-text, #fff)" }}>{currentProgram.nome}</p>
            </div>
            {apresentador?.nome && (
              <p className="text-[10px] truncate" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.5 }}>{apresentador.nome}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: `color-mix(in srgb, var(--layout-widget-text, #fff) 8%, transparent)` }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progressPercent}%`, background: `linear-gradient(90deg, var(--layout-accent-color, #444), var(--layout-button-bg, #0f1058))` }}
                />
              </div>
              <span className="text-[8px] font-semibold flex-shrink-0" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.4 }}>
                {currentProgram.horario_inicio} — {currentProgram.horario_fim}
              </span>
            </div>
          </div>
        </div>
      )}

      {!currentProgram ? (
        <p className="text-xs" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.3 }}>Sem programa no momento</p>
      ) : null}
    </div>
  );
}

/* ========== WIDGET: Stats ========== */
function StatsWidget({ dataUserId }: { dataUserId?: string } = {}) {
  const { user } = useAuth();
  const uid = dataUserId || user?.id;
  const [prerollCount, setPrerollCount] = useState(0);
  const [channelCount, setChannelCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("comercial_preroll").select("id", { count: "exact", head: true }).eq("user_id", uid!).eq("active", true),
      supabase.from("streaming_channels").select("id", { count: "exact", head: true }).eq("user_id", uid!).eq("active", true),
    ]).then(([pr, ch]) => {
      setPrerollCount(pr.count || 0);
      setChannelCount(ch.count || 0);
    });
  }, [user]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 size={14} style={{ color: "var(--layout-icon-color, #888)" }} />
        <p className="font-bold text-sm" style={{ color: "var(--layout-widget-text, #fff)" }}>Dados Estatísticos</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="px-3 py-3 rounded-xl text-center" style={{ background: `color-mix(in srgb, var(--layout-button-bg, #0f1058) 6%, transparent)` }}>
          <p className="text-2xl font-bold" style={{ color: "var(--layout-widget-text, #fff)" }}>{prerollCount}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.4 }}>Pre-rolls Ativos</p>
        </div>
        <div className="px-3 py-3 rounded-xl text-center" style={{ background: `color-mix(in srgb, var(--layout-button-bg, #0f1058) 6%, transparent)` }}>
          <p className="text-2xl font-bold" style={{ color: "var(--layout-widget-text, #fff)" }}>{channelCount}</p>
          <p className="text-[10px] mt-0.5" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.4 }}>Canais Ativos</p>
        </div>
      </div>
    </div>
  );
}

/* ========== WIDGET: Weather ========== */
function DashboardWeatherWidget() {
  const [weather, setWeather] = useState<any>(null);
  const [weatherKey, setWeatherKey] = useState(0);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Get primary city from localStorage (set by PrevisaoTempo module)
        const primaryRaw = localStorage.getItem("masterview_primary_city");
        let lat: number, lon: number, cityName: string;

        if (primaryRaw) {
          const primary = JSON.parse(primaryRaw);
          lat = primary.lat;
          lon = primary.lon;
          cityName = primary.name;
        } else {
          // Fallback: try last searched city
          const lastCity = localStorage.getItem("masterview_last_city");
          if (!lastCity) {
            setWeather(null);
            return;
          }
          // Geocode
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(lastCity)}&count=1&language=pt`);
          const geoData = await geoRes.json();
          if (!geoData.results?.length) return;
          lat = geoData.results[0].latitude;
          lon = geoData.results[0].longitude;
          cityName = geoData.results[0].name;
        }

        const wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=2`);
        const wxData = await wxRes.json();

        const current = {
          temp: Math.round(wxData.current.temperature_2m),
          weatherCode: wxData.current.weather_code,
          humidity: wxData.current.relative_humidity_2m,
          tempMin: Math.round(wxData.daily.temperature_2m_min[0]),
          tempMax: Math.round(wxData.daily.temperature_2m_max[0]),
          rainChance: wxData.daily.precipitation_probability_max[0] ?? 0,
        };

        const tomorrow = wxData.daily.time[1] ? {
          date: wxData.daily.time[1],
          tempMin: Math.round(wxData.daily.temperature_2m_min[1]),
          tempMax: Math.round(wxData.daily.temperature_2m_max[1]),
          weatherCode: wxData.daily.weather_code[1],
          rainChance: wxData.daily.precipitation_probability_max[1] ?? 0,
        } : null;

        setWeather((prev: any) => {
          const newTemp = Math.round(wxData.current.temperature_2m);
          if (!prev || prev.current.temp !== newTemp) setWeatherKey(k => k + 1);
          return { city: cityName, current, tomorrow };
        });
      } catch {}
    };

    fetchWeather();
    const iv = setInterval(fetchWeather, 5 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const weatherLabels: Record<number, string> = {
    0: "Céu limpo", 1: "Parc. limpo", 2: "Parc. nublado", 3: "Nublado",
    45: "Neblina", 48: "Neblina", 51: "Garoa", 53: "Garoa", 55: "Garoa forte",
    61: "Chuva leve", 63: "Chuva", 65: "Chuva forte",
    80: "Pancadas", 81: "Pancadas", 82: "Pancadas fortes",
    95: "Tempestade", 96: "Tempestade", 99: "Tempestade",
  };

  const getLabel = (code: number) => {
    const closest = Object.keys(weatherLabels).map(Number)
      .reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
    return weatherLabels[closest] || "—";
  };

  const formatTomorrow = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" });
  };

  // Lazy import WeatherIcon
  const [WeatherIconComp, setWeatherIconComp] = useState<React.ComponentType<any> | null>(null);
  useEffect(() => {
    import("./WeatherIcons").then(mod => setWeatherIconComp(() => mod.WeatherIcon));
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CloudSun size={14} style={{ color: "var(--layout-icon-color, #888)" }} />
        <p className="font-bold text-sm" style={{ color: "var(--layout-widget-text, #fff)" }}>Previsão do Tempo</p>
        {weather && <span className="text-[9px] ml-auto" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.4 }}>{weather.city}</span>}
      </div>
      {weather ? (
        <div key={`wx-${weatherKey}`} className="flex gap-3 animate-fade-in">
          {/* Hoje */}
          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: `color-mix(in srgb, var(--layout-button-bg, #0f1058) 5%, transparent)` }}>
            <div className="flex-shrink-0">
              {WeatherIconComp && <WeatherIconComp code={weather.current.weatherCode} size={40} />}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.5 }}>Hoje</p>
              <p className="text-2xl font-bold leading-none" style={{ color: "var(--layout-button-bg, #0f1058)" }}>{weather.current.temp}°</p>
              <p className="text-[9px] mt-0.5" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.5 }}>↑{weather.current.tempMax}° ↓{weather.current.tempMin}°</p>
            </div>
          </div>

          {/* Amanhã */}
          {weather.tomorrow && (
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: `color-mix(in srgb, var(--layout-button-bg, #0f1058) 5%, transparent)` }}>
              <div className="flex-shrink-0">
                {WeatherIconComp && <WeatherIconComp code={weather.tomorrow.weatherCode} size={32} forceDay />}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.5 }}>Amanhã</p>
                <p className="text-sm font-bold leading-none" style={{ color: "var(--layout-widget-text, #fff)" }}>{weather.tomorrow.tempMax}° / {weather.tomorrow.tempMin}°</p>
                <p className="text-[9px] mt-0.5" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.4 }}>{getLabel(weather.tomorrow.weatherCode)}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-xs" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.3 }}>Configure uma cidade no módulo Previsão do Tempo</p>
      )}
    </div>
  );
}

/* ========== WIDGET: Player ========== */
function VolumeSliderControl({ compactMode, isMuted, volume, toggleMute, handleVolume }: { compactMode: boolean; isMuted: boolean; volume: number; toggleMute: () => void; handleVolume: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);
  const cancelClose = () => {
    if (closeTimerRef.current) { window.clearTimeout(closeTimerRef.current); closeTimerRef.current = null; }
  };
  const scheduleClose = () => {
    cancelClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 700);
  };
  useEffect(() => () => cancelClose(), []);

  return (
    <div className="relative" onMouseEnter={() => { cancelClose(); setOpen(true); }} onMouseLeave={scheduleClose}>
      <button
        onClick={toggleMute}
        className={`${compactMode ? "w-7 h-7" : "w-8 h-8 sm:w-9 sm:h-9"} rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-md bg-white/10 hover:bg-white/20 border border-white/10 text-white`}
        title={isMuted ? "Ativar som" : "Mudo"}
      >
        {isMuted || volume === 0
          ? <VolumeX size={compactMode ? 12 : 13} className="text-white/70" />
          : <Volume2 size={compactMode ? 12 : 13} className="text-white" />}
      </button>
      {/* Invisible bridge so cursor can travel from button to slider without gap */}
      <div
        className="absolute right-full top-0 h-full"
        style={{ width: 12, pointerEvents: open ? "auto" : "none" }}
      />
      <div
        className="absolute right-full top-1/2 -translate-y-1/2 mr-1.5 z-30"
        style={{
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transform: `translateY(-50%) translateX(${open ? "0" : "6px"})`,
          transition: "opacity 200ms ease, transform 200ms ease",
        }}
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
      >
        <div className="rounded-full px-2.5 py-1.5 sm:px-3 sm:py-2 flex items-center shadow-xl border border-white/10" style={{ background: "rgba(0, 30, 45, 0.95)", backdropFilter: "blur(16px)" }}>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={isMuted ? 0 : volume}
            onChange={e => handleVolume(Number(e.target.value))}
            onMouseDown={e => e.stopPropagation()}
            onTouchStart={e => e.stopPropagation()}
            onDragStart={e => { e.stopPropagation(); e.preventDefault(); }}
            draggable={false}
            className="volume-slider-nexo h-1 appearance-none rounded-full cursor-pointer w-20 sm:w-24"
            style={{
              background: `linear-gradient(to right, #0055ff ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.2) ${(isMuted ? 0 : volume) * 100}%)`,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function DashboardPlayerWidget({ dataUserId, onVideoChange, onCompactChange, isActive = true }: { dataUserId?: string; onVideoChange?: (active: boolean) => void; onCompactChange?: (compact: boolean) => void; isActive?: boolean }) {
  const { user } = useAuth();
  const uid = dataUserId || user?.id;
  const volumeStorageKey = uid ? `dashboard_player_volume_${uid}` : "dashboard_player_volume_anon";
  const mutedStorageKey = uid ? `dashboard_player_muted_${uid}` : "dashboard_player_muted_anon";
  const compactStorageKey = uid ? `dashboard_player_compact_${uid}` : "dashboard_player_compact_anon";
  const [compactMode, setCompactMode] = useState(() => {
    try { return localStorage.getItem(compactStorageKey) === "1"; } catch { return false; }
  });
  const [channels, setChannels] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const isPlayingRef = useRef(false);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  const [isMuted, setIsMuted] = useState(() => {
    try { return localStorage.getItem(mutedStorageKey) === "1"; } catch { return false; }
  });
  const [volume, setVolume] = useState(() => {
    try {
      const raw = localStorage.getItem(volumeStorageKey);
      const v = raw != null ? Number(raw) : NaN;
      return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.8;
    } catch { return 0.8; }
  });
  const [showVideo, setShowVideo] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [currentMusic, setCurrentMusic] = useState<{ titulo: string; artista: string; capa: string; excecao?: any } | null>(null);

  // Persist volume/mute per user
  useEffect(() => {
    try { localStorage.setItem(volumeStorageKey, String(volume)); } catch {}
  }, [volume, volumeStorageKey]);
  useEffect(() => {
    try { localStorage.setItem(mutedStorageKey, isMuted ? "1" : "0"); } catch {}
  }, [isMuted, mutedStorageKey]);

  // Re-hydrate when user id changes (switching accounts)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(volumeStorageKey);
      const v = raw != null ? Number(raw) : NaN;
      if (Number.isFinite(v) && v >= 0 && v <= 1) setVolume(v);
      setIsMuted(localStorage.getItem(mutedStorageKey) === "1");
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // Parent passes inline arrow fns for these callbacks, so they change identity
  // every render. Depending on them here causes an infinite update loop (freezes
  // the widget on BREAK). Only re-run when the underlying state actually changes.
  useEffect(() => { onVideoChange?.(showVideo); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [showVideo]);
  useEffect(() => {
    try { localStorage.setItem(compactStorageKey, compactMode ? "1" : "0"); } catch {}
    onCompactChange?.(compactMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compactMode, compactStorageKey]);
  useEffect(() => {
    try { setCompactMode(localStorage.getItem(compactStorageKey) === "1"); } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const prefetchRef = useRef<{ url: string; audio: HTMLAudioElement } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoHost] = useState<HTMLElement | null>(() => getPlayerVideoHost());
  const hlsRef = useRef<any>(null);
  const hlsInitUrlRef = useRef<string>("");
  const audioCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!uid) return;
    const fetchChannels = async () => {
      // 1. Direct query
      let { data } = await supabase
        .from("streaming_channels")
        .select("*")
        .eq("user_id", uid)
        .eq("active", true)
        .neq("type", "catalog")
        .order("numero_canal");

      if (data && data.length > 0) {
        setChannels(data);
        return;
      }

      // 2. Synchronous station database cache
      const syncData = getStationDatabaseSync(uid || user?.email);
      if (syncData?.channels && syncData.channels.length > 0) {
        setChannels(syncData.channels);
        return;
      }

      // 2.5. Snapshot channels fallback
      const snapChannels = getSnapshotStreamingChannels(uid || user?.email);
      const activeSnap = snapChannels?.filter((c: any) => c.active && c.type !== "catalog");
      if (activeSnap && activeSnap.length > 0) {
        setChannels(activeSnap);
        return;
      }

      // 3. Remote station database edge function
      const stationData = await fetchStationDatabaseData(uid || user?.email);
      if (stationData?.channels && stationData.channels.length > 0) {
        setChannels(stationData.channels);
        return;
      }

      // 4. Fallback to all active channels
      const { data: allActive } = await supabase
        .from("streaming_channels")
        .select("*")
        .eq("active", true)
        .neq("type", "catalog")
        .order("numero_canal");
      if (allActive && allActive.length > 0) {
        setChannels(allActive);
      }
    };
    fetchChannels();
  }, [uid, user?.email]);

  useEffect(() => {
    if (channels.length > 0 && activeIdx >= channels.length) {
      setActiveIdx(0);
    }
  }, [channels, activeIdx]);

  useEffect(() => {
    const effectiveUid = dataUserId || uid;
    const targetKey = musicDataKey(effectiveUid);
    let cancelled = false;

    const fetchFromDb = async () => {
      if (!effectiveUid) return;
      try {
        const { data } = await supabase
          .from("user_settings")
          .select("dashboard_items")
          .eq("user_id", effectiveUid)
          .maybeSingle();
        if (cancelled) return;
        const di = (data?.dashboard_items || {}) as any;
        const titulo = (di.music_current_title || "").toString().trim();
        const artista = (di.music_current_artist || "").toString().trim();
        const capa = (di.music_current_cover || "").toString();
        const excecao = di.music_current_excecao || null;
        if (titulo || excecao) {
          setCurrentMusic(prev => {
            if (prev?.titulo === titulo && prev?.artista === artista && prev?.capa === capa && prev?.excecao === excecao) return prev;
            return { titulo, artista, capa, excecao };
          });
        }
      } catch {}
    };

    const poll = () => {
      try {
        const d = readMusicData(effectiveUid) as any;
        if (d && (d.titulo || d.excecao)) {
          setCurrentMusic(prev => {
            if (prev?.titulo === d.titulo && prev?.artista === (d.artista || "") && prev?.capa === (d.capa || "") && prev?.excecao === (d.excecao || null)) return prev;
            return { titulo: d.titulo || "", artista: d.artista || "", capa: d.capa || "", excecao: d.excecao || null };
          });
          return;
        }
      } catch {}
      // localStorage empty → try DB (mirrored fields written by MusicaNoAr / useGlobalMusicSync)
      void fetchFromDb();
    };
    poll();
    // Cross-tab: fires when another tab writes to localStorage
    const onStorage = (e: StorageEvent) => {
      if (!targetKey || e.key === targetKey) poll();
    };
    // Same-tab: fires when writeMusicData runs in this window
    const onCustom = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !effectiveUid || detail.userId === effectiveUid) poll();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(MUSIC_DATA_EVENT, onCustom as EventListener);
    // Supabase Realtime subscriptions for instant live cover and track updates
    let settingsSub: any = null;
    let musicasSub: any = null;
    if (effectiveUid) {
      settingsSub = supabase
        .channel(`music-user-settings-${effectiveUid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "user_settings",
            filter: `user_id=eq.${effectiveUid}`,
          },
          () => {
            void fetchFromDb();
          }
        )
        .subscribe();

      musicasSub = supabase
        .channel(`music-history-${effectiveUid}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "musicas_tocadas",
            filter: `user_id=eq.${effectiveUid}`,
          },
          () => {
            void fetchFromDb();
          }
        )
        .subscribe();
    }

    const iv = setInterval(poll, 1500);
    // Periodic DB refresh so the widget catches updates written while the user
    // isn't on the MúsicaNoAr page (which is the only writer of localStorage).
    const dbIv = setInterval(fetchFromDb, 2500);
    return () => {
      cancelled = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MUSIC_DATA_EVENT, onCustom as EventListener);
      clearInterval(iv);
      clearInterval(dbIv);
      if (settingsSub) supabase.removeChannel(settingsSub);
      if (musicasSub) supabase.removeChannel(musicasSub);
    };
  }, [dataUserId, uid]);


  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "none";
      // Note: crossOrigin intentionally NOT set — many radio streams lack CORS headers
      // and setting it would break playback. Analyser will taint silently; we handle that below.
      audioRef.current = audio;
    }
    return () => {
      // Cleanup: stop all playback when widget unmounts
      if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
      try { audioCleanupRef.current?.(); } catch {}
      audioCleanupRef.current = null;
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); audioRef.current = null; }
      if (prefetchRef.current) { try { prefetchRef.current.audio.pause(); prefetchRef.current.audio.removeAttribute("src"); prefetchRef.current.audio.load(); } catch {} prefetchRef.current = null; }
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    };
  }, []);


  // Attach HLS when showVideo activates
  useEffect(() => {
    if (!showVideo) return;
    const ch = channels[activeIdx];
    if (!ch) return;
    const el = videoRef.current;
    if (!el) return;
    const url = ch.url;
    if (hlsInitUrlRef.current === url) return;
    hlsInitUrlRef.current = url;
    setVideoLoading(true);

    const onPlaying = () => setVideoLoading(false);
    el.addEventListener("playing", onPlaying);

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    if (url.includes(".m3u8")) {
      import("hls.js").then(({ default: Hls }) => {
        if (!Hls.isSupported()) {
          el.src = url;
          el.muted = true; // Required for autoplay
          el.play().then(() => {
            // Try to unmute if user hasn't muted explicitly
            if (!isMuted) { el.muted = false; }
          }).catch((err) => console.warn("[Player video] play failed:", err));
          return;
        }
        const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          el.volume = volume;
          el.muted = true; // Required for autoplay
          el.play().then(() => {
            if (!isMuted) {
              setTimeout(() => { try { el.muted = false; } catch {} }, 150);
            }
          }).catch((err) => console.warn("[Player video] play failed:", err));
        });
        hls.on(Hls.Events.ERROR, (_e: any, errData: any) => {
          console.error("[Player video] HLS error:", errData?.type, errData?.details, errData?.fatal);
        });
      });
    } else {
      el.src = url;
      el.volume = volume;
      el.muted = true; // Required for autoplay
      el.play().then(() => {
        if (!isMuted) { el.muted = false; }
      }).catch((err) => console.warn("[Player video] play failed:", err));
    }

    return () => { hlsInitUrlRef.current = ""; el.removeEventListener("playing", onPlaying); };
  }, [showVideo, activeIdx]);

  const activeChannel = channels[activeIdx];
  const channelType = activeChannel?.type || "";
  const isVideo = channelType.includes("video");

  // Prefetch: quando o canal muda e não está tocando, pré-carrega o stream de áudio
  // para que o clique em play seja quase instantâneo.
  useEffect(() => {
    if (!activeChannel || isVideo || isPlaying || isLoading) return;
    const url = activeChannel.url;
    // Se já temos prefetch para essa URL, reaproveita
    if (prefetchRef.current?.url === url) return;
    // Limpa prefetch anterior de outra URL
    if (prefetchRef.current) {
      try { prefetchRef.current.audio.pause(); prefetchRef.current.audio.removeAttribute("src"); prefetchRef.current.audio.load(); } catch {}
      prefetchRef.current = null;
    }
    const pre = new Audio();
    // preload="metadata" apenas para aquecer DNS/TLS sem bufferizar áudio
    // (buffers de streams ao vivo ficariam obsoletos e causariam repetição)
    pre.preload = "metadata";
    pre.muted = true;
    // Alguns servidores de rádio retornam 400 quando recebem query params extras.
    pre.src = url;
    try { pre.load(); } catch {}
    prefetchRef.current = { url, audio: pre };
    return () => {
      // Não descarta imediatamente — o togglePlay pode promovê-lo.
      // A limpeza real ocorre na próxima troca de canal ou no unmount.
    };
  }, [activeChannel?.url, isVideo, isPlaying, isLoading]);


  const destroyHls = () => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    hlsInitUrlRef.current = "";
  };

  const cleanupAudio = () => {
    try { audioCleanupRef.current?.(); } catch {}
    audioCleanupRef.current = null;
    if (audioRef.current) {
      try { audioRef.current.pause(); } catch {}
      try { audioRef.current.removeAttribute("src"); audioRef.current.load(); } catch {}
      audioRef.current = null;
    }
  };

  const startAudioChannel = (channel: any) => {
    if (!channel?.url) return;

    cleanupAudio();
    if (prefetchRef.current) {
      try {
        prefetchRef.current.audio.pause();
        prefetchRef.current.audio.removeAttribute("src");
        prefetchRef.current.audio.load();
      } catch {}
      prefetchRef.current = null;
    }

    const streamUrl = String(channel.url);
    const buildSrc = () => {
      // Não adicionar cache-busting: muitos servidores Icecast/Shoutcast rejeitam
      // query strings extras e deixam o widget preso em "carregando...".
      return streamUrl;
    };

    const audio = new Audio();
    audio.preload = "none";
    audio.volume = volume;
    audio.muted = isMuted;
    audio.autoplay = false;
    audioRef.current = audio;
    setShowVideo(false);
    setIsLoading(true);

    let reconnectTimer: number | null = null;
    let reconnectAttempts = 0;
    let playStarted = false;
    let lastTime = 0;
    let stuckSince = Date.now();
    let firstResponseTimer: number | null = null;

    const scheduleReconnect = (reason: string) => {
      if (audioRef.current !== audio) return;
      if (reconnectTimer !== null) return;
      reconnectAttempts += 1;
      const delay = Math.min(600 * reconnectAttempts, 4500);
      console.warn(`[Player audio] reconectando (${reason}) tentativa ${reconnectAttempts} em ${delay}ms`);
      setIsLoading(true);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        if (audioRef.current !== audio) return;
        try {
          audio.pause();
          audio.src = buildSrc();
          audio.load();
          audio.play().catch(() => scheduleReconnect("play-failed"));
        } catch {
          scheduleReconnect("catch");
        }
      }, delay);
    };

    const clearLoading = () => setIsLoading(false);
    const onPlaying = () => {
      playStarted = true;
      reconnectAttempts = 0;
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      setIsLoading(false);
      setIsPlaying(true);
      isPlayingRef.current = true;
      try {
        const seek = audio.seekable;
        if (seek && seek.length > 0) {
          const end = seek.end(seek.length - 1);
          if (isFinite(end) && end - audio.currentTime > 2) audio.currentTime = end;
        }
      } catch {}
    };
    const onError = () => {
      // Streams ao vivo podem fechar chunks e disparar error mesmo após iniciar.
      // Só reconecta imediatamente se ainda não houve nenhum sinal de playback.
      if (playStarted || audio.currentTime > 0 || audio.readyState >= 2) {
        setIsLoading(false);
        setIsPlaying(true);
        isPlayingRef.current = true;
        return;
      }
      scheduleReconnect("error");
    };
    const onEnded = () => scheduleReconnect("ended");
    const onStalled = () => scheduleReconnect("stalled");
    const onWaiting = () => setIsLoading(true);
    const onPause = () => {
      if (audioRef.current === audio && playStarted) {
        window.setTimeout(() => {
          if (audioRef.current === audio && audio.paused && isPlayingRef.current) scheduleReconnect("paused-unexpected");
        }, 3000);
      }
    };

    audio.addEventListener("canplay", clearLoading);
    audio.addEventListener("loadeddata", clearLoading);
    audio.addEventListener("timeupdate", onPlaying);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("error", onError);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("stalled", onStalled);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("pause", onPause);

    const watchdog = window.setInterval(() => {
      if (audioRef.current !== audio) { window.clearInterval(watchdog); return; }
      if (!isPlayingRef.current && !isLoading) return;
      const t = audio.currentTime;
      const now = Date.now();
      if (t !== lastTime) { lastTime = t; stuckSince = now; return; }
      if (!stuckSince) stuckSince = now;
      if ((audio.readyState < 2 || audio.paused || t === 0) && now - stuckSince > 7000) {
        stuckSince = now;
        scheduleReconnect("watchdog-stuck");
      }
    }, 2000);

    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (audioRef.current !== audio) return;
      if (isPlayingRef.current && (audio.paused || audio.readyState < 2)) scheduleReconnect("visibility");
    };
    document.addEventListener("visibilitychange", onVisibility);

    audioCleanupRef.current = () => {
      if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
      if (firstResponseTimer !== null) { clearTimeout(firstResponseTimer); firstResponseTimer = null; }
      window.clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisibility);
      audio.removeEventListener("canplay", clearLoading);
      audio.removeEventListener("loadeddata", clearLoading);
      audio.removeEventListener("timeupdate", onPlaying);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("stalled", onStalled);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("pause", onPause);
    };

    audio.src = buildSrc();
    audio.load();
    firstResponseTimer = window.setTimeout(() => {
      if (audioRef.current !== audio) return;
      if (audio.readyState > 0 || audio.networkState === HTMLMediaElement.NETWORK_LOADING) {
        setIsLoading(false);
        setIsPlaying(true);
        isPlayingRef.current = true;
      }
    }, 3500);
    audio.play().then(() => {
      setIsPlaying(true);
      setIsLoading(false);
      isPlayingRef.current = true;
    }).catch((err) => {
      console.warn("Audio play failed:", err);
      if (audioRef.current === audio) scheduleReconnect("initial-play-failed");
    });
  };

  const stopAll = () => {
    destroyHls();
    cleanupAudio();
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    setShowVideo(false);
    setIsPlaying(false);
    isPlayingRef.current = false;
    setIsLoading(false);
  };

  const togglePlay = () => {
    if (!activeChannel) return;
    if (isPlaying || isLoading) { stopAll(); return; }
    // Stop any previous playback without calling stopAll (which resets isPlaying)
    destroyHls();
    cleanupAudio();
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    setShowVideo(false);

    if (isVideo) {
      setShowVideo(true);
      setIsPlaying(true);
    } else {
      startAudioChannel(activeChannel);
    }
  };

  // ── Global bridge: allow other components (nav header) to toggle/observe playback ──
  const togglePlayRef = useRef(togglePlay);
  const goPrevRef = useRef<(() => void) | undefined>(undefined);
  const goNextRef = useRef<(() => void) | undefined>(undefined);
  const handleVolumeRef = useRef<((val: number) => void) | undefined>(undefined);
  useEffect(() => { togglePlayRef.current = togglePlay; });


  useEffect(() => {
    const handler = () => togglePlayRef.current?.();
    window.addEventListener("player:toggle", handler);
    return () => window.removeEventListener("player:toggle", handler);
  }, []);
  useEffect(() => {
    const onPrev = () => goPrevRef.current?.();
    const onNext = () => goNextRef.current?.();
    const onVol = (e: Event) => {
      const v = (e as CustomEvent).detail?.volume;
      if (typeof v === "number") handleVolumeRef.current?.(v);
    };
    window.addEventListener("player:prev", onPrev);
    window.addEventListener("player:next", onNext);
    window.addEventListener("player:volume", onVol as EventListener);
    return () => {
      window.removeEventListener("player:prev", onPrev);
      window.removeEventListener("player:next", onNext);
      window.removeEventListener("player:volume", onVol as EventListener);
    };
  }, []);
  useEffect(() => {
    window.dispatchEvent(new CustomEvent("player:state", {
      detail: {
        isPlaying,
        isLoading,
        hasChannel: !!activeChannel,
        channelName: activeChannel?.nome || "",
      },
    }));
  }, [isPlaying, isLoading, activeChannel]);



  const switchTo = (idx: number) => {
    destroyHls();
    cleanupAudio();
    setActiveIdx(idx);
    const ch = channels[idx];
    const chIsVideo = (ch?.type || "").includes("video");
    if (isPlaying || isLoading) {
      if (chIsVideo) {
        // Keep showVideo true, just let useEffect re-init with new URL
        setShowVideo(true);
      } else {
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
        setShowVideo(false);
        startAudioChannel(ch);
      }
    } else {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
      setShowVideo(false);
    }
  };

  const goNext = () => { if (channels.length > 1) switchTo((activeIdx + 1) % channels.length); };
  const goPrev = () => { if (channels.length > 1) switchTo((activeIdx - 1 + channels.length) % channels.length); };
  // Sync nav refs after function definitions (can't reference them before this point)
  goPrevRef.current = goPrev;
  goNextRef.current = goNext;


  const toggleMute = () => {
    const m = !isMuted;
    setIsMuted(m);
    if (audioRef.current) audioRef.current.muted = m;
    if (videoRef.current) videoRef.current.muted = m;
  };

  const handleVolume = (val: number) => {
    setVolume(val);
    if (audioRef.current) audioRef.current.volume = val;
    if (videoRef.current) videoRef.current.volume = val;
    if (val === 0) setIsMuted(true);
    else if (isMuted) { setIsMuted(false); if (audioRef.current) audioRef.current.muted = false; if (videoRef.current) videoRef.current.muted = false; }
  };
  handleVolumeRef.current = handleVolume;


  const channelLogo = activeChannel?.background_url || activeChannel?.logo_url || activeChannel?.cover_url;

  // Fetch artist image from Deezer for the background
  const [artistBgUrl, setArtistBgUrl] = useState<string | null>(null);
  const artistBgCacheRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const artist = (currentMusic?.artista || "").trim();
    if (!artist) { setArtistBgUrl(null); return; }
    const cacheKey = artist.toLowerCase();
    if (artistBgCacheRef.current[cacheKey]) {
      setArtistBgUrl(artistBgCacheRef.current[cacheKey]);
      return;
    }
    setArtistBgUrl(null);
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("fetch-artist-image", { body: { artist } });
        if (cancelled) return;
        if (error || !data?.ok || !data?.url) { setArtistBgUrl(null); return; }
        artistBgCacheRef.current[cacheKey] = data.url;
        setArtistBgUrl(data.url);
      } catch { if (!cancelled) setArtistBgUrl(null); }
    })();
    return () => { cancelled = true; };
  }, [currentMusic?.artista]);

  // Resolve cover art if currentMusic has title/artist but no capa
  useEffect(() => {
    const tit = currentMusic?.titulo?.trim();
    const art = currentMusic?.artista?.trim();
    if (!tit && !art) return;
    if (currentMusic?.capa) return;
    if (currentMusic?.excecao) return;

    let cancelled = false;
    const syncCover = getTrackCoverSync(tit || "", art || "");
    if (syncCover) {
      setCurrentMusic(prev => (prev && prev.titulo === tit && prev.artista === art ? { ...prev, capa: syncCover } : prev));
      if (uid) {
        const cur = readMusicData(uid);
        if (cur && cur.titulo === tit && cur.artista === art && !cur.capa) {
          writeMusicData(uid, { ...cur, capa: syncCover });
        }
      }
      return;
    }

    void fetchTrackCover(tit || "", art || "").then(cover => {
      if (cancelled || !cover) return;
      setCurrentMusic(prev => {
        if (!prev || prev.titulo !== tit || prev.artista !== art) return prev;
        return { ...prev, capa: cover };
      });
      if (uid) {
        const cur = readMusicData(uid);
        if (cur && cur.titulo === tit && cur.artista === art && !cur.capa) {
          writeMusicData(uid, { ...cur, capa: cover });
        }
      }
    });

    return () => { cancelled = true; };
  }, [currentMusic?.titulo, currentMusic?.artista, currentMusic?.capa, currentMusic?.excecao, uid]);

  // Faixas da lista de EXCEÇÕES (ex.: BREAK) sempre usam a capa cadastrada
  // na exceção (própria ou a imagem geral da lista) — nunca a imagem do artista.
  const displayArt = currentMusic?.excecao
    ? (currentMusic.excecao.capa_url || currentMusic.capa || channelLogo)
    : (currentMusic?.capa || artistBgUrl || channelLogo);

  // Emit rich music/art data so FloatingMiniPlayer & HomeGradientBackground can sync without prop drilling
  useEffect(() => {
    const detail = { displayArt, currentMusic, channels, activeIdx, activeChannel, isPlaying, isLoading, isMuted, volume };
    try {
      (window as any).__lastPlayerMusicState = detail;
    } catch {}
    window.dispatchEvent(new CustomEvent("player:music", { detail }));
  }, [displayArt, currentMusic, channels, activeIdx, activeChannel, isPlaying, isLoading, isMuted, volume]);


  // Crossfade for background art
  const [visibleArt, setVisibleArt] = useState(displayArt);
  const [fadingArt, setFadingArt] = useState<string | null>(null);
  const [artOpacity, setArtOpacity] = useState(1);

  useEffect(() => {
    if (displayArt === visibleArt) return;
    setFadingArt(visibleArt || null);
    setVisibleArt(displayArt);
    setArtOpacity(0);
    requestAnimationFrame(() => { requestAnimationFrame(() => setArtOpacity(1)); });
    const timer = setTimeout(() => setFadingArt(null), 600);
    return () => clearTimeout(timer);
  }, [displayArt]);

  const BREAK_LABELS = ["break", "ebs curtas"];
  const _tit = (currentMusic?.titulo || "").trim().toLowerCase();
  const _art = (currentMusic?.artista || "").trim().toLowerCase();
  const isBreak = BREAK_LABELS.includes(_tit) || BREAK_LABELS.includes(_art);

  // ===== Web Audio analyser for reactive break wave =====
  const BAR_COUNT = 56;
  const barRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Cache one MediaElementAudioSourceNode PER media element (createMediaElementSource
  // may only be called once per element per context).
  const sourceMapRef = useRef<WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>>(new WeakMap());
  const activeSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const analyserFailedRef = useRef(false);

  // Wave spectrum analyser removed: calling createMediaElementSource on the
  // radio <audio> element (which lacks CORS) taints the media graph and the
  // browser silently mutes playback — this caused the widget to appear to
  // "switch to break and stop the audio" after ~1s of play. Bars now idle.
  useEffect(() => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    barRefs.current.forEach((el) => { if (el) el.style.height = "8px"; });
  }, [isBreak, isPlaying, isVideo, showVideo]);




  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { activeSourceRef.current?.disconnect(); } catch {}
      try { analyserRef.current?.disconnect(); } catch {}
      try { audioCtxRef.current?.close(); } catch {}
    };
  }, []);

  // Respect user preference for reduced motion
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);
  const fadeTransition = reducedMotion ? "opacity 0.01s linear" : "opacity 0.6s ease";
  const fadeTransformTransition = reducedMotion
    ? "opacity 0.01s linear"
    : "opacity 0.6s ease, transform 0.6s ease";
  const imgFadeTransition = reducedMotion ? "opacity 0.01s linear" : "opacity 0.6s ease-out";
  const barTransition = reducedMotion ? "height 0.01s linear" : "height 90ms linear";


  const [hoverVideo, setHoverVideo] = useState(false);
  const videoActive = showVideo && isVideo;
  const hideChromeForVideo = videoActive && !hoverVideo;

  return (
    <div
      className="flex flex-col h-full w-full relative rounded-3xl overflow-hidden"
      style={{ background: "#000", minHeight: 0, maxHeight: "100%", contain: "layout paint size" }}
      onMouseEnter={() => setHoverVideo(true)}
      onMouseLeave={() => setHoverVideo(false)}
    >
      {/* Break background color layer — crossfades with artist image */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "#002233",
          opacity: isBreak && !videoActive ? 1 : 0,
          transition: fadeTransition,
        }}
      />

      {/* Artist image layer — hidden when video is active */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: isBreak || videoActive ? 0 : 1,
          transition: fadeTransition,
        }}
      >
        {fadingArt && (
          <img
            src={fadingArt}
            alt=""
            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{
              transition: reducedMotion ? "opacity 0.01s linear" : "opacity 0.6s ease-out, transform 0.7s cubic-bezier(0.22,0.61,0.36,1)",
              opacity: 0,
              transform: reducedMotion ? undefined : "translateX(-12%)",
            }}
          />
        )}
        {visibleArt ? (
          <img
            key={visibleArt}
            src={visibleArt}
            alt=""
            onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
            className="absolute inset-0 w-full h-full object-cover object-center"
            style={{
              transition: reducedMotion ? "opacity 0.01s linear" : "opacity 0.6s ease-out, transform 0.7s cubic-bezier(0.22,0.61,0.36,1)",
              opacity: artOpacity,
              transform: reducedMotion ? undefined : artOpacity ? "translateX(0)" : "translateX(14%)",
            }}
          />

        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {isPlaying && !isVideo && audioRef.current ? (
              <AudioSpectrum audioElement={audioRef.current} style="bars" barColor="#0055ff" />
            ) : (
              <Tv size={40} className="text-white/10" />
            )}
          </div>
        )}
        {/* Vignette to guarantee text contrast */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 40%, rgba(0,0,0,0.85) 100%)" }} />
      </div>

      {/* Video layer — fills the widget (which becomes 16:9 when active) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{
          opacity: videoActive ? 1 : 0,
          pointerEvents: videoActive ? "auto" : "none",
          transition: "opacity 0.35s ease",
          background: "#000",
          zIndex: 5,
        }}
      >
        {videoHost && createPortal(
          <video
            ref={videoRef}
            muted={isMuted}
            playsInline
            style={{ width: "100%", height: "100%", objectFit: "cover", background: "#000", display: "block" }}
          />,
          videoHost,
        )}
        {videoLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "rgba(0,0,0,0.8)" }}>
            <Loader2 size={20} className="text-white/70 animate-spin" />
            <span className="text-white/40 text-[9px] font-medium tracking-wider uppercase">Carregando...</span>
          </div>
        )}
        {/* Hover vignette so overlaid chrome stays readable */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            opacity: hoverVideo ? 1 : 0,
            transition: "opacity 0.35s ease",
            background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.1) 45%, rgba(0,0,0,0.75) 100%)",
          }}
        />
      </div>

      {channels.length === 0 ? (
        <p className="text-white/40 text-xs relative z-10 m-auto">Nenhum canal cadastrado</p>
      ) : (
        <div
          className={`relative z-10 flex h-full w-full overflow-hidden ${compactMode ? "flex-row items-center gap-2 p-2 sm:p-2.5" : "flex-col justify-between p-2.5 sm:p-3.5"}`}
          style={{
            minHeight: 0,
            maxHeight: "100%",
            transition: "min-height 0.35s cubic-bezier(0.4,0,0.2,1), padding 0.3s ease, opacity 0.3s ease",
            opacity: hideChromeForVideo ? 0 : 1,
            pointerEvents: hideChromeForVideo ? "none" : "auto",
          }}
        >


          {/* Status label — only in standard mode */}
          {!compactMode && (
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] sm:text-[15px] md:text-[16px] font-bold lowercase tracking-tight truncate text-white/90">
                {isLoading ? "carregando..." : isPlaying ? "tocando" : "pausado"}
              </span>
              {isPlaying && !isLoading && (
                <span className="text-[9px] font-semibold uppercase tracking-[0.15em] text-[#0055ff] leading-none mt-0.5">
                  {isVideo ? "vídeo" : "áudio"}
                </span>
              )}
            </div>
          )}


          {/* Song info — inline in compact, pinned bottom in standard */}
          <div className={compactMode ? "flex items-center gap-2 min-w-0 flex-1" : "flex items-end justify-between gap-2 mt-auto pr-16"}>
            <div className="min-w-0 flex-1">
              {currentMusic ? (
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] sm:text-[13px] font-extrabold leading-[1.1] text-white">
                      <AutoScrollText text={currentMusic.titulo || ""} />
                    </p>
                    <p className="text-[10px] sm:text-[11px] font-medium leading-[1.15] text-slate-400">
                      <AutoScrollText text={currentMusic.artista || ""} />
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-[12px] font-extrabold leading-tight truncate text-white">
                    {activeChannel?.name}
                  </p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full border border-[#0055ff]/30 bg-[#0055ff]/15 text-[#0055ff]">
                      CH {activeChannel?.numero_canal}
                    </span>
                    {isVideo && <span className="text-[8px] font-bold uppercase tracking-wider text-white/60">Vídeo</span>}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Channel navigation arrows — bottom-right corner in standard mode */}
          {!compactMode && channels.length > 1 && (
            <div className="absolute bottom-2.5 right-2.5 sm:bottom-3.5 sm:right-3.5 flex gap-1 z-20">
              <button onClick={goPrev} className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 bg-white/10 hover:bg-white/20 border border-white/10 text-white" title="Canal anterior">
                <ChevronLeft size={12} className="text-white/80" />
              </button>
              <button onClick={goNext} className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:scale-110 bg-white/10 hover:bg-white/20 border border-white/10 text-white" title="Próximo canal">
                <ChevronRight size={12} className="text-white/80" />
              </button>
            </div>
          )}

          {/* Controls stack — vertical in standard, horizontal in compact; positioned top-right in standard */}
          <div
            className={`flex-shrink-0 flex ${compactMode ? "flex-row items-center gap-1.5" : "flex-col gap-1 sm:gap-1.5 absolute top-2.5 right-2.5 sm:top-3.5 sm:right-3.5"}`}
          >
            <button
              onClick={togglePlay}
              className={`${compactMode ? "w-7 h-7" : "w-8 h-8 sm:w-9 sm:h-9"} rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-[0_2px_12px_rgba(0,85,255,0.4)] bg-[#0055ff] hover:bg-[#0048db] text-white active:scale-95`}
              title={isLoading ? "Carregando..." : isPlaying ? "Pausar" : "Reproduzir"}
            >
              {isLoading
                ? <Loader2 size={compactMode ? 12 : 14} className="animate-spin text-white" />
                : isPlaying
                  ? <Pause size={compactMode ? 11 : 12} style={{ color: "#ffffff" }} fill="#ffffff" />
                  : <Play size={compactMode ? 11 : 12} style={{ color: "#ffffff", marginLeft: 1 }} fill="#ffffff" />}
            </button>
            <VolumeSliderControl
              compactMode={compactMode}
              isMuted={isMuted}
              volume={volume}
              toggleMute={toggleMute}
              handleVolume={handleVolume}
            />
            {isVideo && !compactMode && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (videoActive) {
                    const el = videoRef.current as any;
                    if (!el) return;
                    const req = el.requestFullscreen || el.webkitEnterFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
                    try { req?.call(el); } catch { /* noop */ }
                  } else {
                    onVideoChange?.(true);
                  }
                }}
                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center transition-all hover:scale-105 shadow-md relative bg-white/10 hover:bg-white/20 border border-white/10 text-white"
                title={videoActive ? "Tela cheia" : "Ativar vídeo"}
              >
                {videoActive ? (
                  <Maximize2 size={12} className="text-white/80" />
                ) : (
                  <>
                    <Tv size={12} className="text-white/80" />
                    <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-[#0055ff] shadow-[0_0_8px_#0055ff] animate-pulse" />
                  </>
                )}
              </button>
            )}

          </div>
        </div>
      )}

      <style>{`
        @keyframes eq-bar { 0% { height: 3px; } 100% { height: 14px; } }
        @keyframes wave-bar { 0% { height: 6px; } 25% { height: 42px; } 50% { height: 14px; } 75% { height: 56px; } 100% { height: 22px; } }
        .volume-slider-nexo::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 10px; height: 10px; border-radius: 9999px; background: #ffffff; border: 1.5px solid #0055ff; cursor: pointer; box-shadow: 0 1px 3px rgba(0,0,0,0.3); }
        .volume-slider-nexo::-moz-range-thumb { width: 10px; height: 10px; border-radius: 9999px; background: #ffffff; border: 1.5px solid #0055ff; cursor: pointer; }
      `}</style>
    </div>
  );
}
