import { useRef, useState, useEffect, useCallback } from "react";
import { LogOut, User, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";

interface SidebarItem {
  icon: LucideIcon;
  label: string;
  key: string;
  action: () => void;
}

interface PlayerSidebarProps {
  items: SidebarItem[];
  activeKey: string;
  avatarUrl?: string | null;
  userName?: string;
  userEmail?: string;
  userCity?: string;
  showLogout?: boolean;
  showSignup?: boolean;
  onLogout?: () => void;
  onSignup?: () => void;
  onEditProfile?: () => void;
  loading?: boolean;
  autoHide?: boolean;
  visible?: boolean;
}

export default function PlayerSidebar({
  items,
  activeKey,
  avatarUrl,
  userName = "Visitante",
  userEmail,
  userCity,
  showLogout,
  showSignup,
  onLogout,
  onSignup,
  onEditProfile,
  loading,
  autoHide = false,
  visible = true,
}: PlayerSidebarProps) {
  const [hovered, setHovered] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  // Close profile popup on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [profileOpen]);

  const isShown = autoHide ? (visible || hovered) : true;

  return (
    <>
      {autoHide && !isShown && (
        <div
          className="fixed left-0 top-0 bottom-0 w-4 z-[41]"
          onMouseEnter={() => setHovered(true)}
        />
      )}
      <aside
        onMouseEnter={() => autoHide && setHovered(true)}
        onMouseLeave={() => autoHide && setHovered(false)}
        className="w-[52px] flex flex-col items-center py-6 pl-2 gap-2 z-40 fixed left-0 top-0 bottom-0 transition-all duration-300 ease-in-out"
        style={{
          background: "rgba(0,0,0,0.45)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          transform: isShown ? "translateX(0)" : "translateX(-100%)",
          opacity: isShown ? 1 : 0,
          pointerEvents: isShown ? "auto" : "none",
        }}
      >
        {/* Avatar */}
        <div ref={profileRef} className="relative flex flex-col items-center mb-2">
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="w-9 h-9 rounded-full bg-player-accent flex items-center justify-center overflow-hidden cursor-pointer transition-transform duration-200 hover:scale-110 focus-visible:outline-none"
          >
            {loading ? (
              <Skeleton className="w-full h-full rounded-full bg-white/10" />
            ) : avatarUrl ? (
              <img src={avatarUrl} alt={userName} className="w-full h-full object-contain" />
            ) : (
              <img src="/avatars/usr-default.png" alt="Visitante" className="w-full h-full object-contain" />
            )}
          </button>

          {/* Profile popup on click */}
          {profileOpen && (
            <div
              className="absolute left-[48px] top-0 z-50 animate-fade-in"
              style={{ minWidth: "220px" }}
            >
              <div
                className="rounded-2xl px-5 py-4 flex flex-col gap-3 whitespace-nowrap"
                style={{
                   background: "rgba(10,10,10,0.95)",
                   border: "1px solid rgba(255,255,255,0.08)",
                   boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                 }}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-full overflow-hidden shrink-0 bg-player-accent" style={{ border: "2px solid rgba(255,255,255,0.15)" }}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={userName} className="w-full h-full object-contain" />
                    ) : (
                      <img src="/avatars/usr-default.png" alt="Visitante" className="w-full h-full object-contain" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-white truncate">{userName}</span>
                    {userEmail && <span className="text-[11px] text-white/40 truncate">{userEmail}</span>}
                    {userCity && <span className="text-[11px] text-white/30 truncate">{userCity}</span>}
                  </div>
                </div>

                <div className="w-full h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

                {/* Actions */}
                <div className="flex flex-col gap-1">
                  {onEditProfile && (
                    <button
                      onClick={() => { setProfileOpen(false); onEditProfile(); }}
                      className="flex items-center gap-2 text-white/70 text-xs hover:text-white transition-colors rounded-lg px-2 py-1.5 hover:bg-white/5"
                    >
                      <User className="h-3.5 w-3.5" /> Editar perfil
                    </button>
                  )}
                  {showLogout && onLogout && (
                    <button
                      onClick={() => { setProfileOpen(false); onLogout(); }}
                      className="flex items-center gap-2 text-white/50 text-xs hover:text-red-400 transition-colors rounded-lg px-2 py-1.5 hover:bg-white/5"
                    >
                      <LogOut className="h-3.5 w-3.5" /> Sair
                    </button>
                  )}
                  {showSignup && onSignup && (
                    <button
                      onClick={() => { setProfileOpen(false); onSignup(); }}
                      className="text-player-accent text-xs hover:underline px-2 py-1.5"
                    >
                      Cadastre-se
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Separator */}
        <div className="w-6 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />

        {/* Nav icons */}
        <nav className="flex flex-col items-center gap-1 flex-1 justify-center">
          {items.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <button
                key={item.key}
                onClick={item.action}
                className="group/btn relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 focus-visible:outline-none"
                style={{
                   background: isActive
                     ? "rgba(255,255,255,0.08)"
                     : "transparent",
                   border: isActive ? "1px solid rgba(255,255,255,0.1)" : "1px solid transparent",
                 }}
                title={item.label}
                aria-label={item.label}
              >
                <item.icon
                  className={`h-[18px] w-[18px] transition-colors duration-200 ${
                    isActive ? "text-white" : "text-white/40 group-hover/btn:text-white/80"
                  }`}
                />

                {/* Label tooltip on hover */}
                <div
                  className="absolute left-[calc(100%+8px)] top-1/2 -translate-y-1/2 opacity-0 pointer-events-none group-hover/btn:opacity-100 transition-all duration-200 z-50"
                >
                  <span
                    className="block whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold text-white"
                   style={{
                       background: "rgba(10,10,10,0.92)",
                       border: "1px solid rgba(255,255,255,0.08)",
                     }}
                  >
                    {item.label}
                  </span>
                </div>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
