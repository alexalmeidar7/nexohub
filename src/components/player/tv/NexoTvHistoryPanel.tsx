import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Music2 } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { getArtistImageSync } from "@/lib/artistImageCache";

type HistoryTrack = {musica:string;artista:string;horario:string};
type Props={owner?:string|null;loadCover?:(artist:string,title:string)=>Promise<string|undefined>};
const LIMIT=50;
const keyOf=(t:HistoryTrack)=>JSON.stringify([t.musica,t.artista]);

export default function NexoTvHistoryPanel({owner,loadCover}:Props) {
  const [tracks,setTracks]=useState<HistoryTrack[]>([]);
  const [index,setIndex]=useState(0);
  const [status,setStatus]=useState("Carregando músicas tocadas…");
  const [covers,setCovers]=useState<Record<string,string>>({});
  const nextButton=useRef<HTMLButtonElement>(null);
  const current=tracks[index];
  useEffect(()=>{
    let cancelled=false;
    setTracks([]);setIndex(0);setCovers({});
    setStatus(owner ? "Carregando músicas tocadas…" : "Histórico indisponível para esta emissora.");
    if(!owner)return;
    const load=async()=>{
      const qs=new URLSearchParams({user_id:owner,limit:String(LIMIT)});
      const {data,error}=await playerSupabase.functions.invoke<{ok:boolean;items:HistoryTrack[]}>(
        `public-music-history?${qs}`,{method:"GET"},
      );
      if(cancelled)return;
      if(!error && data?.ok && Array.isArray(data.items)){
        setTracks(data.items.slice(0,LIMIT));
        setStatus(data.items.length?"":"Nenhuma música registrada.");
        return;
      }
      const {data:{session}}=await playerSupabase.auth.getSession();
      if(cancelled)return;
      if(session?.user.id!==owner){setStatus("Não foi possível carregar as músicas tocadas.");return;}
      const {data:history}=await playerSupabase.from("musicas_tocadas")
        .select("musica, artista, horario").eq("user_id",owner)
        .order("created_at",{ascending:false}).limit(LIMIT);
      if(cancelled)return;
      if(history?.length){setTracks(history);setStatus("");return;}
      const {data:backup}=await playerSupabase.from("xml_upload_history")
        .select("musica, artista, created_at").eq("user_id",owner)
        .not("musica","is",null).not("artista","is",null)
        .order("created_at",{ascending:false}).limit(LIMIT);
      if(cancelled)return;
      const converted=(backup||[]).flatMap(({musica,artista,created_at})=>musica&&artista ? [{
        musica,artista,horario:new Date(created_at).toLocaleTimeString("pt-BR",{
          timeZone:"America/Sao_Paulo",hour:"2-digit",minute:"2-digit",
        }),
      }] : []);
      setTracks(converted);
      setStatus(converted.length ? "" : "Nenhuma música registrada.");
    };
    void load().catch(()=>{if(!cancelled)setStatus("Não foi possível carregar as músicas tocadas.");});
    return ()=>{cancelled=true;};
  },[owner]);

  useEffect(()=>{
    if(!current || !loadCover)return;
    const key=keyOf(current);
    if(covers[key])return;
    let cancelled=false;
    void loadCover(current.artista,current.musica).then(cover=>{
      if(!cancelled&&cover)setCovers(previous=>({...previous,[key]:cover}));
    }).catch(()=>{});
    return ()=>{cancelled=true;};
  },[current?.musica,current?.artista,loadCover]);

  useEffect(()=>{
    if(tracks.length>1)nextButton.current?.focus({preventScroll:true});
  },[tracks.length]);

  const move=(delta:number)=>setIndex(old=>Math.max(0,Math.min(tracks.length-1,old+delta)));
  const onKeys=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    if(event.key==="ArrowUp"||event.key==="ArrowDown"){
      event.preventDefault();event.stopPropagation();
      move(event.key==="ArrowUp"?-1:1);
    }
  };
  return <div className="nexo-tv-history" onKeyDown={onKeys} aria-label="Músicas tocadas">
    <h3>músicas tocadas</h3>
    {!current ? <div className="nexo-tv-history-empty" role="status">
      <Music2 aria-hidden="true"/>
      <p>{status}</p>
    </div> : <>
      <div className="nexo-tv-history-meta" aria-live="polite">
        <time>{current.horario?.slice(0,5)||"--:--"}</time>
        <strong title={current.musica}>{current.musica}</strong>
        <span title={current.artista}>{current.artista}</span>
      </div>
      <div className="nexo-tv-history-player">
        <button type="button" className="nexo-tv-history-up" disabled={index===0}
          aria-label="Música mais recente" onClick={()=>move(-1)}><ChevronUp aria-hidden="true"/></button>
        <div className="nexo-tv-history-cover">
          {(() => {
            const image=covers[keyOf(current)]||getArtistImageSync(current.artista);
            return image ? <img src={image} alt={`Capa de ${current.musica}`}/> : <Music2 aria-hidden="true"/>;
          })()}
        </div>
        <button ref={nextButton} type="button" className="nexo-tv-history-down"
          disabled={index>=tracks.length-1} aria-label="Música anterior" onClick={()=>move(1)}>
          <ChevronDown aria-hidden="true"/>
        </button>
      </div>
      <span className="nexo-tv-history-count">{index+1} de {tracks.length}</span>
    </>}
  </div>;
}
