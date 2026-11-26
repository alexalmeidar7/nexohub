import { OttSkeletonContent } from "./OttSkeleton";
import NexoLoadingImage from "./NexoLoadingImage";
import {useEffect,useState,useRef} from "react";
import { Swords } from "lucide-react";
import {playerSupabase} from "@/integrations/supabase/playerClient";
import {getActiveBatalha,getBrasiliaDateTime} from "@/lib/scheduledItemUtils";
import type { Database } from "@/integrations/supabase/types";

type BattleRow = Database["public"]["Tables"]["batalhas_agendadas"]["Row"];
type Battle = Omit<BattleRow, "created_at" | "updated_at" | "user_id">;

async function readPublicBattle(owner:string):Promise<Battle|null>{
 const env=import.meta.env;const server=String(env.VITE_SUPABASE_URL||"").replace(/\/$/,"");const key=String(env.VITE_SUPABASE_PUBLISHABLE_KEY||env.VITE_SUPABASE_ANON_KEY||"");
 if(!server||!key)throw new Error("Configuração indisponível");
 const controller=new AbortController(), deadline=setTimeout(()=>controller.abort(),8000);
 const response=await fetch(`${server}/functions/v1/serve-xml-batalha?${new URLSearchParams({user_id:owner})}`,{headers:{apikey:key},cache:"no-store",signal:controller.signal}).finally(()=>clearTimeout(deadline));
 if(!response.ok)throw new Error("XML indisponível");
 const doc=new DOMParser().parseFromString(await response.text(),"application/xml");if(doc.querySelector("parsererror,error"))throw new Error("XML inválido");
 const row=doc.querySelector("batalha");if(!row)throw new Error("Resposta inesperada");
 const val=(tag:string)=>row.querySelector(tag)?.textContent?.trim()||"";
 if(!val("artista1_nome")&&!val("artista2_nome"))return null;
 return {id:"",artista1_nome:val("artista1_nome"),artista1_musica:val("artista1_musica"),artista1_imagem:val("artista1_imagem"),artista1_porcentagem:parseInt(val("artista1_porcentagem"),10)||0,artista2_nome:val("artista2_nome"),artista2_musica:val("artista2_musica"),artista2_imagem:val("artista2_imagem"),artista2_porcentagem:parseInt(val("artista2_porcentagem"),10)||0,horario_inicio:val("horario_inicio"),horario_fim:val("horario_fim"),data_batalha:getBrasiliaDateTime().today};
}
export default function OttBattle({owner,canVote}:{owner?:string|null;canVote:boolean}){
 const [battle,setBattle]=useState<Battle|null>(null),[status,setStatus]=useState("Carregando batalha…"),[selected,setSelected]=useState<number|null>(null),[sending,setSending]=useState(false),[editing,setEditing]=useState(false),[ready,setReady]=useState(false);
 const first=useRef<HTMLButtonElement>(null),change=useRef<HTMLButtonElement>(null),pending=useRef(false),epoch=useRef(0),aliveRef=useRef(false),focusNext=useRef(false);
 const rpc=playerSupabase.rpc.bind(playerSupabase) as any;
 const activeId=battle ? (battle.id||`${battle.data_batalha}:${battle.horario_inicio}:${battle.artista1_nome}:${battle.artista2_nome}`) : null;
 useEffect(()=>{setEditing(false);focusNext.current=true;},[activeId]);
 useEffect(()=>{if(activeId&&focusNext.current&&!sending){const target=selected!==null&&!editing?change.current:first.current;if(target){target.focus({preventScroll:true});focusNext.current=false;}}},[activeId,selected,editing,sending,ready]);
 useEffect(()=>{let alive=true,busy=false;aliveRef.current=true;setBattle(null);setSelected(null);setReady(false);setStatus("Carregando batalha…");
 const refresh=async()=>{if(busy||pending.current||document.hidden)return;busy=true;const version=epoch.current;try{
 if(!owner){if(alive)setStatus("Emissora não identificada.");return;}
 const result=await rpc("nexo_tv_active_battle_v24",{p_radio_id:owner});
 if(!alive||version!==epoch.current||pending.current)return;
 if(!result.error){const active=result.data||null;setBattle(prev=>JSON.stringify(prev)===JSON.stringify(active)?prev:active);setSelected(active?.my_vote===1||active?.my_vote===2?active.my_vote:null);setReady(active?.voting_available!==false);setStatus(active?.voting_available===false?"Esta batalha possui resultados anteriores. Votação indisponível.":active?"":"Nenhuma batalha disponível no momento.");return;}
 const {today,currentTime}=getBrasiliaDateTime();const {data,error}=await playerSupabase.from("batalhas_agendadas").select("*").eq("user_id",owner).eq("data_batalha",today);let active: Battle | null = error ? null : getActiveBatalha(data || [], today, currentTime);if(!active)active=await readPublicBattle(owner);
 if(alive&&version===epoch.current&&!pending.current){setBattle(prev=>JSON.stringify(prev)===JSON.stringify(active)?prev:active);setSelected(null);setReady(false);setStatus(active?"Votação temporariamente indisponível.":"Nenhuma batalha disponível no momento.");}
 }catch{if(alive&&version===epoch.current&&!pending.current)setStatus("Não foi possível atualizar a batalha. Tente novamente.");}finally{busy=false;}};
 void refresh();const timer=window.setInterval(refresh,15000);const wake=()=>{if(!document.hidden)void refresh();};document.addEventListener("visibilitychange",wake);return()=>{document.removeEventListener("visibilitychange",wake);alive=false;aliveRef.current=false;epoch.current++;clearInterval(timer);};},[owner,canVote]);
 async function vote(choice:number){if(!battle||pending.current||(selected!==null&&!editing))return;if(!canVote){setStatus("Conecte sua conta Google para votar.");return;}if(!ready||!battle.id){setStatus("Votação temporariamente indisponível no servidor.");return;}
 pending.current=true;const version=++epoch.current;setSending(true);setStatus("Registrando voto…");
 try{const {data,error}=await rpc("nexo_tv_vote_battle_v24",{p_battle_id:battle.id,p_choice:choice});if(error||!data?.ok)throw error||new Error(data?.reason||"vote_failed");if(!aliveRef.current||version!==epoch.current)return;setSelected(choice);setEditing(false);focusNext.current=true;setBattle(prev=>prev?.id===battle.id?{...prev,artista1_porcentagem:data.p1,artista2_porcentagem:data.p2}:prev);setStatus("");}
 catch{if(aliveRef.current&&version===epoch.current)setStatus("Não foi possível registrar o voto. Tente novamente.");}finally{pending.current=false;if(aliveRef.current)setSending(false);}}
 const locked=selected!==null&&!editing;
 if(!battle && status.startsWith("Carregando"))return <OttSkeletonContent variant="poll"/>;
 if(!battle && status === "Nenhuma batalha disponível no momento.") return <div className="ott-interaction-content ott-battle-v24 ott-battle-v28 nexo-lote11-battle-empty"><div className="ott-poll-empty" role="status" aria-live="polite"><div className="ott-poll-empty-icon" aria-hidden="true"><Swords strokeWidth={1.6}/></div><p>Opa, a gente não tem nenhuma batalha musical agora, volte depois.</p></div></div>;
 return <div className="ott-interaction-content ott-battle-v24 ott-battle-v28">{battle&&<><h3>Quem merece ganhar essa batalha?</h3><div className="ott-battle-cards-v24" role="group" aria-label="Opções de votação">{[1,2].map(i=>{const name=i===1?battle.artista1_nome:battle.artista2_nome;const song=i===1?battle.artista1_musica:battle.artista2_musica;const image=i===1?battle.artista1_imagem:battle.artista2_imagem;const pct=Math.max(0,Math.min(100,Number(i===1?battle.artista1_porcentagem:battle.artista2_porcentagem)||0));return <button ref={i===1?first:undefined} key={i} className="ott-battle-choice-v24" type="button" disabled={sending||locked} aria-pressed={selected===i} onClick={()=>void vote(i)}>{image&&<NexoLoadingImage src={image} alt=""/>}<span className="ott-battle-badge-v28">{selected===i?"✓ Seu voto":`0${i}`}</span><span className="ott-battle-copy-v24"><strong>{song}</strong><span>{name}</span><span className="ott-battle-result-v28"><span className="ott-battle-meter-v28"><i style={{width:`${pct}%`}}/></span><b>{pct}%</b></span></span></button>})}</div><div className="ott-battle-footer-v28"><small>Até {battle.horario_fim.slice(0,5)}</small>{locked&&<button ref={change} type="button" className="ott-poll-change" onClick={()=>{focusNext.current=true;setEditing(true);setStatus("");}}>Mudar meu voto</button>}</div></>}<p role="status">{status||(locked?"Voto registrado.":"")}</p></div>;
}
