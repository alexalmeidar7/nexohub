import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Plus, X, Link2, BarChart3, CalendarDays, Music, Eye, Users, Mic2, PlaySquare, Newspaper, Settings, ShoppingBag, Tag, Image, Film, ShoppingCart, Monitor, Wrench, Scissors, MonitorPlay, ExternalLink, GripVertical, Loader2, Trash2, MessageSquareQuote, Radio, Clock, Tv, FileText, CloudSun, ChevronDown, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Circle, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

const AgendaPage = lazy(() => import("./AgendaPage"));
const OnAirWidget = lazy(() => import("./OnAirWidget"));

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

const linkOptions: { label: string; page?: Page; external?: string; icon: string }[] = [
  { label: "Apresentadores", page: "apresentadores", icon: "Mic2" },
  { label: "Programas", page: "programas", icon: "PlaySquare" },
  { label: "Notícias", page: "noticias", icon: "Newspaper" },
  { label: "Música no Ar", page: "musica", icon: "Music" },
  { label: "Agenda", page: "agenda", icon: "CalendarDays" },
  { label: "Player Config", page: "playerconfig", icon: "Settings" },
  { label: "Player Externo", external: "player", icon: "MonitorPlay" },
  { label: "Testemunhais", page: "testemunhais", icon: "MessageSquareQuote" },
  { label: "Promoções", page: "promocoes", icon: "Tag" },
  { label: "Logos", page: "logos", icon: "Image" },
  { label: "Pre Roll", page: "preroll", icon: "Film" },
  { label: "Shopping", page: "shopping", icon: "ShoppingCart" },
  { label: "vMix", page: "vmix", icon: "Monitor" },
  { label: "Corte de Vídeo", page: "cortevideo", icon: "Scissors" },
  { label: "Tela Promo", external: "telapromo", icon: "Tag" },
  { label: "Configurações", page: "configuracoes", icon: "Settings" },
];

const widgetOptions: { label: string; type: "agenda" | "musica" | "stats" | "weather" | "player"; description: string }[] = [
  { label: "Agenda de Eventos", type: "agenda", description: "Exibe os próximos eventos do calendário" },
  { label: "Música no Ar + Programa", type: "musica", description: "Mostra a música e programa em exibição" },
  { label: "Dados Estatísticos", type: "stats", description: "Visualizações do pre-roll e audiência do player" },
  { label: "Previsão do Tempo", type: "weather", description: "Temperatura e previsão para os próximos dias" },
  { label: "Player", type: "player", description: "Ouça ou assista seus canais cadastrados" },
];

const iconMap: Record<string, React.ComponentType<any>> = {
  Mic2, PlaySquare, Newspaper, Music, CalendarDays, Settings, MonitorPlay, MessageSquareQuote,
  Tag, Image, Film, ShoppingCart, Monitor, Scissors, ExternalLink, ShoppingBag, Wrench, Users,
};

function getIcon(name: string) {
  return iconMap[name] || Link2;
}

interface Props {
  onNavigate: (page: Page) => void;
}

