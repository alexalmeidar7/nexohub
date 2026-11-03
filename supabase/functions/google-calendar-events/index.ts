import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
        headers: corsHeaders,
      });
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: corsHeaders,
      });
    }

    const userId = claimsData.claims.sub;
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from("google_calendar_tokens")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (tokenError || !tokenRow) {
      return new Response(JSON.stringify({ connected: false, events: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let accessToken = tokenRow.access_token;

    if (new Date(tokenRow.token_expiry) <= new Date()) {
      const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
          client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
          refresh_token: tokenRow.refresh_token,
          grant_type: "refresh_token",
        }),
      });

      const refreshData = await refreshRes.json();
      if (!refreshRes.ok || !refreshData.access_token) {
        await supabaseAdmin
          .from("google_calendar_tokens")
          .delete()
          .eq("user_id", userId);

        return new Response(
          JSON.stringify({ connected: false, events: [], error: "Token expirado; conecte novamente." }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      accessToken = refreshData.access_token;
      const newExpiry = new Date(Date.now() + Number(refreshData.expires_in || 3600) * 1000).toISOString();

      await supabaseAdmin
        .from("google_calendar_tokens")
        .update({ access_token: accessToken, token_expiry: newExpiry })
        .eq("user_id", userId);
    }

    const url = new URL(req.url);
    const timeMin = url.searchParams.get("timeMin") || new Date().toISOString();
    const timeMax =
      url.searchParams.get("timeMax") ||
      new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const minDate = new Date(timeMin);
    const maxDate = new Date(timeMax);
    if (!Number.isFinite(minDate.getTime()) || !Number.isFinite(maxDate.getTime()) || minDate >= maxDate) {
      return new Response(
        JSON.stringify({ connected: true, events: [], error: "Intervalo de datas inválido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Paginate Google Calendar results so events after the first page are not silently omitted.
    const items: any[] = [];
    let pageToken: string | undefined;
    let pageCount = 0;

    do {
      const calendarParams = new URLSearchParams({
        timeMin: minDate.toISOString(),
        timeMax: maxDate.toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
      });
      if (pageToken) calendarParams.set("pageToken", pageToken);

      const calRes = await fetch(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events?" + calendarParams.toString(),
        { headers: { Authorization: "Bearer " + accessToken } }
      );
      const calData = await calRes.json();

      if (!calRes.ok) {
        console.error("Google Calendar API error status:", calRes.status);
        return new Response(
          JSON.stringify({ connected: true, events: [], error: "Não foi possível consultar os eventos do Google Agenda." }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      items.push(...(calData.items || []));
      pageToken = calData.nextPageToken || undefined;
      pageCount += 1;
    } while (pageToken && pageCount < 20);

    if (pageToken) {
      return new Response(
        JSON.stringify({ connected: true, events: [], error: "Muitos eventos no período. Reduza o intervalo e tente novamente." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const events = items.map((item: any) => ({
      id: item.id,
      summary: item.summary || "(Sem título)",
      description: item.description || "",
      location: item.location || "",
      start: item.start?.dateTime || item.start?.date || "",
      end: item.end?.dateTime || item.end?.date || "",
      allDay: Boolean(item.start?.date && !item.start?.dateTime),
      htmlLink: item.htmlLink || "",
    }));

    return new Response(JSON.stringify({ connected: true, events }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Google Calendar events failed:", err);
    return new Response(JSON.stringify({ error: "Não foi possível consultar o Google Agenda." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
