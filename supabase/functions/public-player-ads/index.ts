import {createClient} from "https://esm.sh/@supabase/supabase-js@2.49.4";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, apikey, x-client-info, content-type","Access-Control-Allow-Methods":"GET, OPTIONS"};
function reply(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":status===200?"public, max-age=60":"no-store"}})}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{headers:cors});
 if(req.method!=="GET")return reply({error:"method"},405);
 const id=new URL(req.url).searchParams.get("radio_id")||"";
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return reply({error:"radio_id"},400);
 const base=Deno.env.get("SUPABASE_URL")!;
 const db=createClient(base,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false}});
 const day=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 const {data,error}=await db.from("player_ads_campaigns").select("id,start_date,end_date,program_ids,media").eq("user_id",id).eq("active",true).is("deleted_at",null).lte("start_date",day).gte("end_date",day).order("id").limit(100);
 if(error)return reply({error:"unavailable"},503);
 const valid=(x:unknown)=>{try{return typeof x==="string"&&["http:","https:"].includes(new URL(x).protocol)}catch{return false}};
 const owned=(url:unknown)=>typeof url==="string"&&url.startsWith(base+"/storage/v1/object/public/comercial/"+id+"/player-ads/");
 const str=(v:unknown,n=500)=>typeof v==="string"?v.trim().slice(0,n):"";
 const duration=(v:unknown)=>Number.isFinite(Number(v))?Math.max(0,Math.min(3600,Number(v))):0;
 const clips=(v:unknown)=>Array.isArray(v)?v.filter(x=>owned(x?.url)).slice(0,30).map(x=>({id:str(x.id,100),url:x.url,duration:duration(x.duration)})):[];
 const campaigns=(data||[]).flatMap(c=>{
 const media=(Array.isArray(c.media)?c.media:[]).filter(m=>["home_banner","cover_ads","background_ads","naming_rights","chat_ads","poll_ads","history_ads","weather_ads","lyrics_ads","splash_sponsor","pause_ads","preroll_audio","preroll_video","smart_break_audio","smart_break_video"].includes(m?.placement)&&owned(m.url)&&!(m.placement==="smart_break_video"&&m.categoryKind==="sbs")).slice(0,15).map(m=>({placement:m.placement,url:m.url,backgroundUrl:m.placement==="preroll_audio"&&typeof m.backgroundUrl==="string"&&m.backgroundUrl.startsWith(base+"/storage/v1/object/public/comercial/"+id+"/player-ads/")?m.backgroundUrl:undefined,order:Number.isFinite(Number(m.order))?Number(m.order):0,duration:Number.isFinite(Number(m.duration))?Math.max(0,Math.min(3600,Number(m.duration))):0,link:valid(m.link)?m.link:"",clickable:m.clickable===true&&valid(m.link),...(m.placement==="smart_break_video"?{categoryId:str(m.categoryId,100),categoryName:str(m.categoryName,100),categoryKind:str(m.categoryKind,20),song:str(m.song),artist:str(m.artist),artistImage:valid(m.artistImage)?m.artistImage:"",productDescription:str(m.productDescription,2000),productPrice:str(m.productPrice,100),buttonLabel:str(m.buttonLabel,100)}:{})}));
 const sbs=(Array.isArray(c.media)?c.media:[]).filter(m=>m?.placement==="smart_break_video"&&m.categoryKind==="sbs");
 const smartBreakSbs={entry:sbs.flatMap(m=>clips(m.sbsEntry)).slice(0,30),exit:sbs.flatMap(m=>clips(m.sbsExit)).slice(0,30)};
 return media.length||smartBreakSbs.entry.length||smartBreakSbs.exit.length?[{id:c.id,start_date:c.start_date,end_date:c.end_date,program_ids:c.program_ids,media,smartBreakSbs}]:[];
 });
 return reply({campaigns});
});