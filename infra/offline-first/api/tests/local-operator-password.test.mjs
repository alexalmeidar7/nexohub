import test from "node:test";
import assert from "node:assert/strict";
import { hashOperatorPassword, verifyOperatorPassword, normalizeOperatorEmail } from "../local-operator-password.mjs";

test("offline credentials use salted scrypt and never keep a cleartext password", async () => {
  const pass = "RadioStrongPass!26";
  const a = await hashOperatorPassword(pass);
  const b = await hashOperatorPassword(pass);
  assert.notEqual(a, b, "independent salts");
  assert.ok(!a.includes(pass));
  assert.equal(await verifyOperatorPassword(pass, a), true);
  assert.equal(await verifyOperatorPassword("wrong password", a), false);
  assert.equal(await verifyOperatorPassword(pass, "bogus"), false);
});
test("operator emails are normalized and unsafe inputs rejected", async () => {
  assert.equal(normalizeOperatorEmail(" Positiva@Exemplo.Com.BR "), "positiva@exemplo.com.br");
  assert.throws(() => normalizeOperatorEmail("invalid"), /invalid_email/);
  await assert.rejects(hashOperatorPassword("12345"), /invalid_operator_password/);
});
