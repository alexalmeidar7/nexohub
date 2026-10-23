import { useState, useRef, useEffect, useMemo, Suspense, lazy, Fragment } from "react";
import logoNxo from "@/assets/logo-nxo.png";
import {
  Bell, Settings, Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, Radio, Users,
  Music, Layers, LogOut, Check, ArrowRight,
  User, Mail, X, Loader2, Building2,
  FileText, Gift, Siren, Tag, MonitorPlay, Film, Mic2, Globe, CalendarDays, Home,
  Scissors, ShoppingCart, MessageSquareQuote, HelpCircle, Swords, Play, Pause, ExternalLink, BarChart3,
  Mic, Headphones
} from "lucide-react";
import { format, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import ServerClock from "@/components/ServerClock";
import BotsStatusBox from "@/components/BotsStatusBox";
import { prefetchPage, prefetchGroup, startIdlePrefetch } from "@/lib/prefetchPages";


interface HouseMixHeaderProps {
  currentPage: string;
  onNavigate: (page: any) => void;
  onLogout?: () => void;
  userEmail?: string;
  empresaNome?: string;
  empresaLogo?: string;
  empresaTimezone?: string | null;
  playerState?: {
    isPlaying: boolean;
    isLoading: boolean;
    hasChannel: boolean;
    channelName?: string;
  };
  allowedPages?: Set<string> | null;
  pageTitle?: string;
  onGoBack?: () => void;
  onMinimize?: () => void;
  canMinimize?: boolean;
  showBots?: boolean;
}

export default function HouseMixHeader({
  currentPage,
  onNavigate,
  onLogout,
  userEmail = "",
  empresaNome = "",
  empresaLogo = "",
  empresaTimezone = null,
  playerState = { isPlaying: false, isLoading: false, hasChannel: false },
  allowedPages = null,
  pageTitle,
  onGoBack,
  onMinimize,
  canMinimize = false,
  showBots = true,
}: HouseMixHeaderProps) {
  // Dropdown states
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);

  // Calendar states
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(new Date());
  const { user } = useAuth();
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [todayAgendaItems, setTodayAgendaItems] = useState<Array<{ id: string; title: string; time?: string }>>([]);
  const [activeAgendaItem, setActiveAgendaItem] = useState(0);

  // Load today's agenda items for the signed-in station, including recurring events.
  useEffect(() => {
    if (!user) {
      setTodayAgendaItems([]);
      return;
    }
    let cancelled = false;
    const loadTodayAgenda = async () => {
      try {
        let targetUserId = user.id;
        const { data: subUser } = await supabase
          .from("sub_users")
          .select("parent_user_id, ativo")
          .eq("auth_user_id", user.id)
          .maybeSingle();
        if (subUser?.ativo && subUser.parent_user_id) targetUserId = subUser.parent_user_id;

        const today = new Date();
        const todayKey = format(today, "yyyy-MM-dd");
        const [uniqueRes, recurringRes, programsRes] = await Promise.all([
          supabase.from("agenda_eventos").select("*").eq("user_id", targetUserId)
            .or("recorrencia.eq.unico,recorrencia.is.null").eq("data", todayKey).limit(100),
          supabase.from("agenda_eventos").select("*").eq("user_id", targetUserId)
            .not("recorrencia", "eq", "unico").lte("data", todayKey)
            .or(`periodo_fim.gte.${todayKey},periodo_fim.is.null`).limit(200),
          supabase.from("programas").select("id,nome,horario_inicio,dias_semana").eq("user_id", targetUserId),
        ]);
        if (cancelled) return;
        const programs = new Map((programsRes.data || []).map((p: any) => [p.id, p]));
        const dow = today.getDay();
        const dayNames = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
        const recurringMatches = (evt: any) => {
          const start = evt.data ? new Date(evt.data + "T12:00:00") : null;
          if (!start) return false;
          if (evt.periodo_inicio && todayKey < evt.periodo_inicio) return false;
          if (evt.periodo_fim && todayKey > evt.periodo_fim) return false;
          const program: any = programs.get(evt.programa_id);
          const days = evt.dias_semana || program?.dias_semana;
          if (Array.isArray(days) && days.length) {
            const normalized = days.map((d: any) => String(d).toLowerCase().normalize("NFD").replace(/[\\u0300-\\u036f]/g, ""));
            return normalized.some((d: string) => d.includes(dayNames[dow]));
          }
          if (evt.recorrencia === "semanal") return start.getDay() === dow;
          if (evt.recorrencia === "mensal") return start.getDate() === today.getDate();
          if (evt.recorrencia === "programa_semanal" || evt.recorrencia?.startsWith("programa_semanal:") || evt.recorrencia?.startsWith("dias:")) {
            let activeDays = [1, 2, 3, 4, 5];
            if (Array.isArray(evt.dias_semana) && evt.dias_semana.length) activeDays = evt.dias_semana.map(Number);
            else if (evt.recorrencia.startsWith("programa_semanal:")) activeDays = evt.recorrencia.slice(17).split(",").map(Number);
            else if (evt.recorrencia.startsWith("dias:")) activeDays = evt.recorrencia.slice(5).split(",").map(Number);
            return activeDays.includes(dow);
          }
          return false;
        };
        const all = new Map<string, any>();
        (uniqueRes.data || []).forEach((evt: any) => all.set(evt.id, evt));
        (recurringRes.data || []).filter(recurringMatches).forEach((evt: any) => all.set(evt.id, evt));
        const items = Array.from(all.values()).map((evt: any) => {
          const program: any = programs.get(evt.programa_id);
          const title = String(evt.descricao || evt.titulo || program?.nome || evt.tipo_evento || "Evento").trim();
          const rawTime = evt.horario_gravacao || program?.horario_inicio || "";
          return { id: String(evt.id), title, time: rawTime ? String(rawTime).slice(0, 5) : "" };
        }).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
        if (!cancelled) {
          setTodayAgendaItems(items);
          setActiveAgendaItem(0);
        }
      } catch {
        if (!cancelled) setTodayAgendaItems([]);
      }
    };
    void loadTodayAgenda();
    const channel = supabase.channel(`header-agenda-today-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "agenda_eventos" }, () => { void loadTodayAgenda(); })
      .subscribe();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  useEffect(() => {
    if (todayAgendaItems.length < 2) {
      setActiveAgendaItem(0);
      return;
    }
    const timer = window.setInterval(() => {
      setActiveAgendaItem((current) => (current + 1) % todayAgendaItems.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [todayAgendaItems.length]);

  // User Auth & Profile state
  const [unreadChatbotCount, setUnreadChatbotCount] = useState<number>(() => {
    try {
      const local = localStorage.getItem("nexohub_chatbot_contacts_v1");
      if (local) {
        const parsed = JSON.parse(local);
        if (Array.isArray(parsed)) {
          return parsed.reduce((acc, c) => acc + (Number(c.unreadCount) || 0), 0);
        }
      }
    } catch {}
    return 0;
  });

  // Intercom submenu & status states
  const [intercomMenuOpen, setIntercomMenuOpen] = useState(false);
  const [intercomState, setIntercomState] = useState<{ role: string; talking: boolean; receiving: boolean; open?: boolean }>({
    role: "none",
    talking: false,
    receiving: false,
  });
  const intercomContainerRef = useRef<HTMLDivElement | null>(null);

  // Menu navigation shift state when intercom is active/open
  const [menuShift, setMenuShift] = useState<number>(0);
  const isIntercomEnabled = intercomMenuOpen;
  const itemPaddingClass = isIntercomEnabled ? "px-2.5" : "px-3";

  useEffect(() => {
    const shift1Pages = [
      "site", "playerconfig",
      "preroll", "testemunhais", "promocoes", "logos", "configtelapromo", "shopping",
      "broadcast", "cenario", "batalha", "enquete", "quiz",
      "cortevideo", "tp"
    ];
    if (!isIntercomEnabled) {
      setMenuShift(0);
    } else if (shift1Pages.includes(currentPage)) {
      setMenuShift(1);
    }
  }, [isIntercomEnabled, currentPage]);

  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d) setIntercomState(d);
    };
    window.addEventListener("intercom:state-change", onState as EventListener);
    return () => window.removeEventListener("intercom:state-change", onState as EventListener);
  }, []);

  useEffect(() => {
    if (!intercomMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownContainerRef.current && dropdownContainerRef.current.contains(e.target as Node)) {
        return;
      }
      setIntercomMenuOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [intercomMenuOpen]);

  // Load chatbot unread count listener
  useEffect(() => {
    const handleChatbotUpdate = (e: any) => {
      if (e?.detail?.unreadTotal !== undefined) {
        setUnreadChatbotCount(Number(e.detail.unreadTotal) || 0);
      }
    };
    window.addEventListener("chatbot:unread-updated", handleChatbotUpdate);
    return () => window.removeEventListener("chatbot:unread-updated", handleChatbotUpdate);
  }, []);

  // Load calendar event dates for dots
  useEffect(() => {
    async function loadEventDates() {
      try {
        const { data, error } = await supabase
          .from("agenda_eventos")
          .select("data");
        if (data && !error) {
          const dates = data
            .map(e => e.data ? new Date(e.data + "T12:00:00") : null)
            .filter((d): d is Date => d !== null && !isNaN(d.getTime()));
          setEventDates(dates);
        }
      } catch {}
    }
    loadEventDates();
  }, []);

  // Dropdown hover & click handlers with instant response, safe diagonal corridor and click-retention
  const lastOpenTimeRef = useRef<Record<string, number>>({});

  const handleMouseEnter = (menuKey: string) => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    lastOpenTimeRef.current[menuKey] = Date.now();
    setOpenDropdown(menuKey);
  };

  const handleMouseLeave = () => {
    if (dropdownTimeoutRef.current) clearTimeout(dropdownTimeoutRef.current);
    dropdownTimeoutRef.current = setTimeout(() => {
      setOpenDropdown(null);
    }, 200);
  };

  const handleMenuContentMouseEnter = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
  };

  const handleDropdownTriggerClick = (menuKey: string, e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    lastOpenTimeRef.current[menuKey] = Date.now();
    setOpenDropdown(menuKey);
  };

  const handleDirectItemHover = () => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    setOpenDropdown(null);
  };

  const handleNavigate = (page: any) => {
    if (dropdownTimeoutRef.current) {
      clearTimeout(dropdownTimeoutRef.current);
      dropdownTimeoutRef.current = null;
    }
    setOpenDropdown(null);
    onNavigate(page);
  };

  // Click outside to close dropdowns
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownContainerRef.current && !dropdownContainerRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    }
    if (openDropdown) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [openDropdown]);

  // Dynamic current date formatted like "04 de Setembro/26"
  const todayFormatted = (() => {
    try {
      const now = new Date();
      const day = format(now, "dd");
      const month = format(now, "MMMM", { locale: ptBR });
      const capitalizedMonth = month.charAt(0).toUpperCase() + month.slice(1);
      const year = format(now, "yy");
      return `${day} de ${capitalizedMonth}/${year}`;
    } catch {
      return "04 de Setembro/26";
    }
  })();

  const displayEmail = userEmail || user?.email || "";
  const masterSlug = displayEmail.includes("@") ? displayEmail.split("@")[0].toLowerCase() : (user?.id || "");

  const handleExternalAction = (action: string) => {
    setOpenDropdown(null);
    if (action === "player") {
      const url = masterSlug ? `/${masterSlug}/player` : "/player";
      window.open(url, "_blank");
    } else if (action === "locutor") {
      const url = masterSlug ? `/${masterSlug}/locutor` : "/locutor";
      window.open(url, "_blank");
    } else if (action === "tp") {
      window.open("/tp-externo", "_blank");
    } else if (action === "vmix") {
      window.open("/vmix-control", "_blank");
    }
  };

  const isPageVisible = (pageKey: string) => {
    if (!allowedPages) return true;
    if (pageKey === "relatorios") return true;
    if (
      pageKey === "programas" ||
      pageKey === "apresentadores" ||
      pageKey === "ouvintes" ||
      pageKey === "clientes" ||
      pageKey === "previsao"
    ) {
      return (
        allowedPages.has(pageKey) ||
        allowedPages.has(`c:cadastros:${pageKey}`) ||
        allowedPages.has("g:cadastros") ||
        allowedPages.has("cadastros")
      );
    }
    if (pageKey === "broadcast" || pageKey === "cenario" || pageKey === "vmix") {
      return (
        allowedPages.has(pageKey) ||
        allowedPages.has("vmix") ||
        allowedPages.has("g:vmix") ||
        allowedPages.has(`c:vmix:${pageKey}`) ||
        allowedPages.has("comercial") ||
        allowedPages.has("producao") ||
        true
      );
    }
    if (pageKey === "logos") {
      return (
        allowedPages.has("logos") ||
        allowedPages.has("comercial") ||
        allowedPages.has("g:comercial") ||
        allowedPages.has("c:comercial:logos") ||
        allowedPages.has("vmix") ||
        allowedPages.has("g:vmix") ||
        allowedPages.has("c:vmix:logos")
      );
    }
    return allowedPages.has(pageKey);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <header className="w-full pt-4 pb-2 px-4 lg:px-8 animate-fade-in font-sans relative z-50">
      <div className="max-w-[1600px] mx-auto space-y-3">
        {/* Main Navbar Card (Pure white rounded bar matching Super Admin) */}
        <div
          ref={dropdownContainerRef}
          className="rounded-full px-2 sm:px-3 lg:px-3 xl:px-4 2xl:px-6 py-2 lg:py-2.5 xl:py-3 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 relative z-40"
          style={{
            background: "rgba(255,255,255,0.78)",
            backdropFilter: "blur(20px) saturate(1.8)",
            WebkitBackdropFilter: "blur(20px) saturate(1.8)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >

          {/* Left: NX. Logo & House Mix */}
          <div className={`flex items-center ${isIntercomEnabled ? "gap-1.5 xl:gap-2" : "gap-2 xl:gap-3"} shrink-0`}>
            <button
              onClick={() => onNavigate("dashboard")}
              className="flex items-center gap-2.5 outline-none focus:opacity-80 transition-opacity cursor-pointer group shrink-0"
              title="House Mix"
            >
              <img
                src={logoNxo}
                alt="nx."
                className="h-8 w-auto object-contain shrink-0"
              />
              <span className="text-black text-[11px] xl:text-xs font-semibold tracking-tight select-none whitespace-nowrap">
                house mix
              </span>
            </button>
          </div>

          {/* Center: Navigation Links & Hover Dropdowns */}
          <nav className={`hidden lg:flex flex-1 min-w-0 flex-wrap content-center justify-center items-center ${isIntercomEnabled ? "gap-0" : "gap-0 lg:gap-0.5 xl:gap-1"}`}>
            {/* Seta esquerda para itens anteriores quando intercom estiver habilitado */}
            {isIntercomEnabled && (
              <button
                type="button"
                disabled={menuShift === 0}
                onClick={() => {
                  setOpenDropdown(null);
                  setMenuShift(0);
                }}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 ${
                  menuShift === 0
                    ? "opacity-20 cursor-not-allowed text-slate-400 bg-slate-100/50"
                    : "bg-slate-100 hover:bg-[#0055ff] text-slate-700 hover:text-white shadow-xs active:scale-90 cursor-pointer"
                }`}
                title={menuShift === 0 ? "Início do menu" : "Ver itens anteriores (home)"}
                aria-label="Itens anteriores"
              >
                <ChevronLeft className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}

            {[
              {
                id: "home",
                visible: (!isIntercomEnabled || menuShift === 0),
                node: (
                  <button
                    onClick={() => handleNavigate("dashboard")}
                    onMouseEnter={() => { handleDirectItemHover(); prefetchPage("dashboard"); }}
                    className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                      currentPage === "dashboard" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                    }`}
                  >
                    home
                  </button>
                ),
              },
              {
                id: "cadastros",
                visible: (!isIntercomEnabled || menuShift === 0),
                node: (
                  <div
                    className="relative shrink-0"
                    onMouseEnter={() => handleMouseEnter("cadastros")}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleDropdownTriggerClick("cadastros", e)}
                      className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                        openDropdown === "cadastros"
                          ? "bg-black text-white shadow-sm"
                          : ["apresentadores", "ouvintes", "programas", "clientes", "previsao"].includes(currentPage)
                          ? "text-black font-bold bg-slate-100/80"
                          : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                      }`}
                    >
                      <span>cadastros</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${openDropdown === "cadastros" ? "rotate-180 opacity-100" : "opacity-60"}`} />
                    </button>

                    {openDropdown === "cadastros" && (
                      <div
                        onMouseEnter={handleMenuContentMouseEnter}
                        className="absolute top-full left-0 pt-1.5 z-[9999] animate-in fade-in slide-in-from-top-0.5 duration-75 ease-out transform-gpu will-change-transform"
                      >
                        <div className="bg-[#000000] border border-white/10 rounded-2xl p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.35)] min-w-[190px] space-y-0.5">
                          {isPageVisible("apresentadores") && (
                            <button
                              onMouseEnter={() => prefetchPage("apresentadores")}
                              onClick={() => handleNavigate("apresentadores")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "apresentadores" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Mic2 size={13} className="text-white/70" />
                              <span>participantes</span>
                            </button>
                          )}
                          {isPageVisible("ouvintes") && (
                            <button
                              onMouseEnter={() => prefetchPage("ouvintes")}
                              onClick={() => handleNavigate("ouvintes")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "ouvintes" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Users size={13} className="text-white/70" />
                              <span>ouvintes</span>
                            </button>
                          )}
                          {isPageVisible("programas") && (
                            <button
                              onMouseEnter={() => prefetchPage("programas")}
                              onClick={() => handleNavigate("programas")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "programas" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Radio size={13} className="text-white/70" />
                              <span>programas</span>
                            </button>
                          )}
                          {isPageVisible("clientes") && (
                            <button
                              onMouseEnter={() => prefetchPage("clientes")}
                              onClick={() => handleNavigate("clientes")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "clientes" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Building2 size={13} className="text-white/70" />
                              <span>clientes</span>
                            </button>
                          )}
                          {isPageVisible("previsao") && (
                            <button
                              onMouseEnter={() => prefetchPage("previsao")}
                              onClick={() => handleNavigate("previsao")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "previsao" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Globe size={13} className="text-white/70" />
                              <span>cidade tempo</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                id: "sorteios",
                visible: isPageVisible("sorteios") && (!isIntercomEnabled || menuShift === 0),
                node: (
                  <button
                    onClick={() => handleNavigate("sorteios")}
                    onMouseEnter={() => { handleDirectItemHover(); prefetchPage("sorteios"); }}
                    className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                      currentPage === "sorteios" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                    }`}
                  >
                    sorteios
                  </button>
                ),
              },
              {
                id: "blitz",
                visible: isPageVisible("blitz") && (!isIntercomEnabled || menuShift === 0),
                node: (
                  <button
                    onClick={() => handleNavigate("blitz")}
                    onMouseEnter={() => { handleDirectItemHover(); prefetchPage("blitz"); }}
                    className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                      currentPage === "blitz" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                    }`}
                  >
                    blitz
                  </button>
                ),
              },
              {
                id: "roteiro",
                visible: isPageVisible("noticias") && (!isIntercomEnabled || menuShift === 0),
                node: (
                  <button
                    onClick={() => handleNavigate("noticias")}
                    onMouseEnter={() => { handleDirectItemHover(); prefetchPage("noticias"); }}
                    className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                      currentPage === "noticias" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                    }`}
                  >
                    roteiro
                  </button>
                ),
              },
              {
                id: "musica",
                visible: isPageVisible("musica"),
                node: (
                  <button
                    onClick={() => handleNavigate("musica")}
                    onMouseEnter={() => { handleDirectItemHover(); prefetchPage("musica"); }}
                    className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                      currentPage === "musica" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                    }`}
                  >
                    música no ar
                  </button>
                ),
              },
              {
                id: "agenda",
                visible: isPageVisible("agenda"),
                node: (
                  <button
                    onClick={() => handleNavigate("agenda")}
                    onMouseEnter={() => { handleDirectItemHover(); prefetchPage("agenda"); }}
                    className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                      currentPage === "agenda" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                    }`}
                  >
                    agenda
                  </button>
                ),
              },
              {
                id: "site",
                visible: (!isIntercomEnabled || menuShift > 0),
                node: (
                  <div
                    className="relative shrink-0"
                    onMouseEnter={() => handleMouseEnter("site")}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleDropdownTriggerClick("site", e)}
                      className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                        openDropdown === "site"
                          ? "bg-black text-white shadow-sm"
                          : ["site", "playerconfig"].includes(currentPage)
                          ? "text-black font-bold bg-slate-100/80"
                          : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                      }`}
                    >
                      <span>site</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${openDropdown === "site" ? "rotate-180 opacity-100" : "opacity-60"}`} />
                    </button>

                    {openDropdown === "site" && (
                      <div
                        onMouseEnter={handleMenuContentMouseEnter}
                        className="absolute top-full left-0 pt-1.5 z-[9999] animate-in fade-in slide-in-from-top-0.5 duration-75 ease-out transform-gpu will-change-transform"
                      >
                        <div className="bg-[#000000] border border-white/10 rounded-2xl p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.35)] min-w-[190px] space-y-0.5">
                          {isPageVisible("site") && (
                            <button
                              onMouseEnter={() => prefetchPage("site")}
                              onClick={() => handleNavigate("site")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "site" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Globe size={13} className="text-white/70" />
                              <span>gestor do site</span>
                            </button>
                          )}
                          {isPageVisible("playerconfig") && (
                            <button
                              onMouseEnter={() => prefetchPage("playerconfig")}
                              onClick={() => handleNavigate("playerconfig")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "playerconfig" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Settings size={13} className="text-white/70" />
                              <span>configurações do player</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleExternalAction("player")}
                            className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between text-white/85 hover:bg-[#0055ff] hover:text-white cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out"
                          >
                            <div className="flex items-center gap-2">
                              <MonitorPlay size={13} className="text-white/70" />
                              <span>abrir player externo</span>
                            </div>
                            <ExternalLink size={11} className="text-white/50" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                id: "comercial",
                visible: (!isIntercomEnabled || menuShift > 0),
                node: (
                  <div
                    className="relative shrink-0"
                    onMouseEnter={() => handleMouseEnter("comercial")}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleDropdownTriggerClick("comercial", e)}
                      className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                        openDropdown === "comercial"
                          ? "bg-black text-white shadow-sm"
                          : ["preroll", "testemunhais", "promocoes", "logos", "configtelapromo", "shopping"].includes(currentPage)
                          ? "text-black font-bold bg-slate-100/80"
                          : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                      }`}
                    >
                      <span>comercial</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${openDropdown === "comercial" ? "rotate-180 opacity-100" : "opacity-60"}`} />
                    </button>

                    {openDropdown === "comercial" && (
                      <div
                        onMouseEnter={handleMenuContentMouseEnter}
                        className="absolute top-full left-0 pt-1.5 z-[9999] animate-in fade-in slide-in-from-top-0.5 duration-75 ease-out transform-gpu will-change-transform"
                      >
                        <div className="bg-[#000000] border border-white/10 rounded-2xl p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.35)] min-w-[210px] space-y-0.5">
                          {isPageVisible("preroll") && (
                            <button
                              onMouseEnter={() => prefetchPage("preroll")}
                              onClick={() => handleNavigate("preroll")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "preroll" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Film size={13} className="text-white/70" />
                              <span>ADS / pre-roll</span>
                            </button>
                          )}
                          {isPageVisible("testemunhais") && (
                            <button
                              onMouseEnter={() => prefetchPage("testemunhais")}
                              onClick={() => handleNavigate("testemunhais")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "testemunhais" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <MessageSquareQuote size={13} className="text-white/70" />
                              <span>citações</span>
                            </button>
                          )}
                          {isPageVisible("promocoes") && (
                            <button
                              onMouseEnter={() => prefetchPage("promocoes")}
                              onClick={() => handleNavigate("promocoes")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "promocoes" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Tag size={13} className="text-white/70" />
                              <span>promoções</span>
                            </button>
                          )}
                          {isPageVisible("logos") && (
                            <button
                              onMouseEnter={() => prefetchPage("logos")}
                              onClick={() => handleNavigate("logos")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "logos" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Layers size={13} className="text-white/70" />
                              <span>logos</span>
                            </button>
                          )}
                          {isPageVisible("configtelapromo") && (
                            <button
                              onMouseEnter={() => prefetchPage("configtelapromo")}
                              onClick={() => handleNavigate("configtelapromo")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "configtelapromo" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Settings size={13} className="text-white/70" />
                              <span>config módulo locutor</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleExternalAction("locutor")}
                            className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between text-white/85 hover:bg-[#0055ff] hover:text-white cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out"
                          >
                            <div className="flex items-center gap-2">
                              <Mic2 size={13} className="text-white/70" />
                              <span>abrir módulo locutor</span>
                            </div>
                            <ExternalLink size={11} className="text-white/50" />
                          </button>
                          {isPageVisible("shopping") && (
                            <button
                              type="button"
                              disabled
                              aria-disabled="true"
                              className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-not-allowed select-none opacity-40 text-white/50"
                            >
                              <ShoppingCart size={13} className="text-white/40" />
                              <span>shopping</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                id: "vmix",
                visible: (!isIntercomEnabled || menuShift > 0),
                node: (
                  <div
                    className="relative shrink-0"
                    onMouseEnter={() => handleMouseEnter("vmix")}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleDropdownTriggerClick("vmix", e)}
                      className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                        openDropdown === "vmix"
                          ? "bg-black text-white shadow-sm"
                          : ["broadcast", "cenario", "batalha", "enquete", "quiz"].includes(currentPage)
                          ? "text-black font-bold bg-slate-100/80"
                          : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                      }`}
                    >
                      <span>vmix</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${openDropdown === "vmix" ? "rotate-180 opacity-100" : "opacity-60"}`} />
                    </button>

                    {openDropdown === "vmix" && (
                      <div
                        onMouseEnter={handleMenuContentMouseEnter}
                        className="absolute top-full left-0 pt-1.5 z-[9999] animate-in fade-in slide-in-from-top-0.5 duration-75 ease-out transform-gpu will-change-transform"
                      >
                        <div className="bg-[#000000] border border-white/10 rounded-2xl p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.35)] min-w-[190px] space-y-0.5">
                          <button
                            onClick={() => handleExternalAction("vmix")}
                            className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between text-white/85 hover:bg-[#0055ff] hover:text-white cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out"
                          >
                            <div className="flex items-center gap-2">
                              <MonitorPlay size={13} className="text-white/70" />
                              <span>vmix control</span>
                            </div>
                            <ExternalLink size={11} className="text-white/50" />
                          </button>
                          {isPageVisible("broadcast") && (
                            <button
                              onMouseEnter={() => prefetchPage("broadcast")}
                              onClick={() => handleNavigate("broadcast")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "broadcast" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Radio size={13} className="text-white/70" />
                              <span>broadcast</span>
                            </button>
                          )}
                          {isPageVisible("cenario") && (
                            <button
                              onMouseEnter={() => prefetchPage("cenario")}
                              onClick={() => handleNavigate("cenario")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "cenario" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <MonitorPlay size={13} className="text-white/70" />
                              <span>cenários</span>
                            </button>
                          )}
                          {isPageVisible("batalha") && (
                            <button
                              onMouseEnter={() => prefetchPage("batalha")}
                              onClick={() => handleNavigate("batalha")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "batalha" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Swords size={13} className="text-white/70" />
                              <span>batalha musical</span>
                            </button>
                          )}
                          {isPageVisible("enquete") && (
                            <button
                              onMouseEnter={() => prefetchPage("enquete")}
                              onClick={() => handleNavigate("enquete")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "enquete" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <HelpCircle size={13} className="text-white/70" />
                              <span>enquete</span>
                            </button>
                          )}
                          {isPageVisible("quiz") && (
                            <button
                              onMouseEnter={() => prefetchPage("quiz")}
                              onClick={() => handleNavigate("quiz")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "quiz" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <HelpCircle size={13} className="text-white/70" />
                              <span>quiz</span>
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                id: "ferramentas",
                visible: (!isIntercomEnabled || menuShift > 0),
                node: (
                  <div
                    className="relative shrink-0"
                    onMouseEnter={() => handleMouseEnter("ferramentas")}
                    onMouseLeave={handleMouseLeave}
                  >
                    <button
                      type="button"
                      onClick={(e) => handleDropdownTriggerClick("ferramentas", e)}
                      className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                        openDropdown === "ferramentas"
                          ? "bg-black text-white shadow-sm"
                          : ["cortevideo", "tp"].includes(currentPage)
                          ? "text-black font-bold bg-slate-100/80"
                          : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                      }`}
                    >
                      <span>ferramentas</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-150 ${openDropdown === "ferramentas" ? "rotate-180 opacity-100" : "opacity-60"}`} />
                    </button>

                    {openDropdown === "ferramentas" && (
                      <div
                        onMouseEnter={handleMenuContentMouseEnter}
                        className="absolute top-full left-0 pt-1.5 z-[9999] animate-in fade-in slide-in-from-top-0.5 duration-75 ease-out transform-gpu will-change-transform"
                      >
                        <div className="bg-[#000000] border border-white/10 rounded-2xl p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.35)] min-w-[190px] space-y-0.5">
                          {isPageVisible("cortevideo") && (
                            <button
                              onMouseEnter={() => prefetchPage("cortevideo")}
                              onClick={() => handleNavigate("cortevideo")}
                              className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out ${
                                currentPage === "cortevideo" ? "bg-[#0055ff] text-white font-bold" : "text-white/85 hover:bg-[#0055ff] hover:text-white"
                              }`}
                            >
                              <Scissors size={13} className="text-white/70" />
                              <span>editor de vídeo</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleExternalAction("tp")}
                            className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between text-white/85 hover:bg-[#0055ff] hover:text-white cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out"
                          >
                            <div className="flex items-center gap-2">
                              <FileText size={13} className="text-white/70" />
                              <span>abrir TP externo</span>
                            </div>
                            <ExternalLink size={11} className="text-white/50" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setOpenDropdown(null);
                              window.open("https://housemix.nexobrasil.net/downloads/nexohub-bridge/NexoHubBridge.exe", "_blank", "noopener,noreferrer");
                            }}
                            className="w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between text-white/85 hover:bg-[#0055ff] hover:text-white cursor-pointer select-none active:bg-[#002680] transition-colors duration-75 ease-out"
                          >
                            <div className="flex items-center gap-2">
                              <MonitorPlay size={13} className="text-white/70" />
                              <span>Download Nexo Bridge</span>
                            </div>
                            <ExternalLink size={11} className="text-white/50" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ),
              },
              {
                id: "relatorios",
                visible: (!isIntercomEnabled || menuShift > 0) && isPageVisible("relatorios"),
                node: (
                  <button
                    onClick={() => handleNavigate("relatorios")}
                    onMouseEnter={() => { handleDirectItemHover(); prefetchPage("relatorios"); }}
                    title="Relatórios"
                    className={`text-[9px] xl:text-[10px] 2xl:text-[11px] font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                      currentPage === "relatorios" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                    }`}
                  >
                    <BarChart3 size={13} />
                    <span>relatórios</span>
                  </button>
                ),
              },
            ]
              .filter((item) => item.visible)
              .map((item, index) => (
                <Fragment key={item.id}>
                  {index > 0 && (
                    <span
                      className="h-5 w-px bg-slate-400/70 rounded-full shrink-0 select-none pointer-events-none"
                      aria-hidden="true"
                    />
                  )}
                  {item.node}
                </Fragment>
              ))}

            {/* Seta direita para mais itens quando intercom estiver habilitado */}
            {isIntercomEnabled && (
              <button
                type="button"
                disabled={menuShift === 1}
                onClick={() => {
                  setOpenDropdown(null);
                  setMenuShift(1);
                }}
                className={`w-6 h-6 rounded-full flex items-center justify-center transition-all shrink-0 ${
                  menuShift === 1
                    ? "opacity-20 cursor-not-allowed text-slate-400 bg-slate-100/50"
                    : "bg-slate-100 hover:bg-[#0055ff] text-slate-700 hover:text-white shadow-xs active:scale-90 cursor-pointer"
                }`}
                title={menuShift === 1 ? "Fim do menu" : "Ver mais itens (comercial, vmix, ferramentas)"}
                aria-label="Próximos itens"
              >
                <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            )}
          </nav>

          {/* Right: Bots, Audio Player, Intercom, Bell, Settings, Profile & Clock */}
          <div className={`flex items-center ${isIntercomEnabled ? "gap-1.5 xl:gap-2" : "gap-2"} shrink-0`} onMouseEnter={handleDirectItemHover}>
            {/* Live Audio Stream Player button */}
            {playerState.hasChannel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent("player:toggle"))}
                    className="w-8 h-8 shrink-0 rounded-full bg-[#0055ff] hover:bg-[#0042cc] text-white flex items-center justify-center transition-all shadow-[0_3px_10px_rgba(0,85,255,0.2)] hover:scale-105 active:scale-95 cursor-pointer"
                    aria-label={playerState.isPlaying ? "Pausar player" : "Reproduzir player"}
                  >
                    {playerState.isLoading ? (
                      <Loader2 size={14} className="animate-spin text-white" />
                    ) : playerState.isPlaying ? (
                      <Pause size={14} className="text-white" />
                    ) : (
                      <Play size={14} className="text-white ml-0.5" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">{playerState.isPlaying ? `Pausar${playerState.channelName ? ` – ${playerState.channelName}` : ""}` : "Reproduzir player"}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {/* Intercom with inline submenu to the right */}
            <div ref={intercomContainerRef} className="relative flex items-center shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setIntercomMenuOpen((prev) => !prev)}
                    className={`relative w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-[0_3px_10px_rgba(0,85,255,0.2)] hover:scale-105 active:scale-95 ${
                      intercomMenuOpen || intercomState.talking || intercomState.receiving
                        ? "bg-[#0042cc] ring-2 ring-[#00dbff]/60 text-white"
                        : "bg-[#0055ff] hover:bg-[#0042cc] text-white"
                    }`}
                    title="Intercomunicador"
                  >
                    <Radio className="w-3.5 h-3.5 text-white" />
                    {(intercomState.talking || intercomState.receiving) && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-[#10b981] border-2 border-white animate-pulse" />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom"><p className="text-xs">Intercomunicador</p></TooltipContent>
              </Tooltip>

              {/* Submenu expanding to the right */}
              {intercomMenuOpen && (
                <div className="flex items-center gap-1.5 ml-2 p-1 rounded-full bg-white/95 dark:bg-[#0A2540]/95 backdrop-blur-md border border-white/40 dark:border-white/10 shadow-[0_8px_24px_rgba(0,0,0,0.18)] animate-in fade-in slide-in-from-left-2 duration-200 z-50 shrink-0">
                  {/* Falar (Microfone) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setIntercomMenuOpen(false);
                          window.dispatchEvent(new CustomEvent("intercom:set-role", { detail: { role: "speaker" } }));
                        }}
                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0055ff] hover:bg-[#0042cc] text-white transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                        title="Falar (Transmitir)"
                      >
                        <Mic className="w-3.5 h-3.5 text-white group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold tracking-tight">Falar</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p className="text-xs">Falar no Intercom</p></TooltipContent>
                  </Tooltip>

                  {/* Ouvir (Headphone) */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          setIntercomMenuOpen(false);
                          window.dispatchEvent(new CustomEvent("intercom:set-role", { detail: { role: "listener" } }));
                        }}
                        className="group flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-[#002132] transition-all shadow-sm active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
                        title="Ouvir (Receptor)"
                      >
                        <Headphones className="w-3.5 h-3.5 text-[#0055ff] group-hover:scale-110 transition-transform" />
                        <span className="text-xs font-bold tracking-tight">Ouvir</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom"><p className="text-xs">Ouvir Intercom</p></TooltipContent>
                  </Tooltip>
                </div>
              )}
            </div>

            {/* Notifications Bell */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onNavigate("chatbot")}
                  className="relative w-9 h-9 shrink-0 rounded-full bg-[#0055ff] hover:bg-[#0042cc] text-white flex items-center justify-center transition-all shadow-[0_4px_14px_rgba(0,85,255,0.25)] hover:scale-105 active:scale-95 cursor-pointer"
                  title={
                    unreadChatbotCount > 0
                      ? `${unreadChatbotCount} nova(s) mensagem(ns) no Chatbot`
                      : "Chatbot & Atendimento"
                  }
                >
                  <Bell className="w-3.5 h-3.5 text-white" />
                  {unreadChatbotCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ef4444] text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white shadow leading-none">
                      {unreadChatbotCount > 99 ? "99+" : unreadChatbotCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Atendimento & Mensagens</p></TooltipContent>
            </Tooltip>



            {/* Settings */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onMouseEnter={() => prefetchPage("configuracoes")}
                  onClick={() => onNavigate(currentPage === "configuracoes" ? "dashboard" : "configuracoes")}
                  className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center transition-all shadow-[0_3px_10px_rgba(0,85,255,0.2)] hover:scale-105 active:scale-95 cursor-pointer ${
                    currentPage === "configuracoes" ? "bg-[#002680] ring-2 ring-white text-white font-bold" : "bg-[#0055ff] hover:bg-[#0042cc] text-white"
                  }`}
                  title="Configurações da Empresa"
                >
                  <Settings className="w-3.5 h-3.5 text-white" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Configurações</p></TooltipContent>
            </Tooltip>

            {/* Logout */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onLogout}
                  className="w-8 h-8 shrink-0 rounded-full bg-[#0055ff] hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-[0_3px_10px_rgba(0,85,255,0.2)] hover:scale-105 active:scale-95 cursor-pointer"
                  title="Sair da Conta"
                >
                  <LogOut className="w-3.5 h-3.5 text-white" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Sair</p></TooltipContent>
            </Tooltip>

            {/* Server Clock */}
            <div className="hidden sm:flex items-center pl-1 shrink-0">
              <ServerClock timezone={empresaTimezone} />
            </div>
          </div>
        </div>

        {/* Date Pill Row + Breadcrumb + User Email */}
        <div className="flex items-center justify-between gap-3 pl-1 pr-6">
          <div className="flex items-center gap-3 min-w-0">
            {showBots && (
              <div className="shrink-0 flex items-center">
                <BotsStatusBox />
              </div>
            )}
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="rounded-full px-4 py-2 flex items-center gap-2.5 text-xs text-slate-800 font-semibold select-none cursor-pointer transition-all active:scale-95 hover:bg-white/90"
                  style={{
                    background: "rgba(255,255,255,0.78)",
                    backdropFilter: "blur(20px) saturate(1.8)",
                    WebkitBackdropFilter: "blur(20px) saturate(1.8)",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
                    border: "1px solid rgba(255,255,255,0.6)",
                  }}
                  title="Abrir calendário"
                >
                  <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                  <span>{todayFormatted}</span>
                  <span className="w-2 h-2 rounded-full bg-[#0055ff]" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="w-[284px] p-3.5 bg-white border border-slate-200/80 rounded-3xl shadow-xl text-slate-800"
              >
                <div className="flex items-center justify-between pb-2.5 mb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-[#0055ff]/10 flex items-center justify-center text-[#0055ff]">
                      <CalendarIcon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 leading-tight">Calendário</h4>
                      <p className="text-[10px] text-slate-400">Eventos da emissora</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCalendarOpen(false);
                      onNavigate("agenda");
                    }}
                    className="w-7 h-7 rounded-full bg-slate-100 hover:bg-[#0055ff] text-slate-500 hover:text-white flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-sm active:scale-95"
                    title="Abrir agenda completa"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="superadmin-mini-cal">
                  <Calendar
                    mode="single"
                    selected={selectedCalendarDate}
                    onSelect={(date) => {
                      setSelectedCalendarDate(date);
                      if (date) {
                        setCalendarOpen(false);
                        onNavigate("agenda");
                      }
                    }}
                    locale={ptBR}
                    modifiers={{
                      hasEvent: (date) => eventDates.some((ed) => isSameDay(ed, date)),
                    }}
                    modifiersClassNames={{
                      hasEvent: "has-event-day",
                    }}
                    className="p-0 pointer-events-auto"
                  />
                </div>
              </PopoverContent>
            </Popover>
            <div
              className="min-w-0 max-w-[min(520px,48vw)] flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all duration-300"
              style={{
                background: "rgba(255,255,255,0.14)",
                border: "1px solid rgba(255,255,255,0.16)",
                color: "var(--layout-nav-text, #ffffff)",
                backdropFilter: "blur(14px)",
              }}
              title={todayAgendaItems.length ? "Eventos cadastrados na agenda para hoje" : "Nenhum evento cadastrado para hoje"}
              aria-live="polite"
            >
              <CalendarDays className="w-3.5 h-3.5 shrink-0 opacity-80" />
              <span className="truncate">
                {todayAgendaItems.length === 0
                  ? "Sem eventos para hoje"
                  : `${todayAgendaItems[activeAgendaItem]?.time ? todayAgendaItems[activeAgendaItem].time + " · " : ""}${todayAgendaItems[activeAgendaItem]?.title || "Evento"}`}
              </span>
              {todayAgendaItems.length > 1 && (
                <span className="shrink-0 text-[10px] opacity-65">{activeAgendaItem + 1}/{todayAgendaItems.length}</span>
              )}
            </div>

            {/* Breadcrumb — only visible when not on home/dashboard */}
            {currentPage !== "dashboard" && pageTitle && (
              <div className="flex items-center gap-2">
                {/* Back button replacing "HOME" text */}
                {onGoBack && (
                  <button
                    type="button"
                    onClick={onGoBack}
                    className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] font-bold text-slate-400 hover:text-slate-600 transition-colors select-none cursor-pointer"
                    title="Voltar"
                  >
                    <X className="w-3 h-3" />
                    <span>home</span>
                  </button>
                )}
                <ChevronDown className="w-3 h-3 text-slate-300 -rotate-90" />
                {/* Page name + minimize button — styled matching '+ Novo Evento' button */}
                <div className="group flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#0055ff] hover:bg-[#0047e1] text-white shadow-sm transition-all border border-[#0055ff]">
                  <span className="text-[11px] uppercase tracking-[0.1em] font-extrabold text-white select-none">
                    {pageTitle}
                  </span>
                  {canMinimize && onMinimize && (
                    <button
                      type="button"
                      onClick={onMinimize}
                      className="w-4 h-4 rounded-full bg-black text-white group-hover:bg-white group-hover:text-[#0055ff] flex items-center justify-center transition-colors cursor-pointer"
                      title="Minimizar"
                    >
                      <ChevronDown className="w-2.5 h-2.5 stroke-[3]" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Email: aligned to the right with the menu clock */}
          {displayEmail && (
            <div
              className="hidden sm:flex items-center text-right select-none pl-3 shrink-0"
              title={`Conectado como: ${displayEmail}`}
            >
              <span className="text-xs font-semibold text-slate-300/85 tracking-tight">
                {displayEmail}
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
    </TooltipProvider>
  );
}
