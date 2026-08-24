import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const { action, token, photoBase64 } = body as { action?: string; token?: string; photoBase64?: string };
    if (!token) return json({ ok: false, error: "token obrigatório" });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: sorteio, error } = await supabase
      .from("sorteio_sorteios")
      .select("id, user_id, premio_id, nome_ganhador, telefone_ganhador, programa_nome, apresentador_nome, data_sorteio, entregue, data_entrega, expirado, data_expiracao, foto_entrega_url")
      .eq("entrega_token", token)
      .maybeSingle();

    if (error) return json({ ok: false, error: error.message });
    if (!sorteio) return json({ ok: false, error: "Registro não encontrado" });

    const { data: premio } = await supabase
      .from("sorteio_premios")
      .select("nome, descricao, imagem_url")
      .eq("id", sorteio.premio_id)
      .maybeSingle();

    const info = {
      premio_nome: premio?.nome ?? "—",
      premio_descricao: premio?.descricao ?? null,
      premio_imagem: premio?.imagem_url ?? null,
      nome_ganhador: sorteio.nome_ganhador,
      telefone_ganhador: sorteio.telefone_ganhador,
      programa_nome: sorteio.programa_nome,
      apresentador_nome: sorteio.apresentador_nome,
      data_sorteio: sorteio.data_sorteio,
      entregue: sorteio.entregue,
      data_entrega: sorteio.data_entrega,
      expirado: sorteio.expirado,
      tem_foto: !!sorteio.foto_entrega_url,
    };

    if (action !== "confirm") return json({ ok: true, info });

    if (!photoBase64) return json({ ok: false, error: "Foto obrigatória" });

    const clean = photoBase64.includes(",") ? photoBase64.split(",")[1] : photoBase64;
    const bytes = Uint8Array.from(atob(clean), (c) => c.charCodeAt(0));
    const path = `${sorteio.user_id}/${sorteio.id}-${Date.now()}.jpg`;

    const { error: upErr } = await supabase.storage.from("entregas").upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (upErr) return json({ ok: false, error: upErr.message });

    const now = new Date().toISOString();
    const { error: updErr } = await supabase
      .from("sorteio_sorteios")
      .update({ entregue: true, data_entrega: now, entrega_registrada_em: now, foto_entrega_url: path })
      .eq("id", sorteio.id);
    if (updErr) return json({ ok: false, error: updErr.message });

    return json({ ok: true, info: { ...info, entregue: true, data_entrega: now, tem_foto: true } });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message });
  }
});
