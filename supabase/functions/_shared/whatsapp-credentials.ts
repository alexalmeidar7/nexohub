/** Encrypted per-emissora Meta business tokens. Never return the token to browsers. */
const VERSION = "v1";
const keyBytes = () => {
  const encoded = Deno.env.get("WHATSAPP_TOKEN_ENCRYPTION_KEY") || "";
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0)); }
  catch { throw new Error("whatsapp_encryption_unconfigured"); }
  if (bytes.length !== 32) throw new Error("whatsapp_encryption_unconfigured");
  return bytes;
};
async function key(): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", keyBytes(), "AES-GCM", false, ["encrypt", "decrypt"]);
}
function encode(bytes: Uint8Array) { return btoa(String.fromCharCode(...bytes)); }
function decode(input: string) { return Uint8Array.from(atob(input), c => c.charCodeAt(0)); }
export async function sealWhatsAppToken(token: string, pin?: string): Promise<string> {
  if (!token || token.length > 4096) throw new Error("invalid_business_token");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify({ access_token: token, pin: pin || null }));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), data));
  return [VERSION, encode(iv), encode(encrypted)].join(".");
}
export async function unsealWhatsAppToken(ciphertext: string): Promise<{access_token:string;pin:string|null}> {
  const parts = ciphertext?.split(".");
  if (!parts || parts.length !== 3 || parts[0] !== VERSION) throw new Error("unknown_token_format");
  const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(parts[1]) }, await key(), decode(parts[2]));
  const parsed = JSON.parse(new TextDecoder().decode(raw));
  if (typeof parsed?.access_token !== "string" || !parsed.access_token) throw new Error("invalid_encrypted_token");
  return parsed;
}
export async function loadStationWhatsAppToken(admin: any, ownerId: string): Promise<string> {
  const { data, error } = await admin.from("wa_private_credentials").select("token_ciphertext")
    .eq("user_id", ownerId).maybeSingle();
  if (error || !data?.token_ciphertext) throw new Error("station_whatsapp_not_connected");
  return (await unsealWhatsAppToken(data.token_ciphertext)).access_token;
}
