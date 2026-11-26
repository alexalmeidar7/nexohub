import {useEffect,useState} from "react";
import "./OttPresenterFadeV18.css";
export default function OttPresenterFadeV18({photos,rotate=true}:{photos:string[];rotate?:boolean}){
 const key=photos.filter(Boolean).join("\n");
 const [shown,setShown]=useState("");
 useEffect(()=>{const list=key.split("\n").filter(Boolean);if(!list.length){setShown("");return;}let alive=true;let timer:ReturnType<typeof setTimeout>;let index=0;
 const next=()=>{const url=list[index];const img=new Image();img.onload=()=>{if(!alive)return;setShown(url);if(rotate&&list.length>1){index=(index+1)%list.length;timer=setTimeout(next,6000);}};img.onerror=()=>{if(!alive)return;if(list.length>1&&rotate){index=(index+1)%list.length;timer=setTimeout(next,6000);}else setShown("");};img.src=url;};next();return()=>{alive=false;clearTimeout(timer);};},[key,rotate]);
 if(!shown||!key)return null;return <div className="ott-presenter-backdrop nexo-presenter-v18" aria-hidden="true"><img key={shown} src={shown} alt=""/></div>;
}
