import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Public read of `musicas_tocadas` for the Player.
 *
 * `musicas_tocadas` is protected by RLS scoped to the owner (auth.uid()) and
 * their sub_users. Player listeners authenticate with their own Google account
 * (or as guests), so a direct query returns 0 rows — which made the "songs
 * played" list appear empty on entry and only fill up with tracks that started
 * playing *after* the listener joined. This edge function returns the last N
 * tracks with the service role so the list is consistent for every listener,
 * regardless of when they open the player.
 *
 * Only non-sensitive columns are returned (musica, artista, horario, programa,
 * dia). No listener identifiers, no PII.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const limitRaw = parseInt(url.searchParams.get("limit") || "50", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 50;

    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "user_id required", items: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data, error } = await supabase
      .from("musicas_tocadas")
      .select("musica, artista, horario, programa, dia")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message, items: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, items: data || [] }), {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=10",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, items: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
