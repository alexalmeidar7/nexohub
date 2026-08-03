import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import Dashboard from "@/components/Dashboard";
import { useAuth } from "@/hooks/useAuth";
import { usePageTitle } from "@/hooks/usePageTitle";

export default function MasterViewHome() {
  const { signOut } = useAuth();
  usePageTitle("Dashboard");
  const [musicaMinimizada, setMusicaMinimizada] = useState(false);

  useEffect(() => {
    const onMinimize = () => setMusicaMinimizada(true);
    window.addEventListener("minimizeMusica", onMinimize);
    return () => window.removeEventListener("minimizeMusica", onMinimize);
  }, []);

  return (
    <ProtectedRoute>
      <Dashboard 
        onLogout={signOut} 
        musicaMinimizada={musicaMinimizada}
        onRestaurarMusica={() => setMusicaMinimizada(false)}
        onFecharMusica={() => setMusicaMinimizada(false)}
      />
    </ProtectedRoute>
  );
}
