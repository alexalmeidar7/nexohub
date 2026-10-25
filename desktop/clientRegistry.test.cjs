const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createClient, listClients, registryPath, slugify } = require("./clientRegistry.cjs");
test("creates distinct client workspaces in local registry", () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"housemix-registry-"));
 try { assert.deepEqual(listClients(root),[]); createClient(root,"Rádio Positiva"); createClient(root,"Rádio Cidade"); const clients=listClients(root); assert.deepEqual(clients.map(x=>x.id),["radio-positiva","radio-cidade"]); assert.equal(new Set(clients.map(x=>x.id)).size,2); }
 finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test("rejects duplicate and invalid names", () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"housemix-registry-"));
 try { createClient(root,"Rádio Positiva"); assert.throws(()=>createClient(root,"Radio Positiva"),/Já existe/); assert.throws(()=>createClient(root,"!!!"),/inválido/); assert.throws(()=>createClient(root," "),/entre 1 e 80/); }
 finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test("normalizes accents and punctuation",()=>assert.equal(slugify(" Rádio Cultura FM! "),"radio-cultura-fm"));
test("stores registry outside per-client profile directories",()=>assert.equal(registryPath("C:/Users/Operator/AppData/Roaming"),path.join("C:/Users/Operator/AppData/Roaming","NexoBrasil","HouseMix","client-registry.json")));
