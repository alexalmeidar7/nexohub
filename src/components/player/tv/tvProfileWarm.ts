import { fetchPlayerListenerProfile, type PlayerListenerProfile } from "@/lib/playerListenerProfile";
import type { User } from "@supabase/supabase-js";
const profiles = new Map<string,{value?:PlayerListenerProfile;pending?:Promise<PlayerListenerProfile>;at:number}>();
const key=(u:User,r:string)=>`${u.id}:${r}`;
export function peekTvProfile(u:User|null|undefined,r:string|null|undefined){if(!u||!r)return undefined;return profiles.get(key(u,r))?.value;}
export function warmTvProfile(u:User,r:string,name:string){const k=key(u,r),old=profiles.get(k);if(old?.pending)return old.pending;if(old?.value&&Date.now()-old.at<30000)return Promise.resolve(old.value);const item={value:old?.value,at:0,pending:undefined as Promise<PlayerListenerProfile>|undefined};const pending=fetchPlayerListenerProfile(u,r,name).then(value=>{item.value=value;item.at=Date.now();return value;}).finally(()=>{item.pending=undefined;});item.pending=pending;profiles.set(k,item);if(profiles.size>8){const first=profiles.keys().next().value;if(first&&first!==k)profiles.delete(first);}return pending;}
