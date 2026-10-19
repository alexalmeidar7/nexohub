import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

export interface ModuloChild {
  icon: LucideIcon;
  label: string;
  page?: string;
  children?: ModuloChild[];
}

export interface ModuloGroup {
  icon: LucideIcon;
  label: string;
  page?: string;
  children?: ModuloChild[];
}

interface ModulosPageProps {
  groups: ModuloGroup[];
  onSelectGroup: (group: ModuloGroup) => void;
  onSelectChild: (child: ModuloChild, parentLabel: string) => void;
  accentColor?: string;
}

export default function ModulosPage({ groups, onSelectGroup, onSelectChild, accentColor = "#0055ff" }: ModulosPageProps) {
  return (
    <div className="max-w-none mx-0 w-full space-y-6 pt-2 pb-12 font-sans animate-fade-in">
      {/* Header Section */}
      <section className="bg-white rounded-3xl p-6 lg:p-8 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90">
        <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
          Módulos do Sistema House Mix
        </h2>
        <p className="text-xs text-slate-400 font-medium mt-0.5">
          Visão geral de módulos e recursos vinculados aos pacotes e estações ativas
        </p>
      </section>

      <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {groups.map((group) => {
          const Icon = group.icon;
          const children = group.children ?? [];
          return (
            <div
              key={group.label}
              className="rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md transition-shadow flex flex-col overflow-hidden"
            >
              {/* Box do item principal */}
              <button
                type="button"
                onClick={() => onSelectGroup(group)}
                className="w-full flex items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-slate-50"
              >
                <span
                  className="flex items-center justify-center rounded-xl shrink-0"
                  style={{ width: 42, height: 42, backgroundColor: `${accentColor}1f`, color: accentColor }}
                >
                  <Icon size={20} />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[15px] font-semibold capitalize text-slate-800 truncate">
                    {group.label}
                  </span>
                  <span className="block text-[11px] text-slate-400">
                    {children.length > 0 ? `${children.length} itens` : "Abrir módulo"}
                  </span>
                </span>
                <ChevronRight size={16} className="text-slate-300" />
              </button>

              {/* Subitens */}
              {children.length > 0 && (
                <div className="border-t border-slate-100 bg-slate-50/60 px-2 py-2 flex flex-col gap-1">
                  {children.map((child) => {
                    const CIcon = child.icon;
                    const grandchildren = child.children ?? [];
                    return (
                      <div key={child.label} className="flex flex-col gap-1">
                        <button
                          type="button"
                          onClick={() => onSelectChild(child, group.label)}
                          className="w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-slate-600 hover:bg-white hover:text-slate-900 transition-colors"
                        >
                          <CIcon size={15} style={{ color: accentColor }} className="shrink-0" />
                          <span className="capitalize truncate">{child.label}</span>
                        </button>
                        {grandchildren.map((grand) => {
                          const GIcon = grand.icon;
                          return (
                            <button
                              key={grand.label}
                              type="button"
                              onClick={() => onSelectChild(grand, child.label)}
                              className="w-full flex items-center gap-2 rounded-lg pl-7 pr-2.5 py-1.5 text-left text-[12px] text-slate-500 hover:bg-white hover:text-slate-900 transition-colors"
                            >
                              <GIcon size={13} style={{ color: accentColor }} className="shrink-0" />
                              <span className="capitalize truncate">{grand.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
