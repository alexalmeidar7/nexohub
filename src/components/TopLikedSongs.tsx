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
    <div className="rounded-2xl p-5 shadow-lg" style={{ backgroundColor: "#fff" }}>
      <div className="flex items-center gap-2 mb-4">
        <Heart size={18} className="text-red-500" fill="#ef4444" />
        <h3 className="font-bold text-gray-800 text-sm">Top 10 Músicas Curtidas</h3>
      </div>

      {loading ? (
        <p className="text-gray-400 text-xs">Carregando...</p>
      ) : songs.length === 0 ? (
        <p className="text-gray-400 text-xs">Nenhuma música curtida ainda. Curta músicas no Player!</p>
      ) : (
        <div className="space-y-2">
          {songs.map((song, i) => (
            <div
              key={`${song.artista}-${song.titulo}`}
              className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <span
                className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold text-white shrink-0"
                style={{ backgroundColor: i < 3 ? "#ed0808" : "#999" }}
              >
                {i + 1}
              </span>
              {song.capa ? (
                <img
                  src={song.capa}
                  alt={song.titulo}
                  className="w-8 h-8 rounded object-cover shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center shrink-0">
                  <Music size={14} className="text-gray-400" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{song.titulo}</p>
                <p className="text-[10px] text-gray-500 truncate">{song.artista}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Heart size={10} className="text-red-400" fill="#f87171" />
                <span className="text-[10px] text-gray-500 font-bold">{song.count}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
