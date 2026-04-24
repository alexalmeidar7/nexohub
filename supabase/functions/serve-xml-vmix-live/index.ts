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
  // Pega apenas o primeiro artista (antes de /, &, feat, ,)
  const primary = artist
    .split(/[\/&,]| feat\.?| ft\.?| with /i)[0]
    .trim();
  const query = primary || artist;
  try {
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=1`,
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
      .select("id, nome, dias_semana, horario_inicio, horario_fim, ativo, apresentador_id, apresentadores_ids, capa, thumb")
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

    // Logo do patrocinador (1 por vez, rotação a cada 10s)
    let patrocinadorNome = "";
    let patrocinadorUrl = "";
    if (onAir) {
      const { data: logos } = await supabase
        .from("logos_patrocinadores")
        .select("nome, logo_url")
        .eq("user_id", userId)
        .eq("programa_id", onAir.id)
        .eq("ativo", true)
        .eq("excluido", false)
        .order("created_at", { ascending: true });
      const list = logos || [];
      if (list.length > 0) {
        const slot = Math.floor(Date.now() / 10000) % list.length;
        const escolhida = list[slot];
        patrocinadorNome = escolhida.nome || "";
        patrocinadorUrl = stripQuery(escolhida.logo_url || "");
      }
    }

    // Música atual: último registro em musicas_tocadas
    let titulo = "";
    let artista = "";
    let capa = "";
    const { data: ultimaMusica } = await supabase
      .from("musicas_tocadas")
      .select("musica, artista")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultimaMusica) {
      titulo = ultimaMusica.musica || "";
      artista = ultimaMusica.artista || "";
    }

    // Capa via iTunes
    if (titulo && artista) {
      try {
        const q = encodeURIComponent(`${artista} ${titulo}`);
        const r = await fetch(`https://itunes.apple.com/search?term=${q}&limit=1&media=music`);
        if (r.ok) {
          const j = await r.json();
          const art = j?.results?.[0]?.artworkUrl100 || "";
          if (art) capa = art.replace("100x100", "600x600");
        }
      } catch {
        // ignore
      }
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
    <capa>${esc(stripQuery((onAir as any)?.capa || (onAir as any)?.thumb || ""))}</capa>
  </programa>
  <apresentador>
    <nome>${esc(apresentadorNome)}</nome>
    <foto>${esc(apresentadorFoto)}</foto>
  </apresentador>
  <musica>
    <titulo>${esc(titulo)}</titulo>
    <artista>${esc(artista)}</artista>
    <capa>${esc(capa)}</capa>
    <artista_imagem>${esc(artistaImg)}</artista_imagem>
  </musica>
  <patrocinador>
    <nome>${esc(patrocinadorNome)}</nome>
    <url>${esc(patrocinadorUrl)}</url>
  </patrocinador>
</vmix_live>`;

    return new Response(xml, { headers: xmlHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${esc(msg)}</error>`, {
      headers: xmlHeaders,
    });
  }
});