export default function CustomizableDashboard({ onNavigate }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<DashboardItem[]>([]);
  const dashboardSettingsRef = useRef<DashboardSettingsPayload>({ items: [] });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addStep, setAddStep] = useState<"choose" | "link" | "widget">("choose");
  const [editMode, setEditMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [playerVideoActive, setPlayerVideoActive] = useState<string | null>(null);

  // On-air program info
  interface OnAirProgram {
    nome: string;
    selo: string;
    horario_inicio: string;
    horario_fim: string;
    classificacao_etaria: string;
    descricao: string;
    apresentador_nome: string;
  }
  const [onAirProgram, setOnAirProgram] = useState<OnAirProgram | null>(null);
  const [currentMusic, setCurrentMusic] = useState<{ titulo: string; artista: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const DIAS_MAP: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
    const fetchOnAir = async () => {
      const { data } = await supabase
        .from("programas")
        .select("nome, selo, horario_inicio, horario_fim, classificacao_etaria, descricao, dias_semana, ativo, apresentador_id, apresentadores(nome)")
        .eq("user_id", user.id)
        .eq("ativo", true);
      if (cancelled || !data) return;
      const now = new Date();
      const diaAtual = DIAS_MAP[now.getDay()];
      const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const current = data.find(p =>
        (p.dias_semana || []).includes(diaAtual) &&
        horaAtual >= p.horario_inicio &&
        horaAtual < p.horario_fim
      );
      setOnAirProgram(current ? {
        nome: current.nome,
        selo: current.selo || "",
        horario_inicio: current.horario_inicio,
        horario_fim: current.horario_fim,
        classificacao_etaria: current.classificacao_etaria || "L",
        descricao: current.descricao || "",
        apresentador_nome: (current.apresentadores as any)?.nome || "",
      } : null);
    };
    fetchOnAir();
    const interval = setInterval(fetchOnAir, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  // Poll music from localStorage (masterview_music_data is the canonical key)
  useEffect(() => {
    const pollMusic = () => {
      try {
        const raw = localStorage.getItem("masterview_music_data");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.titulo) {
            setCurrentMusic({ titulo: parsed.titulo, artista: parsed.artista || "" });
            return;
          }
        }
      } catch {}
      setCurrentMusic(null);
    };
    pollMusic();
    const interval = setInterval(pollMusic, 2000);
    return () => clearInterval(interval);
  }, []);

  // Load dashboard items from DB (fallback to localStorage for migration)
  useEffect(() => {
    if (!user) return;
    const loadItems = async () => {
      // Try DB first
      const { data, error } = await supabase
        .from("user_settings")
        .select("dashboard_items")
        .eq("user_id", user.id)
        .maybeSingle();

      if (error) {
        console.error("Erro ao carregar dashboard_items:", error);
      }

      const normalized = normalizeDashboardSettings(data?.dashboard_items);
      dashboardSettingsRef.current = normalized;

      if (Array.isArray(normalized.items) && normalized.items.length > 0) {
        setItems(normalized.items);
        return;
      }

      // Migrate from localStorage if exists
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed) || parsed.length === 0) return;

        setItems(parsed as DashboardItem[]);
        const payload: DashboardSettingsPayload = {
          ...dashboardSettingsRef.current,
          items: parsed as DashboardItem[],
        };
        dashboardSettingsRef.current = payload;

        await supabase
          .from("user_settings")
          .upsert(
            {
              user_id: user.id,
              dashboard_items: payload as any,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
      } catch {
        // ignore invalid local data
      }
    };
    loadItems();
  }, [user]);

  const saveItems = useCallback(async (newItems: DashboardItem[]) => {
    setItems(newItems);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));

    if (!user) return;

    const payload: DashboardSettingsPayload = {
      ...dashboardSettingsRef.current,
      items: newItems,
    };
    dashboardSettingsRef.current = payload;

    // Save to DB
    const { error } = await supabase
      .from("user_settings")
      .upsert(
        {
          user_id: user.id,
          dashboard_items: payload as any,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );

    if (error) {
      console.error("Erro ao salvar dashboard_items:", error);
    }
  }, [user]);

  const addLink = (opt: typeof linkOptions[0]) => {
    const newItem: DashboardItem = {
      id: `link-${Date.now()}`,
      type: "link",
      linkPage: opt.page,
      linkExternal: opt.external,
      linkLabel: opt.label,
      linkIcon: opt.icon,
    };
    saveItems([...items, newItem]);
    setShowAddDialog(false);
    setAddStep("choose");
  };

  const addWidget = (opt: typeof widgetOptions[0]) => {
    // Prevent duplicates
    if (items.some(i => i.type === "widget" && i.widgetType === opt.type)) return;
    const newItem: DashboardItem = {
      id: `widget-${Date.now()}`,
      type: "widget",
      widgetType: opt.type,
    };
    saveItems([...items, newItem]);
    setShowAddDialog(false);
    setAddStep("choose");
  };

  const removeItem = (id: string) => {
    saveItems(items.filter(i => i.id !== id));
  };

  const handleLinkClick = (item: DashboardItem) => {
    if (editMode) return;
    if (item.linkExternal === "player") {
      const slug = user?.email?.split("@")[0] || "";
      window.open(`/user/${slug}/nexohub/player`, "_blank");
    } else if (item.linkExternal === "telapromo") {
      const slug = user?.email?.split("@")[0] || "";
      window.open(`/user/${slug}/nexohub/telapromo`, "_blank");
    } else if (item.linkPage) {
      onNavigate(item.linkPage);
    }
  };

  // Drag and drop
  const handleDragStart = (id: string) => setDraggedId(id);
  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverId(targetId);
  };
  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) { setDragOverId(null); return; }
    const newItems = [...items];
    const fromIdx = newItems.findIndex(i => i.id === draggedId);
    const toIdx = newItems.findIndex(i => i.id === targetId);
    const [moved] = newItems.splice(fromIdx, 1);
    newItems.splice(toIdx, 0, moved);
    saveItems(newItems);
    setDragOverId(null);
  };
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  const [dragOverId, setDragOverId] = useState<string | null>(null);
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
    <div ref={scrollRef} className="flex flex-col h-full overflow-hidden relative pt-1">


      {/* Section: Atalhos */}
      {items.filter(i => i.type === "link").length > 0 && (
        <div className="mb-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3 animate-fade-in" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.7 }}>Atalhos rápidos</p>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {items.filter(i => i.type === "link").map(item => {
              const Icon = getIcon(item.linkIcon || "Link2");
              const isDragging = draggedId === item.id;
              const isDragOver = dragOverId === item.id && draggedId !== item.id;
              return (
                <div
                  key={item.id}
                  className={`relative group cursor-pointer animate-scale-in ${isDragging ? "opacity-40 scale-95" : ""}`}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={handleDragEnd}
                  onClick={() => handleLinkClick(item)}
                >
                    <div
                      className={`w-[70px] h-[70px] sm:w-[90px] sm:h-[90px] rounded-2xl flex flex-col items-center pt-[14px] sm:pt-[18px] transition-all duration-200 hover:scale-[1.06] overflow-hidden`}
                      style={{
                        background: isDragOver
                          ? `linear-gradient(145deg, color-mix(in srgb, var(--layout-button-bg, #0f1058) 70%, white 30%), var(--layout-accent-color, #444))`
                          : `linear-gradient(160deg, color-mix(in srgb, var(--layout-button-bg, #0f1058) 85%, white 15%) 0%, var(--layout-button-bg, #0f1058) 50%, color-mix(in srgb, var(--layout-button-bg, #0f1058) 90%, black 10%) 100%)`,
                        backdropFilter: "blur(30px) saturate(1.8)",
                        WebkitBackdropFilter: "blur(30px) saturate(1.8)",
                        border: isDragOver ? `2px solid var(--layout-button-bg, #0f1058)` : `1px solid color-mix(in srgb, var(--layout-button-text, #fff) 15%, transparent)`,
                        boxShadow: `0 8px 24px color-mix(in srgb, var(--layout-button-bg, #0f1058) 35%, transparent), 0 2px 6px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.08)`,
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = `0 12px 36px color-mix(in srgb, var(--layout-button-bg, #0f1058) 50%, transparent), 0 4px 10px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.35)`;
                        e.currentTarget.style.background = `linear-gradient(160deg, color-mix(in srgb, var(--layout-button-bg, #0f1058) 75%, white 25%) 0%, color-mix(in srgb, var(--layout-button-bg, #0f1058) 90%, white 10%) 50%, var(--layout-button-bg, #0f1058) 100%)`;
                        e.currentTarget.style.borderColor = `color-mix(in srgb, var(--layout-button-text, #fff) 30%, transparent)`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = isDragOver
                          ? `linear-gradient(145deg, color-mix(in srgb, var(--layout-button-bg, #0f1058) 70%, white 30%), var(--layout-accent-color, #444))`
                          : `linear-gradient(160deg, color-mix(in srgb, var(--layout-button-bg, #0f1058) 85%, white 15%) 0%, var(--layout-button-bg, #0f1058) 50%, color-mix(in srgb, var(--layout-button-bg, #0f1058) 90%, black 10%) 100%)`;
                        e.currentTarget.style.boxShadow = `0 8px 24px color-mix(in srgb, var(--layout-button-bg, #0f1058) 35%, transparent), 0 2px 6px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -1px 0 rgba(0,0,0,0.08)`;
                        e.currentTarget.style.borderColor = `color-mix(in srgb, var(--layout-button-text, #fff) 15%, transparent)`;
                      }}
                    >
                      {/* Top glass shine */}
                      <div className="absolute top-0 left-0 right-0 h-[45%] pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.03) 60%, transparent 100%)", borderRadius: "16px 16px 0 0" }} />
                      <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative z-10" style={{ background: "rgba(255,255,255,0.12)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(0,0,0,0.1)" }}>
                        <Icon size={16} className="sm:hidden" style={{ color: "var(--layout-button-text, #fff)" }} /><Icon size={18} className="hidden sm:block" style={{ color: "var(--layout-button-text, #fff)" }} />
                      </div>
                      <span className="text-[9px] font-semibold text-center leading-tight px-1.5 max-w-full truncate mt-1.5 relative z-10" style={{ color: "var(--layout-button-text, #fff)", textShadow: "0 1px 3px rgba(0,0,0,0.2)" }}>{item.linkLabel}</span>
                      {item.linkExternal && <ExternalLink size={7} className="absolute bottom-1.5 right-1.5 z-10" style={{ color: "var(--layout-button-text, #fff)", opacity: 0.4 }} />}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                    className="absolute top-1.5 right-1.5 w-4 h-4 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10"
                    style={{ border: "1px solid rgba(0,0,0,0.15)" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.4)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.15)"; }}
                  >
                    <X size={7} className="text-black/40" />
                  </button>
                </div>
              );
            })}
            {/* Add button */}
            <div
              onClick={() => { setShowAddDialog(true); setAddStep("choose"); }}
              className="w-[70px] h-[70px] sm:w-[90px] sm:h-[90px] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.06]"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1.5px dashed rgba(255,255,255,0.25)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
            >
              <Plus size={16} className="mb-1" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.4 }} />
              <span className="text-[9px] font-semibold" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.4 }}>Adicionar</span>
            </div>
          </div>
        </div>
      )}

      {/* On-Air Program Info */}
      {onAirProgram && (
        <div className="mb-4 animate-fade-in">
          <div className="flex flex-col items-start gap-3">
            {/* Selo / Logo do programa */}
            {onAirProgram.selo && (
               <img
                 src={onAirProgram.selo}
                 alt={onAirProgram.nome}
                 className="w-28 h-28 sm:w-36 sm:h-36 lg:w-44 lg:h-44 rounded-xl object-contain"
               />
            )}
            <div className="flex-1 min-w-0">
            {/* Ao vivo + horário + classificação */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1.5">
                <Circle size={8} fill="var(--layout-accent-color)" color="var(--layout-accent-color)" className="animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-accent-color)" }}>Ao Vivo</span>
              </div>
              <span className="text-[10px]" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.5 }}>
                {onAirProgram.horario_inicio} — {onAirProgram.horario_fim}
              </span>
              {onAirProgram.classificacao_etaria && (
                <span
                  className="inline-flex items-center justify-center w-5 h-5 rounded text-[9px] font-extrabold text-white leading-none"
                  style={{
                    backgroundColor:
                      onAirProgram.classificacao_etaria === "AL" || onAirProgram.classificacao_etaria === "L" ? "#14A44D" :
                      onAirProgram.classificacao_etaria === "10" ? "#2563EB" :
                      onAirProgram.classificacao_etaria === "12" ? "#EAB308" :
                      onAirProgram.classificacao_etaria === "14" ? "#F97316" :
                      onAirProgram.classificacao_etaria === "16" ? "#DC2626" :
                      onAirProgram.classificacao_etaria === "18" ? "#1d1d1b" : "#666",
                  }}
                >
                  {onAirProgram.classificacao_etaria}
                </span>
              )}
            </div>

            {/* Descrição */}
            {onAirProgram.descricao && (
              <p className="text-[11px] leading-relaxed line-clamp-2 sm:line-clamp-3 mb-2" style={{ maxWidth: 400, color: "var(--layout-nav-text, #fff)" }}>{onAirProgram.descricao}</p>
            )}

            {/* Apresentador */}
            {onAirProgram.apresentador_nome && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <User size={12} style={{ color: "var(--layout-icon-color, #888)" }} />
                <span className="text-[11px] font-semibold" style={{ color: "var(--layout-nav-text, #fff)" }}>{onAirProgram.apresentador_nome}</span>
              </div>
            )}

            {/* Música tocando */}
            {currentMusic && (
              <div className="flex items-center gap-1.5">
                <Music size={12} style={{ color: "var(--layout-icon-color, #888)" }} />
                <span className="text-[11px]" style={{ color: "var(--layout-nav-text, #fff)" }}>
                  {currentMusic.titulo}{currentMusic.artista ? ` — ${currentMusic.artista}` : ""}
                </span>
              </div>
            )}
            </div>
          </div>
        </div>
      )}


      {/* Spacer to push widgets to bottom */}
      <div className="flex-1" />

      {items.filter(i => i.type === "widget").length > 0 && (
        <div className="mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] mb-3 animate-fade-in" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.7 }}>Widgets</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" style={{ gridAutoRows: "260px" }}>

            {items.filter(i => i.type === "widget").map(item => {
              const isDragging = draggedId === item.id;
              const isDragOver = dragOverId === item.id && draggedId !== item.id;
              return (
                <div
                  key={item.id}
                  className={`relative group rounded-2xl animate-fade-in flex flex-col ${isDragging ? "opacity-40 scale-95" : ""}`}
                  style={{
                    background: "color-mix(in srgb, var(--layout-widget-bg) 70%, transparent)",
                    backdropFilter: "blur(32px) saturate(1.6)",
                    WebkitBackdropFilter: "blur(32px) saturate(1.6)",
                    border: isDragOver ? "2px solid var(--layout-button-bg)" : "1px solid color-mix(in srgb, var(--layout-border-color) 20%, transparent)",
                    boxShadow: "0 8px 32px color-mix(in srgb, var(--layout-border-color) 30%, transparent), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.08)",
                    borderRadius: "20px",
                    height: "260px",
                    maxHeight: "260px",
                    overflow: "hidden",
                  }}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={handleDragEnd}
                >
                  <div
                    className="flex items-center gap-1.5 px-4 py-2.5 cursor-grab active:cursor-grabbing flex-shrink-0"
                    style={{ borderBottom: `1px solid color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)` }}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); handleDragStart(item.id); }}
                  >
                    <GripVertical size={10} style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.2 }} />
                    <span className="text-[9px] font-bold uppercase tracking-[0.15em]" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.4 }}>
                      {item.widgetType === "agenda" ? "Agenda" : item.widgetType === "musica" ? "No Ar" : item.widgetType === "weather" ? "Tempo" : item.widgetType === "player" ? "Player" : "Estatísticas"}
                    </span>
                  </div>
                  <div className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{ border: `1px solid color-mix(in srgb, var(--layout-border-color, #333) 30%, transparent)` }}
                    >
                      <X size={9} style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.4 }} />
                    </button>
                  </div>
                  <div className="p-4 flex-1 overflow-y-auto overflow-x-hidden widget-scroll">
                    <Suspense fallback={<Loader2 className="animate-spin" size={18} style={{ color: "var(--layout-icon-color, #888)", opacity: 0.4 }} />}>
                      {item.widgetType === "agenda" && <DashboardAgendaWidget onNavigate={onNavigate} />}
                      {item.widgetType === "musica" && <MusicProgramWidget />}
                      {item.widgetType === "stats" && <StatsWidget />}
                      {item.widgetType === "weather" && <DashboardWeatherWidget />}
                      {item.widgetType === "player" && <DashboardPlayerWidget onVideoChange={(active) => setPlayerVideoActive(active ? item.id : null)} />}
                    </Suspense>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Show add button when no links exist */}
      {items.filter(i => i.type === "link").length === 0 && items.length > 0 && (
        <div className="mb-6">
          <div
            onClick={() => { setShowAddDialog(true); setAddStep("choose"); }}
            className="w-[70px] h-[70px] sm:w-[90px] sm:h-[90px] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.06]"
            style={{
              background: "color-mix(in srgb, var(--layout-nav-text, #fff) 8%, transparent)",
              border: "1.5px dashed color-mix(in srgb, var(--layout-nav-text, #fff) 25%, transparent)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--layout-nav-text, #fff) 15%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-nav-text, #fff) 50%, transparent)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--layout-nav-text, #fff) 8%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-nav-text, #fff) 25%, transparent)"; }}
          >
            <Plus size={16} className="mb-1" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.4 }} />
            <span className="text-[9px] font-semibold" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.4 }}>Adicionar</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-20 animate-fade-in">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5" style={{ background: "color-mix(in srgb, var(--layout-nav-text, #fff) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-nav-text, #fff) 15%, transparent)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
            <Plus size={28} style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.6 }} />
          </div>
          <p className="text-sm font-bold mb-1" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.6 }}>Área de trabalho vazia</p>
          <p className="text-xs mb-5 max-w-xs" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.3 }}>Adicione atalhos e widgets para personalizar seu painel</p>
          <button
            onClick={() => { setShowAddDialog(true); setAddStep("choose"); }}
            className="btn-skyglass px-6 py-2.5 text-xs"
          >
            <Plus size={12} className="inline mr-1.5" /> Começar a personalizar
          </button>
        </div>
      )}

      {/* Add Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => { setShowAddDialog(false); setAddStep("choose"); }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="relative rounded-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
            style={{
               background: "rgba(15, 15, 15, 0.75)",
               backdropFilter: "blur(40px) saturate(1.8)",
               WebkitBackdropFilter: "blur(40px) saturate(1.8)",
               border: "1px solid rgba(255,255,255,0.12)",
               boxShadow: "0 24px 80px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.08), inset 0 -1px 0 rgba(0,0,0,0.15)",
             }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base" style={{ color: "var(--layout-nav-text, #fff)" }}>
                {addStep === "choose" ? "O que deseja adicionar?" : addStep === "link" ? "Escolha um atalho" : "Escolha um widget"}
              </h3>
              <button onClick={() => { setShowAddDialog(false); setAddStep("choose"); }} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.18)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; }}>
                <X size={14} style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.6 }} />
              </button>
            </div>

            {addStep === "choose" && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setAddStep("link")}
                  className="flex flex-col items-center gap-3 p-5 rounded-2xl transition-all hover:scale-[1.03]"
                  style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px) saturate(1.4)", WebkitBackdropFilter: "blur(16px) saturate(1.4)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
                    <Link2 size={20} style={{ color: "var(--layout-button-text, #fff)" }} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm" style={{ color: "var(--layout-nav-text, #fff)" }}>Botão com Link</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.4 }}>Atalho para um módulo</p>
                  </div>
                </button>
                <button
                  onClick={() => setAddStep("widget")}
                  className="flex flex-col items-center gap-3 p-5 rounded-2xl transition-all hover:scale-[1.03]"
                  style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(16px) saturate(1.4)", WebkitBackdropFilter: "blur(16px) saturate(1.4)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                >
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
                    <BarChart3 size={20} style={{ color: "var(--layout-button-text, #fff)" }} />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold text-sm" style={{ color: "var(--layout-nav-text, #fff)" }}>Widget</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.4 }}>Dados em tempo real</p>
                  </div>
                </button>
              </div>
            )}

            {addStep === "link" && (
              <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1">
                {linkOptions.map(opt => {
                  const Icon = getIcon(opt.icon);
                  const exists = items.some(i => i.type === "link" && (
                    (opt.page && i.linkPage === opt.page) ||
                    (opt.external && i.linkExternal === opt.external)
                  ));
                  return (
                    <button
                      key={opt.label}
                      onClick={() => addLink(opt)}
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-left hover:scale-[1.01]"
                      style={{
                        background: exists ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        boxShadow: exists ? "none" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                        opacity: exists ? 0.4 : 1,
                        color: "#fff",
                      }}
                      onMouseEnter={e => { if (!exists) { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = exists ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                    >
                      <Icon size={16} />
                      <span className="font-semibold">{opt.label}</span>
                      {opt.external && <ExternalLink size={10} className="text-white/30 ml-auto" />}
                      {exists && <span className="text-[10px] text-white/30 ml-auto">Já adicionado</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {addStep === "widget" && (
              <div className="space-y-2">
                {widgetOptions.map(opt => {
                  const exists = items.some(i => i.type === "widget" && i.widgetType === opt.type);
                  return (
                    <button
                      key={opt.type}
                      onClick={() => !exists && addWidget(opt)}
                      disabled={exists}
                      className="w-full flex items-start gap-3 px-4 py-4 rounded-xl text-sm transition-all text-left hover:scale-[1.01]"
                      style={{
                        background: exists ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                        backdropFilter: "blur(12px)",
                        WebkitBackdropFilter: "blur(12px)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        boxShadow: exists ? "none" : "inset 0 1px 0 rgba(255,255,255,0.04)",
                        opacity: exists ? 0.4 : 1,
                        color: "#fff",
                      }}
                      onMouseEnter={e => { if (!exists) { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.18)"; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = exists ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)" }}>
                        {opt.type === "agenda" && <CalendarDays size={14} style={{ color: "var(--layout-button-text, #fff)" }} />}
                        {opt.type === "musica" && <Music size={14} style={{ color: "var(--layout-button-text, #fff)" }} />}
                        {opt.type === "stats" && <BarChart3 size={14} style={{ color: "var(--layout-button-text, #fff)" }} />}
                        {opt.type === "weather" && <CloudSun size={14} style={{ color: "var(--layout-button-text, #fff)" }} />}
                        {opt.type === "player" && <Radio size={14} style={{ color: "var(--layout-button-text, #fff)" }} />}
                      </div>
                      <div>
                        <p className="font-semibold">{opt.label}</p>
                        <p className="text-white/40 text-[11px] mt-0.5">{opt.description}</p>
                        {exists && <p className="text-[10px] text-white/30 mt-1">Já adicionado</p>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {addStep !== "choose" && (
              <button
                onClick={() => setAddStep("choose")}
                className="mt-3 px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all hover:scale-105"
                style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.color = "rgba(255,255,255,0.8)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
              >
                ← Voltar
              </button>
            )}
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
    case "musica": return <MusicaPreview />;
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
    case "cortevideo": return <GenericPreview icon={Scissors} text="Cortes de vídeo" />;
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
    supabase.from("agenda_eventos").select("data, descricao").eq("user_id", user.id).gte("data", today).order("data").limit(3)
      .then(({ data }) => { if (data) setEvents(data); });
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

function MusicaPreview() {
  const [music, setMusic] = useState<any>(null);
  const [programa, setPrograma] = useState("");
  useEffect(() => {
    const update = () => {
      try {
        const raw = localStorage.getItem("masterview_music_data");
        if (raw) {
          const d = JSON.parse(raw);
          if (d.titulo) setMusic(d);
          if (d.programa) setPrograma(d.programa);
        }
      } catch {}
    };
    update();
    const iv = setInterval(update, 3000);
    return () => clearInterval(iv);
  }, []);
  return music ? (
    <div className="flex items-center gap-2.5">
      {music.capa ? (
        <img src={music.capa} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0 shadow-md" />
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
    supabase.from("programas").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("ativo", true)
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
function DashboardAgendaWidget({ onNavigate }: { onNavigate: (page: Page) => void }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    supabase
      .from("agenda_eventos")
      .select("*")
      .eq("user_id", user.id)
      .gte("data", today)
      .order("data", { ascending: true })
      .limit(5)
      .then(({ data }) => { if (data) setEvents(data); });
  }, [user]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={14} style={{ color: "var(--layout-accent-color)" }} />
        <p className="font-bold text-sm" style={{ color: "var(--layout-widget-text)" }}>Agenda de Eventos</p>
      </div>
      {events.length === 0 ? (
        <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-widget-text) 35%, transparent)" }}>Nenhum evento próximo</p>
      ) : (
        <div className="space-y-2">
          {events.map(ev => (
            <div key={ev.id} className="px-3 py-2 rounded-lg" style={{ background: "color-mix(in srgb, var(--layout-accent-color) 10%, transparent)" }}>
              <p className="text-xs font-semibold truncate" style={{ color: "var(--layout-widget-text)" }}>{ev.descricao || "Evento"}</p>
              <p className="text-[10px]" style={{ color: "color-mix(in srgb, var(--layout-widget-text) 45%, transparent)" }}>
                {new Date(ev.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — {ev.local}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-auto pt-3">
        <button
          onClick={() => onNavigate("agenda")}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all hover:scale-105"
          style={{
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(16px) saturate(1.4)",
            WebkitBackdropFilter: "blur(16px) saturate(1.4)",
            color: "var(--layout-accent-color)",
            border: "1px solid rgba(255,255,255,0.1)",
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
function MusicProgramWidget() {
  const { user } = useAuth();
  const [music, setMusic] = useState<{ titulo: string; artista: string; capa: string } | null>(null);
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
        const raw = localStorage.getItem("masterview_music_data");
        if (raw) {
          const d = JSON.parse(raw);
          if (d.titulo && d.titulo !== prevTitle) {
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
  }, []);

  // Fetch current program from DB
  useEffect(() => {
    if (!user) return;
    let prevProgramId = "";
    const fetchProgram = async () => {
      const now = new Date();
      const dayMap: Record<number, string> = { 0: "Domingo", 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado" };
      const todayKey = dayMap[now.getDay()];
      const currentTime = now.toTimeString().slice(0, 5);

      const { data } = await supabase
        .from("programas")
        .select("*, apresentadores(nome, foto)")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .lte("horario_inicio", currentTime)
        .gte("horario_fim", currentTime)
        .contains("dias_semana", [todayKey])
        .limit(1)
        .maybeSingle();

      if (data) {
        if (data.id !== prevProgramId) {
          prevProgramId = data.id;
          setProgramKey(k => k + 1);
        }
        setCurrentProgram(data);
        const [startH, startM] = data.horario_inicio.split(":").map(Number);
        const [endH, endM] = data.horario_fim.split(":").map(Number);
        const startMin = startH * 60 + startM;
        const endMin = endH * 60 + endM;
        const nowMin = now.getHours() * 60 + now.getMinutes();
        setTotal(endMin - startMin);
        setElapsed(nowMin - startMin);
      }
    };
    fetchProgram();
    const iv = setInterval(fetchProgram, 30000);
    return () => clearInterval(iv);
  }, [user]);

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

      {/* Music */}
      {music ? (
        <div key={`music-${musicKey}`} className="flex items-center gap-3 animate-fade-in">
          {music.capa && (
            <img src={music.capa} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-xs font-semibold truncate" style={{ color: "var(--layout-widget-text, #fff)" }}>{music.titulo}</p>
            <p className="text-[10px] truncate" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.5 }}>{music.artista}</p>
          </div>
        </div>
      ) : !currentProgram ? (
        <p className="text-xs" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.3 }}>Sem programa no momento</p>
      ) : null}
    </div>
  );
}

