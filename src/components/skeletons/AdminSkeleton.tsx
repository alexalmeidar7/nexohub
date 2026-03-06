import { Skeleton } from "@/components/ui/skeleton";

interface AdminSkeletonProps {
  /** Type of admin page to show appropriate skeleton */
  variant?: "dashboard" | "list" | "modules" | "messages";
}

export default function AdminSkeleton({ variant = "list" }: AdminSkeletonProps) {
  if (variant === "dashboard") {
    return (
      <div className="space-y-8 animate-pulse">
        {/* Stat cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl p-6 flex items-center gap-4" style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
              <Skeleton className="w-12 h-12 rounded-full bg-gray-200" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-12 bg-gray-200" />
                <Skeleton className="h-3 w-28 bg-gray-100" />
              </div>
            </div>
          ))}
        </div>
        {/* Action buttons */}
        <div className="flex gap-3">
          <Skeleton className="h-9 w-44 rounded-full bg-gray-200" />
          <Skeleton className="h-9 w-44 rounded-full bg-gray-200" />
        </div>
        {/* Client list */}
        <div className="space-y-2">
          <Skeleton className="h-5 w-32 bg-gray-200 mb-4" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl px-5 py-3 flex items-center justify-between" style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-lg bg-gray-200" />
                <Skeleton className="h-3 w-32 bg-gray-200" />
              </div>
              <Skeleton className="h-3 w-24 bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "modules") {
    return (
      <div className="space-y-6 animate-pulse">
        <Skeleton className="h-3 w-64 bg-gray-200" />
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl p-5 flex items-center gap-4" style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
              <Skeleton className="w-10 h-10 rounded-lg bg-blue-50" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-36 bg-gray-200" />
                <Skeleton className="h-2.5 w-56 bg-gray-100" />
              </div>
              <Skeleton className="h-5 w-14 rounded bg-gray-100" />
              <Skeleton className="w-8 h-8 rounded-full bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (variant === "messages") {
    return (
      <div className="space-y-8 animate-pulse">
        {/* Form skeleton */}
        <div className="rounded-xl p-6 space-y-4" style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
          <Skeleton className="h-5 w-36 bg-gray-200" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Skeleton className="h-3 w-20 bg-gray-100" />
              <Skeleton className="h-9 w-full rounded-lg bg-gray-200" />
            </div>
            <div className="space-y-1">
              <Skeleton className="h-3 w-16 bg-gray-100" />
              <Skeleton className="h-9 w-full rounded-lg bg-gray-200" />
            </div>
          </div>
          <div className="space-y-1">
            <Skeleton className="h-3 w-20 bg-gray-100" />
            <Skeleton className="h-24 w-full rounded-lg bg-gray-200" />
          </div>
          <Skeleton className="h-9 w-40 rounded-full bg-blue-200" />
        </div>
        {/* History skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-5 w-48 bg-gray-200 mb-4" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl px-5 py-3" style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
              <div className="flex items-center justify-between mb-1">
                <Skeleton className="h-3 w-40 bg-gray-200" />
                <Skeleton className="h-2.5 w-24 bg-gray-100" />
              </div>
              <Skeleton className="h-2.5 w-full bg-gray-100 mt-1" />
              <Skeleton className="h-4 w-28 rounded-full bg-blue-50 mt-2" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default: list variant (AdminUsers)
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-72 bg-gray-200" />
        <Skeleton className="h-9 w-36 rounded-full bg-blue-200" />
      </div>
      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl p-5 space-y-4" style={{ backgroundColor: "#ffffff", border: "1px solid #e2e8f0" }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg bg-gray-200" />
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3.5 w-32 bg-gray-200" />
                    <Skeleton className="h-4 w-14 rounded-full bg-blue-50" />
                    <Skeleton className="h-3 w-40 bg-gray-100" />
                  </div>
                  <Skeleton className="h-2.5 w-20 bg-gray-100" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-7 w-32 rounded-full bg-blue-100" />
                <Skeleton className="h-7 w-20 rounded-full bg-gray-200" />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 8 }).map((_, j) => (
                <div key={j} className="flex items-center justify-between p-3 rounded-lg" style={{ border: "1px solid #e2e8f0" }}>
                  <Skeleton className="h-3 w-20 bg-gray-200" />
                  <Skeleton className="h-5 w-9 rounded-full bg-gray-200" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
