// Player heartbeat + live count.
// POST { userId, sessionId }        -> upserts last_seen (returns { ok })
// POST { userId, count: true }      -> returns { ok, activeUsers } counting
//                                      distinct sessions seen in the last 45s.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ACTIVE_WINDOW_SEC = 45;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supaUrl = Deno.env.get("SUPABASE_URL");
  const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supaUrl || !svcKey) {
    return new Response(JSON.stringify({ ok: false, error: "server not configured" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const restHeaders = {
    apikey: svcKey,
    Authorization: `Bearer ${svcKey}`,
    "Content-Type": "application/json",
  };

  try {
    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" && body.userId.trim() ? body.userId.trim() : null;
    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "missing userId" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Count mode
    if (body?.count === true) {
      const cutoff = new Date(Date.now() - ACTIVE_WINDOW_SEC * 1000).toISOString();
      const r = await fetch(
        `${supaUrl}/rest/v1/player_heartbeats?master_user_id=eq.${userId}&last_seen=gte.${cutoff}&select=session_id`,
        { headers: { ...restHeaders, Prefer: "count=exact" } },
      );
      if (!r.ok) {
        const t = await r.text();
        return new Response(JSON.stringify({ ok: false, error: `count http ${r.status}: ${t}` }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // PostgREST returns count in Content-Range: "0-24/25"
      const range = r.headers.get("content-range") || "";
      const m = range.match(/\/(\d+)$/);
      const rows = await r.json();
      const count = m ? Number(m[1]) : (Array.isArray(rows) ? rows.length : 0);

      // Opportunistic GC: delete very old rows (>10 min) to keep table small.
      const gcCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      fetch(`${supaUrl}/rest/v1/player_heartbeats?last_seen=lt.${gcCutoff}`, {
        method: "DELETE",
        headers: restHeaders,
      }).catch(() => {});

      return new Response(JSON.stringify({ ok: true, activeUsers: count }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Heartbeat mode: upsert (session_id, master_user_id, last_seen=now)
    const sessionId = typeof body?.sessionId === "string" && body.sessionId.trim() ? body.sessionId.trim() : null;
    if (!sessionId) {
      return new Response(JSON.stringify({ ok: false, error: "missing sessionId" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const row = { session_id: sessionId, master_user_id: userId, last_seen: new Date().toISOString() };
    const r = await fetch(`${supaUrl}/rest/v1/player_heartbeats`, {
      method: "POST",
      headers: { ...restHeaders, Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(row),
    });
    if (!r.ok) {
      const t = await r.text();
      return new Response(JSON.stringify({ ok: false, error: `upsert http ${r.status}: ${t}` }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
