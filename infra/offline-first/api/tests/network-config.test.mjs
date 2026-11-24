import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiHost, parseSubnet } from "../network-config.mjs";
const secure = { HOUSEMIX_ALLOW_LAN: "true", HOUSEMIX_API_TLS: "true", HOUSEMIX_TLS_CERT_FILE: "cert.pem", HOUSEMIX_TLS_KEY_FILE: "key.pem", HOUSEMIX_LAN_SUBNET: "192.168.1.0/24" };
test("defaults to loopback", () => assert.equal(resolveApiHost({}), "127.0.0.1"));
test("allows explicitly configured private TLS host", () => assert.equal(resolveApiHost({...secure, HOUSEMIX_API_HOST:"192.168.1.20"}), "192.168.1.20"));
test("rejects wildcard, public, outside subnet and missing TLS", () => {
  for(const host of ["0.0.0.0","203.0.113.10","192.168.2.20","::"])
    assert.throws(()=>resolveApiHost({...secure,HOUSEMIX_API_HOST:host}));
  assert.throws(()=>resolveApiHost({...secure,HOUSEMIX_API_HOST:"192.168.1.20",HOUSEMIX_API_TLS:"false"}));
});
test("subnet filters remote peers", () => {
  const allowed=parseSubnet("192.168.1.0/24");
  assert.equal(allowed("192.168.1.42"),true);
  assert.equal(allowed("::ffff:192.168.1.42"),true);
  assert.equal(allowed("192.168.2.42"),false);
  assert.throws(()=>parseSubnet("0.0.0.0/0"));
});
