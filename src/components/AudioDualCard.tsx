import { Heart, Mic, Plus, Instagram, MessageCircle, X } from "lucide-react";
import { lazy, Suspense, useState, useRef, useEffect, useCallback } from "react";
const AudioSpectrum = lazy(() => import("@/components/AudioSpectrum"));

// WhatsApp icon as inline SVG (lucide doesn't have it)
function WhatsAppIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  );
}

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
  whatsappPhone?: string | null;
  onOpenChat?: () => void;
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
  whatsappPhone,
  onOpenChat,
}: AudioDualCardProps) {
  const isSemTitulo = !musicTitle || musicTitle === "Sem título";
  const [menuOpen, setMenuOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(-1);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>();
  const isTouchDevice = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isTV = typeof navigator !== "undefined" && /smart.?tv|tizen|webos|hbbtv|netcast|viera|roku/i.test(navigator.userAgent);

  const handleEnter = () => {
    if (isTouchDevice.current) return;
    clearTimeout(closeTimer.current);
    setMenuOpen(true);
  };
  const handleLeave = () => {
    if (isTouchDevice.current) return;
    closeTimer.current = setTimeout(() => setMenuOpen(false), 600);
  };
  const handleToggle = () => {
    isTouchDevice.current = "ontouchstart" in window;
    setMenuOpen(o => {
      if (!o) setFocusIndex(0);
      return !o;
    });
  };

  // Build menu items list for keyboard nav
  const menuItems = useCallback(() => {
    const items: string[] = [];
    if (onOpenChat) items.push("chat");
    if (whatsappPhone?.replace(/\D/g, "")) items.push("whatsapp");
    if (presenterInstagram) items.push("instagram");
    return items;
  }, [onOpenChat, whatsappPhone, presenterInstagram]);

  // Keyboard navigation for TV remotes
  useEffect(() => {
    if (!menuOpen) return;
    const items = menuItems();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex(i => Math.max(0, i - 1));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex(i => Math.min(items.length - 1, i + 1));
      } else if (e.key === "Escape" || e.key === "Backspace") {
        e.preventDefault();
        setMenuOpen(false);
        setFocusIndex(-1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [menuOpen, menuItems]);

  // Auto-focus menu buttons
  useEffect(() => {
    if (!menuOpen || focusIndex < 0 || !menuRef.current) return;
    const btns = menuRef.current.querySelectorAll<HTMLElement>("[data-menu-item]");
    btns[focusIndex]?.focus();
  }, [focusIndex, menuOpen]);
  const cleanPhone = whatsappPhone?.replace(/\D/g, "") || "";

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
            backgroundColor: "#a10a0b",
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
              {/* Hover menu — 3 action buttons */}
              <div
                className="relative inline-block mb-2"
                onMouseEnter={handleEnter}
                onMouseLeave={handleLeave}
              >
                {/* Round + button */}
                <button
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all hover:scale-110 active:scale-95"
                  style={{ backgroundColor: "hsla(0, 0%, 100%, 0.2)" }}
                  onClick={handleToggle}
                >
                  {menuOpen ? <X size={18} className="text-white" /> : <Plus size={18} className="text-white" />}
                </button>

                {/* Expanded menu */}
                {menuOpen && (
                  <div
                    className="absolute bottom-full left-0 mb-1 pb-2 flex flex-col gap-1.5 animate-fade-in min-w-[200px]"
                    style={{ animationDuration: "0.15s" }}
                    onMouseEnter={handleEnter}
                    onMouseLeave={handleLeave}
                  >
                    {/* Chat ao vivo */}
                    {onOpenChat && (
                      <button
                        onClick={onOpenChat}
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg transition-all hover:brightness-125 active:scale-95 text-left"
                        style={{ backgroundColor: "hsl(0 80% 40%)" }}
                      >
                        <MessageCircle size={16} className="text-white shrink-0" />
                        <span className="text-white text-xs font-semibold whitespace-nowrap">Chat ao Vivo</span>
                      </button>
                    )}
                    {/* WhatsApp do estúdio */}
                    {cleanPhone && (
                      <a
                        href={`https://wa.me/${cleanPhone}?text=Olá, ${presenterName || "Locutor"}!`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg transition-all hover:brightness-125 active:scale-95"
                        style={{ backgroundColor: "hsl(0 80% 40%)" }}
                      >
                        <span className="shrink-0 text-white"><WhatsAppIcon size={16} /></span>
                        <span className="text-white text-xs font-semibold whitespace-nowrap">WhatsApp do Estúdio</span>
                      </a>
                    )}
                    {/* Instagram */}
                    {presenterInstagram && (
                      <a
                        href={`https://instagram.com/${presenterInstagram.replace(/^@/, "")}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 px-3.5 py-2 rounded-lg transition-all hover:brightness-125 active:scale-95"
                        style={{ backgroundColor: "hsl(0 80% 40%)" }}
                      >
                        <Instagram size={16} className="text-white shrink-0" />
                        <span className="text-white text-xs font-semibold whitespace-nowrap">Siga {presenterName || "Locutor"}</span>
                      </a>
                    )}
                  </div>
                )}
              </div>

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
            /* "Sem título" state: dark red bg + logo + audio spectrum */
            <div className="absolute inset-0 flex flex-col items-center justify-center rounded-3xl overflow-hidden">
              {/* Subtle radial glow */}
              <div className="absolute inset-0" style={{ background: "radial-gradient(circle at center, hsla(0,70%,20%,0.4) 0%, transparent 70%)" }} />

              {/* Channel logo centered */}
              {channelLogo && (
                <img
                  src={channelLogo}
                  alt="Logo"
                  className="w-32 h-32 object-contain opacity-25 z-[1] animate-fade-in"
                  style={{ animationDuration: "1s" }}
                />
              )}

              {/* Spectrum fills bottom half */}
              <Suspense fallback={null}>
                <div className="absolute inset-x-0 bottom-0 z-[2]" style={{ height: "55%" }}>
                  <div className="relative w-full h-full">
                    <AudioSpectrum audioElement={audioElement ?? null} barColor="#a10a0b" />
                  </div>
                </div>
              </Suspense>

              {/* "NO AR" subtle label */}
              <div className="absolute bottom-4 left-5 z-[3] flex items-center gap-2">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#a10a0b" }} />
                <span className="text-white/30 text-xs font-semibold tracking-widest uppercase">no ar</span>
              </div>
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
