import { normalizeMusicText } from "./textEncoding";
// Only known, exact labels observed on this TV; never guess missing characters in other tracks.
const knownLabels: Record<string,string> = {"AT� QUANDO":"ATÉ QUANDO", "JO�O PAULO E DANIEL":"JOÃO PAULO E DANIEL"};
export function normalizeTvMusicText(value: string): string {
 const text=normalizeMusicText(value);
 const corrected=knownLabels[text.toUpperCase()];
 return corrected || text;
}
export function decodeTvMusicXml(bytes: ArrayBuffer, contentType = ""): string {
 const probe=new TextDecoder("windows-1252").decode(bytes.slice(0,512));
 const declared=probe.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i)?.[1] || contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
 const b=new Uint8Array(bytes);
 if ((b[0]===255&&b[1]===254)||(b[0]===254&&b[1]===255)) return new TextDecoder(b[0]===255?"utf-16le":"utf-16be").decode(bytes);
 try {return new TextDecoder("utf-8",{fatal:true}).decode(bytes);} catch {}
 if (declared) {try {return new TextDecoder(declared,{fatal:true}).decode(bytes);} catch {}}
 return new TextDecoder("windows-1252").decode(bytes);
}

// Replacement characters have lost information. Recover only from an unambiguous catalogue match.
const matchKey = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
export function matchesTvLabel(damaged: string, candidate: string): boolean {
 const a=Array.from(matchKey(damaged)), b=Array.from(matchKey(candidate));
 return a.length===b.length && a.every((c,i)=>c===b[i] || c==="�");
}
type TvCatalogTrack={title:string;artist:string;cover:string};
const tvCatalogCache=new Map<string,Promise<TvCatalogTrack|null>>();
export function resolveTvCatalogTrack(title:string,artist:string):Promise<TvCatalogTrack|null>{
 const key=JSON.stringify([title,artist]);
 const existing=tvCatalogCache.get(key); if(existing)return existing;
 const term=encodeURIComponent(`${artist} ${title}`.replace(/[^\s]*�[^\s]*/g," ").replace(/\s+/g," ").trim());
 const request=(async()=>{
  try {
   const response=await fetch(`https://itunes.apple.com/search?term=${term}&entity=song&limit=25&country=BR`,{signal:AbortSignal.timeout(3500)});
   if(!response.ok)return null; const data=await response.json();
   const matches=(Array.isArray(data.results)?data.results:[]).filter((r:any)=>typeof r.trackName==="string"&&typeof r.artistName==="string"&&matchesTvLabel(title,r.trackName)&&matchesTvLabel(artist,r.artistName));
   if(!matches.length)return null;
   const labels=new Set(matches.map((r:any)=>JSON.stringify([r.trackName.toLocaleUpperCase("pt-BR"),r.artistName.toLocaleUpperCase("pt-BR")])));
   if(labels.size!==1)return null; const r=matches[0];
   return {title:r.trackName,artist:r.artistName,cover:typeof r.artworkUrl100==="string"?r.artworkUrl100.replace("100x100","600x600"):""};
  } catch{return null;}
 })();
 tvCatalogCache.set(key,request); if(tvCatalogCache.size>100)tvCatalogCache.delete(tvCatalogCache.keys().next().value!);
 void request.then(result=>{if(!result)window.setTimeout(()=>{if(tvCatalogCache.get(key)===request)tvCatalogCache.delete(key);},30000);});
 return request;
}
