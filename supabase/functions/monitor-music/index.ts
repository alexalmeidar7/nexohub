import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple XML text extractor (no DOMParser in Deno)
function extractTag(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
    const match = xml.match(regex);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function getCurrentProgram(
  programas: { nome: string; horario_inicio: string; horario_fim: string; dias_semana: string[] | null; variavel: boolean; data_variavel: string | null; ativo: boolean }[]
): string {
  const now = new Date();
  const dias = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const diaAtual = dias[now.getDay()];
  const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const todayStr = now.toISOString().slice(0, 10);

  for (const p of programas) {
    if (!p.ativo) continue;
    if (p.variavel) {
      if (p.data_variavel === todayStr && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim) return p.nome;
    } else {
      if (p.dias_semana?.includes(diaAtual) && horaAtual >= p.horario_inicio && horaAtual < p.horario_fim) return p.nome;
    }
  }
  return "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    // Get all users with XML URLs
    const { data: settings, error: settingsErr } = await supabase
      .from("user_settings")
      .select("user_id, music_xml_url")
      .not("music_xml_url", "is", null)
      .neq("music_xml_url", "");

    if (settingsErr || !settings?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No users with XML URLs" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let inserted = 0;

    for (const setting of settings) {
      try {
        // Fetch XML
        const response = await fetch(setting.music_xml_url, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; MusicMonitor/1.0)",
            Accept: "application/xml, text/xml, */*",
          },
          signal: AbortSignal.timeout(10000),
        });

        const buffer = await response.arrayBuffer();
        const contentType = response.headers.get("content-type") || "";
        const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
        const charset = charsetMatch ? charsetMatch[1].toLowerCase() : "";

        let text: string;
        if (charset && charset !== "utf-8" && charset !== "utf8") {
          try {
            text = new TextDecoder(charset, { fatal: false }).decode(buffer);
          } catch {
            text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
          }
        } else {
          text = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
        }

        // Parse music data
        const titulo = extractTag(text, "nome_musica", "titulo", "title");
        const artista = extractTag(text, "interprete", "nome_interprete", "artista", "artist");

        if (!titulo || titulo === "Sem título" || !artista) continue;

        // Check if this song was already the last recorded for this user
        const { data: lastSong } = await supabase
          .from("musicas_tocadas")
          .select("artista, musica")
          .eq("user_id", setting.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastSong?.artista === artista && lastSong?.musica === titulo) continue;

        // Get current program
        const { data: programas } = await supabase
          .from("programas")
          .select("nome, horario_inicio, horario_fim, dias_semana, variavel, data_variavel, ativo")
          .eq("user_id", setting.user_id)
          .eq("ativo", true);

        const programa = getCurrentProgram(programas || []);

        const now = new Date();
        await supabase.from("musicas_tocadas").insert({
          user_id: setting.user_id,
          dia: now.toISOString().slice(0, 10),
          horario: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
          programa,
          artista,
          musica: titulo,
        });

        inserted++;
      } catch {
        // Skip this user on error
        continue;
      }
    }

    return new Response(JSON.stringify({ processed: settings.length, inserted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
