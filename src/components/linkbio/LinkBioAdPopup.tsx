import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeLinkBioUrl } from "@/lib/linkBio";
type Ad={id:string;image_url:string;link_url:string;visit:string};
export default function LinkBioAdPopup({owner}:{owner:string}){
 const [ad,setAd]=useState<Ad|null>(null),[loaded,setLoaded]=useState(false),[closed,setClosed]=useState(false);
 const viewed=useRef(false),clicked=useRef(false);
 const closeRef=useRef<HTMLButtonElement>(null);
 useEffect(()=>{let active=true;let previous="";try{previous=sessionStorage.getItem("linkbio-last-ad:"+owner)||"";}catch{}
 const q=new URLSearchParams({slug:owner,section:"linkbio_ad",previous});
 void supabase.functions.invoke("public-player-data?"+q.toString(),{method:"GET"}).then(({data,error})=>{if(!active||error||!data?.ad)return;const a=data.ad as Ad;if(!normalizeLinkBioUrl(a.image_url)||!normalizeLinkBioUrl(a.link_url))return;setAd(a);}).catch(()=>{});
 return()=>{active=false;};},[owner]);
 function track(event:"view"|"click"){if(!ad)return;const flag=event==="view"?viewed:clicked;if(flag.current)return;flag.current=true;const q=new URLSearchParams({slug:owner,section:"linkbio_ad_track",campaign:ad.id,visit:ad.visit,event});void supabase.functions.invoke("public-player-data?"+q.toString(),{method:"POST",body:{slug:owner,section:"linkbio_ad_track"}}).catch(()=>{});}
 useEffect(()=>{if(!ad||!loaded||closed)return;const listener=(e:KeyboardEvent)=>{if(e.key==="Escape")setClosed(true);};document.addEventListener("keydown",listener);closeRef.current?.focus({preventScroll:true});return()=>document.removeEventListener("keydown",listener);},[ad,loaded,closed]);
 useEffect(()=>{if(!ad||!loaded||closed)return;const show=()=>{if(document.visibilityState!=="visible")return;track("view");try{sessionStorage.setItem("linkbio-last-ad:"+owner,ad.id);}catch{}};show();document.addEventListener("visibilitychange",show);return()=>document.removeEventListener("visibilitychange",show);},[ad,loaded,closed,owner]);
 if(!ad||closed)return null;
 return createPortal(<div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none p-4" role="presentation"><style>{`@keyframes linkBioAdIn{from{opacity:0;transform:scale(.97)}to{opacity:1;transform:scale(1)}}@media(prefers-reduced-motion:reduce){.linkbio-ad-popup{animation:none!important}}`}</style><div role="dialog" aria-label="Publicidade" className="linkbio-ad-popup relative overflow-hidden rounded-[22px] pointer-events-auto" style={{width:"min(440px, calc(100vw - 32px), calc((100dvh - 32px) * 800 / 1050))",aspectRatio:"800 / 1050",visibility:loaded?"visible":"hidden",animation:loaded?"linkBioAdIn 220ms ease-out both":undefined}}><a href={normalizeLinkBioUrl(ad.link_url)} target="_blank" rel="noopener noreferrer" aria-label="Abrir anúncio" onClick={()=>track("click")} className="block h-full w-full"><img src={ad.image_url} alt="Publicidade" className="h-full w-full object-contain" onLoad={()=>setLoaded(true)} onError={()=>setClosed(true)}/></a><button ref={closeRef} type="button" aria-label="Fechar publicidade" onClick={()=>setClosed(true)} className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-white"><X size={20}/></button></div></div>,document.body);
}
