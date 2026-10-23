import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { isPrivateOrLocalUrl } from "../_shared/auth.ts";

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
    const { commands, connectionId } = await req.json();

    let settings: { vmix_url?: string | null; vmix_user?: string | null; vmix_pass?: string | null } | null = null;

    if (typeof connectionId === "string" && connectionId) {
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
    if (!commands || !Array.isArray(commands) || commands.length === 0) {
      return new Response(JSON.stringify({ error: "Missing 'commands' array" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (isPrivateOrLocalUrl(vmixBaseUrl)) {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: bridge, error: bridgeError } = await admin.from("vmix_bridge_devices")
        .select("id").eq("user_id", userId).eq("revoked", false)
        .gte("last_seen_at", new Date(Date.now() - 45000).toISOString())
        .order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
      if (bridgeError) throw bridgeError;
      if (!bridge) return new Response(JSON.stringify({ error: "NexoHub Bridge não conectado. Pareie o computador do estúdio primeiro." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const results: { fn: string; status: number; ok: boolean }[] = [];
      for (const cmd of commands) {
        const fn = typeof cmd?.fn === "string" ? cmd.fn : "";
        const input = typeof cmd?.input === "string" ? cmd.input : "";
        const value = cmd?.extraValue ? (cmd?.value ? `${cmd.value},${cmd.extraValue}` : cmd.extraValue) : (cmd?.value || "");
        if (!fn || /[^a-zA-Z0-9 _-]/.test(fn)) {
          results.push({ fn, status: 400, ok: false });
          continue;
        }
        const params = new URLSearchParams({ Function: fn });
        if (input) params.set("Input", String(input));
        if (value) params.set("Value", String(value));
        const { data: job, error: queueError } = await admin.from("vmix_bridge_jobs").insert({
          device_id: bridge.id, user_id: userId, path: `/api/?${params.toString()}`, method: "GET",
          status: "pending",
        }).select("id").single();
        if (queueError || !job) throw queueError || new Error("Could not queue Bridge command");

        let completed: any = null;
        const deadline = Date.now() + 12000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 250));
          const { data: current, error: readError } = await admin.from("vmix_bridge_jobs")
            .select("status,result_status,result_body").eq("id", job.id).eq("user_id", userId).maybeSingle();
          if (readError) throw readError;
          if (current && (current.status === "succeeded" || current.status === "failed")) { completed = current; break; }
        }
        if (!completed) {
          await admin.from("vmix_bridge_jobs").update({
            status: "failed", result_status: 504, result_body: "Timed out waiting for NexoHub Bridge.",
            completed_at: new Date().toISOString(),
          }).eq("id", job.id).eq("status", "pending");
          results.push({ fn, status: 504, ok: false });
        } else {
          results.push({ fn, status: Number(completed.result_status || 0), ok: completed.status === "succeeded" });
        }
        if (commands.indexOf(cmd) < commands.length - 1) await new Promise((resolve) => setTimeout(resolve, 400));
      }
      return new Response(JSON.stringify({ success: results.every((r) => r.ok), executed: results.length, results, via: "NexoHub Bridge" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
          redirect: "manual",
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
      JSON.stringify({ success: results.every((r) => r.ok), executed: results.length, results }),
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
