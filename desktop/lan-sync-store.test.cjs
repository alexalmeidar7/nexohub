"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),os=require("node:os"),path=require("node:path");
const {createLanSyncStore}=require("./lan-sync-store.cjs");
const station="12345678-1234-1234-1234-123456789abc";
test("queue and checkpoint survive reopening; failed page leaves state intact",async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"hm-lan-"));
 try{
  let s=createLanSyncStore(root,station);
  const event={aggregate_type:"program",aggregate_id:"1",operation:"upsert",payload:{name:"Test"},idempotency_key:"event-123"};
  await s.enqueue(event);await s.enqueue(event);
  s=createLanSyncStore(root,station);assert.equal((await s.pending()).length,1);
  await s.applyPage([event],"cursor1");
  await assert.rejects(s.applyPage([{...event,operation:"bad"}],"cursor2"));
  s=createLanSyncStore(root,station);assert.equal(await s.checkpoint(),"cursor1");assert.equal((await s.records())[0].payload.name,"Test");
  await s.acknowledge("event-123");await s.applyPage([{...event,operation:"delete"}],"cursor2");
  assert.deepEqual(await s.pending(),[]);assert.deepEqual(await s.records(),[]);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
