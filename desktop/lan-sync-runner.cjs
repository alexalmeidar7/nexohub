"use strict";
// Sequential, resumable transport. The supplied store must commit the page
// and checkpoint atomically; a failed apply never advances the cursor.
function createLanSyncRunner({client,store,expectedTenantId}) {
  if(!client||!store||!expectedTenantId) throw new Error("invalid_sync_configuration");
  let active=null;
  async function cycle(){
    const identity=await client.identity();
    if(identity?.device?.tenant_id!==expectedTenantId) throw new Error("lan_tenant_mismatch");
    const pending=await store.pending();
    for(const event of pending){
      const result=await client.push(event);
      if(result?.accepted!==true) throw new Error("lan_write_not_acknowledged");
      await store.acknowledge(event.idempotency_key);
    }
    let cursor=await store.checkpoint();
    for(let i=0;i<20;i++){
      const page=await client.pull(cursor,100);
      if(!Array.isArray(page?.changes)||typeof page.has_more!=="boolean") throw new Error("invalid_lan_page");
      const next=page.checkpoint_cursor;
      if(page.changes.length && (typeof next!=="string"||!next||next===cursor)) throw new Error("invalid_lan_checkpoint");
      if(page.has_more && (!page.changes.length||page.next_cursor!==next)) throw new Error("invalid_lan_pagination");
      if(page.changes.length) { await store.applyPage(page.changes,next);cursor=next; }
      if(!page.has_more)return {caughtUp:true};
    }
    return {caughtUp:false};
  }
  return {run(){
    if(!active) active=cycle().finally(()=>{active=null;});
    return active;
  }};
}
module.exports={createLanSyncRunner};