/* ========== WIDGET: Stats ========== */
function StatsWidget() {
  const { user } = useAuth();
  const [prerollCount, setPrerollCount] = useState(0);
  const [channelCount, setChannelCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from("comercial_preroll").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true),
      supabase.from("streaming_channels").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true),
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
function DashboardPlayerWidget({ onVideoChange }: { onVideoChange?: (active: boolean) => void }) {
  const { user } = useAuth();
  const [channels, setChannels] = useState<any[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [showVideo, setShowVideo] = useState(false);
  const [videoLoading, setVideoLoading] = useState(false);
  const [currentMusic, setCurrentMusic] = useState<{ titulo: string; artista: string; capa: string } | null>(null);

  useEffect(() => { onVideoChange?.(showVideo); }, [showVideo, onVideoChange]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<any>(null);
  const hlsInitUrlRef = useRef<string>("");

  useEffect(() => {
    if (!user) return;
    const fetchChannels = async () => {
      let { data, error } = await supabase
        .from("streaming_channels")
        .select("*")
        .eq("user_id", user.id)
        .eq("active", true)
        .neq("type", "catalog")
        .order("numero_canal");

      if (!error && (!data || data.length === 0)) {
        const fallback = await supabase
          .from("streaming_channels")
          .select("*")
          .eq("active", true)
          .neq("type", "catalog")
          .order("numero_canal");
        data = fallback.data;
        error = fallback.error;
      }

      if (error) return;
      if (data && data.length > 0) setChannels(data);
    };
    fetchChannels();
  }, [user]);

  useEffect(() => {
    const poll = () => {
      try {
        const raw = localStorage.getItem("masterview_music_data");
        if (raw) {
          const d = JSON.parse(raw);
          if (d.titulo) {
            setCurrentMusic(prev => {
              if (prev?.titulo === d.titulo && prev?.artista === (d.artista || "") && prev?.capa === (d.capa || "")) return prev;
              return { titulo: d.titulo, artista: d.artista || "", capa: d.capa || "" };
            });
            return;
          }
        }
      } catch {}
      setCurrentMusic(null);
    };
    poll();
    const iv = setInterval(poll, 1500);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "none";
      audioRef.current = audio;
    }
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
          el.play().catch(() => {});
          return;
        }
        const hls = new Hls({ maxBufferLength: 30, maxMaxBufferLength: 60 });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(el);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          el.volume = volume;
          el.muted = isMuted;
          el.play().catch(() => {});
        });
      });
    } else {
      el.src = url;
      el.volume = volume;
      el.muted = isMuted;
      el.play().catch(() => {});
    }

    return () => { hlsInitUrlRef.current = ""; el.removeEventListener("playing", onPlaying); };
  }, [showVideo, activeIdx]);

  const activeChannel = channels[activeIdx];
  const channelType = activeChannel?.type || "";
  const isVideo = channelType.includes("video");

  const destroyHls = () => {
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    hlsInitUrlRef.current = "";
  };

  const stopAll = () => {
    destroyHls();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    setShowVideo(false);
    setIsPlaying(false);
  };

  const togglePlay = () => {
    if (!activeChannel) return;
    if (isPlaying) { stopAll(); return; }
    // Stop any previous playback without calling stopAll (which resets isPlaying)
    destroyHls();
    if (audioRef.current) { audioRef.current.pause(); }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
    setShowVideo(false);

    if (isVideo) {
      setShowVideo(true);
      setIsPlaying(true);
    } else {
      const audio = audioRef.current;
      if (!audio) return;
      // Set source and play in user gesture context
      audio.src = activeChannel.url;
      audio.volume = volume;
      audio.muted = isMuted;
      audio.play().then(() => setIsPlaying(true)).catch((err) => {
        console.warn("Audio play failed:", err);
      });
    }
  };

  const switchTo = (idx: number) => {
    destroyHls();
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); }
    setActiveIdx(idx);
    const ch = channels[idx];
    const chIsVideo = (ch?.type || "").includes("video");
    if (isPlaying) {
      if (chIsVideo) {
        // Keep showVideo true, just let useEffect re-init with new URL
        setShowVideo(true);
      } else {
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
        setShowVideo(false);
        const audio = audioRef.current;
        if (audio) { audio.src = ch.url; audio.play().catch(() => {}); }
      }
    } else {
      if (videoRef.current) { videoRef.current.pause(); videoRef.current.removeAttribute("src"); videoRef.current.load(); }
      setShowVideo(false);
    }
  };

  const goNext = () => { if (channels.length > 1) switchTo((activeIdx + 1) % channels.length); };
  const goPrev = () => { if (channels.length > 1) switchTo((activeIdx - 1 + channels.length) % channels.length); };

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

  const channelLogo = activeChannel?.background_url || activeChannel?.logo_url || activeChannel?.cover_url;
  const displayArt = currentMusic?.capa || channelLogo;

  // Crossfade state for art transitions
  const [visibleArt, setVisibleArt] = useState(displayArt);
  const [fadingArt, setFadingArt] = useState<string | null>(null);
  const [artOpacity, setArtOpacity] = useState(1);

  useEffect(() => {
    if (displayArt === visibleArt) return;
    // Start crossfade: show old art fading out while new fades in
    setFadingArt(visibleArt || null);
    setVisibleArt(displayArt);
    setArtOpacity(0);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => setArtOpacity(1));
    });
    const timer = setTimeout(() => setFadingArt(null), 600);
    return () => clearTimeout(timer);
  }, [displayArt]);

  return (
    <div className="flex flex-col h-full relative">
      {/* Blurred background art with crossfade */}
      <div className="absolute inset-0 -m-4 overflow-hidden pointer-events-none rounded-2xl">
        {fadingArt && (
          <img src={fadingArt} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(20px) brightness(0.3) saturate(1.4)", transform: "scale(1.3)", transition: "opacity 0.6s ease-out", opacity: 0 }} />
        )}
        {visibleArt && (
          <img src={visibleArt} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(20px) brightness(0.3) saturate(1.4)", transform: "scale(1.3)", transition: "opacity 0.6s ease-out", opacity: artOpacity }} />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,10,10,0.6) 0%, rgba(10,10,10,0.9) 100%)" }} />
      </div>

      {/* Video area - grows above controls */}
      {showVideo && isVideo && (
        <div className="relative -mx-4 -mt-4 mb-3 rounded-t-2xl overflow-hidden" style={{ animation: "widget-video-grow 0.4s ease-out forwards" }}>
          <video ref={videoRef} autoPlay muted={isMuted} playsInline className="w-full object-contain" style={{ aspectRatio: "16/9", maxHeight: "220px", background: "#000" }} />
          {videoLoading && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)" }}>
              <Loader2 size={24} className="text-white/60 animate-spin" />
            </div>
          )}
          <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(180deg, transparent 50%, rgba(10,10,10,0.7) 100%)" }} />
        </div>
      )}

      {/* Spacer to push controls to bottom & center vertically */}
      <div className="flex-1 min-h-0" />

      {/* Controls row - vertically centered & bottom-aligned */}
      {channels.length === 0 ? (
        <p className="text-white/30 text-xs relative z-10 my-auto">Nenhum canal cadastrado</p>
      ) : (
        <div className="relative z-10 flex items-center gap-2.5 flex-shrink-0 pb-0.5">
          {channels.length > 1 && (
            <button onClick={goPrev} className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-110" style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(16px) saturate(1.4)", WebkitBackdropFilter: "blur(16px) saturate(1.4)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}>
              <ChevronLeft size={14} className="text-white/70" />
            </button>
          )}

          {!showVideo && (
            <div className="w-16 h-16 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden relative" style={{ background: "rgba(255,255,255,0.05)", boxShadow: "0 4px 15px rgba(0,0,0,0.5)" }}>
              {fadingArt && (
                <img src={fadingArt} alt="" className="absolute inset-0 w-full h-full object-cover rounded-xl" style={{ transition: "opacity 0.5s ease-out", opacity: 0 }} />
              )}
              {visibleArt ? (
                <img src={visibleArt} alt="" className="absolute inset-0 w-full h-full object-cover rounded-xl" style={{ transition: "opacity 0.5s ease-out", opacity: artOpacity }} />
              ) : (
                <Tv size={22} className="text-white/20" />
              )}
              {isPlaying && !isVideo && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex items-end gap-[2px] h-4">
                    {[0, 1, 2, 3].map(i => (
                      <div key={i} className="w-[3px] rounded-full" style={{ background: "linear-gradient(0deg, var(--layout-button-bg), var(--layout-accent-color))", animation: `eq-bar 0.${4 + i}s ease-in-out infinite alternate`, height: `${6 + Math.random() * 10}px` }} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {isPlaying && <Circle size={5} fill="var(--layout-accent-color)" color="var(--layout-accent-color)" className="animate-pulse flex-shrink-0" />}
              <p className="text-white text-[11px] font-bold truncate">{activeChannel?.name}</p>
            </div>
            {currentMusic ? (
              <div className="mb-1">
                <p className="text-white/70 text-[9px] truncate">{currentMusic.titulo}</p>
                <p className="text-white/40 text-[8px] truncate">{currentMusic.artista}</p>
              </div>
            ) : (
              <div className="flex items-center gap-1 mb-1">
                <span className="text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--layout-accent-color) 26%, transparent)", color: "var(--layout-accent-color)" }}>{activeChannel?.numero_canal}</span>
                <span className="text-white/30 text-[8px]">{isVideo ? "Vídeo" : "Áudio"}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={togglePlay} className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-110" style={{ background: "linear-gradient(135deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))", backdropFilter: "blur(20px) saturate(1.6)", WebkitBackdropFilter: "blur(20px) saturate(1.6)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 4px 16px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.1)" }}>
                {isPlaying ? <Pause size={13} className="text-white" /> : <Play size={13} className="text-white ml-0.5" />}
              </button>
              <button onClick={toggleMute} className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 transition-all hover:scale-110" style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)" }}>
                {isMuted || volume === 0 ? <VolumeX size={12} className="text-white/50" /> : <Volume2 size={12} className="text-white/50" />}
              </button>
              <input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={e => handleVolume(Number(e.target.value))} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onDragStart={e => { e.stopPropagation(); e.preventDefault(); }} draggable={false} className="w-14 h-1 appearance-none rounded-full cursor-pointer flex-shrink-0" style={{ background: `linear-gradient(to right, var(--layout-accent-color) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(isMuted ? 0 : volume) * 100}%)`, accentColor: "var(--layout-accent-color)" }} />
              {isVideo && <span className="text-[7px] font-bold text-white/20 ml-auto"><Tv size={10} className="inline mr-0.5" />VIDEO</span>}
            </div>
          </div>

          {channels.length > 1 && (
            <button onClick={goNext} className="w-7 h-7 rounded-xl flex items-center justify-center flex-shrink-0 transition-all hover:scale-110" style={{ background: "rgba(255,255,255,0.1)", backdropFilter: "blur(16px) saturate(1.4)", WebkitBackdropFilter: "blur(16px) saturate(1.4)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.08)" }} onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.2)"; }} onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}>
              <ChevronRight size={14} className="text-white/70" />
            </button>
          )}
        </div>
      )}

      <style>{`
        @keyframes eq-bar { 0% { height: 3px; } 100% { height: 14px; } }
        @keyframes widget-video-grow { 0% { max-height: 0; opacity: 0; } 100% { max-height: 220px; opacity: 1; } }
      `}</style>
    </div>
  );
}
