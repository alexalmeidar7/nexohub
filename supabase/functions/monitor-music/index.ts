import { decodeMusicBytes } from "../_shared/musicByteEncoding.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MOJIBAKE_PATTERN = /(Ã.|Â.|â[\u0080-\u00BF]|ðŸ|ï¿½|�)/g;
const CONTROL_CHAR_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

const decodeBuffer = (buffer: ArrayBuffer, encoding: string, fatal = false): string | null => {
  try {
    return new TextDecoder(encoding, { fatal }).decode(buffer);
  } catch {
    return null;
  }
};

const scoreDecodedText = (value: string): number => {
  if (!value) return Number.NEGATIVE_INFINITY;

  const replacementCount = value.match(/\uFFFD/g)?.length ?? 0;
  const mojibakeCount = value.match(MOJIBAKE_PATTERN)?.length ?? 0;
  const controlCount = value.match(CONTROL_CHAR_PATTERN)?.length ?? 0;

  return (
    Math.min(value.length, 1000) * 0.01 -
    replacementCount * 120 -
    mojibakeCount * 14 -
    controlCount * 25
  );
};

function decodeXmlBuffer(buffer: ArrayBuffer, contentType: string): string {
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (value: string | null) => {
    if (!value) return;
    if (seen.has(value)) return;
    seen.add(value);
    candidates.push(value);
  };

  const utf8Lenient = decodeBuffer(buffer, "utf-8", false) ?? "";
  addCandidate(utf8Lenient);

  const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
  const headerCharset = charsetMatch ? charsetMatch[1].toLowerCase() : "";
  const xmlEncodingMatch = utf8Lenient.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
  const xmlEncoding = xmlEncodingMatch ? xmlEncodingMatch[1].toLowerCase() : "";

  for (const encoding of [...new Set([headerCharset, xmlEncoding].filter(Boolean))]) {
    addCandidate(decodeBuffer(buffer, encoding, false));
  }

  addCandidate(decodeBuffer(buffer, "utf-8", true));
  addCandidate(decodeBuffer(buffer, "windows-1252", false));
  addCandidate(decodeBuffer(buffer, "iso-8859-1", false));

  if (!candidates.length) return utf8Lenient;

  const best = candidates.reduce((winner, current) =>
    scoreDecodedText(current) > scoreDecodedText(winner) ? current : winner
  );

  return best.replace(/^\uFEFF/, "");
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

function normalizeMusicText(value: string): string {
  return decodeHtmlEntities(value).trim().normalize("NFC");
}

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
  const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
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
    // Get ALL users that can have a music source:
    //   - `music_xml_url` set (online mode)
    //   - `music_source_mode` in ('pasta','both') (local mode — file uploaded
    //     to Storage by MusicaNoAr; we fall back to reading it here so history
    //     is recorded 24/7 as long as the operator has a Nexo tab open somewhere).
    const { data: settings, error: settingsErr } = await supabase
      .from("user_settings")
      .select("user_id, music_xml_url, music_source_mode, dashboard_items");

    if (settingsErr || !settings?.length) {
      return new Response(JSON.stringify({ processed: 0, message: "No users" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const candidates = settings.filter((s: any) => {
      const url = (s.music_xml_url || "").trim();
      const mode = (s.music_source_mode || "").toLowerCase();
      return !!url || mode === "pasta" || mode === "both";
    });

    let inserted = 0;
    const deadline = Date.now() + 40_000;
    let timedOut = false;

    const processUser = async (setting: any) => {
      try {
        const url = (setting.music_xml_url || "").trim();
        const mode = (setting.music_source_mode || "").toLowerCase();
        const useOnline = !!url && mode !== "pasta";
        const useLocal = !useOnline && (mode === "pasta" || mode === "both" || !url);

        let text = "";

        if (useOnline) {
          const response = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (compatible; MusicMonitor/1.0)",
              Accept: "application/xml, text/xml, */*",
            },
            signal: AbortSignal.timeout(4000),
          });
          const buffer = await response.arrayBuffer();
          text = decodeMusicBytes(buffer, response.headers.get("content-type") || "");
        }

        if (useLocal || !text) {
          // Try storage-backed local XML written by MusicaNoAr.syncToStorage.
          // MusicaNoAr always writes a pseudo-XML (<musica><interprete/><nome_musica/></musica>)
          // regardless of the source format (Jornal FM TXT, Cultura FM PlayList, etc.),
          // so extractTag works uniformly here.
          const dashboardItems = (setting.dashboard_items || {}) as { local_xml_storage_path?: string };
          const bucketPaths = [
            dashboardItems.local_xml_storage_path,
            `${setting.user_id}/local-xml-${setting.user_id}.xml`,
            `local-xml-${setting.user_id}.xml`,
          ].filter(Boolean) as string[];
          for (const path of bucketPaths) {
            const { data: pub } = supabase.storage.from("xml-files").getPublicUrl(path);
            if (!pub?.publicUrl) continue;
            try {
              const res = await fetch(`${pub.publicUrl}?t=${Date.now()}`, {
                signal: AbortSignal.timeout(4000),
                headers: { "Cache-Control": "no-cache" },
              });
              if (!res.ok) continue;
              const buffer = await res.arrayBuffer();
              const localText = decodeMusicBytes(buffer, res.headers.get("content-type") || "");
              if (localText && localText.trim()) {
                text = localText;
                break;
              }
            } catch {
              // try next path
            }
          }
        }

        if (!text) return;

        // Parse music data
        const titulo = normalizeMusicText(extractTag(text, "nome_musica", "titulo", "title"));
        const artista = normalizeMusicText(extractTag(text, "interprete", "nome_interprete", "artista", "artist"));

        if (!titulo || titulo === "Sem título" || !artista || artista === "Desconhecido") return;
        if (/\uFFFD/.test(titulo + artista)) {
          console.warn("Music metadata already contains replacement characters after byte decoding; skipping corrupt history entry");
          return;
        }

        // Skip if this exact song is already the last recorded for this user.
        const { data: lastSong } = await supabase
          .from("musicas_tocadas")
          .select("artista, musica")
          .eq("user_id", setting.user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (lastSong?.artista === artista && lastSong?.musica === titulo) return;

        // Get current program
        const { data: programas } = await supabase
          .from("programas")
          .select("nome, horario_inicio, horario_fim, dias_semana, variavel, data_variavel, ativo")
          .eq("user_id", setting.user_id)
          .eq("ativo", true);

        const programa = getCurrentProgram(programas || []);

        const now = new Date();
        await supabase.from("musicas_tocadas").upsert({
          user_id: setting.user_id,
          dia: now.toISOString().slice(0, 10),
          horario: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`,
          programa,
          artista,
          musica: titulo,
        }, { onConflict: "user_id,musica,artista,dia", ignoreDuplicates: true });

        inserted++;
      } catch {
        // Skip this user on error
      }
    };

    // Processa em lotes paralelos com limite de tempo global, para nunca
    // estourar o tempo de execução quando há muitos usuários/XMLs lentos.
    const CONCURRENCY = 8;
    let processed = 0;
    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      if (Date.now() > deadline) {
        timedOut = true;
        break;
      }
      const batch = candidates.slice(i, i + CONCURRENCY);
      await Promise.allSettled(batch.map((s: any) => processUser(s)));
      processed += batch.length;
    }

    return new Response(JSON.stringify({ processed, total: candidates.length, inserted, timedOut }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
