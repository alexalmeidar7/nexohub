import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "@/components/Dashboard";
import { useAuth } from "@/hooks/useAuth";

export default function MasterViewHome() {
  const { signOut } = useAuth();

  return (
    <ProtectedRoute>
      <Dashboard onLogout={signOut} />
    </ProtectedRoute>
  );
}
