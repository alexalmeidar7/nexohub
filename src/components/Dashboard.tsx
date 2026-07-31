import { useState, useEffect, useRef, useCallback, lazy, Suspense } from "react";
import type React from "react";

import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Home, Sun, FileText, Mic2, PlaySquare, Music, CalendarDays, Settings, LogOut, Loader2, ShoppingBag, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, MessageSquareQuote, Tag, Image, ExternalLink, MonitorPlay, Heart, ShoppingCart, Film, Users, Newspaper, CloudSun, Wrench, Scissors, Menu, X, Monitor, Radio, Swords, HelpCircle, Star, Globe, Play, Pause, Gift, Siren, Layers, Building2, Bot, Smartphone, Palette } from "lucide-react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import seloNexohub from "@/assets/selo-nexohub.png";
import logoMenu from "@/assets/logo-menu.png";
import logoFooter from "@/assets/logo-footer.png";
import { HouseMixIcon } from "@/components/ProductIcons";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BackButton } from "@/components/ui/back-button";
import { useAuth } from "@/hooks/useAuth";
import { useLayoutColors, defaultLayoutColors } from "@/hooks/useLayoutColors";
import { useGlobalMusicSync } from "@/hooks/useGlobalMusicSync";
import { AnimatedFlyout } from "@/components/AnimatedFlyout";
import { resolveEffectiveOnAir, getZonedNow } from "@/lib/onAirResolver";


// Lazy-load all tab pages for faster initial render
const ApresentadorForm = lazy(() => import("./ApresentadorForm"));
const OuvintesPage = lazy(() => import("./OuvintesPage"));
const SorteiosPage = lazy(() => import("./SorteiosPage"));
const BlitzPage = lazy(() => import("./BlitzPage"));
const ProgramaForm = lazy(() => import("./ProgramaForm"));
const PrevisaoTempo = lazy(() => import("./PrevisaoTempo"));
const RoteiroPrograma = lazy(() => import("./RoteiroPrograma"));
const WeatherWidget = lazy(() => import("./WeatherWidget"));
const OnAirWidget = lazy(() => import("./OnAirWidget"));
const UpcomingEventsWidget = lazy(() => import("./UpcomingEventsWidget"));

const MusicaNoAr = lazy(() => import("./MusicaNoAr"));
const AgendaPage = lazy(() => import("./AgendaPage"));
const MusicWidget = lazy(() => import("./MusicWidget"));
const XmlLinkRow = lazy(() => import("./XmlLinkRow"));
const ConfiguracoesPage = lazy(() => import("./ConfiguracoesPage"));
import { getEmpresaConfig } from "./ConfiguracoesPage";
import { getMusicData } from "@/lib/musicData";
const TestemunhaisPage = lazy(() => import("./TestemunhaisPage"));
const PromocoesPage = lazy(() => import("./PromocoesPage"));
const LogosPatrocinadoresPage = lazy(() => import("./LogosPatrocinadoresPage"));
const VideoPlayer = lazy(() => import("./VideoPlayer"));
const TopLikedSongs = lazy(() => import("./TopLikedSongs"));
const MusicasCurtidasPage = lazy(() => import("./MusicasCurtidasPage"));
const ShoppingPage = lazy(() => import("./ShoppingPage"));
const PreRollPage = lazy(() => import("./AdsPage"));
const CortesVideoPage = lazy(() => import("./CortesVideoPage"));
const VmixPage = lazy(() => import("./VmixPage"));
const TeleprompterPage = lazy(() => import("./TeleprompterPage"));
const CustomizableDashboard = lazy(() => import("./CustomizableDashboard"));
const AdminClientsDashboard = lazy(() => import("./AdminClientsDashboard"));
const ChatbotHome = lazy(() => import("./ChatbotHome"));

const PropostasPage = lazy(() => import("./PropostasPage"));
const ConfigTelaPromoPage = lazy(() => import("./ConfigTelaPromoPage"));
const CenariosPage = lazy(() => import("./CenariosPage"));
const MessageNotification = lazy(() => import("./MessageNotification"));
const FansPage = lazy(() => import("./FansPage"));
const BroadcastPage = lazy(() => import("./BroadcastPage"));
const BatalhaMusicalPage = lazy(() => import("./BatalhaMusicalPage"));
const EnquetePage = lazy(() => import("./EnquetePage"));
const QuizPage = lazy(() => import("./QuizPage"));
const SitePage = lazy(() => import("./site/SitePage"));
const ClientesPage = lazy(() => import("./ClientesPage"));
const ModulosPage = lazy(() => import("./ModulosPage"));
const SubUsuariosPage = lazy(() => import("./SubUsuariosPage"));
const PacotesPage = lazy(() => import("./PacotesPage"));
const IntercomWidget = lazy(() => import("./IntercomWidget"));
const BlitzLocutorPopup = lazy(() => import("./BlitzLocutorPopup"));

import DashboardSkeleton from "./skeletons/DashboardSkeleton";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import BotsStatusBox from "./BotsStatusBox";
import InlineNotification from "./InlineNotification";
import nexoCantoLogo from "@/assets/nexo_canto.png";

type Page = "dashboard" | "previsao" | "noticias" | "apresentadores" | "ouvintes" | "programas" | "musica" | "agenda" | "configuracoes" | "testemunhais" | "promocoes" | "logos" | "curtidas" | "shopping" | "preroll" | "cortevideo" | "playerconfig" | "vmix" | "propostas" | "tp" | "cenario" | "fans" | "configtelapromo" | "broadcast" | "batalha" | "enquete" | "quiz" | "site" | "sorteios" | "blitz" | "clientes" | "modulos" | "subusuarios" | "pacotes";

// Sidebar structured menu
interface MenuChild {
  icon: typeof Home;
  label: string;
  page: Page;
  separator?: boolean;
  permKey?: string;
  children?: MenuChild[];
}
interface MenuItem {
  icon: React.ComponentType<{ size?: string | number; className?: string; style?: React.CSSProperties }>;
  label: string;
  page?: Page;
  children?: MenuChild[];
  pillMode?: string;
}




const sidebarMenu: MenuItem[] = [
  { icon: Home, label: "home", page: "dashboard" },
  {
    icon: Users, label: "cadastros", children: [
      { icon: Mic2, label: "participantes", page: "apresentadores" },
      { icon: Users, label: "ouvintes", page: "ouvintes" },
      { icon: PlaySquare, label: "programas", page: "programas" },
      { icon: CloudSun, label: "cidade tempo", page: "previsao" },
    ]
  },
  { icon: Bot, label: "atendimento", page: "dashboard", pillMode: "Chatbot" },
  { icon: Gift, label: "sorteio", page: "sorteios" },
  { icon: Siren, label: "blitz", page: "blitz" },
  { icon: FileText, label: "roteiro de programa", page: "noticias" },
  { icon: Music, label: "música no ar", page: "musica" },
  { icon: CalendarDays, label: "agenda", page: "agenda" },
  {
    icon: Globe, label: "site", children: [
      { icon: Globe, label: "site", page: "site" },
      { icon: MonitorPlay, label: "player", page: undefined as unknown as Page, children: [
        { icon: Settings, label: "configurações", page: "playerconfig" },
        { icon: ExternalLink, label: "módulo player", page: undefined as unknown as Page },
      ] },
    ]
  },
  {
    icon: ShoppingBag, label: "comercial", children: [
      { icon: Film, label: "ADS", page: "preroll" },
      { icon: MessageSquareQuote, label: "citações", page: "testemunhais" },
      { icon: Tag, label: "promoções", page: "promocoes" },
      { icon: Image, label: "logos", page: "logos" },
      { icon: ExternalLink, label: "módulo locutor", page: undefined as unknown as Page, permKey: "telapromo", children: [
        { icon: Settings, label: "config módulo locutor", page: "configtelapromo" },
      ] },
      { icon: ShoppingCart, label: "shopping", page: "shopping" },
    ]
  },
  {
    icon: Monitor, label: "vmix", children: [
      { icon: Monitor, label: "vmix control", page: undefined as unknown as Page },
      { icon: Radio, label: "broadcast", page: "broadcast" },
      { icon: MonitorPlay, label: "cenários", page: "cenario" },
      { icon: Swords, label: "batalha musical", page: "batalha" },
      { icon: HelpCircle, label: "enquete", page: "enquete" },
      { icon: HelpCircle, label: "quiz", page: "quiz" },
    ]
  },
  {
    icon: Wrench, label: "ferramentas", children: [
      { icon: Scissors, label: "corte de vídeo", page: "cortevideo" },
      { icon: ExternalLink, label: "abrir TP externo", page: undefined as unknown as Page },
    ]
  },
  { icon: Building2, label: "business", page: "dashboard", pillMode: "Business" },
  { icon: Smartphone, label: "app", page: "dashboard", pillMode: "TV App" },
  { icon: Palette, label: "social design", page: "dashboard", pillMode: "Social Design" },
];


// Menu exclusivo do super admin: apenas Cadastro > Clientes e o agrupador MODULOS
const adminSidebarMenu: MenuItem[] = [
  { icon: Home, label: "home", page: "dashboard" },
  {
    icon: Users, label: "cadastros", children: [
      { icon: Building2, label: "clientes", page: "clientes" },
      { icon: Users, label: "subusuários", page: "subusuarios" },
      { icon: Layers, label: "pacotes", page: "pacotes" },
    ]
  },
  { icon: Layers, label: "modulos", page: "modulos" },
  { icon: Building2, label: "business", page: "dashboard", pillMode: "Business" },
];


// Conteúdo da página MODULOS (boxes principais + subitens)
export const adminModulosGroups: MenuItem[] = [
  {
    icon: Users, label: "cadastros", children: [
      { icon: Mic2, label: "participantes", page: "apresentadores" },
      { icon: Users, label: "ouvintes", page: "ouvintes" },
      { icon: PlaySquare, label: "programas", page: "programas" },
      { icon: CloudSun, label: "cidade tempo", page: "previsao" },
    ]
  },
  { icon: Gift, label: "sorteios", page: "sorteios" },
  { icon: Siren, label: "blitz", page: "blitz" },
  { icon: FileText, label: "roteiro de programa", page: "noticias" },
  { icon: Music, label: "música no ar", page: "musica" },
  { icon: CalendarDays, label: "agenda", page: "agenda" },
  {
    icon: Globe, label: "site", children: [
      { icon: Globe, label: "site", page: "site" },
      { icon: MonitorPlay, label: "player", page: undefined as unknown as Page, children: [
        { icon: Settings, label: "configurações", page: "playerconfig" },
        { icon: ExternalLink, label: "módulo player", page: undefined as unknown as Page },
      ] },
    ]
  },
  {
    icon: ShoppingBag, label: "comercial", children: [
      { icon: Film, label: "ADS", page: "preroll" },
      { icon: MessageSquareQuote, label: "citações", page: "testemunhais" },
      { icon: Tag, label: "promoções", page: "promocoes" },
      { icon: Image, label: "logos", page: "logos" },
    ]
  },
  {
    icon: Mic2, label: "locutor", children: [
      { icon: Settings, label: "config módulo locutor", page: "configtelapromo" },
      { icon: ShoppingCart, label: "shopping", page: "shopping" },
    ]
  },
  {
    icon: Monitor, label: "vmix", children: [
      { icon: Monitor, label: "vmix control", page: undefined as unknown as Page },
      { icon: Radio, label: "broadcast", page: "broadcast" },
      { icon: MonitorPlay, label: "cenários", page: "cenario" },
      { icon: Swords, label: "batalha musical", page: "batalha" },
      { icon: HelpCircle, label: "enquete", page: "enquete" },
      { icon: HelpCircle, label: "quiz", page: "quiz" },
    ]
  },
  {
    icon: Wrench, label: "ferramentas", children: [
      { icon: Scissors, label: "corte de vídeo", page: "cortevideo" },
      { icon: ExternalLink, label: "abrir TP externo", page: undefined as unknown as Page },
    ]
  },
  {
    icon: Bot, label: "atendimento", children: [
      { icon: Bot, label: "chatbot", page: undefined as unknown as Page },
    ]
  },
  { icon: Building2, label: "business", page: undefined as unknown as Page },
  { icon: Smartphone, label: "app", page: undefined as unknown as Page },
  { icon: Palette, label: "social media", page: undefined as unknown as Page },
];

// Conteúdo da página SUBUSUÁRIOS (inclui cadastros, que não aparece em MODULOS)
export const subUsuarioModulosGroups: MenuItem[] = sidebarMenu
  .filter(i => i.label !== "home" && i.label !== "modulos")
  .map(i => ({
    icon: i.icon,
    label: i.label,
    page: (i.page ?? (undefined as unknown as Page)),
    children: i.children,
  }) as MenuItem);



