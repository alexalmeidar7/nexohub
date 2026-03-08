import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerSkeleton({ status }: { status?: string }) {
  return (
    <div className="h-screen w-screen bg-black flex flex-col relative overflow-hidden">
      {/* Video area skeleton */}
      <div className="flex-1 relative">
        <Skeleton className="absolute inset-0 bg-white/5" />

        {/* Center: Dual cards skeleton (presenter + music cover) */}
        <div className="absolute inset-0 flex items-center justify-center" style={{ paddingBottom: "100px" }}>
          <div className="relative flex items-center justify-center w-[90vw] max-w-[800px]" style={{ height: "min(420px, 55vh)" }}>
            {/* Presenter card skeleton */}
            <div className="absolute w-[50%] aspect-square rounded-3xl overflow-hidden" style={{ left: "5%", zIndex: 1 }}>
              <Skeleton className="w-full h-full bg-white/8" />
              <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2">
                <Skeleton className="w-8 h-8 rounded-full bg-white/10" />
                <Skeleton className="h-4 w-28 bg-white/10" />
                <Skeleton className="h-3 w-20 bg-white/10" />
              </div>
            </div>
            {/* Music cover card skeleton */}
            <div className="relative w-[55%] aspect-square rounded-3xl overflow-hidden" style={{ zIndex: 2, marginLeft: "auto" }}>
              <Skeleton className="w-full h-full bg-white/10" />
              <div className="absolute bottom-0 left-0 right-0 p-5 space-y-2">
                <Skeleton className="w-8 h-8 rounded-full bg-white/15" />
                <Skeleton className="h-5 w-36 bg-white/12" />
                <Skeleton className="h-3 w-24 bg-white/10" />
              </div>
            </div>
          </div>
        </div>

        {/* Center loading indicator */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
          <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-red-600 animate-spin" />
          {status && <p className="text-white/60 text-sm animate-pulse">{status}</p>}
        </div>
      </div>

      {/* Bottom control bar skeleton */}
      <div className="absolute bottom-2 sm:bottom-5 left-0 right-0 mx-auto z-20 px-2" style={{ maxWidth: "1400px" }}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0 rounded-2xl border border-white/10 px-3 sm:px-5 py-2 sm:py-3" style={{ backgroundColor: "rgba(0, 0, 0, 0.9)" }}>
          
          {/* Channel nav + logo + play */}
          <div className="flex items-center gap-2 sm:gap-3 sm:pr-5 sm:border-r border-white/10 shrink-0">
            <div className="flex flex-col items-center gap-1">
              <Skeleton className="w-6 h-5 rounded bg-white/10" />
              <Skeleton className="w-8 h-4 rounded bg-white/10" />
              <Skeleton className="w-6 h-5 rounded bg-white/10" />
            </div>
            <Skeleton className="w-12 h-12 sm:w-20 sm:h-20 rounded-lg bg-white/10" />
            <Skeleton className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10" />
            
            {/* Mobile program info */}
            <div className="flex-1 min-w-0 sm:hidden space-y-1.5">
              <Skeleton className="h-2 w-12 bg-red-900/40" />
              <Skeleton className="h-4 w-32 bg-white/10" />
              <Skeleton className="h-2.5 w-40 bg-white/8" />
            </div>
          </div>

          {/* Program info — desktop */}
          <div className="hidden sm:block px-5 min-w-0 space-y-2" style={{ flex: "0 1 450px" }}>
            <Skeleton className="h-2.5 w-12 bg-red-900/40" />
            <Skeleton className="h-5 w-48 bg-white/10" />
            <Skeleton className="h-3.5 w-36 bg-white/8" />
            <Skeleton className="h-3 w-56 bg-white/6" />
            <Skeleton className="h-1 w-full rounded-full bg-white/10 mt-2" />
            <Skeleton className="h-2.5 w-20 bg-red-900/30" />
          </div>

          {/* Progress bar mobile */}
          <div className="sm:hidden w-full">
            <Skeleton className="h-1 w-full rounded-full bg-white/10" />
          </div>

          {/* Control buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 px-1 sm:px-3 sm:border-l border-white/10 shrink-0 flex-wrap justify-center sm:justify-start">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
