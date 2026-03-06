import { Disc3 } from "lucide-react";

interface AudioDualCardProps {
  presenterName?: string | null;
  presenterInstagram?: string | null;
  presenterPhoto?: string | null;
  musicTitle?: string | null;
  musicArtist?: string | null;
  musicCover?: string | null;
  channelLogo?: string | null;
}

export default function AudioDualCard({
  presenterName,
  presenterInstagram,
  presenterPhoto,
  musicTitle,
  musicArtist,
  musicCover,
  channelLogo,
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
        {/* Left — Presenter */}
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
          {/* Red overlay */}
          <div className="absolute inset-0" style={{ backgroundColor: "hsla(0, 60%, 22%, 0.55)" }} />

          {/* Center placeholder when no photo */}
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

        {/* Right — Music */}
        <div
          className="relative flex flex-col justify-end md:w-[55%] w-full p-6"
          style={{ backgroundColor: "hsl(0 0% 0%)" }}
        >
          {/* Center — cover or placeholder */}
          <div className="flex-1 flex items-center justify-center">
            {musicCover ? (
              <img
                key={musicCover}
                src={musicCover}
                alt={musicTitle || "Capa"}
                className="w-48 h-48 md:w-56 md:h-56 rounded-2xl object-cover shadow-2xl animate-fade-in"
                style={{ animationDuration: "0.7s" }}
              />
            ) : channelLogo ? (
              <img
                src={channelLogo}
                alt="Logo"
                className="w-36 h-36 object-contain opacity-40 animate-fade-in"
                style={{ animationDuration: "0.7s" }}
              />
            ) : (
              <span className="text-white/20 text-sm font-medium tracking-wide">imagem capa música</span>
            )}
          </div>

          {/* Footer — stacked labels */}
          {(musicTitle || musicArtist) && (
            <div className="relative z-[2] mt-4 self-start animate-fade-in" style={{ animationDuration: "0.7s" }}>
              <div
                className="px-4 py-1.5 font-bold text-white text-base md:text-lg leading-tight"
                style={{ backgroundColor: "hsl(0 80% 45%)" }}
              >
                {musicTitle || "—"}
              </div>
              <div
                className="px-4 py-1 text-white text-sm leading-tight"
                style={{ backgroundColor: "hsl(0 60% 25%)" }}
              >
                {musicArtist || "—"}
              </div>
            </div>
          )}

          {/* Spinning disc accent */}
          {musicTitle && (
            <div className="absolute top-5 right-5 opacity-20">
              <Disc3 size={40} className="text-white animate-spin" style={{ animationDuration: "4s" }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
