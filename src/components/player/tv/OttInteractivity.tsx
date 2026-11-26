import { OttSkeletonContent } from "./OttSkeleton";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, ListChecks, RotateCcw } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { getActiveEnquete, getBrasiliaDateTime } from "@/lib/scheduledItemUtils";

import OttWeatherForecast from "./NexoTvWeatherPanel";
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
 const [voteCounts, setVoteCounts] = useState<number[] | null>(null);
 const votePending = useRef(false);
 const answersRef = useRef<HTMLDivElement>(null);
 const changeVoteRef = useRef<HTMLButtonElement>(null);
 const lyricsRef = useRef<HTMLDivElement>(null);
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
 // NEXO_V7_1_INTERACTIVITY_FOCUS: aguarda dados antes de focar.
 useLayoutEffect(() => {
  if(loading)return;
  const frame=requestAnimationFrame(()=>{
   if(page==="lyrics")lyricsRef.current?.focus({preventScroll:true});
   if(page==="poll"&&poll){
    if(savedAnswer!==null&&!editingVote)changeVoteRef.current?.focus({preventScroll:true});
    else if(savedAnswer===null)answersRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
   }
  });
  return()=>cancelAnimationFrame(frame);
 },[page,loading,poll?.id,savedAnswer,editingVote]);
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
     setText("Opa, a gente não tem nenhuma enquete agora, volte depois.");
    }
   }else if(page==="poll"){
    if(!cancelled)setText("Opa, a gente não tem nenhuma enquete agora, volte depois.");
   }
  }catch{
   if(!cancelled)setText("Não foi possível carregar. Volte e tente novamente.");
  }finally{if(!cancelled)setLoading(false);}};
  if(page!=="weather")void load();else setLoading(false);
  return()=>{cancelled=true;};
 },[page,owner,lyricsTitle,lyricsArtist,canVote]);
 // NEXO_ENQUETE_V8_CONTAGEM_REAL
 useEffect(() => {
  if (page !== "poll" || !poll?.id) { setVoteCounts(null); return; }
  let cancelled = false;
  setVoteCounts(null);
  const refresh = async () => {
   const { data, error } = await (playerSupabase as any).rpc("get_player_poll_results", { p_poll_id: poll.id });
   if (cancelled || error || !Array.isArray(data?.counts)) return;
   const counts = data.counts.slice(0, 4).map((value: unknown) => Math.max(0, Number(value) || 0));
   if (counts.length === 4) setVoteCounts(counts);
  };
  void refresh();
  const timer = window.setInterval(() => { void refresh(); }, 15000);
  return () => { cancelled = true; window.clearInterval(timer); };
 }, [page, poll?.id]);
 const vote=async(index:number)=>{
  if (!poll || votePending.current || (savedAnswer !== null && !editingVote)) return;
  if (!canVote) { setText("Entre na sua conta para votar."); return; }
  votePending.current = true;
  setSending(true);setText("");
  try{
   const {data,error}=await playerSupabase.rpc("submit_player_poll_vote",{p_poll_id:poll.id,p_answer_index:index});
   if(error)throw error;
   const result=data as {ok?:boolean;answer_index?:number;answer?:string;reason?:string};
   if(!result?.ok)throw new Error(result?.reason || "vote_failed");
   const recordedIndex = result.answer_index ?? poll.respostas.indexOf(result.answer ?? "");
   if (recordedIndex !== index) throw new Error("vote_not_changed");
   nextVoteFocus.current = "change";
   setSavedAnswer(recordedIndex);
   setEditingVote(false);
   setText("Voto registrado.");
   void (playerSupabase as any).rpc("get_player_poll_results", { p_poll_id: poll.id }).then(({data,error}: {data:any,error:any}) => {
    if (!error && Array.isArray(data?.counts) && data.counts.length === 4)
     setVoteCounts(data.counts.map((value:unknown) => Math.max(0, Number(value) || 0)));
   }).catch(() => {});
  }catch(error){
   const message=error instanceof Error?error.message:String((error as {message?:string})?.message||"");
   setText(/login_required|permission denied|42501|401|403/i.test(message)?"Entre na sua conta Google para votar.":/poll_closed/i.test(message)?"Esta enquete já foi encerrada.":/invalid_answer/i.test(message)?"Esta alternativa não está disponível.":"Não foi possível registrar o voto no servidor. Tente novamente mais tarde.");
  }finally{votePending.current = false;setSending(false);}
 };
 if(page==="weather")return <OttWeatherForecast radioUserId={owner}/>;
 return <div className="ott-interaction-content">{loading ? <OttSkeletonContent variant={page === "lyrics" ? "lyrics" : page === "poll" ? "poll" : "weather"} /> : <>
  {page==="lyrics"&&<><h3>{title}</h3><p>{artist}</p><div ref={lyricsRef} tabIndex={0} data-ott-initial data-ott-scroll className="ott-lyrics-text">{text}</div></>}
  {page==="poll"&&(
   poll ? <div className="ott-poll">
   {/* NEXO_ENQUETE_TITULO_20261121 */}
   <div className="ott-poll-headline">enquete da hora</div>
   <h3>{poll.pergunta}</h3>
   <div ref={answersRef} className="ott-poll-answers" role="group" aria-label="Opções de voto">
    {poll.respostas.map((answer, index) => <button className="ott-poll-answer" key={index} data-ott-initial={savedAnswer === null && index === 0 ? "" : undefined}
     disabled={sending || (savedAnswer !== null && !editingVote)} aria-pressed={savedAnswer === index}
     onClick={() => void vote(index)}>
     <span className="ott-poll-option-letter" aria-hidden="true">{savedAnswer === index ? <Check/> : String.fromCharCode(65 + index)}</span>
     <span>{answer.replace(/^[🅰🅱🅲🅳](?:\uFE0F)?\s*/u, "")}</span>
     {voteCounts && <span title="Total de votos nesta alternativa" style={{marginLeft:"auto",flexShrink:0,borderRadius:999,padding:"3px 10px",background:"rgba(255,255,255,.14)",color:"#fff",fontSize:".8em",fontWeight:700,fontVariantNumeric:"tabular-nums",whiteSpace:"nowrap"}}>{voteCounts[index] ?? 0} voto{(voteCounts[index] ?? 0) === 1 ? "" : "s"}</span>}
    </button>)}
   </div>
   <footer>
    <p role="status">{text || (sending ? "Registrando voto…" : savedAnswer !== null && !editingVote ? "Voto registrado." : "")}</p>
    {savedAnswer !== null && !editingVote && <button ref={changeVoteRef} data-ott-initial className="ott-poll-change" onClick={() => {
     nextVoteFocus.current = "answer";
     setEditingVote(true);
     setText("Escolha sua nova resposta.");
    }}><RotateCcw aria-hidden="true"/> Mudar meu voto</button>}
   </footer>
  </div> : <div className="ott-poll-empty" role="status" aria-live="polite">
    <div className="ott-poll-empty-icon" aria-hidden="true"><ListChecks strokeWidth={1.6}/></div>
    <p>{text}</p>
   </div>
  )}
 </>}</div>;
}
