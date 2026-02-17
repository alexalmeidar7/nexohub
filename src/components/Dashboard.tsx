import { useState, useEffect, useRef, useCallback } from "react";
import { Home, Sun, FileText, Mic2, PlaySquare, Music, CalendarDays, Settings, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import ApresentadorForm from "./ApresentadorForm";
import ProgramaForm from "./ProgramaForm";
import PrevisaoTempo from "./PrevisaoTempo";
import NoticiasPanel from "./NoticiasPanel";
import WeatherWidget from "./WeatherWidget";
import OnAirWidget from "./OnAirWidget";
import MusicaNoAr from "./MusicaNoAr";
import AgendaPage from "./AgendaPage";
import MusicWidget from "./MusicWidget";
import XmlLinkRow from "./XmlLinkRow";
import ConfiguracoesPage, { getEmpresaConfig } from "./ConfiguracoesPage";
import logoMenu from "@/assets/logo-menu.png";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { getMusicData } from "./MusicaNoAr";
import { useAuth } from "@/hooks/useAuth";

type Page = "dashboard" | "previsao" | "noticias" | "apresentadores" | "programas" | "musica" | "agenda" | "configuracoes";

const menuItems: { icon: typeof Home; label: string; page: Page }[] = [
  { icon: Home, label: "Home", page: "dashboard" },
  { icon: Sun, label: "Previsão do Tempo", page: "previsao" },
  { icon: FileText, label: "Notícias", page: "noticias" },
  { icon: Mic2, label: "Apresentadores", page: "apresentadores" },
  { icon: PlaySquare, label: "Programas", page: "programas" },
  { icon: Music, label: "Música tocando agora", page: "musica" },
  { icon: CalendarDays, label: "Agenda", page: "agenda" },
];

const pageTitle: Record<Page, string> = {
  dashboard: "Dashboard Home",
  previsao: "Previsão do Tempo",
  noticias: "Notícias",
  apresentadores: "Apresentadores",
  programas: "Programas",
  musica: "Música no Ar",
  agenda: "Agenda",
  configuracoes: "Configurações",
};

function SocialIcon({ url, children }: { url: string; children: React.ReactNode }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-gray-800 transition-colors">
      {children}
    </a>
  );
}

interface DashboardProps {
  onLogout?: () => void;
}

