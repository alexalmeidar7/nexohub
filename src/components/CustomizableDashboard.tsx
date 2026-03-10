import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { Plus, X, Link2, BarChart3, CalendarDays, Music, Eye, Users, Mic2, PlaySquare, Newspaper, Settings, ShoppingBag, Tag, Image, Film, ShoppingCart, Monitor, Wrench, Scissors, MonitorPlay, ExternalLink, GripVertical, Loader2, Trash2, MessageSquareQuote, Radio, Clock, Tv, FileText, CloudSun } from "lucide-react";
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

const widgetOptions: { label: string; type: "agenda" | "musica" | "stats"; description: string }[] = [
  { label: "Agenda de Eventos", type: "agenda", description: "Exibe os próximos eventos do calendário" },
  { label: "Música no Ar + Programa", type: "musica", description: "Mostra a música e programa em exibição" },
  { label: "Dados Estatísticos", type: "stats", description: "Visualizações do pre-roll e audiência do player" },
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

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
    } catch {}
  }, []);

  const saveItems = useCallback((newItems: DashboardItem[]) => {
    setItems(newItems);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
  }, []);

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

  return (
    <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden" style={{ scrollBehavior: "smooth" }}>

      {/* Section: Atalhos */}
      {items.filter(i => i.type === "link").length > 0 && (
        <div className="mb-6">
          <p className="text-[#0d0446]/50 text-[10px] font-bold uppercase tracking-[0.15em] mb-3 animate-fade-in">Atalhos rápidos</p>
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
                    className="w-[90px] h-[90px] rounded-2xl flex flex-col items-center justify-center transition-all hover:scale-[1.06] hover:shadow-lg"
                    style={{
                      background: isDragOver
                        ? "linear-gradient(145deg, #268ffa, #2dbef3)"
                        : "#ffffff",
                      border: isDragOver ? "2px solid #268ffa" : "1px solid rgba(13,4,70,0.08)",
                      boxShadow: "0 2px 8px rgba(13,4,70,0.06)",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.boxShadow = "0 6px 20px rgba(38,143,250,0.15)";
                      e.currentTarget.style.borderColor = "rgba(38,143,250,0.3)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.background = isDragOver
                        ? "linear-gradient(145deg, #268ffa, #2dbef3)"
                        : "#ffffff";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(13,4,70,0.06)";
                      e.currentTarget.style.borderColor = isDragOver ? "#268ffa" : "rgba(13,4,70,0.08)";
                    }}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-1.5" style={{ background: "rgba(38,143,250,0.1)" }}>
                      <Icon size={18} className="text-[#268ffa]" />
                    </div>
                    <span className="text-[#0d0446] text-[9px] font-semibold text-center leading-tight px-1.5 max-w-full truncate">{item.linkLabel}</span>
                    {item.linkExternal && <ExternalLink size={7} className="text-[#0d0446]/25 mt-0.5" />}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                    className="absolute top-1.5 right-1.5 w-4 h-4 rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all z-10"
                    style={{ border: "1px solid rgba(13,4,70,0.15)" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.4)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.15)"; }}
                  >
                    <X size={7} className="text-[#0d0446]/40" />
                  </button>
                </div>
              );
            })}
            {/* Add button */}
            <div
              onClick={() => { setShowAddDialog(true); setAddStep("choose"); }}
              className="w-[90px] h-[90px] rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all hover:scale-[1.06]"
              style={{
                background: "rgba(38,143,250,0.04)",
                border: "1.5px dashed rgba(38,143,250,0.25)",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(38,143,250,0.08)"; e.currentTarget.style.borderColor = "rgba(38,143,250,0.5)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "rgba(38,143,250,0.04)"; e.currentTarget.style.borderColor = "rgba(38,143,250,0.25)"; }}
            >
              <Plus size={16} className="text-[#268ffa]/40 mb-1" />
              <span className="text-[#268ffa]/40 text-[9px] font-semibold">Adicionar</span>
            </div>
          </div>
        </div>
      )}

      {/* Section: Widgets */}
      {items.filter(i => i.type === "widget").length > 0 && (
        <div className="mb-4">
          <p className="text-[#0d0446]/50 text-[10px] font-bold uppercase tracking-[0.15em] mb-3 animate-fade-in">Widgets</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.filter(i => i.type === "widget").map(item => {
              const isDragging = draggedId === item.id;
              const isDragOver = dragOverId === item.id && draggedId !== item.id;
              return (
                <div
                  key={item.id}
                  className={`relative group rounded-2xl overflow-hidden animate-fade-in ${isDragging ? "opacity-40 scale-95" : ""}`}
                  style={{
                    background: "#ffffff",
                    border: isDragOver ? "2px solid #268ffa" : "1px solid rgba(13,4,70,0.08)",
                    boxShadow: "0 2px 12px rgba(13,4,70,0.06)",
                    minHeight: item.widgetType === "agenda" ? "280px" : "180px",
                  }}
                  draggable
                  onDragStart={() => handleDragStart(item.id)}
                  onDragOver={(e) => handleDragOver(e, item.id)}
                  onDrop={() => handleDrop(item.id)}
                  onDragEnd={handleDragEnd}
                >
                  <div className="flex items-center gap-1.5 px-4 py-2.5 cursor-grab active:cursor-grabbing" style={{ borderBottom: "1px solid rgba(13,4,70,0.06)" }}>
                    <GripVertical size={10} className="text-[#0d0446]/20" />
                    <span className="text-[#0d0446]/40 text-[9px] font-bold uppercase tracking-[0.15em]">
                      {item.widgetType === "agenda" ? "Agenda" : item.widgetType === "musica" ? "No Ar" : "Estatísticas"}
                    </span>
                  </div>
                  <div className="absolute top-2.5 right-2.5 z-10 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{ border: "1px solid rgba(13,4,70,0.15)" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.4)"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.15)"; }}
                    >
                      <X size={9} className="text-[#0d0446]/40" />
                    </button>
                  </div>
                  <div className="p-4 h-full">
                    <Suspense fallback={<Loader2 className="animate-spin text-[#268ffa]/40" size={18} />}>
                      {item.widgetType === "agenda" && <DashboardAgendaWidget />}
                      {item.widgetType === "musica" && <MusicProgramWidget />}
                      {item.widgetType === "stats" && <StatsWidget />}
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
              background: "rgba(38,143,250,0.04)",
              border: "1.5px dashed rgba(38,143,250,0.25)",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(38,143,250,0.08)"; e.currentTarget.style.borderColor = "rgba(38,143,250,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(38,143,250,0.04)"; e.currentTarget.style.borderColor = "rgba(38,143,250,0.25)"; }}
          >
            <Plus size={16} className="text-[#268ffa]/40 mb-1" />
            <span className="text-[#268ffa]/40 text-[9px] font-semibold">Adicionar</span>
          </div>
        </div>
      )}

      {/* Empty state */}
      {items.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center py-20 animate-fade-in">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-5" style={{ background: "#ffffff", border: "1px solid rgba(13,4,70,0.08)", boxShadow: "0 4px 20px rgba(13,4,70,0.08)" }}>
            <Plus size={28} className="text-[#268ffa]/60" />
          </div>
          <p className="text-[#0d0446]/60 text-sm font-bold mb-1">Área de trabalho vazia</p>
          <p className="text-[#0d0446]/30 text-xs mb-5 max-w-xs">Adicione atalhos e widgets para personalizar seu painel</p>
          <button
            onClick={() => { setShowAddDialog(true); setAddStep("choose"); }}
            className="px-6 py-2.5 rounded-xl text-xs font-bold transition-all hover:scale-[1.03]"
            style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#fff", boxShadow: "0 4px 16px rgba(38,143,250,0.25)" }}
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
              background: "rgba(13, 4, 70, 0.95)",
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
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(38,143,250,0.15)"; e.currentTarget.style.borderColor = "rgba(38,143,250,0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
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
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(38,143,250,0.15)"; e.currentTarget.style.borderColor = "rgba(38,143,250,0.4)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)"; }}
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
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
                      onMouseEnter={e => { if (!exists) { e.currentTarget.style.background = "rgba(38,143,250,0.15)"; } }}
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
                      onMouseEnter={e => { if (!exists) { e.currentTarget.style.background = "rgba(38,143,250,0.15)"; } }}
                      onMouseLeave={e => { e.currentTarget.style.background = exists ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.06)"; }}
                    >
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)" }}>
                        {opt.type === "agenda" && <CalendarDays size={14} className="text-white" />}
                        {opt.type === "musica" && <Music size={14} className="text-white" />}
                        {opt.type === "stats" && <BarChart3 size={14} className="text-white" />}
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
      <Icon size={12} className="text-[#0d0446]/20" />
      <p className="text-[#0d0446]/40 text-[10px]">{text}</p>
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
        <p className="text-[#0d0446]/50 text-[10px] font-bold">{format(today, "dd MMM", { locale: ptBR }).toUpperCase()}</p>
      </div>
      {events.length === 0 ? (
        <p className="text-[#0d0446]/30 text-[10px]">Sem eventos próximos</p>
      ) : (
        <div className="space-y-1">
          {events.map((ev, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: "#268ffa" }} />
              <p className="text-[#0d0446]/50 text-[10px] truncate">{ev.descricao || format(new Date(ev.data + "T12:00:00"), "dd/MM")}</p>
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
        <div className="w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "rgba(38,143,250,0.1)" }}>
          <Music size={16} className="text-[#268ffa]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[#0d0446] text-[11px] font-bold truncate leading-tight">{music.titulo}</p>
        <p className="text-[#0d0446]/50 text-[10px] truncate">{music.artista}</p>
        {programa && (
          <p className="text-[9px] mt-0.5 truncate" style={{ color: "#268ffa" }}>🔴 {programa}</p>
        )}
      </div>
    </div>
  ) : (
    <div className="flex items-center gap-2">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: "rgba(38,143,250,0.06)" }}>
        <Music size={14} className="text-[#0d0446]/20" />
      </div>
      <p className="text-[#0d0446]/30 text-[10px]">Sem música no ar</p>
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
        <p key={i} className="text-[#0d0446]/50 text-[10px] truncate leading-tight">• {n.title}</p>
      ))}
    </div>
  ) : <p className="text-[#0d0446]/30 text-[10px]">Sem notícias salvas</p>;
}

