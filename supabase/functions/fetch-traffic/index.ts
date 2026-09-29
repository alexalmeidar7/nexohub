import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TOMTOM_KEY = Deno.env.get("TOMTOM_API_KEY") || "";


async function geocode(city: string): Promise<{ lat: number; lon: number; name: string } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1&accept-language=pt-BR`;
    const r = await fetch(url, { headers: { "User-Agent": "LovableVMIX/1.0" } });
    const data = await r.json();
    const first = data?.[0];
    if (!first) return null;
    return { lat: parseFloat(first.lat), lon: parseFloat(first.lon), name: first.display_name.split(",")[0] };
  } catch {
    return null;
  }
}

function magToLevel(magnitude: number): number {
  // TomTom magnitudeOfDelay: 0 unknown, 1 minor, 2 moderate, 3 major, 4 undefined/severe
  if (magnitude >= 4) return 5;
  if (magnitude === 3) return 4;
  if (magnitude === 2) return 3;
  if (magnitude === 1) return 2;
  return 1;
}

function iconCategoryLabel(cat: number): string {
  // TomTom iconCategory -> pt-BR
  const map: Record<number, string> = {
    0: "Desconhecido",
    1: "Acidente",
    2: "Nevoeiro",
    3: "Condições perigosas",
    4: "Chuva",
    5: "Gelo",
    6: "Congestionamento",
    7: "Faixa fechada",
    8: "Estrada fechada",
    9: "Obras",
    10: "Vento",
    11: "Alagamento",
    14: "Veículo quebrado",
  };
  return map[cat] || "Incidente";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (!TOMTOM_KEY) {
      return new Response(JSON.stringify({ ok: false, error: "No traffic API key configured", jams: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }



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

    // TomTom Traffic Incident Details v5 (fallback)
    const d = 0.22;
    const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
    const fields =
      "{incidents{type,geometry{type,coordinates},properties{iconCategory,magnitudeOfDelay,startTime,endTime,from,to,length,delay,roadNumbers,events{description,code,iconCategory}}}}";
    const url = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${encodeURIComponent(bbox)}&fields=${encodeURIComponent(fields)}&language=pt-PT&t=1111&timeValidityFilter=present&key=${TOMTOM_KEY}`;

    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      return new Response(JSON.stringify({ ok: true, source: "tomtom", error: `TomTom ${r.status}: ${txt.slice(0, 200)}`, city: city || null, center: { lat, lon }, jams: [], updatedAt: new Date().toISOString() }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await r.json();
    const incidents: any[] = Array.isArray(data?.incidents) ? data.incidents : [];

    const jams = incidents
      .map((it) => {
        const p = it?.properties || {};
        const streetFrom = p.from || "";
        const streetTo = p.to || "";
        const road = Array.isArray(p.roadNumbers) && p.roadNumbers.length ? p.roadNumbers.join(", ") : "";
        const eventDesc = Array.isArray(p.events) && p.events[0]?.description ? p.events[0].description : "";
        const iconCat = typeof p.iconCategory === "number" ? p.iconCategory : 0;
        let street = road || streetFrom || streetTo || eventDesc || "Via";
        if (streetFrom && streetTo && !road) street = `${streetFrom} → ${streetTo}`;

        // Extract representative lat/lon from geometry (LineString or MultiLineString)
        let jLat: number | null = null;
        let jLon: number | null = null;
        const g = it?.geometry;
        if (g?.type === "LineString" && Array.isArray(g.coordinates) && g.coordinates.length) {
          const mid = g.coordinates[Math.floor(g.coordinates.length / 2)];
          if (Array.isArray(mid) && mid.length >= 2) { jLon = mid[0]; jLat = mid[1]; }
        } else if (g?.type === "MultiLineString" && Array.isArray(g.coordinates) && g.coordinates[0]?.length) {
          const line = g.coordinates[0];
          const mid = line[Math.floor(line.length / 2)];
          if (Array.isArray(mid) && mid.length >= 2) { jLon = mid[0]; jLat = mid[1]; }
        } else if (g?.type === "Point" && Array.isArray(g.coordinates) && g.coordinates.length >= 2) {
          jLon = g.coordinates[0]; jLat = g.coordinates[1];
        }

        return {
          street,
          city: city || "",
          delaySec: typeof p.delay === "number" ? p.delay : 0,
          lengthM: typeof p.length === "number" ? p.length : 0,
          speedKmh: null as number | null,
          level: magToLevel(typeof p.magnitudeOfDelay === "number" ? p.magnitudeOfDelay : 0),
          type: iconCategoryLabel(iconCat),
          typeCode: String(iconCat),
          description: eventDesc,
          startTime: p.startTime || null,
          endTime: p.endTime || null,
          lat: jLat,
          lon: jLon,
        };
      })
      .filter((j) => j.street && j.street !== "Via")
      .sort((a, b) => {
        // priority: delay desc, then level desc, then length desc
        if (b.delaySec !== a.delaySec) return b.delaySec - a.delaySec;
        if (b.level !== a.level) return b.level - a.level;
        return b.lengthM - a.lengthM;
      })
      .slice(0, 10);

    return new Response(
      JSON.stringify({ ok: true, source: "tomtom", city: city || null, center: { lat, lon }, jams, updatedAt: new Date().toISOString() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e), jams: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
