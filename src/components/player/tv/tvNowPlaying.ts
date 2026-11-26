import { useEffect, useState } from 'react';
import { playerSupabase } from '@/integrations/supabase/playerClient';
import { getTvAudioSyncClock } from './tvAudio';
import { normalizeTvMusicText } from '@/lib/tvMusicEncoding';
export type TvTrack = { titulo:string; artista:string; capa:string; duracao:number; horario:string };
type PendingTrack = { track:TvTrack; due:number; start:number|null; received:number };
type Store = { queue:PendingTrack[]; clockOffset?:number; delay?:number; clockSource?:object; releaseTimer?:ReturnType<typeof setTimeout>; lastRaw?:TvTrack; lastStart?:number|null; track:TvTrack|null; listeners:Set<(v:TvTrack|null)=>void>; busy:boolean; pending:boolean; timer?:ReturnType<typeof setInterval>; stop?:()=>void; owner?:string; generation:number; idle?:ReturnType<typeof setTimeout> };
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
function emit(s:Store,item:PendingTrack){
 if(item.start!==null){try{localStorage.setItem('masterview_music_start',String(item.due));}catch{}}
 if(JSON.stringify(s.track)===JSON.stringify(item.track))return;
 s.track=item.track;s.listeners.forEach(fn=>fn(item.track));
}
function release(s:Store,key:string){
 clearTimeout(s.releaseTimer);s.releaseTimer=undefined;
 const now=Date.now();const sample=getClock(key);
 const raw=sample?now+(s.clockOffset||0)-sample.epoch:NaN;
 const valid=sample&&Number.isFinite(raw)&&raw>=-2000&&raw<=120000?sample:null;
 const manual=manualDelay(key);
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
 if(latest)emit(s,latest);
 showDebug(key,s,valid,mode);
 if(s.queue.length)s.releaseTimer=setTimeout(()=>release(s,key),Math.min(250,Math.max(25,s.queue[0].due-Date.now())));
}
function sameSong(a:TvTrack|undefined|null,b:TvTrack){return !!a&&a.titulo===b.titulo&&a.artista===b.artista;}
function accept(s:Store,data:any,key:string){
 const raw=data?.musicData?.titulo ? data.musicData : data;
 const title=normalizeTvMusicText(raw?.titulo||raw?.musica||'');
 if(!title || /^sem t[ií]tulo$/i.test(title))return;
 const next:TvTrack={titulo:title,artista:normalizeTvMusicText(raw.artista||''),capa:raw.capa||'',duracao:Number(raw.duracao)||0,horario:raw.horario||''};
 const now=Date.now();
 const value=Number(data.musicStartTime);
 const serverNow=now+(s.clockOffset||0);
 // A missing, future or implausible timestamp never blocks a new track.
 const start=Number.isFinite(value)&&value>0&&value<=serverNow+1000&&serverNow-value<24*60*60*1000?value:null;
 const repeat=sameSong(s.lastRaw,next);
 const exact=repeat&&JSON.stringify(s.lastRaw)===JSON.stringify(next);
 if(exact){release(s,key);return;}
 if(next.capa&&(!s.lastRaw||s.lastRaw.capa!==next.capa)){try{const image=new Image();image.src=next.capa;}catch{}}
 s.lastRaw=next;
 if(repeat){
   const pending=s.queue[s.queue.length-1];
   if(pending&&sameSong(pending.track,next)){pending.track=next;return;}
   if(sameSong(s.track,next)){s.track=next;s.listeners.forEach(fn=>fn(next));return;}
 }
 // On cold start show the current snapshot immediately: no previous track is known.
 if(!s.track||(!s.queue.length&&sameSong(s.track,next))){s.lastStart=start;emit(s,{track:next,start,received:now,due:Math.min(now,start===null?now:start-(s.clockOffset||0)+estimateDelay(s,key,now))});release(s,key);return;}
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
 let channel:ReturnType<typeof playerSupabase.channel>|null=null;
 if(s.owner){
  try{
   // Supabase can return an existing subscribed channel for an identical topic.
   // Give each lifecycle its own topic, including across HMR and async teardown.
   const topic=`tv-track-v3fix-${key}-${generation}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
   channel=playerSupabase.channel(topic);
   channel.on('postgres_changes',{event:'UPDATE',schema:'public',table:'user_settings',filter:`user_id=eq.${s.owner}`},()=>{void refresh(true);});
   channel.subscribe(status=>{if(status==='SUBSCRIBED')void refresh(true);});
  }catch(error){
   console.warn('[TV now playing] Realtime unavailable; polling remains active',error);
   if(channel){try{void playerSupabase.removeChannel(channel).catch(()=>{});}catch{}}
   channel=null;
  }
 }

 s.timer=setInterval(()=>void refresh(),2000);
 const wake=()=>void refresh(true);window.addEventListener('online',wake);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);
 s.stop=()=>{document.getElementById("nexo-smart-sync-debug")?.remove();s.generation++;clearTimeout(s.releaseTimer);s.releaseTimer=undefined;s.queue=[];s.lastRaw=undefined;s.lastStart=undefined;s.delay=undefined;s.clockSource=undefined;activeController?.abort();if(channel){try{void playerSupabase.removeChannel(channel).catch(()=>{});}catch{}}clearInterval(s.timer);s.timer=undefined;s.busy=false;s.pending=false;window.removeEventListener('online',wake);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);};void refresh();
 }
 return()=>{s.listeners.delete(listener);if(!s.listeners.size)s.idle=setTimeout(()=>{if(!s.listeners.size)s.stop?.();},5000);};
 },[key,owner,enabled]);
 return enabled&&snapshot.key===key?snapshot.track:null;
}
