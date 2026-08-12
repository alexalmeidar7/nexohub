import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

// Blitz promocionais de UM tenant específico (kiosk /locutor e /telapromo).
// Substitui a policy pública que permitia varredura de todos os tenants.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const mode = body?.mode === "today" ? "today" : "upcoming";
    if (!isUUID(userId)) return json({ ok: false, reason: "invalid_user" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const today = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);

    let q = admin
      .from("blitz_promocionais")
      .select("id,dia,horario,horario_fim,cliente,equipe,observacoes,realizada,agenda_evento_id")
      .eq("user_id", userId)
      .eq("realizada", false);
    q = mode === "today" ? q.eq("dia", today) : q.gte("dia", today);

    const { data, error } = await q.order("dia").order("horario").limit(200);
    if (error) {
      console.error("[public-blitz-data] query error:", error.message);
      return json({ ok: false, reason: "query_failed" });
    }
    return json({ ok: true, rows: data ?? [] });
  } catch (e) {
    console.error("[public-blitz-data] error:", e);
    return json({ ok: false, reason: "server_error" });
  }
});
