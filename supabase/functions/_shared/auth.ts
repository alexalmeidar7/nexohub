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
    if ((u.protocol !== "http:" && u.protocol !== "https:") || u.username || u.password) return true;
    let host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (!host) return true;

    if (
      host === "localhost" || host.endsWith(".localhost") ||
      host.endsWith(".local") || host.endsWith(".internal") ||
      host === "metadata.google.internal" || host === "metadata" ||
      host === "0.0.0.0" || host === "::" || host === "::1"
    ) return true;

    // Block IPv4-mapped IPv6 rather than risk bypassing IPv4 private-range checks.
    if (host.startsWith("::ffff:")) return true;

    // IPv6 local, link-local, multicast, and unique-local ranges.
    if (/^(fc|fd)/i.test(host) || /^fe[89ab]/i.test(host) || /^ff/i.test(host)) return true;

    // IPv4 private, loopback, link-local, carrier-grade NAT, and reserved ranges.
    const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (match) {
      const octets = match.slice(1).map(Number);
      if (octets.some((n) => n < 0 || n > 255)) return true;
      const [a, b, c] = octets;
      if (a === 0 || a === 10 || a === 127 || a >= 224) return true;
      if (a === 169 && b === 254) return true;
      if (a === 172 && b >= 16 && b <= 31) return true;
      if (a === 192 && b === 168) return true;
      if (a === 100 && b >= 64 && b <= 127) return true;
      if (a === 192 && b === 0 && c === 0) return true;
      if (a === 198 && (b === 18 || b === 19)) return true;
      if (a === 192 && b === 0 && c === 2) return true;
      if (a === 198 && b === 51 && c === 100) return true;
      if (a === 203 && b === 0 && c === 113) return true;
    }
    return false;
  } catch {
    return true;
  }
}