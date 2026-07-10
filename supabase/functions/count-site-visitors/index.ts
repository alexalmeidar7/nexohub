// Reads Google Analytics 4 Realtime API "activeUsers" metric.
// Requires two secrets:
//   GA4_PROPERTY_ID          -> the numeric GA4 property ID (e.g. "123456789")
//   GA4_SERVICE_ACCOUNT_JSON -> the full JSON key of a service account that
//                               has "Viewer" access to the GA4 property.
// The service account email must be added to the GA4 property > Property Access.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ---- JWT + OAuth2 access token (Service Account) ----
function b64url(bytes: Uint8Array): string {
  let s = btoa(String.fromCharCode(...bytes));
  return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlStr(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

function pemToDer(pem: string): ArrayBuffer {
  const clean = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(clean);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

let cachedToken: { token: string; expires: number } | null = null;

async function getAccessToken(sa: any): Promise<string> {
  if (cachedToken && cachedToken.expires - 60 > Math.floor(Date.now() / 1000)) {
    return cachedToken.token;
  }
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };
  const header = { alg: "RS256", typ: "JWT" };
  const unsigned = `${b64urlStr(JSON.stringify(header))}.${b64urlStr(JSON.stringify(claim))}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const jwt = `${unsigned}.${b64url(sig)}`;

  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const body = await resp.json();
  if (!resp.ok) throw new Error(`token http ${resp.status}: ${JSON.stringify(body)}`);
  cachedToken = { token: body.access_token, expires: now + Number(body.expires_in || 3600) };
  return cachedToken.token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const debug: string[] = [];

    const propertyId = Deno.env.get("GA4_PROPERTY_ID");
    const saRaw = Deno.env.get("GA4_SERVICE_ACCOUNT_JSON");
    if (!propertyId || !saRaw) {
      return new Response(
        JSON.stringify({
          ok: false,
          activeUsers: null,
          error: "GA4_PROPERTY_ID or GA4_SERVICE_ACCOUNT_JSON not configured",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let sa: any;
    try {
      sa = JSON.parse(saRaw);
    } catch (e) {
      return new Response(
        JSON.stringify({ ok: false, activeUsers: null, error: "invalid service-account JSON" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = await getAccessToken(sa);
    debug.push("token ok");

    const r = await fetch(
      `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ metrics: [{ name: "activeUsers" }] }),
      },
    );
    const j = await r.json();
    if (!r.ok) {
      debug.push(`ga http ${r.status}`);
      return new Response(
        JSON.stringify({
          ok: false,
          activeUsers: null,
          error: j?.error?.message || `GA http ${r.status}`,
          debug: body?.debug ? debug : undefined,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const value = Number(j?.rows?.[0]?.metricValues?.[0]?.value ?? 0);
    debug.push(`activeUsers=${value}`);

    return new Response(
      JSON.stringify({
        ok: true,
        activeUsers: value,
        debug: body?.debug ? debug : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, activeUsers: null, error: String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
