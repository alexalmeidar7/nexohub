import { useAuth } from "@/hooks/useAuth";
import LoginScreen from "@/components/LoginScreen";
import { Loader2 } from "lucide-react";
import { Navigate } from "react-router-dom";

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
    return <LoginScreen />;
  }

  // Redirect based on role
  if (role === "admin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return <Navigate to="/masterview/home" replace />;
}
