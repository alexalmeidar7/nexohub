const { describe,it }=require("node:test");
const assert=require("node:assert/strict"),fs=require("node:fs"),os=require("node:os"),path=require("node:path");
const {readStationRole,writeStationRole}=require("./lan-role-preference.cjs");
describe("per station role",()=>{
 it("persists preference, never claims LAN connected, validates station",()=>{
   const root=fs.mkdtempSync(path.join(os.tmpdir(),"hmd-role-"));
   const id="7d634a30-12c8-4d76-a361-807581326172";
   try{
     assert.equal(readStationRole(root,id).selected,"principal");
     const state=writeStationRole(root,id,"secondary");
     assert.equal(state.selected,"secondary");assert.equal(state.effective,"cloud");assert.equal(state.lanActive,false);
     assert.equal(readStationRole(root,id).selected,"secondary");
     assert.throws(()=>writeStationRole(root,id,"other"));
     assert.throws(()=>readStationRole(root,"../danger"));
   }finally{fs.rmSync(root,{recursive:true,force:true});}
 });
});