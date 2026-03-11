import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "@/components/Dashboard";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function MasterViewHome() {
  const { signOut } = useAuth();
  usePageTitle("Dashboard");

  return (
    <ProtectedRoute>
      <Dashboard onLogout={signOut} />
    </ProtectedRoute>
  );
}
