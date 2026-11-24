import test from "node:test";
import assert from "node:assert/strict";
import { createLanPilotPolicy } from "../lan-pilot-policy.mjs";
const config = {host:"192.168.1.10",cidr:"192.168.1.0/24",tlsOptions:{cert:"fixture",key:"fixture",minVersion:"TLSv1.2"}};
test("limits peers to configured private subnet",()=>{
 const p=createLanPilotPolicy(config);
 assert.equal(p.allowsPeer("192.168.1.11"),true);
 for(const ip of ["192.168.2.11","8.8.8.8","192.168.1.0","192.168.1.255","::1",undefined]) assert.equal(p.allowsPeer(ip),false);
});
test("rejects wildcard, public, mismatched subnet and missing TLS",()=>{
 for(const patch of [{host:"0.0.0.0"},{host:"8.8.8.8"},{cidr:"192.168.2.0/24"},{cidr:"192.168.1.1/24"},{cidr:"192.168.0.0/8"},{tlsOptions:null}]) assert.throws(()=>createLanPilotPolicy({...config,...patch}));
});
