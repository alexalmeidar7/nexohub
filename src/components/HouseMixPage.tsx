import { useState, useEffect } from "react";
import { Radio, Users, Package, Music, KeyRound, ChevronRight, PlaySquare } from "lucide-react";
import ModulosPage, { type ModuloGroup, type ModuloChild } from "./ModulosPage";
import SubUsuariosPage from "./SubUsuariosPage";
import PacotesPage from "./PacotesPage";
import AdminInfoMusicPage from "./AdminInfoMusicPage";
import HouseMixAcessoUsuario from "./HouseMixAcessoUsuario";
import ProgramaForm from "./ProgramaForm";

export type HouseMixTab = "acesso" | "modulos" | "programas" | "subusuarios" | "pacotes" | "infomusic";

interface HouseMixPageProps {
  initialTab?: HouseMixTab;
  accentColor?: string;
  adminModulosGroups: ModuloGroup[];
  subUsuarioModulosGroups: ModuloGroup[];
  effectiveUserId?: string | null;
  onSelectGroup?: (group: ModuloGroup) => void;
  onSelectChild?: (child: ModuloChild, parentLabel: string) => void;
  onNavigate?: (page: string) => void;
}

export default function HouseMixPage({
  initialTab = "acesso",
  accentColor = "#0055ff",
  adminModulosGroups,
  subUsuarioModulosGroups,
  effectiveUserId,
  onSelectGroup,
  onSelectChild,
  onNavigate,
}: HouseMixPageProps) {
  const [activeTab, setActiveTab] = useState<HouseMixTab>(initialTab);

  // Sincroniza se a prop inicial mudar externamente (ex: atalhos ou links diretos)
  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const tabs: { id: HouseMixTab; label: string; icon: typeof Radio; badge?: string }[] = [
    { id: "acesso", label: "Acesso Usuário", icon: KeyRound },
    { id: "modulos", label: "Módulos Rádio", icon: Radio },
    { id: "programas", label: "Programas & Grade", icon: PlaySquare },
    { id: "subusuarios", label: "Subusuários & Perfis", icon: Users },
    { id: "pacotes", label: "Pacotes & Planos", icon: Package },
    { id: "infomusic", label: "Info Music", icon: Music },
  ];

  return (
    <div className="w-full max-w-none mx-0 space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* Top Banner: Gestão do Produto House Mix */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-200/80 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#002132] to-[#01334e] text-white flex items-center justify-center shadow-sm shrink-0 border border-slate-800/10">
              <Radio className="w-6 h-6 text-[#0055ff]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl lg:text-2xl font-black tracking-tight text-[#002132]">
                  House Mix
                </h1>
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                Central unificada de gestão da plataforma House Mix: vincule emissoras, configure credenciais de acesso usuário, módulos de rádio, permissões de subusuários, pacotes e acervo Info Music.
              </p>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-medium hidden sm:flex items-center gap-1.5 bg-slate-50 px-3.5 py-1.5 rounded-full border border-slate-200/60">
            <span>produtos</span>
            <ChevronRight className="w-3 h-3 opacity-60" />
            <span className="text-slate-700 font-semibold">house mix</span>
            <ChevronRight className="w-3 h-3 opacity-60" />
            <span className="text-[#0055ff] font-bold">
              {tabs.find((t) => t.id === activeTab)?.label}
            </span>
          </div>
        </div>

        {/* Tab Selector em Pílulas Flat com Azul Oficial (#0055ff) */}
        <div className="pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  if (tab.id === "modulos") onNavigate?.("housemix");
                }}
                className={`group flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-tight whitespace-nowrap transition-all duration-200 select-none active:scale-[0.98] ${
                  isActive
                    ? "bg-[#0055ff] text-white shadow-[0_4px_14px_rgba(0,85,255,0.28)] border border-[#0055ff]"
                    : "bg-slate-100/80 hover:bg-slate-200/80 text-slate-600 hover:text-[#002132] border border-slate-200/40"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 transition-colors ${isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Content Area da Aba Selecionada */}
      <div className="animate-in fade-in duration-200">
        {activeTab === "acesso" && (
          <HouseMixAcessoUsuario />
        )}

        {activeTab === "modulos" && (
          <ModulosPage
            groups={adminModulosGroups as never}
            accentColor={accentColor}
            onSelectGroup={onSelectGroup || (() => {})}
            onSelectChild={onSelectChild || (() => {})}
          />
        )}

        {activeTab === "programas" && (
          <div className="pt-2">
            <ProgramaForm effectiveUserId={effectiveUserId} />
          </div>
        )}

        {activeTab === "subusuarios" && (
          <SubUsuariosPage
            groups={subUsuarioModulosGroups as never}
            accentColor={accentColor}
          />
        )}

        {activeTab === "pacotes" && (
          <PacotesPage accentColor={accentColor} />
        )}

        {activeTab === "infomusic" && (
          <AdminInfoMusicPage />
        )}
      </div>
    </div>
  );
}
