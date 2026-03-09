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
  /** When true, sidebar auto-hides and only appears on left-edge hover */
  autoHide?: boolean;
  /** External visibility signal (e.g. tied to control bar) */
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
  const navRef = useRef<HTMLElement>(null);
  const btnRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [, forceRender] = useState(0);
  const [hovered, setHovered] = useState(false);

  // Force re-render after mount so sliding highlight has refs
  useEffect(() => {
    forceRender(1);
  }, []);

  const isShown = autoHide ? (visible || hovered) : true;

  return (
    <>
      {/* Invisible left-edge hover trigger zone (only when autoHide) */}
      {autoHide && !isShown && (
        <div
          className="fixed left-0 top-0 bottom-0 w-4 z-[41]"
          onMouseEnter={() => setHovered(true)}
        />
      )}
      <aside
        onMouseEnter={() => autoHide && setHovered(true)}
        onMouseLeave={() => autoHide && setHovered(false)}
        className="w-[72px] flex flex-col items-center py-6 gap-2 z-40 fixed left-0 top-0 bottom-0 transition-all duration-300 ease-in-out"
        style={{
          background: "linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.55) 100%)",
          backdropFilter: "blur(32px) saturate(1.6)",
          WebkitBackdropFilter: "blur(32px) saturate(1.6)",
          borderRight: "1px solid rgba(255,255,255,0.07)",
          transform: isShown ? "translateX(0)" : "translateX(-100%)",
          opacity: isShown ? 1 : 0,
          pointerEvents: isShown ? "auto" : "none",
        }}
      >
        {/* Avatar with hover popup */}
        <div className="group/avatar relative flex flex-col items-center mb-2">
          <div className="w-10 h-10 rounded-full bg-player-surface flex items-center justify-center overflow-hidden cursor-pointer">
            {loading ? (
              <Skeleton className="w-full h-full rounded-full bg-white/10" />
            ) : avatarUrl ? (
              <img src={avatarUrl} alt={userName} className="w-full h-full object-cover" />
            ) : (
              <img src="/avatars/usr-default.png" alt="Visitante" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="absolute left-[56px] top-0 opacity-0 pointer-events-none group-hover/avatar:opacity-100 group-hover/avatar:pointer-events-auto transition-all duration-200 z-50">
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
        <div className="w-8 h-px" style={{ background: "rgba(255,255,255,0.1)" }} />

        {/* Nav items with sliding highlight */}
        <nav ref={navRef} className="flex flex-col items-center gap-1.5 flex-1 justify-center relative">
          {(() => {
            const activeBtn = btnRefs.current[activeKey];
            const nav = navRef.current;
            if (!activeBtn || !nav) return null;
            const navRect = nav.getBoundingClientRect();
            const btnRect = activeBtn.getBoundingClientRect();
            const top = btnRect.top - navRect.top;
            const height = btnRect.height;
            return (
              <>
                <div
                  className="absolute left-1/2 -translate-x-1/2 rounded-xl pointer-events-none z-0"
                  style={{
                    top,
                    height,
                    width: 52,
                    transition: "top 0.35s cubic-bezier(0.4, 0, 0.2, 1), height 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    background: "linear-gradient(135deg, hsl(var(--player-accent)), hsl(var(--player-accent-hover)))",
                    boxShadow: "0 4px 20px hsla(var(--player-accent) / 0.4)",
                  }}
                />
                <span
                  className="absolute -left-[1px] w-[3px] h-7 rounded-r-full pointer-events-none z-0"
                  style={{
                    top: top + height / 2 - 14,
                    transition: "top 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
                    backgroundColor: "hsl(var(--player-accent))",
                  }}
                />
              </>
            );
          })()}
          {items.map((item) => {
            const isActive = activeKey === item.key;
            return (
              <button
                key={item.key}
                ref={(el) => { btnRefs.current[item.key] = el; }}
                onClick={item.action}
                className="group relative w-[52px] rounded-xl px-2 py-3 flex flex-col items-center justify-center gap-1 transition-all duration-300 focus-visible:outline-none z-[1]"
                title={item.label}
                aria-label={item.label}
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-300">
                  <item.icon
                    className={`h-[18px] w-[18px] transition-colors duration-200 ${
                      isActive ? "text-white" : "text-white/50 group-hover:text-white/80"
                    }`}
                  />
                </div>
                <span
                  className={`text-[8px] font-medium leading-none tracking-wide transition-colors duration-200 ${
                    isActive ? "text-white" : "text-white/40 group-hover:text-white/70"
                  }`}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
