import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Puzzle, MessageSquare, LogOut, ClipboardList } from "lucide-react";
import logoMenu from "@/assets/logo-menu.png";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin/dashboard" },
  { icon: Users, label: "Gestão de Clientes", path: "/admin/users" },
  { icon: ClipboardList, label: "Cadastro de Planos", path: "/admin/plans" },
  { icon: Puzzle, label: "Catálogo de Módulos", path: "/admin/modules" },
  { icon: MessageSquare, label: "Mensagens", path: "/admin/messages" },
];

interface AdminLayoutProps {
  children: ReactNode;
  title: string;
}

export default function AdminLayout({ children, title }: AdminLayoutProps) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <div className="min-h-screen flex" style={{ background: "linear-gradient(145deg, #f8f9fc 0%, #eef1f8 100%)", color: "#0d0446" }}>
      <aside className="w-16 flex flex-col items-center py-4 gap-3 relative" style={{ background: "linear-gradient(180deg, #0d0446 0%, #1a1280 100%)" }}>
        {/* Subtle glow at top */}
        <div className="absolute top-0 left-0 right-0 h-24 opacity-20 pointer-events-none" style={{ background: "radial-gradient(ellipse at 50% 0%, #268ffa 0%, transparent 70%)" }} />
        <div className="mb-8 mt-8 relative z-10">
          <img src={logoMenu} alt="Admin" className="w-20 h-auto -rotate-90" />
        </div>

        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate(item.path)}
                  className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 relative z-10"
                  style={{
                    backgroundColor: isActive ? "#2ec0f6" : "transparent",
                    boxShadow: isActive ? "0 4px 16px -2px rgba(46,192,246,0.4)" : "none",
                  }}
                  onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.1)"; }}
                  onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.backgroundColor = "transparent"; }}
                >
                  <Icon size={18} className={isActive ? "text-white" : "text-white/60"} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right"><p>{item.label}</p></TooltipContent>
            </Tooltip>
          );
        })}

        <div className="flex-1" />

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={signOut}
              className="w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-all duration-200 hover:bg-white/10"
              style={{ color: "#2ebff5" }}
            >
              <LogOut size={18} />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Sair</p></TooltipContent>
        </Tooltip>

        <div className="opacity-50">
          <span className="text-[8px] font-bold italic text-white/40" style={{ writingMode: "vertical-rl" }}>
            svn✦broadcast
          </span>
        </div>
      </aside>

      <main className="flex-1 p-10">
        <header className="mb-8">
          <p className="text-xs font-medium tracking-widest uppercase mb-1" style={{ color: "#2ec0f6" }}>MasterView Admin</p>
          <h2 className="text-3xl font-light" style={{ color: "#0d0446" }}>{title}</h2>
        </header>
        <section
          className="rounded-2xl p-8 min-h-[400px] backdrop-blur-sm"
          style={{
            background: "rgba(255,255,255,0.85)",
            border: "1px solid rgba(226,232,240,0.8)",
            boxShadow: "0 4px 24px -4px rgba(0,0,0,0.06), 0 0 0 1px rgba(255,255,255,0.6)",
          }}
        >
          {children}
        </section>
      </main>
    </div>
  );
}
