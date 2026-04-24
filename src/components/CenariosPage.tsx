import { lazy, Suspense, useState } from "react";
import { MonitorPlay, Tv, Loader2 } from "lucide-react";

const CenarioInterativoPage = lazy(() => import("./CenarioInterativoPage"));
const CenariosEstudioPage = lazy(() => import("./CenariosEstudioPage"));

type Tab = "interativo" | "estudio";

const TABS: { id: Tab; label: string; icon: typeof MonitorPlay }[] = [
  { id: "interativo", label: "Cenário Interativo", icon: MonitorPlay },
  { id: "estudio", label: "Cenários Estúdio", icon: Tv },
];

export default function CenariosPage() {
  const [tab, setTab] = useState<Tab>("interativo");

  return (
    <div className="space-y-4">
      {/* Themed pill tabs — matches the "Criar novo template" button style */}
      <div
        className="inline-flex items-center gap-1 p-1 rounded-full"
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

      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Carregando...
          </div>
        }
      >
        {tab === "interativo" ? <CenarioInterativoPage /> : <CenariosEstudioPage />}
      </Suspense>
    </div>
  );
}
