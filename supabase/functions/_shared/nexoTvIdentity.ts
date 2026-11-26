import type { User } from "npm:@supabase/supabase-js@2.95.3";

export function verifiedGoogleIdentity(user: User) {
  const identity = user.identities?.find((candidate) => candidate.provider === "google");
  const data = identity?.identity_data;
  const email = user.email?.trim().toLowerCase();
  if (!identity || !data || !email || !user.email_confirmed_at ||
    data.email_verified !== true || typeof data.email !== "string" ||
    data.email.trim().toLowerCase() !== email) return null;
  const name = [data.full_name, data.name, data.given_name, email.split("@")[0]]
    .find((value) => typeof value === "string" && value.trim()) as string;
  const avatar = [data.picture, data.avatar_url]
    .find((value) => typeof value === "string" && /^https:\/\//i.test(value)) as string | undefined;
  return { email, name: name.trim().slice(0, 200), avatar: avatar ?? null, subject: identity.id };
}

export async function hashDeviceProof(proof: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(proof));
  return Array.from(new Uint8Array(bytes), (value) => value.toString(16).padStart(2, "0")).join("");
}
