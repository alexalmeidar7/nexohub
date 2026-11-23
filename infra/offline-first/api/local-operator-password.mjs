import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const PREFIX = "scrypt-v1";
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 };
const STRONG_PASSWORD_MIN = 10;
const STRONG_PASSWORD_MAX = 256;

export function normalizeOperatorEmail(raw) {
  if (typeof raw !== "string") throw new TypeError("invalid_email");
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError("invalid_email");
  }
  return email;
}

export async function hashOperatorPassword(password) {
  if (typeof password !== "string" ||
      password.length < STRONG_PASSWORD_MIN || password.length > STRONG_PASSWORD_MAX) {
    throw new TypeError("invalid_operator_password");
  }
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, 32, PARAMS);
  return `${PREFIX}:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyOperatorPassword(password, verifier) {
  if (typeof password !== "string" || password.length > STRONG_PASSWORD_MAX ||
      typeof verifier !== "string") return false;
  const match = /^scrypt-v1:([0-9a-f]{32}):([0-9a-f]{64})$/.exec(verifier);
  if (!match) return false;
  const expected = Buffer.from(match[2], "hex");
  const actual = await scrypt(password, Buffer.from(match[1], "hex"), 32, PARAMS);
  return timingSafeEqual(expected, actual);
}
