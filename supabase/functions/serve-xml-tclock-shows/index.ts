import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

const resolveDataOwnerId = async (
  supabase: ReturnType<typeof createClient>,
  requestedUserId: string,
): Promise<string> => {
  const { data: subUser } = await supabase
    .from("sub_users")
    .select("parent_user_id, ativo")
    .eq("auth_user_id", requestedUserId)
    .maybeSingle();
  if (subUser?.ativo && subUser.parent_user_id) return subUser.parent_user_id as string;
  return requestedUserId;
};

const base64ToUint8Array = (dataUrl: string): { data: Uint8Array; contentType: string } => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  const contentType = match[1];
  const raw = atob(match[2]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return { data: arr, contentType };
};

const uploadPublicPng = async (
  supabase: ReturnType<typeof createClient>,
  storagePath: string,
  data: Uint8Array,
): Promise<string> => {
  const { error } = await supabase.storage
    .from("xml-files")
    .upload(storagePath, data, { upsert: true, contentType: "image/png", cacheControl: "3600" });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from("xml-files").getPublicUrl(storagePath);
  return (urlData?.publicUrl || "").split("?")[0];
};

const ensurePngImageUrl = async (
  supabase: ReturnType<typeof createClient>,
  value: string | null | undefined,
  storagePath: string,
  size = 512,
): Promise<string> => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("data:image/png;base64,")) {
    const { data } = base64ToUint8Array(trimmed);
    return await uploadPublicPng(supabase, storagePath, data);
  }

  if (!/^https?:\/\//i.test(trimmed)) return "";

  const cleanUrl = trimmed.split("?")[0].split("#")[0];
  if (/\.png$/i.test(cleanUrl)) return cleanUrl;

  try {
    const parsed = new URL(trimmed);
    let fetchUrl = trimmed;

    if (parsed.pathname.includes("/storage/v1/object/public/")) {
      parsed.pathname = parsed.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
      parsed.searchParams.set("width", String(size));
      parsed.searchParams.set("height", String(size));
      parsed.searchParams.set("resize", "contain");
      parsed.searchParams.set("format", "png");
      fetchUrl = parsed.toString();
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) return "";

    const contentType = response.headers.get("content-type") || "";
    const bytes = new Uint8Array(await response.arrayBuffer());

    if (contentType.includes("png") || fetchUrl.includes("format=png")) {
      return await uploadPublicPng(supabase, storagePath, bytes);
    }

    return "";
  } catch {
    return "";
  }
};

// Animated PNG weather icons (Meteocons - amCharts CDN, .png extension)
const toPngIconUrl = (code: number): string => {
  const map: Record<number, string> = {
    0: "day", 1: "cloudy-day-1", 2: "cloudy-day-2", 3: "cloudy",
    45: "cloudy", 48: "cloudy",
    51: "rainy-1", 53: "rainy-2", 55: "rainy-3",
    61: "rainy-4", 63: "rainy-5", 65: "rainy-6",
    71: "snowy-4", 73: "snowy-5", 75: "snowy-6",
    80: "rainy-4", 81: "rainy-5", 82: "rainy-6",
    95: "thunder", 96: "thunder", 99: "thunder",
  };
  const name = map[code] || "day";
  return `https://amcharts.com/wp-content/uploads/assets/animated-svg-icons/weather/animated/${name}.png`;
};

const WMO_LABELS: Record<number, string> = {
  0: "Ensolarado", 1: "Quase limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina densa", 51: "Garoa fraca", 53: "Garoa", 55: "Garoa intensa",
  61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 71: "Neve fraca", 73: "Neve", 75: "Neve forte",
  80: "Pancadas de chuva", 81: "Pancadas fortes", 82: "Pancadas violentas",
  95: "Tempestade", 96: "Tempestade c/ granizo", 99: "Tempestade severa",
};

// (weather icons resolved by toPngIconUrl above)

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    if (!userId) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><error>user_id is required</error>',
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const dataOwnerId = await resolveDataOwnerId(supabase, userId);

    // Settings (weather coords)
    const { data: settings } = await supabase
      .from("user_settings")
      .select("weather_lat, weather_lon, weather_city")
      .eq("user_id", dataOwnerId)
      .maybeSingle();

    // Programs (active) - rotação completa da grade
    const { data: programs } = await supabase
      .from("programas")
      .select("id, nome, descricao, capa, thumb, selo, horario_inicio")
      .eq("user_id", dataOwnerId)
      .eq("ativo", true)
      .order("horario_inicio", { ascending: true });

    // Current weather
    let tempAtual = "";
    let descAtual = "";
    let iconAtual = "";
    if (settings?.weather_lat && settings?.weather_lon) {
      try {
        const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${settings.weather_lat}&longitude=${settings.weather_lon}&current=temperature_2m,weather_code&timezone=America/Sao_Paulo`;
        const wxRes = await fetch(wxUrl);
        if (wxRes.ok) {
          const d = await wxRes.json();
          const code = d.current?.weather_code as number;
          const t = d.current?.temperature_2m;
          if (typeof t === "number") tempAtual = `${Math.round(t)}°`;
          descAtual = WMO_LABELS[code] || "—";
          iconAtual = toPngIconUrl(code);
        }
      } catch { /* silent */ }
    }

    // Rotação: 1 programa a cada 5 segundos
    const list = (programs || []);
    const rotationSlot = Math.floor(Date.now() / 5000);
    const current = list.length > 0 ? list[rotationSlot % list.length] : null;

    const programaNome = current?.nome || "";
    const programaDescricao = current?.descricao || "";
    const programaThumb = current
      ? await ensurePngImageUrl(supabase, current.thumb || current.capa || "", `tclock-shows/${dataOwnerId}/${current.id}-thumb.png`, 512)
      : "";
    const programaLogo = current
      ? await ensurePngImageUrl(supabase, current.selo || "", `tclock-shows/${dataOwnerId}/${current.id}-logo.png`, 512)
      : "";

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<items>");
    lines.push("  <dados>");
    lines.push(`    <clima_icone>${esc(iconAtual)}</clima_icone>`);
    lines.push(`    <clima_temperatura>${esc(tempAtual)}</clima_temperatura>`);
    lines.push(`    <clima_descricao>${esc(descAtual)}</clima_descricao>`);
    lines.push(`    <clima_cidade>${esc(settings?.weather_city || "")}</clima_cidade>`);
    lines.push(`    <programa_nome>${esc(programaNome)}</programa_nome>`);
    lines.push(`    <programa_descricao>${esc(programaDescricao)}</programa_descricao>`);
    lines.push(`    <programa_thumb>${esc(programaThumb)}</programa_thumb>`);
    lines.push(`    <programa_logo>${esc(programaLogo)}</programa_logo>`);
    lines.push("  </dados>");
    lines.push("</items>");

    return new Response(lines.join("\n"), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "CDN-Cache-Control": "no-store",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${(err as Error).message}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } },
    );
  }
});
