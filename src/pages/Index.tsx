import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { lazy, Suspense } from "react";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

const LoginScreen = lazy(() => import("@/components/LoginScreen"));

export default function Index() {
  const { user, loading, role } = useAuth();
  usePageTitle("Login");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#131519" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "#d9ff65" }} />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#131519" }}><Loader2 className="animate-spin" size={32} style={{ color: "#d9ff65" }} /></div>}>
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
