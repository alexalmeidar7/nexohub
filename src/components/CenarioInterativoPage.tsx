import { useState } from "react";
import { MonitorPlay, CloudSun, Car, DollarSign, MessageCircle, Plus, Trash2, Eye, Settings, Home, MapPin, Satellite, Sun, CalendarDays, Search } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

/* ─── types ─── */
interface WeatherConfig {
  enabled: boolean;
  showCurrent: boolean;
  showForecast3Days: boolean;
  showSatellite: boolean;
  city: string;
}

interface TrafficPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

interface TrafficConfig {
  enabled: boolean;
  city: string;
  points: TrafficPoint[];
}

interface CurrencyConfig {
  enabled: boolean;
  currencies: string[];
}

interface ChatConfig {
  enabled: boolean;
  youtubeVideoUrl: string;
}

interface CenarioConfig {
  weather: WeatherConfig;
  traffic: TrafficConfig;
  currency: CurrencyConfig;
  chat: ChatConfig;
}

const defaultConfig: CenarioConfig = {
  weather: { enabled: true, showCurrent: true, showForecast3Days: true, showSatellite: false, city: "" },
  traffic: { enabled: false, city: "", points: [] },
  currency: { enabled: true, currencies: ["USD", "EUR"] },
  chat: { enabled: false, youtubeVideoUrl: "" },
};

const CURRENCY_OPTIONS = [
  { value: "USD", label: "Dólar Comercial (USD)" },
  { value: "EUR", label: "Euro (EUR)" },
  { value: "GBP", label: "Libra Esterlina (GBP)" },
  { value: "ARS", label: "Peso Argentino (ARS)" },
  { value: "JPY", label: "Iene Japonês (JPY)" },
  { value: "BTC", label: "Bitcoin (BTC)" },
  { value: "ETH", label: "Ethereum (ETH)" },
];

/* ─── preview mock data ─── */
const mockWeather = { temp: 28, city: "São Paulo", icon: "☀️", forecast: [
  { day: "Seg", min: 19, max: 30, icon: "⛅" },
  { day: "Ter", min: 20, max: 31, icon: "🌧️" },
  { day: "Qua", min: 18, max: 27, icon: "⛅" },
]};

const mockCurrencies = [
  { code: "USD", name: "Dólar", value: "5,42", change: "+0,12%" },
  { code: "EUR", name: "Euro", value: "5,89", change: "-0,05%" },
];

const mockMessages = [
  { user: "João Silva", text: "Boa tarde! 🎉" },
  { user: "Maria", text: "Excelente programa hoje!" },
  { user: "Carlos", text: "Manda salve pra galera!" },
];

