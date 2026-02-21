import { useState, useEffect } from "react";
import { Disc3 } from "lucide-react";
import { getMusicData } from "./MusicaNoAr";

export default function MusicWidget() {
  const [music, setMusic] = useState<ReturnType<typeof getMusicData>>(null);

  useEffect(() => {
    const update = () => setMusic(getMusicData());
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  if (!music) {
    return (
      <div className="rounded-xl p-5" style={{ backgroundColor: "#aea4ee" }}>
        <div className="flex items-center gap-2 mb-2">
          <Disc3 size={16} className="text-gray-600" />
          <span className="font-semibold text-gray-600 text-sm">Tocando</span>
        </div>
        <p className="text-gray-500 text-xs">Nenhuma música tocando.</p>
      </div>
    );
  }

  const { music: m } = music;

  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "#aea4ee" }}>
      <div className="flex items-center gap-2 mb-3">
        <Disc3 size={16} className="text-gray-700 animate-spin" style={{ animationDuration: "3s" }} />
        <span className="font-bold text-gray-700 text-sm">♫ TOCANDO</span>
      </div>
      <div className="flex gap-3">
        {m.capa ? (
          <img src={m.capa} alt="Capa" className="w-14 h-14 rounded-lg object-cover border border-gray-300" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-white/50 border border-gray-300 flex items-center justify-center">
            <Disc3 size={24} className="text-gray-400 animate-spin" style={{ animationDuration: "3s" }} />
          </div>
        )}
        <div className="flex-1 space-y-1 min-w-0">
          <p className="font-bold text-gray-800 truncate">{m.titulo}</p>
          <p className="text-gray-500 text-xs truncate">{m.artista}</p>
        </div>
      </div>
    </div>
  );
}
