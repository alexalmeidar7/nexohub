import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  /** "list" = cards list (default), "form" = form fields + table, "table" = just table */
  variant?: "list" | "form" | "table";
}

function FormSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Title */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-44 bg-white/15 rounded" />
        <Skeleton className="h-3 w-64 bg-white/8 rounded" />
      </div>
      {/* Form fields grid */}
      <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-24 bg-white/10 rounded" />
              <Skeleton className="h-10 w-full bg-white/6 rounded-xl" />
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-2.5 w-20 bg-white/10 rounded" />
          <Skeleton className="h-20 w-full bg-white/6 rounded-xl" />
        </div>
        <div className="flex gap-3 pt-2">
          <Skeleton className="h-9 w-28 rounded-full bg-white/12" />
          <Skeleton className="h-9 w-24 rounded-full bg-white/8" />
        </div>
      </div>
      {/* Table */}
      <TableRowsSkeleton />
    </div>
  );
}

function TableRowsSkeleton() {
  return (
    <div className="space-y-2">
      {/* Table header */}
      <div className="flex gap-4 px-4 py-2">
        {[80, 140, 100, 60].map((w, i) => (
          <Skeleton key={i} className="h-2.5 bg-white/10 rounded" style={{ width: w }} />
        ))}
      </div>
      {/* Table rows */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl px-4 py-3 flex items-center gap-4"
          style={{ backgroundColor: i % 2 === 0 ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.02)" }}
        >
          <Skeleton className="w-8 h-8 rounded-lg bg-white/8 flex-shrink-0" />
          <Skeleton className="h-3 bg-white/12 rounded flex-1" style={{ maxWidth: 160 }} />
          <Skeleton className="h-3 bg-white/8 rounded" style={{ width: 90 }} />
          <Skeleton className="h-3 bg-white/8 rounded" style={{ width: 60 }} />
          <div className="flex gap-2 ml-auto">
            <Skeleton className="w-7 h-7 rounded-full bg-white/8" />
            <Skeleton className="w-7 h-7 rounded-full bg-white/8" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ModulePageSkeleton({ variant = "list" }: Props) {
  if (variant === "form") return <FormSkeleton />;
  if (variant === "table") return <div className="animate-pulse"><TableRowsSkeleton /></div>;

  return (
    <div className="space-y-6 animate-pulse">
      {/* Title area */}
      <div className="space-y-2">
        <Skeleton className="h-5 w-48 bg-white/15 rounded" />
        <Skeleton className="h-3 w-72 bg-white/8 rounded" />
      </div>
      {/* Action bar */}
      <div className="flex gap-3">
        <Skeleton className="h-9 w-32 rounded-full bg-white/12" />
        <Skeleton className="h-9 w-28 rounded-full bg-white/8" />
      </div>
      {/* Content cards */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl p-4 flex items-center gap-4" style={{ backgroundColor: "rgba(255,255,255,0.05)" }}>
            <Skeleton className="w-12 h-12 rounded-lg bg-white/8 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40 bg-white/12" />
              <Skeleton className="h-2.5 w-64 bg-white/8" />
            </div>
            <Skeleton className="w-8 h-8 rounded-full bg-white/8" />
          </div>
        ))}
      </div>
    </div>
  );
}

export { FormSkeleton, TableRowsSkeleton };
