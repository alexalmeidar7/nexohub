import { useState } from "react";
import { Home, Sun, FileText, Mic2, PlaySquare, Music } from "lucide-react";
import ApresentadorForm from "./ApresentadorForm";
import ProgramaForm from "./ProgramaForm";
import PrevisaoTempo from "./PrevisaoTempo";
import NoticiasPanel from "./NoticiasPanel";
import WeatherWidget from "./WeatherWidget";
import OnAirWidget from "./OnAirWidget";
import MusicaNoAr from "./MusicaNoAr";
import MusicWidget from "./MusicWidget";
import logoMenu from "@/assets/logo-menu.png";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Page = "dashboard" | "previsao" | "noticias" | "apresentadores" | "programas" | "musica";

const menuItems: { icon: typeof Home; label: string; page: Page }[] = [
  { icon: Home, label: "Home", page: "dashboard" },
  { icon: Sun, label: "Previsão do Tempo", page: "previsao" },
  { icon: FileText, label: "Notícias", page: "noticias" },
  { icon: Mic2, label: "Apresentadores", page: "apresentadores" },
  { icon: PlaySquare, label: "Programas", page: "programas" },
  { icon: Music, label: "Música tocando agora", page: "musica" },
];

const pageTitle: Record<Page, string> = {
  dashboard: "Dashboard Home",
  previsao: "Previsão do Tempo",
  noticias: "Notícias",
  apresentadores: "Apresentadores",
  programas: "Programas",
  musica: "Música no Ar",
};

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Sidebar - icon only */}
      <aside className="w-16 flex flex-col items-center py-4 gap-3" style={{ backgroundColor: "#1e1e1e" }}>
        {/* Logo */}
        <div className="mb-4">
          <img src={logoMenu} alt="MasterView" className="w-10 h-auto" />
        </div>

        {/* Menu icons */}
        {menuItems.map((item) => {
          const isActive = currentPage === item.page;
          const Icon = item.icon;
          return (
            <Tooltip key={item.page}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setCurrentPage(item.page)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isActive
                      ? "bg-primary"
                      : "bg-transparent hover:bg-white/10"
                  }`}
                >
                  <Icon
                    size={18}
                    className={isActive ? "text-[#333]" : "text-muted-foreground"}
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{item.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}

        <div className="mt-auto opacity-50">
          <span className="text-[8px] font-bold italic text-muted-foreground writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>
            svn✦broadcast
          </span>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-10 relative">
        <header className="mb-10">
          <h2 className="text-3xl font-light">{pageTitle[currentPage]}</h2>
        </header>
        <section className="bg-surface-elevated rounded-2xl p-8 border border-border min-h-[400px]">
          {currentPage === "dashboard" && (
            <div className="animate-fade-in space-y-6">
              <p className="text-muted-foreground">
                Bem-vindo ao MasterView. Selecione uma opção no menu lateral.
              </p>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <WeatherWidget />
                <OnAirWidget />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <MusicWidget />
              </div>
            </div>
          )}
          {currentPage === "previsao" && <PrevisaoTempo />}
          {currentPage === "noticias" && <NoticiasPanel />}
          {currentPage === "apresentadores" && <ApresentadorForm />}
          {currentPage === "programas" && <ProgramaForm />}
          {currentPage === "musica" && <MusicaNoAr />}
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
