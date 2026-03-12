import { useState, useEffect, useCallback, useRef, lazy, Suspense } from "react";
import { Plus, X, Link2, BarChart3, CalendarDays, Music, Eye, Users, Mic2, PlaySquare, Newspaper, Settings, ShoppingBag, Tag, Image, Film, ShoppingCart, Monitor, Wrench, Scissors, MonitorPlay, ExternalLink, GripVertical, Loader2, Trash2, MessageSquareQuote, Radio, Clock, Tv, FileText, CloudSun, ChevronDown, Play, Pause, Volume2, VolumeX, Circle, User } from "lucide-react";
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
  widgetType?: "agenda" | "musica" | "stats" | "weather";
}

const STORAGE_KEY = "nexohub_dashboard_items";

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

const widgetOptions: { label: string; type: "agenda" | "musica" | "stats" | "weather"; description: string }[] = [
  { label: "Agenda de Eventos", type: "agenda", description: "Exibe os próximos eventos do calendário" },
  { label: "Música no Ar + Programa", type: "musica", description: "Mostra a música e programa em exibição" },
  { label: "Dados Estatísticos", type: "stats", description: "Visualizações do pre-roll e audiência do player" },
  { label: "Previsão do Tempo", type: "weather", description: "Temperatura e previsão para os próximos dias" },
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

  // Poll music from localStorage
  useEffect(() => {
    const pollMusic = () => {
      try {
        const raw = localStorage.getItem("musicaNoAr");
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
    const interval = setInterval(pollMusic, 3000);
    return () => clearInterval(interval);
  }, []);

  // Load dashboard items from DB (fallback to localStorage for migration)
  useEffect(() => {
    if (!user) return;
    const loadItems = async () => {
      // Try DB first
      const { data } = await supabase
        .from("user_settings")
        .select("dashboard_items")
        .eq("user_id", user.id)
        .maybeSingle();

      if (data?.dashboard_items && (data.dashboard_items as any[]).length > 0) {
        setItems(data.dashboard_items as unknown as DashboardItem[]);
      } else {
        // Migrate from localStorage if exists
        try {
          const saved = localStorage.getItem(STORAGE_KEY);
          if (saved) {
            const parsed = JSON.parse(saved);
            setItems(parsed);
            // Save to DB immediately
            await supabase
              .from("user_settings")
              .upsert({ user_id: user.id, dashboard_items: parsed }, { onConflict: "user_id" });
          }
        } catch {}
      }
    };
    loadItems();
  }, [user]);

  const saveItems = useCallback((newItems: DashboardItem[]) => {
    setItems(newItems);
    // Save to DB
    if (user) {
      supabase
        .from("user_settings")
        .upsert({ user_id: user.id, dashboard_items: newItems as any }, { onConflict: "user_id" })
        .then();
    }
    // Keep localStorage as fallback
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
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
          <p className="text-white/70 text-[10px] font-bold uppercase tracking-[0.15em] mb-3 animate-fade-in">Atalhos rápidos</p>
          <div className="flex flex-wrap gap-3">
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
                    className="w-[90px] h-[90px] rounded-2xl flex flex-col items-center pt-[18px] transition-all hover:scale-[1.06] hover:shadow-lg"
                    style={{
                      background: isDragOver
                        ? "linear-gradient(145deg, #be0101, #960101)"
                        : "linear-gradient(135deg, #960101, #be0101)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      border: isDragOver ? "2px solid #be0101" : "1px solid rgba(255,255,255,0.25)",
                      boxShadow: "0 4px 15px rgba(150,1,1,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.boxShadow = "0 8px 25px rgba(150,1,1,0.5), inset 0 1px 0 rgba(255,255,255,0.2)";
                      e.currentTarget.style.background = "linear-gradient(135deg, #be0101, #d40101)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = isDragOver
                        ? "linear-gradient(145deg, #be0101, #960101)"
                        : "linear-gradient(135deg, #960101, #be0101)";
                      e.currentTarget.style.boxShadow = "0 4px 15px rgba(150,1,1,0.35), inset 0 1px 0 rgba(255,255,255,0.15)";
                    }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(255,255,255,0.2)" }}>
                      <Icon size={18} className="text-white" />
                    </div>
                    <span className="text-white text-[9px] font-semibold text-center leading-tight px-1.5 max-w-full truncate mt-1.5">{item.linkLabel}</span>
                    {item.linkExternal && <ExternalLink size={7} className="text-white/40 absolute bottom-1.5 right-1.5" />}
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
              className="w-[90px] h-[90px] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.06]"
              style={{
                background: "rgba(255,255,255,0.08)",
                border: "1.5px dashed rgba(255,255,255,0.25)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
            >
              <Plus size={16} className="text-white/40 mb-1" />
              <span className="text-white/40 text-[9px] font-semibold">Adicionar</span>
            </div>
          </div>
        </div>
      )}

      {/* On-Air Program Info */}
      {onAirProgram && (
        <div className="mb-4 animate-fade-in">
          <div className="flex flex-col items-start">
            {/* Selo / Logo do programa */}
            {onAirProgram.selo && (
              <img
                src={onAirProgram.selo}
                alt={onAirProgram.nome}
                className="w-44 h-44 rounded-xl object-contain mb-3"
              />
            )}

            {/* Ao vivo + horário + classificação */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-1.5">
                <Circle size={8} fill="#ff0000" color="#ff0000" className="animate-pulse" />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "#ff0000" }}>Ao Vivo</span>
              </div>
              <span className="text-white/50 text-[10px]">
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
              <p className="text-white text-[11px] leading-relaxed line-clamp-3 mb-2" style={{ maxWidth: 400 }}>{onAirProgram.descricao}</p>
            )}

            {/* Apresentador */}
            {onAirProgram.apresentador_nome && (
              <div className="flex items-center gap-1.5 mb-1.5">
                <User size={12} style={{ color: "#be0101" }} />
                <span className="text-white text-[11px] font-semibold">{onAirProgram.apresentador_nome}</span>
              </div>
            )}

            {/* Música tocando */}
            {currentMusic && (
              <div className="flex items-center gap-1.5">
                <Music size={12} style={{ color: "#be0101" }} />
                <span className="text-white text-[11px]">
                  {currentMusic.titulo}{currentMusic.artista ? ` — ${currentMusic.artista}` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
      )}


      {items.filter(i => i.type === "widget").length > 0 && (
        <div className="mb-4">
          <p className="text-white/70 text-[10px] font-bold uppercase tracking-[0.15em] mb-3 animate-fade-in">Widgets</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {items.filter(i => i.type === "widget").map(item => {
              const isDragging = draggedId === item.id;
              const isDragOver = dragOverId === item.id && draggedId !== item.id;
              return (
                <div
                  key={item.id}
                  className={`relative group rounded-2xl overflow-hidden animate-fade-in flex flex-col ${isDragging ? "opacity-40 scale-95" : ""}`}
                  style={{
                    background: "#ffffff",
                    border: isDragOver ? "2px solid #be0101" : "1px solid rgba(0,0,0,0.08)",
                    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    minHeight: item.widgetType === "agenda" ? "200px" : "150px",
                    maxHeight: item.widgetType === "agenda" ? "240px" : "180px",
                  }}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex items-center gap-1.5 px-4 py-2.5 cursor-grab active:cursor-grabbing flex-shrink-0" style={{ borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <GripVertical size={10} className="text-black/20" />
                    <span className="text-black/40 text-[9px] font-bold uppercase tracking-[0.15em]">
                      {item.widgetType === "agenda" ? "Agenda" : item.widgetType === "musica" ? "No Ar" : item.widgetType === "weather" ? "Tempo" : "Estatísticas"}
                    </span>
                  </div>
                  <div className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{ border: "1px solid rgba(0,0,0,0.15)" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.4)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(0,0,0,0.15)"; }}
                    >
                      <X size={9} className="text-black/40" />
                    </button>
                  </div>
                  <div className="p-4 flex-1 overflow-y-auto overflow-x-hidden widget-scroll">
                    <Suspense fallback={<Loader2 className="animate-spin text-[#be0101]/40" size={18} />}>
                      {item.widgetType === "agenda" && <DashboardAgendaWidget onNavigate={onNavigate} />}
                      {item.widgetType === "musica" && <MusicProgramWidget />}
                      {item.widgetType === "stats" && <StatsWidget />}
                      {item.widgetType === "weather" && <DashboardWeatherWidget />}
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
            className="w-[90px] h-[90px] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.06]"
            style={{
              background: "rgba(255,255,255,0.08)",
              border: "1.5px dashed rgba(255,255,255,0.25)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.15)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.08)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; }}
          >
            <Plus size={16} className="text-white/40 mb-1" />
            <span className="text-white/40 text-[9px] font-semibold">Adicionar</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-20 animate-fade-in">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5" style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 4px 20px rgba(0,0,0,0.1)" }}>
            <Plus size={28} className="text-white/60" />
          </div>
          <p className="text-white/60 text-sm font-bold mb-1">Área de trabalho vazia</p>
          <p className="text-white/30 text-xs mb-5 max-w-xs">Adicione atalhos e widgets para personalizar seu painel</p>
          <button
            onClick={() => { setShowAddDialog(true); setAddStep("choose"); }}
            className="px-6 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.03]"
            style={{ background: "linear-gradient(135deg, #960101, #be0101)", color: "#fff", boxShadow: "0 4px 16px rgba(150,1,1,0.25)" }}
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
              background: "rgba(0, 0, 0, 0.95)",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(255,255,255,0.15)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold text-base">
                {addStep === "choose" ? "O que deseja adicionar?" : addStep === "link" ? "Escolha um atalho" : "Escolha um widget"}
              </h3>
              <button onClick={() => { setShowAddDialog(false); setAddStep("choose"); }} className="text-white/40 hover:text-white">
                <X size={18} />
              </button>
            </div>

            {addStep === "choose" && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setAddStep("link")}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(190,1,1,0.15)"; e.currentTarget.style.borderColor = "rgba(190,1,1,0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #960101, #be0101)" }}>
                    <Link2 size={20} className="text-white" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-sm">Botão com Link</p>
                    <p className="text-white/40 text-[10px] mt-0.5">Atalho para um módulo</p>
                  </div>
                </button>
                <button
                  onClick={() => setAddStep("widget")}
                  className="flex flex-col items-center gap-3 p-5 rounded-xl transition-all"
                  style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(190,1,1,0.15)"; e.currentTarget.style.borderColor = "rgba(190,1,1,0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #960101, #be0101)" }}>
                    <BarChart3 size={20} className="text-white" />
                  </div>
                  <div className="text-center">
                    <p className="text-white font-semibold text-sm">Widget</p>
                    <p className="text-white/40 text-[10px] mt-0.5">Dados em tempo real</p>
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
                      className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all text-left"
                      style={{
                        background: exists ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        opacity: exists ? 0.4 : 1,
                        color: "#fff",
                      }}
                      onMouseEnter={e => { if (!exists) { e.currentTarget.style.background = "rgba(190,1,1,0.15)"; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = exists ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)"; }}
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
                      className="w-full flex items-start gap-3 px-4 py-4 rounded-xl text-sm transition-all text-left"
                      style={{
                        background: exists ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        opacity: exists ? 0.4 : 1,
                        color: "#fff",
                      }}
                      onMouseEnter={e => { if (!exists) { e.currentTarget.style.background = "rgba(190,1,1,0.15)"; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = exists ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)"; }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, #960101, #be0101)" }}>
                        {opt.type === "agenda" && <CalendarDays size={14} className="text-white" />}
                        {opt.type === "musica" && <Music size={14} className="text-white" />}
                        {opt.type === "stats" && <BarChart3 size={14} className="text-white" />}
                        {opt.type === "weather" && <CloudSun size={14} className="text-white" />}
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
                className="mt-3 text-xs text-white/40 hover:text-white/70 transition-colors"
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
        <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(190,1,1,0.1)" }}>
          <Music size={16} className="text-[#be0101]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-black text-[11px] font-bold truncate leading-tight">{music.titulo}</p>
        <p className="text-black/50 text-[10px] truncate">{music.artista}</p>
        {programa && (
          <p className="text-[9px] mt-0.5 truncate" style={{ color: "#be0101" }}>🔴 {programa}</p>
        )}
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(190,1,1,0.06)" }}>
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
        <CalendarDays size={14} className="text-[#be0101]" />
        <p className="text-black font-bold text-sm">Agenda de Eventos</p>
      </div>
      {events.length === 0 ? (
        <p className="text-black/30 text-xs">Nenhum evento próximo</p>
      ) : (
        <div className="space-y-2">
          {events.map(ev => (
            <div key={ev.id} className="px-3 py-2 rounded-lg" style={{ background: "rgba(190,1,1,0.06)" }}>
              <p className="text-black text-xs font-semibold truncate">{ev.descricao || "Evento"}</p>
              <p className="text-black/40 text-[10px]">
                {new Date(ev.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — {ev.local}
              </p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-auto pt-3">
        <button
          onClick={() => onNavigate("agenda")}
          className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all"
          style={{ backgroundColor: "rgba(190,1,1,0.1)", color: "#be0101" }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(190,1,1,0.2)"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(190,1,1,0.1)"; }}
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
    const iv = setInterval(fetchProgram, 60000);
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
        <Music size={14} className="text-[#be0101]" />
        <p className="text-black font-bold text-sm">No Ar</p>
      </div>

      {/* Current Program */}
      {currentProgram && (
        <div key={`prog-${programKey}`} className="flex items-center gap-3 mb-3 px-3 py-2.5 rounded-xl animate-fade-in" style={{ background: "rgba(190,1,1,0.06)" }}>
          {apresentador?.foto ? (
            <img src={apresentador.foto} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-[#be0101]/30" />
          ) : (
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "rgba(190,1,1,0.15)" }}>
              <Mic2 size={14} className="text-[#be0101]" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Radio size={10} className="text-red-500 animate-pulse flex-shrink-0" />
              <p className="text-black text-xs font-bold truncate">{currentProgram.nome}</p>
            </div>
            {apresentador?.nome && (
              <p className="text-black/50 text-[10px] truncate">{apresentador.nome}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(0,0,0,0.08)" }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${progressPercent}%`, background: "linear-gradient(90deg, #960101, #be0101)" }}
                />
              </div>
              <span className="text-[8px] text-black/40 font-semibold flex-shrink-0">
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
            <p className="text-black text-xs font-semibold truncate">{music.titulo}</p>
            <p className="text-black/50 text-[10px] truncate">{music.artista}</p>
          </div>
        </div>
      ) : !currentProgram ? (
        <p className="text-black/30 text-xs">Sem programa no momento</p>
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
        <BarChart3 size={14} className="text-[#be0101]" />
        <p className="text-black font-bold text-sm">Dados Estatísticos</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="px-3 py-3 rounded-xl text-center" style={{ background: "rgba(190,1,1,0.06)" }}>
          <p className="text-2xl font-bold text-black">{prerollCount}</p>
          <p className="text-black/40 text-[10px] mt-0.5">Pre-rolls Ativos</p>
        </div>
        <div className="px-3 py-3 rounded-xl text-center" style={{ background: "rgba(190,1,1,0.06)" }}>
          <p className="text-2xl font-bold text-black">{channelCount}</p>
          <p className="text-black/40 text-[10px] mt-0.5">Canais Ativos</p>
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
        <CloudSun size={14} className="text-[#be0101]" />
        <p className="text-black font-bold text-sm">Previsão do Tempo</p>
        {weather && <span className="text-black/40 text-[9px] ml-auto">{weather.city}</span>}
      </div>
      {weather ? (
        <div key={`wx-${weatherKey}`} className="flex gap-3 animate-fade-in">
          {/* Hoje */}
          <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: "rgba(190,1,1,0.05)" }}>
            <div className="flex-shrink-0">
              {WeatherIconComp && <WeatherIconComp code={weather.current.weatherCode} size={40} />}
            </div>
            <div className="min-w-0">
              <p className="text-[9px] font-bold uppercase text-black/50">Hoje</p>
              <p className="text-2xl font-bold text-[#be0101] leading-none">{weather.current.temp}°</p>
              <p className="text-black/50 text-[9px] mt-0.5">↑{weather.current.tempMax}° ↓{weather.current.tempMin}°</p>
            </div>
          </div>

          {/* Amanhã */}
          {weather.tomorrow && (
            <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-lg" style={{ background: "rgba(190,1,1,0.05)" }}>
              <div className="flex-shrink-0">
                {WeatherIconComp && <WeatherIconComp code={weather.tomorrow.weatherCode} size={32} forceDay />}
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase text-black/50">Amanhã</p>
                <p className="text-sm font-bold text-black leading-none">{weather.tomorrow.tempMax}° / {weather.tomorrow.tempMin}°</p>
                <p className="text-black/40 text-[9px] mt-0.5">{getLabel(weather.tomorrow.weatherCode)}</p>
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-black/30 text-xs">Configure uma cidade no módulo Previsão do Tempo</p>
      )}
    </div>
  );
}
