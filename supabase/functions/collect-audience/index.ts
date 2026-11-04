
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

function localDayStartIso(now: Date, timeZone: string): string {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const part = (type: string) => dateParts.find(p => p.type === type)?.value || "0";
  const year = Number(part("year")), month = Number(part("month")), day = Number(part("day"));
  const targetLocalMidnight = Date.UTC(year, month - 1, day);
  const guess = new Date(targetLocalMidnight);
  const localAtGuess = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(guess);
  const get = (type: string) => Number(localAtGuess.find(p => p.type === type)?.value || "0");
  const representedLocal = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(targetLocalMidnight + targetLocalMidnight - representedLocal).toISOString();
}

function parseProgramDays(raw: unknown): number[] {
  const entries = Array.isArray(raw)
    ? raw.map(value => String(value ?? "").trim()).filter(Boolean)
    : String(raw ?? "").split(/[,;|]/).map(value => value.trim()).filter(Boolean);
  const days = new Set<number>();

  for (const entry of entries) {
    // Schedule editors commonly store ranges such as "SEG > SÁB".
    const range = entry.split(/\s*(?:>|→|–|—)\s*/);
    const resolve = (value: string): number | undefined => {
      const key = normalize(value);
      return dayAliases[key] ?? dayAliases[key.slice(0, 3)];
    };
    if (range.length === 2) {
      const first = resolve(range[0]);
      const last = resolve(range[1]);
      if (first !== undefined && last !== undefined) {
        let cursor = first;
        for (let count = 0; count < 7; count++) {
          days.add(cursor);
          if (cursor === last) break;
          cursor = (cursor + 1) % 7;
        }
        continue;
      }
    }
    const day = resolve(entry);
    if (day !== undefined) days.add(day);
  }

  return [...days];
}

function programOnAir(programs: Row[], now: Date, timeZone: string): string {
  const { weekday, hhmm } = localParts(now, timeZone);
  const matches = programs.filter(p => {
    if (p.ativo === false) return false;
    const days = parseProgramDays(p.dias_semana);
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
      }, "viewers")));
      const youtubeCount = config.youtube || config.youtube_channel_id
        ? await countSource(base, serviceKey, "count-video-viewers", {
            userId, urls: [],
            ...(config.youtube ? { youtubeUrl: config.youtube } : {}),
            ...(config.youtube_api_key ? { youtubeApiKey: config.youtube_api_key } : {}),
            ...(config.youtube_channel_id ? { youtubeChannelId: config.youtube_channel_id } : {}),
          }, "viewers")
        : null;
      const audio = audioResults.some(n => n !== null) ? audioResults.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
      const videoValues = [...videoResults, youtubeCount];
      const video = videoValues.some(n => n !== null) ? videoValues.reduce<number>((sum, n) => sum + (n ?? 0), 0) : null;
      if (audio === null && video === null) { skipped++; continue; }

      // Keep one row per program per local calendar day. During the show, update
      // the row with the peak concurrent audience instead of creating a row
      // every time the streaming count changes.
      const dayStart = localDayStartIso(now, timezone);
      const existingUrl = new URL(`${base}/rest/v1/audiencia_historico`);
      existingUrl.searchParams.set("select", "id,audio,video,created_at");
      existingUrl.searchParams.set("user_id", `eq.${userId}`);
      existingUrl.searchParams.set("programa", `eq.${program}`);
      existingUrl.searchParams.set("created_at", `gte.${dayStart}`);
      existingUrl.searchParams.set("order", "created_at.asc");
      existingUrl.searchParams.set("limit", "1");
      const existingResponse = await fetch(existingUrl, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
      });
      if (!existingResponse.ok) {
        skipped++;
        failures.push(`${userId}: lookup ${existingResponse.status}`);
        continue;
      }
      const existingRows: Row[] = await existingResponse.json();
      const existing = existingRows[0];
      const payload = {
        audio: Math.max(Number(existing?.audio) || 0, audio ?? 0),
        video: Math.max(Number(existing?.video) || 0, video ?? 0),
      };
      const saveUrl = existing
        ? `${base}/rest/v1/audiencia_historico?id=eq.${encodeURIComponent(String(existing.id))}`
        : `${base}/rest/v1/audiencia_historico`;
      const saveResponse = await fetch(saveUrl, {
        method: existing ? "PATCH" : "POST",
        headers: {
          apikey: serviceKey, Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify(existing ? payload : {
          user_id: userId, programa: program, ...payload, youtube: 0, created_at: now.toISOString(),
        }),
      });
      if (saveResponse.ok) recorded++;
      else { skipped++; failures.push(`${userId}: save ${saveResponse.status}`); }
    }

    return new Response(JSON.stringify({ ok: true, checked: configs.length, recorded, skipped, failures: failures.slice(0, 10), at: now.toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ ok: false, error: String(error) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
