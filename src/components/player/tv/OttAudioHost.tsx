import { useLayoutEffect, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import type Hls from "hls.js";
import { getTvAudioMedia, takeTvAudio } from "./tvAudio";

/** Own the DOM container, so React never replaces the live audio on handoff. */
export default function OttAudioHost({mediaRef,url,onAdopt}:{mediaRef:RefObject<HTMLAudioElement>;url?:string;onAdopt?:(hls:Hls|null,pausedByUser:boolean)=>void}){
 const host=useRef<HTMLDivElement>(null);
 const callback=useRef(onAdopt);callback.current=onAdopt;
 useLayoutEffect(()=>{
  const transfer=url?takeTvAudio(url):null;
  let media=mediaRef.current;
  if(transfer){
   if(media&&media!==transfer.media){media.pause();media.removeAttribute("src");media.load();media.remove();}
   media=transfer.media as HTMLAudioElement;
   media.dataset.tvResumeUrl=url;
   callback.current?.(transfer.hls,transfer.userPaused);
  }
  if(!media){media=new Audio();media.crossOrigin="anonymous";media.preload="none";}
  (mediaRef as MutableRefObject<HTMLAudioElement|null>).current=media;
  host.current?.appendChild(media);
 },[url,mediaRef]);
 useLayoutEffect(()=>()=>{
  const media = mediaRef.current;
  if (media && media !== getTvAudioMedia()) {
   media.pause();
   media.removeAttribute("src");
   media.load();
   media.remove();
  }
  (mediaRef as MutableRefObject<HTMLAudioElement|null>).current=null;
 },[mediaRef]);
 return <div ref={host} className="hidden" aria-hidden="true"/>;
}
