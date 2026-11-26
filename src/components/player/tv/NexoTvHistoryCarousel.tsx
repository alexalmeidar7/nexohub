import NexoHistoryCover from "./NexoHistoryCover";
// NEXO_V7_15_AUDIO_HISTORICO_FLUIDEZ
import OttCommercialSlot, {useCommercialMedia} from "./OttCommercialSlot";
import { OttSkeletonContent } from "./OttSkeleton";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Music2, Heart } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import "./NexoTvHistoryCarousel.css";
import {emitProfileChanged} from "@/lib/profileSync";

type Track = {
  musica: string;
  artista: string;
  horario: string;
  dia?: string | null;
  capa_url?: string | null;
};
type Props = {
  owner?: string | null;
  loadCover?: (artist: string, title: string) => Promise<string | undefined>;
};

const HISTORY_LIMIT = 50;
const nexoHistoryCache = new Map<string, Track[]>();
const trackKey = (t: Track) => `${t.artista.trim().toLowerCase()}::${t.musica.trim().toLowerCase()}`;
function isTrack(value: unknown): value is Track {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Track>;
  return typeof candidate.musica === "string" && candidate.musica.trim().length > 0 &&
    typeof candidate.artista === "string" && candidate.artista.trim().length > 0;
}
function normalize(items: unknown): Track[] {
  return Array.isArray(items) ? items.filter(isTrack).slice(0, HISTORY_LIMIT).map(track => ({
    musica: track.musica.trim(),
    artista: track.artista.trim(),
    horario: String(track.horario || "").slice(0, 8),
    dia: track.dia || null,
    capa_url: [track.capa_url, (track as Track & { capa?: string; cover_url?: string }).capa, (track as Track & { cover_url?: string }).cover_url].find(value => typeof value === "string" && value.trim()) || null,
  })) : [];
}

