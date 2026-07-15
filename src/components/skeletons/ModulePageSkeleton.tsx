/**
 * Skeleton loading padrão dos módulos internos (admin).
 * Usa o shimmer cyan Nexo definido em `src/index.css`
 * (.nexo-skel-bar / .nexo-skel-pill / .nexo-skel-tile).
 */
const NEXO_CYAN = "#00BFF0";
const NEXO_CYAN_DARK = "#0AA9D8";

interface Props {
  /** "list" = cards list (default), "form" = form + tabela, "table" = só tabela */
  variant?: "list" | "form" | "table";
}

function HeaderBlock() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${NEXO_CYAN} 0%, ${NEXO_CYAN_DARK} 100%)`,
        padding: 18,
      }}
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-xl"
          style={{ background: "rgba(255,255,255,0.25)" }}
        />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 w-48 rounded" style={{ background: "rgba(255,255,255,0.35)" }} />
          <div className="h-2.5 w-72 rounded" style={{ background: "rgba(255,255,255,0.22)" }} />
        </div>
        <div className="h-8 w-28 rounded-full" style={{ background: "rgba(255,255,255,0.28)" }} />
      </div>
    </div>
  );
}

function ActionBar() {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="h-9 w-32 nexo-skel-pill" />
      <div className="h-9 w-28 nexo-skel-pill" style={{ opacity: 0.7 }} />
      <div className="h-9 w-24 nexo-skel-pill" style={{ opacity: 0.5 }} />
    </div>
  );
}

function CardsList() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-2xl p-4 flex items-center gap-4"
          style={{
            background: "#F1F9FC",
            border: `1px solid color-mix(in srgb, ${NEXO_CYAN} 18%, transparent)`,
          }}
        >
          <div className="w-12 h-12 rounded-xl nexo-skel-tile shrink-0" />
          <div className="flex-1 space-y-2 min-w-0">
            <div className="h-3.5 w-2/5 nexo-skel-bar" />
            <div className="h-2.5 w-3/5 nexo-skel-bar" style={{ opacity: 0.65 }} />
          </div>
          <div className="h-6 w-16 nexo-skel-pill" style={{ opacity: 0.7 }} />
          <div className="w-8 h-8 rounded-full nexo-skel-tile" />
        </div>
      ))}
    </div>
  );
}

function TableRowsSkeleton() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "#F1F9FC",
        border: `1px solid color-mix(in srgb, ${NEXO_CYAN} 18%, transparent)`,
      }}
    >
      {/* Header */}
      <div
        className="flex gap-4 px-4 py-3"
        style={{ background: `color-mix(in srgb, ${NEXO_CYAN} 12%, transparent)` }}
      >
        {[90, 160, 110, 70, 50].map((w, i) => (
          <div key={i} className="h-2.5 nexo-skel-bar" style={{ width: w, opacity: 0.9 }} />
        ))}
      </div>
      {/* Rows */}
      <div className="divide-y" style={{ borderColor: "rgba(0,191,240,0.12)" }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <div className="w-8 h-8 rounded-lg nexo-skel-tile shrink-0" />
            <div className="h-3 flex-1 max-w-[220px] nexo-skel-bar" />
            <div className="h-3 w-24 nexo-skel-bar" style={{ opacity: 0.7 }} />
            <div className="h-3 w-16 nexo-skel-bar" style={{ opacity: 0.55 }} />
            <div className="flex gap-2 ml-auto">
              <div className="w-7 h-7 rounded-full nexo-skel-tile" />
              <div className="w-7 h-7 rounded-full nexo-skel-tile" style={{ opacity: 0.7 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FormBlock() {
  return (
    <div
      className="rounded-2xl p-5 space-y-4"
      style={{
        background: "#F1F9FC",
        border: `1px solid color-mix(in srgb, ${NEXO_CYAN} 18%, transparent)`,
      }}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <div className="h-2.5 w-24 nexo-skel-bar" style={{ opacity: 0.7 }} />
            <div className="h-10 w-full nexo-skel-tile" />
          </div>
        ))}
      </div>
      <div className="space-y-1.5">
        <div className="h-2.5 w-20 nexo-skel-bar" style={{ opacity: 0.7 }} />
        <div className="h-24 w-full nexo-skel-tile" />
      </div>
      <div className="flex gap-3 pt-1">
        <div className="h-9 w-28 nexo-skel-pill" />
        <div className="h-9 w-24 nexo-skel-pill" style={{ opacity: 0.6 }} />
      </div>
    </div>
  );
}

export default function ModulePageSkeleton({ variant = "list" }: Props) {
  if (variant === "form") {
    return (
      <div className="space-y-5">
        <HeaderBlock />
        <FormBlock />
        <TableRowsSkeleton />
      </div>
    );
  }
  if (variant === "table") {
    return (
      <div className="space-y-5">
        <HeaderBlock />
        <TableRowsSkeleton />
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <HeaderBlock />
      <ActionBar />
      <CardsList />
    </div>
  );
}

export { FormBlock as FormSkeleton, TableRowsSkeleton };
