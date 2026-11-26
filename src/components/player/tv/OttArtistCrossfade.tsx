import { useEffect, useRef, useState } from "react";
import "./OttArtistCrossfade.css";

/** One atomic change of layers, keeping the previous decoded image underneath. */
export default function OttArtistCrossfade({ source }: { source?: string | null }) {
 const [layers,setLayers]=useState<{active:string|null;previous:string|null}>({active:null,previous:null});
 const activeRef=useRef<string|null>(null);
 useEffect(()=>{
  if(!source||source===activeRef.current)return;
  let cancelled=false;const image=new Image();image.decoding="async";
  let started=false;
  const reveal=async()=>{
   if(started||!image.naturalWidth)return;started=true;
   try{await image.decode?.();}catch{if(!image.naturalWidth)return;}
   if(cancelled)return;
   const previous=activeRef.current;activeRef.current=source;
   setLayers({active:source,previous});
  };
  image.onload=()=>{void reveal();};image.src=source;
  if(image.complete&&image.naturalWidth)void reveal();
  return()=>{cancelled=true;image.onload=null;};
 },[source]);
 useEffect(()=>{
  if(!layers.previous)return;
  const timer=setTimeout(()=>setLayers(current=>current.active===layers.active?{active:current.active,previous:null}:current),1650);
  return()=>clearTimeout(timer);
 },[layers.active,layers.previous]);
 return <div className="ott-artist-crossfade" aria-hidden="true">
  {layers.previous&&layers.previous!==layers.active&&<img key={layers.previous} className="ott-artist-crossfade-previous" src={layers.previous} alt="" decoding="async"/>}
  {layers.active&&<img key={layers.active} className="ott-artist-crossfade-current" src={layers.active} alt="" decoding="async"/>}
 </div>;
}
