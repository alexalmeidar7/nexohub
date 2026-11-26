import { playerSupabase } from "@/integrations/supabase/playerClient";
import { markPlayerSession } from "@/lib/playerSession";
import { hashTvPairSecret } from "@/lib/tvSecureHash";

export const PUBLIC_PAIR_ORIGIN = "https://housemix.nexobrasil.net";
export const pairingPath = (slug: string, code: string) => `${PUBLIC_PAIR_ORIGIN}/${encodeURIComponent(slug)}/pair?code=${encodeURIComponent(code)}`;

export function getTvPairSessionId(slug: string) {
  const key = `nexohub_tv_session_${slug}`;
  let id: string | null = null;
  try { id = localStorage.getItem(key); } catch { /* storage unavailable */ }
  if (!id) {
    id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)),b=>b.toString(16).padStart(2,"0")).join("");
    try { localStorage.setItem(key, id); } catch { /* storage unavailable */ }
  }
  return id;
}

export async function newDeviceProof(): Promise<{ secret: string; proofHash: string }> {
  if (!crypto?.getRandomValues) throw new Error("Dispositivo sem gerador criptográfico seguro.");
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const secret = Array.from(bytes, b => b.toString(16).padStart(2,"0")).join("");
  const proofHash = await hashTvPairSecret(secret);
  return { secret, proofHash };
}

export async function completeSecurePairing(args: { code: string; secret: string; tvSessionId: string; expectedUserId: string; slug: string }) {
  // The server must verify both device proof and a Google-authenticated mobile claim;
  // a user ID/code alone never authorizes logging in as that user.
  const { data, error } = await playerSupabase.functions.invoke("tv-pair-redeem", {
    body: { code: args.code, proof: args.secret, tvSessionId: args.tvSessionId },
  });
  if (error || !data?.ok || typeof data.token_hash !== "string") {
    throw new Error("A TV recebeu o pareamento, mas a sessão ainda não foi autorizada. Verifique a função tv-pair-redeem no Supabase.");
  }
  const { data: verified, error: verificationError } = await playerSupabase.auth.verifyOtp({
    token_hash: data.token_hash,
    type: "magiclink",
  });
  if (verificationError || verified.user?.id !== args.expectedUserId || !verified.session) {
    await playerSupabase.auth.signOut({ scope: "local" });
    throw new Error("A conta Google não pôde ser validada na televisão. Gere outro código.");
  }
  markPlayerSession(verified.user.id);
  try {
    localStorage.removeItem(`nexohub_tv_guest_${args.slug}`);
    localStorage.removeItem(`player-step-home:${args.slug}`);
    sessionStorage.removeItem(`nexohub_tv_guest_preview:${args.slug}`);
    localStorage.removeItem(`nexohub_tv_guest_preview:${args.slug}`);
  } catch { /* not needed for auth validation */ }
  return verified.user;
}
