import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardSkeleton() {
  return (
    <div className="h-screen flex overflow-hidden animate-pulse" style={{ backgroundColor: "#f8f9fc" }}>
      {/* Sidebar skeleton */}
      <div className="hidden lg:flex flex-shrink-0 py-3 pl-3">
        <div className="flex flex-col items-center py-4 gap-3 rounded-2xl" style={{ width: "58px", backgroundColor: "#1a1a1a" }}>
          <Skeleton className="w-10 h-6 bg-white/10 rounded mt-1 mb-3" />
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="w-10 h-10 rounded-full bg-white/10" />
          ))}
          <div className="flex-1" />
          <Skeleton className="w-10 h-10 rounded-full bg-white/10" />
          <Skeleton className="w-10 h-10 rounded-full bg-white/10" />
        </div>
      </div>

      {/* Content area skeleton */}
      <div className="flex-1 flex flex-col">
        <div className="px-8 pt-6 pb-4">
          <Skeleton className="h-3 w-24 bg-black/5 mb-2 rounded" />
          <Skeleton className="h-7 w-48 bg-black/10 rounded" />
        </div>
        <div className="flex-1 px-6">
          <div className="rounded-2xl h-full" style={{ backgroundColor: "#f0f1f5" }} />
        </div>
        <div className="px-8 pb-3 pt-2 flex justify-center">
          <Skeleton className="h-4 w-40 bg-black/5" />
        </div>
      </div>
    </div>
  );
}
