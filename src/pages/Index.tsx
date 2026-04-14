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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(145deg, #080830 0%, #0f1058 40%, #1a1280 100%)" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "#268ffa" }} />
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(145deg, #080830 0%, #0f1058 40%, #1a1280 100%)" }}><Loader2 className="animate-spin" size={32} style={{ color: "#268ffa" }} /></div>}>
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
