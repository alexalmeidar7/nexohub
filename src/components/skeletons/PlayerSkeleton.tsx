import { Skeleton } from "@/components/ui/skeleton";

export default function PlayerSkeleton({ status }: { status?: string }) {
  return (
    <div className="h-screen w-screen bg-black flex flex-col relative overflow-hidden">
      {/* Background gradient skeleton */}
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 100%, rgba(220,38,38,0.08), transparent 70%), linear-gradient(to bottom, #0a0a0a, #000)" }} />

      {/* Center loading indicator */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
        {status && <p className="text-white/60 text-sm animate-pulse">{status}</p>}
      </div>

      {/* Bottom music bar skeleton — matches current glass panel layout */}
      <div
        className="absolute left-0 right-0 bottom-0 z-20 mx-auto px-5 sm:px-10 pb-5 pt-3"
        style={{ maxWidth: "1400px" }}
      >
        {/* Single row: Play | Title+Artist+Slider | Like+Volume */}
        <div className="flex items-center gap-4">
          {/* Play button */}
          <Skeleton className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white/10 shrink-0" />

          {/* Title + Artist + Slider */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <Skeleton className="h-4 w-40 bg-white/10 rounded" />
            <Skeleton className="h-3 w-28 bg-white/8 rounded" />
            <Skeleton className="h-[2px] w-full bg-white/10 rounded-full mt-1.5" />
            <div className="flex justify-between mt-1">
              <Skeleton className="h-2.5 w-8 bg-white/8 rounded" />
              <Skeleton className="h-2.5 w-8 bg-white/8 rounded" />
            </div>
          </div>

          {/* Like + Volume */}
          <div className="flex items-center gap-2.5 shrink-0">
            <Skeleton className="w-10 h-10 rounded-xl bg-white/10" />
            <Skeleton className="w-10 h-10 rounded-xl bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}
