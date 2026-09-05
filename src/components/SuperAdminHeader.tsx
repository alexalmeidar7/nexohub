import { useState, useRef, useEffect } from "react";
import logoNxo from "@/assets/logo-nxo.png";
import {
  Bell, Settings, Calendar as CalendarIcon, Search, ChevronDown, Radio, Users,
  Package, Music, Layers, Smartphone, Palette, LogOut, Check, ArrowRight
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

interface SuperAdminHeaderProps {
  currentPage: string;
  onNavigate: (page: any) => void;
  onLogout?: () => void;
  userEmail?: string;
  searchQuery?: string;
  onSearchChange?: (q: string) => void;
}

export default function SuperAdminHeader({
  currentPage,
  onNavigate,
  onLogout,
  userEmail = "alex@nexobrasil.net",
  searchQuery = "",
  onSearchChange,
}: SuperAdminHeaderProps) {
  const [produtosOpen, setProdutosOpen] = useState(false);
  const [businessOpen, setBusinessOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(new Date());
  const [eventDates, setEventDates] = useState<Date[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const produtosRef = useRef<HTMLDivElement>(null);
  const businessRef = useRef<HTMLDivElement>(null);
  const produtosTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const businessTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleProdutosMouseEnter = () => {
    if (produtosTimeoutRef.current) clearTimeout(produtosTimeoutRef.current);
    if (businessTimeoutRef.current) clearTimeout(businessTimeoutRef.current);
    setBusinessOpen(false);
    setProdutosOpen(true);
  };

  const handleProdutosMouseLeave = () => {
    produtosTimeoutRef.current = setTimeout(() => {
      setProdutosOpen(false);
    }, 180);
  };

  const handleBusinessMouseEnter = () => {
    if (businessTimeoutRef.current) clearTimeout(businessTimeoutRef.current);
    if (produtosTimeoutRef.current) clearTimeout(produtosTimeoutRef.current);
    setProdutosOpen(false);
    setBusinessOpen(true);
  };

  const handleBusinessMouseLeave = () => {
    businessTimeoutRef.current = setTimeout(() => {
      setBusinessOpen(false);
    }, 180);
  };

  // Load dates of registered events for dot markers
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
      } catch {
        /* noop */
      }
    }
    loadEventDates();
  }, []);

  // Click outside to close submenus
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (businessRef.current && !businessRef.current.contains(event.target as Node)) {
        setBusinessOpen(false);
      }
      if (produtosRef.current && !produtosRef.current.contains(event.target as Node)) {
        setProdutosOpen(false);
      }
    }
    if (businessOpen || produtosOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [businessOpen, produtosOpen]);

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

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchOpen]);

  return (
    <header className="w-full pt-4 pb-2 px-4 lg:px-8 animate-fade-in font-sans relative z-50">
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Main Navbar Card (Pure white rounded bar) */}
        <div className="bg-white rounded-full px-6 py-3.5 flex items-center justify-between shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-100/90 relative z-40">
          {/* Left: NX. Logo */}
          <div className="flex items-center gap-8">
            <button
              onClick={() => onNavigate("dashboard")}
              className="flex items-center outline-none focus:opacity-80 transition-opacity"
              title="Painel Super Admin Nexo"
            >
              <img
                src={logoNxo}
                alt="nx."
                className="h-9 w-auto object-contain"
              />
            </button>
          </div>

          {/* Center: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6">
            <button
              onClick={() => onNavigate("dashboard")}
              className={`text-sm font-semibold transition-colors px-3 py-1.5 rounded-full ${
                currentPage === "dashboard" ? "text-black font-bold" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
              }`}
            >
              home
            </button>

            <button
              onClick={() => onNavigate("clientes")}
              className={`text-sm font-semibold transition-colors px-3 py-1.5 rounded-full ${
                currentPage === "clientes" ? "text-black font-bold" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
              }`}
            >
              clientes
            </button>

            {/* Produtos Direct Button */}
            <button
              onClick={() => onNavigate("produtos")}
              className={`text-sm font-semibold transition-colors px-3 py-1.5 rounded-full ${
                ["produtos", "housemix", "modulos", "subusuarios", "pacotes", "admininfomusic"].includes(currentPage)
                  ? "text-black font-bold"
                  : "text-slate-700 hover:text-black hover:bg-slate-100/70"
              }`}
            >
              produtos
            </button>

            {/* Business Dropdown (Mouse over abrindo para baixo) */}
            <div
              ref={businessRef}
              className="relative"
              onMouseEnter={handleBusinessMouseEnter}
              onMouseLeave={handleBusinessMouseLeave}
            >
              <button
                type="button"
                onClick={() => setBusinessOpen(prev => !prev)}
                className={`text-sm font-semibold flex items-center gap-1 px-3 py-1.5 rounded-full transition-all outline-none ${
                  businessOpen
                    ? "bg-black text-white shadow-sm"
                    : ["financeiro", "chatbot", "propostas"].includes(currentPage)
                    ? "text-black font-bold bg-slate-100"
                    : "text-slate-700 hover:text-black hover:bg-slate-100/70"
                }`}
              >
                <span>business</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${businessOpen ? "rotate-180 opacity-100" : "opacity-60"}`} />
              </button>

              {businessOpen && (
                <div className="absolute top-full left-0 pt-2 z-[9999] animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="bg-[#000000] border border-white/10 rounded-2xl p-1.5 shadow-[0_16px_36px_rgba(0,0,0,0.35)] min-w-[200px] space-y-1">
                    <button
                      onClick={() => { onNavigate("financeiro"); setBusinessOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                        currentPage === "financeiro"
                          ? "text-[#00BFF0] bg-white/15 font-bold"
                          : "text-white/85 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <span>financeiro</span>
                    </button>
                    <button
                      onClick={() => { onNavigate("chatbot"); setBusinessOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                        currentPage === "chatbot"
                          ? "text-[#9FCA1D] bg-white/15 font-bold"
                          : "text-white/85 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <span>chat bott</span>
                    </button>
                    <button
                      onClick={() => { onNavigate("propostas"); setBusinessOpen(false); }}
                      className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors flex items-center justify-between ${
                        currentPage === "propostas"
                          ? "text-[#00BFF0] bg-white/15 font-bold"
                          : "text-white/85 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      <span>orçamento</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Agenda Link (ao lado de business) */}
            <button
              onClick={() => onNavigate("agenda")}
              className={`text-sm font-semibold transition-colors px-3 py-1.5 rounded-full outline-none ${
                currentPage === "agenda" ? "text-black font-bold bg-slate-100" : "text-slate-700 hover:text-black hover:bg-slate-100/70"
              }`}
            >
              agenda
            </button>
          </nav>

          {/* Right: Notifications, Settings, User Avatar */}
          <div className="flex items-center gap-2.5">
            {/* Blue Bell Button */}
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("intercom:open"))}
              className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/60 flex items-center justify-center text-[#0055ff] transition-all shadow-sm"
              title="Notificações e Intercomunicador"
            >
              <Bell className="w-4 h-4 fill-[#0055ff]" />
            </button>

            {/* Settings Gear Button */}
            <button
              onClick={() => onNavigate("configuracoes")}
              className="w-10 h-10 rounded-full bg-slate-50 hover:bg-slate-100 border border-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all shadow-sm"
              title="Configurações da Empresa"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* User Avatar with Logout Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="w-10 h-10 rounded-full bg-[#0055ff] text-white flex items-center justify-center font-bold text-sm shadow-sm overflow-hidden ring-2 ring-white hover:opacity-90 transition-opacity"
                  title={userEmail}
                >
                  <span className="select-none">A</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-2 bg-[#14161a] border-0 rounded-2xl text-white shadow-xl">
                <div className="px-3 py-2 border-b border-white/10">
                  <p className="text-xs font-bold text-white truncate">Super Admin</p>
                  <p className="text-[10px] text-white/50 truncate">{userEmail}</p>
                </div>
                <button
                  onClick={onLogout}
                  className="w-full mt-1 px-3 py-2 text-left text-xs text-red-400 hover:bg-white/5 rounded-xl flex items-center gap-2 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sair do sistema
                </button>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Date Pill & Search Row (Matches screenshot under navbar) */}
        <div className="flex items-center gap-2 px-1">
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="bg-white hover:bg-slate-50 rounded-full px-4 py-2 flex items-center gap-2.5 border border-slate-200/60 shadow-[0_2px_8px_rgba(0,0,0,0.02)] text-xs text-slate-700 font-medium select-none cursor-pointer transition-all active:scale-95"
                title="Abrir calendário"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
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
                    <p className="text-[10px] text-slate-400">Eventos em azul</p>
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
                  classNames={{
                    months: "w-full",
                    month: "w-full space-y-2",
                    caption: "flex justify-between pt-0 pb-1 relative items-center px-1 text-slate-800 font-bold text-xs capitalize",
                    caption_label: "text-xs font-bold capitalize text-slate-800",
                    nav: "flex items-center gap-1",
                    nav_button: "h-6 w-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 border-0 flex items-center justify-center transition-colors",
                    table: "w-full border-collapse",
                    head_row: "flex justify-between w-full mb-1",
                    head_cell: "text-slate-400 font-semibold text-[10px] w-8 text-center uppercase",
                    row: "flex justify-between w-full mt-1",
                    cell: "h-8 w-8 text-center text-xs p-0 relative focus-within:relative focus-within:z-20",
                    day: "h-8 w-8 rounded-full p-0 font-medium text-xs hover:bg-slate-100 text-slate-700 transition-colors flex items-center justify-center",
                    day_today: "bg-slate-200 text-slate-900 font-bold",
                    day_selected: "bg-[#0055ff] text-white font-bold hover:bg-[#0047d4]",
                  }}
                />
              </div>

              <style>{`
                .superadmin-mini-cal .has-event-day {
                  position: relative;
                  font-weight: 700;
                }
                .superadmin-mini-cal .has-event-day::after {
                  content: '';
                  position: absolute;
                  bottom: 2px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 4px;
                  height: 4px;
                  border-radius: 50%;
                  background-color: #0055ff;
                }
              `}</style>
            </PopoverContent>
          </Popover>

          <div className="relative flex items-center">
            {searchOpen ? (
              <div className="flex items-center bg-white rounded-full pl-3 pr-2 py-1 border border-slate-200 shadow-sm animate-in fade-in zoom-in-95">
                <Search className="w-3.5 h-3.5 text-slate-400 mr-2" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={e => onSearchChange?.(e.target.value)}
                  placeholder="Buscar clientes, módulos, serviços..."
                  className="h-7 text-xs bg-transparent outline-none w-56 text-slate-800 placeholder-slate-400"
                  onBlur={() => { if (!searchQuery) setSearchOpen(false); }}
                />
              </div>
            ) : (
              <button
                onClick={() => setSearchOpen(true)}
                className="w-8 h-8 rounded-full bg-white hover:bg-slate-50 border border-slate-200/60 flex items-center justify-center text-slate-400 hover:text-slate-700 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
                title="Buscar"
              >
                <Search className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
