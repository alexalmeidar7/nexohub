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
    <header className="w-full pt-4 pb-2 px-4 lg:px-8 animate-fade-in font-sans">
      <div className="max-w-[1600px] mx-auto space-y-4">
        {/* Main Navbar Card (Pure white rounded bar) */}
        <div className="bg-white rounded-full px-6 py-3.5 flex items-center justify-between shadow-[0_4px_24px_rgba(0,0,0,0.04)] border border-slate-100/90">
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

          {/* Center: Navigation Links + Black Business Pill */}
          <nav className="hidden md:flex items-center gap-7">
            <button
              onClick={() => onNavigate("dashboard")}
              className={`text-sm font-semibold transition-colors ${
                currentPage === "dashboard" ? "text-black font-bold" : "text-slate-700 hover:text-black"
              }`}
            >
              home
            </button>

            <button
              onClick={() => onNavigate("clientes")}
              className={`text-sm font-semibold transition-colors ${
                currentPage === "clientes" ? "text-black font-bold" : "text-slate-700 hover:text-black"
              }`}
            >
              clientes
            </button>

            {/* Produtos Menu Dropdown / Inline Pill */}
            <div ref={produtosRef} className="relative">
              {!produtosOpen ? (
                <button
                  onClick={() => {
                    setProdutosOpen(true);
                    setBusinessOpen(false);
                  }}
                  className={`text-sm font-semibold flex items-center gap-1 transition-colors outline-none ${
                    ["modulos", "subusuarios", "pacotes", "admininfomusic"].includes(currentPage)
                      ? "text-black font-bold"
                      : "text-slate-700 hover:text-black"
                  }`}
                  title="Clique para abrir o submenu produtos"
                >
                  <span>produtos</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </button>
              ) : (
                <div className="bg-[#000000] rounded-full px-5 py-2 flex items-center gap-4 text-white shadow-md animate-in fade-in zoom-in-95 duration-200">
                  <button
                    onClick={() => setProdutosOpen(false)}
                    className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1 hover:opacity-80 transition-opacity"
                    title="Fechar submenu produtos"
                  >
                    <span>produtos</span>
                    <ChevronDown className="w-3.5 h-3.5 rotate-180 opacity-70" />
                  </button>
                  <button
                    onClick={() => { onNavigate("modulos"); setProdutosOpen(false); }}
                    className={`text-xs transition-colors whitespace-nowrap ${
                      currentPage === "modulos" ? "text-[#00BFF0] font-bold" : "text-white/80 hover:text-white"
                    }`}
                  >
                    módulos rádio
                  </button>
                  <button
                    onClick={() => { onNavigate("subusuarios"); setProdutosOpen(false); }}
                    className={`text-xs transition-colors whitespace-nowrap ${
                      currentPage === "subusuarios" ? "text-[#00BFF0] font-bold" : "text-white/80 hover:text-white"
                    }`}
                  >
                    subusuários
                  </button>
                  <button
                    onClick={() => { onNavigate("pacotes"); setProdutosOpen(false); }}
                    className={`text-xs transition-colors whitespace-nowrap ${
                      currentPage === "pacotes" ? "text-[#00BFF0] font-bold" : "text-white/80 hover:text-white"
                    }`}
                  >
                    pacotes
                  </button>
                  <button
                    onClick={() => { onNavigate("admininfomusic"); setProdutosOpen(false); }}
                    className={`text-xs transition-colors whitespace-nowrap ${
                      currentPage === "admininfomusic" ? "text-[#00BFF0] font-bold" : "text-white/80 hover:text-white"
                    }`}
                  >
                    info music
                  </button>
                </div>
              )}
            </div>

            {/* Business Pill (fechado é texto simples, abre submenu em pílula preta ao clicar) */}
            <div ref={businessRef} className="relative">
              {!businessOpen ? (
                <button
                  onClick={() => {
                    setBusinessOpen(true);
                    setProdutosOpen(false);
                  }}
                  className={`text-sm font-semibold flex items-center gap-1 transition-colors outline-none ${
                    ["financeiro", "chatbot", "propostas"].includes(currentPage)
                      ? "text-black font-bold"
                      : "text-slate-700 hover:text-black"
                  }`}
                  title="Clique para abrir o submenu business"
                >
                  <span>business</span>
                  <ChevronDown className="w-3.5 h-3.5 opacity-60" />
                </button>
              ) : (
                <div className="bg-[#000000] rounded-full px-5 py-2 flex items-center gap-4 text-white shadow-md animate-in fade-in zoom-in-95 duration-200">
                  <button
                    onClick={() => setBusinessOpen(false)}
                    className="font-extrabold text-sm tracking-tight text-white flex items-center gap-1 hover:opacity-80 transition-opacity"
                    title="Fechar submenu business"
                  >
                    <span>business</span>
                    <ChevronDown className="w-3.5 h-3.5 rotate-180 opacity-70" />
                  </button>
                  <button
                    onClick={() => { onNavigate("financeiro"); setBusinessOpen(false); }}
                    className={`text-xs transition-colors whitespace-nowrap ${
                      currentPage === "financeiro" ? "text-[#00BFF0] font-bold" : "text-white/80 hover:text-white"
                    }`}
                  >
                    financeiro
                  </button>
                  <button
                    onClick={() => { onNavigate("financeiro"); setBusinessOpen(false); }}
                    className="text-xs text-white/80 hover:text-white transition-colors whitespace-nowrap"
                  >
                    service packs
                  </button>
                  <button
                    onClick={() => { onNavigate("chatbot"); setBusinessOpen(false); }}
                    className={`text-xs transition-colors whitespace-nowrap ${
                      currentPage === "chatbot" ? "text-[#9FCA1D] font-bold" : "text-white/80 hover:text-white"
                    }`}
                  >
                    chat bott
                  </button>
                  <button
                    onClick={() => { onNavigate("propostas"); setBusinessOpen(false); }}
                    className={`text-xs transition-colors whitespace-nowrap ${
                      currentPage === "propostas" ? "text-[#00BFF0] font-bold" : "text-white/80 hover:text-white"
                    }`}
                  >
                    orçamento
                  </button>
                </div>
              )}
            </div>

            {/* Agenda Link (ao lado de business) */}
            <button
              onClick={() => onNavigate("agenda")}
              className={`text-sm font-semibold transition-colors outline-none ${
                currentPage === "agenda" ? "text-black font-bold" : "text-slate-700 hover:text-black"
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
              className="w-auto p-4 bg-white border border-slate-200/80 rounded-3xl shadow-xl text-slate-800"
            >
              <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100 gap-4">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-[#0055ff]/10 flex items-center justify-center text-[#0055ff]">
                    <CalendarIcon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 leading-tight">Calendário</h4>
                    <p className="text-[10px] text-slate-400">Dias com eventos marcados em azul</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setCalendarOpen(false);
                    onNavigate("agenda");
                  }}
                  className="text-xs font-semibold text-[#0055ff] hover:underline flex items-center gap-1 shrink-0"
                >
                  Abrir Agenda <ArrowRight className="w-3 h-3" />
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

              <style>{`
                .superadmin-mini-cal .has-event-day {
                  position: relative;
                  font-weight: 700;
                }
                .superadmin-mini-cal .has-event-day::after {
                  content: '';
                  position: absolute;
                  bottom: 3px;
                  left: 50%;
                  transform: translateX(-50%);
                  width: 5px;
                  height: 5px;
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
