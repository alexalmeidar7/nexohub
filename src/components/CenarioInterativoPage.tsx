import { MonitorPlay } from "lucide-react";

export default function CenarioInterativoPage() {
  return (
    <div className="animate-fade-in space-y-5">
      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--layout-page-bg, #ffffff)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" }}>
        <div className="px-6 py-4 flex items-center gap-3" style={{ background: "linear-gradient(135deg, var(--layout-header-bg, #0d0446), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
            <MonitorPlay size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold drop-shadow-sm">Cenário Interativo</h3>
            <p className="text-xs drop-shadow-sm" style={{ opacity: 0.8 }}>Gerencie cenários interativos para suas transmissões</p>
          </div>
        </div>
        <div className="p-8 flex flex-col items-center justify-center min-h-[300px] text-center">
          <MonitorPlay size={48} style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 20%, transparent)" }} />
          <p className="text-sm font-semibold mt-4" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Em breve</p>
          <p className="text-xs mt-1" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
            O módulo de cenários interativos está sendo desenvolvido.
          </p>
        </div>
      </div>
    </div>
  );
}
