import { useEffect, useState } from 'react';
import { playerSupabase } from '@/integrations/supabase/playerClient';
import { getTvAudioSyncClock } from './tvAudio';
import { normalizeTvMusicText } from '@/lib/tvMusicEncoding';
export type TvTrack = { titulo:string; artista:string; capa:string; duracao:number; horario:string; startedAt?:number };
type BreakMeta = { title:string; artist:string; start:number; duration:number; received:number };
const nexoLote9BreakMeta = new WeakMap<object,BreakMeta>();
function nexoLote9Time(value:unknown):number|null {
 const numeric=typeof value==='number'||(typeof value==='string'&&/^\d+(?:\.\d+)?$/.test(value.trim()))?Number(value):NaN;
 const epoch=Number.isFinite(numeric)?(numeric<1e12?numeric*1000:numeric):typeof value==='string'?Date.parse(value):NaN;
 return Number.isFinite(epoch)&&epoch>0?epoch:null;
}
function nexoLote9IsBreak(title:string,artist:string){return [title,artist].some(v=>v.trim().toUpperCase()==='BREAK');}
type PendingTrack = { track:TvTrack; due:number; start:number|null; received:number };
type Store = { queue:PendingTrack[]; clockOffset?:number; delay?:number; clockSource?:object; lastClockAt?:number; releaseTimer?:ReturnType<typeof setTimeout>; lastRaw?:TvTrack; lastStart?:number|null; track:TvTrack|null; listeners:Set<(v:TvTrack|null)=>void>; busy:boolean; pending:boolean; timer?:ReturnType<typeof setInterval>; stop?:()=>void; owner?:string; generation:number; idle?:ReturnType<typeof setTimeout> };
const stores = new Map<string,Store>();
function store(slug:string):Store { let s=stores.get(slug); if(!s){s={queue:[],track:null,listeners:new Set(),busy:false,pending:false,generation:0};stores.set(slug,s);} return s; }
// Smart Sync V2: use the actual HLS program-date-time playhead when available.
// The fallback is intentionally unchanged for streams without a trustworthy clock.
// V3: never assume one listener's latency applies to another.
// A manual calibration is opt-in and local to this device/station.
function manualDelay(key:string):number|null {
 try { const v=localStorage.getItem(`nexo-smart-sync-ms:${key}`); if(v===null)return null; const n=Number(v);return Number.isFinite(n)&&n>=0&&n<=120000?n:null; } catch{return null;}
}
function debugEnabled(){return false;}
function showDebug(key:string,s:Store,sample:ClockSample|null,mode:string){
 if(!debugEnabled()){document.getElementById('nexo-smart-sync-debug')?.remove();return;}
 let el=document.getElementById('nexo-smart-sync-debug');
 if(!el){el=document.createElement('div');el.id='nexo-smart-sync-debug';el.style.cssText='position:fixed;right:12px;bottom:12px;z-index:2147483647;background:#111e;color:#fff;padding:10px 14px;border:1px solid #555;border-radius:6px;font:12px/1.5 monospace;white-space:pre;pointer-events:none;max-width:95vw';document.body.appendChild(el);}
 const fmt=(v:number|null|undefined)=>v==null?'indisponível':new Date(v).toLocaleTimeString('pt-BR');
 const latency=sample?((Date.now()+(s.clockOffset||0)-sample.epoch)/1000).toFixed(2)+' s':mode==='Manual'?((manualDelay(key)||0)/1000)+' s':'não mensurável';
 el.textContent=['NEXO SMART SYNC V3 · '+key,'Modo: '+mode,'Relógio do áudio: '+fmt(sample?.epoch),'Início da faixa: '+fmt(s.lastStart),'Relógio local: '+fmt(Date.now()),'Latência: '+latency,'Relógio servidor: '+(s.clockOffset===undefined?'não exposto':'estimado via HTTP'),'Fila: '+s.queue.length+' · '+(s.lastRaw?.titulo||'')].join('\n');
}
type ClockSample = { source:object; epoch:number };
type ClockReader = () => ClockSample|null;
const clocks = new Map<string,ClockReader>();
export function registerTvSyncClock(slug:string,reader:ClockReader){
 const key=slug.trim().toLowerCase();clocks.set(key,reader);
 return ()=>{if(clocks.get(key)===reader)clocks.delete(key);};
}
export function readTvHlsClock(engine:{playingDate?:Date|null}|null,media:HTMLMediaElement|null):ClockSample|null{
 if(!engine||!media||media.paused||media.ended||media.seeking||media.readyState<2)return null;
 try{const epoch=engine.playingDate?.getTime();return typeof epoch==='number'&&Number.isFinite(epoch)&&epoch>0?{source:engine,epoch}:null;}catch{return null;}
}
function updateClockOffset(s:Store,header:string|null,sent:number,received:number){
 if(!header||received-sent>1500||received<sent)return;
 const server=Date.parse(header);if(!Number.isFinite(server))return;
 const sample=server-(sent+received)/2;
 // HTTP Date has second-level resolution. Avoid jittering the schedule.
 if(s.clockOffset===undefined||Math.abs(sample-s.clockOffset)>1500)s.clockOffset=sample;
 else s.clockOffset=s.clockOffset*.9+sample*.1;
}
function getClock(key:string):ClockSample|null {
 try {const reader=clocks.get(key);return reader?reader():getTvAudioSyncClock(key);}catch{return null;}
}
function estimateDelay(s:Store,key:string,now:number){
 const sample=getClock(key);
 const raw=sample?now+(s.clockOffset||0)-sample.epoch:NaN;
 if(sample&&Number.isFinite(raw)&&raw>=-2000&&raw<=120000)return Math.max(0,raw);
 return manualDelay(key)??0;
}
function emit(s:Store,item:PendingTrack,key:string){
 if(item.start!==null){try{localStorage.setItem('masterview_music_start',String(item.due));}catch{}}
 const isBreak=[item.track.titulo,item.track.artista].some(v=>v.trim().toUpperCase()==="BREAK");
 const track=isBreak&&item.start!==null?{...item.track,startedAt:item.start-(s.clockOffset||0)+estimateDelay(s,key,Date.now())}:item.track;
 if(JSON.stringify(s.track)===JSON.stringify(track))return;
 s.track=track;s.listeners.forEach(fn=>fn(track));
}
function release(s:Store,key:string){
 clearTimeout(s.releaseTimer);s.releaseTimer=undefined;
 const now=Date.now();const sample=getClock(key);
 const raw=sample?now+(s.clockOffset||0)-sample.epoch:NaN;
 const valid=sample&&Number.isFinite(raw)&&raw>=-2000&&raw<=120000?sample:null;
 const manual=manualDelay(key);
 if(valid){s.lastClockAt=now;s.delay=Math.max(0,raw);s.clockSource=valid.source;}
 // During a short HLS hand-off/stall, do not publish future metadata just because the playhead temporarily disappeared.
 // BREAK must be able to end while the live stream is intentionally stopped.
 const wasBreak=[s.track?.titulo,s.track?.artista].some(v=>v?.trim().toUpperCase()==="BREAK");
 if(!valid&&manual===null&&!wasBreak&&s.queue[0]?.start!=null&&s.lastClockAt!==undefined&&now-s.lastClockAt<12000){s.releaseTimer=setTimeout(()=>release(s,key),250);return;}
 const mode=valid?'Automático HLS / PDT':manual!==null?'Manual':'Sem referência temporal';
 // Compare directly with the decoded media playhead; never estimate latency from download speed.
 let previousDue=0;
 for(const item of s.queue){
   const due=valid&&item.start!==null?now+item.start-valid.epoch:
     manual!==null?(item.start===null?item.received+manual:item.start-(s.clockOffset||0)+manual):now;
   item.due=Math.max(previousDue,due);previousDue=item.due;
 }
 let latest:PendingTrack|undefined;
 while(s.queue.length&&s.queue[0].due<=now)latest=s.queue.shift();
 if(latest)emit(s,latest,key);
 showDebug(key,s,valid,mode);
 if(s.queue.length)s.releaseTimer=setTimeout(()=>release(s,key),Math.min(250,Math.max(25,s.queue[0].due-Date.now())));
}
function sameSong(a:TvTrack|undefined|null,b:TvTrack){return !!a&&a.titulo===b.titulo&&a.artista===b.artista;}
function accept(s:Store,data:any,key:string){
 const raw=data?.musicData?.titulo ? data.musicData : data;
 const title=normalizeTvMusicText(raw?.titulo||raw?.musica||'');
 if(!title || /^sem t[ií]tulo$/i.test(title))return;
 const next:TvTrack={titulo:title,artista:normalizeTvMusicText(raw.artista||''),capa:raw.capa||'',duracao:Number(raw.duracao)||Number(data?.duracao)||0,horario:raw.horario||''};
 const now=Date.now();
 let value=nexoLote9IsBreak(next.titulo,next.artista)?(nexoLote9Time(data.musicStartTime ?? raw.startTime ?? raw.startedAt) ?? NaN):Number(data.musicStartTime ?? raw.startTime ?? raw.startedAt);
 const meta=nexoLote9BreakMeta.get(s);
 // nexo-lote13-break-meta: enrich only the same active BREAK, from the existing subscription.
 if(nexoLote9IsBreak(next.titulo,next.artista)&&meta&&meta.title===next.titulo&&meta.artist===next.artista&&(meta.start===value||(!Number.isFinite(value)&&now-meta.received<15000))){if(!Number.isFinite(value))value=meta.start;if(next.duracao<=0)next.duracao=meta.duration;}
 const serverNow=now+(s.clockOffset||0);
 // A missing, future or implausible timestamp never blocks a new track.
 const start=Number.isFinite(value)&&value>0&&value<=serverNow+1000&&serverNow-value<24*60*60*1000?value:null;
 const repeat=sameSong(s.lastRaw,next);
 const exact=repeat&&JSON.stringify(s.lastRaw)===JSON.stringify(next)&&start===s.lastStart;
 if(exact){release(s,key);return;}
 if(next.capa&&(!s.lastRaw||s.lastRaw.capa!==next.capa)){try{const image=new Image();image.src=next.capa;}catch{}}
 s.lastRaw=next;
 if(repeat && (start===null || start===s.lastStart)){
   const pending=s.queue[s.queue.length-1];
   if(pending&&sameSong(pending.track,next)){pending.track=next;if(start!==null)pending.start=start;release(s,key);return;}
   if(sameSong(s.track,next)){s.track={...next,startedAt:s.track?.startedAt??(start!==null&&(next.duracao>0||nexoLote9IsBreak(next.titulo,next.artista))?start-(s.clockOffset||0)+estimateDelay(s,key,now):undefined)};s.listeners.forEach(fn=>fn(s.track));return;}
 }
 // On cold start show the current snapshot immediately: no previous track is known.
 if(!s.track||(!s.queue.length&&sameSong(s.track,next))){s.lastStart=start;emit(s,{track:next,start,received:now,due:Math.min(now,start===null?now:start-(s.clockOffset||0)+estimateDelay(s,key,now))},key);release(s,key);return;}
 // Reused/corrected start times are not treated as stale snapshots.
 const reliable=start!==null&&(s.lastStart==null||start>s.lastStart);
 s.lastStart=start;
 const due=now;
 s.queue.push({track:next,start:reliable?start:null,due,received:now});
 release(s,key);
}
export function useTvNowPlaying(slug:string|undefined,owner:string|null|undefined,enabled:boolean){
 const key=(slug||'').trim().toLowerCase();
 const [snapshot,setSnapshot]=useState<{key:string;track:TvTrack|null}>(()=>({key,track:enabled&&key?store(key).track:null}));
 useEffect(()=>{
 if(!enabled||!key||key.startsWith(':'))return;
 const s=store(key); clearTimeout(s.idle); const listener=(track:TvTrack|null)=>setSnapshot({key,track});s.listeners.add(listener);listener(s.track);
 if(owner && s.owner!==owner){ if(s.timer)s.stop?.(); s.owner=owner; }
 if(!s.timer){
 const generation=++s.generation;
 let activeController:AbortController|undefined;
 const refresh=async(force=false)=>{
 if(generation!==s.generation)return;
 if(s.busy){if(force)s.pending=true;return;}
 s.busy=true;s.pending=false;
 const controller=new AbortController();activeController=controller;
 let timeout:ReturnType<typeof setTimeout>|undefined;
 try{
 // Public endpoint does not require a listener session. Bypass auth refresh,
 // SDK request locks and browser cache; only one read at a time per station.
 const base=String(import.meta.env.VITE_SUPABASE_URL||'').replace(/\/$/,'');
 const apiKey=String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'');
 if(!base||!apiKey)throw new Error('Missing public player configuration');
 const sent=Date.now();
 const data=await Promise.race([
 fetch(`${base}/functions/v1/public-player-data`,{method:'POST',headers:{apikey:apiKey,'Content-Type':'application/json'},body:JSON.stringify({slug:key,section:'now_playing'}),cache:'no-store',signal:controller.signal}).then(async response=>{if(!response.ok)throw new Error(`now_playing HTTP ${response.status}`);if(generation===s.generation&&!controller.signal.aborted)updateClockOffset(s,response.headers.get("date"),sent,Date.now());return response.json();}),
 new Promise<never>((_,reject)=>{timeout=setTimeout(()=>{controller.abort();reject(new Error('now_playing timeout'));},6000);})]);
 if(generation===s.generation&&!controller.signal.aborted&&data&&!data.error&&(!s.owner||!data.userId||data.userId===s.owner))accept(s,data,key);
 }catch(error){if(generation===s.generation&&!controller.signal.aborted)console.warn('[TV now playing]',error);}
 finally{clearTimeout(timeout);if(generation===s.generation){activeController=undefined;s.busy=false;if(s.pending)void refresh();}}
 };
 // Realtime is a wake-up signal, not a second competing source of track data.
 // Ignore station settings changes that demonstrably do not change music.
 // If the event has no comparable music fields, keep the original wake-up.
 let lastEventFingerprint:string|undefined;
 const musicFingerprint=(row:unknown):string|undefined=>{
   const items=(row as {dashboard_items?:Record<string,unknown>}|null)?.dashboard_items;
   if(!items||typeof items.music_current_title!=="string")return undefined;
   return JSON.stringify([items.music_current_title,items.music_current_artist,items.music_current_cover,items.music_current_duration,items.music_start_time,items.music_deezer_artist_img]);
 };
 let channel:ReturnType<typeof playerSupabase.channel>|null=null;
 if(s.owner){
  try{
   // Supabase can return an existing subscribed channel for an identical topic.
   // Give each lifecycle its own topic, including across HMR and async teardown.
   const topic=`tv-track-v3fix-${key}-${generation}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
   channel=playerSupabase.channel(topic);
   channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'user_settings',filter:`user_id=eq.${s.owner}`},payload=>{
     const items=(payload.new as {dashboard_items?:Record<string,unknown>}|null)?.dashboard_items;
     if(items){const title=normalizeTvMusicText(String(items.music_current_title||'')),artist=normalizeTvMusicText(String(items.music_current_artist||''));const start=nexoLote9Time(items.music_start_time),duration=Number(items.music_current_duration);if(nexoLote9IsBreak(title,artist)&&start!==null&&Number.isFinite(duration)&&duration>0)nexoLote9BreakMeta.set(s,{title,artist,start,duration,received:Date.now()});else nexoLote9BreakMeta.delete(s);}
     const next=musicFingerprint(payload.new);
     const previous=musicFingerprint(payload.old)??lastEventFingerprint;
     lastEventFingerprint=next;
     if(next!==undefined&&previous===next)return;
     void refresh(true);
   });
   channel.subscribe(status=>{if(status==='SUBSCRIBED')void refresh(true);});
  }catch(error){
   console.warn('[TV now playing] Realtime unavailable; polling remains active',error);
   if(channel){try{void playerSupabase.removeChannel(channel).catch(()=>{});}catch{}}
   channel=null;
  }
 }

 s.timer=setInterval(()=>void refresh(),2000);
 const wake=()=>void refresh(true);window.addEventListener('online',wake);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
 s.stop=()=>{document.getElementById("nexo-smart-sync-debug")?.remove();s.generation++;clearTimeout(s.releaseTimer);s.releaseTimer=undefined;s.queue=[];s.lastRaw=undefined;s.lastStart=undefined;s.delay=undefined;s.clockSource=undefined;s.lastClockAt=undefined;activeController?.abort();if(channel){try{void playerSupabase.removeChannel(channel).catch(()=>{});}catch{}}clearInterval(s.timer);s.timer=undefined;s.busy=false;s.pending=false;window.removeEventListener('online',wake);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);};void refresh();
 }
 return()=>{s.listeners.delete(listener);if(!s.listeners.size)s.idle=setTimeout(()=>{if(!s.listeners.size)s.stop?.();},5000);};
 },[key,owner,enabled]);
 return enabled&&snapshot.key===key?snapshot.track:null;
}
