import { Heart, Mic } from "lucide-react";
import { lazy, Suspense, useEffect, useRef } from "react";

const AudioSpectrum = lazy(() => import("@/components/AudioSpectrum"));

interface AudioDualCardProps {
  presenterName?: string | null;
  presenterInstagram?: string | null;
  presenterPhoto?: string | null;
  musicTitle?: string | null;
  musicArtist?: string | null;
  musicCover?: string | null;
  channelLogo?: string | null;
  channelThumb?: string | null;
  liked?: boolean;
  onToggleLike?: () => void;
  audioElement?: HTMLAudioElement | null;
}

export default function AudioDualCard({
  presenterName,
  presenterInstagram,
  presenterPhoto,
  musicTitle,
  musicArtist,
  musicCover,
  channelLogo,
  channelThumb,
  liked,
  onToggleLike,
  audioElement,
}: AudioDualCardProps) {
  const isSemTitulo = !musicTitle || musicTitle === "Sem título";

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden" style={{ paddingBottom: "140px" }}>
      {/* Background — channel thumb, fixed and covering */}
      {channelThumb && (
        <img
          src={channelThumb}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: "scale(1.05)" }}
        />
      )}
      {/* Fallback solid black when no thumb */}
      {!channelThumb && (
        <div className="absolute inset-0" style={{ backgroundColor: "hsl(0 0% 0%)" }} />
      )}
      {/* Wrapper with relative positioning so presenter sits behind music card */}
      <div className="relative w-[90vw] max-w-[800px] flex items-center justify-center" style={{ minHeight: "420px" }}>

        {/* Left — Presenter (hidden behind cover, slides left at 3s) */}
        <div
          className="absolute top-0 bottom-0 md:w-[50%] w-full rounded-3xl overflow-hidden shadow-xl"
          style={{
            animation: "presenterReveal 1.6s cubic-bezier(0.22, 1, 0.36, 1) 3s forwards",
            opacity: 0,
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "hsl(0 60% 22%)",
            backgroundImage: presenterPhoto ? `url(${presenterPhoto})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            zIndex: 1,
            transition: "margin-left 0.5s ease-out",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.marginLeft = "-40px"; }}
          onMouseLeave={(e) => { e.currentTarget.style.marginLeft = "0px"; }}
        >
          {!presenterPhoto && (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-white/30 text-sm font-medium tracking-wide">foto locutor</span>
            </div>
          )}

          {/* Footer */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, hsla(0,0%,0%,0.7) 0%, transparent 100%)" }} />
            <div className="relative z-[2]">
              <Mic size={16} className="mb-1" style={{ color: "hsl(0 80% 50%)" }} />
              <p className="text-white font-semibold text-sm md:text-base leading-tight drop-shadow-lg">
                {presenterName || "Locutor"}
              </p>
              {presenterInstagram && (
                <a
                  href={`https://instagram.com/${presenterInstagram.replace(/^@/, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/60 text-xs hover:text-white transition-colors drop-shadow-lg"
                >
                  @{presenterInstagram.replace(/^@/, "")}
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Music card: fade-in center → wait 2s → slide right */}
        <div
          className="relative md:w-[55%] w-full rounded-3xl overflow-hidden shadow-2xl"
          style={{
            backgroundColor: isSemTitulo ? "#880000" : "hsl(0 0% 5%)",
            minHeight: "420px",
            zIndex: 2,
            animation: "coverFadeAndSlide 3.5s cubic-bezier(0.22, 1, 0.36, 1) forwards",
            opacity: 0,
          }}
        >
          {isSemTitulo ? (
            /* "Sem título" state: dark red bg + audio spectrum */
            <div className="absolute inset-0 flex items-center justify-center rounded-3xl overflow-hidden">
              {channelLogo && (
                <img
                  src={channelLogo}
                  alt="Logo"
                  className="absolute w-28 h-28 object-contain opacity-20 z-[1]"
                />
              )}
              <Suspense fallback={null}>
                <div className="absolute inset-0 z-[2]" style={{ filter: "hue-rotate(0deg)" }}>
                  <AudioSpectrum audioElement={audioElement ?? null} barColor="#a10a0b" />
                </div>
              </Suspense>
            </div>
          ) : (
            <>
              {/* Cover image fills the card with rounded corners */}
              {musicCover ? (
                <img
                  key={musicCover}
                  src={musicCover}
                  alt={musicTitle || "Capa"}
                  className="absolute inset-0 w-full h-full object-cover rounded-3xl animate-fade-in"
                  style={{ animationDuration: "0.7s" }}
                />
              ) : channelLogo ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <img
                    src={channelLogo}
                    alt="Logo"
                    className="w-36 h-36 object-contain opacity-40 animate-fade-in"
                    style={{ animationDuration: "0.7s" }}
                  />
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-white/20 text-sm font-medium tracking-wide">imagem capa música</span>
                </div>
              )}

              {/* Bottom gradient for readability */}
              <div className="absolute inset-x-0 bottom-0 rounded-b-3xl" style={{ height: "50%", background: "linear-gradient(to top, hsla(0,0%,0%,0.85) 0%, transparent 100%)" }} />

              {/* Footer: heart → title → artist (stacked) */}
              <div className="absolute bottom-0 left-0 right-0 p-5 z-[3] flex flex-col items-start gap-1 animate-fade-in" style={{ animationDuration: "0.7s" }}>
                {/* Heart like button */}
                {onToggleLike && musicTitle && (
                  <button
                    onClick={onToggleLike}
                    className="mb-1 p-1.5 rounded-full transition-all hover:scale-110 active:scale-95"
                    style={{ backgroundColor: "hsla(0, 0%, 100%, 0.15)" }}
                  >
                    <Heart
                      size={20}
                      className="transition-colors"
                      style={{
                        color: liked ? "hsl(0 80% 50%)" : "white",
                        fill: liked ? "hsl(0 80% 50%)" : "none",
                      }}
                    />
                  </button>
                )}

                {/* Song title */}
                {musicTitle && (
                  <span className="text-white font-bold text-lg md:text-xl leading-tight drop-shadow-lg">
                    {musicTitle}
                  </span>
                )}

                {/* Artist name */}
                {musicArtist && (
                  <span className="text-white/70 text-sm leading-tight drop-shadow-lg">
                    {musicArtist}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
