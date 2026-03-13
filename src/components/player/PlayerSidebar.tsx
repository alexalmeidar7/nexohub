import { useRef, useState, useEffect } from "react";
import { LogOut } from "lucide-react";
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
  showLogout?: boolean;
  showSignup?: boolean;
  onLogout?: () => void;
  onSignup?: () => void;
  loading?: boolean;
  autoHide?: boolean;
  visible?: boolean;
}

export default function PlayerSidebar({
  items,
  activeKey,
  avatarUrl,
  userName = "Visitante",
  showLogout,
  showSignup,
  onLogout,
  onSignup,
  loading,
  autoHide = false,
  visible = true,
}: PlayerSidebarProps) {
  const [hovered, setHovered] = useState(false);

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
        className="w-[52px] flex flex-col items-center py-6 gap-2 z-40 fixed left-0 top-0 bottom-0 transition-all duration-300 ease-in-out"
        style={{
          background: "transparent",
          transform: isShown ? "translateX(0)" : "translateX(-100%)",
          opacity: isShown ? 1 : 0,
          pointerEvents: isShown ? "auto" : "none",
        }}
      >
        {/* Avatar */}
        <div className="group/avatar relative flex flex-col items-center mb-2">
          <div className="w-9 h-9 rounded-full bg-player-surface/30 flex items-center justify-center overflow-hidden cursor-pointer transition-transform duration-200 hover:scale-110">
            {loading ? (
              <Skeleton className="w-full h-full rounded-full bg-white/10" />
            ) : avatarUrl ? (
              <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
            ) : (
              <img src="/avatars/usr-default.png" alt="Visitante" className="w-full h-full object-cover" />
            )}
          </div>
          {/* Tooltip on hover */}
          <div className="absolute left-[48px] top-0 opacity-0 pointer-events-none group-hover/avatar:opacity-100 group-hover/avatar:pointer-events-auto transition-all duration-200 z-50">
            <div
              className="rounded-xl px-4 py-3 flex flex-col gap-0.5 whitespace-nowrap"
              style={{
                background: "rgba(0,0,0,0.85)",
                backdropFilter: "blur(16px)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            >
              <p className="text-sm text-white/70">Bem vindo,</p>
              <p className="text-sm text-player-accent font-bold">{userName}</p>
              {showLogout && onLogout && (
                <button
                  onClick={onLogout}
                  className="text-white/50 text-xs hover:text-white hover:underline flex items-center gap-1 transition-colors mt-0.5"
                >
                  <LogOut className="h-3 w-3" /> Sair
                </button>
              )}
              {showSignup && onSignup && (
                <button onClick={onSignup} className="text-player-accent text-xs hover:underline mt-0.5">
                  cadastre-se
                </button>
              )}
            </div>
          </div>
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
                    ? "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))"
                    : "transparent",
                  boxShadow: isActive ? "0 2px 12px hsla(var(--player-accent) / 0.35)" : "none",
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
                      background: "rgba(0,0,0,0.85)",
                      backdropFilter: "blur(12px)",
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
