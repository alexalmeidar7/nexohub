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
  linkPage?: Page;
  linkExternal?: string;
  linkLabel?: string;
  linkIcon?: string;
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
    numericKeys.forEach((key) => { delete payload[key]; });
    if (!Array.isArray(payload.items)) { payload.items = []; }
    return payload as DashboardSettingsPayload;
  }
  return { items: [] };
}

const linkOptions: { label: string; page?: Page; external?: string; icon: string; defaultHidden?: boolean }[] = [
  { label: "Apresentadores", page: "apresentadores", icon: "Mic2", defaultHidden: false },
  { label: "Programas", page: "programas", icon: "PlaySquare", defaultHidden: false },
  { label: "Notícias", page: "noticias", icon: "Newspaper", defaultHidden: false },
  { label: "Música no Ar", page: "musica", icon: "Music", defaultHidden: false },
  { label: "Agenda", page: "agenda", icon: "CalendarDays", defaultHidden: false },
  { label: "Player Config", page: "playerconfig", icon: "Settings", defaultHidden: true },
  { label: "Player Externo", external: "player", icon: "MonitorPlay", defaultHidden: true },
  { label: "Testemunhais", page: "testemunhais", icon: "MessageSquareQuote", defaultHidden: false },
  { label: "Promoções", page: "promocoes", icon: "Tag", defaultHidden: false },
  { label: "Logos", page: "logos", icon: "Image", defaultHidden: false },
  { label: "Roll", page: "preroll", icon: "Film", defaultHidden: true },
  { label: "Shopping", page: "shopping", icon: "ShoppingCart", defaultHidden: false },
  { label: "vMix", page: "vmix", icon: "Monitor", defaultHidden: true },
  { label: "Corte de Vídeo", page: "cortevideo", icon: "Scissors", defaultHidden: true },
  { label: "Tela Promo", external: "telapromo", icon: "Tag", defaultHidden: true },
  { label: "Configurações", page: "configuracoes", icon: "Settings", defaultHidden: true },
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

function getIcon(name: string) { return iconMap[name] || Link2; }

interface Props { onNavigate: (page: Page) => void; }

export default function CustomizableDashboard({ onNavigate }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<DashboardItem[]>([]);
  const [hiddenLinks, setHiddenLinks] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("nexohub_hidden_dashboard_links");
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [addStep, setAddStep] = useState<"choose" | "link" | "widget">("choose");
  const [editMode, setEditMode] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase.from("sub_users").select("parent_user_id, ativo").eq("auth_user_id", user.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setEffectiveUserId(data?.ativo ? data.parent_user_id : user.id); });
    return () => { cancelled = true; };
  }, [user]);

  const dataUserId = effectiveUserId || user?.id;

  interface OnAirProgram {
    nome: string; selo: string; horario_inicio: string; horario_fim: string;
    classificacao_etaria: string; descricao: string; apresentador_nome: string;
    tipo_programa: string; is_hd: boolean; is_stereo: boolean;
  }
  const [onAirProgram, setOnAirProgram] = useState<OnAirProgram | null>(null);
  const [currentMusic, setCurrentMusic] = useState<{ titulo: string; artista: string } | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const DIAS_MAP: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
    const fetchOnAir = async () => {
      const { data } = await supabase
        .from("programas").select("nome, selo, thumb, horario_inicio, horario_fim, classificacao_etaria, descricao, dias_semana, ativo, apresentador_id, tipo_programa, estudio, apresentadores(nome)")
        .eq("user_id", dataUserId!).eq("ativo", true).ilike("estudio", "%fm%");
      if (cancelled || !data) return;
      const now = new Date();
      const diaAtual = DIAS_MAP[now.getDay()];
      const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const current = data.find(p => (p.dias_semana || []).includes(diaAtual) && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim);
      if (!current) { setOnAirProgram(null); return; }
      let isHd = false, isStereo = false;
      if (current.estudio) {
        const { data: channels } = await supabase.from("streaming_channels").select("is_hd, is_stereo").eq("user_id", dataUserId!).eq("active", true).ilike("estudio", current.estudio).limit(1);
        if (channels && channels.length > 0) { isHd = !!channels[0].is_hd; isStereo = !!channels[0].is_stereo; }
      }
      setOnAirProgram({
        nome: current.nome, selo: current.selo || "", horario_inicio: current.horario_inicio, horario_fim: current.horario_fim,
        classificacao_etaria: current.classificacao_etaria || "L", descricao: current.descricao || "", apresentador_nome: (current.apresentadores as any)?.nome || "",
        tipo_programa: current.tipo_programa || "", is_hd: isHd, is_stereo: isStereo,
      });
    };
    fetchOnAir();
    const interval = setInterval(fetchOnAir, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [user, dataUserId]);

  useEffect(() => {
    const pollMusic = () => {
      try {
        const parsed = readMusicData(dataUserId);
        if (parsed && parsed.titulo) { setCurrentMusic({ titulo: parsed.titulo, artista: parsed.artista || "" }); return; }
      } catch {}
      setCurrentMusic(null);
    };
    pollMusic();
    const interval = setInterval(pollMusic, 2000);
    return () => clearInterval(interval);
  }, [dataUserId]);

  useEffect(() => {
    if (!user) return;
    const loadItems = async () => {
      const { data } = await supabase.from("user_settings").select("dashboard_items").eq("user_id", dataUserId!).maybeSingle();
      const normalized = normalizeDashboardSettings(data?.dashboard_items);
      if (Array.isArray(normalized.items) && normalized.items.length > 0) { setItems(normalized.items); return; }
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (!Array.isArray(parsed) || parsed.length === 0) return;
        setItems(parsed as DashboardItem[]);
        await mergeUserDashboardItems(user.id, { items: parsed as unknown[] });
      } catch {}
    };
    loadItems();
  }, [user, dataUserId]);

  const saveItems = useCallback(async (newItems: DashboardItem[]) => {
    setItems(newItems);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
    if (!user) return;
    try { await mergeUserDashboardItems(user.id, { items: newItems as unknown[] }); } catch {}
  }, [user]);

  const removeItem = (id: string) => { saveItems(items.filter(i => i.id !== id)); };

  const addLink = (opt: typeof linkOptions[number]) => {
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

  const addWidget = (opt: typeof widgetOptions[number]) => {
    const newItem: DashboardItem = {
      id: `widget-${Date.now()}`,
      type: "widget",
      widgetType: opt.type,
    };
    saveItems([...items, newItem]);
    setShowAddDialog(false);
    setAddStep("choose");
  };

  const handleDragStart = (id: string) => setDraggedId(id);
  const handleDragOver = (e: React.DragEvent, targetId: string) => { e.preventDefault(); setDragOverId(targetId); };
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

  const hideLink = (id: string) => {
    const newHidden = [...hiddenLinks, id];
    setHiddenLinks(newHidden);
    localStorage.setItem("nexohub_hidden_dashboard_links", JSON.stringify(newHidden));
  };

  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={scrollRef} className="flex flex-col h-full overflow-hidden relative pt-1 bg-black/40 backdrop-blur-3xl rounded-[40px] border border-white/5 w-[40%]">
      {/* On Air Section - Primary Focus */}
      <div className="mb-6 px-6 pt-4 flex-shrink-0">
        {onAirProgram ? (
          <div className="animate-fade-in bg-gradient-to-br from-white/10 to-transparent rounded-[32px] p-6 relative overflow-hidden border border-white/10 shadow-2xl h-[220px]">
            <div className="absolute top-0 right-0 w-[40%] h-full pointer-events-none opacity-60 mix-blend-screen py-4 pr-4">
              {onAirProgram.selo && (
                <img 
                  src={onAirProgram.selo} 
                  alt={onAirProgram.nome} 
                  className="w-full h-full object-contain object-right" 
                />
              )}
            </div>
            
            <div className="relative z-10 flex flex-col h-full max-w-[60%]">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 backdrop-blur-md">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.6)]" />
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-red-500">Ao Vivo</span>
                </div>
                {onAirProgram.is_hd && <span className="px-2 py-0.5 rounded-lg bg-white/5 text-[8px] font-black tracking-widest text-white/50 border border-white/10 uppercase backdrop-blur-sm">Full HD</span>}
              </div>

              <h2 className="text-3xl font-black text-white tracking-tighter leading-tight mb-3 drop-shadow-lg line-clamp-2">{onAirProgram.nome}</h2>
              
              <div className="flex flex-wrap items-center gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-white/40" />
                  <span className="text-xs font-semibold text-white/80">{onAirProgram.horario_inicio} — {onAirProgram.horario_fim}</span>
                </div>
                {onAirProgram.apresentador_nome && (
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-white/40" />
                    <span className="text-xs font-bold text-white">{onAirProgram.apresentador_nome}</span>
                  </div>
                )}
              </div>

              {currentMusic && (
                <div className="inline-flex items-center gap-3 px-4 py-3 rounded-2xl bg-black/40 border border-white/10 backdrop-blur-2xl shadow-xl mt-auto">
                  <div className="w-8 h-8 rounded-full bg-accent/20 flex items-center justify-center border border-accent/20">
                    <Music size={14} className="text-accent animate-spin-slow" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black text-white leading-tight truncate">{currentMusic.titulo}</p>
                    <p className="text-[9px] font-bold text-white/40 truncate">{currentMusic.artista}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-10 rounded-[32px] bg-white/5 border border-dashed border-white/10 flex flex-col items-center justify-center text-center backdrop-blur-sm">
            <Radio size={24} className="text-white/20 mb-2" />
            <p className="text-white/40 text-[10px] font-bold tracking-widest uppercase">Programação Offline</p>
          </div>
        )}
      </div>

      {/* Horizontal Menu Section - Shortcuts/Navigation */}
      <div className="mb-6 px-6 flex-shrink-0">
        <div className="flex flex-wrap items-center gap-3 pb-2 overflow-x-auto no-scrollbar scroll-smooth">
          {[
            { id: "apresentadores", label: "Apresentadores", icon: Users },
            { id: "testemunhais", label: "Testemunhais", icon: MessageSquareQuote },
            { id: "promocoes", label: "Promoções", icon: Tag },
            { id: "shopping", label: "Shopping", icon: ShoppingBag },
            { id: "logos", label: "Logos", icon: Image }
          ].filter(nav => !hiddenLinks.includes(nav.id)).map((nav) => (
            <div key={nav.id} className="relative group/nav-item">
              <button 
                className="flex flex-col items-center justify-center gap-2 min-w-[80px] h-[80px] rounded-[24px] transition-all duration-300 hover:translate-y-[-2px] active:scale-95 group border border-white/5 bg-white/5 hover:bg-white/10" 
                onClick={() => onNavigate(nav.id as any)}
              >
                <div className="w-8 h-8 rounded-xl bg-accent/10 flex items-center justify-center group-hover:bg-accent/20 transition-all">
                  <nav.icon size={16} className="text-accent" />
                </div>
                <span className="text-[8px] font-black uppercase tracking-wider text-white/40 group-hover:text-white transition-all">
                  {nav.label}
                </span>
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); hideLink(nav.id); }}
                className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-500 opacity-0 group-hover/nav-item:opacity-100 transition-opacity hover:bg-red-500 hover:text-white"
              >
                <X size={10} />
              </button>
            </div>
          ))}
          
          <button 
            onClick={() => { setShowAddDialog(true); setAddStep("choose"); }} 
            className="flex flex-col items-center justify-center gap-2 min-w-[80px] h-[80px] rounded-[24px] transition-all border-2 border-dashed border-white/10 hover:border-accent/40 hover:bg-accent/5 cursor-pointer bg-transparent group"
          >
            <Plus size={18} className="text-white/20 group-hover:text-accent transition-colors" />
            <span className="text-[8px] font-black uppercase tracking-widest text-white/20 group-hover:text-accent">Adicionar</span>
          </button>
        </div>
      </div>

      {/* Widgets & Secondary Content Area */}
      <div className="flex-1 overflow-hidden px-6 pb-4">
        <div className="flex flex-col h-full gap-4">
          {items.filter(i => i.type === "widget").length > 0 && (
            <div className="flex flex-col h-full">
              <div className="flex items-center gap-3 mb-3 flex-shrink-0">
                <div className="h-px w-8 bg-gradient-to-r from-transparent to-white/10" />
                <p className="text-[9px] font-black uppercase tracking-[0.3em] text-white/30 whitespace-nowrap">Módulos Inteligentes</p>
                <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
              </div>
              
              <div className="grid grid-cols-1 gap-4 flex-1 min-h-0">
                {items.filter(i => i.type === "widget").map(item => (
                  <div 
                    key={item.id} 
                    className={`relative group rounded-[28px] animate-fade-in flex flex-col transition-all duration-300 ${draggedId === item.id ? "opacity-40" : "hover:bg-white/[0.02]"}`} 
                    style={{ background: "rgba(26, 26, 26, 0.4)", backdropFilter: "blur(20px)", boxShadow: "0 4px 20px rgba(0,0,0,0.1), inset 0 1px 0 rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.05)", minHeight: 0 }} 
                    onDragOver={(e) => handleDragOver(e, item.id)} 
                    onDrop={() => handleDrop(item.id)} 
                    onDragEnd={handleDragEnd}
                  >
                    <div className="flex items-center gap-2 px-5 py-3 cursor-grab active:cursor-grabbing flex-shrink-0" style={{ borderBottom: `1px solid rgba(255,255,255,0.05)` }} draggable onDragStart={(e) => { e.stopPropagation(); handleDragStart(item.id); }}>
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-accent/10">
                        {item.widgetType === "agenda" && <CalendarDays size={14} className="text-accent" />}
                        {item.widgetType === "musica" && <Music size={14} className="text-accent" />}
                        {item.widgetType === "weather" && <CloudSun size={14} className="text-accent" />}
                        {item.widgetType === "stats" && <BarChart3 size={14} className="text-accent" />}
                        {item.widgetType === "player" && <MonitorPlay size={14} className="text-accent" />}
                      </div>
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50 group-hover:text-white transition-colors">
                        {item.widgetType === "agenda" ? "Agenda" : item.widgetType === "musica" ? "No Ar" : item.widgetType === "weather" ? "Tempo" : item.widgetType === "stats" ? "Métricas" : "Player"}
                      </span>
                      <GripVertical size={12} className="ml-auto text-white/10 group-hover:text-white/30 transition-colors" />
                    </div>
                    
                    <div className="absolute top-3 right-8 z-10 opacity-0 group-hover:opacity-100 transition-all">
                      <button 
                        onClick={() => removeItem(item.id)} 
                        className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-500/10 border border-red-500/20 hover:bg-red-500 group/btn"
                      >
                        <Trash2 size={10} className="text-red-500 group-hover/btn:text-white" />
                      </button>
                    </div>
                    
                    <div className="p-4 flex-1 overflow-y-auto widget-scroll min-h-0">
                      <Suspense fallback={<div className="flex items-center justify-center h-full"><Loader2 className="animate-spin text-accent" size={20} /></div>}>
                        {item.widgetType === "agenda" && <DashboardAgendaWidget dataUserId={dataUserId || undefined} onNavigate={onNavigate} />}
                        {item.widgetType === "musica" && <MusicProgramWidget dataUserId={dataUserId || undefined} />}
                        {item.widgetType === "weather" && <DashboardWeatherWidget />}
                        {item.widgetType === "player" && <OnAirWidget />}
                      </Suspense>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={() => { setShowAddDialog(false); setAddStep("choose"); }}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative rounded-2xl p-6 max-w-md w-full mx-4 max-h-[80vh] overflow-y-auto" style={{ background: "rgba(18, 18, 20, 0.97)", boxShadow: "0 24px 80px rgba(0,0,0,0.6)" }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base" style={{ color: "var(--layout-nav-text, #fff)" }}>{addStep === "choose" ? "O que deseja adicionar?" : addStep === "link" ? "Escolha um atalho" : "Escolha um widget"}</h3>
              <button onClick={() => { setShowAddDialog(false); setAddStep("choose"); }} className="w-7 h-7 rounded-lg flex items-center justify-center transition-all hover:scale-110" style={{ background: "rgba(255,255,255,0.08)" }}><X size={14} style={{ color: "var(--layout-nav-text, #fff)", opacity: 0.6 }} /></button>
            </div>
            {addStep === "choose" && (
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setAddStep("link")} className="flex flex-col items-center gap-3 p-5 rounded-2xl transition-all hover:scale-[1.03]" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)" }}><Link2 size={20} style={{ color: "var(--layout-button-text, #fff)" }} /></div>
                  <p className="font-semibold text-sm" style={{ color: "var(--layout-nav-text, #fff)" }}>Botão com Link</p>
                </button>
                <button onClick={() => setAddStep("widget")} className="flex flex-col items-center gap-3 p-5 rounded-2xl transition-all hover:scale-[1.03]" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)" }}><BarChart3 size={20} style={{ color: "var(--layout-button-text, #fff)" }} /></div>
                  <p className="font-semibold text-sm" style={{ color: "var(--layout-nav-text, #fff)" }}>Widget</p>
                </button>
              </div>
            )}
            {addStep === "link" && (
              <div className="grid grid-cols-2 gap-2">
                {linkOptions.map(opt => (
                  <button key={opt.label} onClick={() => { addLink(opt); setHiddenLinks(prev => prev.filter(id => id !== opt.page)); localStorage.setItem("nexohub_hidden_dashboard_links", JSON.stringify(hiddenLinks.filter(id => id !== opt.page))); }} className="flex items-center gap-3 p-3 rounded-xl transition-all hover:bg-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5">{getIcon(opt.icon) && <opt.icon size={14} style={{ color: "var(--layout-accent-color)" }} />}</div>
                    <span className="text-xs font-medium" style={{ color: "var(--layout-nav-text, #fff)" }}>{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
            {addStep === "widget" && (
              <div className="space-y-2">
                {widgetOptions.map(opt => (
                  <button key={opt.type} onClick={() => addWidget(opt)} className="w-full flex items-center gap-3 p-4 rounded-xl text-left transition-all hover:bg-white/10" style={{ background: "rgba(255,255,255,0.05)" }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-white/5"><BarChart3 size={18} style={{ color: "var(--layout-accent-color)" }} /></div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: "var(--layout-nav-text, #fff)" }}>{opt.label}</p>
                      <p className="text-[10px] opacity-40" style={{ color: "var(--layout-nav-text, #fff)" }}>{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function MusicProgramWidget({ dataUserId }: { dataUserId?: string }) {
  const [currentMusic, setCurrentMusic] = useState<{ titulo: string; artista: string; } | null>(null);

  useEffect(() => {
    const poll = () => {
      try {
        const d = readMusicData(dataUserId) as any;
        if (d && d.titulo) setCurrentMusic({ titulo: d.titulo, artista: d.artista || "" });
      } catch {}
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [dataUserId]);

  return (
    <div className="space-y-4">
      {currentMusic && (
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0"><Music size={20} className="text-white/40" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate">{currentMusic.titulo}</p>
            <p className="text-[10px] text-white/50 truncate">{currentMusic.artista}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function DashboardAgendaWidget({ dataUserId, onNavigate }: { dataUserId?: string; onNavigate: (page: Page) => void }) {
  const [events, setEvents] = useState<any[]>([]);
  useEffect(() => {
    if (!dataUserId) return;
    const today = new Date().toISOString().split("T")[0];
    supabase.from("agenda_eventos").select("*").eq("user_id", dataUserId).gte("data", today).order("data").limit(4)
      .then(({ data }) => { if (data) setEvents(data); });
  }, [dataUserId]);

  return (
    <div className="space-y-2">
      {events.length === 0 ? <p className="text-[10px] text-white/30 italic">Sem eventos agendados</p> : events.map(ev => (
        <div key={ev.id} className="p-2.5 rounded-xl bg-white/5 flex items-center gap-3">
          <div className="flex flex-col items-center justify-center w-9 h-9 rounded-lg bg-white/10 shrink-0">
            <span className="text-xs font-bold text-white">{ev.data.split("-")[2]}</span>
          </div>
          <p className="text-[11px] text-white/80 font-medium truncate">{ev.descricao}</p>
        </div>
      ))}
    </div>
  );
}

function DashboardWeatherWidget() {
  const [weather, setWeather] = useState<any>(null);
  useEffect(() => {
    const city = localStorage.getItem("masterview_last_city") || "São Paulo";
    fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt`)
      .then(r => r.json()).then(geo => {
        if (geo.results?.length) {
          const { latitude: lat, longitude: lon, name: cityName } = geo.results[0];
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=auto`)
            .then(r => r.json()).then(wx => setWeather({ city: cityName, temp: Math.round(wx.current.temperature_2m) }));
        }
      });
  }, []);

  return weather ? (
    <div className="flex items-center gap-3">
      <CloudSun size={24} className="text-white/60" />
      <div>
        <p className="text-lg font-bold text-white leading-none">{weather.temp}°C</p>
        <p className="text-[10px] text-white/40 mt-1 uppercase tracking-wider">{weather.city}</p>
      </div>
    </div>
  ) : <p className="text-[10px] text-white/30 italic">Carregando clima...</p>;
}
