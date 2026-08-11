import { useState, useEffect } from "react";
import { CloudSun, Sun, MapPin } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function AnimatedWeatherLayout() {
  const [active, setActive] = useState(false);

  // Trigger simple animation loop
  useEffect(() => {
    const interval = setInterval(() => setActive(prev => !prev), 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-6 rounded-3xl bg-gradient-to-br from-[#00BFF0]/20 to-[#C6F03C]/20 border border-[#00BFF0]/50 backdrop-blur-xl shadow-2xl">
      <h3 className="text-[#0A2540] font-black uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
        <CloudSun className="text-[#00BFF0]" /> Previsão do Tempo
      </h3>
      
      <div className="relative h-48 overflow-hidden rounded-2xl bg-white/40 flex items-center justify-center">
        <AnimatePresence mode="wait">
          <motion.div
            key={active ? "sunny" : "cloudy"}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ duration: 0.5 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="w-20 h-20 bg-white/60 rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              {active ? <Sun size={48} className="text-amber-400 animate-pulse" /> : <CloudSun size={48} className="text-[#00BFF0]" />}
            </div>
            <span className="font-bold text-[#0A2540] uppercase tracking-wider text-sm">
              {active ? "Dia Ensolarado" : "Parcialmente Nublado"}
            </span>
          </motion.div>
        </AnimatePresence>
      </div>
      
      <div className="mt-4 flex justify-between items-center bg-white/50 p-3 rounded-full border border-white/50">
        <div className="flex items-center gap-2 text-[#0A2540] font-bold text-sm">
          <MapPin size={16} className="text-[#00BFF0]" /> SÃO PAULO
        </div>
        <div className="text-2xl font-black text-[#0A2540]">28°C</div>
      </div>
    </div>
  );
}
