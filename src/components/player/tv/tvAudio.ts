// NEXO_V7_13_CONTINUOUS_AUDIO
import { useSyncExternalStore } from "react";
import { createLiveMediaRecovery } from "@/lib/liveMediaRecovery";
import type Hls from "hls.js";
export const tvRadioVolume = (volume: number) => Math.max(0, Math.min(1, volume * 0.8));
function savedVolume() {
 try { const raw=localStorage.getItem("player:lastVolume"); const n=raw===null?80:Number(raw); return tvRadioVolume(Number.isFinite(n)&&n>=0&&n<=100?n/100:0.8); } catch { return tvRadioVolume(0.8); }
}
function savedMuted() { try { return localStorage.getItem("player:lastMuted")==="1"; } catch { return false; } }
function createController() {
let audio: HTMLMediaElement | null = null;
let engine: Hls | null = null;
let active = false, playing = false, userPaused = false, owner = "";
let fadeFrame = 0, fadeTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0, targetVolume = 1, sourceUrl = "";
let initialFadePending = true;
let standby = false;
let recovery: ReturnType<typeof createLiveMediaRecovery> | null = null;
const listeners = new Set<() => void>();
const emit = () => { playing = active && !standby && !!audio && !audio.paused && !audio.ended && !userPaused; listeners.forEach(fn => fn()); };
function cancelFade() { cancelAnimationFrame(fadeFrame); clearTimeout(fadeTimer); }
function fade(media: HTMLMediaElement, to: number, done?: () => void, duration = 650) {
 cancelFade(); const start=media.volume,t0=performance.now();
 const step=()=>{if(audio!==media)return;const t=Math.min(1,(performance.now()-t0)/duration),smooth=t*t*(3-2*t);media.volume=start+(to-start)*smooth;if(t<1)fadeFrame=requestAnimationFrame(step);};
 fadeFrame=requestAnimationFrame(step);
 fadeTimer=setTimeout(()=>{cancelAnimationFrame(fadeFrame);if(audio===media){media.volume=to;done?.();}},duration);
}
const observed=new WeakSet<HTMLMediaElement>();
function observe(media:HTMLMediaElement){
 if(observed.has(media))return;observed.add(media);
 for(const event of ["play","pause","ended"])media.addEventListener(event,emit);
}
function createAudio() {
 const media=new Audio();media.crossOrigin="anonymous";
 media.style.display="none";document.body.appendChild(media);
 observe(media);
 return media;
}
async function playWithFade(media: HTMLMediaElement) {
 cancelFade(); media.volume=0;
 if(standby)media.muted=true;
 try {await media.play();if(audio===media&&!userPaused&&!standby){const duration=initialFadePending?5000:650;initialFadePending=false;fade(media,targetVolume,undefined,duration);}}
 catch {emit();}
}
function watchConnection(media:HTMLMediaElement){
 recovery?.stop();
 recovery=createLiveMediaRecovery({startupGraceMs:16000,media:()=>audio===media?media:null,wanted:()=>active&&!userPaused&&audio===media,reconnect:async()=>{
  if(engine){if(media.error)engine.recoverMediaError();else engine.startLoad(-1);}
  else media.load();
  await playWithFade(media);
 }});
}
/** Called inside the profile/visitor gesture before asynchronous station data arrives. */
function unlockTvRadio() {
 if(audio)return;
 audio=createAudio();audio.volume=0;
 audio.src="data:audio/wav;base64,UklGRiYAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQIAAAAAAA==";
 void audio.play().catch(()=>{});
}
function stopTvAudio() {
 if(!audio)return;
 generation++;recovery?.stop();recovery=null;cancelFade();engine?.destroy();engine=null;
 if(audio){audio.pause();audio.removeAttribute("src");audio.load();audio.remove();}
 audio=null;active=false;userPaused=false;owner="";emit();
}
/** Start once per station; a user's pause survives Home rerenders and navigation. */
async function ensureTvRadio(url:string, station:string) {
 url=url.trim();if(!url)return;
 if(active && sourceUrl.trim()===url){owner=station;return;}
 if(active)stopTvAudio();
 if(!audio)audio=createAudio();
 const media=audio,version=++generation;sourceUrl=url;owner=station;active=true;userPaused=false;targetVolume=savedVolume();media.muted=standby || savedMuted();watchConnection(media);emit();
 if(/\.m3u8(?:[?#]|$)/i.test(url)&&!media.canPlayType("application/vnd.apple.mpegurl")){
  const {default:Hls}=await import("hls.js");if(version!==generation)return;
  if(Hls.isSupported()){
   engine=new Hls({enableWorker:true,lowLatencyMode:false,maxBufferLength:15,maxMaxBufferLength:25,backBufferLength:5});engine.loadSource(url);engine.attachMedia(media);
   engine.on(Hls.Events.MANIFEST_PARSED,()=>{if(!userPaused&&audio===media)void playWithFade(media);});return;
  }
 }
 if(version!==generation)return;
 media.src=url;void playWithFade(media);
}
// Keep a single live radio connection in silent standby while watching video.
function setStandby(next:boolean){
 if(standby===next)return;
 standby=next;
 const media=audio;
 if(!media)return;
 cancelFade();
 if(next){media.muted=true;media.volume=0;}
 else {targetVolume=savedVolume();media.muted=savedMuted();if(!userPaused){if(media.paused)void playWithFade(media);else fade(media,targetVolume,undefined,250);}}
 emit();
}
function retainTvAudio(media:HTMLMediaElement,hls:Hls|null,pausedByUser:boolean,url?:string,station?:string) {
 // Transfer ownership of the live element itself. Recreating it reconnects the
 // stream, loses its buffered audio and can race the old recovery loop.
 if(audio!==media)stopTvAudio();else{recovery?.stop();cancelFade();}
 standby=false;sourceUrl=url || hls?.url || media.currentSrc || media.src;
 audio=media;engine=hls;media.style.display="none";if(media.parentNode!==document.body)document.body.appendChild(media);observe(media);active=true;userPaused=pausedByUser;owner=station||owner;
 targetVolume=savedVolume();watchConnection(media);emit();
}


 function takeTvAudio(url:string){
  if(!active||!audio)return null;
  if(sourceUrl.trim()!==url.trim()){stopTvAudio();return null;}
  generation++;recovery?.stop();recovery=null;cancelFade();standby=false;
  if(userPaused)audio.pause(); else if(audio.paused) void audio.play().catch(()=>{});
  audio.volume=savedVolume(); audio.muted=savedMuted();
  const transfer={media:audio,hls:engine,userPaused};
  audio=null;engine=null;active=false;playing=false;owner="";emit();
  return transfer;
 }
 return {setStandby,takeTvAudio,unlockTvRadio,stopTvAudio,ensureTvRadio,retainTvAudio,getMedia:()=>audio, getSyncClock:(station:string)=>{
  const routeStation=window.location.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if(!active||(owner.toLowerCase()!==station.toLowerCase()&&routeStation!==station.toLowerCase())||!engine||!audio||audio.paused||audio.ended||audio.seeking||audio.readyState<2)return null;
  try{const epoch=engine.playingDate?.getTime();return typeof epoch==="number"&&Number.isFinite(epoch)&&epoch>0?{source:engine,epoch}:null;}catch{return null;}
 },
  snapshot:()=>`${active}:${playing}`,
  subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
  state:()=>({active,playing}),
  toggle:()=>{
   if(!audio)return;const media=audio;
   if(media.paused||userPaused||media.muted){userPaused=false;media.muted=savedMuted();targetVolume=savedVolume();void playWithFade(media);}
   else{userPaused=true;emit();fade(media,0,()=>{media.pause();emit();});}
  },
 };
}
// Preserve a single owner through local module refreshes as well as route changes.
const scope=globalThis as typeof globalThis & {__nexoTvAudioController?:ReturnType<typeof createController>};
const controller=scope.__nexoTvAudioController ||= createController();
export const takeTvAudio=(url:string)=>controller.takeTvAudio(url);
export const unlockTvRadio=()=>controller.unlockTvRadio();
export const stopTvAudio=()=>controller.stopTvAudio();
export const ensureTvRadio=(url:string,station:string)=>controller.ensureTvRadio(url,station);
export const retainTvAudio=(media:HTMLMediaElement,hls:Hls|null,pausedByUser:boolean,url?:string,station?:string)=>controller.retainTvAudio(media,hls,pausedByUser,url,station);
export const setTvRadioStandby=(value:boolean)=>controller.setStandby(value);
export const getTvAudioMedia=()=>controller.getMedia();
export const getTvAudioSyncClock=(station:string)=>controller.getSyncClock?.(station)??null;
export function useTvAudio(){
 useSyncExternalStore(controller.subscribe,controller.snapshot);
 return {...controller.state(),toggle:controller.toggle};
}
