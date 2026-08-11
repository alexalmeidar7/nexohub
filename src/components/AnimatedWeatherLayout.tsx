import { useState, useEffect } from "react";
import { CloudSun, Sun, MapPin, Droplets, CloudRain, Thermometer } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AnimatedWeatherLayout() {
  const [active, setActive] = useState(false);

  // Trigger simple animation loop for visual interest
  useEffect(() => {
    const interval = setInterval(() => setActive(prev => !prev), 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-8 rounded-[2.5rem] bg-gradient-to-br from-[#00BFF0]/10 via-white/5 to-[#C6F03C]/10 border border-[#00BFF0]/30 backdrop-blur-2xl shadow-[0_32px_64px_rgba(0,0,0,0.2)] relative overflow-hidden">
      {/* Decorative Glow */}
      <div className="absolute top-[-20%] right-[-10%] w-64 h-64 bg-[#00BFF0]/20 blur-[80px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-64 h-64 bg-[#C6F03C]/20 blur-[80px] rounded-full pointer-events-none" />

      <div className="relative z-10">
        <div className="flex justify-between items-start mb-8">
          <div>
            <h3 className="text-[#0A2540] font-black uppercase tracking-[0.3em] text-xs flex items-center gap-2 mb-1">
              <div className="w-2 h-2 rounded-full bg-[#00BFF0] animate-pulse" />
              Previsão do Tempo
            </h3>
            <div className="text-3xl font-black text-[#0A2540] tracking-tight">SÃO PAULO, SP</div>
          </div>
          <div className="bg-white/60 px-4 py-2 rounded-2xl border border-white/50 shadow-sm">
            <div className="text-[10px] font-bold text-[#0A2540]/60 uppercase tracking-widest text-center">Agora</div>
            <div className="text-2xl font-black text-[#0A2540]">28°C</div>
          </div>
        </div>
        
        <div className="relative h-56 overflow-hidden rounded-[2rem] bg-white/40 border border-white/60 flex items-center justify-center shadow-inner">
          <AnimatePresence mode="wait">
            <motion.div
              key={active ? "sunny" : "cloudy"}
              initial={{ opacity: 0, scale: 0.8, rotate: active ? -10 : 10 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 1.2, rotate: active ? 10 : -10 }}
              transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col items-center gap-4"
            >
              <div className="relative">
                <motion.div 
                  animate={{ y: [0, -10, 0] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="w-28 h-28 bg-white/80 rounded-full flex items-center justify-center shadow-[0_20px_40px_rgba(0,0,0,0.1)] border-4 border-white"
                >
                  {active ? (
                    <Sun size={64} className="text-amber-400 drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
                  ) : (
                    <CloudSun size={64} className="text-[#00BFF0] drop-shadow-[0_0_15px_rgba(0,191,240,0.5)]" />
                  )}
                </motion.div>
                {/* Secondary floating icon */}
                <motion.div 
                  animate={{ x: [0, 5, 0], y: [0, 5, 0] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -bottom-2 -right-2 bg-white p-2 rounded-xl shadow-md border border-white/50"
                >
                  {active ? <Thermometer size={16} className="text-red-500" /> : <Droplets size={16} className="text-[#00BFF0]" />}
                </motion.div>
              </div>
              <span className="font-black text-[#0A2540] uppercase tracking-[0.2em] text-sm bg-white/50 px-6 py-2 rounded-full border border-white/50">
                {active ? "Céu Limpo" : "Parcialmente Nublado"}
              </span>
            </motion.div>
          </AnimatePresence>
        </div>
        
        <div className="mt-8 grid grid-cols-3 gap-4">
          {[
            { label: "Mín/Máx", value: "22° / 30°", icon: <Thermometer size={14} />, color: "#F03C3C" },
            { label: "Umidade", value: "65%", icon: <Droplets size={14} />, color: "#00BFF0" },
            { label: "Chuva", value: "10%", icon: <CloudRain size={14} />, color: "#7dd3fc" }
          ].map((item, i) => (
            <div key={i} className="bg-white/50 p-4 rounded-3xl border border-white/60 flex flex-col items-center gap-1 hover:bg-white/80 transition-colors cursor-default">
              <div style={{ color: item.color }} className="mb-1 opacity-80">
                {item.icon}
              </div>
              <div className="text-[9px] font-black text-[#0A2540]/40 uppercase tracking-widest">{item.label}</div>
              <div className="text-lg font-black text-[#0A2540]">{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