// Map menu items to module keys for plan filtering
const menuToModuleKey: Record<string, string> = {
  "cadastros": "cadastros",
  "previsão do tempo": "previsao",
  "roteiro de programa": "noticias",
  "música no ar": "musica",
  "agenda": "agenda",
  "player": "player",
  "comercial": "comercial",
  "vmix": "vmix",
  "ferramentas": "ferramentas",
};

// ---- Plan (pacote) based menu visibility -------------------------------
const moduleSlug = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");

// Alguns itens do menu lateral têm rótulo diferente do cadastrado em MÓDULOS.
// O alias garante que o pacote (plano) continue controlando a visibilidade.
const MODULE_KEY_ALIASES: Record<string, string> = {
  socialdesign: "socialmedia",
};

const moduleKeyOfNode = (n: { label: string; page?: unknown }) => {
  const key = (typeof n.page === "string" && n.page && n.page !== "dashboard") ? n.page : moduleSlug(n.label);
  return MODULE_KEY_ALIASES[key] ?? key;
};


const collectModuleKeys = (items: { label: string; page?: unknown; children?: any[] }[]): string[] =>
  items.flatMap(i => [moduleKeyOfNode(i), ...collectModuleKeys(i.children ?? [])]);

// Universe of keys that packages (pacotes) can control. Keys outside this set
// are never blocked (avoids hiding menus that plans don't know about).
const KNOWN_MODULE_KEYS = new Set(collectModuleKeys(adminModulosGroups as any));

const pageTitle: Record<Page, string> = {
  dashboard: "Home",
  previsao: "Previsão do Tempo",
  noticias: "Roteiro de Programa",
  apresentadores: "Cadastro de Participantes",
  ouvintes: "Cadastro de Ouvintes",
  programas: "Cadastro de Programas",
  musica: "Música no Ar",
  agenda: "Agenda",
  curtidas: "Músicas Curtidas",
  configuracoes: "Configurações",
  testemunhais: "Comercial — Citações",
  promocoes: "Comercial — Promoções",
  logos: "Comercial — Logos Patrocinadores",
  shopping: "Comercial — Shopping",
  preroll: "ADS",
  propostas: "Comercial — Propostas Comerciais",
  cortevideo: "Ferramentas — Cortes de Vídeo",
  tp: "Ferramentas — TP",
  playerconfig: "Player — Configurações",
  vmix: "vMix — Controle de Transmissão",
  cenario: "vMix — Cenários",
  broadcast: "vMix — Broadcast",
  fans: "Player — Fãs",
  configtelapromo: "Comercial — Config Tela Promo",
  batalha: "vMix — Batalha Musical",
  enquete: "vMix — Enquete",
  quiz: "vMix — Quiz",
  site: "Site",
  sorteios: "Sorteios",
  blitz: "Blitz Promocionais",
  clientes: "Cadastro de Clientes",
  modulos: "Módulos",
  subusuarios: "Subusuários",
  pacotes: "Pacotes",
};

