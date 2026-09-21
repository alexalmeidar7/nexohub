/**
 * Weather & Geocoding Service with automatic multi-tier fallback.
 * Direct Open-Meteo + Nominatim support with zero external dependencies.
 */

export interface GeoResult {
  name: string;
  admin1?: string;
  country: string;
  latitude: number;
  longitude: number;
  display_name?: string;
}

export interface WeatherForecastResponse {
  ok: boolean;
  data?: any;
  error?: string;
}

/**
 * Robust geocoding search:
 * 1. Open-Meteo Geocoding (full query)
 * 2. Open-Meteo Geocoding (first segment if query has comma, e.g. "Goiânia, Goiás, Brasil" -> "Goiânia")
 * 3. OpenStreetMap Nominatim fallback
 */
export async function searchGeocode(query: string, count = 5): Promise<GeoResult[]> {
  const cleanQuery = (query || "").trim();
  if (cleanQuery.length < 2) return [];

  // 1. Try Open-Meteo Geocoding with full query
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleanQuery)}&count=${count}&language=pt&format=json`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.results) && data.results.length > 0) {
        return data.results.map((item: any) => ({
          name: item.name,
          admin1: item.admin1 || item.admin2 || "",
          country: item.country || "",
          latitude: Number(item.latitude),
          longitude: Number(item.longitude),
          display_name: [item.name, item.admin1, item.country].filter(Boolean).join(", "),
        }));
      }
    }
  } catch (err) {
    console.warn("[weatherService] Open-Meteo full search failed:", err);
  }

  // 2. If query has comma (e.g. "Goiânia, Goiás, Brasil"), try the primary city name
  if (cleanQuery.includes(",")) {
    const primaryPart = cleanQuery.split(",")[0].trim();
    if (primaryPart.length >= 2) {
      try {
        const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(primaryPart)}&count=${count}&language=pt&format=json`;
        const res = await fetch(url, { headers: { Accept: "application/json" } });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.results) && data.results.length > 0) {
            return data.results.map((item: any) => ({
              name: item.name,
              admin1: item.admin1 || item.admin2 || "",
              country: item.country || "",
              latitude: Number(item.latitude),
              longitude: Number(item.longitude),
              display_name: [item.name, item.admin1, item.country].filter(Boolean).join(", "),
            }));
          }
        }
      } catch (err) {
        console.warn("[weatherService] Open-Meteo segmented search failed:", err);
      }
    }
  }

  // 3. Fallback to OpenStreetMap Nominatim
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cleanQuery)}&format=json&limit=${count}&addressdetails=1&accept-language=pt-BR`;
    const res = await fetch(nomUrl, {
      headers: {
        Accept: "application/json",
        "User-Agent": "HouseMixWeather/1.0",
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.map((item: any) => ({
          name: (item.display_name || "").split(",")[0].trim() || item.name,
          admin1: item.address?.state || item.address?.city || "",
          country: item.address?.country || "",
          latitude: parseFloat(item.lat),
          longitude: parseFloat(item.lon),
          display_name: item.display_name,
        }));
      }
    }
  } catch (err) {
    console.warn("[weatherService] Nominatim search failed:", err);
  }

  return [];
}

/**
 * Fetch current weather and multi-day forecast from Open-Meteo
 */
export async function fetchWeatherForecast(
  lat: number,
  lon: number,
  forecastDays = 6
): Promise<WeatherForecastResponse> {
  if (lat == null || lon == null || isNaN(lat) || isNaN(lon)) {
    return { ok: false, error: "Coordenadas inválidas." };
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code,relative_humidity_2m_max,wind_speed_10m_max&timezone=auto&forecast_days=${forecastDays}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new Error(`Open-Meteo returned status ${res.status}`);
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err: any) {
    console.error("[weatherService] Forecast fetch failed:", err);
    return { ok: false, error: err?.message || "Erro ao obter previsão do tempo." };
  }
}

/**
 * Universal invoke function matching supabase.functions.invoke("fetch-weather", { body })
 */
export async function invokeWeatherFunction(body: any): Promise<{ data: any; error: any }> {
  try {
    const action = body?.action;

    if (action === "geocode") {
      const query = body?.query || "";
      const count = body?.count || 5;
      const results = await searchGeocode(query, count);
      return { data: { results }, error: null };
    }

    if (action === "forecast") {
      let lat = body?.lat;
      let lon = body?.lon;

      // Fallback coords if only user_id was passed
      if ((lat == null || lon == null) && body?.user_id) {
        try {
          const uid = body.user_id;
          const savedPrimary = localStorage.getItem(`masterview_primary_city_${uid}`) || localStorage.getItem(`nexohub_cidade_tempo_primary_${uid}`);
          if (savedPrimary) {
            const parsed = JSON.parse(savedPrimary);
            if (parsed?.lat != null && parsed?.lon != null) {
              lat = parsed.lat;
              lon = parsed.lon;
            }
          }
        } catch {}
      }

      // Default to Goiânia coordinates if still missing
      if (lat == null || lon == null) {
        lat = -16.67861;
        lon = -49.25389;
      }

      const forecastDays = body?.forecast_days || 6;
      const resp = await fetchWeatherForecast(lat, lon, forecastDays);
      if (resp.ok && resp.data) {
        return { data: resp, error: null };
      }
      return { data: null, error: new Error(resp.error || "Erro ao buscar previsão") };
    }

    return { data: null, error: new Error(`Ação desconhecida: ${action}`) };
  } catch (err: any) {
    return { data: null, error: err };
  }
}
