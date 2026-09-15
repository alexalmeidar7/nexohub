import ModulePageSkeleton from "./ModulePageSkeleton";

interface AdminSkeletonProps {
  variant?: "dashboard" | "list" | "modules" | "messages";
}

export default function AdminSkeleton({ variant = "list" }: AdminSkeletonProps) {
  if (variant === "dashboard") {
    return <ModulePageSkeleton variant="dashboard" />;
  }
  return <ModulePageSkeleton variant="list" />;
}
