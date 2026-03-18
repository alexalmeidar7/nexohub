import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

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
    return new Response(null, { headers: corsHeaders });
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

    const { data: settings } = await supabase
      .from("user_settings")
      .select("vmix_url, vmix_user, vmix_pass")
      .eq("user_id", userId)
      .maybeSingle();

    const vmixBaseUrl = settings?.vmix_url;
    if (!vmixBaseUrl) {
      return new Response(
        JSON.stringify({ error: "vMix URL not configured" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Allow local IPs — the proxy will attempt the connection and timeout if unreachable

    const { path } = await req.json();

    if (!path || typeof path !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing 'path' parameter" }),
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
    const body = await response.text();

    return new Response(body, {
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
