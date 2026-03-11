import { MessageSquare, SlidersHorizontal, Monitor, LogOut } from "lucide-react";
import logoNexo from "@/assets/logo-nexo.png";

interface TpMenuProps {
  onMessage: () => void;
  onControl: () => void;
  onOpenTp: () => void;
  onLogout: () => void;
}

export default function TpMenu({ onMessage, onControl, onOpenTp, onLogout }: TpMenuProps) {
  const menuBtnStyle: React.CSSProperties = {
    width: "180px", height: "180px", borderRadius: "20px", border: "1px solid rgba(74,144,226,0.3)",
    background: "linear-gradient(135deg, rgba(13,4,70,0.9), rgba(26,10,110,0.9))",
    cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px",
    transition: "all 0.2s", boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
  };

  const handleHover = (e: React.MouseEvent<HTMLButtonElement>, enter: boolean) => {
    e.currentTarget.style.borderColor = enter ? "#4a90e2" : "rgba(74,144,226,0.3)";
    e.currentTarget.style.transform = enter ? "scale(1.04)" : "scale(1)";
  };

  const items = [
    { icon: <MessageSquare size={40} color="#4a90e2" />, label: "Mandar Mensagem", onClick: onMessage },
    { icon: <SlidersHorizontal size={40} color="#4a90e2" />, label: "Controlar TP", onClick: onControl },
    { icon: <Monitor size={40} color="#4a90e2" />, label: "Abrir TP", onClick: onOpenTp },
  ];

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      backgroundColor: "#0f1058", fontFamily: "'Poppins', 'Inter', sans-serif", gap: "32px",
    }}>
      <img src={logoNexo} alt="Nexo" style={{ height: "36px", opacity: 0.9 }} />
      <div className="tp-menu-buttons" style={{ display: "flex", gap: "24px" }}>
        {items.map((item, i) => (
          <button
            key={i}
            className="tp-menu-btn"
            onClick={item.onClick}
            style={menuBtnStyle}
            onMouseEnter={(e) => handleHover(e, true)}
            onMouseLeave={(e) => handleHover(e, false)}
          >
            {item.icon}
            <span style={{ color: "#fff", fontSize: "13px", fontWeight: 700 }}>{item.label}</span>
          </button>
        ))}
      </div>
      <button onClick={onLogout} style={{
        background: "none", border: "1px solid rgba(255,255,255,0.15)", borderRadius: "10px",
        padding: "8px 20px", cursor: "pointer", color: "rgba(255,255,255,0.4)", fontSize: "11px",
        display: "flex", alignItems: "center", gap: "6px", marginTop: "8px",
      }}>
        <LogOut size={12} /> Sair
      </button>
    </div>
  );
}
