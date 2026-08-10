import { lazy, Suspense, useState } from "react";
import { Image as ImageIcon, Globe } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";

const CenariosEstudioPage = lazy(() => import("./CenariosEstudioPage"));
const CenariosEstudioWebPage = lazy(() => import("./CenariosEstudioWebPage"));

type SubTab = "imagens" | "web";

const SUB_TABS: { id: SubTab; label: string; icon: typeof ImageIcon }[] = [
  { id: "imagens", label: "Cenário por imagens", icon: ImageIcon },
  { id: "web", label: "Cenário web", icon: Globe },
];

export default function CenariosEstudioTabs() {
  const [tab, setTab] = useState<SubTab>("imagens");

  return (
    <div className="space-y-4">
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        vMix — Cenários Estúdio
      </div>
      <div
        className="inline-flex items-center gap-1 p-1 rounded-full"
        style={{
          background: "color-mix(in srgb, var(--layout-page-text, #0d0446) 4%, var(--layout-page-bg, #ffffff))",
          border: "1px solid color-mix(in srgb, var(--layout-page-text, #0d0446) 8%, transparent)",
        }}
      >
        {SUB_TABS.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="inline-flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-full transition-all"
              style={
                active
                  ? {
                      background: "var(--layout-accent-color, #2563eb)",
                      color: "var(--layout-page-bg, #ffffff)",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.08)",
                    }
                  : {
                      background: "transparent",
                      color: "color-mix(in srgb, var(--layout-page-text, #0d0446) 70%, transparent)",
                    }
              }
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          );
        })}
      </div>

      <Suspense fallback={<ModulePageSkeleton />}>
        {tab === "imagens" ? <CenariosEstudioPage /> : <CenariosEstudioWebPage />}
      </Suspense>
    </div>
  );
}
