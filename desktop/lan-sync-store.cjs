"use strict";
const fs=require("node:fs/promises"),path=require("node:path"),crypto=require("node:crypto");
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
function createLanSyncStore(root,stationId){
 if(!UUID.test(stationId||""))throw Error("invalid_station");
 const file=path.join(root,"lan-sync",stationId.toLowerCase()+".json");
 let tail=Promise.resolve();
 const run=fn=>{const job=tail.then(fn);tail=job.catch(()=>{});return job;};
 async function read(){
  try{const s=JSON.parse(await fs.readFile(file,"utf8"));if(s.version!==1||!Array.isArray(s.pending)||!Array.isArray(s.records)||!(s.cursor===null||typeof s.cursor==="string"))throw Error("invalid_sync_store");return s;}
  catch(e){if(e.code==="ENOENT")return {version:1,pending:[],records:[],cursor:null};throw e;}
 }
 async function save(s){
  await fs.mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+"."+crypto.randomUUID()+".tmp";
  try{const handle=await fs.open(temp,"wx",0o600);try{await handle.writeFile(JSON.stringify(s));await handle.sync();}finally{await handle.close();}await fs.rename(temp,file);}
  finally{await fs.rm(temp,{force:true});}
 }
 return {
  pending:()=>run(async()=>(await read()).pending),
  checkpoint:()=>run(async()=>(await read()).cursor),
  records:()=>run(async()=>(await read()).records),
  enqueue:event=>run(async()=>{
   if(!event||typeof event.idempotency_key!=="string"||!event.idempotency_key||!["upsert","delete"].includes(event.operation)||typeof event.aggregate_type!=="string"||typeof event.aggregate_id!=="string")throw Error("invalid_sync_event");
   const s=await read();const existing=s.pending.find(x=>x.idempotency_key===event.idempotency_key);
   if(existing){if(JSON.stringify(existing)!==JSON.stringify(event))throw Error("idempotency_conflict");return;}
   s.pending.push(event);await save(s);
  }),
  acknowledge:key=>run(async()=>{const s=await read();s.pending=s.pending.filter(x=>x.idempotency_key!==key);await save(s);}),
  applyPage:(events,cursor)=>run(async()=>{
   if(!Array.isArray(events)||typeof cursor!=="string"||!cursor)throw Error("invalid_sync_page");
   const s=await read();
   const rows=new Map(s.records.map(x=>[JSON.stringify([x.aggregate_type,x.aggregate_id]),x]));
   for(const e of events){
    if(!e||typeof e.aggregate_type!=="string"||typeof e.aggregate_id!=="string"||!["upsert","delete"].includes(e.operation))throw Error("invalid_sync_change");
    const key=JSON.stringify([e.aggregate_type,e.aggregate_id]);
    if(e.operation==="delete")rows.delete(key);
    else {if(!e.payload||typeof e.payload!=="object"||Array.isArray(e.payload))throw Error("invalid_sync_payload");rows.set(key,{aggregate_type:e.aggregate_type,aggregate_id:e.aggregate_id,payload:e.payload});}
   }
   s.records=[...rows.values()];s.cursor=cursor;await save(s);
  })
 };
}
module.exports={createLanSyncStore};
