"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs/promises"),os=require("node:os"),path=require("node:path");
const {createLanRuntime}=require("./lan-runtime.cjs");
test("runtime preserves pending changes across a connection failure and retries",async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),"hm-runtime-"));
 try{
 let fail=true,received=[];
 const client={identity:async()=>{if(fail)throw Error("offline");return {device:{tenant_id:"tenant"}}},push:async e=>{received.push(e);return {accepted:true}},pull:async()=>({changes:[],has_more:false,checkpoint_cursor:null})};
 const r=createLanRuntime({root,stationId:"12345678-1234-1234-1234-123456789abc",tenantId:"tenant",client});
 await r.enqueue({aggregate_type:"program",aggregate_id:"1",operation:"upsert",payload:{name:"Test"},idempotency_key:"event-123"});
 await assert.rejects(r.sync(),/offline/);assert.equal(r.status(),"disconnected");
 fail=false;await r.sync();await r.sync();assert.equal(received.length,1);assert.equal(r.status(),"connected");
 await r.stop();
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
