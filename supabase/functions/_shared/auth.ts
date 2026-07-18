// Shared auth helper for edge functions.
// Verifies the incoming JWT (via Supabase getClaims) and returns
// either the caller's claims or a ready-to-return 401 Response.
//
// Usage:
//   const auth = await requireUser(req, corsHeaders);
//   if (auth instanceof Response) return auth;
//   const userId = auth.sub;

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export type CorsHeaders = Record<string, string>;

export async function requireUser(
  req: Request,
  corsHeaders: CorsHeaders,
): Promise<{ sub: string; email?: string; role?: string } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
  const token = authHeader.slice(7).trim();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return {
      sub: String(data.claims.sub),
      email: data.claims.email as string | undefined,
      role: data.claims.role as string | undefined,
    };
  } catch (_e) {
    return new Response(
      JSON.stringify({ ok: false, error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
}

// Block SSRF against internal/private/loopback/metadata addresses.
// Matches the check used in vmix-proxy.
export function isPrivateOrLocalUrl(input: string): boolean {
  try {
    const u = new URL(input);
    const host = u.hostname.toLowerCase();
    if (!host) return true;
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host === "0.0.0.0" || host === "::" || host === "[::]") return true;
    if (host === "::1" || host === "[::1]") return true;
    // AWS/GCP/Azure metadata
    if (host === "169.254.169.254" || host === "metadata.google.internal") return true;
    // IPv4 private ranges
    const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (m) {
      const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
      if (a === 10) return true;
      if (a === 127) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
      if (a === 0) return true;
    }
    // IPv6 unique local / link local
    if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
    return false;
  } catch {
    return true;
  }
}
