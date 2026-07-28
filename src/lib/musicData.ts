import { normalizeMusicText } from "@/lib/textEncoding";
import { musicDataKey, musicStartKey } from "@/lib/musicStorageKeys";

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
}

/**
 * Read music data for a specific user. Always pass the authenticated user's id
 * — never read from a global key, otherwise data from another tenant logged in
 * on the same browser would leak in.
 */
export function getMusicData(userId: string | null | undefined): { music: MusicData; elapsed: number; finished: boolean } | null {
  try {
    const dataKey = musicDataKey(userId);
    const startKey = musicStartKey(userId);
    if (!dataKey || !startKey) return null;
    const raw = localStorage.getItem(dataKey);
    const startStr = localStorage.getItem(startKey);
    if (!raw || !startStr) return null;

    const parsedMusic: MusicData = JSON.parse(raw);
    const music: MusicData = {
      ...parsedMusic,
      titulo: normalizeMusicText(parsedMusic.titulo || "") || "Sem título",
      artista: normalizeMusicText(parsedMusic.artista || "") || "Desconhecido",
    };

    if (music.titulo !== parsedMusic.titulo || music.artista !== parsedMusic.artista) {
      localStorage.setItem(dataKey, JSON.stringify({ ...parsedMusic, ...music }));
    }

    const elapsed = (Date.now() - parseInt(startStr, 10)) / 1000;
    const finished = elapsed >= music.duracao;

    return { music, elapsed: Math.min(elapsed, music.duracao), finished };
  } catch {
    return null;
  }
}
