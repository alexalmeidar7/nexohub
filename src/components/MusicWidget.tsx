import { useState, useEffect } from "react";
import { Music, Disc3 } from "lucide-react";
import { getMusicData } from "./MusicaNoAr";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

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
      <div className="bg-muted rounded-xl p-5 border border-border">
        <div className="flex items-center gap-2 mb-2">
          <Music size={16} className="text-muted-foreground" />
          <span className="font-semibold text-muted-foreground text-sm">Música</span>
        </div>
        <p className="text-muted-foreground text-xs">Nenhuma música tocando.</p>
      </div>
    );
  }

  const { music: m, elapsed } = music;
  const progress = m.duracao > 0 ? Math.min(100, (elapsed / m.duracao) * 100) : 0;

  return (
    <div className="bg-muted rounded-xl p-5 border border-border">
      <div className="flex items-center gap-2 mb-3">
        <Music size={16} className="text-primary animate-pulse" />
        <span className="font-bold text-primary text-sm">♫ TOCANDO</span>
      </div>
      <div className="flex gap-3">
        {m.capa ? (
          <img src={m.capa} alt="Capa" className="w-14 h-14 rounded-lg object-cover border border-border" />
        ) : (
          <div className="w-14 h-14 rounded-lg bg-background/50 border border-border flex items-center justify-center">
            <Disc3 size={24} className="text-muted-foreground animate-spin" style={{ animationDuration: "3s" }} />
          </div>
        )}
        <div className="flex-1 space-y-1 min-w-0">
          <p className="font-bold text-foreground truncate">{m.titulo}</p>
          <p className="text-muted-foreground text-xs truncate">{m.artista}</p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{formatTime(elapsed)}</span>
            <span>/</span>
            <span>{formatTime(m.duracao)}</span>
          </div>
        </div>
      </div>
      <div className="mt-3">
        <div className="w-full h-1.5 bg-background/50 rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-1000" style={{ width: `${progress}%` }} />
        </div>
      </div>
    </div>
  );
}
