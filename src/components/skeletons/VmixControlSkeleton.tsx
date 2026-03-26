import { Skeleton } from "@/components/ui/skeleton";

export default function VmixControlSkeleton() {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#191919" }}>
      {/* Header skeleton */}
      <header className="flex items-center justify-between px-6 py-3" style={{ backgroundColor: "#242424" }}>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl" style={{ backgroundColor: "#111115", border: "1px solid #2a2a30" }}>
            <Skeleton className="w-2 h-2 rounded-full bg-white/10" />
            <div className="flex flex-col items-end gap-1">
              <Skeleton className="h-5 w-28 rounded bg-white/10" />
              <Skeleton className="h-2 w-16 rounded bg-white/5" />
            </div>
          </div>
          <Skeleton className="w-8 h-8 rounded-lg bg-white/5" />
        </div>
        <Skeleton className="h-5 w-32 rounded bg-white/10" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-3 w-36 rounded bg-white/5" />
          <Skeleton className="w-4 h-4 rounded bg-white/5" />
        </div>
      </header>

      {/* Main content skeleton */}
      <main className="flex-1 p-6 space-y-4" style={{ backgroundColor: "#191919" }}>
        {/* URL bar skeleton */}
        <div className="flex items-center gap-2 flex-wrap">
          <Skeleton className="h-9 w-64 rounded-lg bg-white/5" />
          <Skeleton className="h-9 w-16 rounded-lg bg-white/5" />
          <Skeleton className="h-9 w-24 rounded-lg bg-white/5" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-24 rounded-lg bg-white/5" />
          <Skeleton className="h-9 w-24 rounded-lg bg-white/5" />
        </div>

        {/* Monitors section skeleton */}
        <Skeleton className="h-10 w-full rounded-lg bg-white/5" />

        {/* Tabs skeleton */}
        <div className="flex gap-1">
          <Skeleton className="h-8 w-24 rounded-lg bg-white/8" />
          <Skeleton className="h-8 w-24 rounded-lg bg-white/5" />
        </div>

        {/* Input cards skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl p-4" style={{ backgroundColor: "#1e1e24", border: "1px solid #ffffff08" }}>
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg bg-white/5" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 rounded bg-white/10" style={{ width: `${120 + i * 30}px` }} />
                  <Skeleton className="h-2.5 w-20 rounded bg-white/5" />
                </div>
                <div className="flex gap-1.5">
                  <Skeleton className="h-7 w-12 rounded bg-white/5" />
                  <Skeleton className="h-7 w-12 rounded bg-white/5" />
                  <Skeleton className="h-7 w-12 rounded bg-white/5" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom section skeleton */}
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-28 rounded-xl bg-white/5" />
          <Skeleton className="h-28 rounded-xl bg-white/5" />
        </div>
      </main>
    </div>
  );
}
