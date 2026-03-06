import { Skeleton } from "@/components/ui/skeleton";

export default function PromoSkeleton() {
  return (
    <div className="min-h-screen p-8 flex flex-col items-center" style={{ background: "url('/images/kiosk-bg.png') center center / cover no-repeat fixed", backgroundColor: "#000" }}>
      <div className="w-full max-w-[1000px] flex flex-col gap-6">
        {/* Header skeleton */}
        <div className="flex justify-between items-center w-full px-2">
          <div className="flex items-center gap-3">
            <Skeleton className="w-4 h-4 rounded-full bg-red-900/40" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-16 bg-white/10" />
              <Skeleton className="h-4 w-40 bg-white/10" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full bg-white/10" />
            <Skeleton className="h-10 w-40 bg-white/10 rounded-lg" />
          </div>
        </div>

        {/* Banner skeleton */}
        <Skeleton className="w-full rounded-2xl bg-white/10" style={{ height: "350px" }} />

        {/* Programs row skeleton */}
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex-shrink-0 flex flex-col items-center gap-2">
              <Skeleton className="w-20 h-20 rounded-2xl bg-white/10" />
              <Skeleton className="h-2.5 w-16 bg-white/10" />
            </div>
          ))}
        </div>

        {/* Promo buttons skeleton */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl bg-white/10" />
          ))}
        </div>
      </div>
    </div>
  );
}
