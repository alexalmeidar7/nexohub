import { AuthProvider, useAuth } from "@/hooks/useAuth";
import LoginScreen from "@/components/LoginScreen";
import Dashboard from "@/components/Dashboard";
import { Loader2 } from "lucide-react";

function AppContent() {
  const { user, loading, signOut } = useAuth();

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

  return <Dashboard onLogout={signOut} />;
}

export default function Index() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
