import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple XML text extractor
function extractTag(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
    const match = xml.match(regex);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    });
}

function decodeXmlBuffer(buffer: ArrayBuffer, contentType: string): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  // Try declared encoding
  const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
  if (charsetMatch) {
    try {
      const decoded = new TextDecoder(charsetMatch[1], { fatal: false }).decode(buffer);
      return decoded.replace(/^\uFEFF/, "");
    } catch { /* fallback */ }
  }
  const xmlMatch = utf8.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
  if (xmlMatch) {
    try {
      const decoded = new TextDecoder(xmlMatch[1], { fatal: false }).decode(buffer);
      return decoded.replace(/^\uFEFF/, "");
    } catch { /* fallback */ }
  }
  return utf8.replace(/^\uFEFF/, "");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("uid");
    // Client passes local time info to avoid UTC mismatch
    const clientDay = url.searchParams.get("day"); // e.g. "Segunda"
    const clientTime = url.searchParams.get("time"); // e.g. "22:15"

    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "uid required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch cenario config + music XML URL
    const { data: settings } = await supabase
      .from("user_settings")
      .select("cenario_config, music_xml_url")
      .eq("user_id", userId)
      .maybeSingle();

    // Use client-provided day/time or fallback to UTC
    const now = new Date();
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const today = clientDay || dayNames[now.getDay()];
    const nowTime = clientTime || now.toTimeString().slice(0, 5);

    // Fetch current program
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

    // Fetch music data from XML URL
    let musicData: { titulo: string; artista: string; capa: string } | null = null;
    const xmlUrl = (settings as any)?.music_xml_url;
    if (xmlUrl) {
      try {
        const xmlResp = await fetch(xmlUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MusicMonitor/1.0)", Accept: "application/xml, text/xml, */*" },
          signal: AbortSignal.timeout(5000),
        });
        const buffer = await xmlResp.arrayBuffer();
        const text = decodeXmlBuffer(buffer, xmlResp.headers.get("content-type") || "");

        const titulo = decodeHtmlEntities(extractTag(text, "nome_musica", "titulo", "title")).trim();
        const artista = decodeHtmlEntities(extractTag(text, "interprete", "nome_interprete", "artista", "artist")).trim();
        const capa = extractTag(text, "capa", "cover", "album_art", "artwork", "imagem").trim();

        if (titulo && titulo !== "Sem título") {
          musicData = { titulo, artista, capa };
        }
      } catch { /* silent */ }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        cenario_config: (settings as any)?.cenario_config || {},
        currentProgram,
        sponsorLogos,
        musicData,
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
