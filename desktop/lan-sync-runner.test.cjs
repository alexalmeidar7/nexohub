"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createLanSyncRunner}=require("./lan-sync-runner.cjs");
test("retry resumes from committed checkpoint and only acknowledges accepted writes",async()=>{
 let cursor=null, pending=[{idempotency_key:"stable-event"}],fail=true,applied=[];
 const client={identity:async()=>({device:{tenant_id:"station"}}),push:async()=>({accepted:true}),pull:async c=>c?{changes:[],has_more:false,checkpoint_cursor:c}:{changes:[{id:"1"}],has_more:false,checkpoint_cursor:"first"}};
 const store={pending:async()=>pending,acknowledge:async key=>{pending=pending.filter(e=>e.idempotency_key!==key)},checkpoint:async()=>cursor,applyPage:async(events,next)=>{if(fail)throw Error("disk failure");applied.push(...events);cursor=next;}};
 const runner=createLanSyncRunner({client,store,expectedTenantId:"station"});
 await assert.rejects(runner.run(),/disk failure/);assert.equal(cursor,null);assert.equal(pending.length,0);
 fail=false;await runner.run();await runner.run();assert.equal(cursor,"first");assert.equal(applied.length,1);
});
test("rejects mismatched station before reading or writing",async()=>{
 const runner=createLanSyncRunner({client:{identity:async()=>({device:{tenant_id:"other"}})},store:{},expectedTenantId:"station"});
 await assert.rejects(runner.run(),/tenant_mismatch/);
});
