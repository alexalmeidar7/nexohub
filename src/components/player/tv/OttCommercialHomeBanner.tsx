import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './OttCommercialHomeBanner.css';
export type Campaign = {id:string;start_date:string;end_date:string;program_ids:string[];media:{placement:string;url:string;link:string;clickable:boolean;order?:number;duration?:number;backgroundUrl?:string}[]};
const FIVE=300000;
const REFRESH=60000;
const CACHE_KEY='nexo-player-ads-v3:';
const memory=new Map<string,{at:number;rows:Campaign[]}>();
const inflight=new Map<string,Promise<Campaign[]>>();
function day(now:number){return new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)}
function cached(id:string){try{const x=memory.get(id)||JSON.parse(localStorage.getItem(CACHE_KEY+id)||'null');if(x&&Date.now()-x.at<REFRESH&&Array.isArray(x.rows))return x.rows as Campaign[]}catch{}return null}
export async function load(id:string){const old=cached(id);if(old)return old;const existing=inflight.get(id);if(existing)return existing;const task=(async()=>{const base=String(import.meta.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');if(!base)throw Error('Configuração indisponível');const r=await fetch(`${base}/functions/v1/public-player-ads?radio_id=${encodeURIComponent(id)}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Campanhas indisponíveis');const body=await r.json();if(!Array.isArray(body.campaigns))throw Error('Resposta inválida');const rows:Campaign[]=body.campaigns;const value={at:Date.now(),rows};memory.set(id,value);try{localStorage.setItem(CACHE_KEY+id,JSON.stringify(value))}catch{}return rows})();inflight.set(id,task);try{return await task}finally{inflight.delete(id)}}
export default function OttCommercialHomeBanner({radioId,programId,visible=true}:{radioId?:string|null;programId?:string|null;visible?:boolean}){
 const [state,setState]=useState<{id:string;rows:Campaign[];at:number}|null>(null),[now,setNow]=useState(Date.now),[failed,setFailed]=useState(''),[loaded,setLoaded]=useState(''),[qr,setQr]=useState<{url:string;key:string}|null>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!radioId)return;let alive=true;const refresh=()=>{void load(radioId).then(rows=>{if(alive)setState({id:radioId,rows,at:memory.get(radioId)?.at??Date.now()})}).catch(()=>{/* keep last successful response until its safety expiry */})};refresh();const timer=window.setInterval(()=>{if(!document.hidden)refresh()},REFRESH); const onResume=()=>{if(!document.hidden)refresh()}; window.addEventListener('focus',onResume); document.addEventListener('visibilitychange',onResume);const tick=window.setInterval(()=>setNow(Date.now()),1000);return()=>{alive=false;clearInterval(timer);clearInterval(tick);window.removeEventListener('focus',onResume);document.removeEventListener('visibilitychange',onResume)}},[radioId]);
 const rows=state?.id===radioId&&now-state.at<=FIVE+15000?state.rows:[];
 const eligible=rows.filter(c=>c.media?.some(m=>m.placement==='home_banner')&&c.start_date<=day(now)&&day(now)<=c.end_date&&Array.isArray(c.program_ids)&&(!c.program_ids.length||!!programId&&c.program_ids.includes(programId))).sort((a,b)=>a.id.localeCompare(b.id));
 const campaign=eligible.length?eligible[Math.floor(now/FIVE)%eligible.length]:null;
 const media=campaign?.media?.find(m=>m.placement==='home_banner');const key=campaign&&media?`${campaign.id}:${media.url}`:'';
 useEffect(()=>{setQr(null)},[key,media?.link,media?.clickable,radioId,visible]);
 const close=()=>{setQr(null);requestAnimationFrame(()=>trigger.current?.focus())};
 useEffect(()=>{if(!qr)return;const handler=(e:KeyboardEvent)=>{if(['Escape','Backspace','BrowserBack','GoBack'].includes(e.key)||e.keyCode===461||e.keyCode===10009){e.preventDefault();e.stopImmediatePropagation();close()}};window.addEventListener('keydown',handler,true);return()=>window.removeEventListener('keydown',handler,true)},[qr]);
 if(!visible||!media||!key||failed===key)return null;
 const clickable=media.clickable&&/^https?:\/\//i.test(media.link);
 const open=!!qr&&qr.key===key;
 const image=<img className="nexo-home-commercial-image" key={key} src={media.url} alt="Publicidade" onLoad={()=>setLoaded(key)} onError={()=>setFailed(key)} />;
 const label=<span className="nexo-home-commercial-label">publicidade</span>;
 return <div className="nexo-home-commercial-banner" style={{visibility:loaded===key?'visible':'hidden'}}>
   {clickable?<button className="nexo-home-commercial-trigger" ref={trigger} type="button" aria-label="Publicidade — Saiba +" aria-expanded={open} aria-controls={open?'nexo-home-commercial-qr':undefined} onClick={()=>open?close():setQr({url:media.link,key})}>{image}{label}</button>:<div className="nexo-home-commercial-art">{image}{label}</div>}
   {open&&qr&&<aside id="nexo-home-commercial-qr" className="nexo-home-commercial-qr" aria-label="Saiba mais sobre a publicidade"><span className="nexo-home-commercial-link-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2"/><path d="M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/></svg></span><div className="nexo-home-commercial-qr-code"><QRCodeSVG value={qr.url} size={240} level="M" includeMargin/></div></aside>}
 </div>;
}
