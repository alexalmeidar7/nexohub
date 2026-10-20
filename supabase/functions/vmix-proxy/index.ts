import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

function isPrivateOrLocalUrl(rawUrl: string): boolean {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();

    if (
      hostname === "localhost" ||
      hostname === "::1" ||
      hostname.endsWith(".local") ||
      /^127\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^192\.168\./.test(hostname) ||
      /^169\.254\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const body = await req.json();
    const path = typeof body?.path === "string" ? body.path : "";
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";

    if (!path || !path.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'path' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    let settings: { vmix_url?: string | null; vmix_user?: string | null; vmix_pass?: string | null } | null = null;

    if (connectionId) {
      const { data: connection } = await supabase
        .from("vmix_connections")
        .select("url, username, password")
        .eq("user_id", userId)
        .eq("id", connectionId)
        .maybeSingle();

      if (connection) {
        settings = {
          vmix_url: connection.url,
          vmix_user: connection.username,
          vmix_pass: connection.password,
        };
      }
    }

    if (!settings) {
      const { data: fallbackSettings } = await supabase
        .from("user_settings")
        .select("vmix_url, vmix_user, vmix_pass")
        .eq("user_id", userId)
        .maybeSingle();
      settings = fallbackSettings;
    }

    const vmixBaseUrl = settings?.vmix_url;
    if (!vmixBaseUrl) {
      return new Response(
        JSON.stringify({ error: "vMix URL not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (isPrivateOrLocalUrl(vmixBaseUrl)) {
      return new Response(
        JSON.stringify({
          error:
            "URL local (192.168.x.x) inacessível pela nuvem. Soluções: 1) Acesse este painel via HTTP (não HTTPS) na mesma rede do vMix; 2) Configure port forwarding no roteador e use o IP público; 3) Use túnel HTTPS (ngrok/Cloudflare Tunnel).",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const targetUrl = vmixBaseUrl.replace(/\/+$/, "") + path;
    console.log(`Proxying request to: ${targetUrl}`);

    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (compatible; VmixProxy/1.0)",
      Accept: "application/xml, text/xml, text/html, */*",
    };

    const vmixUser = settings?.vmix_user;
    const vmixPass = settings?.vmix_pass;
    if (vmixUser) {
      const credentials = btoa(`${vmixUser}:${vmixPass || ""}`);
      fetchHeaders.Authorization = `Basic ${credentials}`;
    }

    const response = await fetch(targetUrl, {
      method: "GET",
      headers: fetchHeaders,
      signal: AbortSignal.timeout(15000),
    });

    const contentType = response.headers.get("content-type") || "text/plain";
    const responseBody = await response.text();

    return new Response(responseBody, {
      status: response.status,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
      },
    });
  } catch (error) {
    console.error("vmix-proxy error:", error);
    const message = error instanceof Error ? error.message : "Proxy error";
    const isTimeout = message.includes("timed out") || message.includes("timeout");

    return new Response(
      JSON.stringify({
        error: isTimeout
          ? "Timeout: não foi possível alcançar o vMix. Verifique se a URL é acessível externamente (redirecionamento de porta no roteador)."
          : message,
      }),
      { status: isTimeout ? 504 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
