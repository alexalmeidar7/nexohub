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
    <div className="p-8 rounded-[2.5rem] bg-[#0A2540]/60 border border-white/10 backdrop-blur-2xl shadow-[0_32px_64px_rgba(0,0,0,0.4)] relative overflow-hidden flex flex-col items-center">
      <div className="text-center mb-8">
        <h2 className="text-4xl font-black text-white tracking-tight flex flex-col items-center gap-1">
          goiânia
          <span className="text-[0.6em] font-bold text-[#00BFF0] uppercase tracking-[0.4em] mt-[-0.2em]">
            Previsão do Tempo
          </span>
        </h2>
      </div>

      <div className="w-full max-w-md bg-white/5 rounded-[2.5rem] p-8 border border-white/10 backdrop-blur-md mb-8">
        <div className="flex items-center justify-between mb-6">
          <div className="relative">
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sun size={84} className="text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]" />
            </motion.div>
          </div>
          <div className="text-right">
            <div className="text-7xl font-black text-white">33°</div>
            <div className="text-lg font-bold text-white/80">Céu limpo</div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="bg-white/5 rounded-2xl py-3 px-6 flex items-center justify-between border border-white/5">
            <div className="flex items-center gap-4">
              <Thermometer size={18} className="text-white/40" />
              <span className="text-lg font-bold text-white">22° / 34°</span>
            </div>
            <div className="flex items-center gap-4">
              <Droplets size={18} className="text-[#00BFF0]" />
              <span className="text-lg font-bold text-[#00BFF0]">18%</span>
            </div>
            <div className="flex items-center gap-4">
              <CloudRain size={18} className="text-white/40" />
              <span className="text-lg font-bold text-white/60">0%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="w-full space-y-4">
        <div className="text-center">
          <span className="text-xs font-black text-white/40 uppercase tracking-[0.3em]">Próximos Dias</span>
        </div>
        
        {[
          { day: "Qua, 12", temp: "32°", min: "21°", icon: <CloudSun className="text-white" />, rain: "50%", mm: "0mm" },
          { day: "Qui, 13", temp: "33°", min: "22°", icon: <CloudSun className="text-white" />, rain: "50%", mm: "0mm" },
          { day: "Sex, 14", temp: "34°", min: "23°", icon: <CloudSun className="text-white" />, rain: "33%", mm: "0mm" }
        ].map((item, i) => (
          <div key={i} className="bg-white/5 p-5 rounded-[1.8rem] border border-white/10 flex items-center justify-between backdrop-blur-sm">
            <span className="text-lg font-bold text-white/80 w-24">{item.day}</span>
            <div className="flex items-center gap-2">
              <div className="p-2 bg-white/5 rounded-xl">
                {item.icon}
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black text-[#00BFF0] uppercase flex items-center gap-1">
                  <Droplets size={8} /> {item.rain}
                </span>
                <span className="text-[10px] font-bold text-white/40">{item.mm}</span>
              </div>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-black text-white">{item.temp}</span>
              <span className="text-sm font-bold text-white/30">{item.min}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
    </div>
  );
}
