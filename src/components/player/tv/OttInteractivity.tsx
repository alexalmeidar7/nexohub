import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, RotateCcw } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { getActiveEnquete, getBrasiliaDateTime } from "@/lib/scheduledItemUtils";
import PlayerClockWeather from "../PlayerClockWeather";

import OttWeatherForecast from "./OttWeatherForecast";
type Interaction = "lyrics" | "weather" | "poll";
interface ScheduledPoll {
 id: string;
 pergunta: string;
 data_enquete: string;
 horario_inicio: string;
 horario_fim: string;
 resposta1?: string | null;
 resposta2?: string | null;
 resposta3?: string | null;
 resposta4?: string | null;
}

export default function OttInteractivity({ page, owner, title, artist, canVote = true }: { page: Interaction; owner?:string|null; title:string; artist?:string; canVote?: boolean; }) {
 const [text,setText]=useState(""),[loading,setLoading]=useState(false);
 const [sending,setSending]=useState(false);
 const [poll,setPoll]=useState<{id:string;pergunta:string;respostas:string[]}|null>(null);
 const [savedAnswer, setSavedAnswer] = useState<number | null>(null);
 const [editingVote, setEditingVote] = useState(false);
 const votePending = useRef(false);
 const answersRef = useRef<HTMLDivElement>(null);
 const changeVoteRef = useRef<HTMLButtonElement>(null);
 const nextVoteFocus = useRef<"change" | "answer" | null>(null);
 useLayoutEffect(() => {
  if (nextVoteFocus.current === "change" && !editingVote) {
   changeVoteRef.current?.focus({ preventScroll: true });
   nextVoteFocus.current = null;
  } else if (nextVoteFocus.current === "answer" && editingVote) {
   answersRef.current?.querySelectorAll("button")[savedAnswer ?? 0]?.focus({ preventScroll: true });
   nextVoteFocus.current = null;
  }
 }, [savedAnswer, editingVote, sending]);
 const lyricsTitle = page === "lyrics" ? title : undefined;
 const lyricsArtist = page === "lyrics" ? artist : undefined;
 useEffect(()=>{
  let cancelled=false;
  setText("");setLoading(true);setPoll(null);setSavedAnswer(null);setEditingVote(false);
  const load=async()=>{try{
   if(page==="lyrics"){
    const {data,error}=await playerSupabase.functions.invoke("fetch-lyrics",{body:{title:lyricsTitle,artist:lyricsArtist}});
    if(!cancelled)setText(!error&&(data?.plainLyrics||data?.syncedLyrics)?String(data.plainLyrics||data.syncedLyrics).replace(/\[\d{2}:\d{2}[.:]\d{2,3}\]/g,""):"Letra indisponível para esta música.");
   }else if(page==="poll"&&owner){
    const { today, currentTime } = getBrasiliaDateTime();
    const params = new URLSearchParams({ uid: owner, date: today, time: currentTime });
    const { data, error } = await playerSupabase.functions.invoke<{ enquetes: ScheduledPoll[] }>(
     `public-cenario-data?${params}`, { method: "GET" }
    );
    if (error || !Array.isArray(data?.enquetes)) throw new Error("Não foi possível carregar a enquete.");
    if (cancelled) return;
    const active = getActiveEnquete(data.enquetes, today, currentTime);
    if (active) {
     const respostas = [active.resposta1, active.resposta2, active.resposta3, active.resposta4]
      .filter((answer): answer is string => typeof answer === "string" && answer.trim().length > 0);
     setPoll({ id: active.id, pergunta: active.pergunta, respostas });
     if (canVote) {
      const { data: vote } = await playerSupabase.rpc("get_player_poll_vote", { p_poll_id: active.id });
      if (!cancelled && typeof vote === "number" && vote >= 0 && vote < respostas.length) setSavedAnswer(vote);
     }
    } else {
     setText("Nenhuma enquete no ar neste momento.");
    }
   }else if(page==="poll"){if(!cancelled)setText("Nenhuma enquete disponível para este canal.");
   }
  }catch{if(!cancelled)setText("Não foi possível carregar. Volte e tente novamente.");}finally{if(!cancelled)setLoading(false);}};
  if(page!=="weather")void load();else setLoading(false);
  return()=>{cancelled=true;};
 },[page,owner,lyricsTitle,lyricsArtist,canVote]);
 const vote=async(index:number)=>{
  if (!poll || votePending.current || (savedAnswer !== null && !editingVote)) return;
  if (!canVote) { setText("Entre na sua conta para votar."); return; }
  votePending.current = true;
  setSending(true);setText("");
  try{
   const {data,error}=await playerSupabase.rpc("submit_player_poll_vote",{p_poll_id:poll.id,p_answer_index:index});
   if(error)throw error;
   const result=data as {ok?:boolean;answer_index?:number;answer?:string};
   if(!result?.ok)throw new Error("vote_failed");
   const recordedIndex = result.answer_index ?? poll.respostas.indexOf(result.answer ?? "");
   if (recordedIndex !== index) throw new Error("vote_not_changed");
   nextVoteFocus.current = "change";
   setSavedAnswer(recordedIndex);
   setEditingVote(false);
   setText("Voto registrado.");
  }catch(error){
   const message=error instanceof Error?error.message:String((error as {message?:string})?.message||"");
   setText(/login_required|permission denied/i.test(message)?"Entre na sua conta para votar.":/poll_closed/i.test(message)?"Esta enquete já foi encerrada.":"Não foi possível registrar o voto no servidor. Tente novamente mais tarde.");
  }finally{votePending.current = false;setSending(false);}
 };
 if(page==="weather")return <OttWeatherForecast radioUserId={owner}/>;
 return <div className="ott-interaction-content">{loading?<p role="status">Carregando…</p>:<>
  {page==="lyrics"&&<><h3>{title}</h3><p>{artist}</p><div tabIndex={0} data-ott-initial data-ott-scroll className="ott-lyrics-text">{text}</div></>}
  {page==="poll"&&(poll ? <div className="ott-poll">
   <h3>{poll.pergunta}</h3>
   <div ref={answersRef} className="ott-poll-answers" role="group" aria-label="Opções de voto">
    {poll.respostas.map((answer, index) => <button className="ott-poll-answer" key={index}
     disabled={sending || (savedAnswer !== null && !editingVote)} aria-pressed={savedAnswer === index}
     onClick={() => void vote(index)}>
     <span className="ott-poll-option-letter" aria-hidden="true">{savedAnswer === index ? <Check/> : String.fromCharCode(65 + index)}</span>
     <span>{answer.replace(/^[🅰🅱🅲🅳](?:\uFE0F)?\s*/u, "")}</span>
    </button>)}
   </div>
   <footer>
    <p role="status">{text || (sending ? "Registrando voto…" : savedAnswer !== null && !editingVote ? "Voto registrado." : "")}</p>
    {savedAnswer !== null && !editingVote && <button ref={changeVoteRef} className="ott-poll-change" onClick={() => {
     nextVoteFocus.current = "answer";
     setEditingVote(true);
     setText("Escolha sua nova resposta.");
    }}><RotateCcw aria-hidden="true"/> Mudar meu voto</button>}
   </footer>
  </div> : <p>{text}</p>)}
 </>}</div>;
}
