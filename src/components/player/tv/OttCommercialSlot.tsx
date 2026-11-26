import {useEffect,useState,useRef,createContext,useContext,type ReactNode} from "react";
import {QRCodeSVG} from "qrcode.react";
import {load,isAdImageReady,type Campaign} from "./OttCommercialHomeBanner";
import "./OttCommercialSlot.css";
export const AdsProgramContext=createContext<string|null|undefined>(null);
const FIVE=300000;
export function pickAds(rows:Campaign[],placement:string,programId?:string|null,now=Date.now()){
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const pool=rows.filter(c=>c.start_date<=day&&c.end_date>=day&&Array.isArray(c.program_ids)&&(!c.program_ids.length||!!programId&&c.program_ids.includes(programId))&&c.media?.some(m=>m.placement===placement)).sort((a,b)=>a.id.localeCompare(b.id));
 const c=pool.length?pool[Math.floor(now/FIVE)%pool.length]:undefined; return c?.media.find(m=>m.placement===placement)||null;
}
export function eligibleAds(rows:Campaign[],placement:string,programId?:string|null,now=Date.now()){
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 return rows.filter(c=>c.start_date<=day&&c.end_date>=day&&Array.isArray(c.program_ids)&&(!c.program_ids.length||!!programId&&c.program_ids.includes(programId)))
  .sort((a,b)=>a.id.localeCompare(b.id)).flatMap(c=>(c.media||[]).filter(m=>m.placement===placement&&/^https?:\/\//i.test(m.url)).sort((a,b)=>(a.order||0)-(b.order||0)));
}
export function useCommercialCampaigns(radioId:string|null|undefined){
 const [state,setState]=useState<{id:string,rows:Campaign[],at:number}|null>(null);const [settled,setSettled]=useState('');
 useEffect(()=>{if(!radioId)return;let alive=true;let deadline:ReturnType<typeof setTimeout>;let retry:ReturnType<typeof setTimeout>;let retried=false;
 const refresh=()=>{if(document.hidden)return;void load(radioId).then(rows=>{if(alive){setState({id:radioId,rows,at:Date.now()});setSettled(radioId)}}) .catch(()=>{if(!alive)return;if(!retried){retried=true;retry=setTimeout(refresh,500);}else setSettled(radioId)})};
 refresh();deadline=setTimeout(()=>{if(alive)setSettled(radioId)},11000);const t=window.setInterval(refresh,60000);document.addEventListener('visibilitychange',refresh);return()=>{alive=false;clearTimeout(deadline);clearTimeout(retry);clearInterval(t);document.removeEventListener('visibilitychange',refresh)}},[radioId]);
 return {rows:state?.id===radioId&&Date.now()-state.at<315000?state.rows:[],ready:!radioId||settled===radioId};
}
export function useCommercialMedia(radioId:string|null|undefined,placement:string,programId?:string|null){
 const context=useContext(AdsProgramContext);const {rows}=useCommercialCampaigns(radioId);const [now,setNow]=useState(Date.now);
 useEffect(()=>{if(!radioId)return;const tick=window.setInterval(()=>setNow(Date.now()),5000);return()=>clearInterval(tick)},[radioId]);
 return pickAds(rows,placement,programId??context,now);
}
export default function OttCommercialSlot({radioId,placement,programId,className='',fallback,visible=true}:{radioId?:string|null;placement:string;programId?:string|null;className?:string;fallback?:ReactNode;visible?:boolean}){
 const m=useCommercialMedia(radioId,placement,programId);const [loaded,setLoaded]=useState('');const [failed,setFailed]=useState('');const [qr,setQr]=useState(false);const trigger=useRef<HTMLButtonElement>(null);
 const key=m?.url||'';useEffect(()=>{setQr(false)},[key,m?.link,visible]);
 useEffect(()=>{if(!qr)return;const fn=(e:KeyboardEvent)=>{if(['Escape','Backspace','BrowserBack','GoBack'].includes(e.key)||e.keyCode===461||e.keyCode===10009){e.preventDefault();e.stopImmediatePropagation();setQr(false);trigger.current?.focus()}};window.addEventListener('keydown',fn,true);return()=>window.removeEventListener('keydown',fn,true)},[qr]);
 if(!visible||!m||failed===key)return <>{placement==="background_ads"?<div aria-hidden={false} style={{display:"contents"}}>{fallback}</div>:fallback}</>;
 const ready=loaded===key||isAdImageReady(key);const clickable=m.clickable&&/^https?:\/\//i.test(m.link)&&placement!=='background_ads';
 const art=<><img src={m.url} alt="Publicidade" onLoad={()=>setLoaded(key)} onError={()=>setFailed(key)}/><span className="nexo-ad-label">publicidade</span></>;
 return <>{placement==="background_ads"?<div aria-hidden={ready} style={ready?{position:"absolute",inset:0,visibility:"hidden",pointerEvents:"none"}:{display:"contents"}}>{fallback}</div>:!ready&&fallback}<div className={'nexo-ad-slot nexo-ad-'+placement+' '+className} data-ad-ready={ready?'true':'false'} style={!ready?{position:'absolute',visibility:'hidden',pointerEvents:'none'}:undefined}>{clickable?<button type="button" ref={trigger} aria-label="Publicidade — abrir QR Code" aria-expanded={qr} onClick={()=>setQr(v=>!v)}>{art}</button>:<div className="nexo-ad-art">{art}</div>}{qr&&clickable&&<aside className="nexo-ad-qr"><span>↗</span><div><QRCodeSVG value={m.link} size={240} level="M" includeMargin/></div></aside>}</div></>;
}
