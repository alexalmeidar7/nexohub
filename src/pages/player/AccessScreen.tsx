import { useState } from "react";
import { clearSignOutFlag } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ElegantLoader from "@/components/player/ElegantLoader";
import { toast } from "sonner";
import { getCurrentReturnPath, getManagedOAuthRedirectUri, setOAuthReturnPath } from "@/lib/oauthReturn";

interface AccessScreenProps {
  logoUrl?: string | null;
  onLoginSuccess: () => void;
}

export default function AccessScreen({ logoUrl, onLoginSuccess }: AccessScreenProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      // Use the current Nexo/House Mix origin for the Supabase OAuth callback
      setOAuthReturnPath(getCurrentReturnPath());
      clearSignOutFlag();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: getManagedOAuthRedirectUri(), queryParams: { prompt: "select_account" } },
      });

      if (error) {
        console.error("OAuth error:", error);
        toast.error("Não foi possível conectar ao Google. Tente novamente.");
        setLoading(false);
        return;
      }

      if (data?.url) {
        // Browser will redirect — don't touch state
        return;
      }

      // Tokens received, session set
      setLoading(false);
      onLoginSuccess();
    } catch (err) {
      console.error("OAuth exception:", err);
      toast.error("Erro ao conectar. Verifique sua conexão e tente novamente.");
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-player"
      style={{ background: "var(--player-glow)" }}
    >
      <h1 className="text-player-foreground text-2xl font-semibold mb-12 lowercase">login</h1>

      <div className="flex items-start gap-8">
        {/* Login/Signup with Google */}
        <button onClick={handleGoogleAuth} className="flex flex-col items-center gap-4 group" disabled={loading}>
          <div className="w-32 h-32 rounded-full bg-player-accent flex items-center justify-center transition-transform group-hover:scale-105 overflow-hidden">
            <img src="/avatars/usr-default.png" alt="Visitante" className="w-full h-full object-contain" />
          </div>
          <p className="text-player-muted-foreground text-xs text-center max-w-[10rem] leading-relaxed">cadastre-se ou faça login para ter uma experiência incrível!</p>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleGoogleAuth(); }}
              className="text-player-accent text-sm hover:underline"
              disabled={loading}
            >
              entrar
            </button>
            <span className="text-player-muted-foreground text-sm">|</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleGoogleAuth(); }}
              className="text-player-accent text-sm hover:underline"
              disabled={loading}
            >
              fazer cadastro
            </button>
          </div>
        </button>

        {logoUrl && (
          <>
            <div className="h-48 w-px bg-player-border mt-4" />
            <div className="flex flex-col items-center gap-4">
              <div className="w-32 h-32 rounded-full bg-player-accent-soft flex items-center justify-center overflow-hidden">
                <img src={logoUrl} alt="Logo" className="h-20 w-auto object-contain" />
              </div>
              <p className="text-player-muted-foreground text-xs">acesso exclusivo para ouvintes cadastrados</p>
            </div>
          </>
        )}
      </div>

      {loading && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <ElegantLoader size={48} />
            <p className="text-white text-sm">Conectando ao Google...</p>
          </div>
        </div>
      )}
    </div>
  );
}
