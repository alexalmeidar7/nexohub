"use strict";
const test=require("node:test"), assert=require("node:assert/strict"), {EventEmitter}=require("node:events");
const {createLanClient}=require("./lan-sync-client.cjs");
const config={endpoint:"https://192.168.1.10:8787/",deviceKey:"a".repeat(40),ca:"test-ca"};
test("rejects insecure and public endpoints and missing CA",()=>{
 for(const patch of [{endpoint:"http://192.168.1.10/"},{endpoint:"https://8.8.8.8/"},{ca:null},{deviceKey:"short"}]) assert.throws(()=>createLanClient({...config,...patch}));
});
test("native client sends authenticated, bounded requests and validates TLS",async()=>{
 const seen=[];
 const request=(url,opts,cb)=>{
  const req=new EventEmitter(); req.destroy=e=>req.emit("error",e);
  req.end=body=>{
   seen.push({url,opts,body});
   const res=new EventEmitter(); res.statusCode=200; res.resume=()=>{};
   cb(res); res.emit("data",Buffer.from('{"ok":true}'));res.emit("end");req.emit("close");
  };return req;
 };
 const c=createLanClient({...config,request});
 await c.identity();await c.push({idempotency_key:"test-key"});await c.pull("checkpoint");
 assert.equal(seen[0].opts.rejectUnauthorized,true);
 assert.equal(seen[0].opts.ca,"test-ca");
 assert.equal(seen[0].opts.headers.authorization,"Bearer "+config.deviceKey);
 assert.equal(seen[1].url.pathname,"/v1/sync/outbox");
 assert.equal(seen[2].url.searchParams.get("cursor"),"checkpoint");
 assert.throws(()=>c.pull(null,251));
});