interface DashboardProps {
  onLogout?: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";
  const layoutColors = useLayoutColors();
  const [currentPage, setCurrentPageState] = useState<Page>("dashboard");
  const setCurrentPage = useCallback((next: React.SetStateAction<Page>) => {
    setCurrentPageState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: Page) => Page)(prev) : next;
      if (resolved !== prev) {
        try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
      }
      return resolved;
    });
  }, []);

  useEffect(() => {
    (window as any).setCurrentPageGlobal = setCurrentPage;
  }, [setCurrentPage]);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [selectedHeaderPill, setSelectedHeaderPill] = useState<string>(() => {
    try { return localStorage.getItem("nexohub_home_pill") || "nexohub"; } catch { return "nexohub"; }
  });
  
  useEffect(() => {
    try { localStorage.setItem("nexohub_home_pill", selectedHeaderPill); } catch {}
  }, [selectedHeaderPill]);
  // Super admin abre por padrão o painel Business
  useEffect(() => {
    if (!isAdmin) return;
    try {
      if (localStorage.getItem("nexohub_admin_pill_init") === "1") return;
      localStorage.setItem("nexohub_admin_pill_init", "1");
    } catch { /* noop */ }
    setSelectedHeaderPill("Business");
  }, [isAdmin]);
  // Animação de entrada/saída ao trocar de modo (nexohub <-> Chatbot ...)
  const [displayedPill, setDisplayedPill] = useState<string>(selectedHeaderPill);
  const [pillPhase, setPillPhase] = useState<"in" | "out">("in");
  useEffect(() => {
    if (selectedHeaderPill === displayedPill) return;
    setPillPhase("out");
    const t = setTimeout(() => {
      setDisplayedPill(selectedHeaderPill);
      setPillPhase("in");
    }, 260);
    return () => clearTimeout(t);
  }, [selectedHeaderPill, displayedPill]);
  const pillAnimClass = pillPhase === "in" ? "animate-fade-in" : "animate-fade-out";


  const [hoveredMenu, setHoveredMenu] = useState<string | null>(null);
  const menuLeaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearMenuLeaveTimer = useCallback(() => {
    if (menuLeaveTimer.current) {
      clearTimeout(menuLeaveTimer.current);
      menuLeaveTimer.current = null;
    }
  }, []);
  const scheduleCloseMenu = useCallback(() => {
    clearMenuLeaveTimer();
    menuLeaveTimer.current = setTimeout(() => setHoveredMenu(null), 450);
  }, [clearMenuLeaveTimer]);
  const [noArCollapsed, setNoArCollapsed] = useState(false);
  const [empresa, setEmpresa] = useState<import("./ConfiguracoesPage").EmpresaConfig>({} as any);
  const [empresaTimezone, setEmpresaTimezone] = useState<string | null>(null);
  const [enabledModules, setEnabledModules] = useState<Set<string> | null>(null);
  const [planModules, setPlanModules] = useState<Set<string> | null>(null);
  const [subUserModules, setSubUserModules] = useState<Set<string> | null>(null); // null = not a sub-user
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null); // parent_user_id for sub-users
  const [parentEmail, setParentEmail] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [onAirThumb, setOnAirThumb] = useState<string | null>(null);
  const [onAirLocutorFoto, setOnAirLocutorFoto] = useState<string | null>(null);
  const [nextProgram, setNextProgram] = useState<{ foto: string | null; apresentador: string; programa: string; inicio: string; fim: string } | null>(null);
  const [showNext, setShowNext] = useState(false);
  const [onAirTimes, setOnAirTimes] = useState<{ inicio: string; fim: string } | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  // Global player state (mirrored from CustomizableDashboard via window events)
  const [playerState, setPlayerState] = useState<{ isPlaying: boolean; isLoading: boolean; hasChannel: boolean; channelName: string }>({ isPlaying: false, isLoading: false, hasChannel: false, channelName: "" });
  useEffect(() => {
    const onState = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d) setPlayerState(d);
    };
    window.addEventListener("player:state", onState);
    return () => window.removeEventListener("player:state", onState);
  }, []);
  useEffect(() => {
    const iv = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);
  const prevThumbRef = useRef<string | null>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [contentScrollProgress, setContentScrollProgress] = useState(0);
  const [showContentScrollIndicator, setShowContentScrollIndicator] = useState(false);

  useEffect(() => () => clearMenuLeaveTimer(), [clearMenuLeaveTimer]);

  // Trava scroll do body enquanto o menu mobile estiver aberto
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mobileMenuOpen]);


  // Fetch on-air presenter photo
  useEffect(() => {
    const uid = effectiveUserId || user?.id;
    if (!uid) return;
    let cancelled = false;
    const DIAS_MAP: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
    const load = async () => {
      const [progRes, empRes] = await Promise.all([
        supabase
          .from("programas")
          .select("id, nome, apresentador_id, dias_semana, horario_inicio, horario_fim")
          .eq("user_id", uid)
          .eq("ativo", true)
          .ilike("estudio", "%fm%"),
        supabase.from("empresa_config").select("timezone").eq("user_id", uid).maybeSingle(),
      ]);
      const data = progRes.data;
      const tz: string | null = (empRes.data as any)?.timezone || null;
      if (cancelled || !data) return;
      const now = new Date();

      // Pré-carrega o próximo programa 60s antes da virada, evitando "flash sem programa"
      const { current } = resolveEffectiveOnAir(data as any[], now, tz);

      // Próximo programa (após o current efetivo) — usa dia/hora no fuso da emissora
      const { weekday, hhmm: hora } = getZonedNow(tz, now);
      const dia = DIAS_MAP[weekday];
      const todays = (data as any[]).filter((p) => (p.dias_semana || []).includes(dia));
      const afterHora = current?.horario_fim || hora;
      let next: any = todays
        .filter((p) => p.horario_inicio >= afterHora && (!current || p.id !== current.id))
        .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio))[0];
      if (!next) {
        for (let i = 1; i <= 7; i++) {
          const d = DIAS_MAP[(weekday + i) % 7];
          const arr = (data as any[])
            .filter((p) => (p.dias_semana || []).includes(d))
            .sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
          if (arr[0]) { next = arr[0]; break; }
        }
      }

      if (!current) { setOnAirLocutorFoto(null); setOnAirTimes(null); }
      else {
        setOnAirTimes({ inicio: current.horario_inicio, fim: current.horario_fim });
        if (current.apresentador_id) {
          const { data: ap } = await supabase.from("apresentadores").select("foto").eq("id", current.apresentador_id).maybeSingle();
          if (!cancelled) setOnAirLocutorFoto((ap as any)?.foto || null);
        } else setOnAirLocutorFoto(null);
      }

      if (next) {
        let apNome = "";
        let apFoto: string | null = null;
        if (next.apresentador_id) {
          const { data: ap } = await supabase.from("apresentadores").select("nome, foto").eq("id", next.apresentador_id).maybeSingle();
          apNome = (ap as any)?.nome || "";
          apFoto = (ap as any)?.foto || null;
        }
        if (!cancelled) setNextProgram({ foto: apFoto, apresentador: apNome, programa: next.nome, inicio: next.horario_inicio, fim: next.horario_fim });
      } else if (!cancelled) setNextProgram(null);
    };
    load();
    // Poll a cada 10s para pegar a virada com precisão
    const iv = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [user, effectiveUserId]);

  // Helper: find current on-air program and fetch only its thumb
  const findCurrentOnAirThumb = useCallback(async (overrideUserId?: string) => {
    const uid = overrideUserId || effectiveUserId || user?.id;
    if (!uid) return null;
    const [{ data }, { data: emp }] = await Promise.all([
      supabase
        .from("programas")
        .select("id, dias_semana, horario_inicio, horario_fim")
        .eq("user_id", uid)
        .eq("ativo", true)
        .ilike("estudio", "%fm%"),
      supabase.from("empresa_config").select("timezone").eq("user_id", uid).maybeSingle(),
    ]);
    if (!data) return null;

    // Usa o mesmo resolver com pré-carga do próximo na última minutagem, no fuso da emissora
    const { current } = resolveEffectiveOnAir(data as any[], new Date(), (emp as any)?.timezone || null);
    if (!current) return null;

    const { data: thumbData } = await supabase
      .from("programas")
      .select("selo")
      .eq("id", (current as any).id)
      .maybeSingle();
    if ((thumbData as any)?.selo) return (thumbData as any).selo;
    return null;
  }, [user, effectiveUserId]);

  const updateContentScrollIndicator = useCallback(() => {
    const el = contentScrollRef.current;

    if (!el || currentPage === "dashboard") {
      setShowContentScrollIndicator(false);
      setContentScrollProgress(0);
      return;
    }

    const maxScroll = Math.max(el.scrollHeight - el.clientHeight, 0);

    if (maxScroll <= 4) {
      setShowContentScrollIndicator(false);
      setContentScrollProgress(0);
      return;
    }

    setShowContentScrollIndicator(true);
    setContentScrollProgress(Math.min(Math.max(el.scrollTop / maxScroll, 0), 1));
  }, [currentPage]);

  useEffect(() => {
    const el = contentScrollRef.current;
    if (!el) return;

    let frame = 0;
    const syncIndicator = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(updateContentScrollIndicator);
    };

    syncIndicator();

    el.addEventListener("scroll", syncIndicator, { passive: true });
    window.addEventListener("resize", syncIndicator);

    const resizeObserver = new ResizeObserver(syncIndicator);
    resizeObserver.observe(el);
    if (el.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(el.firstElementChild);
    }

    const mutationObserver = new MutationObserver(syncIndicator);
    mutationObserver.observe(el, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", syncIndicator);
      window.removeEventListener("resize", syncIndicator);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [currentPage, updateContentScrollIndicator]);

  // Single batched initial load — all queries in parallel (NO thumb in batch)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const loadAll = async () => {
      const [modulesRes, empresaRes, subUserRes] = await Promise.all([
        supabase.from("client_modules").select("module_key, enabled").eq("user_id", user.id),
        supabase.from("empresa_config").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("sub_users").select("allowed_modules, parent_user_id, ativo").eq("auth_user_id", user.id).maybeSingle(),
      ]);

      if (cancelled) return;

      // Check if this user is a sub-user
      if (subUserRes.data && subUserRes.data.ativo) {
        const parentId = subUserRes.data.parent_user_id;
        setSubUserModules(new Set(subUserRes.data.allowed_modules || []));
        setEffectiveUserId(parentId);
        // For sub-users, load the PARENT's modules and empresa config
        const [parentModulesRes, parentEmpresaRes, parentProfileRes] = await Promise.all([
          supabase.from("client_modules").select("module_key, enabled").eq("user_id", parentId),
          supabase.from("empresa_config").select("*").eq("user_id", parentId).maybeSingle(),
          supabase.from("profiles").select("email").eq("user_id", parentId).maybeSingle(),
        ]);
        if (cancelled) return;
        if (parentProfileRes.data?.email) setParentEmail(parentProfileRes.data.email);
        if (parentModulesRes.data && parentModulesRes.data.length > 0) {
          setEnabledModules(new Set(parentModulesRes.data.filter((m: any) => m.enabled).map((m: any) => m.module_key)));
        }
        const pd = parentEmpresaRes.data;
        if (pd) {
          const parentCfg = {
            nome: pd.nome || "", logo: pd.logo || "", backgroundUrl: pd.background_url || "",
            endereco: pd.endereco || "", telefoneComercial: pd.telefone_comercial || "",
            telefoneParticipacao: pd.telefone_participacao || "", site: pd.site || "",
            instagram: pd.instagram || "", facebook: pd.facebook || "", youtube: pd.youtube || "",
            plano: pd.plano || "",
          };
          setEmpresa(parentCfg);
          setEmpresaTimezone((pd as any).timezone || null);
          if (parentCfg.plano) {
            supabase.from("planos").select("enabled_modules").eq("name", parentCfg.plano).maybeSingle().then(({ data }) => {
              if (!cancelled && data?.enabled_modules) setPlanModules(new Set(data.enabled_modules));
            });
          }
          setInitialLoading(false);

          // Fetch thumb for sub-user using parent's data
          const thumb = await findCurrentOnAirThumb(parentId);
          if (!cancelled) {
            const finalThumb = thumb || parentCfg.backgroundUrl || null;
            prevThumbRef.current = finalThumb;
            setOnAirThumb(finalThumb);
          }
          return;
        }
      }

      // Modules
      if (modulesRes.data && modulesRes.data.length > 0) {
        setEnabledModules(new Set(modulesRes.data.filter((m: any) => m.enabled).map((m: any) => m.module_key)));
      }

      // Empresa config
      const d = empresaRes.data;
      const cfg = d ? {
        nome: d.nome || "", logo: d.logo || "", backgroundUrl: d.background_url || "",
        endereco: d.endereco || "", telefoneComercial: d.telefone_comercial || "",
        telefoneParticipacao: d.telefone_participacao || "", site: d.site || "",
        instagram: d.instagram || "", facebook: d.facebook || "", youtube: d.youtube || "",
        plano: d.plano || "",
      } : ({} as any);
      setEmpresa(cfg);
      setEmpresaTimezone((d as any)?.timezone || null);

      // Plan modules — fire and forget
      if (cfg.plano) {
        supabase.from("planos").select("enabled_modules").eq("name", cfg.plano).maybeSingle().then(({ data }) => {
          if (!cancelled && data?.enabled_modules) setPlanModules(new Set(data.enabled_modules));
        });
      }

      setInitialLoading(false);

      // Fetch thumb AFTER initial load (non-blocking, only for current program)
      const thumb = await findCurrentOnAirThumb();
      if (!cancelled) {
        // Fallback: use empresa background image if no program thumb
        const finalThumb = thumb || cfg.backgroundUrl || null;
        prevThumbRef.current = finalThumb;
        setOnAirThumb(finalThumb);
      }
    };

    loadAll();
    return () => { cancelled = true; };
  }, [user, findCurrentOnAirThumb]);

  // Poll on-air thumb every 30s (lightweight: no base64 in batch)
  useEffect(() => {
    if (!user || initialLoading) return;
    const poll = async () => {
      const thumb = await findCurrentOnAirThumb();
      if (thumb !== prevThumbRef.current) {
        prevThumbRef.current = thumb;
        setOnAirThumb(thumb);
      }
    };
    const interval = setInterval(poll, 10000);
    return () => clearInterval(interval);
  }, [user, initialLoading, findCurrentOnAirThumb]);

  const isModuleEnabled = (page: Page): boolean => {
    // Pages that are always accessible regardless of plan
    if (page === "dashboard") return true;

    // Sub-users: only allow modules explicitly assigned + always-accessible pages
    if (subUserModules !== null) {
      if (page === "configuracoes") return false;
      // Granular check: the page key itself is stored in allowed_modules
      return subUserModules.has(page);
    }

    // Normal user flow
    if (
      page === "configuracoes" ||
      page === "playerconfig" ||
      page === "cortevideo" ||
      page === "tp" ||
      page === "fans" ||
      page === "apresentadores" ||
      page === "ouvintes" ||
      page === "programas" ||
      page === "previsao" ||
      page === "site" ||
      page === "sorteios"
    ) {
      return true;
    }

    const modulesSource = planModules ?? enabledModules;
    if (!modulesSource) return true;

    if (page === "testemunhais" || page === "promocoes" || page === "configtelapromo" || page === "logos" || page === "preroll" || page === "shopping" || page === "propostas") {
      return modulesSource.has("comercial");
    }

    if (page === "cenario" || page === "vmix" || page === "broadcast" || page === "batalha" || page === "enquete" || page === "quiz") {
      return modulesSource.has("vmix");
    }

    return modulesSource.has(page);
  };

  // ---- Menu visibility driven by the plan (pacote) linked to the client ----
  const planKeyAllowed = (node: { label: string; page?: unknown }): boolean => {
    const src = planModules ?? enabledModules;
    if (!src) return true;
    const key = moduleKeyOfNode(node);
    if (!KNOWN_MODULE_KEYS.has(key)) return true;
    return src.has(key);
  };

  const filterMenuChildren = (children: MenuChild[]): MenuChild[] =>
    children
      .filter(c => {
        if (subUserModules !== null) {
          return c.permKey ? subUserModules.has(c.permKey) : (!c.page || subUserModules.has(c.page));
        }
        if (isAdmin) return true;
        return planKeyAllowed(c);
      })
      .map(c => (c.children ? { ...c, children: filterMenuChildren(c.children) } : c));

  const isMenuItemVisible = (item: MenuItem): boolean => {
    if (item.label === "home") return true;
    if (subUserModules !== null) {
      if (item.children) {
        return item.children.some(c => (c.permKey && subUserModules.has(c.permKey)) || (c.page && subUserModules.has(c.page)));
      }
      return item.page ? subUserModules.has(item.page) : false;
    }
    if (isAdmin) return true;
    if (!planKeyAllowed(item)) return false;
    if (item.children) return filterMenuChildren(item.children).length > 0;
    return true;
  };



  useEffect(() => {
    // Only redirect if initial loading is complete and modules are loaded
    if (initialLoading || (!enabledModules && !planModules)) return;

    if (
      currentPage !== "dashboard" &&
      currentPage !== "configuracoes" &&
      currentPage !== "playerconfig" &&
      currentPage !== "fans" &&
      currentPage !== "clientes" &&
      currentPage !== "subusuarios" &&
      currentPage !== "pacotes" &&
      !isAdmin &&
      !isModuleEnabled(currentPage)
    ) {
      setCurrentPage("dashboard");
    }
  }, [currentPage, initialLoading, enabledModules, planModules]);

  const toggleMenu = (label: string) => {
    setExpandedMenus(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleMenuClick = (item: MenuItem) => {
    if (item.children) {
      toggleMenu(item.label);
    } else if (item.label === "home") {
      setSelectedHeaderPill("nexohub");
      setCurrentPage("dashboard");
      setMobileMenuOpen(false);
      setHoveredMenu(null);
    } else if (item.pillMode) {
      setSelectedHeaderPill(item.pillMode);
      setCurrentPage("dashboard");
      setMobileMenuOpen(false);
      setHoveredMenu(null);
    } else if (item.page) {
      setCurrentPage(item.page);
      setMobileMenuOpen(false);
      setHoveredMenu(null);
    }
  };


  const handleChildClick = (child: { label: string; page?: Page }, parentLabel: string) => {
    {
      const pillByLabel: Record<string, string> = {
        "housemix": "nexohub",
        "business": "nexohub",
        "chatbot": "Chatbot",
        "app": "TV App",
        "social design": "Social Design",
        "social media": "Social Design",
      };
      const pill = !child.page ? pillByLabel[child.label] : undefined;
      if (pill) {
        setSelectedHeaderPill(pill);
        setCurrentPage("dashboard");
        setMobileMenuOpen(false);
        setHoveredMenu(null);
        return;
      }
    }
    const masterEmail = parentEmail || user?.email || "";
    const masterSlug = masterEmail.includes("@") ? masterEmail.split("@")[0].toLowerCase() : (effectiveUserId || user?.id || "");
    if (parentLabel === "player" && child.label === "módulo player") {
      const url = masterSlug ? `/${masterSlug}/player` : "/player";
      window.open(url, "_blank");
      setHoveredMenu(null);
      return;
    }
    if ((parentLabel === "ferramentas" || parentLabel === "comercial") && (child.label === "tela promo" || child.label === "módulo locutor")) {
      // URL padronizada do módulo locutor
      const path = child.label === "módulo locutor" ? "locutor" : "telapromo";
      const url = masterSlug ? `/${masterSlug}/${path}` : `/${path}`;
      window.open(url, "_blank");
      setHoveredMenu(null);
      return;
    }
    if (parentLabel === "ferramentas" && child.label === "abrir TP externo") {
      window.open("/tp-externo", "_blank");
      setHoveredMenu(null);
      return;
    }
    if (parentLabel === "vmix" && child.label === "vmix control") {
      window.open("/vmix-control", "_blank");
      setHoveredMenu(null);
      return;
    }
    if (child.page) {
      setCurrentPage(child.page);
      setMobileMenuOpen(false);
      setHoveredMenu(null);
    }
  };

  const isItemActive = (item: MenuItem): boolean => {
    if (item.page === currentPage) {
      if (item.pillMode) return displayedPill === item.pillMode;
      return true;
    }
    if (item.children) return item.children.some(c => c.page === currentPage);
    return false;
  };


  // Auto-expand parent when child is active
  useEffect(() => {
    sidebarMenu.forEach(item => {
      if (item.children?.some(c => c.page === currentPage)) {
        setExpandedMenus(prev => new Set(prev).add(item.label));
      }
    });
  }, [currentPage]);

  if (initialLoading) {
    return <DashboardSkeleton />;
  }

  // Determine the base background from layout settings
  const layoutBg = (() => {
    if (layoutColors.homeBgType === "image" && layoutColors.homeBgImage) {
      return { backgroundImage: `url(${layoutColors.homeBgImage})`, backgroundSize: "cover", backgroundPosition: "center", backgroundRepeat: "no-repeat" } as React.CSSProperties;
    }
    if (layoutColors.homeBgColor && layoutColors.homeBgColor !== defaultLayoutColors.homeBgColor) {
      return { background: `linear-gradient(135deg, ${layoutColors.homeBgColor} 0%, #000000 100%)` } as React.CSSProperties;
    }
    // Default: grayscale gradient
    return { background: "linear-gradient(135deg, #333333 0%, #000000 100%)" } as React.CSSProperties;
  })();

  const isDashboard = currentPage === "dashboard";
 
  return (
    <div data-app-shell className="h-screen flex animate-fade-in overflow-hidden relative" style={{ backgroundColor: "#e4fcff" }}>
      <DashboardRuntimeEffects pauseMusicSync={currentPage === "musica"} />

      {/* Background layers (full page, behind sidebar) */}
      {isDashboard && (
        <div className="absolute inset-0 z-0" style={{ backgroundColor: "#e4fcff" }} />
      )}


      {/* ===== LEFT SIDEBAR (desktop) ===== */}
      <div className="hidden lg:flex flex-shrink-0 z-[60] flex-col items-center py-3 pl-3 gap-2 overflow-visible">
        <img
          src={nexoCantoLogo}
          alt="Nexo"
          style={{ width: 40, height: "auto", display: "block", marginBottom: 4 }}
        />
        <aside
          className="flex flex-col items-center py-4 gap-2 rounded-full relative overflow-visible"
          style={{
            width: "58px",
            backgroundColor: `color-mix(in srgb, ${layoutColors.navBg} 95%, transparent)`,
            boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
          }}
        >

        {(() => {
          const isChatbotMode = displayedPill === "Chatbot";
          const chatbotAllowedTop = new Set(["home", "cadastros", "atendimento", "sorteio"]);
          const chatbotCadastroChildren = new Set(["ouvintes"]);
          const effectiveMenu: MenuItem[] = isAdmin
            ? adminSidebarMenu
            : isChatbotMode
            ? sidebarMenu
                .filter(i => chatbotAllowedTop.has(i.label))
                .map(i => i.label === "cadastros" && i.children
                  ? { ...i, children: i.children.filter(c => chatbotCadastroChildren.has(c.label)) }
                  : i)
            : sidebarMenu;
          return (
        <div key={isChatbotMode ? "sb-chat" : "sb-nexo"} className="flex flex-col items-center gap-1 px-1 overflow-visible animate-fade-in">
          {effectiveMenu.filter(isMenuItemVisible).map((item, itemIdx, arr) => {
            const active = isItemActive(item);
            const Icon = item.icon;
            const isOpen = hoveredMenu === item.label;

            return (
              <div
                key={item.label}
                data-menu-item-root
                className="relative"

                onMouseEnter={() => {
                   clearMenuLeaveTimer();
                   if (item.children) {
                     setHoveredMenu(item.label);
                   } else {
                     // Fecha imediatamente qualquer submenu aberto de outro ícone
                     // para não prejudicar a visibilidade do tooltip deste item.
                     setHoveredMenu(null);
                   }
                 }}
                 onMouseLeave={scheduleCloseMenu}
              >
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        if (item.children) {
                          setHoveredMenu(prev => prev === item.label ? null : item.label);
                        } else if (item.label === "home") {
                          setSelectedHeaderPill("nexohub");
                          setCurrentPage("dashboard");
                          setHoveredMenu(null);
                        } else if (item.pillMode) {
                          setSelectedHeaderPill(item.pillMode);
                          setCurrentPage("dashboard");
                        } else if (item.page) {
                          setCurrentPage(item.page);
                        }
                      }}

                      onFocus={() => { if (item.children) { clearMenuLeaveTimer(); setHoveredMenu(item.label); } }}
                      onKeyDown={(e) => {
                        if (!item.children) return;
                        if (e.key === "ArrowRight" || (e.key === "ArrowDown" && isOpen)) {
                          e.preventDefault();
                          clearMenuLeaveTimer();
                          setHoveredMenu(item.label);
                          requestAnimationFrame(() => {
                            const first = document.querySelector<HTMLButtonElement>(`[data-submenu="${item.label}"] [data-submenu-item]`);
                            first?.focus();
                          });
                        } else if (e.key === "Escape" && isOpen) {
                          setHoveredMenu(null);
                        }
                      }}
                      aria-haspopup={item.children ? "menu" : undefined}
                      aria-expanded={item.children ? isOpen : undefined}
                      aria-label={item.label === "home" ? "Home nexohub" : item.label}
                      className="nexo-focus w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200"
                      style={{
                        backgroundColor: active && item.label !== "home" ? layoutColors.accentColor : "transparent",
                        ["--nexo-accent" as any]: layoutColors.accentColor,
                      }}
                      onMouseEnter={(e) => { if (!active || item.label === "home") e.currentTarget.style.backgroundColor = `${layoutColors.navText}1a`; }}
                      onMouseLeave={(e) => { if (!active || item.label === "home") e.currentTarget.style.backgroundColor = "transparent"; }}
                    >
                      {item.label === "home" ? (
                        <HouseMixIcon size={28} />
                      ) : (
                        <Icon size={22} style={{ color: active ? layoutColors.navText : `${layoutColors.navText}99` }} />
                      )}

                    </button>

                  </TooltipTrigger>
                  {!item.children && (
                    <TooltipContent side="right">
                      <p className="text-xs capitalize">
                        {item.label === "home" ? "Home nexohub" : item.label}
                      </p>
                    </TooltipContent>
                  )}

                </Tooltip>

                {/* Sidebar flyout submenu — destacado da barra com gap, blur e sombra suave */}
                {item.children && (() => {
                  const flipUp = itemIdx >= Math.ceil(arr.length / 2);
                  return (
                  <AnimatedFlyout
                    open={isOpen}
                    className="absolute left-full z-[70]"
                    style={{ ...(flipUp ? { bottom: 0 } : { top: 0 }), marginLeft: 18, paddingLeft: 4 }}
                    onMouseEnter={clearMenuLeaveTimer}
                    onMouseLeave={scheduleCloseMenu}
                  >

                    {/* ponte invisível para não perder hover no gap */}
                    <div style={{ position: "absolute", left: -18, top: 0, width: 22, height: "100%" }} />
                    <div
                      data-submenu={item.label}
                      role="menu"
                      aria-label={`Submenu ${item.label}`}
                      onKeyDown={(e) => {
                        const items = Array.from(
                          (e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>("[data-submenu-item]")
                        ).filter(el => !el.hasAttribute("disabled"));
                        const currentIndex = items.findIndex(el => el === document.activeElement);
                        if (e.key === "ArrowDown") {
                          e.preventDefault();
                          const next = items[(currentIndex + 1 + items.length) % items.length];
                          next?.focus();
                        } else if (e.key === "ArrowUp") {
                          e.preventDefault();
                          const prev = items[(currentIndex - 1 + items.length) % items.length];
                          prev?.focus();
                        } else if (e.key === "Home") {
                          e.preventDefault();
                          items[0]?.focus();
                        } else if (e.key === "End") {
                          e.preventDefault();
                          items[items.length - 1]?.focus();
                        } else if (e.key === "Escape" || e.key === "ArrowLeft") {
                          e.preventDefault();
                          setHoveredMenu(null);
                          // devolve o foco ao botão-pai
                          const parentBtn = (e.currentTarget.closest("[data-menu-item-root]") as HTMLElement | null)?.querySelector<HTMLButtonElement>("button");
                          parentBtn?.focus();
                        }
                      }}
                      className="rounded-2xl py-3 min-w-[210px] overflow-y-auto backdrop-blur-xl"
                      style={{
                        background: `linear-gradient(180deg, ${layoutColors.navBg}f2 0%, ${layoutColors.navBg}e6 100%)`,
                        border: `1px solid ${layoutColors.navText}1f`,
                        boxShadow: `0 20px 60px rgba(0,0,0,0.45), 0 0 0 1px ${layoutColors.accentColor}14, inset 0 1px 0 ${layoutColors.navText}0f`,
                        maxHeight: "calc(100vh - 24px)",
                        ["--nexo-accent" as any]: layoutColors.accentColor,
                      }}
                    >
                      <div className="flex items-center gap-2 px-4 pb-2">
                        <span className="inline-block rounded-full" style={{ width: 4, height: 12, background: layoutColors.accentColor }} />
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: `${layoutColors.navText}80` }}>{item.label}</p>
                      </div>
                      <div className="px-2">
                        {filterMenuChildren(item.children).map((child, ci) => {
                          const ChildIcon = child.icon;
                          const childActive = currentPage === child.page;
                          return (
                            <div key={child.label} className="animate-in fade-in slide-in-from-left-1" style={{ animationDelay: `${ci * 25}ms`, animationFillMode: "both" }}>
                              {child.separator && ci > 0 && (
                                <div className="mx-2 my-1.5" style={{ borderTop: `1px solid ${layoutColors.navText}12` }} />
                              )}
                              <button
                                data-submenu-item
                                role="menuitem"
                                onClick={() => handleChildClick(child, item.label)}
                                className="nexo-focus w-full text-left px-3 py-2 rounded-lg text-xs flex items-center gap-2.5 transition-all group relative"
                                style={{
                                  color: childActive ? layoutColors.accentColor : `${layoutColors.navText}d9`,
                                  backgroundColor: childActive ? `${layoutColors.accentColor}14` : "transparent",
                                }}
                                onMouseEnter={e => { if (!childActive) { e.currentTarget.style.backgroundColor = `${layoutColors.navText}10`; e.currentTarget.style.color = layoutColors.navText; } }}
                                onMouseLeave={e => { if (!childActive) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = `${layoutColors.navText}d9`; } }}
                              >
                                {childActive && (
                                  <span className="absolute left-0 top-1/2 -translate-y-1/2 rounded-full" style={{ width: 3, height: 14, background: layoutColors.accentColor }} />
                                )}
                                <ChildIcon size={14} />
                                <span className="font-medium">{child.label}</span>
                              </button>
                              {child.children && child.children.map(grand => {
                                const GrandIcon = grand.icon;
                                const grandActive = currentPage === grand.page;
                                return (
                                  <button
                                    key={grand.label}
                                    data-submenu-item
                                    role="menuitem"
                                    onClick={() => handleChildClick(grand, child.label)}
                                    className="nexo-focus w-full text-left pl-9 pr-3 py-1.5 rounded-lg text-[11px] flex items-center gap-2 transition-all"
                                    style={{
                                      color: grandActive ? layoutColors.accentColor : `${layoutColors.navText}a6`,
                                      backgroundColor: grandActive ? `${layoutColors.accentColor}10` : "transparent",
                                    }}
                                    onMouseEnter={e => { if (!grandActive) { e.currentTarget.style.backgroundColor = `${layoutColors.navText}0d`; e.currentTarget.style.color = layoutColors.navText; } }}
                                    onMouseLeave={e => { if (!grandActive) { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = `${layoutColors.navText}a6`; } }}
                                  >
                                    <GrandIcon size={12} />
                                    <span>{grand.label}</span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                  </AnimatedFlyout>

                  );
                })()}
              </div>
            );
          })}
        </div>
          );
        })()}

        

        </aside>
      </div>

      <div className="flex-1 flex flex-col min-w-0 relative z-[1]">

        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 pt-3 pb-2 relative z-[1]">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
            {mobileMenuOpen ? <X size={20} className="text-white" /> : <Menu size={20} className="text-white" />}
          </button>
          <h1 className="font-bold text-lg truncate flex-1 ml-3" style={{ color: isDashboard ? layoutColors.navText : layoutColors.pageText }}>{empresa.nome || "Dashboard"}</h1>
          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all mr-2"
            style={{ backgroundColor: `${layoutColors.accentColor}26`, color: layoutColors.accentColor }}
          >
            <LogOut size={10} /> Sair
          </button>
          <ServerClock timezone={empresaTimezone} />
        </div>

        {/* Mobile menu overlay */}
        {mobileMenuOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            {/* Backdrop escurecido com fade */}
            <div
              className="absolute inset-0 animate-in fade-in duration-200"
              style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)" }}
              onClick={() => setMobileMenuOpen(false)}
            />
            <div
              className="relative w-[85vw] max-w-[320px] flex flex-col h-full overflow-y-auto shadow-2xl animate-in slide-in-from-left duration-300"
              style={{
                backgroundColor: layoutColors.navBg,
                WebkitOverflowScrolling: "touch",
                paddingBottom: "env(safe-area-inset-bottom)",
                paddingTop: "env(safe-area-inset-top)",
              }}
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-2 sticky top-0 z-10" style={{ backgroundColor: layoutColors.navBg }}>
                <img src={logoMenu} alt="nexohub" className="h-6 w-auto" />
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-full active:scale-95 transition-transform"
                  style={{ backgroundColor: layoutColors.buttonBg, minWidth: 40, minHeight: 40 }}
                  aria-label="Fechar menu"
                >
                  <X size={18} className="text-white" />
                </button>
              </div>
              <nav key={displayedPill === "Chatbot" ? "mob-chat" : "mob-nexo"} className="flex-1 overflow-y-auto px-3 space-y-1 py-2 animate-fade-in">
                {(isAdmin
                  ? adminSidebarMenu
                  : displayedPill === "Chatbot"
                  ? sidebarMenu
                      .filter(i => new Set(["home", "cadastros", "atendimento", "sorteio"]).has(i.label))

                      .map(i => i.label === "cadastros" && i.children
                        ? { ...i, children: i.children.filter(c => c.label === "ouvintes") }
                        : i)
                  : sidebarMenu
                ).filter(isMenuItemVisible).map(item => {
                  const Icon = item.icon;
                  const active = isItemActive(item);
                  const expanded = expandedMenus.has(item.label);
                  return (
                    <div key={item.label}>
                      <button onClick={() => handleMenuClick(item)}
                        className="w-full flex items-center gap-3 px-3 rounded-xl text-sm transition-all active:scale-[0.98]"
                        style={{
                          minHeight: 44,
                          color: active ? layoutColors.accentColor : `${layoutColors.navText}cc`,
                          backgroundColor: active ? `${layoutColors.accentColor}1a` : "transparent",
                        }}
                      >
                        <Icon size={18} />
                        <span className="flex-1 text-left capitalize">{item.label}</span>
                        {item.children && (
                          <ChevronDown
                            size={14}
                            style={{
                              color: `${layoutColors.navText}66`,
                              transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "transform 220ms cubic-bezier(0.22,1,0.36,1)",
                            }}
                          />
                        )}
                      </button>
                      {item.children && (
                        <div
                          className="overflow-hidden"
                          style={{
                            maxHeight: expanded ? 800 : 0,
                            opacity: expanded ? 1 : 0,
                            transition: "max-height 280ms cubic-bezier(0.22,1,0.36,1), opacity 200ms ease",
                          }}
                        >
                          <div className="ml-6 space-y-0.5 mt-1 mb-1">
                            {filterMenuChildren(item.children).map(child => {
                              const ChildIcon = child.icon;
                              const childActive = currentPage === child.page;
                              return (
                                <div key={child.label}>
                                  <button onClick={() => handleChildClick(child, item.label)}
                                    className="w-full flex items-center gap-2 px-3 rounded-lg text-xs transition-all active:scale-[0.98]"
                                    style={{
                                      minHeight: 40,
                                      color: childActive ? layoutColors.accentColor : `${layoutColors.navText}b3`,
                                      backgroundColor: childActive ? `${layoutColors.accentColor}14` : "transparent",
                                    }}
                                  >
                                    <ChildIcon size={14} />
                                    <span>{child.label}</span>
                                  </button>
                                  {child.children && child.children.map(grand => {
                                    const GrandIcon = grand.icon;
                                    const grandActive = currentPage === grand.page;
                                    return (
                                      <button key={grand.label} onClick={() => handleChildClick(grand, child.label)}
                                        className="w-full flex items-center gap-2 pl-8 pr-3 rounded-lg text-[11px] transition-all active:scale-[0.98]"
                                        style={{
                                          minHeight: 36,
                                          color: grandActive ? layoutColors.accentColor : `${layoutColors.navText}80`,
                                        }}
                                      >
                                        <GrandIcon size={12} />
                                        <span>{grand.label}</span>
                                      </button>
                                    );
                                  })}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
              <div className="px-4 py-4 sticky bottom-0" style={{ borderTop: `1px solid ${layoutColors.borderColor}1a`, backgroundColor: layoutColors.navBg }}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{ backgroundColor: layoutColors.buttonBg, color: layoutColors.buttonText }}>
                    {empresa.nome ? empresa.nome.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate" style={{ color: layoutColors.navText }}>{empresa.nome || "Empresa"}</p>
                    <button onClick={onLogout} className="text-[10px] underline hover:opacity-70 mt-0.5" style={{ color: layoutColors.accentColor }}>sair</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

        )}

        {/* ===== TOP HEADER BAR (desktop) ===== */}
        <div className="hidden lg:flex items-center justify-between px-8 pt-6 pb-2 relative z-[10]">
          <div className="flex items-center gap-4">
            <div>
              {!isDashboard && (
                <p className="text-xs font-medium tracking-widest uppercase mb-0.5" style={{ color: layoutColors.accentColor }}>
                  {pageTitle[currentPage]}
                </p>
              )}
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-light" style={{ color: "#002132" }}>
                  {empresa.nome || "NexoHUB"}
                </h1>

                {/* Notificações agora são centralizadas no topo via App.tsx */}
              </div>
            </div>
          </div>

          <div
            className="flex items-center gap-1 rounded-full pl-2 pr-3 py-1"
            style={{
              backgroundColor: "#ffffff",
              border: "1px solid rgba(0,191,240,0.22)",
              boxShadow: "0 6px 18px rgba(0,33,50,0.06)",
            }}
          >
            {playerState.hasChannel && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent("player:toggle"))}
                    className="nexo-toolbar-btn w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                    style={{ color: "#002132" }}
                    aria-label={playerState.isPlaying ? "Pausar player" : "Reproduzir player"}
                  >
                    {playerState.isLoading ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : playerState.isPlaying ? (
                      <Pause size={18} />
                    ) : (
                      <Play size={18} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p className="text-xs">{playerState.isPlaying ? `Pausar${playerState.channelName ? ` – ${playerState.channelName}` : ""}` : "Reproduzir player"}</p>
                </TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("intercom:open"))}
                  className="nexo-toolbar-btn w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{ color: "#002132" }}
                >
                  <Radio size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Intercomunicador</p></TooltipContent>
            </Tooltip>
            <Suspense fallback={<div className="w-9 h-9" />}>
              <MessageNotification />
            </Suspense>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCurrentPage("configuracoes")}
                  className="nexo-toolbar-btn w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{ color: "#002132" }}
                >
                  <Settings size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Configurações</p></TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onLogout}
                  className="nexo-toolbar-btn w-9 h-9 rounded-xl flex items-center justify-center transition-all"
                  style={{ color: "#002132" }}
                >
                  <LogOut size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom"><p className="text-xs">Sair</p></TooltipContent>
            </Tooltip>
            <div className="w-px h-7 mx-2" style={{ backgroundColor: "rgba(0,33,50,0.10)" }} />
            <ServerClock timezone={empresaTimezone} />
            <style>{`
              .nexo-toolbar-btn:hover { background-color: rgba(0,191,240,0.14); color: #0087aa; }
              .nexo-toolbar-btn:active { transform: scale(0.94); }
            `}</style>
          </div>
        </div>

        {isDashboard && !isAdmin && displayedPill !== "Chatbot" && (
          <div className={`px-3 lg:px-6 pb-4 relative z-[1] ${pillAnimClass}`}>

            <div className="flex flex-row gap-4 items-stretch">
            <div
              className="rounded-3xl relative shrink min-w-0 overflow-hidden"
              style={{
                width: "778px",
                flexShrink: 1,
                flexBasis: "778px",
                minWidth: "520px",
                maxWidth: "100%",
                height: "461px",
                background: onAirPair
                  ? `linear-gradient(135deg, ${onAirPair.primary} 0%, ${onAirPair.secondary} 100%)`
                  : "#00d6f9",
                transition: "background 700ms ease",
              }}
            >
              <div
                className="absolute rounded-full px-5 py-2 font-heading font-bold uppercase tracking-widest text-sm"
                style={{
                  top: "20px",
                  left: "18px",
                  backgroundColor: onAirText === "#ffffff" ? "rgba(255,255,255,0.16)" : "#c3f628",
                  color: onAirText === "#ffffff" ? "#ffffff" : "#002132",
                }}
              >
                no ar
              </div>
              {onAirThumb && (
                <img
                  src={onAirThumb}
                  alt="Programa no ar"
                  className="absolute object-contain"
                  style={{ top: "60px", left: "8px", height: "208px", width: "auto" }}
                />
              )}
              <div
                id="on-air-info-slot"
                style={{
                  position: "absolute",
                  bottom: "20px",
                  left: "18px",
                  right: "18px",
                  ["--layout-nav-text" as any]: onAirText,
                  ["--layout-icon-color" as any]: onAirText,
                  ["--layout-accent-color" as any]: onAirText,
                }}
              />
              {/* LOCUTOR — foto sem box, encostada no bottom */}
              <div
                className="absolute group"
                style={{
                  top: "20px",
                  right: "20px",
                  bottom: "0px",
                  width: "320px",
                }}
              >

                {onAirLocutorFoto && (
                  <>
                    <style>{`
                      @keyframes locutorEntrada {
                        0%   { opacity: 0; transform: scale(1.18) translateY(24px); filter: blur(6px); }
                        60%  { opacity: 1; filter: blur(0); }
                        100% { opacity: 1; transform: scale(1) translateY(0); filter: blur(0); }
                      }
                      @keyframes locutorGlow {
                        0%   { box-shadow: inset 0 0 0 0 rgba(195,246,40,0); }
                        50%  { box-shadow: inset 0 0 60px 10px rgba(195,246,40,0.35); }
                        100% { box-shadow: inset 0 0 0 0 rgba(195,246,40,0); }
                      }
                    `}</style>
                    <img
                      src={onAirLocutorFoto}
                      alt="Locutor no ar"
                      className="w-full h-full object-cover"
                      style={{
                        animation: "locutorEntrada 0.95s cubic-bezier(0.22,1,0.36,1) both",
                        transformOrigin: "center 65%",
                        willChange: "transform, opacity, filter",
                      }}
                    />
                    <div
                      className="absolute inset-0 pointer-events-none rounded-2xl"
                      style={{ animation: "locutorGlow 1.1s ease-out both" }}
                    />
                  </>
                )}

                {onAirTimes && <ProgramProgressBar inicio={onAirTimes.inicio} fim={onAirTimes.fim} nowTick={nowTick} />}

                {/* Overlay: Próximo programa/locutor */}
                {nextProgram && (
                  <div
                    className={`absolute inset-0 transition-all duration-500 ${showNext ? "opacity-100 scale-100 pointer-events-auto" : "opacity-0 scale-95 pointer-events-none"}`}
                    style={{ backgroundColor: "#c3f628" }}
                  >
                    {nextProgram.foto && (
                      <img src={nextProgram.foto} alt={nextProgram.apresentador} className="w-full h-full object-cover" />
                    )}
                    <div
                      className="absolute left-0 right-0 bottom-0 px-5 pt-8 pb-6"
                      style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,33,50,0.85) 100%)", color: "#e4fcff" }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 mb-1">A seguir</p>
                      <p className="text-base font-bold leading-tight truncate">{nextProgram.programa}</p>
                      {nextProgram.apresentador && (
                        <p className="text-xs opacity-80 truncate">{nextProgram.apresentador}</p>
                      )}
                      <p className="text-[11px] opacity-70 mt-1">{nextProgram.inicio} — {nextProgram.fim}</p>
                    </div>
                  </div>
                )}

                {/* Botão toggle próximo */}
                {nextProgram && (
                  <button
                    onClick={() => setShowNext((v) => !v)}
                    aria-label={showNext ? "Voltar" : "Ver a seguir"}
                    className="absolute rounded-full flex items-center justify-center transition-transform duration-300 hover:scale-110 active:scale-95 shadow-md"
                    style={{
                      top: "12px",
                      right: "12px",
                      width: "34px",
                      height: "34px",
                      backgroundColor: "#d7faff",
                      color: "#002132",
                      zIndex: 2,
                    }}
                  >
                    {showNext ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
                  </button>
                )}
              </div>
            </div>

            {/* Calendário Próximos Eventos — ao lado do "No Ar" */}
            <div
              className="rounded-3xl relative overflow-hidden flex-1 min-w-0"
              style={{
                minWidth: "260px",
                height: "461px",
                backgroundColor: "#00d6f9",
                padding: "20px",
                ["--layout-widget-text" as any]: "#002132",
                ["--layout-accent-color" as any]: "#002132",
                ["--layout-header-text" as any]: "#c3f628",
                ["--layout-widget-bg" as any]: "#002132",
                ["--layout-border-color" as any]: "#002132",
              }}
            >
              <Suspense fallback={<div className="w-full h-full" />}>
                <UpcomingEventsWidget onNavigate={setCurrentPage as any} />
              </Suspense>
            </div>
            </div>

          </div>
        )}



        {/* ===== MAIN CONTENT AREA ===== */}
        <div className="flex-1 min-h-0 px-3 lg:px-6 pb-4 relative z-[1]">
          {currentPage !== "dashboard" && (
            <div className="flex items-center gap-3 mb-4 ml-1">
              <BackButton onClick={() => setCurrentPage("dashboard")} />
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold opacity-30 select-none" style={{ color: layoutColors.pageText }}>
                <span>Home</span>
                <span className="opacity-50">/</span>
                <span style={{ color: layoutColors.accentColor, opacity: 1 }}>{pageTitle[currentPage]}</span>
              </div>
            </div>
          )}
          <div className="relative flex-1 h-full">
            <div ref={contentScrollRef} className={`flex-1 h-full overflow-y-auto overflow-x-hidden rounded-2xl ${currentPage !== "dashboard" ? "mv-content-area" : ""}`} style={currentPage === "dashboard" ? {} : { padding: "1.25rem" }}>
            <Suspense fallback={<ModulePageSkeleton />}>
              {/* CustomizableDashboard stays mounted so audio player keeps streaming while user navigates */}
              <div style={{ display: currentPage === "dashboard" ? "block" : "none", height: currentPage === "dashboard" ? "auto" : 0, overflow: currentPage === "dashboard" ? "visible" : "hidden" }}>
                {/* Both mounted so the player audio keeps streaming while user switches to Chatbot */}
                <div style={{ display: displayedPill === "Chatbot" ? "block" : "none" }} className={displayedPill === "Chatbot" ? pillAnimClass : ""}>
                  <ChatbotHome />
                </div>
                <div style={{ display: displayedPill === "Chatbot" ? "none" : "block" }} className={displayedPill !== "Chatbot" ? pillAnimClass : ""}>
                  {isAdmin ? <AdminClientsDashboard /> : <CustomizableDashboard onNavigate={setCurrentPage} effectiveUserId={effectiveUserId} />}
                </div>
              </div>


              {currentPage === "previsao" && <PrevisaoTempo />}
              {currentPage === "noticias" && <RoteiroPrograma />}
              {currentPage === "apresentadores" && <ApresentadorForm />}
              {currentPage === "ouvintes" && <OuvintesPage />}
              {currentPage === "sorteios" && <SorteiosPage />}
              {currentPage === "blitz" && <BlitzPage />}
              {currentPage === "programas" && <ProgramaForm />}
              {/* MusicaNoAr stays mounted in background so local-XML upload to storage keeps running while user navigates other pages */}
              <div style={{ display: currentPage === "musica" ? "block" : "none" }}>
                <MusicaNoAr effectiveUserId={effectiveUserId} />
              </div>
              {currentPage === "agenda" && <AgendaPage />}
              {currentPage === "curtidas" && <MusicasCurtidasPage />}
              {currentPage === "configuracoes" && <ConfiguracoesPage section="empresa" />}
              {currentPage === "playerconfig" && <ConfiguracoesPage section="player" />}
              {currentPage === "testemunhais" && <TestemunhaisPage effectiveUserId={effectiveUserId} />}
              {currentPage === "promocoes" && <PromocoesPage effectiveUserId={effectiveUserId} />}
              {currentPage === "configtelapromo" && <ConfigTelaPromoPage />}
              {currentPage === "logos" && <LogosPatrocinadoresPage effectiveUserId={effectiveUserId} />}
              {currentPage === "shopping" && <ShoppingPage />}
              {currentPage === "preroll" && <PreRollPage />}
              {currentPage === "cortevideo" && <CortesVideoPage />}
              {currentPage === "vmix" && <VmixPage />}
              {currentPage === "propostas" && <PropostasPage />}
              {currentPage === "tp" && <TeleprompterPage />}
              {currentPage === "cenario" && <CenariosPage />}
              {currentPage === "broadcast" && <BroadcastPage />}
              {currentPage === "batalha" && <BatalhaMusicalPage />}
              {currentPage === "enquete" && <EnquetePage />}
              {currentPage === "quiz" && <QuizPage />}
              {currentPage === "site" && <SitePage effectiveUserId={effectiveUserId || user?.id || null} />}
              {currentPage === "clientes" && <ClientesPage />}
              {currentPage === "pacotes" && <PacotesPage accentColor={layoutColors.accentColor} />}
              {currentPage === "subusuarios" && (
                <SubUsuariosPage groups={subUsuarioModulosGroups as never} accentColor={layoutColors.accentColor} />
              )}
              {currentPage === "modulos" && (
                <ModulosPage
                  groups={adminModulosGroups as never}
                  accentColor={layoutColors.accentColor}
                  onSelectGroup={(g) => {
                    const item = adminModulosGroups.find(i => i.label === g.label);
                    if (item?.page) { setCurrentPage(item.page); return; }
                    if (item?.children?.length) {
                      const first = item.children[0];
                      if (!first.page && first.children?.length) { handleChildClick(first.children[0], first.label); return; }
                      handleChildClick(first, item.label);
                      return;
                    }
                    handleChildClick({ label: g.label }, "modulos");
                  }}
                  onSelectChild={(c, parent) => {
                    const findChild = (list: typeof adminModulosGroups[number]["children"]): { label: string; page?: Page } | undefined => {
                      for (const ch of list ?? []) {
                        if (ch.label === c.label) return ch;
                        const deep = findChild(ch.children);
                        if (deep) return deep;
                      }
                      return undefined;
                    };
                    const group = adminModulosGroups.find(i => i.label === parent)
                      ?? adminModulosGroups.find(i => (i.children ?? []).some(ch => ch.label === parent));
                    const child = findChild(group?.children) ?? { label: c.label };
                    handleChildClick(child, parent);
                  }}
                />
              )}
              {currentPage === "fans" && <FansPage radioName={empresa?.nome || undefined} />}
              
            </Suspense>
            </div>
            {currentPage !== "dashboard" && showContentScrollIndicator && (
              <div
                className="absolute inset-y-4 right-1 z-20 flex items-stretch"
                style={{ width: "14px", cursor: "pointer", pointerEvents: "auto" }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  const track = e.currentTarget;
                  const rect = track.getBoundingClientRect();
                  const scrollEl = contentScrollRef.current;
                  if (!scrollEl) return;
                  const setScrollFromY = (clientY: number) => {
                    const ratio = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);
                    scrollEl.scrollTop = ratio * (scrollEl.scrollHeight - scrollEl.clientHeight);
                  };
                  setScrollFromY(e.clientY);
                  const onMove = (ev: MouseEvent) => { ev.preventDefault(); setScrollFromY(ev.clientY); };
                  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
                  window.addEventListener("mousemove", onMove);
                  window.addEventListener("mouseup", onUp);
                }}
              >
                <div className="relative h-full w-full flex items-stretch justify-center">
                  <div
                    className="absolute top-0 bottom-0 w-[2px]"
                    style={{ background: "color-mix(in srgb, var(--layout-page-text, hsl(var(--background))) 25%, transparent)", borderRadius: "1px" }}
                  />
                  <div
                    className="absolute transition-[top] duration-100 hover:scale-110"
                    style={{
                      width: "8px",
                      height: "28px",
                      borderRadius: "4px",
                      top: `clamp(0px, calc(${contentScrollProgress * 100}% - 14px), calc(100% - 28px))`,
                      left: "50%",
                      transform: "translateX(-50%)",
                      background: "var(--layout-accent-color, hsl(var(--destructive)))",
                      boxShadow: "0 1px 6px rgba(0,0,0,0.3)",
                      cursor: "grab",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="flex items-center justify-center gap-2 px-4 pb-3 pt-1 relative z-[1]">
          <img src={logoFooter} alt="Nexo" className="h-4" style={{ opacity: 0.5, filter: (() => {
            const bg = layoutColors.pageBg?.toLowerCase() || "#ffffff";
            const isLight = bg === "#ffffff" || bg === "#fff" || bg === "white" || (() => {
              const m = bg.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
              if (!m) return false;
              const lum = (parseInt(m[1],16)*0.299 + parseInt(m[2],16)*0.587 + parseInt(m[3],16)*0.114);
              return lum > 186;
            })();
            return isLight ? "grayscale(1) brightness(0.85) opacity(0.5)" : isDashboard ? "none" : "brightness(0) opacity(0.4)";
          })() }} />
          <span className="text-[9px]" style={{ color: `${isDashboard ? layoutColors.navText : layoutColors.pageText}66` }}>© 2026 Todos os direitos reservados.</span>
        </footer>
      </div>

      <Suspense fallback={null}>
        <BlitzLocutorPopup userId={effectiveUserId || user?.id || null} />
      </Suspense>

      {subUserModules === null && isDashboard && (
        <>
          <Suspense fallback={null}><IntercomWidget /></Suspense>
          <BotsStatusBox />
        </>
      )}
    </div>
  );
}

function DashboardRuntimeEffects({ pauseMusicSync = false }: { pauseMusicSync?: boolean }) {
  useGlobalMusicXmlUpload();
  useGlobalMusicSync(!pauseMusicSync);
  return null;
}

/* ========== DASHBOARD HOME ========== */
const WIDGETS_ORDER_KEY = "masterview_widgets_order";

interface WidgetCard {
  id: string;
  bg: string;
  render: (onNavigate: (page: Page) => void) => React.ReactNode;
}

const defaultWidgets: WidgetCard[] = [
  { id: "weather", bg: "glass", render: (nav) => <WeatherWidget onNavigate={nav} /> },
  { id: "top10", bg: "glass", render: () => <TopLikedSongs /> },
  { id: "agenda", bg: "glass", render: (onNav: any) => <DashboardAgendaOld onNavigate={onNav} setCurrentPage={(window as any).setCurrentPageGlobal} /> },
  { id: "noar", bg: "glass-dark", render: () => <OnAirWidget /> },
  
  { id: "comercial", bg: "glass", render: () => <ComercialWidgets /> },

];

function DashboardHome({ empresa, onNavigate }: { empresa: import("./ConfiguracoesPage").EmpresaConfig; onNavigate: (page: Page) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(() => {
    const defaultOrder = defaultWidgets.map(w => w.id);
    try {
      const saved = localStorage.getItem(WIDGETS_ORDER_KEY);
      if (saved) {
        const parsed: string[] = JSON.parse(saved);
        const filtered = parsed.filter(id => defaultOrder.includes(id));
        // Insert any newly added widget IDs at their default position
        // (relative to the widget that precedes them in the default order).
        const missing = defaultOrder.filter(id => !filtered.includes(id));
        const merged = [...filtered];
        for (const id of missing) {
          const defIdx = defaultOrder.indexOf(id);
          const prev = defaultOrder.slice(0, defIdx).reverse().find(p => merged.includes(p));
          const insertAt = prev ? merged.indexOf(prev) + 1 : 0;
          merged.splice(insertAt, 0, id);
        }
        return merged;
      }
    } catch {}
    return defaultOrder;
  });

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const orderedWidgets = widgetOrder
    .map(id => defaultWidgets.find(w => w.id === id))
    .filter(Boolean) as WidgetCard[];


  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== draggedId) setDragOverId(id);
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const newOrder = [...widgetOrder];
    const fromIdx = newOrder.indexOf(draggedId);
    const toIdx = newOrder.indexOf(targetId);
    newOrder.splice(fromIdx, 1);
    newOrder.splice(toIdx, 0, draggedId);
    setWidgetOrder(newOrder);
    localStorage.setItem(WIDGETS_ORDER_KEY, JSON.stringify(newOrder));
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  // Proximity scroll: smooth scroll when mouse near edges
  const scrollAnimRef = useRef<number | null>(null);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const edgeZone = 80; // px from edge to trigger scroll

    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }

    let speed = 0;
    if (x < edgeZone) {
      speed = -((edgeZone - x) / edgeZone) * 8;
    } else if (x > rect.width - edgeZone) {
      speed = ((x - (rect.width - edgeZone)) / edgeZone) * 8;
    }

    if (speed !== 0) {
      const tick = () => {
        if (container) {
          container.scrollLeft += speed;
          scrollAnimRef.current = requestAnimationFrame(tick);
        }
      };
      scrollAnimRef.current = requestAnimationFrame(tick);
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (scrollAnimRef.current) {
      cancelAnimationFrame(scrollAnimRef.current);
      scrollAnimRef.current = null;
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className="animate-fade-in flex gap-3 overflow-x-auto scrollbar-hide h-[180px] lg:h-[225px]"
      style={{ scrollBehavior: "auto" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {orderedWidgets.map(widget => (
         <div
          key={widget.id}
          className={`dashboard-widget-card rounded-2xl p-3 lg:p-4 flex-shrink-0 overflow-hidden relative ${
             draggedId === widget.id ? "opacity-50 scale-95" : ""
          } ${dragOverId === widget.id ? "ring-2" : ""}`}
           style={{
             background: widget.bg === "glass-dark"
               ? "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 55%, transparent)"
               : "color-mix(in srgb, var(--layout-widget-bg, #1a1a1a) 18%, transparent)",
             backdropFilter: "blur(32px) saturate(1.6)",
             WebkitBackdropFilter: "blur(32px) saturate(1.6)",
             boxShadow: "0 8px 32px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.1)",
             border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 15%, transparent)",
             borderRadius: "20px",
           }}
          onDragOver={(e) => handleDragOver(e, widget.id)}
          onDrop={(e) => handleDrop(e, widget.id)}
          onDragEnd={handleDragEnd}
        >
          <div
            draggable
            onDragStart={(e) => handleDragStart(e, widget.id)}
            className="absolute top-0 left-0 right-0 h-[28px] z-10 cursor-grab active:cursor-grabbing"
          />
          <Suspense fallback={<Loader2 className="animate-spin text-gray-400" size={16} />}>
            {widget.render(onNavigate)}
          </Suspense>
        </div>
      ))}
    </div>
  );
}

const DashboardAgendaWithStyles = ({ onNavigate, feriadoHoje, selectedDate, dayEvents, eventDates, feriadoDates, calMonth, setCalMonth, setSelectedDate, getFeriadoNome, eventTypesConfig, onExportFeriados }: any) => (
  <div className="flex flex-col h-full w-full">
    <style>{`
      .dashboard-calendar .has-event-dot { position: relative; }
      .dashboard-calendar .has-event-dot::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 2px; height: 2px; background: var(--layout-accent-color, #2563eb); border-radius: 50%; }
      .dashboard-calendar .is-feriado-dot { position: relative; }
      .dashboard-calendar .is-feriado-dot::after { content: ''; position: absolute; bottom: 2px; left: 50%; transform: translateX(-50%); width: 3px; height: 3px; background: var(--layout-accent-color, #ef4444); border-radius: 50%; }
      .dashboard-calendar .rdp-day_today { border: 1px solid var(--layout-accent-color, #2563eb); font-weight: bold; }
    `}</style>
    <div className="flex items-center justify-between mb-2 shrink-0">
      <div className="flex items-center gap-2">
        <p className="text-[11px] font-bold" style={{ color: "var(--layout-widget-text, #ffffff)" }}>📅 Agenda {selectedDate && `— ${format(selectedDate, "dd/MM")}`}</p>
        {feriadoHoje && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span 
                  className="text-[8px] font-black text-white px-1.5 py-0.5 rounded-full uppercase tracking-tighter animate-pulse shadow-sm cursor-help"
                  style={{ backgroundColor: "var(--layout-accent-color, #ef4444)", boxShadow: "0 2px 8px color-mix(in srgb, var(--layout-accent-color, #ef4444) 50%, transparent)" }}
                  onClick={(e) => { e.stopPropagation(); onExportFeriados(); }}
                >
                  Feriado
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-white border-none" style={{ backgroundColor: "var(--layout-accent-color, #ef4444)" }}>
                <p className="text-[10px] font-bold">{feriadoHoje}</p>
                <p className="text-[9px] opacity-90">{selectedDate ? format(selectedDate, "dd 'de' MMMM", { locale: ptBR }) : ""}</p>
                <p className="text-[8px] mt-1 italic border-t border-white/20 pt-1">Clique para exportar feriados</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      <button
        onClick={() => onNavigate("agenda")}
        className="text-[10px] font-semibold hover:opacity-70 flex items-center gap-1"
        style={{ color: "var(--layout-widget-text, #ffffff)", opacity: 0.6 }}
      >
        ver tudo <ExternalLink size={10} />
      </button>
    </div>

    <div className="flex gap-2 flex-1 min-h-0">
      <div className="w-[105px] lg:w-[125px] shrink-0">
        <DashboardCalendar
          selected={selectedDate}
          onSelect={setSelectedDate}
          eventDates={eventDates}
          feriadoDates={feriadoDates}
          month={calMonth}
          onMonthChange={setCalMonth}
          getFeriadoNome={getFeriadoNome}
        />
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto pr-1 space-y-1.5 scrollbar-hide">
        {feriadoHoje && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <div 
                  className="p-1.5 rounded-lg mb-1 cursor-help"
                  style={{ 
                    backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #ef4444) 15%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--layout-accent-color, #ef4444) 30%, transparent)"
                  }}
                >
                  <div className="flex items-center gap-1">
                    <Star size={9} style={{ color: "var(--layout-accent-color, #ef4444)", fill: "var(--layout-accent-color, #ef4444)" }} />
                    <p className="text-[9px] font-black uppercase tracking-tight" style={{ color: "var(--layout-accent-color, #ef4444)" }}>Feriado Nacional</p>
                  </div>
                  <p className="text-[10px] font-bold leading-tight mt-0.5" style={{ color: "color-mix(in srgb, var(--layout-accent-color, #ef4444) 80%, white 20%)" }}>{feriadoHoje}</p>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right" className="text-white border-none" style={{ backgroundColor: "var(--layout-accent-color, #ef4444)" }}>
                <p className="text-[10px] font-bold">{feriadoHoje}</p>
                <p className="text-[9px] opacity-90">{selectedDate ? format(selectedDate, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : ""}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {dayEvents.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center opacity-30">
            <CalendarDays size={18} className="mb-1" style={{ color: "var(--layout-widget-text, #ffffff)" }} />
            <p className="text-[9px]" style={{ color: "var(--layout-widget-text, #ffffff)" }}>Vazio</p>
          </div>
        ) : (
          dayEvents.map((evt: any) => (
            <div
              key={evt.id}
              onClick={() => {
                sessionStorage.setItem("agenda_focus_event", evt.id);
                onNavigate("agenda");
              }}
              className="p-1.5 rounded-lg cursor-pointer transition-all hover:bg-white/10 active:scale-[0.98] border border-white/5"
              style={{
                background: "rgba(255,255,255,0.05)",
              }}
            >
              <p className="text-[10px] font-bold truncate" style={{ color: "var(--layout-widget-text, #ffffff)" }}>{evt.programa?.nome}</p>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-[8px] opacity-60" style={{ color: "var(--layout-widget-text, #ffffff)" }}>
                  {evt.tipo_evento === "gravacao" ? `🎬 ${evt.horario_gravacao || ""}` : evt.programa?.horario_inicio}
                </span>
                <span 
                  className="text-[7px] font-black px-1 rounded-sm"
                  style={{ 
                    backgroundColor: `${eventTypesConfig?.[evt.tipo_evento || "live"]?.color || "#ffffff"}33`, 
                    color: eventTypesConfig?.[evt.tipo_evento || "live"]?.color || "rgba(255,255,255,0.5)" 
                  }}
                >
                  {eventTypesConfig?.[evt.tipo_evento || "live"]?.label || evt.prioridade?.toUpperCase()}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  </div>
);

/* ========== SERVER CLOCK ========== */
function ProgramProgressBar({ inicio, fim, nowTick }: { inicio: string; fim: string; nowTick: number }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const [sh, sm] = inicio.split(":").map(Number);
  const [eh, em] = fim.split(":").map(Number);
  const now = new Date(nowTick);
  const startDate = new Date(now); startDate.setHours(sh, sm, 0, 0);
  const endDate = new Date(now); endDate.setHours(eh, em, 0, 0);
  if (endDate <= startDate) endDate.setDate(endDate.getDate() + 1);
  const totalMs = endDate.getTime() - startDate.getTime();
  const elapsedMs = Math.min(Math.max(now.getTime() - startDate.getTime(), 0), totalMs);
  const elapsedSec = Math.floor(elapsedMs / 1000);
  const totalSec = Math.floor(totalMs / 1000);

  // Sync a Web Animations API animation with wall-clock time
  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;
    const anim = el.animate(
      [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }],
      { duration: totalMs, easing: "linear", fill: "forwards" }
    );
    anim.currentTime = elapsedMs;
    return () => anim.cancel();
    // Re-sync when program window changes (not on every second)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, fim, totalMs]);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n: number) => String(n).padStart(2, "0");
    return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
  };

  return (
    <div className="absolute group/bar" style={{ left: "20px", right: "20px", bottom: "10px", height: "10px" }}>
      <div
        className="absolute left-0 right-0 top-1/2 -translate-y-1/2 rounded-full overflow-hidden"
        style={{ height: "2px", backgroundColor: "rgba(0,33,50,0.15)" }}
      >
        <div
          ref={fillRef}
          className="h-full w-full rounded-full origin-left"
          style={{ backgroundColor: "#d7faff", willChange: "transform" }}
        />
      </div>
      <div
        className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 opacity-0 group-hover/bar:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-medium shadow-lg"
        style={{ backgroundColor: "#002132", color: "#e4fcff" }}
      >
        {fmt(elapsedSec)} / {fmt(totalSec)}
      </div>
    </div>
  );
}

function ServerClock({ timezone }: { timezone?: string | null }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const tz = timezone && timezone.length > 0 ? timezone : undefined;
  let hours: string;
  let seconds: string;
  try {
    hours = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    seconds = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      second: "2-digit",
      hour12: false,
    }).format(now).padStart(2, "0");
  } catch {
    hours = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    seconds = String(now.getSeconds()).padStart(2, "0");
  }

  return (
    <div className="text-right" title={tz ? `Fuso: ${tz}` : undefined}>
      <span className="font-light tracking-wider inline-flex items-start" style={{ fontFamily: "Poppins, sans-serif", fontSize: "26px", lineHeight: 1.1, color: "#002132" }}>
        {hours}
        <span className="font-light inline-block" style={{ fontSize: "12px", width: "18px", textAlign: "left", marginTop: "2px", color: "#002132", opacity: 0.7 }}>{seconds}</span>
      </span>
    </div>
  );
}

/* ========== UNIFIED XML FIELD ========== */
const WEATHER_KEY = "masterview_last_city";

const weatherLabelsMap: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve", 75: "Neve forte",
  80: "Pancadas leves", 81: "Pancadas", 82: "Pancadas fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade severa",
};

function weatherCodeToWbIcon(code: number): string {
  const map: Record<number, string> = {
    0: "c01d", 1: "c02d", 2: "c02d", 3: "c04d",
    45: "a05d", 48: "a05d", 51: "d01d", 53: "d02d", 55: "d03d",
    61: "r01d", 63: "r02d", 65: "r03d", 71: "s01d", 73: "s02d", 75: "s03d",
    80: "r04d", 81: "r05d", 82: "r06d", 95: "t01d", 96: "t04d", 99: "t05d",
  };
  const codes = Object.keys(map).map(Number);
  const closest = codes.reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return map[closest] || "c01d";
}

function UnifiedXmlField() {
  const { user } = useAuth();
  const [xmlContent, setXmlContent] = useState("");

  useEffect(() => {
    const update = async () => {
      let weatherXml = "";
      let newsXml = "";
      let musicXml = "";

      const savedCity = localStorage.getItem(WEATHER_KEY);
      if (savedCity) {
        try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(savedCity)}&count=1&language=pt`);
          const geo = await geoRes.json();
          if (geo.results?.length) {
            const { latitude, longitude, name } = geo.results[0];
            const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=2`);
            const d = await wx.json();
            const wbIcon = weatherCodeToWbIcon(d.current.weather_code);
            const iconUrl = `https://www.weatherbit.io/static/img/icons/${wbIcon}.png`;
            const closestWc = Object.keys(weatherLabelsMap).map(Number).reduce((prev, curr) => (Math.abs(curr - d.current.weather_code) < Math.abs(prev - d.current.weather_code) ? curr : prev));
            const condLabel = weatherLabelsMap[closestWc] || "Desconhecido";
            let amanhaXml = "";
            if (d.daily.temperature_2m_min[1] != null) {
              const twCode = d.daily.weather_code[1] ?? 0;
              const twIcon = `https://www.weatherbit.io/static/img/icons/${weatherCodeToWbIcon(twCode)}.png`;
              const twClosest = Object.keys(weatherLabelsMap).map(Number).reduce((prev, curr) => (Math.abs(curr - twCode) < Math.abs(prev - twCode) ? curr : prev));
              const twLabel = weatherLabelsMap[twClosest] || "Desconhecido";
              amanhaXml = `\n    <amanha>\n      <temperatura_minima>${Math.round(d.daily.temperature_2m_min[1])}Cº</temperatura_minima>\n      <temperatura_maxima>${Math.round(d.daily.temperature_2m_max[1])}Cº</temperatura_maxima>\n      <url_imagem_icone>${twIcon}</url_imagem_icone>\n      <descricao_tempo>${twLabel}</descricao_tempo>\n    </amanha>`;
            }
            weatherXml = `  <tempo>\n    <cidade>${name}</cidade>\n    <temperatura>${Math.round(d.current.temperature_2m)}Cº</temperatura>\n    <descricao>${condLabel}</descricao>\n    <icone_url>${iconUrl}</icone_url>\n    <minima>${Math.round(d.daily.temperature_2m_min[0])}Cº</minima>\n    <maxima>${Math.round(d.daily.temperature_2m_max[0])}Cº</maxima>\n    <humidade>${d.current.relative_humidity_2m}%</humidade>\n    <precipitacao>${d.daily.precipitation_probability_max[0] ?? 0}%</precipitacao>${amanhaXml}\n  </tempo>`;
          }
        } catch {}
      }

      try {
        const [newsRes, cotRes] = await Promise.all([
          supabase.from("selected_news").select("*"),
          supabase.from("selected_cotacoes").select("*"),
        ]);
        const news = newsRes.data || [];
        const cots = cotRes.data || [];
        if (news.length || cots.length) {
          const nXml = news.map((n: any) => `    <noticia>\n      <titulo>${n.title?.replace(/&/g,"&amp;").replace(/</g,"&lt;")}</titulo>\n      <imagem>${n.image_url || ""}</imagem>\n    </noticia>`).join("\n");
          const cXml = cots.map((c: any) => `    <cotacao>\n      <nome>${c.name}</nome>\n      <valor>${c.value}</valor>\n    </cotacao>`).join("\n");
          newsXml = `  <noticias>\n${nXml}\n${cXml}\n  </noticias>`;
        }
      } catch {}

      const m = getMusicData(user?.id);
      if (m) {
        musicXml = `  <musica_agora>\n    <titulo>${m.music.titulo}</titulo>\n    <interprete>${m.music.artista}</interprete>\n    <capa>${m.music.capa || ""}</capa>\n  </musica_agora>`;
      }

      const parts = [weatherXml, newsXml, musicXml].filter(Boolean);
      if (parts.length > 0) {
        setXmlContent(`<?xml version="1.0" encoding="UTF-8"?>\n<masterview>\n${parts.join("\n")}\n</masterview>`);
      } else {
        setXmlContent("");
      }
    };
    update();
    const interval = setInterval(update, 15000);
    return () => clearInterval(interval);
  }, []);

  if (!xmlContent) return null;

  return (
    <div className="space-y-2">
      <XmlLinkRow label="XML MASTERVIEW" xmlContent={xmlContent} compact />
    </div>
  );
}

/* ========== HOOKS ========== */
function useGlobalMusicXmlUpload() {
  const { user } = useAuth();
  const lastContentRef = useRef<string>("");

  useEffect(() => {
    if (!user) return;

    const uploadMusicXml = async () => {
      const { data: settings } = await supabase
        .from("user_settings")
        .select("music_xml_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!settings?.music_xml_url) return;

      try {
        const m = getMusicData(user.id);
        const titulo = m?.music?.titulo || "Sem titulo";
        const interprete = m?.music?.artista || "Desconhecido";
        let capa = m?.music?.capa || "";

        // If cover is a base64 data URI, upload it as .png and use the public URL
        if (capa.startsWith("data:image")) {
          try {
            const res = await fetch(capa);
            const blob = await res.blob();
            const pngBlob = new Blob([blob], { type: "image/png" });
            await supabase.storage
              .from("xml-files")
              .upload("capa-atual.png", pngBlob, { upsert: true, contentType: "image/png" });
            const { data: urlData } = supabase.storage
              .from("xml-files")
              .getPublicUrl("capa-atual.png");
            capa = urlData?.publicUrl ? `${urlData.publicUrl}?t=${Date.now()}` : capa;
          } catch {}
        }

        const processedXml = `<?xml version="1.0" encoding="UTF-8"?>\n<musica_agora>\n  <titulo>${titulo}</titulo>\n  <interprete>${interprete}</interprete>\n  <capa>${capa}</capa>\n</musica_agora>`;
        
        if (processedXml === lastContentRef.current) return;
        lastContentRef.current = processedXml;

        const file = new Blob([processedXml], { type: "application/xml" });
        await supabase.storage
          .from("xml-files")
          .upload("musica-agora.xml", file, { upsert: true, contentType: "application/xml" });
      } catch {}
    };

    // Faster first sync, then regular polling
    const startTimer = setTimeout(uploadMusicXml, 4000);
    const interval = setInterval(uploadMusicXml, 15000);
    return () => { clearTimeout(startTimer); clearInterval(interval); };
  }, [user]);
}


/* ========== COMERCIAL WIDGETS ========== */
function ComercialWidgets() {
  const { user } = useAuth();
  const [totalLogos, setTotalLogos] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      const [{ count }] = await Promise.all([
        supabase.from("logos_patrocinadores").select("*", { count: "exact", head: true }).eq("user_id", user.id).eq("ativo", true),
      ]);
      setTotalLogos(count || 0);
      setLoading(false);
    };
    fetchData();
  }, [user]);

  if (loading) return (
    <div className="animate-pulse h-full">
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-3.5 h-3.5 rounded bg-white/10" />
        <div className="w-20 h-3 rounded bg-white/10" />
      </div>
      <div className="flex gap-2 flex-1 min-h-0">
        <div className="w-[105px] rounded bg-white/5" />
        <div className="flex-1 space-y-1.5">
          <div className="h-10 rounded bg-white/5" />
          <div className="h-10 rounded bg-white/5" />
        </div>
      </div>
    </div>
  );

  return null;
}

function DashboardAgenda({ onNavigate }: { onNavigate: (p: Page) => void }) {
  return (
    <DashboardAgendaOld 
      onNavigate={onNavigate}
      setCurrentPage={(window as any).setCurrentPageGlobal}
    />
  );
}

function DashboardAgendaOld({ onNavigate, setCurrentPage }: { onNavigate: (p: Page) => void; setCurrentPage: (p: Page) => void }) {
  const { user } = useAuth();
  const [now, setNow] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [eventos, setEventos] = useState<any[]>([]);
  const [eventTypesConfig, setEventTypesConfig] = useState<any>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [calMonth, setCalMonth] = useState(new Date());

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

  const getFeriadoNome = (date?: Date) => {
    if (!date) return null;
    const f = feriadosNacionais.find(h => h.dia === date.getDate() && h.mes === (date.getMonth() + 1));
    return f ? f.nome : null;
  };

  const feriadoDates = feriadosNacionais.map(f => {
    const d = new Date();
    return new Date(d.getFullYear(), f.mes - 1, f.dia);
  });

  const eventMatchesDate = (evt: any, dateStr: string) => {
    if (evt.data === dateStr) return true;
    const evtDate = new Date(evt.data + "T12:00:00");
    const checkDate = new Date(dateStr + "T12:00:00");
    if (checkDate < evtDate) return false;
    if (evt.recorrencia === "semanal") return evtDate.getDay() === checkDate.getDay();
    if (evt.recorrencia === "mensal") return evtDate.getDate() === checkDate.getDate();
    return false;
  };

  const getCalendarDates = () => {
    const dates: Date[] = [];
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
    for (const evt of eventos) {
      if (evt.recorrencia === "unico") {
        dates.push(new Date(evt.data + "T12:00:00"));
      } else {
        const d = new Date(start);
        while (d <= end) {
          const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
          if (eventMatchesDate(evt, ds)) dates.push(new Date(d));
          d.setDate(d.getDate() + 1);
        }
      }
    }
    return dates;
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    const fetchData = async () => {
      // Fetch user profile for event types config
      const { data: profile } = await supabase
        .from("profiles")
        .select("event_types_config")
        .eq("user_id", user.id)
        .single();
      
      if (profile?.event_types_config) {
        setEventTypesConfig(profile.event_types_config);
      }

      const { data: evts } = await supabase
        .from("agenda_eventos")
        .select("*")
        .eq("user_id", user.id)
        .order("data");
      if (!evts) { setEventos([]); setLoading(false); return; }
      const programaIds = evts.map((e: any) => e.programa_id).filter(Boolean);
      const { data: progs } = programaIds.length
        ? await supabase.from("programas").select("*").in("id", programaIds)
        : { data: [] };
      setEventos(evts.map((e: any) => ({
        ...e,
        programa: (progs || []).find((p: any) => p.id === e.programa_id),
      })));
      setLoading(false);
    };
    fetchData();
  }, [user]);

  if (loading) return (
    <div className="animate-pulse h-full">
      <div className="flex items-center gap-1.5 mb-2">
        <div className="w-3.5 h-3.5 rounded bg-white/10" />
        <div className="w-20 h-3 rounded bg-white/10" />
      </div>
      <div className="flex gap-2 flex-1 min-h-0">
        <div className="w-[105px] rounded bg-white/5" />
        <div className="flex-1 space-y-1.5">
          <div className="h-10 rounded bg-white/5" />
          <div className="h-10 rounded bg-white/5" />
        </div>
      </div>
    </div>
  );

  const todayStr = format(now, "yyyy-MM-dd");
  const currentTime = format(now, "HH:mm");
  const selDateStr = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";

  const dayEvents = eventos.filter((e) => {
    const matchesDate = eventMatchesDate(e, selDateStr);
    if (!matchesDate) return false;
    if (e.status === "concluido" || e.status === "cancelado") return false;
    const isToday = selDateStr === todayStr;
    if (isToday && e.horario_gravacao_fim && e.horario_gravacao_fim < currentTime) return false;
    return true;
  });
  const handleExportFeriados = () => {
    let icsContent = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//NexoHub//Dashboard//BR",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH"
    ].join("\r\n");

    const year = now.getFullYear();
    feriadosNacionais.forEach(f => {
      const month = String(f.mes).padStart(2, '0');
      const day = String(f.dia).padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      
      icsContent += "\r\n" + [
        "BEGIN:VEVENT",
        `UID:feriado-${dateStr}@nexohub.com`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
        `DTSTART;VALUE=DATE:${dateStr}`,
        `DTEND;VALUE=DATE:${year}${month}${String(f.dia + 1).padStart(2, '0')}`,
        `SUMMARY:Feriado: ${f.nome}`,
        "DESCRIPTION:Feriado Nacional Brasileiro",
        "STATUS:CONFIRMED",
        "TRANSP:TRANSPARENT",
        "END:VEVENT"
      ].join("\r\n");
    });

    icsContent += "\r\nEND:VCALENDAR";
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `feriados_${year}.ics`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  const feriadoHoje = getFeriadoNome(selectedDate || new Date());
  const eventDates = getCalendarDates();

  return (
    <DashboardAgendaWithStyles
      onNavigate={onNavigate}
      feriadoHoje={feriadoHoje}
      selectedDate={selectedDate}
      dayEvents={dayEvents}
      eventDates={eventDates}
      feriadoDates={feriadoDates}
      calMonth={calMonth}
      setCalMonth={setCalMonth}
      setSelectedDate={setSelectedDate}
      getFeriadoNome={getFeriadoNome}
      eventTypesConfig={eventTypesConfig}
      onExportFeriados={handleExportFeriados}
    />
  );
}

function DashboardCalendar({ selected, onSelect, eventDates, feriadoDates, month, onMonthChange, getFeriadoNome }: {
  selected: Date | undefined;
  onSelect: (d: Date | undefined) => void;
  eventDates: Date[];
  feriadoDates: Date[];
  month: Date;
  onMonthChange: (d: Date) => void;
  getFeriadoNome: (d: Date) => string | null;
}) {
  return (
    <TooltipProvider>
      <CalendarUI
        mode="single"
        selected={selected}
        onSelect={onSelect}
        month={month}
        onMonthChange={onMonthChange}
        locale={ptBR}
        modifiers={{ hasEvent: eventDates, isFeriado: feriadoDates }}
        modifiersClassNames={{ 
          hasEvent: "has-event-dot",
          isFeriado: "is-feriado-dot"
        }}
        components={{
          DayContent: ({ date, ...props }) => {
            const feriado = getFeriadoNome(date);
            const content = <span>{date.getDate()}</span>;
            
            if (feriado) {
              return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help w-full h-full flex items-center justify-center">{content}</span>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-red-600 text-white border-red-500 z-[100]">
                    <p className="text-[10px] font-bold">{feriado}</p>
                    <p className="text-[9px] opacity-90">{format(date, "dd/MM")}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }
            return content;
          }
        }}
      className="p-0 pointer-events-auto dashboard-calendar"
      classNames={{
        months: "w-full",
        month: "w-full space-y-0",
        caption: "hidden",
        nav: "hidden",
        table: "w-full border-collapse",
        head_row: "flex",
        head_cell: "flex-1 text-center font-medium",
        row: "flex w-full",
        cell: "flex-1 text-center p-0",
        day: "h-[24px] w-[24px] p-0 font-normal text-[14px] mx-auto flex items-center justify-center rounded-full hover:text-white transition-colors",
        day_selected: "!bg-[#0d0446] !text-white",
        day_today: "font-bold",
        day_outside: "opacity-30",
      }}
      modifiersStyles={{
        isFeriado: { color: "#ef4444" },
      }}
      styles={{
        day: { color: "var(--layout-widget-text, #ffffff)", fontSize: "14px" },
        head_cell: { color: "var(--layout-widget-text, #ffffff)", opacity: 0.5, fontSize: "10px", padding: 0 },
      }}
    />
    </TooltipProvider>
  );
}

function DashboardAgendaFlyoutPlaceholder() {
  return null;
}
