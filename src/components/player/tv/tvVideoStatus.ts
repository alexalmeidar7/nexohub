// Shared in-memory stream status; probes never start a second decoder.
import { useEffect, useState } from "react";
type Status = "live" | "offline" | "unknown";
type Channel = { id?: string; type?: string; active?: boolean; url?: string };
const states = new Map<string, {status: Status; checked: number}>();
const inflight = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();
const key = (id: string, url: string) => `${id}|${url}`;
export function rememberVideoStatus(id: string, url: string, status: Status) {
 if (!id || !url || status === "unknown") return;
 const k = key(id,url), prev = states.get(k);
 states.set(k,{status,checked:Date.now()});
 if (prev?.status !== status) listeners.forEach(fn=>fn());
}
export function readVideoStatus(id:string,url:string):Status { return states.get(key(id,url))?.status || "unknown"; }
export function useVideoStatusUpdates() {
 const [,setRevision]=useState(0);
 useEffect(()=>{const notify=()=>setRevision(v=>v+1);listeners.add(notify);notify();return()=>{listeners.delete(notify);};},[]);
}
async function inspectHls(url:string, signal:AbortSignal, depth=0):Promise<Status> {
 if(depth>2)return "unknown";
 const response=await fetch(url,{signal,cache:"no-store",credentials:"omit"});
 if(response.status===404||response.status===410)return "offline";
 if(!response.ok)return "unknown";
 const reader=response.body?.getReader();
 if(!reader)return "unknown";
 const decoder=new TextDecoder();let text="",size=0;
 try {while(size<131072){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;text+=decoder.decode(value,{stream:true});if(text.length>100&&!text.trimStart().startsWith("#EXTM3U"))return "unknown";}}finally{void reader.cancel().catch(()=>{});}
 if(!text.trimStart().startsWith("#EXTM3U"))return "unknown";
 if(/#EXT-X-ENDLIST/i.test(text))return "offline";
 const variant=text.match(/#EXT-X-STREAM-INF:[^\r\n]*\r?\n([^#\r\n][^\r\n]*)/i);
 if(variant)return inspectHls(new URL(variant[1].trim(),response.url||url).href,signal,depth+1);
 return /#EXTINF:/i.test(text)?"live":"unknown";
}
export function prepareVideoStatuses(channels:Channel[]):Promise<void> {
 return Promise.all(channels.filter(c=>c.type==="video_live"&&c.active!==false&&c.id&&c.url).map(c=>{
 const id=String(c.id),url=String(c.url),k=key(id,url);
 // YouTube embedding does not expose a reliable pre-playback live flag. Do not fake it.
 if(!/^https?:\/\//i.test(url)||!/\.m3u8(?:[?#]|$)/i.test(url))return Promise.resolve();
 if(Date.now()-(states.get(k)?.checked||0)<60000)return Promise.resolve();
 const pending=inflight.get(k);if(pending)return pending;
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3500);
 const task=inspectHls(url,controller.signal).then(status=>{if(status!=="unknown")rememberVideoStatus(id,url,status);}).catch(()=>{}).finally(()=>{clearTimeout(timer);inflight.delete(k);});
 inflight.set(k,task);return task;
 })).then(()=>{});
}