export default function Dashboard({ onLogout }: DashboardProps) {
  const { user } = useAuth();
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");
  const [empresa, setEmpresa] = useState<import("./ConfiguracoesPage").EmpresaConfig>({} as any);

  useEffect(() => {
    getEmpresaConfig().then(setEmpresa);
  }, [currentPage]);

  // Global music XML upload every 5s regardless of page
  useGlobalMusicXmlUpload();

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Sidebar - icon only */}
      <aside className="w-16 flex flex-col items-center py-4 gap-3" style={{ backgroundColor: "#1e1e1e" }}>
        <div className="mb-4">
          <img src={logoMenu} alt="MasterView" className="w-10 h-auto" />
        </div>

        {menuItems.map((item) => {
          const isActive = currentPage === item.page;
          const Icon = item.icon;
          return (
            <Tooltip key={item.page}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCurrentPage(item.page)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isActive ? "bg-primary" : "bg-transparent hover:bg-white/10"
                  }`}
                >
                  <Icon size={18} className={isActive ? "text-[#333]" : "text-muted-foreground"} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right"><p>{item.label}</p></TooltipContent>
            </Tooltip>
          );
        })}

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onLogout} className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-transparent hover:bg-red-500/20 mb-1">
              <LogOut size={18} className="text-red-400" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Sair</p></TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => setCurrentPage("configuracoes")}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all mb-2 ${
                currentPage === "configuracoes" ? "bg-primary" : "bg-transparent hover:bg-white/10"
              }`}
            >
              <Settings size={18} className={currentPage === "configuracoes" ? "text-[#333]" : "text-muted-foreground"} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Configurações</p></TooltipContent>
        </Tooltip>

        <div className="opacity-50">
          <span className="text-[8px] font-bold italic text-muted-foreground writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>
            svn✦broadcast
          </span>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 p-10 relative`}
        style={currentPage === "dashboard" ? { backgroundColor: "#e0e0e0" } : undefined}
      >
        <header className="mb-10 flex items-center gap-4">
          <h2 className={`text-3xl font-light ${currentPage === "dashboard" ? "text-gray-800" : ""}`}>{pageTitle[currentPage]}</h2>
          {currentPage === "dashboard" && empresa.nome && (
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-gray-800">{empresa.nome}</span>
              <div className="flex items-center gap-2">
                <SocialIcon url={empresa.instagram}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </SocialIcon>
                <SocialIcon url={empresa.facebook}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </SocialIcon>
                <SocialIcon url={empresa.youtube}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 00-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 00.502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 002.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 002.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg>
                </SocialIcon>
                {empresa.site && (
                  <SocialIcon url={empresa.site}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                  </SocialIcon>
                )}
              </div>
            </div>
          )}
          {/* Spacer to push clock to right */}
          <div className="flex-1" />
          {currentPage === "dashboard" && <ServerClock />}
        </header>
        <section
          className={`rounded-2xl p-8 min-h-[400px] ${currentPage === "dashboard" ? "" : "bg-surface-elevated border border-border"}`}
          style={currentPage === "dashboard" ? { backgroundColor: "#efefef" } : undefined}
        >
          {currentPage === "dashboard" && (
            <div className="animate-fade-in space-y-6">
              <p className="text-gray-500">
                Bem-vindo ao MasterView. Selecione uma opção no menu lateral.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-6">
                  <WeatherWidget />
                  <MusicWidget />
                </div>
                <OnAirWidget />
              </div>
              <UnifiedXmlField />
            </div>
          )}
          {currentPage === "previsao" && <PrevisaoTempo />}
          {currentPage === "noticias" && <NoticiasPanel />}
          {currentPage === "apresentadores" && <ApresentadorForm />}
          {currentPage === "programas" && <ProgramaForm />}
          {currentPage === "musica" && <MusicaNoAr />}
          {currentPage === "agenda" && <AgendaPage />}
          {currentPage === "configuracoes" && <ConfiguracoesPage />}
        </section>

        <div className="absolute bottom-10 right-10 opacity-80">
          <span className="text-foreground font-bold text-3xl tracking-tighter">
            svn<span className="text-lg">✦</span>broadcast
          </span>
        </div>
      </main>
    </div>
  );
}

// Server clock component
function ServerClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="text-right">
      <p className="text-2xl font-bold text-gray-800 font-mono tracking-wider">{time}</p>
      <p className="text-xs text-gray-500 capitalize">{date}</p>
    </div>
  );
}

// Unified XML field combining weather + news + music
const WEATHER_KEY = "masterview_last_city";

function UnifiedXmlField() {
  const [xmlContent, setXmlContent] = useState("");

  useEffect(() => {
    const update = async () => {
      let weatherXml = "";
      let newsXml = "";
      let musicXml = "";

      // Weather
      const savedCity = localStorage.getItem(WEATHER_KEY);
      if (savedCity) {
        try {
          const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(savedCity)}&count=1&language=pt`);
          const geo = await geoRes.json();
          if (geo.results?.length) {
            const { latitude, longitude, name } = geo.results[0];
            const wx = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=1`);
            const d = await wx.json();
            weatherXml = `  <tempo>\n    <cidade>${name}</cidade>\n    <temperatura>${Math.round(d.current.temperature_2m)}</temperatura>\n    <humidade>${d.current.relative_humidity_2m}</humidade>\n    <condicao_codigo>${d.current.weather_code}</condicao_codigo>\n    <minima>${Math.round(d.daily.temperature_2m_min[0])}</minima>\n    <maxima>${Math.round(d.daily.temperature_2m_max[0])}</maxima>\n    <chance_chuva>${d.daily.precipitation_probability_max[0] ?? 0}</chance_chuva>\n  </tempo>`;
          }
        } catch {}
      }

      // News from DB
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

      // Music
      const m = getMusicData();
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
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!xmlContent) return null;

  return (
    <div className="space-y-2">
      <XmlLinkRow label="XML MASTERVIEW" xmlContent={xmlContent} />
    </div>
  );
}

// Global hook: auto-upload music XML every 5s regardless of which page is open
function useGlobalMusicXmlUpload() {
  const { user } = useAuth();
  const lastContentRef = useRef<string>("");

  useEffect(() => {
    if (!user) return;

    const uploadMusicXml = async () => {
      // Get music XML URL from DB
      const { data: settings } = await supabase
        .from("user_settings")
        .select("music_xml_url")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!settings?.music_xml_url) return;

      try {
        const res = await fetch(settings.music_xml_url, { cache: "no-store" });
        const text = await res.text();

        // Only upload if content changed
        if (text === lastContentRef.current) return;
        lastContentRef.current = text;

        const file = new Blob([text], { type: "application/xml" });
        await supabase.storage
          .from("xml-files")
          .upload("musica-agora.xml", file, { upsert: true, contentType: "application/xml" });
      } catch {
        // silent
      }
    };

    uploadMusicXml();
    const interval = setInterval(uploadMusicXml, 5000);
    return () => clearInterval(interval);
  }, [user]);
}
