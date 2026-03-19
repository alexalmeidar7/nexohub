import { normalizeMusicText } from "@/lib/textEncoding";

const MUSIC_DATA_KEY = "masterview_music_data";
const MUSIC_START_KEY = "masterview_music_start";

interface MusicData {
  titulo: string;
  artista: string;
  duracao: number;
  capa: string;
}

export function getMusicData(): { music: MusicData; elapsed: number; finished: boolean } | null {
  try {
    const raw = localStorage.getItem(MUSIC_DATA_KEY);
    const startStr = localStorage.getItem(MUSIC_START_KEY);
    if (!raw || !startStr) return null;

    const parsedMusic: MusicData = JSON.parse(raw);
    const music: MusicData = {
      ...parsedMusic,
      titulo: normalizeMusicText(parsedMusic.titulo || "") || "Sem título",
      artista: normalizeMusicText(parsedMusic.artista || "") || "Desconhecido",
    };

    if (music.titulo !== parsedMusic.titulo || music.artista !== parsedMusic.artista) {
      localStorage.setItem(MUSIC_DATA_KEY, JSON.stringify({ ...parsedMusic, ...music }));
    }

    const elapsed = (Date.now() - parseInt(startStr, 10)) / 1000;
    const finished = elapsed >= music.duracao;

    return { music, elapsed: Math.min(elapsed, music.duracao), finished };
  } catch {
    return null;
  }
}
