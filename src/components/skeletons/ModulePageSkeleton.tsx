import { Skeleton } from "@/components/ui/skeleton";

export default function ModulePageSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Title area */}
      <div className="space-y-2">
        <Skeleton className="h-6 w-48 bg-white/20 rounded" />
        <Skeleton className="h-3 w-72 bg-white/10 rounded" />
      </div>
      {/* Action bar */}
      <div className="flex gap-3">
        <Skeleton className="h-9 w-32 rounded-full bg-white/15" />
        <Skeleton className="h-9 w-28 rounded-full bg-white/10" />
      </div>
      {/* Content cards */}
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl p-4 flex items-center gap-4" style={{ backgroundColor: "rgba(255,255,255,0.08)" }}>
            <Skeleton className="w-12 h-12 rounded-lg bg-white/10 flex-shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-40 bg-white/15" />
              <Skeleton className="h-2.5 w-64 bg-white/10" />
            </div>
            <Skeleton className="w-10 h-10 rounded-full bg-white/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
