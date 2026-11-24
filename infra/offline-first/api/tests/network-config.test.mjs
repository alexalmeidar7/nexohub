import test from "node:test";
import assert from "node:assert/strict";
import { resolveApiHost } from "../network-config.mjs";

test("defaults to IPv4 loopback", () => {
  assert.equal(resolveApiHost({}), "127.0.0.1");
});

test("accepts explicit IPv4 loopback", () => {
  assert.equal(resolveApiHost({ HOUSEMIX_API_HOST: "127.0.0.1" }), "127.0.0.1");
});

test("does not let HOUSEMIX_ALLOW_LAN bypass the hard stop", () => {
  for (const host of ["0.0.0.0", "192.168.1.20", "10.0.0.8", "203.0.113.10", "::"]) {
    assert.throws(
      () => resolveApiHost({ HOUSEMIX_API_HOST: host, HOUSEMIX_ALLOW_LAN: "true" }),
      /LAN binding is hard-disabled/
    );
  }
});

test("rejects LAN binding even when the opt-in flag is absent", () => {
  assert.throws(
    () => resolveApiHost({ HOUSEMIX_API_HOST: "192.168.0.10" }),
    /LAN binding is hard-disabled/
  );
});
