/**
 * Skeleton do shell principal do Dashboard.
 * Segue o padrão global Nexo (shimmer cyan) definido em src/index.css.
 */
const NEXO_CYAN = "#00BFF0";
const NEXO_DARK = "#0A2540";

export default function DashboardSkeleton() {
  return (
    <div className="h-screen flex overflow-hidden" style={{ backgroundColor: "#f8f9fc" }}>
      {/* Sidebar */}
      <div className="hidden lg:flex flex-shrink-0 py-3 pl-3">
        <div
          className="flex flex-col items-center py-4 gap-3 rounded-2xl"
          style={{ width: 58, backgroundColor: NEXO_DARK }}
        >
          <div className="w-10 h-6 mt-1 mb-3 nexo-skel-bar on-dark" />
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="w-10 h-10 rounded-full nexo-skel-tile on-dark" style={{ opacity: 0.6 + (i % 3) * 0.15 }} />
          ))}
          <div className="flex-1" />
          <div className="w-10 h-10 rounded-full nexo-skel-tile on-dark" />
          <div className="w-10 h-10 rounded-full nexo-skel-tile on-dark" style={{ opacity: 0.7 }} />
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="px-8 pt-6 pb-4">
          <div
            className="rounded-2xl overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${NEXO_CYAN} 0%, #0AA9D8 100%)`,
              padding: 18,
            }}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.25)" }} />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-48 rounded" style={{ background: "rgba(255,255,255,0.35)" }} />
                <div className="h-2.5 w-72 rounded" style={{ background: "rgba(255,255,255,0.22)" }} />
              </div>
              <div className="h-8 w-28 rounded-full" style={{ background: "rgba(255,255,255,0.28)" }} />
            </div>
          </div>
        </div>

        {/* Body — bento-style tiles */}
        <div className="flex-1 px-6 pb-4 grid grid-cols-1 md:grid-cols-3 gap-4 auto-rows-[minmax(140px,1fr)]">
          {[
            "md:col-span-2 md:row-span-2",
            "",
            "",
            "md:col-span-2",
            "",
            "",
          ].map((cls, i) => (
            <div
              key={i}
              className={`rounded-2xl p-4 ${cls}`}
              style={{
                background: "#FFFFFF",
                border: `1px solid color-mix(in srgb, ${NEXO_CYAN} 18%, transparent)`,
                boxShadow: "0 1px 2px rgba(10,37,64,0.04)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <div className="w-6 h-6 rounded-md nexo-skel-tile" />
                <div className="h-3 w-24 nexo-skel-bar" />
              </div>
              <div className="space-y-2">
                <div className="h-2.5 w-3/4 nexo-skel-bar" style={{ opacity: 0.7 }} />
                <div className="h-2.5 w-1/2 nexo-skel-bar" style={{ opacity: 0.5 }} />
                <div className="h-16 w-full nexo-skel-tile mt-3" style={{ opacity: 0.55 }} />
              </div>
            </div>
          ))}
        </div>

        <div className="px-8 pb-3 pt-2 flex justify-center">
          <div className="h-3 w-40 nexo-skel-bar" style={{ opacity: 0.6 }} />
        </div>
      </div>
    </div>
  );
}