/* ─── COMPONENT ─── */
export default function CenarioInterativoPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<CenarioConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState("weather");
  const [weatherSubTab, setWeatherSubTab] = useState("today");
  const [trafficSearchCity, setTrafficSearchCity] = useState("");

  const updateWeather = (partial: Partial<WeatherConfig>) =>
    setConfig(c => ({ ...c, weather: { ...c.weather, ...partial } }));
  const updateTraffic = (partial: Partial<TrafficConfig>) =>
    setConfig(c => ({ ...c, traffic: { ...c.traffic, ...partial } }));
  const updateCurrency = (partial: Partial<CurrencyConfig>) =>
    setConfig(c => ({ ...c, currency: { ...c.currency, ...partial } }));
  const updateChat = (partial: Partial<ChatConfig>) =>
    setConfig(c => ({ ...c, chat: { ...c.chat, ...partial } }));

  const removeTrafficPoint = (id: string) =>
    updateTraffic({ points: config.traffic.points.filter(p => p.id !== id) });

  const toggleCurrency = (code: string) => {
    const has = config.currency.currencies.includes(code);
    updateCurrency({ currencies: has ? config.currency.currencies.filter(c => c !== code) : [...config.currency.currencies, code] });
  };

  const handleTrafficSearch = () => {
    if (!trafficSearchCity.trim()) return;
    updateTraffic({ city: trafficSearchCity.trim() });
  };

  const trafficMapCity = config.traffic.city || "São Paulo";
  const trafficMapUrl = `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d50000!2d-46.6333!3d-23.5505!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1spt-BR!2sbr!4v1&q=${encodeURIComponent(trafficMapCity)}&layer=traffic`;

  /* ─── header style ─── */
  const headerStyle = {
    background: "linear-gradient(135deg, var(--layout-header-bg, #0d0446), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))",
    color: "var(--layout-header-text, #ffffff)",
  };
  const pageStyle = {
    background: "var(--layout-page-bg, #ffffff)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)",
  };
  const textColor = "var(--layout-page-text, #1a1a1a)";
  const mutedText = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)";
  const subTabBg = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)";
  const subTabActive = "var(--layout-header-bg, #0d0446)";

  /* ─── RENDER ─── */
  return (
    <div className="animate-fade-in space-y-5">
      <div className="rounded-2xl overflow-hidden" style={pageStyle}>
        <div className="px-6 py-4 flex items-center gap-3" style={headerStyle}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
            <MonitorPlay size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold drop-shadow-sm">Cenário Interativo</h3>
            <p className="text-xs drop-shadow-sm" style={{ opacity: 0.8 }}>Configure os elementos do cenário para suas transmissões</p>
          </div>
        </div>

        <div className="p-5 flex flex-col lg:flex-row gap-6" style={{ color: textColor }}>

          {/* ── LEFT: Configuration ── */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-4">
              <Settings size={16} style={{ color: mutedText }} />
              <span className="text-sm font-semibold">Configuração</span>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-4 mb-4" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
                <TabsTrigger value="weather" className="text-xs gap-1 data-[state=active]:shadow-sm"><CloudSun size={14} /> Tempo</TabsTrigger>
                <TabsTrigger value="traffic" className="text-xs gap-1 data-[state=active]:shadow-sm"><Car size={14} /> Trânsito</TabsTrigger>
                <TabsTrigger value="currency" className="text-xs gap-1 data-[state=active]:shadow-sm"><DollarSign size={14} /> Cotação</TabsTrigger>
                <TabsTrigger value="chat" className="text-xs gap-1 data-[state=active]:shadow-sm"><MessageCircle size={14} /> Chat</TabsTrigger>
              </TabsList>

              {/* ═══ Weather ═══ */}
              <TabsContent value="weather" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Previsão do Tempo</Label>
                  <Switch checked={config.weather.enabled} onCheckedChange={v => updateWeather({ enabled: v })} />
                </div>

                {config.weather.enabled && (
                  <>
                    {/* Sub-tabs */}
                    <div className="flex gap-1 rounded-lg p-1" style={{ background: subTabBg }}>
                      {[
                        { key: "today", label: "Hoje", icon: <Sun size={13} /> },
                        { key: "forecast", label: "3 Dias", icon: <CalendarDays size={13} /> },
                        { key: "satellite", label: "Satélite", icon: <Satellite size={13} /> },
                      ].map(t => (
                        <button
                          key={t.key}
                          onClick={() => setWeatherSubTab(t.key)}
                          className="flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all"
                          style={{
                            background: weatherSubTab === t.key ? subTabActive : "transparent",
                            color: weatherSubTab === t.key ? "var(--layout-header-text, #fff)" : textColor,
                          }}
                        >
                          {t.icon} {t.label}
                        </button>
                      ))}
                    </div>

                    {/* Sub-tab: Hoje */}
                    {weatherSubTab === "today" && (
                      <div className="space-y-3">
                        <p className="text-xs" style={{ color: mutedText }}>
                          Exibe o tempo completo do dia atual: temperatura, umidade, vento, sensação térmica e condição climática.
                        </p>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Exibir tempo atual completo</Label>
                          <Switch checked={config.weather.showCurrent} onCheckedChange={v => updateWeather({ showCurrent: v })} />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block" style={{ color: mutedText }}>Cidade</Label>
                          <Input placeholder="Ex: São Paulo" value={config.weather.city} onChange={e => updateWeather({ city: e.target.value })} className="text-sm" />
                        </div>
                      </div>
                    )}

                    {/* Sub-tab: 3 Dias */}
                    {weatherSubTab === "forecast" && (
                      <div className="space-y-3">
                        <p className="text-xs" style={{ color: mutedText }}>
                          Exibe a previsão completa para os próximos 3 dias com temperaturas mínima e máxima, condição e ícone.
                        </p>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Exibir previsão 3 dias</Label>
                          <Switch checked={config.weather.showForecast3Days} onCheckedChange={v => updateWeather({ showForecast3Days: v })} />
                        </div>
                      </div>
                    )}

                    {/* Sub-tab: Satélite */}
                    {weatherSubTab === "satellite" && (
                      <div className="space-y-3">
                        <p className="text-xs" style={{ color: mutedText }}>
                          Exibe imagens de satélite meteorológico da região configurada.
                        </p>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Exibir imagens de satélite</Label>
                          <Switch checked={config.weather.showSatellite} onCheckedChange={v => updateWeather({ showSatellite: v })} />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block" style={{ color: mutedText }}>Cidade para satélite</Label>
                          <Input placeholder="Ex: São Paulo" value={config.weather.city} onChange={e => updateWeather({ city: e.target.value })} className="text-sm" />
                        </div>
                        {config.weather.showSatellite && (
                          <div className="rounded-lg overflow-hidden border" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }}>
                            <img
                              src={`https://satellite.imdl.es/imagery/GOES16_ABI/BAND13/-23.55/-46.63/4/latest.jpg`}
                              alt="Imagem de satélite"
                              className="w-full h-40 object-cover"
                              onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/400x200/1a1a2e/white?text=Satélite"; }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ═══ Traffic ═══ */}
              <TabsContent value="traffic" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Trânsito</Label>
                  <Switch checked={config.traffic.enabled} onCheckedChange={v => updateTraffic({ enabled: v })} />
                </div>
                {config.traffic.enabled && (
                  <>
                    {/* City search */}
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nome da cidade..."
                        value={trafficSearchCity}
                        onChange={e => setTrafficSearchCity(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleTrafficSearch()}
                        className="text-sm flex-1"
                      />
                      <Button size="sm" onClick={handleTrafficSearch} className="gap-1 text-xs" style={{ background: "var(--layout-header-bg, #0d0446)", color: "var(--layout-header-text, #fff)" }}>
                        <Search size={14} /> Buscar
                      </Button>
                    </div>

                    {/* Embedded map with traffic */}
                    <div className="rounded-lg overflow-hidden border" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }}>
                      <iframe
                        title="Mapa de Trânsito"
                        src={`https://www.google.com/maps/embed/v1/place?key=AIzaSyBFw0Qbyq9zTFTd-tUY6dZWTgaQzuU17R8&q=${encodeURIComponent(trafficMapCity)}&zoom=12&maptype=roadmap`}
                        className="w-full h-[280px] border-0"
                        allowFullScreen
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                      <p className="text-[10px] text-center py-1" style={{ color: mutedText }}>
                        Clique no mapa para marcar pontos de trânsito
                      </p>
                    </div>

                    {/* Marked points */}
                    {config.traffic.points.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <Label className="text-xs font-medium" style={{ color: mutedText }}>Pontos marcados</Label>
                        {config.traffic.points.map(p => (
                          <div key={p.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: subTabBg }}>
                            <MapPin size={12} style={{ color: mutedText }} />
                            <span className="flex-1 font-medium">{p.label}</span>
                            <button onClick={() => removeTrafficPoint(p.id)} className="opacity-60 hover:opacity-100"><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ═══ Currency ═══ */}
              <TabsContent value="currency" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Cotações</Label>
                  <Switch checked={config.currency.enabled} onCheckedChange={v => updateCurrency({ enabled: v })} />
                </div>
                {config.currency.enabled && (
                  <div className="space-y-2">
                    <p className="text-xs" style={{ color: mutedText }}>Selecione as moedas para exibir:</p>
                    {CURRENCY_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer text-sm hover:bg-black/5 transition-colors" style={{ background: config.currency.currencies.includes(opt.value) ? "color-mix(in srgb, var(--layout-header-bg, #0d0446) 10%, transparent)" : "transparent" }}>
                        <input type="checkbox" checked={config.currency.currencies.includes(opt.value)} onChange={() => toggleCurrency(opt.value)} className="accent-[var(--layout-header-bg)]" />
                        <DollarSign size={14} style={{ color: mutedText }} />
                        {opt.label}
                      </label>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* ═══ Chat ═══ */}
              <TabsContent value="chat" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Chat YouTube Live</Label>
                  <Switch checked={config.chat.enabled} onCheckedChange={v => updateChat({ enabled: v })} />
                </div>
                {config.chat.enabled && (
                  <div>
                    <Label className="text-xs mb-1 block" style={{ color: mutedText }}>URL do vídeo/live do YouTube</Label>
                    <Input placeholder="https://youtube.com/watch?v=..." value={config.chat.youtubeVideoUrl} onChange={e => updateChat({ youtubeVideoUrl: e.target.value })} className="text-sm" />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* ── RIGHT: 9:16 Preview ── */}
          <div className="lg:w-[320px] flex-shrink-0">
            <div className="flex items-center gap-2 mb-4">
              <Eye size={16} style={{ color: mutedText }} />
              <span className="text-sm font-semibold">Preview (9:16)</span>
            </div>

            <div
              className="relative rounded-2xl overflow-hidden mx-auto"
              style={{
                width: "100%",
                maxWidth: 300,
                aspectRatio: "9/16",
                boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                border: "2px solid rgba(255,255,255,0.08)",
              }}
            >
              <div className="absolute inset-0 flex" style={{ fontSize: 10 }}>
                {/* ── Dark sidebar ── */}
                <div className="w-[52px] flex-shrink-0 flex flex-col items-center py-4 gap-1" style={{ background: "#1a1a1a" }}>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center mb-2" style={{ background: "rgba(255,255,255,0.12)" }}>
                    <Home size={16} className="text-white" />
                  </div>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)", opacity: config.weather.enabled ? 1 : 0.35 }}>
                    <CloudSun size={16} className="text-white" />
                  </div>
                  {config.weather.enabled && config.weather.showForecast3Days && mockWeather.forecast.map((_, i) => (
                    <div key={i} className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "rgba(255,255,255,0.12)" }}>
                      {i + 1}
                    </div>
                  ))}
                  {config.weather.enabled && config.weather.showSatellite && (
                    <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)" }}>
                      <Satellite size={14} className="text-white" />
                    </div>
                  )}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center mt-2" style={{ background: "rgba(255,255,255,0.12)", opacity: config.traffic.enabled ? 1 : 0.35 }}>
                    <Car size={16} className="text-white" />
                  </div>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)", opacity: config.currency.enabled ? 1 : 0.35 }}>
                    <DollarSign size={16} className="text-white" />
                  </div>
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)", opacity: config.chat.enabled ? 1 : 0.35 }}>
                    <MessageCircle size={16} className="text-white" />
                  </div>
                </div>

                {/* ── Light content area ── */}
                <div className="flex-1" style={{ background: "#e8e8e8" }} />
              </div>

              {!config.weather.enabled && !config.traffic.enabled && !config.currency.enabled && !config.chat.enabled && (
                <div className="absolute inset-0 flex items-center justify-center text-center" style={{ background: "rgba(26,26,26,0.85)" }}>
                  <div className="text-white opacity-50">
                    <MonitorPlay size={28} className="mx-auto mb-2" />
                    <div className="text-[10px]">Ative os módulos para visualizar</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
