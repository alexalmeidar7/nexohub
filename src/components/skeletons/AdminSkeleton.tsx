/**
 * Skeleton loading das telas do painel Admin.
 * Alinhado ao padrão global "shimmer cyan Nexo" (ver src/index.css).
 */
const NEXO_CYAN = "#00BFF0";
const NEXO_CYAN_DARK = "#0AA9D8";

interface AdminSkeletonProps {
  variant?: "dashboard" | "list" | "modules" | "messages";
}

const cardStyle: React.CSSProperties = {
  background: "#FFFFFF",
  border: `1px solid color-mix(in srgb, ${NEXO_CYAN} 18%, transparent)`,
  boxShadow: "0 1px 2px rgba(10,37,64,0.04)",
};

function AdminHeader({ title = 220, subtitle = 320 }: { title?: number; subtitle?: number }) {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${NEXO_CYAN} 0%, ${NEXO_CYAN_DARK} 100%)`,
        padding: 18,
      }}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl" style={{ background: "rgba(255,255,255,0.25)" }} />
        <div className="flex-1 space-y-2">
          <div className="h-4 rounded" style={{ width: title, background: "rgba(255,255,255,0.35)" }} />
          <div className="h-2.5 rounded" style={{ width: subtitle, background: "rgba(255,255,255,0.22)" }} />
        </div>
        <div className="h-8 w-32 rounded-full" style={{ background: "rgba(255,255,255,0.28)" }} />
      </div>
    </div>
  );
}

export default function AdminSkeleton({ variant = "list" }: AdminSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-6">
        <AdminHeader title={180} subtitle={260} />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-6 flex items-center gap-4" style={cardStyle}>
              <div className="w-12 h-12 rounded-full nexo-skel-tile" />
              <div className="space-y-2 flex-1">
                <div className="h-7 w-16 nexo-skel-bar" />
                <div className="h-2.5 w-28 nexo-skel-bar" style={{ opacity: 0.6 }} />
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <div className="h-9 w-44 nexo-skel-pill" />
          <div className="h-9 w-44 nexo-skel-pill" style={{ opacity: 0.6 }} />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-32 nexo-skel-bar mb-3" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-xl px-5 py-3 flex items-center justify-between" style={cardStyle}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg nexo-skel-tile" />
                <div className="h-3 w-40 nexo-skel-bar" />
              </div>
              <div className="h-3 w-24 nexo-skel-bar" style={{ opacity: 0.6 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "modules") {
    return (
      <div className="space-y-6">
        <AdminHeader title={160} subtitle={240} />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-5 flex items-center gap-4" style={cardStyle}>
              <div className="w-10 h-10 rounded-lg nexo-skel-tile" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3.5 w-40 nexo-skel-bar" />
                <div className="h-2.5 w-64 nexo-skel-bar" style={{ opacity: 0.6 }} />
              </div>
              <div className="h-5 w-14 rounded nexo-skel-tile" style={{ opacity: 0.6 }} />
              <div className="w-8 h-8 rounded-full nexo-skel-tile" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "messages") {
    return (
      <div className="space-y-6">
        <AdminHeader title={200} subtitle={280} />
        <div className="rounded-2xl p-6 space-y-4" style={cardStyle}>
          <div className="h-4 w-40 nexo-skel-bar" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="h-2.5 w-20 nexo-skel-bar" style={{ opacity: 0.6 }} />
                <div className="h-9 w-full nexo-skel-tile" />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="h-2.5 w-20 nexo-skel-bar" style={{ opacity: 0.6 }} />
            <div className="h-24 w-full nexo-skel-tile" />
          </div>
          <div className="h-9 w-40 nexo-skel-pill" />
        </div>
        <div className="space-y-2">
          <div className="h-4 w-48 nexo-skel-bar mb-3" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl px-5 py-3 space-y-2" style={cardStyle}>
              <div className="flex items-center justify-between">
                <div className="h-3 w-40 nexo-skel-bar" />
                <div className="h-2.5 w-24 nexo-skel-bar" style={{ opacity: 0.6 }} />
              </div>
              <div className="h-2.5 w-full nexo-skel-bar" style={{ opacity: 0.6 }} />
              <div className="h-4 w-28 nexo-skel-pill" style={{ opacity: 0.7 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default "list" — AdminUsers
  return (
    <div className="space-y-6">
      <AdminHeader title={220} subtitle={300} />
      <div className="flex items-center justify-between">
        <div className="h-3 w-72 nexo-skel-bar" />
        <div className="h-9 w-36 nexo-skel-pill" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl p-5 space-y-4" style={cardStyle}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg nexo-skel-tile" />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <div className="h-3.5 w-32 nexo-skel-bar" />
                    <div className="h-4 w-14 nexo-skel-pill" style={{ opacity: 0.7 }} />
                    <div className="h-3 w-40 nexo-skel-bar" style={{ opacity: 0.6 }} />
                  </div>
                  <div className="h-2.5 w-20 nexo-skel-bar" style={{ opacity: 0.6 }} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-7 w-32 nexo-skel-pill" />
                <div className="h-7 w-20 nexo-skel-pill" style={{ opacity: 0.6 }} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, j) => (
                <div
                  key={j}
                  className="flex items-center justify-between p-3 rounded-lg"
                  style={{ border: `1px solid color-mix(in srgb, ${NEXO_CYAN} 15%, transparent)` }}
                >
                  <div className="h-3 w-20 nexo-skel-bar" />
                  <div className="h-5 w-9 nexo-skel-pill" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
