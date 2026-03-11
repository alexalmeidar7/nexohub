import { useState, useEffect, useRef } from "react";
import { MessageSquare, SlidersHorizontal, Monitor, LogOut, Trash2 } from "lucide-react";
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

  // Poll DB for cross-network TP status
  useEffect(() => {
    if (!user) {
      setTpOnline(false);
      return;
    }

    let active = true;

    async function checkStatus() {
      const { data } = await (supabase as any)
        .from("teleprompters")
        .select("last_seen")
        .eq("user_id", user!.id)
        .eq("ativo", true)
        .order("last_seen", { ascending: false, nullsFirst: false })
        .limit(1);

      if (!active) return;

      if (data && data.length > 0 && data[0].last_seen) {
        const lastSeen = new Date(data[0].last_seen).getTime();
        const now = Date.now();
        // Consider online if last_seen within 15 seconds
        setTpOnline(now - lastSeen < 15000);
      } else {
        setTpOnline(false);
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 5000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user]);

  async function handleClearText() {
    if (!user) return;
    if (!confirm("Limpar o texto salvo no TP?")) return;
    await (supabase as any)
      .from("teleprompters")
      .update({ texto_atual: "", is_html: false })
      .eq("user_id", user.id)
      .eq("ativo", true);
  }

  const items = [
    { icon: <MessageSquare size={40} className="text-tp-accent" />, label: "Mandar Mensagem", onClick: onMessage },
    { icon: <SlidersHorizontal size={40} className="text-tp-accent" />, label: "Controlar TP", onClick: onControl },
    { icon: <Monitor size={40} className="text-tp-accent" />, label: "Abrir TP", onClick: onOpenTp },
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
        {items.map((item, i) => (
          <button
            key={i}
            className="tp-menu-btn w-[180px] h-[180px] rounded-[20px] border bg-gradient-to-br from-tp-surface to-tp-surface-light flex flex-col items-center justify-center gap-4 transition-all shadow-[0_8px_32px_hsl(var(--tp-shadow))] border-tp-border cursor-pointer hover:border-tp-accent hover:scale-[1.04]"
            onClick={item.onClick}
          >
            {item.icon}
            <span className="text-tp-foreground text-[13px] font-bold">{item.label}</span>
          </button>
        ))}
      </div>

      {/* Clear text button */}
      <button onClick={handleClearText} className="bg-transparent border border-tp-border-subtle rounded-[10px] px-5 py-2 cursor-pointer text-tp-muted text-[11px] flex items-center gap-1.5">
        <Trash2 size={12} /> Limpar Texto do TP
      </button>

      <button onClick={onLogout} className="bg-transparent border border-tp-border-subtle rounded-[10px] px-5 py-2 cursor-pointer text-tp-muted text-[11px] flex items-center gap-1.5">
        <LogOut size={12} /> Sair
      </button>
    </div>
  );
}