// Lê o MESMO historico da pagina Info Music/Musica no Ar: public.musicas_tocadas.
// Primeiro usa o endpoint publico existente, proprio para usuarios do Player que nao sao donos da radio.
async function publicHistory(owner: string): Promise<Track[]> {
  const config = import.meta.env;
  const server = String(config.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const apiKey = String(config.VITE_SUPABASE_PUBLISHABLE_KEY || config.VITE_SUPABASE_ANON_KEY || "");
  const query = new URLSearchParams({ user_id: owner, limit: String(HISTORY_LIMIT) });
  if (server && apiKey) {
    try {
      const response = await fetch(`${server}/functions/v1/public-music-history?${query}`, {
        method: "GET",
        headers: { apikey: apiKey },
        cache: "no-store",
      });
      if (response.ok) {
        const data: { ok?: boolean; items?: unknown } = await response.json();
        if (data.ok && Array.isArray(data.items)) return normalize(data.items);
      }
    } catch (error) {
      console.warn("[NexoHistory] Consulta pública via HTTP indisponível", error);
    }
  }
  // Alternativa compatível com o SDK; não usa credenciais administrativas no navegador.
  const { data, error } = await playerSupabase.functions.invoke<{ ok?: boolean; items?: unknown }>(
    `public-music-history?${query}`, { method: "GET" },
  );
  if (error || !data?.ok || !Array.isArray(data.items)) throw error || new Error("Consulta pública indisponível");
  return normalize(data.items);
}

async function fallbackHistory(owner: string): Promise<Track[]> {
  // RLS continua valendo. Esta alternativa é útil ao dono da rádio logado,
  // mas não dá a um visitante acesso à tabela privada.
  const { data, error } = await playerSupabase.from("musicas_tocadas")
    .select("musica, artista, horario, dia")
    .eq("user_id", owner)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (error) throw error;
  return normalize(data);
}

export default function NexoTvHistoryCarousel({ owner, loadCover }: Props) {
  const [tracks, setTracks] = useState<Track[]>(() => owner ? nexoHistoryCache.get(owner) || [] : []);
  const [index, setIndex] = useState(0);
  const [nexoHistoryLeaving, setNexoHistoryLeaving] = useState(false);
  const nexoHistoryTimer = useRef<number | null>(null);
  const [status, setStatus] = useState("Carregando músicas tocadas...");
  const [covers, setCovers] = useState<Record<string, string>>({});
  const downRef = useRef<HTMLButtonElement>(null);
  const current = tracks[index];
  const ad=useCommercialMedia(owner,"history_ads");
  const [adStep,setAdStep]=useState(false);
  useEffect(()=>{setAdStep(false)},[owner,ad?.url]);
  const [liked,setLiked]=useState(false),[saving,setSaving]=useState(false),[likeMessage,setLikeMessage]=useState("");
  const likeRef=useRef(0);
  const currentKey=current?trackKey(current):"";
  useEffect(()=>{let alive=true;const seq=++likeRef.current;setLiked(false);setSaving(false);setLikeMessage("");if(current&&owner)void (async()=>{const {data:{user}}=await playerSupabase.auth.getUser();if(!user)return;const {data}=await playerSupabase.from("music_likes").select("id").eq("user_id",user.id).eq("radio_user_id",owner).eq("titulo",current.musica).eq("artista",current.artista).limit(1);if(alive&&seq===likeRef.current)setLiked(!!data?.length);})();return()=>{alive=false;};},[owner,currentKey]);
  const toggleHistoryLike=async()=>{if(!owner||!current||saving)return;const seq=likeRef.current;setSaving(true);setLikeMessage("");try{const {data:{user}}=await playerSupabase.auth.getUser();if(!user)throw new Error("Conecte sua conta Google para curtir.");const query=()=>playerSupabase.from("music_likes").select("id").eq("user_id",user.id).eq("radio_user_id",owner).eq("titulo",current.musica).eq("artista",current.artista);const {data,error}=await query();if(error)throw error;if(data?.length){const {error}=await playerSupabase.from("music_likes").delete().eq("user_id",user.id).eq("radio_user_id",owner).eq("titulo",current.musica).eq("artista",current.artista);if(error)throw error;}else{const {error}=await playerSupabase.from("music_likes").insert({user_id:user.id,radio_user_id:owner,titulo:current.musica,musica:current.musica,artista:current.artista,capa:covers[currentKey]||current.capa_url||null});if(error)throw error;}if(seq===likeRef.current)setLiked(!data?.length);emitProfileChanged({userId:user.id,radioUserId:owner});}catch(e){if(seq===likeRef.current)setLikeMessage(e instanceof Error?e.message:"Não foi possível salvar a curtida.");}finally{if(seq===likeRef.current)setSaving(false);}};


  useEffect(() => {
    let cancelled = false;
    setIndex(0); setTracks(owner ? nexoHistoryCache.get(owner) || [] : []); setCovers({});
    setStatus(owner ? "Carregando músicas tocadas..." : "Emissora não identificada.");
    if (!owner) return;
    async function load() {
      try {
        let result: Track[];
        try { result = await publicHistory(owner!); }
        catch (publicError) { result = await fallbackHistory(owner!); if (!result.length) throw publicError; }
        if (cancelled) return;
        nexoHistoryCache.set(owner!, result);
        setTracks(result);
        // O histórico pode ficar menor após uma atualização: manter a seleção válida.
        setIndex(previous => Math.min(previous, Math.max(0, result.length - 1)));
        setStatus(result.length ? "" : "Ainda não há músicas registradas.");
      } catch (error) {
        console.warn("[NexoHistory] Falha ao carregar public.musicas_tocadas", error);
        if (!cancelled) setStatus("Não foi possível carregar o histórico da rádio.");
      }
    }
    void load();
    // Mesma fonte de dados do painel Info Music; atualiza enquanto o ouvinte está no Player.
    const interval = window.setInterval(() => void load(), 30000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [owner]);



  useEffect(() => {
    // NEXO_V7_1_HISTORY_FOCUS: mesmo com uma faixa a seta inferior recebe foco.
    if (tracks.length) downRef.current?.focus({ preventScroll: true });
  }, [tracks.length > 0]);

  useEffect(() => () => { if (nexoHistoryTimer.current !== null) window.clearTimeout(nexoHistoryTimer.current); }, []);
  const move = (delta: number) => {
    if (nexoHistoryTimer.current !== null || !tracks.length) return;
    if(adStep){setAdStep(false);if(delta<0)return;}else if(delta>0&&ad&&(index+1)%5===0&&index<tracks.length-1){setAdStep(true);return;}
    const target = Math.max(0, Math.min(tracks.length - 1, index + delta));
    if (target === index) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setIndex(target); return; }
    setNexoHistoryLeaving(true);
    nexoHistoryTimer.current = window.setTimeout(() => {
      setIndex(target);
      setNexoHistoryLeaving(false);
      nexoHistoryTimer.current = null;
    }, 150);
  };
  return <div className="nexo-history-carousel" aria-label="Músicas tocadas">
    {!current ? <div className="nexo-history-empty" role="status">
      {status.startsWith("Carregando") ? <OttSkeletonContent variant="history" /> : <><Music2 aria-hidden="true" strokeWidth={1.5}/><p>{status}</p></>}
    </div> : <>
      <div className="nexo-history-selected" data-history-transition={nexoHistoryLeaving ? "out" : "in"} aria-live="polite">
        <div key={`${index}-${trackKey(current)}-${adStep}`} className="nexo-history-info">
          <time className={adStep?"nexo-lote8-history-ad":undefined}>{adStep?"publicidade":current.horario?.slice(0, 5) || "--:--"}</time>
          <strong>{adStep?"":current.musica}</strong>
          <span>{adStep?"":current.artista}</span>
        </div>
        <button type="button" className="nexo-history-up" aria-label="Música mais recente" aria-disabled={index === 0} onClick={() => move(-1)}><ChevronUp aria-hidden="true"/></button>
        <div className="nexo-history-media-space">{adStep&&ad?<div className="nexo-history-cover"><OttCommercialSlot radioId={owner} placement="history_ads"/></div>:<button type="button" className="nexo-history-cover nexo-history-like" aria-label={liked?"Remover curtida":"Curtir música"} aria-pressed={liked} disabled={saving} onClick={()=>void toggleHistoryLike()}>
          <NexoHistoryCover key={`${owner||""}:${currentKey}`} artist={current.artista} title={current.musica} stored={current.capa_url} loadCover={loadCover} onResolved={url=>setCovers(previous=>previous[currentKey]===url?previous:{...previous,[currentKey]:url})}/>
          <Heart className="nexo-history-heart" fill={liked?"currentColor":"none"} aria-hidden="true"/>
        </button>}
        {!adStep&&likeMessage&&<small className="nexo-history-feedback" role="status">{likeMessage}</small>}</div>
      </div>
      <div className="nexo-history-controls" role="group" aria-label="Navegar pelas músicas">
        
        <span className="nexo-history-count">{index + 1}/{tracks.length}</span>
        <button type="button" ref={downRef} aria-label="Música anterior" data-ott-initial aria-disabled={index >= tracks.length - 1} onClick={() => move(1)}>
          <ChevronDown aria-hidden="true" />
        </button>
      </div>
    </>}
  </div>;
}
