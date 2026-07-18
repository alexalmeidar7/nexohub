import { useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AccessScreenProps {
  logoUrl?: string | null;
  onLoginSuccess: () => void;
  onGuest: () => void;
}

export default function AccessScreen({ logoUrl, onLoginSuccess, onGuest }: AccessScreenProps) {
  const [loading, setLoading] = useState(false);

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      // Use the Lovable app origin as redirect to avoid custom domain OAuth issues
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.href,
        extraParams: {
          prompt: "select_account",
        },
      });

      if (result.error) {
        console.error("OAuth error:", result.error);
        toast.error("Não foi possível conectar ao Google. Tente novamente.");
        setLoading(false);
        return;
      }

      if (result.redirected) {
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
      <h1 className="text-player-foreground text-2xl font-semibold mb-12">Quem vai acessar?</h1>

      <div className="flex items-start gap-8">
        {/* Guest option (left) */}
        <button onClick={onGuest} className="flex flex-col items-center gap-4 group">
          <div className="w-32 h-32 rounded-full bg-player-accent flex items-center justify-center transition-transform group-hover:scale-105 overflow-hidden">
            <img src="/avatars/usr-default.png" alt="Visitante" className="w-full h-full object-contain" />
          </div>
          <p className="text-player-muted-foreground text-xs text-center max-w-[10rem] leading-relaxed">cadastre-se ou faça login para ter uma experiência incrível com a Positiva!</p>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); handleGoogleAuth(); }}
              className="text-player-accent text-sm hover:underline"
            >
              entrar
            </button>
            <span className="text-player-muted-foreground text-sm">|</span>
            <button
              onClick={(e) => { e.stopPropagation(); handleGoogleAuth(); }}
              className="text-player-accent text-sm hover:underline"
            >
              fazer cadastro
            </button>
          </div>
        </button>

        {/* Divider */}
        <div className="h-48 w-px bg-player-border mt-4" />

        {/* Logo option (right) */}
        <button onClick={onGuest} className="flex flex-col items-center gap-4 group">
          <div className="w-32 h-32 rounded-full bg-player-accent-soft flex items-center justify-center transition-transform group-hover:scale-105 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Logo" className="h-20 w-auto object-contain" />
            ) : (
              <span className="text-player-foreground text-3xl font-bold">P</span>
            )}
          </div>
          <p className="text-player-foreground text-sm">só quero acessar</p>
        </button>
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
