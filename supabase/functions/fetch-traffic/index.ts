import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function geocode(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1&accept-language=pt-BR`;
  const r = await fetch(url, { headers: { "User-Agent": "LovableVMIX/1.0" } });
  const data = await r.json();
  const first = data?.[0];
  if (!first) return null;
  return { lat: parseFloat(first.lat), lon: parseFloat(first.lon), name: first.display_name.split(",")[0] };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    let { city, lat, lon } = body || {};
    if ((lat == null || lon == null) && city) {
      const g = await geocode(String(city));
      if (g) { lat = g.lat; lon = g.lon; if (!city) city = g.name; }
    }
    if (lat == null || lon == null) {
      return new Response(JSON.stringify({ ok: false, error: "missing city/coords", jams: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const d = 0.18; // ~20km bounding box
    const url = `https://www.waze.com/live-map/api/georss?top=${lat + d}&bottom=${lat - d}&left=${lon - d}&right=${lon + d}&env=row&types=alerts,traffic`;
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Referer": "https://www.waze.com/live-map",
        "Accept": "application/json",
      },
    });
    const data = await r.json().catch(() => ({}));
    const jams = Array.isArray(data?.jams) ? data.jams : [];
    const top = jams
      .filter((j: any) => j && (j.street || j.city))
      .sort((a: any, b: any) => (b.delay || 0) - (a.delay || 0))
      .slice(0, 5)
      .map((j: any) => ({
        street: j.street || "Sem nome",
        city: j.city || "",
        delaySec: j.delay || 0,
        lengthM: j.length || 0,
        speedKmh: j.speed ? Math.round(j.speed * 3.6) : null,
        level: j.level || 0,
      }));
    return new Response(JSON.stringify({ ok: true, city: city || null, jams: top, updatedAt: new Date().toISOString() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), jams: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
