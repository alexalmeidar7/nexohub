import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let userId = "";
    if (req.method === "GET") {
      userId = new URL(req.url).searchParams.get("user_id") ?? "";
    } else {
      const body = await req.json().catch(() => ({}));
      userId = typeof body?.user_id === "string" ? body.user_id : "";
    }

    if (!userId) return json({ ok: false, poll: null, error: "user_id_required" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Data/hora no fuso de Brasília para casar com o cadastro da enquete
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const today = now.toISOString().slice(0, 10);
    const hhmm = now.toISOString().slice(11, 16);

    const { data, error } = await admin
      .from("enquetes_agendadas")
      .select("id,pergunta,resposta1,resposta2,resposta3,resposta4,horario_inicio,horario_fim")
      .eq("user_id", userId)
      .eq("data_enquete", today)
      .lte("horario_inicio", hhmm)
      .gte("horario_fim", hhmm)
      .order("horario_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return json({ ok: false, poll: null, error: error.message });
    if (!data) return json({ ok: true, poll: null });

    const respostas = [data.resposta1, data.resposta2, data.resposta3, data.resposta4]
      .filter((r) => typeof r === "string" && r.trim().length > 0);

    return json({
      ok: true,
      poll: {
        id: data.id,
        pergunta: data.pergunta,
        respostas,
        horario_inicio: data.horario_inicio,
        horario_fim: data.horario_fim,
      },
    });
  } catch (e) {
    return json({ ok: false, poll: null, error: String(e) });
  }
});
