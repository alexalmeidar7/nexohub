import { MessageSquare, SlidersHorizontal, Monitor, LogOut } from "lucide-react";
import logoNexo from "@/assets/logo-nexo.png";

interface TpMenuProps {
  onMessage: () => void;
  onControl: () => void;
  onOpenTp: () => void;
  onLogout: () => void;
}

export default function TpMenu({ onMessage, onControl, onOpenTp, onLogout }: TpMenuProps) {
  const items = [
    { icon: <MessageSquare size={40} className="text-tp-accent" />, label: "Mandar Mensagem", onClick: onMessage },
    { icon: <SlidersHorizontal size={40} className="text-tp-accent" />, label: "Controlar TP", onClick: onControl },
    { icon: <Monitor size={40} className="text-tp-accent" />, label: "Abrir TP", onClick: onOpenTp },
  ];

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-tp font-sans gap-8">
      <img src={logoNexo} alt="Nexo" className="h-9 opacity-90" />
      <div className="tp-menu-buttons flex gap-6">
        {items.map((item, i) => (
          <button
            key={i}
            className="tp-menu-btn w-[180px] h-[180px] rounded-[20px] border border-tp-border bg-gradient-to-br from-tp-surface to-tp-surface-light cursor-pointer flex flex-col items-center justify-center gap-4 transition-all shadow-[0_8px_32px_hsl(var(--tp-shadow))] hover:border-tp-accent hover:scale-[1.04]"
            onClick={item.onClick}
          >
            {item.icon}
            <span className="text-tp-foreground text-[13px] font-bold">{item.label}</span>
          </button>
        ))}
      </div>
      <button onClick={onLogout} className="bg-transparent border border-tp-border-subtle rounded-[10px] px-5 py-2 cursor-pointer text-tp-muted text-[11px] flex items-center gap-1.5 mt-2">
        <LogOut size={12} /> Sair
      </button>
    </div>
  );
}
