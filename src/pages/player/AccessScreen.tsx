import { useState } from "react";
import { clearSignOutFlag } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import ElegantLoader from "@/components/player/ElegantLoader";
import { toast } from "sonner";
import { getCurrentReturnPath, getManagedOAuthRedirectUri, setOAuthReturnPath } from "@/lib/oauthReturn";

interface AccessScreenProps {
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  music?: { title?: string; artist?: string; cover?: string | null } | null;
  onLoginSuccess: () => void;
}

export default function AccessScreen({ logoUrl, backgroundUrl, music, onLoginSuccess }: AccessScreenProps) {
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
        toast.error(`Falha no login Google: ${error.message}`);
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
      toast.error(`Erro ao conectar ao Google: ${String((err as any)?.message || err)}`);
      setLoading(false);
    }
  };

  return (
    <main className="fixed inset-0 z-50 overflow-hidden bg-black text-white antialiased">
      <style>{"@keyframes player-login-pan { 0%,100% { transform: scale(1.06) translateX(-1.5%) } 50% { transform: scale(1.06) translateX(1.5%) } } .player-login-bg { transform-origin: center top; animation: player-login-pan 28s ease-in-out infinite; will-change: transform; } @media (prefers-reduced-motion: reduce) { .player-login-bg { animation: none; transform: none; } }"}</style>
      <div className="absolute inset-0 overflow-hidden bg-black">
        {backgroundUrl && <img src={backgroundUrl} alt="" className="player-login-bg absolute inset-0 h-full w-full object-cover object-top" />}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" />
      </div>
      <button type="button" onClick={handleGoogleAuth} disabled={loading} className="absolute left-[6vw] top-[9.3vh] z-10 flex h-[min(100px,10vh)] w-[min(564px,88vw)] items-center justify-between gap-4 rounded-full bg-white px-[clamp(20px,2vw,38px)] text-black shadow-xl transition-transform hover:scale-[1.02] disabled:opacity-70">
        <span className="whitespace-nowrap text-[clamp(17px,1.45vw,28px)]"><strong>fa&ccedil;a login</strong> com sua conta do Google</span>
        <span aria-hidden="true" className="font-bold text-[clamp(48px,4vw,76px)] leading-none">G</span>
      </button>
      {logoUrl && <img src={logoUrl} alt="Logo da r&aacute;dio" className="absolute right-[4.5vw] top-[3vh] z-10 max-h-[22vh] w-auto max-w-[18vw] object-contain drop-shadow-xl" />}
      {(music?.title || music?.artist || music?.cover) && <div className="absolute bottom-[15.6vh] left-[6vw] z-10 flex max-w-[55vw] items-center gap-5 text-white drop-shadow-lg">
        {music.cover && <img src={music.cover} alt="Capa da m&uacute;sica" className="h-[min(15vh,160px)] w-[min(15vh,160px)] shrink-0 rounded-[24px] object-cover shadow-xl" />}
        <div className="min-w-0"><div className="text-[clamp(20px,1.6vw,32px)] leading-tight">tocando agora:</div>{music.title && <div className="mt-1 truncate text-[clamp(21px,1.7vw,34px)] font-bold leading-tight">{music.title}</div>}{music.artist && <div className="truncate text-[clamp(19px,1.5vw,30px)] leading-tight">{music.artist}</div>}</div>
      </div>}
      <div className="absolute bottom-[8vh] left-[6vw] z-10 h-[4.5vh] max-h-[50px] w-[9.8vh] max-w-[110px] overflow-hidden drop-shadow-lg" aria-label="Nexo OTT Player">
        <img src="/images/player-seal.png" alt="Nexo OTT Player" className="absolute max-w-none object-fill" style={{ width: "123.27%", height: "177.63%", left: "-8.13%", top: "-38.82%" }} />
      </div>
      <div className="absolute bottom-[7vh] right-[4.5vw] z-10 text-right text-[clamp(12px,1vw,20px)] text-white drop-shadow-lg">desenvolvido por : Nexo Brasil</div>
      {loading && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"><div className="flex flex-col items-center gap-3"><ElegantLoader size={48} /><p className="text-white text-sm">Conectando ao Google...</p></div></div>}
    </main>
  );
}