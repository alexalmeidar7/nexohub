"use strict";
const {createLanClient}=require("./lan-sync-client.cjs");
const {createLanSyncStore}=require("./lan-sync-store.cjs");
const {createLanSyncRunner}=require("./lan-sync-runner.cjs");
// Explicitly configured lab runtime. No renderer receives the device key.
function createLanRuntime({root,stationId,tenantId,endpoint,deviceKey,ca,client,intervalMs=5000}){
 const store=createLanSyncStore(root,stationId);
 const transport=client||createLanClient({endpoint,deviceKey,ca});
 const runner=createLanSyncRunner({client:transport,store,expectedTenantId:tenantId});
 let timer=null,stopped=true,status="idle",inflight=null;
 function sync(){
  if(inflight)return inflight;
  inflight=runner.run().then(result=>{status=result.caughtUp?"connected":"syncing";return result;},error=>{status="disconnected";throw error;}).finally(()=>{inflight=null;});
  return inflight;
 }
 function schedule(){
  if(stopped)return;
  timer=setTimeout(async()=>{try{await sync();}catch{}finally{schedule();}},intervalMs);
  timer.unref?.();
 }
 return Object.freeze({
  start(){if(!stopped)return;stopped=false;void sync().catch(()=>{}).finally(schedule);},
  async stop(){stopped=true;clearTimeout(timer);try{await inflight;}catch{}},
  sync,
  status:()=>status,
  records:()=>store.records(),
  async enqueue(event){await store.enqueue(event);}
 });
}
module.exports={createLanRuntime};
