import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { Suspense, useEffect, useState } from "react";
import { lazyRetry } from "@/lib/lazyRetry";
import { Navigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import { supabase } from "@/integrations/supabase/client";

const LoginScreen = lazyRetry(() => import("@/components/LoginScreen"));

export default function Index() {
  const { user, loading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [hasUser, setHasUser] = useState(false);
  usePageTitle("Login");

  const isExplicitLogout = typeof window !== "undefined" && localStorage.getItem("nexohub_explicit_logout") === "true";

  useEffect(() => {
    let mounted = true;
    
    if (isExplicitLogout) {
      setHasUser(false);
      setIsChecking(false);
      return;
    }

    // Se o hook de auth já terminou, usamos o valor dele
    if (!loading) {
      setHasUser(!!user);
      setIsChecking(false);
      return;
    }

    // Fallback: verificação rápida direta no Supabase para evitar travar no "Sincronizando"
    const quickCheck = async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (mounted) {
          if (data.session?.user && localStorage.getItem("nexohub_explicit_logout") !== "true") {
            setHasUser(true);
            setIsChecking(false);
          }
        }
      } catch (e) {
        console.error("Quick check failed", e);
      }
    };

    quickCheck();

    const timer = setTimeout(() => {
      if (mounted) setIsChecking(false);
    }, 1000); // 1 segundo de timeout para a tela de login aparecer

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [user, loading, isExplicitLogout]);

  if (isExplicitLogout) {
    return (
      <Suspense fallback={<LoadingSpinner fullscreen />}>
        <LoginScreen />
      </Suspense>
    );
  }

  if (loading && isChecking && !hasUser) {
    return <LoadingSpinner fullscreen />;
  }

  if (!user && !hasUser) {
    return (
      <Suspense fallback={<LoadingSpinner fullscreen />}>
        <LoginScreen />
      </Suspense>
    );
  }

  return <Navigate to="/home" replace />;
}
