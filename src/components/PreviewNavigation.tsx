import { Link, useLocation } from "react-router-dom";
import { Home, MonitorPlay, ShoppingBag, Radio, Wrench, Menu, X } from "lucide-react";
import { useState } from "react";

const navLinks = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/player", label: "Player Hub", icon: MonitorPlay },
  { path: "/telapromo", label: "Tela Promo", icon: ShoppingBag },
  { path: "/vmix-control", label: "vMix Control", icon: Radio },
  { path: "/tp-externo", label: "TP Externo", icon: Wrench },
  { path: "/admin/dashboard", label: "Admin", icon: Radio },
];

export default function PreviewNavigation() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="fixed top-0 left-0 right-0 z-[99999] pointer-events-none">
      <div className="max-w-fit mx-auto mt-2 pointer-events-auto">
        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1 p-1 bg-black/80 backdrop-blur-md border border-white/10 rounded-full shadow-2xl">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = location.pathname === link.path;
            return (
              <Link
                key={link.path}
                to={link.path}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                  isActive 
                    ? "bg-white text-black shadow-lg" 
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <Icon size={14} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Mobile Toggle */}
        <button 
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden flex items-center justify-center w-10 h-10 bg-black/80 backdrop-blur-md border border-white/10 rounded-full text-white shadow-xl"
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>

        {/* Mobile Navigation */}
        {isOpen && (
          <nav className="md:hidden absolute top-12 left-1/2 -translate-x-1/2 w-48 p-2 bg-black/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = location.pathname === link.path;
                return (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setIsOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                      isActive 
                        ? "bg-white text-black" 
                        : "text-white/70 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon size={14} />
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
