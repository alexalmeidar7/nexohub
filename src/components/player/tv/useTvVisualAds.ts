import {useEffect,useRef,useState} from "react";
import {useCommercialCampaigns,pickAds} from "./OttCommercialSlot";
export type VisualAd="background_ads"|"cover_ads"|"naming_rights";
const ORDER:VisualAd[]=["background_ads","cover_ads","naming_rights"];
const DURATION:Record<VisualAd,number>={background_ads:15000,cover_ads:20000,naming_rights:15000};
export function useTvVisualAds(radioId:string|null|undefined,programId:string|null|undefined,enabled:boolean,key:string){
 const {rows}=useCommercialCampaigns(radioId);const rowsRef=useRef(rows);rowsRef.current=rows;
 const [active,setActive]=useState<VisualAd|null>(null);const cursor=useRef(0);
 useEffect(()=>{cursor.current=0},[radioId,key]);
 useEffect(()=>{setActive(null);if(!enabled)return;let cancelled=false;let timer:ReturnType<typeof setTimeout>;let preloader:HTMLImageElement|null=null;
 const rest=()=>{if(cancelled)return;setActive(null);timer=setTimeout(next,120000)};
 const next=()=>{if(cancelled)return;for(let i=0;i<ORDER.length;i++){const slot=ORDER[cursor.current++%ORDER.length];const item=pickAds(rowsRef.current,slot,programId);if(!item?.url)continue;
  const image=new Image();preloader=image;let done=false;const finish=(ok:boolean)=>{if(done||cancelled)return;done=true;clearTimeout(timer);if(!ok){rest();return}setActive(slot);timer=setTimeout(rest,DURATION[slot])};image.onload=()=>finish(true);image.onerror=()=>finish(false);timer=setTimeout(()=>finish(false),6000);image.src=item.url;return;}rest()};rest();return()=>{cancelled=true;clearTimeout(timer);if(preloader){preloader.onload=null;preloader.onerror=null}};
 },[enabled,radioId,programId,key]);return enabled?active:null;
}
export function usePauseAd(enabled:boolean){const [ready,setReady]=useState(false);useEffect(()=>{setReady(false);if(!enabled)return;const t=setTimeout(()=>setReady(true),5000);return()=>clearTimeout(t)},[enabled]);return enabled&&ready;}
export function useSplashAd(enabled:boolean,key:string){const [show,setShow]=useState(false);const shown=useRef("");useEffect(()=>{shown.current="";setShow(false)},[key]);useEffect(()=>{if(!enabled){setShow(false);return}if(shown.current===key)return;shown.current=key;setShow(true);const t=setTimeout(()=>setShow(false),3000);return()=>clearTimeout(t)},[enabled,key]);return show&&enabled;}
