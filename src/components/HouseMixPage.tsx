import { useState, useEffect } from "react";
import { Radio, Users, Package, Music, Layers, ShieldCheck, Sparkles, ChevronRight } from "lucide-react";
import ModulosPage, { type ModuloGroup, type ModuloChild } from "./ModulosPage";
import SubUsuariosPage from "./SubUsuariosPage";
import PacotesPage from "./PacotesPage";
import AdminInfoMusicPage from "./AdminInfoMusicPage";

export type HouseMixTab = "modulos" | "subusuarios" | "pacotes" | "infomusic";

interface HouseMixPageProps {
  initialTab?: HouseMixTab;
  accentColor?: string;
  adminModulosGroups: ModuloGroup[];
  subUsuarioModulosGroups: ModuloGroup[];
  onSelectGroup?: (group: ModuloGroup) => void;
  onSelectChild?: (child: ModuloChild, parentLabel: string) => void;
  onNavigate?: (page: string) => void;
}

export default function HouseMixPage({
  initialTab = "modulos",
  accentColor = "#0055ff",
  adminModulosGroups,
  subUsuarioModulosGroups,
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
    { id: "modulos", label: "Módulos Rádio", icon: Radio },
    { id: "subusuarios", label: "Subusuários & Perfis", icon: Users },
    { id: "pacotes", label: "Pacotes & Planos", icon: Package },
    { id: "infomusic", label: "Info Music", icon: Music },
  ];

  return (
    <div className="max-w-[1400px] mx-auto w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* Top Banner: Gestão do Produto House Mix */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-black to-slate-800 text-white flex items-center justify-center shadow-md shrink-0">
              <Radio className="w-6 h-6 text-[#00BFF0]" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl lg:text-2xl font-black tracking-tight text-[#002132]">
                  House Mix
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-[#0055ff]/10 text-[#0055ff] border border-[#0055ff]/20">
                  Produto Principal da Agência
                </span>
              </div>
              <p className="text-xs text-slate-400 font-medium mt-1">
                Central unificada de gestão da plataforma House Mix: configure módulos de rádio, permissões de subusuários, pacotes contratáveis e acervo Info Music.
              </p>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-medium hidden sm:flex items-center gap-1.5 bg-slate-50 px-3.5 py-1.5 rounded-full border border-slate-100">
            <span>produtos</span>
            <ChevronRight className="w-3 h-3 opacity-60" />
            <span className="text-slate-700 font-semibold">house mix</span>
            <ChevronRight className="w-3 h-3 opacity-60" />
            <span className="text-[#0055ff] font-bold">
              {tabs.find((t) => t.id === activeTab)?.label}
            </span>
          </div>
        </div>

        {/* Tab Selector em Pílulas Flat */}
        <div className="pt-2 border-t border-slate-100/80 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setActiveTab(tab.id);
                  // Notifica navegação se aplicável
                  if (tab.id === "modulos") onNavigate?.("housemix");
                }}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all select-none ${
                  isActive
                    ? "bg-[#000000] text-white shadow-sm"
                    : "bg-slate-100/70 hover:bg-slate-200/70 text-slate-600 hover:text-slate-900"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[#00BFF0]" : "opacity-60"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Content Area da Aba Selecionada */}
      <div className="animate-in fade-in duration-200">
        {activeTab === "modulos" && (
          <ModulosPage
            groups={adminModulosGroups as never}
            accentColor={accentColor}
            onSelectGroup={onSelectGroup || (() => {})}
            onSelectChild={onSelectChild || (() => {})}
          />
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
