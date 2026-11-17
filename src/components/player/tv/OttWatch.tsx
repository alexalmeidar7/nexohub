import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight, Heart, Headphones, ListVideo, Loader2, Pause, Play, Settings2, Tv, UserRound, Volume2, VolumeX, X } from "lucide-react";
import { OttBrand, OttFrame } from "./OttFrame";
import { useOttRemote } from "./useOttRemote";

interface Props { video:boolean; playing:boolean; buffering:boolean; muted:boolean; title:string; subtitle?:string; radioName?:string|null; logo?:string|null; cover?:string|null; liked:boolean; programs:{id?:string;nome:string;horario_inicio?:string;horario_fim?:string}[]; onPlay:()=>void; onMute:()=>void; onLike:()=>void; onBack:()=>void; onChannel:(dir:1|-1)=>void; onProfile?:()=>void }
export default function OttWatch(p:Props){
 const [visible,setVisible]=useState(true),[panel,setPanel]=useState<"schedule"|"settings"|null>(null),[activity,setActivity]=useState(0);
 const root=useOttRemote(()=>{if(panel)setPanel(null);else if(p.video&&visible)setVisible(false);else p.onBack();},`${visible}:${panel}`,()=>{if(!visible){setVisible(true);setActivity(v=>v+1);return true;}setActivity(v=>v+1);return false;});
 useEffect(()=>{if(!p.video||!visible||panel)return;const timer=window.setTimeout(()=>setVisible(false),5000);return()=>clearTimeout(timer);},[p.video,visible,panel,activity]);
 const overlay=useRef<HTMLDivElement>(null);
 useEffect(()=>{const wake=()=>{setVisible(true);setActivity(v=>v+1);};const el=overlay.current;el?.addEventListener("pointermove",wake);return()=>el?.removeEventListener("pointermove",wake);},[]);
 return <OttFrame root={root} className={`ott-watch-controls ${p.video ? "ott-video":"ott-audio"}`}>
  <div ref={overlay} className="ott-watch-surface" onPointerDown={()=>{if(!visible){setVisible(true);setActivity(v=>v+1);}}}>
   {!p.video&&<div className="ott-audio-stage"><div className="ott-album">{p.cover||p.logo ? <img src={p.cover||p.logo||""} alt=""/>:<Headphones/>}</div><section><span className="ott-eyebrow">{p.radioName}</span><h1>{p.title}</h1><p>{p.subtitle}</p><span className="ott-live-label"><i/>Você está ouvindo ao vivo</span></section></div>}
   <div className="ott-watch-chrome" style={{visibility:visible ? "visible":"hidden",opacity:visible ? 1:0}}>
    <header className="ott-watch-header">{p.logo ? <img src={p.logo} alt={p.radioName||"Emissora"}/>:<OttBrand/>}<span>{p.radioName}</span><span className="ott-live-label"><i/> AO VIVO</span></header>
    {p.video&&<section className="ott-watch-description"><span className="ott-live-tag">AO VIVO</span><h1>{p.title}</h1><p>{p.subtitle}</p></section>}
    <footer className="ott-watch-footer"><button onClick={p.onBack} aria-label="Voltar ao início"><ArrowLeft/><span>Voltar</span></button><div className="ott-transport"><button onClick={()=>p.onChannel(-1)} aria-label="Canal anterior"><ChevronLeft/></button><button data-ott-initial className="ott-play" onClick={p.onPlay} aria-label={p.playing ? "Pausar":"Reproduzir"}>{p.buffering ? <Loader2 className="animate-spin"/>:p.playing ? <Pause/>:<Play/>}</button><button onClick={()=>p.onChannel(1)} aria-label="Próximo canal"><ChevronRight/></button></div><div className="ott-tools"><button onClick={p.onMute} aria-label={p.muted ? "Ativar som":"Silenciar"}>{p.muted?<VolumeX/>:<Volume2/>}</button><button onClick={p.onLike} aria-label={p.liked?"Descurtir música":"Curtir música"} aria-pressed={p.liked}><Heart fill={p.liked ? "currentColor":"none"}/></button><button onClick={()=>setPanel("settings")} aria-label="Opções do player"><Settings2/></button></div></footer>
    <button className="ott-open-schedule" onClick={()=>setPanel("schedule")} aria-label="Ver programação"><ChevronDown/></button>
   </div>
  </div>
  {panel&&<div className="ott-modal-scrim"><section className="ott-watch-panel ott-dialog" role="dialog" aria-modal="true" aria-labelledby="ott-watch-panel-title"><button className="ott-panel-close" onClick={()=>setPanel(null)} aria-label="Fechar"><X/></button><h2 id="ott-watch-panel-title">{panel==="schedule"?"Programação":"Opções do player"}</h2>{panel==="schedule"?<div className="ott-schedule-list" data-ott-scroll>{p.programs.map((s,i)=><div key={s.id||i}><span>{s.horario_inicio?.slice(0,5)} {s.horario_fim&&`– ${s.horario_fim.slice(0,5)}`}</span><b>{s.nome}</b></div>)}{!p.programs.length&&<p>Programação não disponível.</p>}<button data-ott-initial className="ott-primary" onClick={()=>setPanel(null)}>Voltar à transmissão</button></div>:<div className="ott-player-options"><button data-ott-initial onClick={()=>setPanel("schedule")}><ListVideo/>Programação</button><button onClick={()=>{p.onChannel(1);setPanel(null);}}><Tv/>Trocar de canal</button>{p.onProfile&&<button onClick={p.onProfile}><UserRound/>Perfis</button>}<p>A qualidade se adapta à transmissão e à conexão disponível.</p></div>}</section></div>}
 </OttFrame>;
}
