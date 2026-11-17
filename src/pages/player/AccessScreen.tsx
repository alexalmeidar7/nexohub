import { useState } from "react";
import { startPlayerGoogleLogin } from "@/lib/playerGoogleLogin";
import ElegantLoader from "@/components/player/ElegantLoader";
import PlayerBrandCorner from "@/components/player/PlayerBrandCorner";
import { toast } from "sonner";
import { markPlayerSession } from "@/lib/playerSession";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { getTvAppLoginPath, isPlayerTvApp } from "@/lib/playerTvApp";

interface AccessScreenProps {
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  music?: { title?: string; artist?: string; cover?: string | null } | null;
  radioUserId?: string | null;
  onLoginSuccess: () => void;
}

export default function AccessScreen({ logoUrl, backgroundUrl, music, radioUserId, onLoginSuccess }: AccessScreenProps) {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { userSlug } = useParams();

  const handleGoogleAuth = async () => {
    const tvLogin = getTvAppLoginPath(userSlug);
    if (tvLogin) { navigate(tvLogin); return; }
    setLoading(true);
    try {
      const userId = await startPlayerGoogleLogin();
      markPlayerSession(userId);
      onLoginSuccess();
    } catch (err) {
      toast.error(String((err as any)?.message || err));
    } finally {
      setLoading(false);
    }
  };

  if (isPlayerTvApp() && userSlug) return <Navigate to={`/${userSlug}/player/tv`} replace />;

  return (
    <main className="fixed inset-0 z-50 overflow-hidden bg-black text-white antialiased">
      <style>{"@keyframes player-login-pan { 0%,100% { transform: scale(1.06) translateX(-1.5%) } 50% { transform: scale(1.06) translateX(1.5%) } } .player-login-bg { transform-origin: center top; animation: player-login-pan 28s ease-in-out infinite; will-change: transform; } @media (prefers-reduced-motion: reduce) { .player-login-bg { animation: none; transform: none; } }"}</style>
      <div className="absolute inset-0 overflow-hidden bg-black">
        {backgroundUrl && <img src={backgroundUrl} alt="" className="player-login-bg absolute inset-0 h-full w-full object-cover object-top" />}
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-black/25" />
      </div>
      <button
        data-tv-focusable
        data-player-login
        type="button"
        onClick={handleGoogleAuth}
        disabled={loading}
        className="absolute left-[6vw] top-[4vh] z-10 flex h-[clamp(48px,5.5vh,62px)] w-[min(320px,84vw)] items-center justify-between gap-3 rounded-full px-5 sm:px-6 text-white transition-all hover:bg-white/20 hover:scale-[1.02] disabled:opacity-70"
        style={{
          background: "rgba(255,255,255,0.13)",
          border: "1px solid rgba(255,255,255,0.24)",
          backdropFilter: "blur(22px) saturate(145%)",
          WebkitBackdropFilter: "blur(22px) saturate(145%)",
          boxShadow: "0 12px 36px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.16)",
        }}
      >
        <span className="text-left text-[clamp(12px,0.9vw,16px)] leading-snug"><strong>fa&ccedil;a login</strong> com sua conta do Google</span>
        <svg aria-hidden="true" className="h-6 w-6 shrink-0" viewBox="0 0 48 48">
          <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.4 29.3 35.5 24 35.5c-6.4 0-11.5-5.1-11.5-11.5S17.6 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 4.5 29.1 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5c10.8 0 19.5-8.7 19.5-19.5 0-1.2-.1-2.3-.4-3.5z" />
          <path fill="#FF3D00" d="M6.3 14.1l6.6 4.8C14.7 15.1 19 12.5 24 12.5c2.9 0 5.6 1.1 7.6 2.9l5.7-5.7C33.7 4.5 29.1 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.1z" />
          <path fill="#4CAF50" d="M24 43.5c5.1 0 9.7-1.9 13.2-5l-6.1-5c-2 1.4-4.4 2.3-7.1 2.3-5.3 0-9.7-3.1-11.3-7.5l-6.5 5C9.6 39 16.2 43.5 24 43.5z" />
          <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.1 5C41.7 34.9 43.5 30 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
        </svg>
      </button>
      <PlayerBrandCorner radioUserId={radioUserId} logoUrl={logoUrl} logoAlt="Logo da rádio" className="absolute right-[4.5vw] top-[3vh] z-10" />
      {(music?.title || music?.artist || music?.cover) && <div className="absolute bottom-[15.6vh] left-[6vw] z-10 flex max-w-[55vw] items-center gap-5 text-white drop-shadow-lg">
        {music.cover && <img src={music.cover} alt="Capa da m&uacute;sica" className="h-[min(15vh,160px)] w-[min(15vh,160px)] shrink-0 rounded-[24px] object-cover shadow-xl" />}
        <div className="min-w-0"><div className="text-[clamp(20px,1.6vw,32px)] leading-tight">tocando agora:</div>{music.title && <div className="mt-1 truncate text-[clamp(21px,1.7vw,34px)] font-bold leading-tight">{music.title}</div>}{music.artist && <div className="truncate text-[clamp(19px,1.5vw,30px)] leading-tight">{music.artist}</div>}</div>
      </div>}
      <img
        src="/images/player-ott-seal-white.png"
        alt="Nexo OTT Player"
        className="absolute bottom-[8vh] left-[6vw] z-10 h-auto w-[clamp(82px,8vw,110px)] object-contain opacity-75 drop-shadow-lg"
        draggable={false}
      />
      <div className="absolute bottom-[7vh] right-[4.5vw] z-10 text-right text-[clamp(12px,1vw,20px)] text-white drop-shadow-lg">desenvolvido por : Nexo Brasil</div>
      {loading && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"><div className="flex flex-col items-center gap-3"><ElegantLoader size={48} /><p className="text-white text-sm">Conectando ao Google...</p></div></div>}
    </main>
  );
}
