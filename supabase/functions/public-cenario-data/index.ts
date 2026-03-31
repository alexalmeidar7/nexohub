import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("uid");

    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "uid required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch cenario config
    const { data: settings } = await supabase
      .from("user_settings")
      .select("cenario_config")
      .eq("user_id", userId)
      .maybeSingle();

    // Fetch current program
    const now = new Date();
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const today = dayNames[now.getDay()];
    const nowTime = now.toTimeString().slice(0, 5);

    const { data: progs } = await supabase
      .from("programas")
      .select("id, nome, selo, horario_inicio, horario_fim, dias_semana, apresentador_id, apresentadores_ids")
      .eq("user_id", userId)
      .eq("ativo", true);

    let currentProgram = null;
    let sponsorLogos: any[] = [];

    const onAir = progs?.find(
      (p: any) =>
        (p.dias_semana || []).includes(today) &&
        p.horario_inicio <= nowTime &&
        p.horario_fim > nowTime
    );

    if (onAir) {
      let apresentadorNome = "";
      const apIds = onAir.apresentadores_ids?.length
        ? onAir.apresentadores_ids
        : onAir.apresentador_id
        ? [onAir.apresentador_id]
        : [];

      if (apIds.length) {
        const { data: aps } = await supabase
          .from("apresentadores")
          .select("nome")
          .in("id", apIds);
        apresentadorNome = aps?.map((a: any) => a.nome).join(", ") || "";
      }

      currentProgram = {
        nome: onAir.nome,
        id: onAir.id,
        selo: onAir.selo,
        horario_inicio: onAir.horario_inicio,
        horario_fim: onAir.horario_fim,
        apresentador: apresentadorNome,
      };

      const { data: logos } = await supabase
        .from("logos_patrocinadores")
        .select("id, nome, logo_url")
        .eq("programa_id", onAir.id)
        .eq("user_id", userId)
        .eq("ativo", true)
        .eq("excluido", false);

      sponsorLogos = logos || [];
    }

    return new Response(
      JSON.stringify({
        ok: true,
        cenario_config: settings?.cenario_config || {},
        currentProgram,
        sponsorLogos,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-cache" },
      }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
