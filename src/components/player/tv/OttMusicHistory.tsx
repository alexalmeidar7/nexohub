import { OttSkeletonContent } from "./OttSkeleton";
import NexoLoadingImage from "./NexoLoadingImage";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { getArtistImageSync } from "@/lib/artistImageCache";
import OttArtwork from "./OttArtwork";
import "./OttMusicHistory.css";

const HISTORY_LIMIT = 50;
const PAGE_SIZE = 11;

interface Track {
  musica: string;
  artista: string;
  horario: string;
}

interface Props {
  owner?: string | null;
  loadCover?: (artist: string, title: string) => Promise<string | undefined>;
}

const trackKey = ({ artista, musica }: Track) => JSON.stringify([artista, musica]);

export default function OttMusicHistory({ owner, loadCover }: Props) {
  const [page, setPage] = useState(0);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [status, setStatus] = useState("Carregando histórico…");
  const [covers, setCovers] = useState<Record<string, string>>({});
  const coverLoader = useRef(loadCover);
  coverLoader.current = loadCover;
  const pendingCovers = useRef(new Map<string, Promise<string | undefined>>());
  const previousButton = useRef<HTMLButtonElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const paged = useRef(false);
  const pageCount = Math.ceil(tracks.length / PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    setPage(0);
    setTracks([]);
    setStatus(owner ? "Carregando histórico…" : "Histórico indisponível para esta emissora.");
    if (!owner) return;

    const load = async () => {
      const query = new URLSearchParams({ user_id: owner, limit: String(HISTORY_LIMIT) });
      const { data: history, error } = await playerSupabase.functions.invoke<{ ok: boolean; items: Track[] }>(
        `public-music-history?${query}`, { method: "GET" }
      );
      if (cancelled) return;
      if (!error && history?.ok && Array.isArray(history.items)) {
        setTracks(history.items.slice(0, HISTORY_LIMIT));
        setStatus(history.items.length ? "" : "Nenhuma música registrada.");
        return;
      }

      // A signed-in station owner can read their own records under the existing RLS.
      const { data: { session } } = await playerSupabase.auth.getSession();
      if (cancelled) return;
      if (session?.user.id !== owner) {
        setStatus("Não foi possível carregar as músicas tocadas.");
        return;
      }
      const { data } = await playerSupabase.from("musicas_tocadas").select("musica, artista, horario")
        .eq("user_id", owner).order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
      if (cancelled) return;
      if (data?.length) {
        setTracks(data);
        setStatus("");
        return;
      }
      const { data: xmlHistory, error: xmlError } = await playerSupabase.from("xml_upload_history")
        .select("musica, artista, created_at").eq("user_id", owner)
        .not("musica", "is", null).not("artista", "is", null)
        .order("created_at", { ascending: false }).limit(HISTORY_LIMIT);
      if (cancelled) return;
      setTracks((xmlHistory || []).flatMap(({ musica, artista, created_at }) => musica && artista
        ? [{ musica, artista, horario: new Date(created_at).toLocaleTimeString("pt-BR", {
          timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit",
        }) }]
        : []));
      setStatus(xmlError ? "Não foi possível carregar as músicas tocadas." : "Nenhuma música registrada.");
    };
    void load().catch(() => { if (!cancelled) setStatus("Não foi possível carregar as músicas tocadas."); });
    return () => { cancelled = true; };
  }, [owner]);

  useEffect(() => {
    const getCover = coverLoader.current;
    if (!getCover) return;
    let cancelled = false;
    const queue = tracks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
    const worker = async () => {
      while (!cancelled && queue.length) {
        const track = queue.shift()!;
        const key = trackKey(track);
        const requests = pendingCovers.current;
        let request = requests.get(key);
        if (!request) {
          request = getCover(track.artista, track.musica).catch(() => undefined);
          requests.set(key, request);
        }
        const cover = await request;
        if (cover && !cancelled) setCovers(current => current[key] === cover ? current : { ...current, [key]: cover });
      }
    };
    void Promise.all([worker(), worker(), worker()]);
    return () => { cancelled = true; };
  }, [tracks, page]);

  useLayoutEffect(() => {
    if (!paged.current) return;
    paged.current = false;
    if (page === 0) nextButton.current?.focus();
    if (page === pageCount - 1) previousButton.current?.focus();
  }, [page, pageCount]);

  const changePage = (direction: -1 | 1) => {
    const next = page + direction;
    if (next < 0 || next >= pageCount) return;
    paged.current = true;
    setPage(next);
  };

  if (!tracks.length && status.startsWith("Carregando")) return <OttSkeletonContent variant="history"/>;
  if (!tracks.length) return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] p-8 text-center">
      <div className="text-4xl mb-4">🎵</div>
      <p className="text-xl font-medium text-gray-300 mb-2">{status}</p>
      <p className="text-sm text-gray-400">Aguarde novas músicas serem executadas</p>
    </div>
  );

  const currentTracks = tracks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="ott-music-history-container">
      {/* Cabeçalho com título e navegação */}
      <div className="ott-history-header">
        <h2 className="ott-history-title">Músicas tocadas</h2>
        {pageCount > 1 && (
          <div className="ott-history-navigation">
            <button
              ref={previousButton}
              type="button"
              aria-label="Página anterior"
              disabled={page === 0}
              onClick={() => changePage(-1)}
              className="ott-nav-button"
            >
              <ChevronLeft size={20}/>
            </button>
            <span className="ott-page-indicator" aria-live="polite">
              {page + 1} de {pageCount}
            </span>
            <button
              ref={nextButton}
              type="button"
              aria-label="Próxima página"
              disabled={page + 1 === pageCount}
              onClick={() => changePage(1)}
              className="ott-nav-button"
            >
              <ChevronRight size={20}/>
            </button>
          </div>
        )}
      </div>

      {/* Lista de músicas */}
      <div className="ott-history-tracks-grid">
        {currentTracks.map((track, index) => {
          const cover = covers[trackKey(track)] || getArtistImageSync(track.artista);
          const time = track.horario?.slice(0, 5) || '--:--';

          return (
            <article
              key={`${page}-${index}-${track.musica}`}
              className="ott-history-track-card"
              data-tv-focusable
            >
              {/* Área da capa */}
              <div className="ott-track-cover-container">
                {cover ? (
                  <NexoLoadingImage
                    src={cover}
                    alt={`Capa de ${track.musica}`}
                    className="ott-track-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="ott-track-cover-placeholder">
                    <div className="ott-track-cover-icon">🎵</div>
                  </div>
                )}
                <div className="ott-track-overlay"></div>
              </div>

              {/* Informações da música */}
              <div className="ott-track-info">
                <div className="ott-track-title-container">
                  <strong
                    className="ott-track-title"
                    title={track.musica}
                  >
                    {track.musica}
                  </strong>
                </div>
                <div className="ott-track-artist-container">
                  <span
                    className="ott-track-artist"
                    title={track.artista}
                  >
                    {track.artista}
                  </span>
                </div>
                <div className="ott-track-time-container">
                  <time
                    className="ott-track-time"
                    dateTime={track.horario}
                  >
                    {time}
                  </time>
                </div>
              </div>

              {/* Indicador de posição */}
              <div className="ott-track-position">
                {page * PAGE_SIZE + index + 1}
              </div>
            </article>
          );
        })}
      </div>

      {/* Status de carregamento */}
      {status && status !== "Carregando histórico…" && (
        <div className="ott-history-status">
          <p role="status">{status}</p>
        </div>
      )}
    </div>
  );
}
