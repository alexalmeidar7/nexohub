import nexoLote13HotPark from "./nexo-lote13-hotpark.png";
 const nexoLote13MediaCache=new WeakMap<object,object>();
 function nexoLote13BannerMedia<T extends {placement?:string;url?:string}|null|undefined>(media:T):T {
   if(!media||media.placement!=='home_banner'||typeof media.url!=='string'||media.url.split('?')[0]!=='https://qazvgmgdidjhbvcuinpy.supabase.co/storage/v1/object/public/comercial/452ebd1e-61a0-42dd-bf80-231a3f426c83/player-ads/00198081-b99d-4548-8561-ff953209d17a.png')return media;
   const cached=nexoLote13MediaCache.get(media);if(cached)return cached as T;
   const mapped={...media,url:new URL(nexoLote13HotPark,window.location.href).href} as T;
   nexoLote13MediaCache.set(media,mapped);return mapped;
 }
 import { compactTvHomeImage } from "./tvHomeRaster";
import { memo, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import './OttCommercialHomeBanner.css';
export type Campaign = {id:string;start_date:string;end_date:string;program_ids:string[];media:{placement:string;url:string;link:string;clickable:boolean;order?:number;duration?:number;backgroundUrl?:string}[]};
const FIVE=300000;
const REFRESH=60000;
const HOME_CAMPAIGN_MAX_AGE = FIVE + 15000;
const campaignDay = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const CACHE_KEY='nexo-player-ads-v3:';
const memory=new Map<string,{at:number;rows:Campaign[]}>();
const inflight=new Map<string,Promise<Campaign[]>>();
// Shared, bounded decoded-image cache. No media streams or extra database reads.
const imageCache=new Map<string,{image:HTMLImageElement;bytes:number;ready:boolean;task:Promise<boolean>}>();
const warmed=new Map<string,string>();
const warming=new Map<string,Promise<void>>();
const MAX_IMAGES=8, MAX_BYTES=32*1024*1024;
function trimImages(){
 let bytes=0;for(const entry of imageCache.values())bytes+=entry.bytes;
 for(const [url,entry] of imageCache){if(imageCache.size<=MAX_IMAGES&&bytes<=MAX_BYTES)break;if(!entry.ready)continue;imageCache.delete(url);bytes-=entry.bytes;}
}
export function isAdImageReady(url:string){const item=imageCache.get(url);return !!item?.ready&&item.image.complete&&item.image.naturalWidth>0;}
export function prepareAdImage(url:string):Promise<boolean>{
 if(!/^https?:\/\//i.test(url))return Promise.resolve(false);
 const old=imageCache.get(url);if(old){imageCache.delete(url);imageCache.set(url,old);return old.task;}
 // Do not allow unbounded simultaneous downloads.
 if([...imageCache.values()].filter(x=>!x.ready).length>=2)return Promise.resolve(false);
 const image=new Image();let done=false;let finish:(ok:boolean)=>void=()=>{};
 const task=new Promise<boolean>(resolve=>{finish=ok=>{if(done)return;done=true;clearTimeout(timer);image.onload=null;image.onerror=null;const item=imageCache.get(url);if(item?.image===image){if(ok){item.ready=true;item.bytes=image.naturalWidth*image.naturalHeight*4;trimImages();}else imageCache.delete(url);}if(!ok)image.removeAttribute('src');resolve(ok);};});
 const timer=setTimeout(()=>finish(false),10000);
 imageCache.set(url,{image,bytes:0,ready:false,task});
 image.decoding='async';image.onload=()=>{if(typeof image.decode==='function')void image.decode().then(()=>finish(true),()=>finish(image.complete&&image.naturalWidth>0));else finish(true);};image.onerror=()=>finish(false);image.src=url;return task;
}
export function warmCampaignImages(id:string,rows:Campaign[]){
 const today=day(Date.now());const active=rows.filter(c=>c.start_date<=today&&today<=c.end_date).flatMap(c=>c.media||[]);
 const priority=['home_banner','background_ads','cover_ads','naming_rights','pause_ads','splash_sponsor'];
 const urls=[...new Set(active.slice().sort((a,b)=>(priority.indexOf(a.placement)<0?99:priority.indexOf(a.placement))-(priority.indexOf(b.placement)<0?99:priority.indexOf(b.placement))).flatMap(m=>[...(!/_(audio|video)$/.test(m.placement)?[m.url]:[]),...(m.backgroundUrl?[m.backgroundUrl]:[])]).filter(u=>/^https?:\/\//i.test(u)))].slice(0,12);
 const signature=JSON.stringify(urls);if(warmed.get(id)===signature||warming.has(id)||document.hidden)return;
 const connection=(navigator as Navigator&{connection?:{saveData?:boolean;effectiveType?:string}}).connection;
 if(connection?.saveData||/2g/i.test(connection?.effectiveType||''))return;
 const task=(async()=>{for(const url of urls){if(document.hidden)return;await prepareAdImage(url);await new Promise<void>(r=>setTimeout(r,180));}warmed.set(id,signature);if(warmed.size>8)warmed.delete(warmed.keys().next().value!);})().finally(()=>warming.delete(id));warming.set(id,task);
}
export async function preloadCampaignImages(id:string){try{warmCampaignImages(id,await load(id));}catch{/* Optional work never blocks startup. */}}
function day(now: number) { return campaignDay.format(now); }
function cached(id:string){try{const x=memory.get(id)||JSON.parse(localStorage.getItem(CACHE_KEY+id)||'null');if(x&&Date.now()-x.at<REFRESH&&Array.isArray(x.rows))return x.rows as Campaign[]}catch{}return null}
export async function load(id:string){const old=cached(id);if(old)return old;const existing=inflight.get(id);if(existing)return existing;const task=(async()=>{const base=String(import.meta.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');if(!base)throw Error('Configuração indisponível');const r=await fetch(`${base}/functions/v1/public-player-ads?radio_id=${encodeURIComponent(id)}`,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('Campanhas indisponíveis');const body=await r.json();if(!Array.isArray(body.campaigns))throw Error('Resposta inválida');const rows:Campaign[]=body.campaigns;const value={at:Date.now(),rows};memory.set(id,value);warmCampaignImages(id,rows);try{localStorage.setItem(CACHE_KEY+id,JSON.stringify(value))}catch{}return rows})();inflight.set(id,task);try{return await task}finally{inflight.delete(id)}}
export default memo(function OttCommercialHomeBanner({radioId,programId,visible=true,interactive=visible}:{radioId?:string|null;programId?:string|null;visible?:boolean;interactive?:boolean}){
 const [state,setState]=useState<{id:string;rows:Campaign[];at:number}|null>(null),[now,setNow]=useState(Date.now),[displayed,setDisplayed]=useState<{ radioId: string; campaign: Campaign; media: Campaign['media'][number]; renderUrl: string } | null>(null),[failedUrl,setFailedUrl]=useState(''),[qr,setQr]=useState<{url:string;key:string}|null>(null);
 const trigger=useRef<HTMLButtonElement>(null);
 useEffect(() => {
   if (!radioId) return;
   let active = true;
   const refresh = () => {
     void load(radioId).then(rows => {
       if (!active) return;
       const at = memory.get(radioId)?.at ?? Date.now();
       setState(previous => previous?.id === radioId && previous.rows === rows && previous.at === at
         ? previous : { id: radioId, rows, at });
       // Refresh failures leave the last response valid until its safety expiry.
     }).catch(() => {});
   };
   const onResume = () => {
     if (document.hidden) return;
     setNow(Date.now());
     refresh();
   };
   refresh();
   const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, REFRESH);
   window.addEventListener('focus', onResume);
   document.addEventListener('visibilitychange', onResume);
   return () => {
     active = false;
     window.clearInterval(timer);
     window.removeEventListener('focus', onResume);
     document.removeEventListener('visibilitychange', onResume);
   };
 }, [radioId]);

 const expiry = state?.id === radioId && state ? state.at + HOME_CAMPAIGN_MAX_AGE : 0;
 useEffect(() => {
   if (!expiry) return;
   // Campaign rotation and expiry are the only time boundaries that can
   // change the banner. Do not wake React every second while the URL is stable.
   const rotation = (Math.floor(now / FIVE) + 1) * FIVE;
   const boundary = now < expiry ? Math.min(rotation, expiry) : rotation;
   const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1, boundary - Date.now()));
   return () => window.clearTimeout(timer);
 }, [expiry, now]);

 const today = day(now);
 const rows = state?.id === radioId && now < expiry ? state.rows : [];
 const eligible = rows.filter(c => c.media?.some(m => m.placement === 'home_banner')
   && c.start_date <= today && today <= c.end_date
   && Array.isArray(c.program_ids) && (!c.program_ids.length || !!programId && c.program_ids.includes(programId)))
   .sort((a,b) => a.id.localeCompare(b.id));
 const campaign = eligible.length ? eligible[Math.floor(now / FIVE) % eligible.length] : null;
 const candidate = nexoLote13BannerMedia(campaign?.media?.find(item => item.placement === 'home_banner'));
 const candidateUrl = candidate?.url || '';
 const candidateRef = useRef({ campaign, candidate });
 candidateRef.current = { campaign, candidate };
 const readyUrl = displayed?.radioId === radioId ? displayed?.media.url : undefined;
 useEffect(() => {
   if (!radioId || !candidateUrl || candidateUrl === readyUrl) return;
   let active = true;
   void prepareAdImage(candidateUrl).then(async ready => {
     if (!active || !ready) return;
     const pixels = window.devicePixelRatio || 1;
     const renderUrl = await compactTvHomeImage(candidateUrl, Math.ceil(innerWidth * pixels * .44), Math.ceil(innerHeight * pixels));
     const latest = candidateRef.current;
     if (active && ready && latest.campaign && latest.candidate?.url === candidateUrl) {
       setFailedUrl('');
       setDisplayed({ radioId, campaign: latest.campaign, media: latest.candidate, renderUrl });
     }
   });
   return () => { active = false; };
 }, [radioId, candidateUrl, readyUrl, state?.at]);
 // The last decoded creative stays visible while the next one loads. It
 // still expires if the station or the program changes or the cache expires.
 const previous = displayed && readyUrl && candidate
   && displayed.campaign.start_date <= today && today <= displayed.campaign.end_date
   && (!displayed.campaign.program_ids.length || !!programId && displayed.campaign.program_ids.includes(programId))
   ? displayed : null;
 const displayedCampaign = candidateUrl === readyUrl ? campaign : previous?.campaign;
 const media = candidateUrl === readyUrl ? candidate : previous?.media;
 const key = displayedCampaign && media ? `${displayedCampaign.id}:${media.url}` : '';
 useEffect(()=>{setQr(null)},[key,media?.link,media?.clickable,radioId,visible,interactive]);
 const close=()=>{setQr(null);requestAnimationFrame(()=>trigger.current?.focus())};
 useEffect(()=>{if(!qr)return;const handler=(e:KeyboardEvent)=>{if(['Escape','Backspace','BrowserBack','GoBack'].includes(e.key)||e.keyCode===461||e.keyCode===10009){e.preventDefault();e.stopImmediatePropagation();close()}};window.addEventListener('keydown',handler,true);return()=>window.removeEventListener('keydown',handler,true)},[qr]);
 if(!media||!key||failedUrl===media.url)return null;
 const clickable=media.clickable&&/^https?:\/\//i.test(media.link);
 const open=interactive&&visible&&!!qr&&qr.key===key;
 const image=<img className="nexo-home-commercial-image" key={media.url} src={displayed?.renderUrl || media.url} alt="Publicidade" onError={()=>setFailedUrl(media.url)} />;
 const label=<span className="nexo-home-commercial-label">publicidade</span>;
 return <div className="nexo-home-commercial-banner" aria-hidden={!visible||!interactive||undefined} ref={el=>{el?.toggleAttribute("inert",!interactive||!visible);}} style={{visibility:visible?'visible':'hidden'}} data-interactive={interactive&&visible?"true":"false"}>
   {clickable?<button className="nexo-home-commercial-trigger" ref={trigger} type="button" tabIndex={interactive&&visible?0:-1} aria-label="Publicidade — Saiba +" aria-expanded={open} aria-controls={open?'nexo-home-commercial-qr':undefined} onClick={()=>open?close():setQr({url:media.link,key})}>{image}{label}</button>:<div className="nexo-home-commercial-art nexo-home-commercial-trigger" tabIndex={interactive&&visible?0:-1} aria-label="Publicidade" style={{cursor:"default"}}>{image}{label}</div>}
   {open&&qr&&<aside id="nexo-home-commercial-qr" className="nexo-home-commercial-qr" aria-label="Saiba mais sobre a publicidade"><span className="nexo-home-commercial-link-badge" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 .5l3-3a5 5 0 0 0-7-7l-2 2"/><path d="M14 11a5 5 0 0 0-7-.5l-3 3a5 5 0 0 0 7 7l2-2"/></svg></span><div className="nexo-home-commercial-qr-code"><QRCodeSVG value={qr.url} size={240} level="M" includeMargin/></div></aside>}
 </div>;
});
