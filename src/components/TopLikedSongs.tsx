import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Heart, Music } from "lucide-react";

interface LikedSong {
  titulo: string;
  artista: string;
  capa: string;
  count: number;
}

export default function TopLikedSongs() {
  const { user } = useAuth();
  const [songs, setSongs] = useState<LikedSong[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetch = async () => {
      const { data } = await supabase
        .from("music_likes")
        .select("titulo, artista, capa")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (!data) {
        setLoading(false);
        return;
      }

      const map = new Map<string, LikedSong>();
      for (const row of data) {
        const key = `${row.artista}||${row.titulo}`;
        const existing = map.get(key);
        if (existing) {
          existing.count++;
        } else {
          map.set(key, {
            titulo: row.titulo,
            artista: row.artista,
            capa: row.capa || "",
            count: 1,
          });
        }
      }

      const sorted = Array.from(map.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      setSongs(sorted);
      setLoading(false);
    };

    fetch();
  }, [user]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-1.5 mb-2">
        <Heart size={14} fill="#268ffa" style={{ color: "#268ffa" }} className="animate-pulse" />
        <span className="font-bold text-xs uppercase tracking-wide text-white">Músicas Curtidas</span>
      </div>

      {loading ? (
        <div className="space-y-1.5 animate-pulse flex-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 py-1 px-1.5">
              <div className="w-4 h-4 rounded-full bg-white/10 shrink-0" />
              <div className="w-7 h-7 rounded bg-white/10 shrink-0" />
              <div className="flex-1 space-y-1">
                <div className="h-2.5 w-3/4 rounded bg-white/10" />
                <div className="h-2 w-1/2 rounded bg-white/5" />
              </div>
            </div>
          ))}
        </div>
      ) : songs.length === 0 ? (
        <p className="text-xs text-white/50">Nenhuma música curtida ainda.</p>
      ) : (
        <div className="space-y-1 overflow-y-auto flex-1 scrollbar-hide">
          {songs.map((song, i) => (
            <div
              key={`${song.artista}-${song.titulo}`}
              className="flex items-center gap-2 py-1 px-1.5 rounded-lg"
            >
              <span
                className="w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-white shrink-0"
                style={{ backgroundColor: i < 3 ? "#268ffa" : "rgba(255,255,255,0.2)" }}
              >
                {i + 1}
              </span>
              {song.capa ? (
                <img src={song.capa} alt={song.titulo} className="w-7 h-7 rounded object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded flex items-center justify-center shrink-0 bg-white/10">
                  <Music size={12} className="text-white/40" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold truncate text-white">{song.titulo}</p>
                <p className="text-[9px] truncate text-white/50">{song.artista}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Heart size={8} fill="#268ffa" style={{ color: "#268ffa" }} />
                <span className="text-[9px] font-bold text-white">{song.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
