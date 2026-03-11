import { useState, useEffect, useRef } from "react";
import { MessageSquare, SlidersHorizontal, Monitor, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import logoNexo from "@/assets/logo-nexo.png";

interface TpMenuProps {
  onMessage: () => void;
  onControl: () => void;
  onOpenTp: () => void;
  onLogout: () => void;
}

export default function TpMenu({ onMessage, onControl, onOpenTp, onLogout }: TpMenuProps) {
  const { user } = useAuth();
  const [tpOnline, setTpOnline] = useState(false);
  const lastStateRef = useRef(0);

  // Listen for TP state broadcasts (keepalive every 2s)
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`tp-state-${user.id}`, { config: { broadcast: { self: true } } })
      .on("broadcast", { event: "tp-state" }, () => {
        lastStateRef.current = Date.now();
        setTpOnline(true);
      })
      .subscribe();

    // Check staleness every 2s
    const interval = setInterval(() => {
      if (!lastStateRef.current) { setTpOnline(false); return; }
      setTpOnline(Date.now() - lastStateRef.current < 5000);
    }, 2000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(ch);
    };
  }, [user]);

  const items = [
    { icon: <MessageSquare size={40} className={tpOnline ? "text-tp-accent" : "text-tp-foreground/20"} />, label: "Mandar Mensagem", onClick: onMessage, needsTp: true },
    { icon: <SlidersHorizontal size={40} className={tpOnline ? "text-tp-accent" : "text-tp-foreground/20"} />, label: "Controlar TP", onClick: onControl, needsTp: true },
    { icon: <Monitor size={40} className="text-tp-accent" />, label: "Abrir TP", onClick: onOpenTp, needsTp: false },
  ];

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-tp font-sans gap-8">
      <img src={logoNexo} alt="Nexo" className="h-9 opacity-90" />

      {/* TP status indicator */}
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full transition-colors ${tpOnline ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" : "bg-tp-foreground/20"}`} />
        <span className={`text-[11px] font-semibold ${tpOnline ? "text-green-400" : "text-tp-muted"}`}>
          {tpOnline ? "TP Online" : "TP Offline — abra o TP primeiro"}
        </span>
      </div>

      <div className="tp-menu-buttons flex gap-6">
        {items.map((item, i) => {
          const disabled = item.needsTp && !tpOnline;
          return (
            <button
              key={i}
              className={`tp-menu-btn w-[180px] h-[180px] rounded-[20px] border bg-gradient-to-br from-tp-surface to-tp-surface-light flex flex-col items-center justify-center gap-4 transition-all shadow-[0_8px_32px_hsl(var(--tp-shadow))] ${
                disabled
                  ? "border-tp-foreground/10 opacity-40 cursor-not-allowed"
                  : "border-tp-border cursor-pointer hover:border-tp-accent hover:scale-[1.04]"
              }`}
              onClick={disabled ? undefined : item.onClick}
              disabled={disabled}
            >
              {item.icon}
              <span className="text-tp-foreground text-[13px] font-bold">{item.label}</span>
            </button>
          );
        })}
      </div>
      <button onClick={onLogout} className="bg-transparent border border-tp-border-subtle rounded-[10px] px-5 py-2 cursor-pointer text-tp-muted text-[11px] flex items-center gap-1.5 mt-2">
        <LogOut size={12} /> Sair
      </button>
    </div>
  );
}
