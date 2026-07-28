import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { lazy, Suspense } from "react";
import { Navigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";

const LoginScreen = lazy(() => import("@/components/LoginScreen"));

export default function Index() {
  const { user, loading } = useAuth();
  usePageTitle("Login");

  if (loading) {
    return <LoadingSpinner fullscreen />;
  }

  if (!user) {
    return (
      <Suspense fallback={<LoadingSpinner fullscreen />}>
        <LoginScreen />
      </Suspense>
    );
  }

  return <Navigate to="/user/nexohub/home" replace />;
}
