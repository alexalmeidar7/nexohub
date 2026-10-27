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

export { shouldRouteVmixThroughBridge } from "./vmix-url-routing.ts";
