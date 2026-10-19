import { Suspense, useState } from "react";
import { MonitorPlay, Tv } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { lazyRetry } from "@/lib/lazyRetry";


const CenarioInterativoPage = lazyRetry(() => import("./CenarioInterativoPage"));
const CenariosEstudioPage = lazyRetry(() => import("./CenariosEstudioTabs"));

type Tab = "interativo" | "estudio";

const TABS: { id: Tab; label: string; icon: typeof MonitorPlay }[] = [
  { id: "interativo", label: "Cenário Interativo", icon: MonitorPlay },
  { id: "estudio", label: "Cenários Estúdio", icon: Tv },
];

export default function CenariosPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const [tab, setTab] = useState<Tab>("interativo");

  return (
    <div className="nexo-scope w-full max-w-none mx-0 rounded-2xl border border-slate-200 bg-[#F8FAFC] p-3 sm:p-4 space-y-4">
      {/* Themed pill tabs and on-air info */}
      <div className="flex items-center gap-3 flex-wrap w-full">
        <div
          className="inline-flex items-center gap-1 p-1 rounded-full shrink-0"
          style={{
            background: "color-mix(in srgb, var(--layout-page-text, #0d0446) 6%, var(--layout-page-bg, #ffffff))",
            border: "1px solid color-mix(in srgb, var(--layout-page-text, #0d0446) 10%, transparent)",
          }}
        >
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-full transition-all"
                style={
                  active
                    ? {
                        background: "var(--layout-accent-color, #2563eb)",
                        color: "var(--layout-page-bg, #ffffff)",
                        boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                      }
                    : {
                        background: "transparent",
                        color: "color-mix(in srgb, var(--layout-page-text, #0d0446) 75%, transparent)",
                      }
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            );
          })}
        </div>

        <div id="cenario-preview-toolbar" className="flex items-center gap-2 flex-wrap self-center" />
      </div>

      <Suspense
        fallback={<ModulePageSkeleton />}
      >
        {tab === "interativo" ? <CenarioInterativoPage effectiveUserId={effectiveUserId} /> : <CenariosEstudioPage effectiveUserId={effectiveUserId} />}
      </Suspense>
    </div>
  );
}