function ApresentadoresPreview() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("apresentadores").select("id", { count: "exact", head: true }).eq("user_id", user.id)
      .then(({ count: c }) => setCount(c || 0));
  }, [user]);
  return <p className="text-[#0d0446]/50 text-[10px]">{count} apresentador{count !== 1 ? "es" : ""} cadastrado{count !== 1 ? "s" : ""}</p>;
}

function ProgramasPreview() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("programas").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("ativo", true)
      .then(({ count: c }) => setCount(c || 0));
  }, [user]);
  return <p className="text-[#0d0446]/50 text-[10px]">{count} programa{count !== 1 ? "s" : ""} ativo{count !== 1 ? "s" : ""}</p>;
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
  return <p className="text-[#0d0446]/50 text-[10px]">{count} promoção{count !== 1 ? "ões" : ""} ativa{count !== 1 ? "s" : ""}</p>;
}

function PrerollPreview() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("comercial_preroll").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true)
      .then(({ count: c }) => setCount(c || 0));
  }, [user]);
  return <p className="text-[#0d0446]/50 text-[10px]">{count} pre-roll{count !== 1 ? "s" : ""} ativo{count !== 1 ? "s" : ""}</p>;
}

function ShoppingPreview() {
  const { user } = useAuth();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    supabase.from("shopping_products").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("active", true)
      .then(({ count: c }) => setCount(c || 0));
  }, [user]);
  return <p className="text-[#0d0446]/50 text-[10px]">{count} produto{count !== 1 ? "s" : ""} ativo{count !== 1 ? "s" : ""}</p>;
}

