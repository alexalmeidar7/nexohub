import { useState } from "react";
import { Home, Sun, FileText, Mic2, PlaySquare } from "lucide-react";
import NavItem from "./NavItem";
import ApresentadorForm from "./ApresentadorForm";
import ProgramaForm from "./ProgramaForm";
import PrevisaoTempo from "./PrevisaoTempo";
import NoticiasPanel from "./NoticiasPanel";
import WeatherWidget from "./WeatherWidget";

type Page = "dashboard" | "previsao" | "noticias" | "apresentadores" | "programas";

export default function Dashboard() {
  const [currentPage, setCurrentPage] = useState<Page>("dashboard");

  const pageTitle: Record<Page, string> = {
    dashboard: "Dashboard Home",
    previsao: "Previsão do Tempo",
    noticias: "Notícias",
    apresentadores: "Apresentadores",
    programas: "Programas",
  };

  return (
    <div className="min-h-screen bg-background flex text-foreground">
      {/* Sidebar */}
      <aside className="w-64 border-r border-sidebar-border flex flex-col">
        <div className="p-6 flex items-center gap-2 text-primary">
          <div className="rotate-90 font-black tracking-tighter text-xl border-b-2 border-primary">
            MASTER
          </div>
          <span className="text-xs">✦</span>
        </div>
        <nav className="flex-1 mt-4">
          <NavItem icon={<Home size={20} />} label="Home" active={currentPage === "dashboard"} onClick={() => setCurrentPage("dashboard")} />
          <NavItem icon={<Sun size={20} />} label="Previsão do tempo" active={currentPage === "previsao"} onClick={() => setCurrentPage("previsao")} />
          <NavItem icon={<FileText size={20} />} label="Notícias" active={currentPage === "noticias"} onClick={() => setCurrentPage("noticias")} />
          <NavItem icon={<Mic2 size={20} />} label="Apresentadores" active={currentPage === "apresentadores"} onClick={() => setCurrentPage("apresentadores")} />
          <NavItem icon={<PlaySquare size={20} />} label="Programas" active={currentPage === "programas"} onClick={() => setCurrentPage("programas")} />
        </nav>
        <div className="p-6 opacity-50">
          <span className="text-xs font-bold italic">svn✦broadcast</span>
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
              <WeatherWidget />
            </div>
          )}
          {currentPage === "previsao" && <PrevisaoTempo />}
          {currentPage === "noticias" && <NoticiasPanel />}
          {currentPage === "apresentadores" && <ApresentadorForm />}
          {currentPage === "programas" && <ProgramaForm />}
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
