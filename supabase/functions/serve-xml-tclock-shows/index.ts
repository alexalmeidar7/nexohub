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

const normalizeImageUrl = (value: string | null | undefined, size = 512): string => {
  const trimmed = (value || "").trim();
  if (!trimmed || trimmed.startsWith("data:")) return trimmed;
  try {
    const parsed = new URL(trimmed);
    // Force .png output via Supabase image transform when possible
    if (parsed.pathname.includes("/storage/v1/object/public/")) {
      parsed.pathname = parsed.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
      parsed.searchParams.set("width", String(size));
      parsed.searchParams.set("height", String(size));
      parsed.searchParams.set("resize", "contain");
      parsed.searchParams.set("format", "png");
      return parsed.toString();
    }
    return trimmed;
  } catch {
    return trimmed;
  }
};

// Convert basmilius .svg icon URLs to .png via a public image proxy (wsrv.nl)
const toPngIconUrl = (svgUrl: string, size = 256): string => {
  if (!svgUrl) return "";
  const clean = svgUrl.replace(/^https?:\/\//, "");
  return `https://wsrv.nl/?url=${encodeURIComponent(clean)}&output=png&w=${size}&h=${size}`;
};

const WMO_LABELS: Record<number, string> = {
  0: "Ensolarado", 1: "Quase limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina densa", 51: "Garoa fraca", 53: "Garoa", 55: "Garoa intensa",
  61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 71: "Neve fraca", 73: "Neve", 75: "Neve forte",
  80: "Pancadas de chuva", 81: "Pancadas fortes", 82: "Pancadas violentas",
  95: "Tempestade", 96: "Tempestade c/ granizo", 99: "Tempestade severa",
};

// Animated weather icons (basmilius / meteocons - hospedados publicamente)
const WEATHER_ICON_BASE = "https://basmilius.github.io/weather-icons/production/fill/all";
const WMO_ICON: Record<number, string> = {
  0: "clear-day.svg", 1: "partly-cloudy-day.svg", 2: "partly-cloudy-day.svg", 3: "cloudy.svg",
  45: "fog.svg", 48: "fog.svg",
  51: "drizzle.svg", 53: "drizzle.svg", 55: "drizzle.svg",
  61: "rain.svg", 63: "rain.svg", 65: "rain.svg",
  71: "snow.svg", 73: "snow.svg", 75: "snow.svg",
  80: "rain.svg", 81: "rain.svg", 82: "rain.svg",
  95: "thunderstorms-rain.svg", 96: "thunderstorms-rain.svg", 99: "thunderstorms-rain.svg",
};

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
          const iconFile = WMO_ICON[code] || "clear-day.svg";
          iconAtual = `${WEATHER_ICON_BASE}/${iconFile}`;
        }
      } catch { /* silent */ }
    }

    // Rotação: 1 programa a cada 5 segundos
    const list = (programs || []);
    const rotationSlot = Math.floor(Date.now() / 5000);
    const current = list.length > 0 ? list[rotationSlot % list.length] : null;

    const programaNome = current?.nome || "";
    const programaDescricao = current?.descricao || "";
    const programaThumb = normalizeImageUrl(current?.thumb || current?.capa || "", 512);
    const programaLogo = normalizeImageUrl(current?.selo || "", 512);

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