/* ========== WIDGET: Agenda ========== */
function DashboardAgendaWidget() {
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
    <div>
      <div className="flex items-center gap-2 mb-3">
        <CalendarDays size={14} className="text-[#268ffa]" />
        <p className="text-[#0d0446] font-bold text-sm">Agenda de Eventos</p>
      </div>
      {events.length === 0 ? (
        <p className="text-[#0d0446]/30 text-xs">Nenhum evento próximo</p>
      ) : (
        <div className="space-y-2">
          {events.map(ev => (
            <div key={ev.id} className="px-3 py-2 rounded-lg" style={{ background: "rgba(38,143,250,0.06)" }}>
              <p className="text-[#0d0446] text-xs font-semibold truncate">{ev.descricao || "Evento"}</p>
              <p className="text-[#0d0446]/40 text-[10px]">
                {new Date(ev.data + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} — {ev.local}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ========== WIDGET: Music + Program ========== */
function MusicProgramWidget() {
  const [music, setMusic] = useState<{ titulo: string; artista: string; capa: string } | null>(null);
  const [programa, setPrograma] = useState<string>("");

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
    const interval = setInterval(update, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Music size={14} className="text-[#268ffa]" />
        <p className="text-[#0d0446] font-bold text-sm">Música no Ar</p>
      </div>
      {music ? (
        <div className="flex items-center gap-3">
          {music.capa && (
            <img src={music.capa} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-[#0d0446] text-sm font-semibold truncate">{music.titulo}</p>
            <p className="text-[#0d0446]/50 text-xs truncate">{music.artista}</p>
            {programa && <p className="text-[#268ffa] text-[10px] mt-0.5 truncate">🔴 {programa}</p>}
          </div>
        </div>
      ) : (
        <p className="text-[#0d0446]/30 text-xs">Sem música no momento</p>
      )}
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
        <BarChart3 size={14} className="text-[#268ffa]" />
        <p className="text-[#0d0446] font-bold text-sm">Dados Estatísticos</p>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="px-3 py-3 rounded-xl text-center" style={{ background: "rgba(38,143,250,0.06)" }}>
          <p className="text-2xl font-bold text-[#0d0446]">{prerollCount}</p>
          <p className="text-[#0d0446]/40 text-[10px] mt-0.5">Pre-rolls Ativos</p>
        </div>
        <div className="px-3 py-3 rounded-xl text-center" style={{ background: "rgba(38,143,250,0.06)" }}>
          <p className="text-2xl font-bold text-[#0d0446]">{channelCount}</p>
          <p className="text-[#0d0446]/40 text-[10px] mt-0.5">Canais Ativos</p>
        </div>
      </div>
    </div>
  );
}
