import { Heart } from "lucide-react";

interface AudioDualCardProps {
  presenterName?: string | null;
  presenterInstagram?: string | null;
  presenterPhoto?: string | null;
  musicTitle?: string | null;
  musicArtist?: string | null;
  musicCover?: string | null;
  channelLogo?: string | null;
  liked?: boolean;
  onToggleLike?: () => void;
}

export default function AudioDualCard({
  presenterName,
  presenterInstagram,
  presenterPhoto,
  musicTitle,
  musicArtist,
  musicCover,
  channelLogo,
  liked,
  onToggleLike,
}: AudioDualCardProps) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center"
      style={{
        background: "linear-gradient(135deg, hsl(0 0% 0%) 0%, hsl(0 70% 20%) 100%)",
      }}
    >
      <div className="flex flex-col md:flex-row w-[90vw] max-w-[900px] rounded-3xl overflow-hidden shadow-2xl"
        style={{ minHeight: "420px" }}
      >
        {/* Left — Presenter (behind music card visually) */}
        <div
          className="relative flex flex-col justify-end md:w-[45%] w-full p-6"
          style={{
            backgroundColor: "hsl(0 60% 22%)",
            backgroundImage: presenterPhoto ? `url(${presenterPhoto})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            minHeight: "260px",
          }}
        >
          {/* No overlay — full opacity photo */}
          {!presenterPhoto && (
            <div className="absolute inset-0 flex items-center justify-center z-[1]">
              <span className="text-white/30 text-sm font-medium tracking-wide">foto locutor</span>
            </div>
          )}

          {/* Footer */}
          <div className="relative z-[2] mt-auto">
            <p className="text-white font-bold text-xl md:text-2xl leading-tight drop-shadow-lg">
              {presenterName || "Locutor"}
            </p>
            {presenterInstagram && (
              <a
                href={`https://instagram.com/${presenterInstagram.replace(/^@/, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-white/70 text-sm hover:text-white transition-colors drop-shadow-lg"
              >
                @{presenterInstagram.replace(/^@/, "")}
              </a>
            )}
          </div>
        </div>

        {/* Right — Music (cover fills entire box) */}
        <div
          className="relative flex flex-col justify-end md:w-[55%] w-full overflow-hidden"
          style={{ backgroundColor: "hsl(0 0% 0%)", minHeight: "260px" }}
        >
          {/* Cover image fills entire box */}
          {musicCover ? (
            <img
              key={musicCover}
              src={musicCover}
              alt={musicTitle || "Capa"}
              className="absolute inset-0 w-full h-full object-cover animate-fade-in"
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

          {/* Heart button — bottom-left over the cover */}
          {onToggleLike && musicTitle && (
            <button
              onClick={onToggleLike}
              className="absolute bottom-16 left-3 z-[5] p-2 rounded-full transition-transform hover:scale-110 active:scale-95"
              style={{ backgroundColor: "hsla(0, 0%, 0%, 0.5)" }}
            >
              <Heart
                size={22}
                className={liked ? "text-red-500 fill-red-500" : "text-white"}
              />
            </button>
          )}

          {/* Footer — stacked labels, width adapts to text */}
          {(musicTitle || musicArtist) && (
            <div className="relative z-[3] self-start animate-fade-in mb-4 ml-3" style={{ animationDuration: "0.7s" }}>
              <div
                className="px-4 py-1.5 font-bold text-white text-base md:text-lg leading-tight inline-block"
                style={{ backgroundColor: "hsl(0 80% 45%)" }}
              >
                {musicTitle || "—"}
              </div>
              <div
                className="px-4 py-1 text-white text-sm leading-tight inline-block"
                style={{ backgroundColor: "hsl(0 60% 25%)" }}
              >
                {musicArtist || "—"}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
