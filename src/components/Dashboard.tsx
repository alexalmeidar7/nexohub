import { useState, useEffect, useRef, useCallback, Suspense, startTransition } from "react";
import type React from "react";

import { Calendar as CalendarUI } from "@/components/ui/calendar";
import { Link2, Home, Sun, FileText, Mic2, PlaySquare, Music, CalendarDays, Settings, LogOut, Loader2, ShoppingBag, ChevronDown, ChevronUp, ChevronRight, ChevronLeft, MessageSquareQuote, Tag, Image, ExternalLink, MonitorPlay, Heart, ShoppingCart, Film, Users, Newspaper, CloudSun, Wrench, Scissors, Menu, X, Monitor, Radio, Swords, HelpCircle, Star, Globe, Play, Pause, Gift, Siren, Layers, Building2, Bot, Smartphone, Palette, CloudRain, DollarSign, Package, MessageCircle, DatabaseBackup } from "lucide-react";
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
import { lazyRetry } from "@/lib/lazyRetry";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
import { useDesktopStationRole } from "@/hooks/useDesktopStationRole";
import { getClientHouseMixProgramsSync } from "@/lib/houseMixProgramasService";
import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";

import { resolvePresenterForProgram } from "@/lib/onAirPresenterResolver";


// Lazy-load all tab pages for faster initial render
const ApresentadorForm = lazyRetry(() => import("./ApresentadorForm"));
const OuvintesPage = lazyRetry(() => import("./OuvintesPage"));
const SorteiosPage = lazyRetry(() => import("./SorteiosPage"));
const RelatoriosPage = lazyRetry(() => import("./RelatoriosPage"));
const BlitzPage = lazyRetry(() => import("./BlitzPage"));
const ProgramaForm = lazyRetry(() => import("./ProgramaForm"));
const PrevisaoTempo = lazyRetry(() => import("./PrevisaoTempo"));
const RoteiroPrograma = lazyRetry(() => import("./RoteiroPrograma"));
const WeatherWidget = lazyRetry(() => import("./WeatherWidget"));
const OnAirWidget = lazyRetry(() => import("./OnAirWidget"));
const UpcomingEventsWidget = lazyRetry(() => import("./UpcomingEventsWidget"));

const MusicaNoAr = lazyRetry(() => import("./MusicaNoAr"));
const AgendaPage = lazyRetry(() => import("./AgendaPage"));
const MusicWidget = lazyRetry(() => import("./MusicWidget"));
const XmlLinkRow = lazyRetry(() => import("./XmlLinkRow"));
const ConfiguracoesPage = lazyRetry(() => import("./ConfiguracoesPage"));
import { getEmpresaConfig } from "@/lib/empresaConfigService";
import { getMusicData } from "@/lib/musicData";
const TestemunhaisPage = lazyRetry(() => import("./TestemunhaisPage"));
const PromocoesPage = lazyRetry(() => import("./PromocoesPage"));
const LogosPatrocinadoresPage = lazyRetry(() => import("./LogosPatrocinadoresPage"));
const VideoPlayer = lazyRetry(() => import("./VideoPlayer"));
const TopLikedSongs = lazyRetry(() => import("./TopLikedSongs"));
const MusicasCurtidasPage = lazyRetry(() => import("./MusicasCurtidasPage"));
const ShoppingPage = lazyRetry(() => import("./ShoppingPage"));
const PreRollPage = lazyRetry(() => import("./AdsPage"));
const CortesVideoPage = lazyRetry(() => import("./CortesVideoPage"));
const VmixPage = lazyRetry(() => import("./VmixPage"));
const TeleprompterPage = lazyRetry(() => import("./TeleprompterPage"));
const CustomizableDashboard = lazyRetry(() => import("./CustomizableDashboard"));
const AdminClientsDashboard = lazyRetry(() => import("./AdminClientsDashboard"));
const AdminInfoMusicPage = lazyRetry(() => import("./AdminInfoMusicPage"));
const ChatbotHome = lazyRetry(() => import("./ChatbotHome"));
const FinanceiroSuperAdminPage = lazyRetry(() => import("./FinanceiroSuperAdminPage"));

const PropostasPage = lazyRetry(() => import("./PropostasPage"));
const ConfigTelaPromoPage = lazyRetry(() => import("./ConfigTelaPromoPage"));
const CenariosPage = lazyRetry(() => import("./CenariosPage"));
const MessageNotification = lazyRetry(() => import("./MessageNotification"));
const FansPage = lazyRetry(() => import("./FansPage"));
const BroadcastPage = lazyRetry(() => import("./BroadcastPage"));
const BatalhaMusicalPage = lazyRetry(() => import("./BatalhaMusicalPage"));
const EnquetePage = lazyRetry(() => import("./EnquetePage"));
const QuizPage = lazyRetry(() => import("./QuizPage"));
const SitePage = lazyRetry(() => import("./site/SitePage"));
const ClientesPage = lazyRetry(() => import("./ClientesPage"));
const ModulosPage = lazyRetry(() => import("./ModulosPage"));
const SubUsuariosPage = lazyRetry(() => import("./SubUsuariosPage"));
const HouseMixPage = lazyRetry(() => import("./HouseMixPage"));
const ProdutosPage = lazyRetry(() => import("./ProdutosPage"));
const PacotesPage = lazyRetry(() => import("./PacotesPage"));
const IntercomWidget = lazyRetry(() => import("./IntercomWidget"));
const FloatingMiniPlayer = lazyRetry(() => import("./FloatingMiniPlayer"));
const FloatingOnAirPresenter = lazyRetry(() => import("./FloatingOnAirPresenter"));
const BackupPage = lazyRetry(() => import("./BackupPage"));
const NexoPluginsPage = lazyRetry(() => import("./NexoPluginsPage"));
const LinkBioPage = lazyRetry(() => import("./LinkBioPage"));



import DashboardSkeleton from "./skeletons/DashboardSkeleton";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import AgendaPageSkeleton from "./skeletons/AgendaPageSkeleton";
import InlineNotification from "./InlineNotification";
import nexoCantoLogo from "@/assets/nexo_canto.png";
import logoNxo from "@/assets/logo-nxo.png";
import SuperAdminHeader from "./SuperAdminHeader";
import HouseMixHeader from "./HouseMixHeader";
import HouseMixWindow from "./HouseMixWindow";
import ServerClock from "./ServerClock";

type Page = "linkbio" | "nexoplugins" | "dashboard" | "previsao" | "noticias" | "apresentadores" | "ouvintes" | "programas" | "musica" | "agenda" | "configuracoes" | "testemunhais" | "promocoes" | "logos" | "curtidas" | "shopping" | "preroll" | "cortevideo" | "playerconfig" | "vmix" | "propostas" | "tp" | "cenario" | "fans" | "configtelapromo" | "broadcast" | "batalha" | "enquete" | "quiz" | "site" | "sorteios" | "blitz" | "clientes" | "modulos" | "subusuarios" | "pacotes" | "admininfomusic" | "financeiro" | "chatbot" | "housemix" | "produtos" | "backup" | "relatorios";

// Sidebar structured menu
interface MenuChild {
  icon: typeof Home;
  label: string;
  page: Page;
  separator?: boolean;
  permKey?: string;
  children?: MenuChild[];
  disabled?: boolean;
}
interface MenuItem {
  icon: React.ComponentType<{ size?: string | number; className?: string; style?: React.CSSProperties }>;
  label: string;
  page?: Page;
  children?: MenuChild[];
  pillMode?: string;
}
const isUuid = (str?: string | null): boolean => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);


const sidebarMenu: MenuItem[] = [
  { icon: Home, label: "home", page: "dashboard" },
  {
    icon: Users, label: "cadastros", children: [
      { icon: Mic2, label: "participantes", page: "apresentadores" },
      { icon: Users, label: "ouvintes", page: "ouvintes" },
      { icon: PlaySquare, label: "programas", page: "programas" },
      { icon: Building2, label: "clientes", page: "clientes" },
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
      { icon: ShoppingCart, label: "shopping", page: "shopping", disabled: true },
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
      { icon: Scissors, label: "editor de vídeo", page: "cortevideo" },
      { icon: DatabaseBackup, label: "backup / importar", page: "backup" },
      { icon: Package, label: "downloads", page: "nexoplugins" },
      { icon: Link2, label: "link bio", page: "linkbio" },
      { icon: ExternalLink, label: "abrir TP externo", page: undefined as unknown as Page },
    ]
  },
];


// Menu do super admin: Gestão de Produtos da Agência
// House Mix agrupa: Módulos, Subusuários, Pacotes e Info Music
// Além de Financeiro, Orçamentos, Chatbot e Clientes
const adminSidebarMenu: MenuItem[] = [
  { icon: Home, label: "home", page: "dashboard" },
  {
    icon: Radio,
    label: "house mix",
    children: [
      { icon: Layers, label: "módulos", page: "modulos" },
      { icon: Users, label: "subusuários", page: "subusuarios" },
      { icon: Package, label: "pacotes", page: "pacotes" },
      { icon: Music, label: "info music", page: "admininfomusic" },
    ]
  },
  { icon: DollarSign, label: "financeiro", page: "financeiro" },
  { icon: FileText, label: "orçamentos", page: "propostas" },
  { icon: MessageCircle, label: "chatbot", page: "chatbot" },
  { icon: Building2, label: "clientes", page: "clientes" },
];


