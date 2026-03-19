import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function base64ToUint8Array(dataUrl: string): { data: Uint8Array; contentType: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  const contentType = match[1];
  const raw = atob(match[2]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return { data: arr, contentType };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results: string[] = [];

    // 1. Migrate apresentadores.foto
    const { data: apresentadores } = await supabase
      .from("apresentadores")
      .select("id, user_id, foto, nome")
      .not("foto", "eq", "")
      .not("foto", "is", null);

    let apCount = 0;
    for (const ap of (apresentadores || [])) {
      if (!ap.foto || !ap.foto.startsWith("data:")) continue;
      try {
        const { data: imgData, contentType } = base64ToUint8Array(ap.foto);
        const ext = contentType.includes("png") ? "png" : "jpg";
        const path = `apresentadores/${ap.user_id}/${ap.id}.${ext}`;

        const { error: upErr } = await supabase.storage
          .from("empresa-assets")
          .upload(path, imgData, { upsert: true, contentType, cacheControl: "3600" });

        if (upErr) {
          results.push(`❌ Apresentador ${ap.nome}: ${upErr.message}`);
          continue;
        }

        const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
        const publicUrl = urlData.publicUrl;

        await supabase.from("apresentadores").update({ foto: publicUrl }).eq("id", ap.id);
        apCount++;
      } catch (e) {
        results.push(`❌ Apresentador ${ap.nome}: ${String(e)}`);
      }
    }
    results.push(`✅ Apresentadores migrados: ${apCount}`);

    // 2. Migrate programas.thumb and programas.capa
    const { data: programas } = await supabase
      .from("programas")
      .select("id, user_id, thumb, capa, nome");

    let thumbCount = 0;
    let capaCount = 0;
    for (const prog of (programas || [])) {
      // Thumb
      if (prog.thumb && prog.thumb.startsWith("data:")) {
        try {
          const { data: imgData, contentType } = base64ToUint8Array(prog.thumb);
          const ext = contentType.includes("png") ? "png" : "jpg";
          const path = `programas/${prog.user_id}/${prog.id}_thumb.${ext}`;

          const { error: upErr } = await supabase.storage
            .from("empresa-assets")
            .upload(path, imgData, { upsert: true, contentType, cacheControl: "3600" });

          if (!upErr) {
            const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
            await supabase.from("programas").update({ thumb: urlData.publicUrl }).eq("id", prog.id);
            thumbCount++;
          } else {
            results.push(`❌ Thumb ${prog.nome}: ${upErr.message}`);
          }
        } catch (e) {
          results.push(`❌ Thumb ${prog.nome}: ${String(e)}`);
        }
      }

      // Capa
      if (prog.capa && prog.capa.startsWith("data:")) {
        try {
          const { data: imgData, contentType } = base64ToUint8Array(prog.capa);
          const ext = contentType.includes("png") ? "png" : "jpg";
          const path = `programas/${prog.user_id}/${prog.id}_capa.${ext}`;

          const { error: upErr } = await supabase.storage
            .from("empresa-assets")
            .upload(path, imgData, { upsert: true, contentType, cacheControl: "3600" });

          if (!upErr) {
            const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
            await supabase.from("programas").update({ capa: urlData.publicUrl }).eq("id", prog.id);
            capaCount++;
          } else {
            results.push(`❌ Capa ${prog.nome}: ${upErr.message}`);
          }
        } catch (e) {
          results.push(`❌ Capa ${prog.nome}: ${String(e)}`);
        }
      }
    }
    results.push(`✅ Thumbs migradas: ${thumbCount}`);
    results.push(`✅ Capas migradas: ${capaCount}`);

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
