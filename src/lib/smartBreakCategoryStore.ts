import {supabase} from '@/integrations/supabase/client';
import {CATEGORY_KEY,categoriesFrom,changeCategory,dashboardObject,type SmartCategory} from './smartBreakCategories';
export async function loadSmartCategories(userId:string){
 const {data,error}=await supabase.from('user_settings').select('dashboard_items').eq('user_id',userId).maybeSingle();
 if(error)throw error;
 return categoriesFrom(data?.dashboard_items);
}
// Retry against the newest settings snapshot. Never overwrite the live music/dashboard data with a stale snapshot.
export async function saveSmartCategory(userId:string,category:SmartCategory):Promise<SmartCategory[]>{
 for(let attempt=0;attempt<5;attempt++){
  if(attempt)await new Promise(r=>setTimeout(r,100*attempt));
  const {data,error}=await supabase.from('user_settings').select('dashboard_items,updated_at').eq('user_id',userId).maybeSingle();
  if(error)throw error;
  const next=changeCategory(categoriesFrom(data?.dashboard_items),category);
  const dashboard_items={...dashboardObject(data?.dashboard_items),[CATEGORY_KEY]:next} as any;
  const updated_at=new Date().toISOString();
  if(!data){
   const result=await supabase.from('user_settings').insert({user_id:userId,dashboard_items,updated_at} as any);
   if(!result.error)return next;
   if(result.error.code!=='23505')throw result.error;
   continue;
  }
  let q=supabase.from('user_settings').update({dashboard_items,updated_at}).eq('user_id',userId);
  q=data.updated_at?q.eq('updated_at',data.updated_at):q.is('updated_at',null);
  const result=await q.select('user_id');
  if(result.error)throw result.error;
  if(result.data?.length)return next;
 }
 throw Error('As configurações foram atualizadas em outro dispositivo. Tente novamente.');
}
