import { useEffect, useRef, useState } from "react";
import { Music2 } from "lucide-react";
import { fetchTrackCover, getTrackCoverSync } from "@/lib/musicCoverResolver";
import { fetchArtistImageCached, getArtistImageSync } from "@/lib/artistImageCache";

type Props = { artist:string; title:string; stored?:string|null; loadCover?:(artist:string,title:string)=>Promise<string|undefined>; onResolved?:(url:string)=>void };
const unique = (urls:(string|null|undefined)[]) => [...new Set(urls.filter((url):url is string=>typeof url==="string" && /^(https?:\/\/|\/[^/]|data:image\/)/i.test(url.trim())).map(url=>url.trim()))];
const cache = new Map<string,{urls:string[];expires:number}>();
const pending = new Map<string,Promise<string[]>>();
const keyOf = (artist:string,title:string)=>JSON.stringify([artist.trim().toLowerCase(),title.trim().toLowerCase()]);
async function resolve(artist:string,title:string,loader:Props["loadCover"]):Promise<string[]> {
 const key=keyOf(artist,title), old=cache.get(key);
 if(old && old.expires>Date.now())return old.urls;
 const existing=pending.get(key);if(existing)return existing;
 const task=(async()=>{
   const track=await fetchTrackCover(title,artist).catch(()=>null);
   // The shared resolver uses sanitized iTunes search and Deezer artist fallback.
   const alternate=!track && loader ? await Promise.resolve().then(()=>loader(artist,title)).catch(()=>null):null;
   const artistImage=getArtistImageSync(artist)||await fetchArtistImageCached(artist).catch(()=>null);
   const urls=unique([track,alternate,artistImage]);
   if(cache.size>=250)cache.delete(cache.keys().next().value!);
   cache.set(key,{urls,expires:Date.now()+(urls.length?30*60_000:60_000)});
   return urls;
 })().finally(()=>pending.delete(key));pending.set(key,task);return task;
}
export default function NexoHistoryCover({artist,title,stored,loadCover,onResolved}:Props){
 const [resolved,setResolved]=useState<string[]>([]),[failed,setFailed]=useState<string[]>([]),[pendingCover,setPendingCover]=useState(true),[retry,setRetry]=useState(0);
 const loader=useRef(loadCover);loader.current=loadCover;
 const cached=cache.get(keyOf(artist,title));
 const immediate=unique([stored,getTrackCoverSync(title,artist),...(cached&&cached.expires>Date.now()?cached.urls:[])]);
 const candidates=unique([...immediate,...resolved]);
 const url=candidates.find(candidate=>!failed.includes(candidate));
 useEffect(()=>{
  if(url){setPendingCover(false);return;}
  let alive=true;setPendingCover(true);
  void resolve(artist,title,loader.current).then(urls=>{if(alive)setResolved(urls);}).catch(()=>{}).finally(()=>{if(alive)setPendingCover(false);});
  return()=>{alive=false};
 },[artist,title,url,retry]);
 // Retry only when the screen is still on this track and providers returned nothing.
 useEffect(()=>{if(url||pendingCover)return;const timer=window.setTimeout(()=>{setFailed([]);setRetry(v=>v+1);},60_000);return()=>window.clearTimeout(timer);},[url,pendingCover,retry]);
 return url?<img key={url} className="nexo-lote16-history-image" src={url} alt={`Capa de ${title}`} decoding="async" onLoad={()=>onResolved?.(url)} onError={()=>setFailed(old=>old.includes(url)?old:[...old,url])}/>:pendingCover?<span className="nexo-lote16-history-loading" role="status" aria-label="Carregando capa"/>:<Music2 aria-hidden="true" strokeWidth={1.5}/>;
}
