import {useEffect,useRef,useState,type RefObject} from "react";
// Nome das exportações preservado para compatibilidade com AudioPlayerScreen.
type Status = "loading"|"playing"|"paused"|"offline"|"blocked"|"error";
type YTPlayer = {playVideo:()=>void;pauseVideo:()=>void;mute:()=>void;unMute:()=>void;setVolume:(v:number)=>void;destroy:()=>void;getIframe:()=>HTMLIFrameElement;getVideoData?:()=>{isLive?:boolean};getCurrentTime?:()=>number;getPlayerState?:()=>number};
type YTApi = {Player:new(el:HTMLElement,opts:Record<string,unknown>)=>YTPlayer};
let loader:Promise<YTApi>|undefined;
const api=()=> (window as Window & {YT?:YTApi}).YT;
function loadPlayer(){
 const existing=api();if(existing?.Player)return Promise.resolve(existing);
 if(!loader)loader=new Promise<YTApi>((resolve,reject)=>{
  let script=document.querySelector<HTMLScriptElement>('script[src="https://www.youtube.com/iframe_api"]');
  if(!script){script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.async=true;document.head.appendChild(script);}
  const start=Date.now();const timer=window.setInterval(()=>{const yt=api();if(yt?.Player){clearInterval(timer);resolve(yt);}else if(Date.now()-start>15000){clearInterval(timer);reject(new Error("YouTube API timeout"));}},100);
 }).catch(e=>{loader=undefined;throw e;});return loader;
}
export function useTwitchCast(active:boolean,muted:boolean,volume:number,warm:boolean){
 const host=useRef<HTMLDivElement>(null),player=useRef<YTPlayer|null>(null),ready=useRef(false);
 const [status,setStatus]=useState<Status>("loading"),[attempt,retry]=useState(0);
 const [liveStatus,setLiveStatus]=useState<"live"|"offline"|"unknown">("unknown");
 const pausedByUser=useRef(false);const prefs=useRef({muted,volume});prefs.current={muted,volume};
 const apply=(p:YTPlayer)=>{p.setVolume(Math.round(Math.min(1,Math.max(0,prefs.current.volume))*100));if(prefs.current.muted)p.mute();else p.unMute();};
 useEffect(()=>{if(!warm)return;void loadPlayer().catch(()=>{});for(const href of ["https://www.youtube.com","https://i.ytimg.com"]){if(!document.head.querySelector(`link[rel="preconnect"][href="${href}"]`)){const link=document.createElement("link");link.rel="preconnect";link.href=href;document.head.appendChild(link);}}},[warm]);
 useEffect(()=>{
  if(!active)return;const el=host.current;if(!el)return;let alive=true;let p:YTPlayer|null=null;let lastTime=-1,lastProgress=Date.now(),lastRecovery=0,recoveries=0;ready.current=false;pausedByUser.current=false;setStatus("loading");
  const timeout=window.setTimeout(()=>{if(alive)setStatus(s=>s==="loading"?"error":s);},30000);
  const target=document.createElement("div");el.replaceChildren(target);
  loadPlayer().then(YT=>{if(!alive)return;
   p=new YT.Player(target,{width:"100%",height:"100%",videoId:"uPeZ68nIPUY",playerVars:{autoplay:1,controls:0,playsinline:1,rel:0,origin:window.location.origin,enablejsapi:1},events:{
    onReady:(event:{target:YTPlayer})=>{if(!alive)return;const instance=event.target;player.current=instance;ready.current=true;const frame=instance.getIframe();frame.tabIndex=-1;frame.setAttribute("allow","autoplay; encrypted-media; fullscreen");apply(instance);instance.playVideo();},
    onStateChange:(event:{data:number;target:YTPlayer})=>{if(!alive)return;switch(event.data){case 1:clearTimeout(timeout);lastProgress=Date.now();setStatus("playing");if(event.target.getVideoData?.()?.isLive===true)setLiveStatus("live");break;case 2:setStatus("paused");break;case 3:setStatus("loading");break;case 0:setStatus("paused");setLiveStatus("offline");break;}},
    onAutoplayBlocked:()=>{if(alive){clearTimeout(timeout);setStatus("blocked");}},
    onError:()=>{if(alive){clearTimeout(timeout);setStatus("error");}}
   }});player.current=p;
  }).catch(()=>{if(alive){clearTimeout(timeout);setStatus("error");}});
  const stop=()=>{try{p?.pauseVideo();}catch{}};
  const visibility=()=>{if(document.hidden){stop();return;}lastProgress=Date.now();if(!pausedByUser.current&&ready.current)try{p?.playVideo();}catch{}};
  const health=window.setInterval(()=>{
   if(!alive||!p||!ready.current||pausedByUser.current||document.hidden)return;
   try{const state=p.getPlayerState?.(),time=p.getCurrentTime?.();const now=Date.now();
    if(typeof time==="number"&&time!==lastTime){lastTime=time;lastProgress=now;recoveries=0;return;}
    if(state===0||state===-1)return;
    if(now-lastProgress<20000||now-lastRecovery<20000)return;
    lastRecovery=now;if(recoveries<2){recoveries++;p.playVideo();}else{setStatus("error");}
   }catch{}
  },3000);window.addEventListener("pagehide",stop);document.addEventListener("visibilitychange",visibility);
  return()=>{alive=false;clearInterval(health);clearTimeout(timeout);window.removeEventListener("pagehide",stop);document.removeEventListener("visibilitychange",visibility);stop();try{p?.destroy();}catch{}player.current=null;ready.current=false;el.replaceChildren();};
 },[active,attempt]);
 useEffect(()=>{if(ready.current&&player.current)try{apply(player.current);}catch{}},[muted,volume]);
 const toggle=()=>{const p=player.current;if(!p||!ready.current||status==="error"||status==="offline"){retry(x=>x+1);return;}try{if(status==="playing"){pausedByUser.current=true;p.pauseVideo();}else {pausedByUser.current=false;apply(p);p.playVideo();}}catch{retry(x=>x+1);}};
 return {host,status,toggle,liveStatus};
}
export function TwitchCastSurface({host,status}:{host:RefObject<HTMLDivElement>;status:Status}){
 return <><div ref={host} style={{position:"absolute",inset:0,background:"black",width:"100%",height:"100%",pointerEvents:status==="blocked"||status==="error"?"auto":"none",cursor:"none"}}/>{(status==="error"||status==="offline"||status==="blocked")&&<div style={{position:"absolute",top:"45%",left:"10%",right:"10%",textAlign:"center",color:"white",pointerEvents:"none"}}>{status==="blocked"?"Pressione Play para assistir":"YouTube indisponível. Pressione Play para tentar novamente."}</div>}</>;
}
