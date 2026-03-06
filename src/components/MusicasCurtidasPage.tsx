import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Heart, Music, Trash2 } from "lucide-react";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { toast } from "@/hooks/use-toast";

interface RankedSong {
  titulo: string;
  artista: string;
  capa: string;
  count: number;
  ids: string[]; // all row IDs for this song
}

export default function MusicasCurtidasPage() {
  const { user } = useAuth();
  const [songs, setSongs] = useState<RankedSong[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAndCleanup = useCallback(async () => {
    if (!user) return;

    const { data } = await supabase
      .from("music_likes")
      .select("id, titulo, artista, capa")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    if (!data) {
      setLoading(false);
      return;
    }

    // Aggregate by titulo+artista
    const map = new Map<string, RankedSong>();
    for (const row of data) {
      const key = `${row.artista}||${row.titulo}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        existing.ids.push(row.id);
      } else {
        map.set(key, {
          titulo: row.titulo,
          artista: row.artista,
          capa: row.capa || "",
          count: 1,
          ids: [row.id],
        });
      }
    }

    // Sort by count desc
    const sorted = Array.from(map.values()).sort((a, b) => b.count - a.count);

    // Keep top 100, delete the rest
    const top100 = sorted.slice(0, 100);
    const toDelete = sorted.slice(100);

    if (toDelete.length > 0) {
      const idsToDelete = toDelete.flatMap((s) => s.ids);
      await supabase.from("music_likes").delete().in("id", idsToDelete);
      toast({
        title: "Limpeza automática",
        description: `${toDelete.length} música(s) além da posição 100 foram removidas.`,
      });
    }

    setSongs(top100);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchAndCleanup();
  }, [fetchAndCleanup]);

  const handleDelete = async (song: RankedSong) => {
    await supabase.from("music_likes").delete().in("id", song.ids);
    setSongs((prev) => prev.filter((s) => !(s.artista === song.artista && s.titulo === song.titulo)));
    toast({ title: "Removida", description: `"${song.titulo}" foi removida das curtidas.` });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-primary" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Suas {songs.length} músicas mais curtidas, da mais curtida para a menos curtida.
        Músicas além da posição 100 são removidas automaticamente.
      </p>

      {songs.length === 0 ? (
        <p className="text-muted-foreground text-sm py-10 text-center">
          Nenhuma música curtida ainda. Curta músicas no Player!
        </p>
      ) : (
        <div className="space-y-1">
          {songs.map((song, i) => (
            <div
              key={`${song.artista}-${song.titulo}`}
              className="flex items-center gap-4 py-3 px-4 rounded-xl hover:bg-muted/50 transition-colors group"
            >
              {/* Rank */}
              <span
                className="w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
                style={{ backgroundColor: i < 3 ? "#ed0808" : i < 10 ? "#555" : "#999" }}
              >
                {i + 1}
              </span>

              {/* Cover */}
              {song.capa ? (
                <img
                  src={song.capa}
                  alt={song.titulo}
                  className="w-12 h-12 rounded-lg object-cover shrink-0"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <Music size={20} className="text-muted-foreground" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold truncate">{song.titulo}</p>
                <p className="text-xs text-muted-foreground truncate">{song.artista}</p>
              </div>

              {/* Like count */}
              <div className="flex items-center gap-1 shrink-0">
                <Heart size={14} className="text-red-500" fill="#ef4444" />
                <span className="text-sm font-bold text-muted-foreground">{song.count}</span>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(song)}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-full hover:bg-destructive/10"
                title="Remover das curtidas"
              >
                <Trash2 size={16} className="text-destructive" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

