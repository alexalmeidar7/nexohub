const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createClient, listClients, registryPath, slugify, clientWorkspacePath, provisionClientWorkspace } = require("./clientRegistry.cjs");
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

test("provisions independent database, backup, log and credential directories per client", () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"housemix-workspaces-"));
 try {
  createClient(root,"Rádio Positiva"); createClient(root,"Rádio Cidade");
  const a=provisionClientWorkspace(root,"radio-positiva"), b=provisionClientWorkspace(root,"radio-cidade");
  for (const key of ["database","backups","logs","credentials","config","runtime"]) {
   assert.ok(fs.statSync(a[key]).isDirectory()); assert.ok(fs.statSync(b[key]).isDirectory()); assert.notEqual(a[key],b[key]);
  }
  assert.notEqual(clientWorkspacePath(root,"radio-positiva"),clientWorkspacePath(root,"radio-cidade"));
  const marker=JSON.parse(fs.readFileSync(path.join(a.root,"workspace.json"),"utf8"));
  assert.equal(marker.clientId,"radio-positiva");
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
test("refuses a workspace marker belonging to another client", () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"housemix-workspaces-"));
 try {
  const a=provisionClientWorkspace(root,"radio-positiva");
  fs.writeFileSync(path.join(a.root,"workspace.json"),JSON.stringify({schemaVersion:1,clientId:"radio-cidade"}));
  assert.throws(()=>provisionClientWorkspace(root,"radio-positiva"),/não corresponde/);
 } finally { fs.rmSync(root,{recursive:true,force:true}); }
});
