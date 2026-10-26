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
    const body = await req.json();
    const path = typeof body?.path === "string" ? body.path : "";
    const connectionId = typeof body?.connectionId === "string" ? body.connectionId : "";

    if (!path || !path.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'path' parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Keep proxy requests inside the vMix API path; reject traversal and encoded separators.
    const rawPath = path.split("?", 1)[0];
    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(rawPath);
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid path encoding" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (
      path.includes("\\") ||
      path.includes("#") ||
      /[\u0000-\u001f\u007f]/.test(path) ||
      /%(?:2f|5c|25(?:2e|2f|5c))/i.test(rawPath) ||
      decodedPath.split("/").some((segment) => segment === "." || segment === "..")
    ) {
      return new Response(
        JSON.stringify({ error: "Rejected: only normalized vMix /api/ paths are allowed." }),
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
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
      const { data: bridge, error: bridgeError } = await admin.from("vmix_bridge_devices")
        .select("id").eq("user_id", userId).eq("revoked", false)
        .gte("last_seen_at", new Date(Date.now() - 45000).toISOString())
        .order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
      if (bridgeError) throw bridgeError;
      if (!bridge) return new Response(JSON.stringify({ error: "NexoHub Bridge não conectado. Pareie o computador do estúdio primeiro." }), {
        status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

      const { data: job, error: queueError } = await admin.from("vmix_bridge_jobs").insert({
        device_id: bridge.id, user_id: userId, path, method: "GET", status: "pending",
      }).select("id").single();
      if (queueError || !job) throw queueError || new Error("Could not queue Bridge request");

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
        return new Response(JSON.stringify({ error: "Timeout aguardando resposta do vMix pelo NexoHub Bridge." }), {
          status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (completed.status !== "succeeded") {
        return new Response(JSON.stringify({ error: "O vMix não respondeu com sucesso pelo Bridge.", statusCode: completed.result_status, details: completed.result_body }), {
          status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const body = String(completed.result_body || "");
      const statusCode = Number(completed.result_status || 502);
      return new Response(body, { status: statusCode >= 200 && statusCode < 600 ? statusCode : 502, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } });
    }

    const baseUrl = new URL(vmixBaseUrl);
    const target = new URL(vmixBaseUrl.replace(/\/+$/, "") + path);
    if (target.origin !== baseUrl.origin || !target.pathname.startsWith("/api/")) {
      return new Response(
        JSON.stringify({ error: "Rejected: destination must remain within the configured vMix /api/ endpoint." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const targetUrl = target.toString();
    console.log("Proxying request to: " + targetUrl);

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
      redirect: "manual",
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
