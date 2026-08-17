import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";
import { lazy, Suspense, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import { supabase } from "@/integrations/supabase/client";

const LoginScreen = lazy(() => import("@/components/LoginScreen"));

export default function Index() {
  const { user, loading } = useAuth();
  const [isChecking, setIsChecking] = useState(true);
  const [hasUser, setHasUser] = useState(false);
  usePageTitle("Login");

  useEffect(() => {
    let mounted = true;
    
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
          if (data.session?.user) {
            setHasUser(true);
            setIsChecking(false);
          }
          // Não setamos isChecking(false) se não houver usuário aqui, 
          // pois ainda queremos esperar o `loading` do useAuth se possível,
          // mas vamos colocar um timeout de segurança.
        }
      } catch (e) {
        console.error("Quick check failed", e);
      }
    };

    quickCheck();

    const timer = setTimeout(() => {
      if (mounted) setIsChecking(false);
    }, 2000); // 2 segundos de timeout para a tela de login aparecer

    return () => {
      mounted = false;
      clearTimeout(timer);
    };
  }, [user, loading]);

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
