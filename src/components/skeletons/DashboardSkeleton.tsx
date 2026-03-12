import { Skeleton } from "@/components/ui/skeleton";

export default function DashboardSkeleton() {
  return (
    <div className="h-screen flex flex-col overflow-hidden animate-pulse" style={{ backgroundColor: "#1a1a1a" }}>
      {/* Top nav bar skeleton */}
      <nav
        className="flex items-center px-8 gap-4"
        style={{
          background: "rgba(0, 0, 0, 0.85)",
          backdropFilter: "blur(24px)",
          minHeight: "52px",
        }}
      >
        <Skeleton className="h-5 w-20 bg-white/10 rounded flex-shrink-0" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            {i > 0 && <span className="text-white/10">|</span>}
            <Skeleton className="h-3.5 rounded bg-white/15" style={{ width: `${50 + Math.random() * 50}px` }} />
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <Skeleton className="w-8 h-8 rounded-full bg-white/10" />
          <Skeleton className="w-8 h-8 rounded-full bg-white/10" />
          <Skeleton className="h-6 w-14 rounded-full bg-white/10" />
        </div>
      </nav>

      {/* Company name skeleton */}
      <div className="px-8 pt-4 pb-1">
        <Skeleton className="h-8 w-52 bg-white/20 mb-1.5 rounded" />
        <Skeleton className="h-3 w-36 bg-white/10 rounded" />
      </div>

      {/* Main content skeleton */}
      <div className="flex-1 min-h-0 px-8 pt-3">
        <div className="flex-1 rounded-2xl" style={{ height: "60%" }} />
      </div>

      {/* Footer skeleton */}
      <div className="px-8 pb-2 pt-3">
        <Skeleton className="h-5 w-48 bg-white/10" />
      </div>
    </div>
  );
}
