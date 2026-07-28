import { ReactNode } from "react";

interface NavItemProps {
  icon: ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

export default function NavItem({ icon, label, active, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 px-6 py-4 transition-all duration-200 rounded-lg mx-2 ${
        active
          ? "text-primary bg-primary/10 shadow-[0_2px_8px_-2px_hsl(var(--primary)/0.2)]"
          : "text-sidebar-foreground hover:text-foreground hover:bg-white/5"
      }`}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
