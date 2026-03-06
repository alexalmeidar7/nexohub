import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerSkeleton({ status }: { status?: string }) {
  return (
    <div className="h-screen w-screen bg-black flex flex-col relative overflow-hidden">
      {/* Video area skeleton */}
      <div className="flex-1 relative">
        <Skeleton className="absolute inset-0 bg-white/5" />
        {/* Center loading indicator */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
          <div className="w-16 h-16 rounded-full border-4 border-white/10 border-t-red-600 animate-spin" />
          {status && <p className="text-white/60 text-sm animate-pulse">{status}</p>}
        </div>
      </div>

      {/* Bottom bar skeleton */}
      <div className="absolute bottom-0 left-0 right-0 p-4 z-20" style={{ background: "linear-gradient(transparent, rgba(0,0,0,0.9))" }}>
        <div className="flex items-center gap-4">
          {/* Channel logo */}
          <Skeleton className="w-12 h-12 rounded-lg bg-white/10 flex-shrink-0" />
          {/* Info */}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-40 bg-white/10" />
            <Skeleton className="h-3 w-56 bg-white/10" />
            <Skeleton className="h-1.5 w-full rounded-full bg-white/10" />
          </div>
          {/* Controls */}
          <div className="flex items-center gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="w-9 h-9 rounded-full bg-white/10" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
