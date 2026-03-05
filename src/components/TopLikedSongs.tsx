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

      // Aggregate by titulo+artista
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
      {/* Header aligned like "NO AR" */}
      <div className="flex items-center gap-1.5 mb-2">
        <Heart size={14} fill="#268ffa" style={{ color: "#268ffa" }} className="animate-pulse" />
        <span className="font-bold text-xs uppercase tracking-wide" style={{ color: "#268ffa" }}>Músicas Curtidas</span>
      </div>

      {loading ? (
        <p className="text-xs" style={{ color: "#0d0446", opacity: 0.5 }}>Carregando...</p>
      ) : songs.length === 0 ? (
        <p className="text-xs" style={{ color: "#0d0446", opacity: 0.5 }}>Nenhuma música curtida ainda.</p>
      ) : (
        <div className="space-y-1 overflow-y-auto flex-1 scrollbar-hide">
          {songs.map((song, i) => (
            <div
              key={`${song.artista}-${song.titulo}`}
              className="flex items-center gap-2 py-1 px-1.5 rounded-lg"
            >
              <span
                className="w-4 h-4 flex items-center justify-center rounded-full text-[9px] font-bold text-white shrink-0"
                style={{ backgroundColor: i < 3 ? "#268ffa" : "#0d0446" }}
              >
                {i + 1}
              </span>
              {song.capa ? (
                <img src={song.capa} alt={song.titulo} className="w-7 h-7 rounded object-cover shrink-0" />
              ) : (
                <div className="w-7 h-7 rounded flex items-center justify-center shrink-0" style={{ backgroundColor: "#0d0446", opacity: 0.1 }}>
                  <Music size={12} style={{ color: "#0d0446" }} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold truncate" style={{ color: "#0d0446" }}>{song.titulo}</p>
                <p className="text-[9px] truncate" style={{ color: "#0d0446", opacity: 0.5 }}>{song.artista}</p>
              </div>
              <div className="flex items-center gap-0.5 shrink-0">
                <Heart size={8} fill="#268ffa" style={{ color: "#268ffa" }} />
                <span className="text-[9px] font-bold" style={{ color: "#0d0446" }}>{song.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
