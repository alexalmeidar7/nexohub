import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { NexoRoundedWeather } from "./NexoRoundedWeather";
import "./NexoVisualLote5.css";
import { Settings2, Undo2 } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";

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
  const [nexoWeatherPending,setNexoWeatherPending]=useState(true);
  const [location, setLocation] = useState<Location | null>(previousLocation);
  const [open, setOpen] = useState(false);
  const [cep, setCep] = useState(storedCep);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [editingCep,setEditingCep] = useState(false);
  type CepAddress = {localidade:string;uf:string;estado?:string};
  const [previewAddress,setPreviewAddress] = useState<{digits:string;address:CepAddress}|null>(null);
  const [lookupStatus,setLookupStatus] = useState('');
  const lookupCache=useRef(new Map<string,Promise<CepAddress>>());
  const saveButton=useRef<HTMLButtonElement>(null);
  const lookupCep=(digits:string):Promise<CepAddress>=>{
    const cached=lookupCache.current.get(digits);if(cached)return cached;
    const promise=(async()=>{
      const response=await fetch('https://viacep.com.br/ws/'+digits+'/json/');
      if(!response.ok)throw Error('Não foi possível consultar o CEP.');
      const value=await response.json();
      if(value.erro||typeof value.localidade!=='string'||!value.localidade||typeof value.uf!=='string'||!value.uf)throw Error('CEP não encontrado.');
      return {localidade:value.localidade,uf:value.uf,estado:typeof value.estado==='string'?value.estado:undefined};
    })();
    if(lookupCache.current.size>=20)lookupCache.current.delete(lookupCache.current.keys().next().value!);
    lookupCache.current.set(digits,promise);
    void promise.catch(()=>{if(lookupCache.current.get(digits)===promise)lookupCache.current.delete(digits);});
    return promise;
  };
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);
  // nexo-lote8-cep: existing CEP never opens the IME automatically.
  useEffect(() => { if(open){if(codeDigits(storedCep()).length===8)saveButton.current?.focus({preventScroll:true});else input.current?.focus({preventScroll:true});} }, [open]);
  useEffect(()=>{
    if(!open)return;
    const digits=codeDigits(cep);let cancelled=false;
    setPreviewAddress(null);setLookupStatus('');
    if(digits.length!==8)return;
    const timer=window.setTimeout(()=>{
      setLookupStatus('Consultando CEP...');
      void lookupCep(digits).then(address=>{if(!cancelled){setPreviewAddress({digits,address});setLookupStatus('');}}).catch(error=>{if(!cancelled)setLookupStatus(error instanceof Error?error.message:'CEP indisponível.');});
    },200);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[open,cep]);
  const activateCepInput=()=>{
    setEditingCep(true);
    // A direct user gesture allows Android WebView to show its native keyboard.
    if(input.current){input.current.readOnly=false;input.current.focus({preventScroll:true});}
  };
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
      const address = await lookupCep(digits);
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

  useEffect(()=>{if(weather)setNexoWeatherPending(false);},[weather]);
  useEffect(()=>{const id=window.setTimeout(()=>setNexoWeatherPending(false),10000);return()=>clearTimeout(id);},[]);
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return <>
    <div className="nexo-tv-climate-header">
      <span className="nexo-tv-climate-clock" aria-label={`Horário atual ${time}`}>{time}</span>
      <span className="nexo-tv-climate-divider" aria-hidden="true">|</span>
      <button ref={trigger} className="nexo-tv-climate-trigger" type="button"
        aria-label="Configurar previsão do tempo pelo CEP"
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => { const saved=storedCep();setCep(saved);setEditingCep(codeDigits(saved).length!==8);setMessage("");setOpen(true); }}>
        <span className="nexo-tv-climate-glyph nexo-lote5-weather">{!weather || weather.code === null ? <span aria-label="Clima indisponível">—</span> : <NexoRoundedWeather code={weather.code} night={weather.isDay === false || (weather.isDay === null && (now.getHours() < 6 || now.getHours() >= 18))} />}</span>
        <span className="nexo-tv-climate-degree">{weather ? `${weather.temp}°` : nexoWeatherPending ? <span className="nexo-lote14-bone nexo-lote14-weather-bone" role="status" aria-label="Carregando temperatura"/> : "--°"}</span>
        <span className="nexo-tv-climate-settings" aria-hidden="true"><Settings2 strokeWidth={1.65}/></span>
      </button>
    </div>
    {open && createPortal(<div className="nexo-tv-cep-overlay" data-nexo-lote10-home={Boolean(trigger.current?.closest(".ott-home.ott-rail-layout"))} onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <section className="nexo-tv-cep-dialog" role="dialog" aria-modal="true" aria-label="Configurar tempo pelo CEP"
        onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); return; } if(["ArrowUp","ArrowDown"].includes(event.key)){const nodes=Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled)"));const at=nodes.indexOf(document.activeElement as HTMLElement);const next=nodes[at+(event.key==="ArrowUp"?-1:1)];if(next){event.preventDefault();next.focus({preventScroll:true});}} }}>
        <header>
          <h2>previsão do tempo</h2>
          <button type="button" onClick={close} aria-label="Voltar" className="ott-standard-back" disabled={saving}><Undo2 aria-hidden="true" strokeWidth={2.5}/></button>
        </header>
        <p>Informe seu CEP para buscar o tempo da sua região.</p>
        <form onSubmit={event => void saveCep(event)}>
          <input id="nexo-tv-weather-cep" aria-label="CEP" ref={input} type="text" inputMode="numeric" autoComplete="postal-code"
            placeholder="00000-000" maxLength={9} value={formatCep(cep)} readOnly={!editingCep} onClick={activateCepInput} onKeyDown={event=>{if(!editingCep&&(event.key==="Enter"||event.key===" ")){event.preventDefault();activateCepInput();}}} onChange={event => setCep(codeDigits(event.target.value))}/>
          {message && <p className="nexo-tv-cep-error" role="alert">{message}</p>}
          <button ref={saveButton} className="nexo-tv-cep-save" type="submit" disabled={saving}>{saving ? "localizando..." : "salvar CEP"}</button>
          <p className="nexo-lote8-cep-city" aria-live="polite">{previewAddress?.digits===codeDigits(cep)?'Tempo para: '+previewAddress.address.localidade+' / '+(previewAddress.address.estado||STATE_NAMES[previewAddress.address.uf]||previewAddress.address.uf):lookupStatus.startsWith('Consultando')?<span className="nexo-lote14-bone nexo-lote14-cep-bone" role="status" aria-label="Consultando CEP"/>:lookupStatus}</p>
        </form>
      </section>
    </div>, document.body)}
  </>;
}
