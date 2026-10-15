import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type Row = Record<string, any>;
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret" };

const normalize = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
const dayAliases: Record<string, number> = {
  DOM: 0, DOMINGO: 0, SUNDAY: 0,
  SEG: 1, SEGUNDA: 1, "SEGUNDA-FEIRA": 1, MON: 1, MONDAY: 1,
  TER: 2, TERCA: 2, "TERCA-FEIRA": 2, TUE: 2, TUESDAY: 2,
  QUA: 3, QUARTA: 3, "QUARTA-FEIRA": 3, WED: 3, WEDNESDAY: 3,
  QUI: 4, QUINTA: 4, "QUINTA-FEIRA": 4, THU: 4, THURSDAY: 4,
  SEX: 5, SEXTA: 5, "SEXTA-FEIRA": 5, FRI: 5, FRIDAY: 5,
  SAB: 6, SABADO: 6, SAT: 6, SATURDAY: 6,
};

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find(p => p.type === type)?.value || "";
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as Record<string, number>)[get("weekday")] ?? 0;
  return { weekday, hhmm: `${get("hour").padStart(2, "0")}:${get("minute").padStart(2, "0")}` };
}

function programOnAir(programs: Row[], now: Date, timeZone: string): string {
  const { weekday, hhmm } = localParts(now, timeZone);
  const matches = programs.filter(p => {
    if (p.ativo === false) return false;
    const rawDays = Array.isArray(p.dias_semana) ? p.dias_semana : typeof p.dias_semana === "string" ? p.dias_semana.split(/[,;|]/) : [];
    const days = rawDays.map((d: unknown) => {
      const n = normalize(d);
      return dayAliases[n] ?? dayAliases[n.slice(0, 3)];
    });
    const start = String(p.horario_inicio || "").slice(0, 5);
    const end = String(p.horario_fim || "").slice(0, 5);
    if (!start || !end || !days.includes(weekday)) return false;
    return start <= end ? hhmm >= start && hhmm < end : hhmm >= start || hhmm < end;
  });
  return String(matches[0]?.nome || "Programa não identificado");
}

function sources(config: Row, kind: "audio" | "video") {
  const key = kind === "audio" ? "audio_sources" : "video_sources";
  const urlKey = kind === "audio" ? "audio_stream_api_url" : "video_stream_api_url";
  const xpathKey = kind === "audio" ? "audio_stream_xpath" : "video_stream_xpath";
  const list = Array.isArray(config[key]) ? config[key] : [];
  const items = [
    { url: String(config[urlKey] || "").trim(), xpath: String(config[xpathKey] || "").trim() },
    ...list.map((s: Row) => ({ url: String(s?.url || "").trim(), xpath: String(s?.xpath || "").trim() })),
  ].filter(s => /^https?:\/\//i.test(s.url));
  return items.filter((s, i, all) => all.findIndex(x => x.url === s.url) === i);
}

async function countSource(base: string, serviceKey: string, slug: string, body: Row, field: string): Promise<number | null> {
  try {
    const response = await fetch(`${base}/functions/v1/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.ok && typeof data[field] === "number" && Number.isFinite(data[field]) ? Math.max(0, data[field]) : null;
  } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const base = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !serviceKey) return new Response(JSON.stringify({ error: "Missing Supabase server configuration" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const settingsResponse = await fetch(`${base}/rest/v1/audience_collector_settings?select=cron_secret&id=eq.true`, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!settingsResponse.ok) throw new Error("Could not validate collector secret");
    const settings = await settingsResponse.json();
    const expectedSecret = settings?.[0]?.cron_secret;
    if (!expectedSecret || req.headers.get("x-cron-secret") !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const configsResponse = await fetch(
      `${base}/rest/v1/empresa_config?select=user_id,timezone,audio_stream_api_url,audio_stream_xpath,video_stream_api_url,video_stream_xpath,audio_sources,video_sources,youtube,youtube_api_key,youtube_channel_id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
    );
    if (!configsResponse.ok) throw new Error(`Config fetch failed: ${configsResponse.status}`);
    const configs: Row[] = await configsResponse.json();
    const now = new Date();
    let recorded = 0, skipped = 0;
    const failures: string[] = [];

    for (const config of configs) {
      const userId = String(config.user_id || "");
      if (!userId) { skipped++; continue; }
      const audioSources = sources(config, "audio");
      const videoSources = sources(config, "video");
      if (!audioSources.length && !videoSources.length && !config.youtube && !config.youtube_channel_id) { skipped++; continue; }

      const programsUrl = new URL(`${base}/rest/v1/programas`);
      programsUrl.searchParams.set("select", "nome,horario_inicio,horario_fim,dias_semana,ativo");
      programsUrl.searchParams.set("user_id", `eq.${userId}`);
      const programResponse = await fetch(programsUrl, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      const programs: Row[] = programResponse.ok ? await programResponse.json() : [];
      const timezone = String(config.timezone || "America/Sao_Paulo");
      const program = programOnAir(programs, now, timezone);

      const audioResults = await Promise.all(audioSources.map(source => countSource(base, serviceKey, "count-stream-listeners", { userId, urls: [source.url], ...(source.xpath ? { xpath: source.xpath } : {}) }, "listeners")));
      const videoResults = await Promise.all(videoSources.map(source => countSource(base, serviceKey, "count-video-viewers", {
        userId, urls: [source.url], ...(source.xpath ? { xpath: source.xpath } : {}),
        ...(config.youtube ? { youtubeUrl: config.youtube } : {}),
        ...(config.youtube_api_key ? { youtubeApiKey: config.youtube_api_key } : {}),
        ...(config.youtube_channel_id ? { youtubeChannelId: config.youtube_channel_id } : {}),
      }, "viewers")));
      const audio = audioResults.some(n => n !== null) ? audioResults.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
      const video = videoResults.some(n => n !== null) ? videoResults.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
      if (audio === null && video === null) { skipped++; continue; }

      const insertResponse = await fetch(`${base}/rest/v1/audiencia_historico`, {
        method: "POST",
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Prefer: "return=minimal" },
        body: JSON.stringify({ user_id: userId, programa: program, audio: audio ?? 0, video: video ?? 0, youtube: 0, created_at: now.toISOString() }),
      });
      if (insertResponse.ok) recorded++;
      else { skipped++; failures.push(`${userId}: insert ${insertResponse.status}`); }
    }

    return new Response(JSON.stringify({ ok: true, checked: configs.length, recorded, skipped, failures: failures.slice(0, 10), at: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
