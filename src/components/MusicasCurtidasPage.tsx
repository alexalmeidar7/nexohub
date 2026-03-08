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
  ids: string[];
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

    const sorted = Array.from(map.values()).sort((a, b) => b.count - a.count);

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
    return <ModulePageSkeleton />;
  }

  return (
    <div className="space-y-4 animate-fade-in">
      <p className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>
        Suas {songs.length} músicas mais curtidas, da mais curtida para a menos curtida.
        Músicas além da posição 100 são removidas automaticamente.
      </p>

      {songs.length === 0 ? (
        <p className="text-sm py-10 text-center" style={{ color: "rgba(13,4,70,0.5)" }}>
          Nenhuma música curtida ainda. Curta músicas no Player!
        </p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(13,4,70,0.1)" }}>
          <table className="w-full text-sm" style={{ color: "#0d0446" }}>
            <thead>
              <tr style={{ backgroundColor: "#0d0446", color: "#ffffff" }}>
                <th className="px-4 py-2 text-center font-semibold w-12">#</th>
                <th className="px-4 py-2 text-center font-semibold w-14">Capa</th>
                <th className="px-4 py-2 text-left font-semibold">Música</th>
                <th className="px-4 py-2 text-left font-semibold">Artista</th>
                <th className="px-4 py-2 text-center font-semibold">Curtidas</th>
                <th className="px-4 py-2 text-center font-semibold">Excluir</th>
              </tr>
            </thead>
            <tbody>
              {songs.map((song, i) => (
                <tr key={`${song.artista}-${song.titulo}`}
                  style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f8fc", borderTop: "1px solid rgba(13,4,70,0.08)" }}
                >
                  <td className="px-4 py-2 text-center">
                    <span
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: i < 3 ? "#ed0808" : i < 10 ? "#0d0446" : "rgba(13,4,70,0.3)" }}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    {song.capa ? (
                      <img src={song.capa} alt={song.titulo} className="w-10 h-10 rounded-lg object-cover mx-auto" style={{ border: "1px solid rgba(13,4,70,0.08)" }} />
                    ) : (
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                        <Music size={16} style={{ color: "rgba(13,4,70,0.3)" }} />
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium truncate max-w-[200px]">{song.titulo}</td>
                  <td className="px-4 py-2 truncate max-w-[150px]" style={{ color: "rgba(13,4,70,0.6)" }}>{song.artista}</td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-flex items-center gap-1">
                      <Heart size={12} className="text-red-500" fill="#ef4444" />
                      <span className="font-bold text-xs">{song.count}</span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <button onClick={() => handleDelete(song)} title="Remover das curtidas" className="hover:opacity-70 transition-opacity">
                      <Trash2 size={14} style={{ color: "#dc2626" }} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
