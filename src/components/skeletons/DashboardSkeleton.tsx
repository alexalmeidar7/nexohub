import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardSkeleton() {
  return (
    <div className="h-screen flex flex-col overflow-hidden animate-pulse" style={{ backgroundColor: "#268ffa", paddingTop: "40px" }}>
      <div className="flex gap-[30px]" style={{ paddingLeft: "50px", paddingRight: "50px", paddingTop: "12px", flex: "1 1 0", minHeight: 0 }}>
        {/* Sidebar skeleton */}
        <div className="flex flex-col gap-5 flex-shrink-0" style={{ width: "400px" }}>
          <div className="flex flex-col rounded-[24px] overflow-hidden" style={{ backgroundColor: "rgba(0,0,0,0.70)", height: "500px" }}>
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <Skeleton className="h-4 w-24 bg-white/10" />
              <Skeleton className="h-8 w-8 rounded-full bg-white/10" />
            </div>
            <div className="mx-3 mb-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "#0d0446" }}>
              <Skeleton className="h-3 w-28 bg-white/10" />
            </div>
            <div className="px-3 space-y-2 flex-1">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2">
                  <Skeleton className="h-4 w-4 rounded bg-white/10" />
                  <Skeleton className="h-3 flex-1 bg-white/10" />
                </div>
              ))}
            </div>
            <div className="px-4 py-4 border-t border-white/10">
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full bg-white/10" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-3 w-24 bg-white/10" />
                  <Skeleton className="h-2.5 w-32 bg-white/10" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content skeleton */}
        <main className="flex-1 flex flex-col min-w-0">
          <div className="mb-3" style={{ marginLeft: "25px" }}>
            <Skeleton className="h-12 w-64 bg-white/20 mb-2" />
            <Skeleton className="h-3 w-40 bg-white/10" />
          </div>
          <div className="flex-1 rounded-2xl" />
        </main>
      </div>

      {/* Bottom row skeleton */}
      <div className="flex gap-5" style={{ paddingLeft: "50px", paddingRight: "50px", paddingTop: "8px" }}>
        <Skeleton className="rounded-2xl flex-shrink-0 bg-[#0c0441]/60" style={{ width: "400px", height: "225px" }} />
        <div className="flex-1 flex gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="rounded-2xl flex-shrink-0 bg-white/20" style={{ width: "300px", height: "225px" }} />
          ))}
        </div>
      </div>

      <div style={{ paddingLeft: "50px", paddingBottom: "10px", paddingTop: "15px" }}>
        <Skeleton className="h-5 w-48 bg-white/10" />
      </div>
    </div>
  );
}
