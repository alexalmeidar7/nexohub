import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { isPrivateOrLocalUrl } from "../_shared/auth.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const { commands } = await req.json();

    if (!commands || !Array.isArray(commands) || commands.length === 0) {
      return new Response(
        JSON.stringify({ error: "Missing 'commands' array" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fetchHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (compatible; VmixProxy/1.0)",
      Accept: "application/xml, text/xml, text/html, */*",
    };

    if (settings?.vmix_user) {
      const credentials = btoa(`${settings.vmix_user}:${settings.vmix_pass || ""}`);
      fetchHeaders.Authorization = `Basic ${credentials}`;
    }

    const baseUrl = vmixBaseUrl.replace(/\/+$/, "");
    const results: { fn: string; status: number; ok: boolean }[] = [];

    for (const cmd of commands) {
      const fn = cmd.fn || "";
      const input = cmd.input || "";
      const value = cmd.extraValue ? (cmd.value ? `${cmd.value},${cmd.extraValue}` : cmd.extraValue) : (cmd.value || "");

      let path = `/api/?Function=${encodeURIComponent(fn)}`;
      if (input) path += `&Input=${encodeURIComponent(input)}`;
      if (value) path += `&Value=${encodeURIComponent(value)}`;

      const targetUrl = baseUrl + path;
      console.log(`Executing: ${targetUrl}`);

      try {
        const response = await fetch(targetUrl, {
          method: "GET",
          headers: fetchHeaders,
          signal: AbortSignal.timeout(10000),
        });
        results.push({ fn, status: response.status, ok: response.ok });
      } catch (err) {
        console.error(`Command ${fn} failed:`, err);
        results.push({ fn, status: 0, ok: false });
      }

      // 400ms delay between commands for stability
      if (commands.indexOf(cmd) < commands.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }

    return new Response(
      JSON.stringify({ success: true, executed: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("execute-vmix-commands error:", error);
    const message = error instanceof Error ? error.message : "Server error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
