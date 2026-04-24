import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const stripQuery = (u: string) => (u ? u.split("?")[0] : "");

async function fetchDeezerArtistImage(artist: string): Promise<string> {
  if (!artist) return "";
  try {
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=1`,
    );
    if (!res.ok) return "";
    const json = await res.json();
    const pic = json?.data?.[0]?.picture_xl || json?.data?.[0]?.picture_big || "";
    return pic || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const xmlHeaders = {
    ...corsHeaders,
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("uid") || url.searchParams.get("user_id");

    if (!userId) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>uid required</error>`, {
        headers: xmlHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Programa no ar conforme grade
    const now = new Date();
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const today = dayNames[now.getDay()];
    const nowTime = now.toTimeString().slice(0, 5);

    const { data: progs } = await supabase
      .from("programas")
      .select("id, nome, dias_semana, horario_inicio, horario_fim, ativo, apresentador_id, apresentadores_ids")
      .eq("user_id", userId)
      .eq("ativo", true);

    const onAir = (progs || []).find(
      (p: any) =>
        (p.dias_semana || []).includes(today) &&
        p.horario_inicio <= nowTime &&
        p.horario_fim > nowTime,
    );

    // Apresentador (foto)
    let apresentadorNome = "";
    let apresentadorFoto = "";
    if (onAir) {
      const apresId =
        (onAir.apresentadores_ids && onAir.apresentadores_ids[0]) || onAir.apresentador_id;
      if (apresId) {
        const { data: apres } = await supabase
          .from("apresentadores")
          .select("nome, foto")
          .eq("id", apresId)
          .maybeSingle();
        if (apres) {
          apresentadorNome = apres.nome || "";
          apresentadorFoto = stripQuery(apres.foto || "");
        }
      }
    }

    // Logos do programa no ar
    let logosXml = "";
    if (onAir) {
      const { data: logos } = await supabase
        .from("logos_patrocinadores")
        .select("nome, logo_url")
        .eq("user_id", userId)
        .eq("programa_id", onAir.id)
        .eq("ativo", true)
        .eq("excluido", false);
      logosXml = (logos || [])
        .map(
          (l: any) =>
            `    <logo><nome>${esc(l.nome)}</nome><url>${esc(stripQuery(l.logo_url))}</url></logo>`,
        )
        .join("\n");
    }

    // Imagem do artista no Deezer
    const artistaImg = await fetchDeezerArtistImage(artista);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<vmix_live>
  <programa>
    <id>${esc(onAir?.id || "")}</id>
    <nome>${esc(onAir?.nome || "")}</nome>
    <horario_inicio>${esc(onAir?.horario_inicio || "")}</horario_inicio>
    <horario_fim>${esc(onAir?.horario_fim || "")}</horario_fim>
  </programa>
  <apresentador>
    <nome>${esc(apresentadorNome)}</nome>
    <foto>${esc(apresentadorFoto)}</foto>
  </apresentador>
  <musica>
    <titulo>${esc(titulo)}</titulo>
    <artista>${esc(artista)}</artista>
    <capa>${esc(stripQuery(capa))}</capa>
    <artista_imagem>${esc(artistaImg)}</artista_imagem>
  </musica>
  <patrocinadores>
${logosXml}
  </patrocinadores>
</vmix_live>`;

    return new Response(xml, { headers: xmlHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${esc(msg)}</error>`, {
      headers: xmlHeaders,
    });
  }
});
