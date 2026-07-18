import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";


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

async function migrateOne(
  supabase: any,
  table: string,
  id: string,
  userId: string,
  column: string,
  base64Value: string,
  subFolder: string,
  nameSuffix: string
): Promise<string | null> {
  try {
    const { data: imgData, contentType } = base64ToUint8Array(base64Value);
    const ext = contentType.includes("png") ? "png" : "jpg";
    const path = `${subFolder}/${userId}/${id}${nameSuffix}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from("empresa-assets")
      .upload(path, imgData, { upsert: true, contentType, cacheControl: "3600" });

    if (upErr) return `upload error: ${upErr.message}`;

    const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
    const { error: dbErr } = await supabase.from(table).update({ [column]: urlData.publicUrl }).eq("id", id);
    if (dbErr) return `db update error: ${dbErr.message}`;
    return null; // success
  } catch (e) {
    return String(e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { table = "all", limit = 5 } = await req.json().catch(() => ({}));
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const results: string[] = [];

    // Apresentadores
    if (table === "all" || table === "apresentadores") {
      const { data: rows } = await supabase
        .from("apresentadores")
        .select("id, user_id, foto, nome")
        .like("foto", "data:%")
        .limit(limit);

      for (const row of (rows || [])) {
        const err = await migrateOne(supabase, "apresentadores", row.id, row.user_id, "foto", row.foto, "apresentadores", "");
        results.push(err ? `❌ Apresentador ${row.nome}: ${err}` : `✅ Apresentador ${row.nome}`);
      }
    }

    // Programas thumb
    if (table === "all" || table === "programas") {
      const { data: thumbRows } = await supabase
        .from("programas")
        .select("id, user_id, thumb, nome")
        .like("thumb", "data:%")
        .limit(limit);

      for (const row of (thumbRows || [])) {
        const err = await migrateOne(supabase, "programas", row.id, row.user_id, "thumb", row.thumb, "programas", "_thumb");
        results.push(err ? `❌ Thumb ${row.nome}: ${err}` : `✅ Thumb ${row.nome}`);
      }

      // Programas capa
      const { data: capaRows } = await supabase
        .from("programas")
        .select("id, user_id, capa, nome")
        .like("capa", "data:%")
        .limit(limit);

      for (const row of (capaRows || [])) {
        const err = await migrateOne(supabase, "programas", row.id, row.user_id, "capa", row.capa, "programas", "_capa");
        results.push(err ? `❌ Capa ${row.nome}: ${err}` : `✅ Capa ${row.nome}`);
      }
    }

    // Check remaining
    const [{ count: apRemain }, { count: thumbRemain }, { count: capaRemain }] = await Promise.all([
      supabase.from("apresentadores").select("id", { count: "exact", head: true }).like("foto", "data:%"),
      supabase.from("programas").select("id", { count: "exact", head: true }).like("thumb", "data:%"),
      supabase.from("programas").select("id", { count: "exact", head: true }).like("capa", "data:%"),
    ]);

    return new Response(JSON.stringify({
      success: true,
      results,
      remaining: { apresentadores: apRemain || 0, thumbs: thumbRemain || 0, capas: capaRemain || 0 },
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
