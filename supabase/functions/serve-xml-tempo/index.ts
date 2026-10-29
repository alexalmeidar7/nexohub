import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const slug = (url.searchParams.get("slug") || "").toLowerCase();
  const slugToUserId: Record<string, string> = {
    positivafm: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
    positiva: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
    interativafm: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
    interativa: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
  };
  const userId = url.searchParams.get("user_id") || url.searchParams.get("uid") || slugToUserId[slug] || null;
  if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><previsao><disponivel>0</disponivel><erro>user_id obrigatório</erro></previsao>',
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Configuração do serviço indisponível");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase.storage
      .from("xml-files")
      .download(`xml-tempo-${userId}.xml`);

    if (error || !data) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><previsao><disponivel>0</disponivel></previsao>',
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } },
      );
    }

    return new Response(await data.text(), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    });
  } catch (error) {
    console.error("[serve-xml-tempo]", error);
    return new Response(
      '<?xml version="1.0" encoding="UTF-8"?><previsao><disponivel>0</disponivel><erro>dados indisponíveis</erro></previsao>',
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" } },
    );
  }
});