// Conteúdo da página MODULOS (boxes principais + subitens)
export const adminModulosGroups: MenuItem[] = [
  {
    icon: Users, label: "cadastros", children: [
      { icon: Mic2, label: "participantes", page: "apresentadores" },
      { icon: Users, label: "ouvintes", page: "ouvintes" },
      { icon: PlaySquare, label: "programas", page: "programas" },
      { icon: Building2, label: "clientes", page: "clientes" },
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
      { icon: ShoppingCart, label: "shopping", page: "shopping", disabled: true },
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
      { icon: Scissors, label: "editor de vídeo", page: "cortevideo" },
      { icon: DatabaseBackup, label: "backup / importar", page: "backup" },
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
const KNOWN_MODULE_KEYS = new Set([...collectModuleKeys(adminModulosGroups as any), "clientes", "subusuarios", "pacotes"]);

const pageTitle: Record<Page, string> = {
  nexoplugins: "Downloads",
  linkbio: "Ferramentas — Link Bio",
  dashboard: "Home",
  previsao: "Cidade Tempo",
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
  logos: "Comercial — Logos",
  shopping: "Comercial — Shopping",
  preroll: "ADS",
  propostas: "Comercial — Propostas Comerciais",
  cortevideo: "Ferramentas — Editor de Vídeo",
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
  admininfomusic: "Info Music",
  financeiro: "Gestão Financeira & Cobranças",
  chatbot: "Chatbot & Atendimento",
  housemix: "Gestão do Produto House Mix",
  produtos: "Produtos",
  backup: "Ferramentas — Backup / Importar",
  relatorios: "Relatórios",
};

const HOUSEMIX_MODULE_DISPLAY_NAMES: Partial<Record<Page, string>> = {
  site: "Gestor de Site",
  playerconfig: "Configuração do Player",
  preroll: "ADS / Pré-Roll",
  testemunhais: "Citações",
  promocoes: "Promoções",
  logos: "Logos",
  configtelapromo: "Config Módulo Locutor",
  broadcast: "Broadcast",
  cenario: "Cenários",
  batalha: "Batalha Musical",
  enquete: "Enquete",
  quiz: "Quiz",
  cortevideo: "Editor de Vídeo",
  nexoplugins: "Downloads",
  linkbio: "Link Bio",
  sorteios: "Sorteios",
  blitz: "Blitz Promocionais",
  noticias: "Roteiro de Programa",
  musica: "Música no Ar",
  agenda: "Agenda",
  clientes: "Cadastro de Clientes",
  apresentadores: "Cadastro de Participantes",
  ouvintes: "Cadastro de Ouvintes",
  programas: "Cadastro de Programas",
  previsao: "Cidade Tempo",
  configuracoes: "Configurações",
  chatbot: "Chatbot & Atendimento",
};

interface DashboardProps {
  onLogout?: () => void;
  defaultPage?: Page;
}

export default function Dashboard({ onLogout, defaultPage }: DashboardProps) {
  const { user, role } = useAuth();
  const isLocal = typeof window !== "undefined" && (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "[::1]" ||
    window.location.hostname.startsWith("192.168.") ||
    window.location.hostname.startsWith("10.")
  );
  let forceRole: string | null = null;
  try {
    forceRole = localStorage.getItem("nexohub_force_role");
  } catch {}

  const isAlexAdmin = user?.email === "alex@nexobrasil.net" || (user?.email ? user.email.toLowerCase().includes("alex") : false);
  const isClientUser = !!user?.email && !isAlexAdmin;
  const isAdmin = forceRole === "admin" || (
    forceRole !== "user" && !isClientUser && (
      role === "admin" ||
      isAlexAdmin ||
      (isLocal && !user)
    )
  );
  const layoutColors = useLayoutColors();
  
  // Lista de páginas que suportam minimização (Expandida para quase todos os módulos)
  const MINIMIZABLE_PAGES: Page[] = [
    "apresentadores", "ouvintes", "programas", "clientes", "previsao", "sorteios",
    "blitz", "noticias", "musica", "agenda", "site", "playerconfig", "preroll",
    "testemunhais", "promocoes", "logos", "broadcast", "cenario", "batalha",
    "enquete", "quiz", "cortevideo", "configtelapromo", "configuracoes", "chatbot"
  ];

  // State for minimized modules (array to allow multiple)
  const [minimizedModules, setMinimizedModules] = useState<Page[]>(() => {
    try {
      const saved = localStorage.getItem("nexohub_minimized_modules");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.filter((p: any) => MINIMIZABLE_PAGES.includes(p as Page)) as Page[];
        }
      }
      return [];
    } catch { return []; }
  });

  useEffect(() => {
    try {
      if (minimizedModules.length > 0) {
        localStorage.setItem("nexohub_minimized_modules", JSON.stringify(minimizedModules));
      } else {
        localStorage.removeItem("nexohub_minimized_modules");
      }
    } catch {}
  }, [minimizedModules]);

  // Compatibility for single minimized logic (refactoring to use the first or just keeping the state separate)
  const [minimizedModule, setMinimizedModule] = useState<Page | null>(null);
  
  // Update legacy single state when array changes for compatibility with existing components if needed
  useEffect(() => {
    setMinimizedModule(minimizedModules.length > 0 ? minimizedModules[0] : null);
  }, [minimizedModules]);

  const [currentPage, setCurrentPageState] = useState<Page>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryPage = params.get("page") as Page | null;
      if (queryPage) return queryPage;

      const targetPage = sessionStorage.getItem("nexohub_target_page") as Page | null;
      if (targetPage) {
        sessionStorage.removeItem("nexohub_target_page");
        return targetPage;
      }

      const activePage = sessionStorage.getItem("nexohub_current_page") as Page | null;
      if (activePage && activePage !== "dashboard") {
        return activePage;
      }
    } catch {}
    return "dashboard";
  });

  // Modo Janela para House Mix (Cadastros, Sorteios, Blitz, Roteiro, Música no Ar, Agenda, Gestor de Site, Player, Comercial, vMix, Ferramentas, Configurações, Chatbot)
  const HOUSEMIX_WINDOW_PAGES: Page[] = [
    "linkbio",
    "nexoplugins",
    "clientes",
    "apresentadores",
    "ouvintes",
    "programas",
    "previsao",
    "sorteios",
    "blitz",
    "relatorios",
    "noticias",
    "musica",
    "agenda",
    "site",
    "playerconfig",
    "preroll",
    "testemunhais",
    "promocoes",
    "logos",
    "configtelapromo",
    "broadcast",
    "cenario",
    "batalha",
    "enquete",
    "quiz",
    "cortevideo",
    "configuracoes",
    "chatbot",
  ];
  const isWindowMode = !isAdmin && HOUSEMIX_WINDOW_PAGES.includes(currentPage);

  const setCurrentPage = useCallback((next: React.SetStateAction<Page>) => {
    setCurrentPageState((prev) => {
      const resolved = typeof next === "function" ? (next as (p: Page) => Page)(prev) : next;
      
      if (resolved !== prev) {
        // Persiste a página atual no sessionStorage e URL search params para resiliência a reloads
        try {
          sessionStorage.setItem("nexohub_current_page", resolved);
          const url = new URL(window.location.href);
          if (resolved === "dashboard") {
            url.searchParams.delete("page");
          } else {
            url.searchParams.set("page", resolved);
          }
          window.history.replaceState(null, "", url.toString());
        } catch {}

        // Se estava em uma janela HouseMix e abriu outra janela HouseMix, minimiza a anterior
        if (HOUSEMIX_WINDOW_PAGES.includes(prev) && HOUSEMIX_WINDOW_PAGES.includes(resolved)) {
          setMinimizedModules((minPrev) => {
            const cleaned = minPrev.filter((p) => p !== resolved);
            return cleaned.includes(prev) ? cleaned : [...cleaned, prev];
          });
        } else {
          // Se navegou diretamente para a página (ex: pelo menu), remove da lista de minimizados
          setMinimizedModules((minPrev) => minPrev.filter((p) => p !== resolved));
        }
        try { window.dispatchEvent(new CustomEvent("app:page-change", { detail: { page: resolved } })); } catch { /* noop */ }
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
  // Super admin abre por padrão o painel Business e define o título da página
  useEffect(() => {
    if (!isAdmin) return;
    document.title = "Nexo Brasil - Soluções Visuais";
    try {
      if (localStorage.getItem("nexohub_admin_pill_init") === "1") return;
      localStorage.setItem("nexohub_admin_pill_init", "1");
    } catch { /* noop */ }
    setSelectedHeaderPill("Business");
  }, [isAdmin, currentPage]);
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
  const currentClientAccount = findClientAccountByEmail(user?.email) || findClientAccountById(user?.id);
  const targetStationUserId = effectiveUserId || currentClientAccount?.parentUserId || currentClientAccount?.id || user?.id;
  const desktopStationRole = useDesktopStationRole(targetStationUserId);
  const [initialLoading, setInitialLoading] = useState(true);
  const autoOpenMusicHandledRef = useRef(false);
  const [desktopStartupEnabled, setDesktopStartupEnabled] = useState(false);
  const [onAirThumb, setOnAirThumb] = useState<string | null>(null);
  const [onAirLocutorFoto, setOnAirLocutorFoto] = useState<string | null>(null);
  const [onAirPair, setOnAirPair] = useState<{ primary: string; secondary: string } | null>(null);
  // Versão da foto: incrementada quando a foto de destaque é trocada (evita cache do browser)
  const [onAirFotoVersion, setOnAirFotoVersion] = useState(0);
  const onAirFotoSrc = onAirLocutorFoto
    ? `${onAirLocutorFoto}${onAirLocutorFoto.includes("?") ? "&" : "?"}v=${onAirFotoVersion}`
    : null;

  useEffect(() => {
    if (!window.houseMixDesktop || !user || initialLoading ||
        !desktopStationRole.ready || autoOpenMusicHandledRef.current) return;
    autoOpenMusicHandledRef.current = true;
    let cancelled = false;
    void window.houseMixDesktop.getStartWithWindows().then(({ enabled }) => {
      if (!cancelled) {
        // Only the station-elected primary may auto-open or start the reader.
        const shouldAutoOpen = enabled && desktopStationRole.isPrimary;
        setDesktopStartupEnabled(shouldAutoOpen);
        if (shouldAutoOpen) setCurrentPage("musica");
      }
    }).catch((error) => {
      console.error("Não foi possível restaurar o módulo Música no Ar na inicialização:", error);
    });
    return () => { cancelled = true; };
  }, [user?.id, initialLoading, setCurrentPage, desktopStationRole.ready, desktopStationRole.isPrimary]);
  // Gradiente dinâmico do box "no ar" a partir da foto do locutor
  useEffect(() => {
    let cancelled = false;
    if (!onAirFotoSrc) { setOnAirPair(null); return; }
    import("@/lib/dominantColors").then(({ extractDominantPair }) =>
      extractDominantPair(onAirFotoSrc).then((pair) => { if (!cancelled && pair) setOnAirPair(pair); })
    );
    return () => { cancelled = true; };
  }, [onAirFotoSrc]);
  // Realtime: troca de foto do locutor/programa atualiza foto + degradê sem reload
  useEffect(() => {
    const uid = effectiveUserId || user?.id;
    if (!uid) return;
    const bump = () => setOnAirFotoVersion((v) => v + 1);
    const ch = supabase
      .channel(`onair-foto-${uid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "apresentadores" }, bump)
      .on("postgres_changes", { event: "*", schema: "public", table: "programas" }, bump)
      .subscribe();
    window.addEventListener("onair-foto-updated", bump);
    return () => { window.removeEventListener("onair-foto-updated", bump); supabase.removeChannel(ch); };
  }, [user, effectiveUserId]);

  // Texto legível sobre o gradiente (branco ou escuro)
  const onAirText = (() => {
    const base = onAirPair?.primary || "#00d6f9";
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(base);
    if (!m) return "#002132";
    const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
      const c = parseInt(h, 16) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    });
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.42 ? "#002132" : "#ffffff";
  })();

  const [nextProgram, setNextProgram] = useState<{ foto: string | null; apresentador: string; programa: string; inicio: string; fim: string } | null>(null);
  const [showNext, setShowNext] = useState(false);
  const [onAirTimes, setOnAirTimes] = useState<{ inicio: string; fim: string } | null>(null);
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
  const prevThumbRef = useRef<string | null>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const [contentScrollProgress, setContentScrollProgress] = useState(0);
  const [showContentScrollIndicator, setShowContentScrollIndicator] = useState(false);
  const [isScrollDragging, setIsScrollDragging] = useState(false);

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
    const clientAcc = findClientAccountByEmail(user?.email) || findClientAccountById(user?.id);
    const uid = effectiveUserId || clientAcc?.parentUserId || (clientAcc?.id && isUuid(clientAcc.id) ? clientAcc.id : null) || (user?.id && isUuid(user.id) ? user.id : null);
    if (!uid) return;
    let cancelled = false;
    const DIAS_MAP: Record<number, string> = { 1: "Segunda", 2: "Terça", 3: "Quarta", 4: "Quinta", 5: "Sexta", 6: "Sábado", 0: "Domingo" };
    const load = async () => {
      let progRes: any = { data: null };
      let empRes: any = { data: null };
      if (isUuid(uid)) {
        [progRes, empRes] = await Promise.all([
          supabase
            .from("programas")
            .select("id, nome, apresentador_id, dias_semana, horario_inicio, horario_fim")
            .eq("user_id", uid)
            .eq("ativo", true)
            .ilike("estudio", "%fm%"),
          supabase.from("empresa_config").select("timezone").eq("user_id", uid).maybeSingle(),
        ]);
      }
      let data = progRes.data;
      let tz: string | null = (empRes.data as any)?.timezone || null;

      // Se não houver programas cadastrados no Supabase direto, busca na base de dados da emissora
      if (!data || data.length === 0) {
        const stationDb = await fetchStationDatabaseData(uid || user?.email);
        if (stationDb?.programas && stationDb.programas.length > 0) {
          data = stationDb.programas.map((p) => ({
            id: p.id,
            nome: p.nome,
            apresentador_id: p.apresentador_id || null,
            dias_semana: Array.isArray(p.dias_semana) ? p.dias_semana : (typeof p.dias_semana === 'string' ? p.dias_semana.split(',') : []),
            horario_inicio: p.horario_inicio,
            horario_fim: p.horario_fim,
          })) as any;
        } else {
          const clientAcc = findClientAccountByEmail(user?.email) || findClientAccountById(uid);
          const stationName = clientAcc?.nome || "POSITIVA FM";
          const fallbackProgsResult = getClientHouseMixProgramsSync(stationName);
          const fallbackProgs: any[] = Array.isArray(fallbackProgsResult)
            ? fallbackProgsResult
            : (fallbackProgsResult?.programas || []);
          data = fallbackProgs.map((p) => ({
            id: p.id,
            nome: p.nome,
            apresentador_id: p.apresentador_id || null,
            dias_semana: p.dias_semana || [],
            horario_inicio: p.horario_inicio,
            horario_fim: p.horario_fim,
          })) as any;
          if (!tz && clientAcc?.timezone) {
            tz = clientAcc.timezone;
          }
        }
      }

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
        let foto: string | null = null;
        if (current.apresentador_id) {
          const { data: ap } = await supabase.from("apresentadores").select("foto").eq("id", current.apresentador_id).maybeSingle();
          foto = (ap as any)?.foto || null;
        }
        if (!foto) {
          const { getApresentadores } = await import("./ApresentadorForm");
          const aps = await getApresentadores(uid, user?.email);
          const resCurrent = resolvePresenterForProgram(current, aps, uid || user?.email);
          foto = resCurrent?.foto || null;
        }
        if (!cancelled) setOnAirLocutorFoto(foto);
      }

      if (next) {
        let apNome = "";
        let apFoto: string | null = null;
        if (next.apresentador_id) {
          const { data: ap } = await supabase.from("apresentadores").select("nome, foto").eq("id", next.apresentador_id).maybeSingle();
          apNome = (ap as any)?.nome || "";
          apFoto = (ap as any)?.foto || null;
        }
        if (!apFoto || !apNome) {
          const { getApresentadores } = await import("./ApresentadorForm");
          const aps = await getApresentadores(uid, user?.email);
          const resNext = resolvePresenterForProgram(next, aps, uid || user?.email);
          if (!apNome) apNome = resNext?.nome || "";
          if (!apFoto) apFoto = resNext?.foto || null;
        }
        if (!cancelled) setNextProgram({ foto: apFoto, apresentador: apNome, programa: next?.nome || "", inicio: next?.horario_inicio || "", fim: next?.horario_fim || "" });
      } else if (!cancelled) setNextProgram(null);
    };
    load();
    // Poll a cada 10s para pegar a virada com precisão
    const iv = setInterval(load, 10000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [user, effectiveUserId]);

  // Helper: find current on-air program and fetch only its thumb
  const findCurrentOnAirThumb = useCallback(async (overrideUserId?: string) => {
    const clientAcc = findClientAccountByEmail(user?.email) || findClientAccountById(user?.id);
    const uid = overrideUserId || effectiveUserId || clientAcc?.parentUserId || (clientAcc?.id && isUuid(clientAcc.id) ? clientAcc.id : null) || (user?.id && isUuid(user.id) ? user.id : null);
    if (!uid) return null;
    let data: any = null;
    let emp: any = null;
    if (isUuid(uid)) {
      const res = await Promise.all([
        supabase
          .from("programas")
          .select("id, dias_semana, horario_inicio, horario_fim, selo")
          .eq("user_id", uid)
          .eq("ativo", true)
          .ilike("estudio", "%fm%"),
        supabase.from("empresa_config").select("timezone").eq("user_id", uid).maybeSingle(),
      ]);
      data = res[0].data;
      emp = res[1].data;
    }
    let progList = data;
    if (!progList || progList.length === 0) {
      const stationDb = await fetchStationDatabaseData(uid || user?.email);
      if (stationDb?.programas && stationDb.programas.length > 0) {
        progList = stationDb.programas as any;
      }
    }
    if (!progList || progList.length === 0) return null;

    // Usa o mesmo resolver com pré-carga do próximo na última minutagem, no fuso da emissora
    const { current } = resolveEffectiveOnAir(progList as any[], new Date(), (emp as any)?.timezone || null);
    if (!current) return null;

    if ((current as any)?.selo) return (current as any).selo;
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

    // A Home nunca pode permanecer no skeleton indefinidamente se o Supabase não responder.
    const safetyTimer = window.setTimeout(() => {
      if (!cancelled) {
        console.warn("Dashboard: timeout de carregamento inicial; liberando a Home.");
        setInitialLoading(false);
      }
    }, 10000);

    const loadAll = async () => {
      try {
      // Check if this user is a client account or sub-user
      const clientAcc = findClientAccountByEmail(user.email) || findClientAccountById(user.id);

      if (clientAcc?.isSubUser && clientAcc.parentUserId) {
        const parentId = clientAcc.parentUserId;
        setSubUserModules(new Set(clientAcc.allowedModules || []));
        setEffectiveUserId(parentId);
        setParentEmail(clientAcc.parentEmail || null);

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
        const parentCfg = {
          nome: pd?.nome || clientAcc.nome || "",
          logo: pd?.logo || "",
          backgroundUrl: pd?.background_url || "",
          endereco: pd?.endereco || clientAcc.cidade || "",
          telefoneComercial: pd?.telefone_comercial || "",
          telefoneParticipacao: pd?.telefone_participacao || "",
          site: pd?.site || "",
          instagram: pd?.instagram || "",
          facebook: pd?.facebook || "",
          youtube: pd?.youtube || "",
          plano: pd?.plano || clientAcc.plano || "",
        };
        setEmpresa(parentCfg);
        setEmpresaTimezone((pd as any)?.timezone || clientAcc.timezone || null);
        if (parentCfg.plano) {
          supabase.from("planos").select("enabled_modules").eq("name", parentCfg.plano).maybeSingle().then(({ data }) => {
            if (!cancelled && data?.enabled_modules) setPlanModules(new Set(data.enabled_modules));
          });
        }
        setInitialLoading(false);

        const thumb = await findCurrentOnAirThumb(parentId);
        if (!cancelled) {
          const finalThumb = thumb || parentCfg.backgroundUrl || null;
          prevThumbRef.current = finalThumb;
          setOnAirThumb(finalThumb);
        }
        return;
      }

      const isUserUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
      let modulesRes: any = { data: null };
      let empresaRes: any = { data: null };
      let subUserRes: any = { data: null };

      if (isUserUuid) {
        [modulesRes, empresaRes, subUserRes] = await Promise.all([
          supabase.from("client_modules").select("module_key, enabled").eq("user_id", user.id),
          supabase.from("empresa_config").select("*").eq("user_id", user.id).maybeSingle(),
          supabase.from("sub_users").select("allowed_modules, parent_user_id, ativo").eq("auth_user_id", user.id).maybeSingle(),
        ]);
      }

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
        const parentCfg = {
          nome: pd?.nome || clientAcc?.nome || "",
          logo: pd?.logo || "",
          backgroundUrl: pd?.background_url || "",
          endereco: pd?.endereco || clientAcc?.cidade || "",
          telefoneComercial: pd?.telefone_comercial || "",
          telefoneParticipacao: pd?.telefone_participacao || "",
          site: pd?.site || "",
          instagram: pd?.instagram || "",
          facebook: pd?.facebook || "",
          youtube: pd?.youtube || "",
          plano: pd?.plano || clientAcc?.plano || "",
        };
        setEmpresa(parentCfg);
        setEmpresaTimezone((pd as any)?.timezone || clientAcc?.timezone || null);
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

      // Modules
      if (modulesRes.data && modulesRes.data.length > 0) {
        setEnabledModules(new Set(modulesRes.data.filter((m: any) => m.enabled).map((m: any) => m.module_key)));
      }

      // Empresa config
      const d = empresaRes.data;
      const cfg = {
        nome: d?.nome || clientAcc?.nome || "",
        logo: d?.logo || "",
        backgroundUrl: d?.background_url || "",
        endereco: d?.endereco || clientAcc?.cidade || "",
        telefoneComercial: d?.telefone_comercial || "",
        telefoneParticipacao: d?.telefone_participacao || "",
        site: d?.site || "",
        instagram: d?.instagram || "",
        facebook: d?.facebook || "",
        youtube: d?.youtube || "",
        plano: d?.plano || clientAcc?.plano || "",
      };
      setEmpresa(cfg);
      setEmpresaTimezone((d as any)?.timezone || clientAcc?.timezone || null);

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
      } catch (error) {
        console.error("Dashboard: falha ao carregar dados iniciais da Home:", error);
      } finally {
        if (!cancelled) setInitialLoading(false);
      }
    };

    void loadAll();
    return () => {
      cancelled = true;
      window.clearTimeout(safetyTimer);
    };
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
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [user, initialLoading, findCurrentOnAirThumb]);

  // TEMPORÁRIO: liberar todas as páginas e menus para todos os usuários.
  // O controle granular por plano e subusuário será reativado em uma etapa posterior.
  const isModuleEnabled = (_page: Page): boolean => true;

  const planKeyAllowed = (_node: { label: string; page?: unknown }): boolean => true;

  const filterMenuChildren = (children: MenuChild[]): MenuChild[] =>
    children.map(c => (c.children ? { ...c, children: filterMenuChildren(c.children) } : c));

  const isMenuItemVisible = (_item: MenuItem): boolean => true;

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
      currentPage !== "logos" &&
      currentPage !== "agenda" &&
      currentPage !== "programas" &&
      currentPage !== "apresentadores" &&
      currentPage !== "ouvintes" &&
      currentPage !== "previsao" &&
      currentPage !== "broadcast" &&
      currentPage !== "cenario" &&
      currentPage !== "vmix" &&
      currentPage !== "relatorios" &&
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


  const handleChildClick = (child: { label: string; page?: Page; disabled?: boolean }, parentLabel: string) => {
    if (child.disabled) return;
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
    const targetPage = child.page || ((child as any).label?.toLowerCase() === "programas" ? "programas" : (child as any).label?.toLowerCase() === "apresentadores" ? "apresentadores" : (child as any).label?.toLowerCase() === "ouvintes" ? "ouvintes" : undefined);
    if (targetPage) {
      setCurrentPage(targetPage as Page);
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
    <div data-app-shell className="h-screen flex flex-col animate-fade-in overflow-hidden relative" style={{ backgroundColor: isAdmin ? "#f4f6fa" : "#080d18", backgroundImage: !isAdmin && currentPage === "dashboard" ? "radial-gradient(ellipse at 15% 0%, rgba(0,101,249,0.22), transparent 42%), radial-gradient(ellipse at 100% 100%, rgba(0,66,163,0.18), transparent 45%)" : "none" }}>
      <DashboardRuntimeEffects pauseMusicSync={currentPage === "musica"} effectiveUserId={effectiveUserId} />

      {/* Floating player dock: sits at root level; when currentPage !== 'dashboard', sits behind pages (z-[2]); on dashboard sits at z-30 */}
      {!isAdmin && (
        <Suspense fallback={null}>
          <FloatingMiniPlayer
            isBehindPages={currentPage !== "dashboard" && !isWindowMode}
            effectiveUserId={targetStationUserId}
          />
        </Suspense>
      )}

      {/* Floating on-air presenter dock: sits at bottom right of Home; when currentPage !== 'dashboard', sits behind pages (z-[2]); on dashboard sits at z-30 */}
      {!isAdmin && (
        <Suspense fallback={null}>
          <FloatingOnAirPresenter
            isBehindPages={currentPage !== "dashboard" && !isWindowMode}
            effectiveUserId={targetStationUserId}
          />
        </Suspense>
      )}

      {/* Background layers */}
      {isDashboard && isAdmin && (
        <div className="absolute inset-0 z-0" style={{ backgroundColor: "#f4f6fa" }} />
      )}


      {/* ===== TOP HEADER BAR (desktop) ===== */}
      {isAdmin ? (
        <div className="relative z-50">
          <SuperAdminHeader
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onLogout={onLogout}
            userEmail={user?.email || "alex@nexobrasil.net"}
          />
        </div>
      ) : (
        <div className="relative z-50">
          <HouseMixHeader
            currentPage={currentPage}
            onNavigate={setCurrentPage}
            onLogout={onLogout}
            userEmail={user?.email || ""}
            desktopDeviceBadge={window.houseMixDesktop ? desktopStationRole.badge : null}
            empresaNome={empresa.nome}
            empresaLogo={empresa.logo}
            empresaTimezone={empresaTimezone}
            stationId={targetStationUserId}
            playerState={playerState}
            allowedPages={null}
            showBots={subUserModules === null}
            pageTitle={currentPage !== "dashboard" && !isWindowMode ? pageTitle[currentPage] : undefined}
            onGoBack={() => {
              setMinimizedModules(prev => prev.filter(p => p !== currentPage));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes(currentPage)) return prev;
                return [...prev, currentPage];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
            canMinimize={MINIMIZABLE_PAGES.includes(currentPage)}
          />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-y-auto relative z-20">

        {/* Mobile top bar */}
        <div className="lg:hidden flex items-center justify-between px-4 pt-3 pb-2 relative z-[1]">
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 rounded-lg" style={{ backgroundColor: "rgba(0,0,0,0.4)" }}>
            {mobileMenuOpen ? <X size={20} className="text-white" /> : <Menu size={20} className="text-white" />}
          </button>
          <h1 className="font-bold text-lg truncate flex-1 ml-3" style={{ color: isDashboard ? layoutColors.navText : layoutColors.pageText }}>{empresa.nome || "Dashboard"}</h1>
          <div className="relative flex-shrink-0 mr-2" data-intercom-anchor>
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("intercom:open"))}
              className="flex items-center justify-center rounded-full transition-all active:scale-95"
              style={{ width: 32, height: 32, backgroundColor: `${layoutColors.accentColor}26`, color: layoutColors.accentColor }}
              aria-label="Intercomunicador"
            >
              <Radio size={15} />
            </button>
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold transition-all mr-2"
            style={{ backgroundColor: `${layoutColors.accentColor}26`, color: layoutColors.accentColor }}
          >
            <LogOut size={10} /> Sair
          </button>
          <ServerClock timezone={empresaTimezone} stationId={targetStationUserId} />
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
                <img src={isAdmin ? logoNxo : logoMenu} alt={isAdmin ? "nx." : "nexohub"} className="h-6 w-auto" />
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
                                  <button onClick={() => !child.disabled && handleChildClick(child, item.label)}
                                    disabled={child.disabled}
                                    className={`w-full flex items-center gap-2 px-3 rounded-lg text-xs transition-all active:scale-[0.98] ${
                                      child.disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : ""
                                    }`}
                                    style={{
                                      minHeight: 40,
                                      color: child.disabled ? `${layoutColors.navText}66` : childActive ? layoutColors.accentColor : `${layoutColors.navText}b3`,
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
                                      <button key={grand.label} onClick={() => !grand.disabled && handleChildClick(grand, child.label)}
                                        disabled={grand.disabled}
                                        className={`w-full flex items-center gap-2 pl-8 pr-3 rounded-lg text-[11px] transition-all active:scale-[0.98] ${
                                          grand.disabled ? "opacity-40 cursor-not-allowed pointer-events-none" : ""
                                        }`}
                                        style={{
                                          minHeight: 36,
                                          color: grand.disabled ? `${layoutColors.navText}44` : grandActive ? layoutColors.accentColor : `${layoutColors.navText}80`,
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






        {/* ===== MAIN CONTENT AREA ===== */}
        <div className={`flex-1 min-h-0 ${currentPage === "cortevideo" ? "pb-0 px-2 lg:px-4" : "pb-4 px-4 lg:px-8"} relative z-10 flex flex-col`}>
          <div className={`${!isAdmin ? (currentPage === "cortevideo" ? "w-full flex flex-col flex-1 min-h-0" : "max-w-[1600px] mx-auto w-full flex flex-col flex-1 min-h-0") : "w-full flex flex-col flex-1"}`}>

          {/* Module actions portal (used by pages for global action buttons) */}
          {currentPage !== "dashboard" && !isAdmin && !isWindowMode && (
            <div id="module-actions-portal" className="flex items-center gap-2 justify-end" />
          )}

          <div className={`relative flex-1 h-full ${isAdmin ? "max-w-[1600px] mx-auto w-full flex flex-col" : ""}`}>
            <div ref={contentScrollRef} className={`flex-1 h-full ${currentPage === "cortevideo" ? "overflow-hidden !p-0" : "overflow-y-auto overflow-x-hidden"} ${isAdmin ? "rounded-3xl" : "rounded-2xl"} ${currentPage !== "dashboard" && !isWindowMode ? "mv-content-area" : ""}`} style={(currentPage === "dashboard" || isWindowMode) ? {} : (currentPage === "cortevideo" ? { padding: 0 } : { padding: isAdmin ? "1.5rem" : "0.5rem" })}>
            <Suspense fallback={
              <ModulePageSkeleton
                variant={
                  currentPage === "musica" ? "musica" :
                  currentPage === "financeiro" ? "financeiro" :
                  currentPage === "clientes" ? "clientes" :
                  currentPage === "configuracoes" ? (isAdmin ? "configuracoes" : "form") :
                  (currentPage === "produtos" || currentPage === "housemix") ? "produtos" :
                  currentPage === "agenda" ? "agenda" :
                  (currentPage === "dashboard" && isAdmin) ? "dashboard" :
                  (currentPage === "curtidas" || currentPage === "fans") ? "table" :
                  ["apresentadores", "programas", "ouvintes", "noticias", "sorteios", "promocoes", "testemunhais", "shopping", "preroll", "cortevideo", "linkbio", "enquete", "quiz", "tp", "configtelapromo", "site"].includes(currentPage) ? "form" :
                  "list"
                }
              />
            }>
              {/* CustomizableDashboard stays mounted so audio player keeps streaming while user navigates */}
              <div style={{ display: (currentPage === "dashboard" || isWindowMode) ? "block" : "none", height: (currentPage === "dashboard" || isWindowMode) ? "auto" : 0, overflow: (currentPage === "dashboard" || isWindowMode) ? "visible" : "hidden" }}>
                {/* Avoid keeping a second ChatbotHome mounted while its window owns the Realtime channel. */}
                {displayedPill === "Chatbot" && currentPage !== "chatbot" && (isAdmin || !minimizedModules.includes("chatbot")) && (
                  <div className={pillAnimClass}>
                    <ChatbotHome />
                  </div>
                )}
                <div style={{ display: displayedPill === "Chatbot" ? "none" : "block" }} className={displayedPill !== "Chatbot" ? pillAnimClass : ""}>
                  {isAdmin ? <AdminClientsDashboard onNavigate={setCurrentPage} /> : <CustomizableDashboard onNavigate={setCurrentPage} effectiveUserId={effectiveUserId} isActive={currentPage === "dashboard" || isWindowMode} />}
                </div>
              </div>



              {!isAdmin && currentPage === "admininfomusic" && <AdminInfoMusicPage />}
              {currentPage === "financeiro" && <FinanceiroSuperAdminPage />}
              {isAdmin && currentPage === "chatbot" && <ChatbotHome />}
              {isAdmin && (currentPage === "apresentadores" || (minimizedModules.includes("apresentadores") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "apresentadores" ? "block" : "none" }}>
                  <ApresentadorForm effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "previsao" || (minimizedModules.includes("previsao") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "previsao" ? "block" : "none" }}>
                  <PrevisaoTempo effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "clientes" || (minimizedModules.includes("clientes") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "clientes" ? "block" : "none" }}>
                  <ClientesPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "ouvintes" || (minimizedModules.includes("ouvintes") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "ouvintes" ? "block" : "none" }}>
                  <OuvintesPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "sorteios" || (minimizedModules.includes("sorteios") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "sorteios" ? "block" : "none" }}>
                  <SorteiosPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "blitz" || (minimizedModules.includes("blitz") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "blitz" ? "block" : "none" }}>
                  <BlitzPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && currentPage === "relatorios" && (
                <Suspense fallback={<ModulePageSkeleton variant="table" />}>
                  <RelatoriosPage effectiveUserId={effectiveUserId} />
                </Suspense>
              )}
              {isAdmin && (currentPage === "noticias" || (minimizedModules.includes("noticias") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "noticias" ? "block" : "none" }}>
                  <RoteiroPrograma effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "programas" || (minimizedModules.includes("programas") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "programas" ? "block" : "none" }}>
                  <ProgramaForm effectiveUserId={effectiveUserId} />
                </div>
              )}
              {/* MusicaNoAr mounted only when active or minimized on dashboard */}
              {isAdmin && (currentPage === "musica" || (minimizedModules.includes("musica") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "musica" ? "block" : "none" }}>
                  <Suspense fallback={<ModulePageSkeleton variant="musica" />}>
                    <MusicaNoAr effectiveUserId={effectiveUserId} autoStartReader={desktopStartupEnabled} />
                  </Suspense>
                </div>
              )}
              {isAdmin && (currentPage === "agenda" || (minimizedModules.includes("agenda") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "agenda" ? "block" : "none" }}>
                  <AgendaPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {currentPage === "curtidas" && <MusicasCurtidasPage />}
              {isAdmin && currentPage === "configuracoes" && <ConfiguracoesPage section="empresa" isSuperAdmin={isAdmin} effectiveUserId={effectiveUserId} />}
              {isAdmin && (currentPage === "playerconfig" || (minimizedModules.includes("playerconfig") && currentPage === "dashboard")) && (
                <div className="keep-dark-layout" style={{ display: currentPage === "playerconfig" ? "block" : "none" }}>
                  <ConfiguracoesPage section="player" effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "testemunhais" || (minimizedModules.includes("testemunhais") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "testemunhais" ? "block" : "none" }}>
                  <TestemunhaisPage effectiveUserId={effectiveUserId || targetStationUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "promocoes" || (minimizedModules.includes("promocoes") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "promocoes" ? "block" : "none" }}>
                  <PromocoesPage effectiveUserId={effectiveUserId || targetStationUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "configtelapromo" || (minimizedModules.includes("configtelapromo") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "configtelapromo" ? "block" : "none" }}>
                  <ConfigTelaPromoPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "logos" || (minimizedModules.includes("logos") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "logos" ? "block" : "none" }}>
                  <LogosPatrocinadoresPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {currentPage === "shopping" && <ShoppingPage effectiveUserId={effectiveUserId} />}
              {isAdmin && (currentPage === "preroll" || (minimizedModules.includes("preroll") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "preroll" ? "block" : "none" }}>
                  <PreRollPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "cortevideo" || (minimizedModules.includes("cortevideo") && currentPage === "dashboard")) && (
                <div className={currentPage === "cortevideo" ? "h-full w-full flex flex-col flex-1 min-h-0" : ""} style={{ display: currentPage === "cortevideo" ? "flex" : "none", height: currentPage === "cortevideo" ? "100%" : undefined }}>
                  <CortesVideoPage />
                </div>
              )}
              {currentPage === "backup" && <BackupPage effectiveUserId={effectiveUserId} />}
              {currentPage === "vmix" && <VmixPage />}
              {currentPage === "propostas" && <PropostasPage effectiveUserId={effectiveUserId} />}
              {currentPage === "tp" && <TeleprompterPage />}
              {isAdmin && (currentPage === "cenario" || (minimizedModules.includes("cenario") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "cenario" ? "block" : "none" }}>
                  <CenariosPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "broadcast" || (minimizedModules.includes("broadcast") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "broadcast" ? "block" : "none" }}>
                  <BroadcastPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "batalha" || (minimizedModules.includes("batalha") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "batalha" ? "block" : "none" }}>
                  <BatalhaMusicalPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "enquete" || (minimizedModules.includes("enquete") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "enquete" ? "block" : "none" }}>
                  <EnquetePage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "quiz" || (minimizedModules.includes("quiz") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "quiz" ? "block" : "none" }}>
                  <QuizPage effectiveUserId={effectiveUserId} />
                </div>
              )}
              {isAdmin && (currentPage === "site" || (minimizedModules.includes("site") && currentPage === "dashboard")) && (
                <div style={{ display: currentPage === "site" ? "block" : "none" }}>
                  <SitePage effectiveUserId={effectiveUserId || user?.id || null} />
                </div>
              )}
              {/* Produtos (Página de Cadastro e Catálogo de Produtos) */}
              {currentPage === "produtos" && (
                <ProdutosPage
                  accentColor={layoutColors.accentColor}
                  onNavigate={(p) => setCurrentPage(p as Page)}
                />
              )}

              {/* House Mix (Página Exclusiva do Produto House Mix) */}
              {(currentPage === "housemix" || (isAdmin && ["modulos", "subusuarios", "pacotes", "admininfomusic"].includes(currentPage))) && (
                <HouseMixPage
                  initialTab={
                    currentPage === "subusuarios"
                      ? "subusuarios"
                      : currentPage === "pacotes"
                      ? "pacotes"
                      : currentPage === "admininfomusic"
                      ? "infomusic"
                      : "modulos"
                  }
                  accentColor={layoutColors.accentColor}
                  adminModulosGroups={adminModulosGroups as never}
                  subUsuarioModulosGroups={subUsuarioModulosGroups as never}
                  effectiveUserId={effectiveUserId}
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
                    const child = ((c as any)?.page ? c : findChild(group?.children)) ?? {
                      label: c.label,
                      page: (c as any)?.page || (c.label?.toLowerCase() === "programas" ? "programas" : undefined),
                    };
                    handleChildClick(child as any, parent);
                  }}
                  onNavigate={(p) => setCurrentPage(p as Page)}
                />
              )}
              {!isAdmin && currentPage === "pacotes" && <PacotesPage accentColor={layoutColors.accentColor} />}
              {!isAdmin && currentPage === "subusuarios" && (
                <SubUsuariosPage groups={subUsuarioModulosGroups as never} accentColor={layoutColors.accentColor} />
              )}
              {!isAdmin && currentPage === "modulos" && (
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
                    const child = ((c as any)?.page ? c : findChild(group?.children)) ?? {
                      label: c.label,
                      page: (c as any)?.page || (c.label?.toLowerCase() === "programas" ? "programas" : undefined),
                    };
                    handleChildClick(child as any, parent);
                  }}
                />
              )}
              {currentPage === "fans" && <FansPage radioName={empresa?.nome || undefined} />}
              
            </Suspense>
            </div>
            {currentPage !== "dashboard" && !isWindowMode && showContentScrollIndicator && (
              <div
                className="absolute inset-y-4 right-2 z-30 flex items-stretch justify-center pointer-events-auto select-none group/scroll"
                style={{ width: "32px" }}
              >
                {/* Trilho Interativo com Drag Suave e Tons de Azul */}
                <div
                  className="relative flex-1 h-full flex items-stretch justify-center cursor-pointer"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsScrollDragging(true);
                    const track = e.currentTarget;
                    const rect = track.getBoundingClientRect();
                    const scrollEl = contentScrollRef.current;
                    if (!scrollEl) return;
                    const thumbHeight = 48;
                    const availableHeight = Math.max(rect.height - thumbHeight, 1);
                    const setScrollFromY = (clientY: number) => {
                      const offsetY = clientY - rect.top - (thumbHeight / 2);
                      const ratio = Math.min(Math.max(offsetY / availableHeight, 0), 1);
                      scrollEl.scrollTop = ratio * (scrollEl.scrollHeight - scrollEl.clientHeight);
                    };
                    setScrollFromY(e.clientY);
                    const onMove = (ev: MouseEvent) => { ev.preventDefault(); setScrollFromY(ev.clientY); };
                    const onUp = () => {
                      setIsScrollDragging(false);
                      window.removeEventListener("mousemove", onMove);
                      window.removeEventListener("mouseup", onUp);
                    };
                    window.addEventListener("mousemove", onMove);
                    window.addEventListener("mouseup", onUp);
                  }}
                >
                  {/* Linha do Trilho em Azul Suave (#d0deff) que expande no hover */}
                  <div
                    className={`absolute top-0 bottom-0 rounded-full transition-all duration-200 ease-out ${
                      isScrollDragging
                        ? "w-[10px] bg-[#d0deff]/80"
                        : "w-[4px] group-hover/scroll:w-[10px] bg-[#d0deff]/40 group-hover/scroll:bg-[#d0deff]/80"
                    }`}
                  />

                  {/* Cursor de Rolagem em Azul Sólido (#0055ff) sem gradiente, expande no hover */}
                  <div
                    className={`absolute rounded-full bg-[#0055ff] transition-all duration-200 ease-out ${
                      isScrollDragging
                        ? "w-[16px] bg-[#0042cc] shadow-[0_0_14px_rgba(0,85,255,0.5)] ring-2 ring-[#d0deff] cursor-grabbing"
                        : "w-[6px] group-hover/scroll:w-[14px] hover:bg-[#0042cc] group-hover/scroll:shadow-[0_2px_10px_rgba(0,85,255,0.35)] cursor-grab"
                    }`}
                    style={{
                      height: "48px",
                      top: `calc(${contentScrollProgress} * (100% - 48px))`,
                      left: "50%",
                      transform: "translateX(-50%)",
                    }}
                  />
                </div>
              </div>
            )}
          </div>
          {/* end max-w wrapper */}
          </div>
        </div>

        {/* House Mix Window Mode - Link Bio */}
        {!isAdmin && (currentPage === "linkbio" || (minimizedModules.includes("linkbio") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – LINK BIO"
            wide
            isOpen={currentPage === "linkbio"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "linkbio"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => prev.includes("linkbio") ? prev : [...prev, "linkbio"]);
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <LinkBioPage effectiveUserId={targetStationUserId}/>
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Nexo Plugins */}
        {!isAdmin && (currentPage === "nexoplugins" || (minimizedModules.includes("nexoplugins") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – DOWNLOADS"
            wide
            isOpen={currentPage === "nexoplugins"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "nexoplugins"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("nexoplugins")) return prev;
                return [...prev, "nexoplugins"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <NexoPluginsPage />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Cadastro de Clientes */}
        {!isAdmin && (currentPage === "clientes" || (minimizedModules.includes("clientes") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CADASTRO DE CLIENTES"
            isOpen={currentPage === "clientes"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "clientes"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("clientes")) return prev;
                return [...prev, "clientes"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="clientes" />}>
              <ClientesPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Cadastro de Participantes */}
        {!isAdmin && (currentPage === "apresentadores" || (minimizedModules.includes("apresentadores") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CADASTRO DE PARTICIPANTES"
            isOpen={currentPage === "apresentadores"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "apresentadores"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("apresentadores")) return prev;
                return [...prev, "apresentadores"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <ApresentadorForm effectiveUserId={targetStationUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Cadastro de Ouvintes */}
        {!isAdmin && (currentPage === "ouvintes" || (minimizedModules.includes("ouvintes") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CADASTRO DE OUVINTES"
            isOpen={currentPage === "ouvintes"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "ouvintes"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("ouvintes")) return prev;
                return [...prev, "ouvintes"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <OuvintesPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Cadastro de Programas */}
        {!isAdmin && (currentPage === "programas" || (minimizedModules.includes("programas") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CADASTRO DE PROGRAMAS"
            isOpen={currentPage === "programas"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "programas"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("programas")) return prev;
                return [...prev, "programas"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <ProgramaForm effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Cadastro de Cidade Tempo */}
        {!isAdmin && (currentPage === "previsao" || (minimizedModules.includes("previsao") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CIDADE TEMPO"
            isOpen={currentPage === "previsao"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "previsao"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("previsao")) return prev;
                return [...prev, "previsao"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <PrevisaoTempo effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Sorteios */}
        {!isAdmin && (currentPage === "sorteios" || (minimizedModules.includes("sorteios") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – SORTEIOS"
            isOpen={currentPage === "sorteios"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "sorteios"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("sorteios")) return prev;
                return [...prev, "sorteios"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="table" />}>
              <SorteiosPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Relatórios */}
        {!isAdmin && (currentPage === "relatorios" || (minimizedModules.includes("relatorios") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – RELATÓRIOS"
            wide
            isOpen={currentPage === "relatorios"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "relatorios"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => prev.includes("relatorios") ? prev : [...prev, "relatorios"]);
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="table" />}>
              <RelatoriosPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Blitz Promocionais */}
        {!isAdmin && (currentPage === "blitz" || (minimizedModules.includes("blitz") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – BLITZ PROMOCIONAIS"
            isOpen={currentPage === "blitz"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "blitz"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("blitz")) return prev;
                return [...prev, "blitz"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="table" />}>
              <BlitzPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Roteiro de Programa */}
        {!isAdmin && (currentPage === "noticias" || (minimizedModules.includes("noticias") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – ROTEIRO DE PROGRAMA"
            isOpen={currentPage === "noticias"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "noticias"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("noticias")) return prev;
                return [...prev, "noticias"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <RoteiroPrograma effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Música no Ar */}
        {!isAdmin && (currentPage === "musica" || (minimizedModules.includes("musica") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – MÚSICA NO AR"
            isOpen={currentPage === "musica"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "musica"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("musica")) return prev;
                return [...prev, "musica"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="musica" />}>
              <MusicaNoAr effectiveUserId={effectiveUserId} autoStartReader={desktopStartupEnabled} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Agenda */}
        {!isAdmin && (currentPage === "agenda" || (minimizedModules.includes("agenda") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – AGENDA"
            isOpen={currentPage === "agenda"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "agenda"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("agenda")) return prev;
                return [...prev, "agenda"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<AgendaPageSkeleton />}>
              <AgendaPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Gestor de Site */}
        {!isAdmin && (currentPage === "site" || (minimizedModules.includes("site") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – GESTOR DE SITE"
            isOpen={currentPage === "site"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "site"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("site")) return prev;
                return [...prev, "site"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <SitePage effectiveUserId={effectiveUserId || user?.id || null} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Configuração do Player */}
        {!isAdmin && (currentPage === "playerconfig" || (minimizedModules.includes("playerconfig") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CONFIGURAÇÃO DO PLAYER"
            isOpen={currentPage === "playerconfig"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "playerconfig"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("playerconfig")) return prev;
                return [...prev, "playerconfig"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <div className="keep-dark-layout">
              <Suspense fallback={<ModulePageSkeleton variant="form" />}>
                <ConfiguracoesPage section="player" effectiveUserId={effectiveUserId} />
              </Suspense>
            </div>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - ADS / Pré-Roll */}
        {!isAdmin && (currentPage === "preroll" || (minimizedModules.includes("preroll") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – ADS / PRÉ-ROLL"
            isOpen={currentPage === "preroll"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "preroll"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("preroll")) return prev;
                return [...prev, "preroll"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <PreRollPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Citações */}
        {!isAdmin && (currentPage === "testemunhais" || (minimizedModules.includes("testemunhais") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CITAÇÕES"
            isOpen={currentPage === "testemunhais"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "testemunhais"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("testemunhais")) return prev;
                return [...prev, "testemunhais"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <TestemunhaisPage effectiveUserId={effectiveUserId || targetStationUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Promoções */}
        {!isAdmin && (currentPage === "promocoes" || (minimizedModules.includes("promocoes") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – PROMOÇÕES"
            isOpen={currentPage === "promocoes"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "promocoes"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("promocoes")) return prev;
                return [...prev, "promocoes"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <PromocoesPage effectiveUserId={effectiveUserId || targetStationUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Logos dos Patrocinadores */}
        {!isAdmin && (currentPage === "logos" || (minimizedModules.includes("logos") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – LOGOS DOS PATROCINADORES"
            isOpen={currentPage === "logos"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "logos"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("logos")) return prev;
                return [...prev, "logos"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="table" />}>
              <LogosPatrocinadoresPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Config Módulo Locutor */}
        {!isAdmin && (currentPage === "configtelapromo" || (minimizedModules.includes("configtelapromo") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CONFIG MÓDULO LOCUTOR"
            isOpen={currentPage === "configtelapromo"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "configtelapromo"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("configtelapromo")) return prev;
                return [...prev, "configtelapromo"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <ConfigTelaPromoPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Broadcast */}
        {!isAdmin && (currentPage === "broadcast" || (minimizedModules.includes("broadcast") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – BROADCAST"
            isOpen={currentPage === "broadcast"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "broadcast"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("broadcast")) return prev;
                return [...prev, "broadcast"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <BroadcastPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Cenários */}
        {!isAdmin && (currentPage === "cenario" || (minimizedModules.includes("cenario") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CENÁRIOS"
            isOpen={currentPage === "cenario"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "cenario"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("cenario")) return prev;
                return [...prev, "cenario"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <CenariosPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Batalha Musical */}
        {!isAdmin && (currentPage === "batalha" || (minimizedModules.includes("batalha") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – BATALHA MUSICAL"
            isOpen={currentPage === "batalha"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "batalha"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("batalha")) return prev;
                return [...prev, "batalha"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <BatalhaMusicalPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Enquete */}
        {!isAdmin && (currentPage === "enquete" || (minimizedModules.includes("enquete") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – ENQUETE"
            isOpen={currentPage === "enquete"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "enquete"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("enquete")) return prev;
                return [...prev, "enquete"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <EnquetePage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Quiz */}
        {!isAdmin && (currentPage === "quiz" || (minimizedModules.includes("quiz") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – QUIZ"
            isOpen={currentPage === "quiz"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "quiz"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("quiz")) return prev;
                return [...prev, "quiz"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <QuizPage effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Editor de Vídeo */}
        {!isAdmin && (currentPage === "cortevideo" || (minimizedModules.includes("cortevideo") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – EDITOR DE VÍDEO"
            isOpen={currentPage === "cortevideo"}
            bodyClassName="flex-1 overflow-hidden p-0 bg-[#f8fafc] flex flex-col"
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "cortevideo"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("cortevideo")) return prev;
                return [...prev, "cortevideo"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="form" />}>
              <CortesVideoPage />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Configurações */}
        {!isAdmin && (currentPage === "configuracoes" || (minimizedModules.includes("configuracoes") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CONFIGURAÇÕES"
            isOpen={currentPage === "configuracoes"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "configuracoes"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("configuracoes")) return prev;
                return [...prev, "configuracoes"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="configuracoes" />}>
              <ConfiguracoesPage section="empresa" isSuperAdmin={isAdmin} effectiveUserId={effectiveUserId} />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* House Mix Window Mode - Chatbot & Atendimento WhatsApp */}
        {!isAdmin && (currentPage === "chatbot" || (minimizedModules.includes("chatbot") && (currentPage === "dashboard" || isWindowMode))) && (
          <HouseMixWindow
            title="HOUSE MIX – CHATBOT & ATENDIMENTO WHATSAPP"
            isOpen={currentPage === "chatbot"}
            onClose={() => {
              setMinimizedModules(prev => prev.filter(p => p !== "chatbot"));
              setCurrentPage("dashboard");
            }}
            onMinimize={() => {
              setMinimizedModules(prev => {
                if (prev.includes("chatbot")) return prev;
                return [...prev, "chatbot"];
              });
              setCurrentPageState("dashboard");
              try { window.dispatchEvent(new Event("app:page-change")); } catch { /* noop */ }
            }}
          >
            <Suspense fallback={<ModulePageSkeleton variant="table" />}>
              <ChatbotHome />
            </Suspense>
          </HouseMixWindow>
        )}

        {/* Dock com Pills Flutuantes para Módulos Minimizados */}
        {minimizedModules.some(mod => mod !== currentPage) && (currentPage === "dashboard" || isWindowMode) && (
          <div 
            className={`fixed bottom-5 ${!isAdmin ? "left-1/2 -translate-x-1/2" : "left-[88px]"} z-[70] flex flex-wrap items-center justify-center gap-2.5 pointer-events-none p-1`}
            style={{ maxWidth: "calc(100vw - 120px)" }}
          >
            {minimizedModules.filter(mod => mod !== currentPage).map((mod, idx) => (
              <div 
                key={mod}
                className="animate-in slide-in-from-bottom-3 duration-200 pointer-events-auto"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <div 
                  className="flex items-center gap-2.5 h-10 pl-3.5 pr-2 rounded-full bg-[#0055ff] border border-white/20 shadow-[0_8px_24px_rgba(0,85,255,0.4)] group transition-all duration-200 hover:bg-[#0047d4] hover:shadow-[0_10px_28px_rgba(0,85,255,0.55)] hover:scale-[1.02] active:scale-[0.98] cursor-pointer select-none"
                  onClick={() => {
                    setMinimizedModules(prev => prev.filter(m => m !== mod));
                    setCurrentPage(mod);
                  }}
                  title={`Restaurar ${HOUSEMIX_MODULE_DISPLAY_NAMES[mod] || pageTitle[mod] || mod}`}
                >
                  {/* Glowing Cyan Indicator Dot (matches window title bar) */}
                  <span className="w-2 h-2 rounded-full bg-[#38bdf8] shrink-0 shadow-[0_0_8px_#38bdf8] animate-pulse" />

                  {/* Clean Icon */}
                  <div className="flex-shrink-0 text-white flex items-center justify-center">
                    {(() => {
                      if (mod === "chatbot") return <MessageCircle size={15} />;
                      if (mod === "sorteios") return <Gift size={15} />;
                      if (mod === "previsao") return <CloudRain size={15} />;
                      if (mod === "agenda") return <CalendarDays size={15} />;
                      if (mod === "musica") return <Music size={15} />;
                      if (mod === "blitz") return <Siren size={15} />;
                      if (mod === "noticias") return <FileText size={15} />;
                      if (mod === "broadcast") return <Radio size={15} />;
                      if (mod === "site") return <Globe size={15} />;
                      if (mod === "promocoes") return <Tag size={15} />;
                      if (mod === "logos") return <Image size={15} />;
                      if (mod === "preroll") return <Film size={15} />;
                      if (mod === "testemunhais") return <MessageSquareQuote size={15} />;
                      if (mod === "cenario") return <MonitorPlay size={15} />;
                      if (mod === "batalha") return <Swords size={15} />;
                      if (mod === "enquete" || mod === "quiz") return <HelpCircle size={15} />;
                      if (mod === "cortevideo") return <Scissors size={15} />;
                      if (mod === "playerconfig" || mod === "configtelapromo" || mod === "configuracoes") return <Settings size={15} />;
                      if (mod === "apresentadores") return <Mic2 size={15} />;
                      if (mod === "clientes") return <Building2 size={15} />;
                      if (mod === "ouvintes") return <Users size={15} />;
                      if (mod === "programas") return <Radio size={15} />;
                      return <Users size={15} />;
                    })()}
                  </div>

                  {/* Title (matches window uppercase title style) */}
                  <span className="text-white text-[12px] font-bold uppercase tracking-wider truncate max-w-[220px]">
                    {HOUSEMIX_MODULE_DISPLAY_NAMES[mod] || pageTitle[mod] || mod}
                  </span>

                  {/* XML Ativo indicator for musica */}
                  {mod === "musica" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.9)] shrink-0" title="XML Ativo" />
                  )}

                  {/* Subtle vertical divider */}
                  <div className="h-4 w-px bg-white/20 mx-0.5 shrink-0" />

                  {/* Clean Close Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMinimizedModules(prev => prev.filter(m => m !== mod));
                    }}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/20 active:scale-90 transition-all cursor-pointer shrink-0"
                    title="Fechar"
                    aria-label="Fechar"
                  >
                    <X className="w-3.5 h-3.5 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

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
        <IntercomWidget />
      </Suspense>
    </div>
  );
}

function DashboardRuntimeEffects({ pauseMusicSync = false, effectiveUserId }: { pauseMusicSync?: boolean; effectiveUserId?: string | null }) {
  useGlobalMusicXmlUpload();
  useGlobalMusicSync(effectiveUserId, !pauseMusicSync);
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
function ProgramProgressBar({ inicio, fim }: { inicio: string; fim: string }) {
  const fillRef = useRef<HTMLDivElement>(null);
  const [sh, sm] = inicio.split(":").map(Number);
  const [eh, em] = fim.split(":").map(Number);
  const now = new Date();
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
      const clientAcc = findClientAccountByEmail(user?.email) || findClientAccountById(user?.id);
      const targetUid = clientAcc?.parentUserId || (clientAcc?.id && isUuid(clientAcc.id) ? clientAcc.id : null) || (user?.id && isUuid(user.id) ? user.id : null);
      if (!targetUid || !isUuid(targetUid)) return;

      const { data: settings } = await supabase
        .from("user_settings")
        .select("music_xml_url")
        .eq("user_id", targetUid)
        .maybeSingle();

      if (!settings?.music_xml_url) return;

      try {
        const m = getMusicData(targetUid);
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
    const clientAcc = findClientAccountByEmail(user?.email) || findClientAccountById(user?.id);
    const targetUid = clientAcc?.parentUserId || (clientAcc?.id && isUuid(clientAcc.id) ? clientAcc.id : null) || (user?.id && isUuid(user.id) ? user.id : null);
    if (!targetUid || !isUuid(targetUid)) {
      setLoading(false);
      return;
    }
    const fetchData = async () => {
      const [{ count }] = await Promise.all([
        supabase.from("logos_patrocinadores").select("*", { count: "exact", head: true }).eq("user_id", targetUid).eq("ativo", true),
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

  const DIAS_INDEX_MAP: Record<number, string[]> = {
    0: ["domingo", "dom"],
    1: ["segunda", "seg", "segunda-feira"],
    2: ["terca", "terça", "ter", "terca-feira", "terça-feira"],
    3: ["quarta", "qua", "quarta-feira"],
    4: ["quinta", "qui", "quinta-feira"],
    5: ["sexta", "sex", "sexta-feira"],
    6: ["sabado", "sábado", "sab", "sábado"],
  };

  const eventMatchesDate = (evt: any, dateStr: string) => {
    if (evt.data === dateStr && evt.recorrencia === "unico") return true;
    const checkDate = new Date(dateStr + "T12:00:00");
    const evtDate = new Date((evt.data || dateStr) + "T12:00:00");
    if (checkDate < evtDate && evt.recorrencia === "unico") return false;

    const dow = checkDate.getDay();
    const dowNames = DIAS_INDEX_MAP[dow] || [];
    const progDays = evt.programa?.dias_semana || evt.programa?.diasSemana;
    if (progDays && Array.isArray(progDays) && progDays.length > 0) {
      const normalizedDays = progDays.map((d: any) => String(d).trim().toLowerCase());
      return normalizedDays.some((d: any) => dowNames.some(dn => d.includes(dn)));
    }
    if (evt.recorrencia === "programa_semanal" || evt.recorrencia?.startsWith("programa_semanal:") || evt.recorrencia?.startsWith("dias:")) {
      let activeDays: number[] = [1, 2, 3, 4, 5];
      if (evt.dias_semana && Array.isArray(evt.dias_semana) && evt.dias_semana.length > 0) {
        activeDays = evt.dias_semana;
      } else if (evt.recorrencia.startsWith("programa_semanal:")) {
        activeDays = evt.recorrencia.slice(17).split(",").map(Number).filter((n: any) => !isNaN(n));
      } else if (evt.recorrencia.startsWith("dias:")) {
        activeDays = evt.recorrencia.slice(5).split(",").map(Number).filter((n: any) => !isNaN(n));
      }
      return activeDays.includes(dow);
    }
    if (evt.recorrencia === "semanal") return evtDate.getDay() === dow;
    if (evt.recorrencia === "mensal") return evtDate.getDate() === checkDate.getDate();
    return evt.data === dateStr;
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
    const clientAcc = findClientAccountByEmail(user?.email) || findClientAccountById(user?.id);
    const stationUid = clientAcc?.parentUserId || (clientAcc?.id && isUuid(clientAcc.id) ? clientAcc.id : null) || (user?.id && isUuid(user.id) ? user.id : null);

    const fetchData = async () => {
      let evts: any[] | null = null;
      if (stationUid && isUuid(stationUid)) {
        // Fetch user profile for event types config
        const { data: profile } = await supabase
          .from("profiles")
          .select("event_types_config")
          .eq("user_id", stationUid)
          .maybeSingle();
        
        if (profile?.event_types_config) {
          setEventTypesConfig(profile.event_types_config);
        }

        const { data: fetchedEvts } = await supabase
          .from("agenda_eventos")
          .select("*")
          .eq("user_id", stationUid)
          .order("data");

        if (fetchedEvts) {
          evts = fetchedEvts;
          setEventos(fetchedEvts as any);
        }
      }
      
      let progs: any[] = [];
      if (stationUid && isUuid(stationUid)) {
        try {
          const { data: pData } = await supabase.from("programas").select("*").eq("user_id", stationUid);
          if (pData && pData.length > 0) progs = pData;
        } catch {}
      }

      if (progs.length === 0) {
        try {
          const fallbackData = await fetchStationDatabaseData(stationUid || user.email);
          if (fallbackData?.programas && fallbackData.programas.length > 0) {
            progs = fallbackData.programas;
          }
        } catch {}
      }

      const evtsList = evts || [];
      const progMap = new Map(progs.map((p: any) => [p.id, p]));

      setEventos(evtsList.map((e: any) => ({
        ...e,
        programa: progMap.get(e.programa_id) || e.programa,
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
