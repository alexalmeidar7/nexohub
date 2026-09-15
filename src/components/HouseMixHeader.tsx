import { useState, useRef, useEffect, useMemo, Suspense, lazy } from "react";
import logoNxo from "@/assets/logo-nxo.png";
import {
  Bell, Settings, Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight, Radio, Users,
  Music, Layers, LogOut, Check, ArrowRight,
  User, Mail, X, Loader2, Building2,
  FileText, Gift, Siren, Tag, MonitorPlay, Film, Mic2, Globe, CalendarDays, Home,
  Scissors, ShoppingCart, MessageSquareQuote, HelpCircle, Swords, Play, Pause, ExternalLink,
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

const MessageNotification = lazy(() => import("@/components/MessageNotification"));

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
  const [eventDates, setEventDates] = useState<Date[]>([]);

  // User Auth & Profile state
  const { user } = useAuth();
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
    return allowedPages.has(pageKey);
  };

  return (
    <TooltipProvider delayDuration={150}>
      <header className="w-full pt-4 pb-2 px-4 lg:px-8 animate-fade-in font-sans relative z-50">
      <div className="max-w-[1600px] mx-auto space-y-3">
        {/* Main Navbar Card (Pure white rounded bar matching Super Admin) */}
        <div
          ref={dropdownContainerRef}
          className="rounded-full px-6 py-3 flex items-center justify-between relative z-40"
          style={{
            background: "rgba(255,255,255,0.78)",
            backdropFilter: "blur(20px) saturate(1.8)",
            WebkitBackdropFilter: "blur(20px) saturate(1.8)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.9)",
            border: "1px solid rgba(255,255,255,0.6)",
          }}
        >

          {/* Left: NX. Logo & House Mix */}
          <div className={`flex items-center ${isIntercomEnabled ? "gap-2 xl:gap-3" : "gap-6"} shrink-0`}>
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
          <nav className={`hidden lg:flex items-center ${isIntercomEnabled ? "gap-1" : "gap-1 xl:gap-2"}`}>
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

            {/* Home - se esconde quando intercom estiver habilitado e usuário avançar */}
            {(!isIntercomEnabled || menuShift === 0) && (
              <button
                onClick={() => handleNavigate("dashboard")}
                onMouseEnter={() => { handleDirectItemHover(); prefetchPage("dashboard"); }}
                className={`text-[11px] xl:text-xs font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                  currentPage === "dashboard" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                }`}
              >
                home
              </button>
            )}

            {/* Cadastros Dropdown */}
            {(!isIntercomEnabled || menuShift === 0) && (
              <div
                className="relative shrink-0"
                onMouseEnter={() => handleMouseEnter("cadastros")}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  type="button"
                  onClick={(e) => handleDropdownTriggerClick("cadastros", e)}
                  className={`text-[11px] xl:text-xs font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
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
            )}

            {/* Sorteios */}
            {isPageVisible("sorteios") && (!isIntercomEnabled || menuShift === 0) && (
              <button
                onClick={() => handleNavigate("sorteios")}
                onMouseEnter={() => { handleDirectItemHover(); prefetchPage("sorteios"); }}
                className={`text-[11px] xl:text-xs font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                  currentPage === "sorteios" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                }`}
              >
                sorteios
              </button>
            )}

            {/* Blitz */}
            {isPageVisible("blitz") && (!isIntercomEnabled || menuShift === 0) && (
              <button
                onClick={() => handleNavigate("blitz")}
                onMouseEnter={() => { handleDirectItemHover(); prefetchPage("blitz"); }}
                className={`text-[11px] xl:text-xs font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                  currentPage === "blitz" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                }`}
              >
                blitz
              </button>
            )}

            {/* Roteiro */}
            {isPageVisible("noticias") && (!isIntercomEnabled || menuShift === 0) && (
              <button
                onClick={() => handleNavigate("noticias")}
                onMouseEnter={() => { handleDirectItemHover(); prefetchPage("noticias"); }}
                className={`text-[11px] xl:text-xs font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                  currentPage === "noticias" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                }`}
              >
                roteiro
              </button>
            )}

            {/* Música no Ar */}
            {isPageVisible("musica") && (
              <button
                onClick={() => handleNavigate("musica")}
                onMouseEnter={() => { handleDirectItemHover(); prefetchPage("musica"); }}
                className={`text-[11px] xl:text-xs font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                  currentPage === "musica" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                }`}
              >
                música no ar
              </button>
            )}

            {/* Agenda */}
            {isPageVisible("agenda") && (
              <button
                onClick={() => handleNavigate("agenda")}
                onMouseEnter={() => { handleDirectItemHover(); prefetchPage("agenda"); }}
                className={`text-[11px] xl:text-xs font-semibold ${itemPaddingClass} py-1.5 rounded-full cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
                  currentPage === "agenda" ? "text-black font-bold bg-slate-100/80" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                }`}
              >
                agenda
              </button>
            )}

            {/* Site Dropdown */}
            {(!isIntercomEnabled || menuShift > 0) && (
              <div
                className="relative shrink-0"
                onMouseEnter={() => handleMouseEnter("site")}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  type="button"
                  onClick={(e) => handleDropdownTriggerClick("site", e)}
                  className={`text-[11px] xl:text-xs font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
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
            )}

            {/* Comercial Dropdown */}
            {(!isIntercomEnabled || menuShift > 0) && (
              <div
                className="relative shrink-0"
                onMouseEnter={() => handleMouseEnter("comercial")}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  type="button"
                  onClick={(e) => handleDropdownTriggerClick("comercial", e)}
                  className={`text-[11px] xl:text-xs font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
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
            )}

            {/* vMix Dropdown */}
            {(!isIntercomEnabled || menuShift > 0) && (
              <div
                className="relative shrink-0"
                onMouseEnter={() => handleMouseEnter("vmix")}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  type="button"
                  onClick={(e) => handleDropdownTriggerClick("vmix", e)}
                  className={`text-[11px] xl:text-xs font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
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
            )}

            {/* Ferramentas Dropdown - se esconde quando intercom estiver habilitado e menuShift for 0 */}
            {(!isIntercomEnabled || menuShift > 0) && (
              <div
                className="relative shrink-0"
                onMouseEnter={() => handleMouseEnter("ferramentas")}
                onMouseLeave={handleMouseLeave}
              >
                <button
                  type="button"
                  onClick={(e) => handleDropdownTriggerClick("ferramentas", e)}
                  className={`text-[11px] xl:text-xs font-semibold flex items-center gap-1 ${itemPaddingClass} py-1.5 rounded-full outline-none cursor-pointer select-none active:scale-95 transition-colors duration-100 whitespace-nowrap shrink-0 ${
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
                          <span>corte de vídeo</span>
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
                    </div>
                  </div>
                )}
              </div>
            )}

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
            {/* Bots Status Icon */}
            {showBots && (
              <div className="shrink-0">
                <BotsStatusBox />
              </div>
            )}
            {/* Live Audio Stream Player button */}
            {playerState.hasChannel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent("player:toggle"))}
                    className="w-9 h-9 shrink-0 rounded-full bg-[#0055ff] hover:bg-[#0042cc] text-white flex items-center justify-center transition-all shadow-[0_4px_14px_rgba(0,85,255,0.25)] hover:scale-105 active:scale-95 cursor-pointer"
                    aria-label={playerState.isPlaying ? "Pausar player" : "Reproduzir player"}
                  >
                    {playerState.isLoading ? (
                      <Loader2 size={16} className="animate-spin text-white" />
                    ) : playerState.isPlaying ? (
                      <Pause size={16} className="text-white" />
                    ) : (
                      <Play size={16} className="text-white ml-0.5" />
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
                    className={`relative w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-all cursor-pointer shadow-[0_4px_14px_rgba(0,85,255,0.25)] hover:scale-105 active:scale-95 ${
                      intercomMenuOpen || intercomState.talking || intercomState.receiving
                        ? "bg-[#0042cc] ring-2 ring-[#00dbff]/60 text-white"
                        : "bg-[#0055ff] hover:bg-[#0042cc] text-white"
                    }`}
                    title="Intercomunicador"
                  >
                    <Radio className="w-4 h-4 text-white" />
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
                  <Bell className="w-4 h-4 text-white" />
                  {unreadChatbotCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#ef4444] text-white text-[9px] font-black flex items-center justify-center ring-2 ring-white shadow leading-none">
                      {unreadChatbotCount > 99 ? "99+" : unreadChatbotCount}
                    </span>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Atendimento & Mensagens</p></TooltipContent>
            </Tooltip>

            {/* Message Notification (Legacy) */}
            <Suspense fallback={null}>
              <MessageNotification />
            </Suspense>

            {/* Settings */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onNavigate("configuracoes")}
                  className="w-9 h-9 shrink-0 rounded-full bg-[#0055ff] hover:bg-[#0042cc] text-white flex items-center justify-center transition-all shadow-[0_4px_14px_rgba(0,85,255,0.25)] hover:scale-105 active:scale-95 cursor-pointer"
                  title="Configurações da Empresa"
                >
                  <Settings className="w-4 h-4 text-white" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Configurações</p></TooltipContent>
            </Tooltip>

            {/* Logout */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onLogout}
                  className="w-9 h-9 shrink-0 rounded-full bg-[#0055ff] hover:bg-red-600 text-white flex items-center justify-center transition-all shadow-[0_4px_14px_rgba(0,85,255,0.25)] hover:scale-105 active:scale-95 cursor-pointer"
                  title="Sair da Conta"
                >
                  <LogOut className="w-4 h-4 text-white" />
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
