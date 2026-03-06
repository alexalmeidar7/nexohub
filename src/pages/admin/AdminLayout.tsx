import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Puzzle, MessageSquare, LogOut, ClipboardList } from "lucide-react";
import logoMenu from "@/assets/logo-admin-menu.png";
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
    <div className="min-h-screen flex" style={{ backgroundColor: "#ffffff", color: "#0d0446" }}>
      <aside className="w-16 flex flex-col items-center py-4 gap-3" style={{ backgroundColor: "#0d0446" }}>
        <div className="mb-8 mt-8">
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
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: isActive ? "#2ec0f6" : "transparent",
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
              className="w-10 h-10 rounded-full flex items-center justify-center mb-2"
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

      <main className="flex-1 p-10" style={{ backgroundColor: "#ffffff" }}>
        <header className="mb-8">
          <p className="text-xs font-medium tracking-widest uppercase mb-1" style={{ color: "#2ec0f6" }}>MasterView Admin</p>
          <h2 className="text-3xl font-light" style={{ color: "#0d0446" }}>{title}</h2>
        </header>
        <section className="rounded-2xl p-8 min-h-[400px]" style={{ backgroundColor: "#f8f9fc", border: "1px solid #e2e8f0" }}>
          {children}
        </section>
      </main>
    </div>
  );
}
