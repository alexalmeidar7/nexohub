import type { User } from "@supabase/supabase-js";
import { getPlayerSessionUserId } from "./playerSession";
export function tvWatchProfile(user: User | null, slug?: string | null) {
 const guest = new URLSearchParams(window.location.search).get("tvGuest") === "1";
 const activeUser = !guest && user?.id === getPlayerSessionUserId() ? user : null;
 let selected: {name?: string; avatar?: string | null} | null = null;
 try {
  if (slug && guest) selected=JSON.parse(sessionStorage.getItem(`nexohub_tv_guest_preview:${slug}`)||"null");
  else if(slug && activeUser) selected=JSON.parse(localStorage.getItem(`nexohub_tv_profile:${activeUser.id}:${slug}`)||"null");
 } catch {}
 const google=activeUser?.identities?.find(i=>i.provider==="google")?.identity_data;
 const name=google?.full_name || google?.name || activeUser?.user_metadata?.full_name || activeUser?.user_metadata?.name;
 const photo=google?.avatar_url || google?.picture || activeUser?.user_metadata?.avatar_url || activeUser?.user_metadata?.picture;
 return {user:activeUser, name: (typeof selected?.name==="string" && selected.name) || (typeof name==="string" && name) || activeUser?.email?.split("@")[0] || "Visitante", avatar: (typeof selected?.avatar==="string" && selected.avatar) || (typeof photo==="string" && photo) || null};
}
