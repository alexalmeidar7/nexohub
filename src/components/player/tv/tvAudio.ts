import { useSyncExternalStore } from "react";
import { createLiveMediaRecovery } from "@/lib/liveMediaRecovery";
import type Hls from "hls.js";
function createController() {
let audio: HTMLMediaElement | null = null;
let engine: Hls | null = null;
let active = false, playing = false, userPaused = false, owner = "";
let fadeFrame = 0, fadeTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0, targetVolume = 1, sourceUrl = "";
let recovery: ReturnType<typeof createLiveMediaRecovery> | null = null;
const listeners = new Set<() => void>();
const emit = () => { playing = active && !!audio && !audio.paused && !audio.ended && !userPaused; listeners.forEach(fn => fn()); };
function cancelFade() { cancelAnimationFrame(fadeFrame); clearTimeout(fadeTimer); }
function fade(media: HTMLMediaElement, to: number, done?: () => void) {
 cancelFade(); const start=media.volume,t0=performance.now(),duration=650;
 const step=()=>{if(audio!==media)return;const t=Math.min(1,(performance.now()-t0)/duration),smooth=t*t*(3-2*t);media.volume=start+(to-start)*smooth;if(t<1)fadeFrame=requestAnimationFrame(step);};
 fadeFrame=requestAnimationFrame(step);
 fadeTimer=setTimeout(()=>{cancelAnimationFrame(fadeFrame);if(audio===media){media.volume=to;done?.();}},duration);
}
const observed=new WeakSet<HTMLMediaElement>();
function observe(media:HTMLMediaElement){
 if(observed.has(media))return;observed.add(media);
 for(const event of ["play","pause","volumechange","ended"])media.addEventListener(event,emit);
}
function createAudio() {
 const media=new Audio();media.crossOrigin="anonymous";
 observe(media);
 return media;
}
async function playWithFade(media: HTMLMediaElement) {
 cancelFade(); media.volume=0;
 try {await media.play();if(audio===media&&!userPaused)fade(media,targetVolume);}
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
 if(audio){audio.pause();audio.removeAttribute("src");audio.load();}
 audio=null;active=false;userPaused=false;owner="";emit();
}
/** Start once per station; a user's pause survives Home rerenders and navigation. */
async function ensureTvRadio(url:string, station:string) {
 if(!url)return;
 if(active && owner===station && sourceUrl===url)return;
 if(active)stopTvAudio();
 if(!audio)audio=createAudio();
 const media=audio,version=++generation;sourceUrl=url;owner=station;active=true;userPaused=false;targetVolume=1;watchConnection(media);emit();
 if(/\.m3u8(?:[?#]|$)/i.test(url)&&!media.canPlayType("application/vnd.apple.mpegurl")){
  const {default:Hls}=await import("hls.js");if(version!==generation)return;
  if(Hls.isSupported()){
   engine=new Hls({enableWorker:true});engine.loadSource(url);engine.attachMedia(media);
   engine.on(Hls.Events.MANIFEST_PARSED,()=>{if(!userPaused&&audio===media)void playWithFade(media);});return;
  }
 }
 if(version!==generation)return;
 media.src=url;void playWithFade(media);
}
function retainTvAudio(media:HTMLMediaElement,hls:Hls|null,pausedByUser:boolean,url?:string) {
 // Transfer ownership of the live element itself. Recreating it reconnects the
 // stream, loses its buffered audio and can race the old recovery loop.
 if(audio!==media)stopTvAudio();else{recovery?.stop();cancelFade();}
 sourceUrl=url || hls?.url || media.currentSrc || media.src;
 audio=media;engine=hls;observe(media);active=true;userPaused=pausedByUser;
 targetVolume=media.volume||1;watchConnection(media);emit();
}


 function takeTvAudio(url:string){
  if(!active||!audio)return null;
  if(sourceUrl!==url){stopTvAudio();return null;}
  generation++;recovery?.stop();recovery=null;cancelFade();
  if(userPaused)audio.pause();
  audio.volume=targetVolume;
  const transfer={media:audio,hls:engine,userPaused};
  audio=null;engine=null;active=false;playing=false;owner="";emit();
  return transfer;
 }
 return {takeTvAudio,unlockTvRadio,stopTvAudio,ensureTvRadio,retainTvAudio,getMedia:()=>audio,
  snapshot:()=>`${active}:${playing}`,
  subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
  state:()=>({active,playing}),
  toggle:()=>{
   if(!audio)return;const media=audio;
   if(media.paused||userPaused||media.muted){userPaused=false;media.muted=false;void playWithFade(media);}
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
export const retainTvAudio=(media:HTMLMediaElement,hls:Hls|null,pausedByUser:boolean,url?:string)=>controller.retainTvAudio(media,hls,pausedByUser,url);
export const getTvAudioMedia=()=>controller.getMedia();
export function useTvAudio(){
 useSyncExternalStore(controller.subscribe,controller.snapshot);
 return {...controller.state(),toggle:controller.toggle};
}
