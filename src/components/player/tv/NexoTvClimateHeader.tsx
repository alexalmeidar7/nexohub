import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Moon, CloudMoon, Settings2, X } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { ClimateIcon } from "./NexoTvWeatherPanel";

const LOCATION_KEY = "nexo_tv_manual_city";
const CEP_KEY = "nexo_tv_manual_cep";
type Location = { lat: number; lon: number };
type Weather = { temp: number; code: number | null; isDay: boolean | null };
const STATE_NAMES: Record<string, string> = {
  AC:"Acre", AL:"Alagoas", AP:"Amapá", AM:"Amazonas", BA:"Bahia", CE:"Ceará",
  DF:"Distrito Federal", ES:"Espírito Santo", GO:"Goiás", MA:"Maranhão", MT:"Mato Grosso",
  MS:"Mato Grosso do Sul", MG:"Minas Gerais", PA:"Pará", PB:"Paraíba", PR:"Paraná",
  PE:"Pernambuco", PI:"Piauí", RJ:"Rio de Janeiro", RN:"Rio Grande do Norte",
  RS:"Rio Grande do Sul", RO:"Rondônia", RR:"Roraima", SC:"Santa Catarina",
  SP:"São Paulo", SE:"Sergipe", TO:"Tocantins",
};
const normalized = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function previousLocation(): Location | null {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(LOCATION_KEY) || "null");
    if (data && typeof data === "object" && "lat" in data && "lon" in data &&
        typeof data.lat === "number" && typeof data.lon === "number") {
      return { lat: data.lat, lon: data.lon };
    }
  } catch { /* Armazenamento indisponível */ }
  return null;
}
function storedCep(): string {
  try { return localStorage.getItem(CEP_KEY) || ""; } catch { return ""; }
}
function codeDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}
function formatCep(value: string) {
  const digits = codeDigits(value);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export default function NexoTvClimateHeader({ radioUserId }: { radioUserId?: string | null }) {
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<Weather | null>(null);
  const [location, setLocation] = useState<Location | null>(previousLocation);
  const [open, setOpen] = useState(false);
  const [cep, setCep] = useState(storedCep);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => { if (open) input.current?.focus({ preventScroll: true }); }, [open]);
  useEffect(() => {
    let cancelled = false;
    async function updateWeather() {
      try {
        let coordinates = location;
        if (!coordinates && typeof navigator !== "undefined" && "geolocation" in navigator) {
          coordinates = await new Promise<Location | null>(resolve => navigator.geolocation.getCurrentPosition(
            pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
            () => resolve(null), { timeout: 5000, maximumAge: 300000, enableHighAccuracy: false },
          ));
        }
        if (cancelled || (!coordinates && !radioUserId)) return;
        const body = coordinates
          ? { action: "forecast", lat: coordinates.lat, lon: coordinates.lon, forecast_days: 1 }
          : { action: "forecast", user_id: radioUserId, forecast_days: 1 };
        const { data, error } = await playerSupabase.functions.invoke("fetch-weather", { body });
        if (error || !data?.ok) throw error || new Error("Clima indisponível");
        const current = data?.data?.current;
        if (typeof current?.temperature_2m !== "number") throw new Error("Temperatura indisponível");
        if (!cancelled) setWeather({
          temp: Math.round(current.temperature_2m),
          code: typeof current.weather_code === "number" ? current.weather_code : null,
          isDay: typeof current.is_day === "number" ? current.is_day === 1 : null,
        });
      } catch {
        if (!cancelled) setWeather(null);
      }
    }
    void updateWeather();
    const interval = window.setInterval(() => void updateWeather(), 300000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [radioUserId, location]);

  const close = () => { if (saving) return; setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  async function saveCep(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const digits = codeDigits(cep);
    if (digits.length !== 8) { setMessage("Digite um CEP válido com 8 números."); return; }
    setSaving(true);
    setMessage("");
    try {
      const addressResponse = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!addressResponse.ok) throw new Error("Não foi possível consultar o CEP.");
      const address: { erro?: boolean; localidade?: string; uf?: string; estado?: string } = await addressResponse.json();
      if (address.erro || !address.localidade || !address.uf) throw new Error("CEP não encontrado.");
      const { data, error } = await playerSupabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query: address.localidade, count: 20 },
      });
      if (error || !Array.isArray(data?.results)) throw new Error("Não foi possível localizar sua cidade.");
      type GeocodedCity = { latitude?: number; longitude?: number; admin1?: string; country_code?: string };
      const brazil = (data.results as GeocodedCity[]).filter(item =>
        Number.isFinite(item.latitude) && Number.isFinite(item.longitude) &&
        (!item.country_code || item.country_code === "BR"));
      const stateName = normalized(address.estado || STATE_NAMES[address.uf] || address.uf);
      const match = brazil.find(item => item.admin1 && normalized(item.admin1) === stateName);
      // Não salvar um município homônimo de outro estado.
      if (!match) throw new Error("Não foi possível confirmar a cidade e o estado deste CEP.");
      const coordinates = { lat: match.latitude as number, lon: match.longitude as number };
      // Salva o CEP e as coordenadas da cidade para o serviço existente de clima.
      localStorage.setItem(LOCATION_KEY, JSON.stringify(coordinates));
      localStorage.setItem(CEP_KEY, digits);
      setLocation(coordinates);
      window.dispatchEvent(new Event("nexo-tv-weather-location-changed"));
      setMessage("");
      setOpen(false);
      trigger.current?.focus({ preventScroll: true });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Não foi possível salvar o CEP.");
    } finally { setSaving(false); }
  }

  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return <>
    <div className="nexo-tv-climate-header">
      <span className="nexo-tv-climate-clock" aria-label={`Horário atual ${time}`}>{time}</span>
      <span className="nexo-tv-climate-divider" aria-hidden="true">|</span>
      <button ref={trigger} className="nexo-tv-climate-trigger" type="button"
        aria-label="Configurar previsão do tempo pelo CEP"
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => { setCep(storedCep()); setMessage(""); setOpen(true); }}>
        <span className="nexo-tv-climate-glyph">{!weather || weather.code === null ? <span aria-label="Clima indisponível">—</span> : (weather.isDay === false || (weather.isDay === null && (now.getHours() < 6 || now.getHours() >= 18))) && weather.code <= 2
          ? (weather.code === 0 ? <Moon strokeWidth={1.65} aria-hidden="true"/> : <CloudMoon strokeWidth={1.65} aria-hidden="true"/>)
          : <ClimateIcon code={weather.code}/>}</span>
        <span className="nexo-tv-climate-degree">{weather ? `${weather.temp}°` : "--°"}</span>
        <span className="nexo-tv-climate-settings" aria-hidden="true"><Settings2 strokeWidth={1.65}/></span>
      </button>
    </div>
    {open && createPortal(<div className="nexo-tv-cep-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="nexo-tv-cep-dialog" role="dialog" aria-modal="true" aria-label="Configurar tempo pelo CEP"
        onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); } }}>
        <header>
          <h2>previsão do tempo</h2>
          <button type="button" onClick={close} aria-label="Fechar" disabled={saving}><X aria-hidden="true"/></button>
        </header>
        <p>Informe seu CEP para buscar o tempo da sua região.</p>
        <form onSubmit={event => void saveCep(event)}>
          <input id="nexo-tv-weather-cep" aria-label="CEP" ref={input} type="text" inputMode="numeric" autoComplete="postal-code"
            placeholder="00000-000" maxLength={9} value={formatCep(cep)} onChange={event => setCep(codeDigits(event.target.value))}/>
          {message && <p className="nexo-tv-cep-error" role="alert">{message}</p>}
          <button className="nexo-tv-cep-save" type="submit" disabled={saving}>{saving ? "localizando..." : "salvar CEP"}</button>
        </form>
      </section>
    </div>, document.body)}
  </>;
}
