import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Plus, X, Link2, BarChart3, CalendarDays, Music, Eye, Users, Mic2, PlaySquare, Newspaper, Settings, ShoppingBag, Tag, Image, Film, ShoppingCart, Monitor, Wrench, Scissors, MonitorPlay, ExternalLink, GripVertical, Loader2, Trash2, MessageSquareQuote, Radio, Clock, Tv, FileText, CloudSun, ChevronDown, ChevronLeft, ChevronRight, Play, Pause, Volume2, VolumeX, Circle, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import { readMusicData } from "@/lib/musicStorageKeys";

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
  { label: "Roll", page: "preroll", icon: "Film" },
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
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addStep, setAddStep] = useState<"choose" | "link" | "widget">("choose");
  const [editMode, setEditMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [playerVideoActive, setPlayerVideoActive] = useState<string | null>(null);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);

  // Resolve effective user ID (parent for sub-users)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase.from("sub_users").select("parent_user_id, ativo").eq("auth_user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setEffectiveUserId(data?.ativo ? data.parent_user_id : user.id);
      });
    return () => { cancelled = true; };
  }, [user]);

  const dataUserId = effectiveUserId || user?.id;

  // On-air program info
  interface OnAirProgram {
    nome: string;
    selo: string;
    horario_inicio: string;
    horario_fim: string;
    classificacao_etaria: string;
    descricao: string;
    apresentador_nome: string;
    tipo_programa: string;
    is_hd: boolean;
    is_stereo: boolean;
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
        .select("nome, selo, thumb, horario_inicio, horario_fim, classificacao_etaria, descricao, dias_semana, ativo, apresentador_id, tipo_programa, estudio, apresentadores(nome)")
        .eq("user_id", dataUserId!)
        .eq("ativo", true)
        .ilike("estudio", "%fm%");
      if (cancelled || !data) return;
      const now = new Date();
      const diaAtual = DIAS_MAP[now.getDay()];
      const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const current = data.find(p =>
        (p.dias_semana || []).includes(diaAtual) &&
        horaAtual >= p.horario_inicio &&
        horaAtual < p.horario_fim
      );
      if (!current) {
        setOnAirProgram(null);
        return;
      }

      // Fetch channel specs (is_hd, is_stereo) for the studio
      let isHd = false;
      let isStereo = false;
      if (current.estudio) {
        const { data: channels } = await supabase
          .from("streaming_channels")
          .select("is_hd, is_stereo")
          .eq("user_id", dataUserId!)
          .eq("active", true)
          .ilike("estudio", current.estudio)
          .limit(1);
        if (channels && channels.length > 0) {
          isHd = !!channels[0].is_hd;
          isStereo = !!channels[0].is_stereo;
        }
      }

      setOnAirProgram({
        nome: current.nome,
        selo: current.selo || "",
        horario_inicio: current.horario_inicio,
        horario_fim: current.horario_fim,
        classificacao_etaria: current.classificacao_etaria || "L",
        descricao: current.descricao || "",
        apresentador_nome: (current.apresentadores as any)?.nome || "",
        tipo_programa: current.tipo_programa || "",
        is_hd: isHd,
        is_stereo: isStereo,
      });
    };
    fetchOnAir();
    const interval = setInterval(fetchOnAir, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user]);

  // Poll music from per-user localStorage (scoped to prevent cross-tenant leak)
  useEffect(() => {
    const pollMusic = () => {
      try {
        const parsed = readMusicData(dataUserId);
        if (parsed && parsed.titulo) {
          setCurrentMusic({ titulo: parsed.titulo, artista: parsed.artista || "" });
          return;
        }
      } catch {}
      setCurrentMusic(null);
    };
    pollMusic();
    const interval = setInterval(pollMusic, 2000);
    return () => clearInterval(interval);
  }, [dataUserId]);

  // Load dashboard items from DB (fallback to localStorage for migration)
  useEffect(() => {
    if (!user) return;
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
        await mergeUserDashboardItems(user.id, {
          items: parsed as unknown[],
        });
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

    try {
      await mergeUserDashboardItems(user.id, {
        items: newItems as unknown[],
      });
    } catch (error) {
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
          <div className="flex flex-wrap gap-3 sm:gap-4">
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
                      className="w-[130px] h-[120px] sm:w-[150px] sm:h-[130px] rounded-[22px] flex flex-col items-start justify-between p-5 transition-all duration-300 hover:scale-[1.05] hover:-translate-y-1 overflow-hidden relative isolate"
                      style={{
                        background: isDragOver
                          ? `linear-gradient(145deg, color-mix(in srgb, var(--layout-accent-color, #c8ff00) 22%, var(--layout-button-bg, #8b0000)) 0%, color-mix(in srgb, var(--layout-accent-color, #c8ff00) 12%, var(--layout-button-bg, #8b0000)) 100%)`
                          : `linear-gradient(145deg, color-mix(in srgb, var(--layout-button-bg, #8b0000) 88%, black 12%) 0%, color-mix(in srgb, var(--layout-button-bg, #8b0000) 76%, black 24%) 100%)`,
                        boxShadow: isDragOver
                          ? `0 14px 36px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)`
                          : `0 2px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.05)`,
                        backgroundClip: "padding-box",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.boxShadow = `0 12px 40px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)`;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.boxShadow = isDragOver
                          ? `0 14px 36px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.08)`
                          : `0 2px 12px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.05)`;
                      }}
                    >
                      {/* Subtle gradient overlay on top */}
                      <div className="absolute inset-px rounded-[21px] pointer-events-none" style={{ background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.015) 38%, transparent 65%)" }} />
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center relative z-[1]" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #c8ff00) 12%, transparent)" }}>
                        <Icon size={20} style={{ color: "var(--layout-accent-color, #c8ff00)" }} />
                      </div>
                      <div className="w-full relative z-[1]">
                        <span className="text-[12px] font-semibold leading-tight block truncate" style={{ color: "var(--layout-nav-text, #fff)" }}>{item.linkLabel}</span>
                        {item.linkExternal && <ExternalLink size={9} className="mt-0.5" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.25 }} />}
                      </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                    className="absolute top-2.5 right-2.5 w-5 h-5 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 z-10"
                    style={{ background: "rgba(0,0,0,0.6)" }}
                  >
                    <X size={9} style={{ color: "#fff", opacity: 0.7 }} />
                  </button>
                </div>
              );
            })}
            {/* Add button */}
            <div
              onClick={() => { setShowAddDialog(true); setAddStep("choose"); }}
              className="w-[130px] h-[120px] sm:w-[150px] sm:h-[130px] rounded-[22px] flex flex-col items-center justify-center cursor-pointer transition-all duration-300 hover:scale-[1.05] hover:-translate-y-1"
              style={{
                background: "color-mix(in srgb, var(--layout-nav-text, #fff) 4%, transparent)",
                border: "1.5px dashed color-mix(in srgb, var(--layout-nav-text, #fff) 15%, transparent)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--layout-nav-text, #fff) 10%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-nav-text, #fff) 35%, transparent)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--layout-nav-text, #fff) 4%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-nav-text, #fff) 15%, transparent)"; }}
            >
              <Plus size={20} className="mb-1.5" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.25 }} />
              <span className="text-[10px] font-semibold" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.25 }}>Adicionar</span>
            </div>
          </div>
        </div>
      )}

      {/* On-Air Program Info */}
      {onAirProgram && (
        <div className="mb-4 animate-fade-in">
          <div className="flex items-start gap-5">
            {/* Selo / Logo do programa */}
            {onAirProgram.selo && (
               <img
                 src={onAirProgram.selo}
                 alt={onAirProgram.nome}
                 className="w-24 h-24 sm:w-32 sm:h-32 lg:w-40 lg:h-40 rounded-xl object-contain flex-shrink-0"
               />
            )}
            <div className="flex-1 min-w-0">
            {/* Ao Vivo */}
            <div className="flex items-center gap-1.5 mb-1">
              <div className="flex items-center gap-1.5">
                <Circle size={8} fill="var(--layout-accent-color)" color="var(--layout-accent-color)" className="animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--layout-accent-color)" }}>Ao Vivo</span>
              </div>
            </div>

            {/* Horário */}
            <div className="flex items-center gap-1.5 mb-1">
              <Clock size={11} style={{ color: "var(--layout-icon-color, #888)" }} />
              <span className="text-[10px]" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.6 }}>
                {onAirProgram.horario_inicio} — {onAirProgram.horario_fim}
              </span>
            </div>

            {/* Apresentador(a) */}
            {onAirProgram.apresentador_nome && (
              <div className="flex items-center gap-1.5 mb-1">
                <User size={12} style={{ color: "var(--layout-icon-color, #888)" }} />
                <span className="text-[11px] font-semibold" style={{ color: "var(--layout-nav-text, #fff)" }}>{onAirProgram.apresentador_nome}</span>
              </div>
            )}

            {/* Descrição / Tipo de programa */}
            {(onAirProgram.descricao || onAirProgram.tipo_programa) && (
              <p className="text-[10px] leading-relaxed line-clamp-2 mb-1.5" style={{ maxWidth: 360, color: "var(--layout-nav-text, #fff)", opacity: 0.6 }}>
                {onAirProgram.tipo_programa && <span className="capitalize">{onAirProgram.tipo_programa.replace(/_/g, " ")}</span>}
                {onAirProgram.tipo_programa && onAirProgram.descricao && " — "}
                {onAirProgram.descricao}
              </p>
            )}

            {/* Ícones: Full HD + Stereo + Classificação */}
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              {onAirProgram.is_hd && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase" style={{ border: "1px solid rgba(255,255,255,0.15)", color: "var(--layout-nav-text, #fff)", opacity: 0.5 }}>
                  <span className="text-[7px]">1080p</span> FULL HD
                </span>
              )}
              {onAirProgram.is_stereo && (
                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase" style={{ border: "1px solid rgba(255,255,255,0.15)", color: "var(--layout-nav-text, #fff)", opacity: 0.5 }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 10v3"/><path d="M6 6v11"/><path d="M10 3v18"/><path d="M14 8v7"/><path d="M18 5v13"/><path d="M22 10v3"/></svg>
                  STEREO
                </span>
              )}
              {onAirProgram.classificacao_etaria && (
                 <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-black tracking-wider uppercase" style={{ border: "1px solid rgba(255,255,255,0.15)", color: "var(--layout-nav-text, #fff)", opacity: 0.5 }}>
                   {onAirProgram.classificacao_etaria}
                </span>
              )}
            </div>

            {/* Música tocando */}
            {currentMusic && (
              <div className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Music size={12} className="flex-shrink-0" style={{ color: "var(--layout-icon-color, #888)" }} />
                <div className="min-w-0">
                  <p className="text-[11px] font-medium" style={{ color: "var(--layout-nav-text, #fff)" }}>
                    <TypewriterText text={currentMusic.titulo?.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') || ""} />
                  </p>
                  {currentMusic.artista && (
                    <p className="text-[9px]" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.5 }}>
                      <TypewriterText text={currentMusic.artista.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')} />
                    </p>
                  )}
                </div>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" style={{ gridAutoRows: "auto" }}>

            {items.filter(i => i.type === "widget").map(item => {
              const isDragging = draggedId === item.id;
              const isDragOver = dragOverId === item.id && draggedId !== item.id;
              return (
                <div
                  key={item.id}
                  className={`relative group rounded-3xl animate-fade-in flex flex-col ${isDragging ? "opacity-40 scale-95" : ""}`}
                  style={{
                    background: "var(--layout-widget-bg, #1a1a1a)",
                    boxShadow: isDragOver ? "0 0 0 2px var(--layout-accent-color), 0 4px 20px rgba(0,0,0,0.12)" : "0 4px 20px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.04)",
                    borderRadius: "24px",
                    height: item.widgetType === "player" ? "auto" : "280px",
                    minHeight: item.widgetType === "player" ? "180px" : undefined,
                    maxHeight: item.widgetType === "player" ? "none" : "280px",
                    overflow: item.widgetType === "player" && playerVideoActive === item.id ? "visible" : "hidden",
                  }}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={handleDragEnd}
                >
                  <div
                    className="flex items-center gap-2 px-5 py-3 cursor-grab active:cursor-grabbing flex-shrink-0"
                    style={{ borderBottom: `1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)` }}
                    draggable
                    onDragStart={(e) => { e.stopPropagation(); handleDragStart(item.id); }}
                  >
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: "color-mix(in srgb, var(--layout-accent-color, #c8ff00) 15%, transparent)" }}>
                      {item.widgetType === "agenda" && <CalendarDays size={12} style={{ color: "var(--layout-accent-color, #c8ff00)" }} />}
                      {item.widgetType === "musica" && <Music size={12} style={{ color: "var(--layout-accent-color, #c8ff00)" }} />}
                      {item.widgetType === "stats" && <BarChart3 size={12} style={{ color: "var(--layout-accent-color, #c8ff00)" }} />}
                      {item.widgetType === "weather" && <CloudSun size={12} style={{ color: "var(--layout-accent-color, #c8ff00)" }} />}
                      {item.widgetType === "player" && <Radio size={12} style={{ color: "var(--layout-accent-color, #c8ff00)" }} />}
                    </div>
                    <span className="text-[10px] font-semibold" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.6 }}>
                      {item.widgetType === "agenda" ? "Agenda" : item.widgetType === "musica" ? "No Ar" : item.widgetType === "weather" ? "Tempo" : item.widgetType === "player" ? "Player" : "Estatísticas"}
                    </span>
                    <GripVertical size={10} className="ml-auto" style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.15 }} />
                  </div>
                  <div className="absolute top-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-6 h-6 rounded-lg flex items-center justify-center transition-all hover:scale-110"
                      style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)" }}
                    >
                      <X size={10} style={{ color: "var(--layout-widget-text, #fff)", opacity: 0.5 }} />
                    </button>
                  </div>
                  <div className="p-4 flex-1 overflow-y-auto overflow-x-hidden widget-scroll">
                    <Suspense fallback={<Loader2 className="animate-spin" size={18} style={{ color: "var(--layout-icon-color, #888)", opacity: 0.4 }} />}>
                      {item.widgetType === "agenda" && <DashboardAgendaWidget dataUserId={dataUserId || undefined} onNavigate={onNavigate} />}
                      {item.widgetType === "musica" && <MusicProgramWidget dataUserId={dataUserId || undefined} />}
                      {item.widgetType === "stats" && <StatsWidget dataUserId={dataUserId || undefined} />}
                      {item.widgetType === "weather" && <DashboardWeatherWidget />}
                      {item.widgetType === "player" && <DashboardPlayerWidget dataUserId={dataUserId || undefined} onVideoChange={(active) => setPlayerVideoActive(active ? item.id : null)} />}
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
            className="w-[120px] h-[100px] sm:w-[140px] sm:h-[110px] rounded-3xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.04]"
            style={{
              background: "color-mix(in srgb, var(--layout-nav-text, #fff) 5%, transparent)",
              border: "1.5px dashed color-mix(in srgb, var(--layout-nav-text, #fff) 20%, transparent)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--layout-nav-text, #fff) 12%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-nav-text, #fff) 40%, transparent)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--layout-nav-text, #fff) 5%, transparent)"; e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-nav-text, #fff) 20%, transparent)"; }}
          >
            <Plus size={18} className="mb-1.5" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.3 }} />
            <span className="text-[10px] font-semibold" style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.3 }}>Adicionar</span>
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
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative rounded-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto"
            style={{
               background: "rgba(18, 18, 20, 0.97)",
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
                  style={{ background: "rgba(255,255,255,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}
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
                  style={{ background: "rgba(255,255,255,0.06)", boxShadow: "0 4px 16px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)" }}
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
          if (d.titulo) setMusic(d);
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

  useEffect(() => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    supabase
      .from("agenda_eventos")
      .select("*, programa:programas(horario_inicio, horario_fim)")
      .eq("user_id", uid!)
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
        {events.length > 0 && (
          <span
            className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full"
            style={{
              background: "color-mix(in srgb, var(--layout-accent-color) 20%, transparent)",
              color: "var(--layout-accent-color)",
            }}
          >
            {events.length}
          </span>
        )}
      </div>
      {events.length === 0 ? (
        <p className="text-xs" style={{ color: "color-mix(in srgb, var(--layout-widget-text) 35%, transparent)" }}>Nenhum evento próximo</p>
      ) : (
        <div className="space-y-1">
          {events.map(ev => {
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
                  <div className="flex items-center gap-1.5 mt-1">
                    {ev.programa?.horario_inicio && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-px rounded tabular-nums"
                        style={{
                          background: "color-mix(in srgb, var(--layout-accent-color) 18%, transparent)",
                          color: "var(--layout-widget-text)",
                        }}
                      >
                        {ev.programa.horario_inicio.slice(0, 5)}
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
        const d = readMusicData(dataUserId) as any;
        if (d) {
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
  }, [dataUserId]);

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
        .eq("user_id", uid!)
        .eq("ativo", true)
        .ilike("estudio", "%fm%")
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
function DashboardPlayerWidget({ dataUserId, onVideoChange }: { dataUserId?: string; onVideoChange?: (active: boolean) => void }) {
  const { user } = useAuth();
  const uid = dataUserId || user?.id;
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
    if (!uid) return;
    const fetchChannels = async () => {
      let { data, error } = await supabase
        .from("streaming_channels")
        .select("*")
        .eq("user_id", uid)
        .eq("active", true)
        .neq("type", "catalog")
        .order("numero_canal");

      if (!error && (!data || data.length === 0)) {
        const fallback = await supabase
          .from("streaming_channels")
          .select("*")
          .eq("user_id", uid)
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
  }, [uid]);

  useEffect(() => {
    const poll = () => {
      try {
        const d = readMusicData(dataUserId) as any;
        if (d && d.titulo) {
          setCurrentMusic(prev => {
            if (prev?.titulo === d.titulo && prev?.artista === (d.artista || "") && prev?.capa === (d.capa || "")) return prev;
            return { titulo: d.titulo, artista: d.artista || "", capa: d.capa || "" };
          });
          return;
        }
      } catch {}
      setCurrentMusic(null);
    };
    poll();
    const iv = setInterval(poll, 1500);
    return () => clearInterval(iv);
  }, [dataUserId]);

  useEffect(() => {
    if (!audioRef.current) {
      const audio = new Audio();
      audio.preload = "none";
      audioRef.current = audio;
    }
    return () => {
      // Cleanup: stop all playback when widget unmounts
      if (hlsRef.current) { try { hlsRef.current.destroy(); } catch {} hlsRef.current = null; }
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); audioRef.current = null; }
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
          <img src={fadingArt} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(28px) brightness(0.28) saturate(1.4)", transform: "scale(1.3)", transition: "opacity 0.6s ease-out", opacity: 0 }} />
        )}
        {visibleArt && (
          <img src={visibleArt} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(28px) brightness(0.28) saturate(1.4)", transform: "scale(1.3)", transition: "opacity 0.6s ease-out", opacity: artOpacity }} />
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,10,10,0.55) 0%, rgba(10,10,10,0.92) 100%)" }} />
      </div>

      {/* Video area — grows UPWARD as an overlay, anchored to top of widget */}
      <div
        className="absolute left-0 right-0 overflow-hidden rounded-2xl pointer-events-none"
        style={{
          bottom: "100%",
          marginBottom: showVideo && isVideo ? "8px" : "0px",
          height: showVideo && isVideo ? "auto" : "0px",
          opacity: showVideo && isVideo ? 1 : 0,
          transform: showVideo && isVideo ? "translateY(0)" : "translateY(20px)",
          transition: "opacity 0.35s ease, transform 0.4s cubic-bezier(0.4,0,0.2,1)",
          boxShadow: showVideo && isVideo ? "0 12px 40px rgba(0,0,0,0.7)" : "none",
          zIndex: 20,
        }}
      >
        <div className="relative w-full pointer-events-auto" style={{ background: "#000" }}>
          <video ref={videoRef} autoPlay muted={isMuted} playsInline className="w-full block" style={{ aspectRatio: "16/9" }} />
          {videoLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ background: "rgba(0,0,0,0.8)" }}>
              <Loader2 size={20} className="text-white/70 animate-spin" />
              <span className="text-white/40 text-[9px] font-medium tracking-wider uppercase">Carregando...</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      {channels.length === 0 ? (
        <p className="text-white/30 text-xs relative z-10 my-auto">Nenhum canal cadastrado</p>
      ) : (
        <div className="relative z-10 flex flex-col gap-3 flex-shrink-0 my-auto">
          {/* Main row: cover + info + nav */}
          <div className="flex items-center gap-3">
            {/* Cover art — bigger square in audio mode, hidden in video mode */}
            <div
              className="rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden relative"
              style={{
                width: showVideo && isVideo ? 0 : 72,
                height: showVideo && isVideo ? 0 : 72,
                opacity: showVideo && isVideo ? 0 : 1,
                marginRight: showVideo && isVideo ? -12 : 0,
                transition: "width 0.4s cubic-bezier(0.4,0,0.2,1), height 0.4s cubic-bezier(0.4,0,0.2,1), opacity 0.3s ease, margin 0.4s ease",
                background: "rgba(255,255,255,0.05)",
                boxShadow: "0 6px 20px rgba(0,0,0,0.55)",
              }}
            >
              {fadingArt && (
                <img src={fadingArt} alt="" className="absolute inset-0 w-full h-full object-cover rounded-xl" style={{ transition: "opacity 0.5s ease-out", opacity: 0 }} />
              )}
              {visibleArt ? (
                <img src={visibleArt} alt="" className="absolute inset-0 w-full h-full object-cover rounded-xl" style={{ transition: "opacity 0.5s ease-out", opacity: artOpacity }} />
              ) : (
                <Tv size={26} className="text-white/20" />
              )}
              {isPlaying && !isVideo && (
                <div className="absolute bottom-1.5 right-1.5 flex items-end gap-[2px] h-3 px-1 py-0.5 rounded" style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="w-[2px] rounded-full" style={{ background: "var(--layout-accent-color)", animation: `eq-bar 0.${4 + i}s ease-in-out infinite alternate`, height: `${5 + Math.random() * 7}px` }} />
                  ))}
                </div>
              )}
            </div>

            {/* Info column */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {isPlaying && <Circle size={6} fill="var(--layout-accent-color)" color="var(--layout-accent-color)" className="animate-pulse flex-shrink-0" />}
                <p className="text-white text-[12px] font-bold truncate">{activeChannel?.name}</p>
                {isVideo && <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-[1px] rounded ml-auto flex-shrink-0" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}>Vídeo</span>}
              </div>
              {currentMusic ? (
                <>
                  <p className="text-white/85 text-[11px] font-semibold truncate leading-tight"><TypewriterText text={currentMusic.titulo || ""} /></p>
                  <p className="text-white/50 text-[10px] truncate leading-tight"><TypewriterText text={currentMusic.artista || ""} /></p>
                </>
              ) : (
                <div className="flex items-center gap-1.5">
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded" style={{ background: "color-mix(in srgb, var(--layout-accent-color) 26%, transparent)", color: "var(--layout-accent-color)" }}>CH {activeChannel?.numero_canal}</span>
                  <span className="text-white/40 text-[10px]">{isPlaying ? "Ao vivo" : "Pausado"}</span>
                </div>
              )}
            </div>

            {/* Channel nav arrows — stacked vertically to save horizontal space */}
            {channels.length > 1 && (
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button onClick={goPrev} className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110" style={{ background: "rgba(255,255,255,0.08)" }} title="Canal anterior">
                  <ChevronLeft size={13} className="text-white/70" />
                </button>
                <button onClick={goNext} className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:scale-110" style={{ background: "rgba(255,255,255,0.08)" }} title="Próximo canal">
                  <ChevronRight size={13} className="text-white/70" />
                </button>
              </div>
            )}
          </div>

          {/* Bottom row: play + mute + volume slider (full width) */}
          <div className="flex items-center gap-2.5">
            <button onClick={togglePlay} className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 flex-shrink-0 shadow-lg" style={{ background: "var(--layout-accent-color, #d30707)" }} title={isPlaying ? "Pausar" : "Reproduzir"}>
              {isPlaying ? <Pause size={15} className="text-white" fill="white" /> : <Play size={15} className="text-white ml-0.5" fill="white" />}
            </button>
            <button onClick={toggleMute} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all hover:scale-110" style={{ background: "rgba(255,255,255,0.08)" }} title={isMuted ? "Ativar som" : "Mudo"}>
              {isMuted || volume === 0 ? <VolumeX size={12} className="text-white/60" /> : <Volume2 size={12} className="text-white/60" />}
            </button>
            <input type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} onChange={e => handleVolume(Number(e.target.value))} onMouseDown={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onDragStart={e => { e.stopPropagation(); e.preventDefault(); }} draggable={false} className="flex-1 h-1 appearance-none rounded-full cursor-pointer" style={{ background: `linear-gradient(to right, var(--layout-accent-color) ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.15) ${(isMuted ? 0 : volume) * 100}%)`, accentColor: "var(--layout-accent-color)" }} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes eq-bar { 0% { height: 3px; } 100% { height: 14px; } }
        @keyframes widget-video-grow { 0% { max-height: 0; opacity: 0; } 100% { max-height: 220px; opacity: 1; } }
      `}</style>
    </div>
  );
}
