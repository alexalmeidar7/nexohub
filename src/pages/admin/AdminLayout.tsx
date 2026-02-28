import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate, useLocation } from "react-router-dom";
import { LayoutDashboard, Users, Puzzle, LogOut } from "lucide-react";
import logoMenu from "@/assets/logo-menu.png";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/admin/dashboard" },
  { icon: Users, label: "Gestão de Clientes", path: "/admin/users" },
  { icon: Puzzle, label: "Catálogo de Módulos", path: "/admin/modules" },
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
    <div className="min-h-screen bg-background flex text-foreground">
      <aside className="w-16 flex flex-col items-center py-4 gap-3" style={{ backgroundColor: "#111827" }}>
        <div className="mb-4">
          <img src={logoMenu} alt="MasterView Admin" className="w-10 h-auto" />
        </div>

        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          const Icon = item.icon;
          return (
            <Tooltip key={item.path}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate(item.path)}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                    isActive ? "bg-blue-600" : "bg-transparent hover:bg-white/10"
                  }`}
                >
                  <Icon size={18} className={isActive ? "text-white" : "text-gray-400"} />
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
              className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-red-500/20 mb-2"
            >
              <LogOut size={18} className="text-red-400" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right"><p>Sair</p></TooltipContent>
        </Tooltip>

        <div className="opacity-50">
          <span className="text-[8px] font-bold italic text-gray-500 writing-mode-vertical" style={{ writingMode: "vertical-rl" }}>
            svn✦broadcast
          </span>
        </div>
      </aside>

      <main className="flex-1 p-10">
        <header className="mb-8">
          <p className="text-xs text-muted-foreground font-medium tracking-widest uppercase mb-1">MasterView Admin</p>
          <h2 className="text-3xl font-light">{title}</h2>
        </header>
        <section className="bg-surface-elevated border border-border rounded-2xl p-8 min-h-[400px]">
          {children}
        </section>
      </main>
    </div>
  );
}
