import { useAuth } from "@/hooks/useAuth";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

const LoginScreen = lazy(() => import("@/components/LoginScreen"));

export default function Index() {
  const { user, loading, role } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={32} /></div>}>
        <LoginScreen />
      </Suspense>
    );
  }

  // Redirect based on role
  if (role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/user/nexohub/home" replace />;
}
