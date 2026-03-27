import { useState, useEffect } from "react";
import { MonitorPlay, CloudSun, Car, DollarSign, MessageCircle, Plus, Trash2, Eye, Settings, ChevronDown, ChevronUp, Home } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

/* ─── types ─── */
interface WeatherConfig {
  enabled: boolean;
  showCurrent: boolean;
  showForecast3Days: boolean;
  city: string;
}

interface TrafficPoint {
  id: string;
  label: string;
  address: string;
}

interface TrafficConfig {
  enabled: boolean;
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
  weather: { enabled: true, showCurrent: true, showForecast3Days: true, city: "" },
  traffic: { enabled: false, points: [] },
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
  const [newAddress, setNewAddress] = useState("");
  const [newAddressLabel, setNewAddressLabel] = useState("");

  /* persist / load could go to user_settings JSON later */

  const updateWeather = (partial: Partial<WeatherConfig>) =>
    setConfig(c => ({ ...c, weather: { ...c.weather, ...partial } }));
  const updateTraffic = (partial: Partial<TrafficConfig>) =>
    setConfig(c => ({ ...c, traffic: { ...c.traffic, ...partial } }));
  const updateCurrency = (partial: Partial<CurrencyConfig>) =>
    setConfig(c => ({ ...c, currency: { ...c.currency, ...partial } }));
  const updateChat = (partial: Partial<ChatConfig>) =>
    setConfig(c => ({ ...c, chat: { ...c.chat, ...partial } }));

  const addTrafficPoint = () => {
    if (!newAddress.trim()) return;
    const point: TrafficPoint = { id: crypto.randomUUID(), label: newAddressLabel || newAddress, address: newAddress };
    updateTraffic({ points: [...config.traffic.points, point] });
    setNewAddress("");
    setNewAddressLabel("");
  };

  const removeTrafficPoint = (id: string) =>
    updateTraffic({ points: config.traffic.points.filter(p => p.id !== id) });

  const toggleCurrency = (code: string) => {
    const has = config.currency.currencies.includes(code);
    updateCurrency({ currencies: has ? config.currency.currencies.filter(c => c !== code) : [...config.currency.currencies, code] });
  };

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

  /* ─── RENDER ─── */
  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
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

        {/* Body: config left + preview right */}
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

              {/* Weather */}
              <TabsContent value="weather" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Previsão do Tempo</Label>
                  <Switch checked={config.weather.enabled} onCheckedChange={v => updateWeather({ enabled: v })} />
                </div>
                {config.weather.enabled && (
                  <>
                    <div>
                      <Label className="text-xs mb-1 block" style={{ color: mutedText }}>Cidade</Label>
                      <Input placeholder="Ex: São Paulo" value={config.weather.city} onChange={e => updateWeather({ city: e.target.value })} className="text-sm" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Mostrar tempo atual</Label>
                      <Switch checked={config.weather.showCurrent} onCheckedChange={v => updateWeather({ showCurrent: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-sm">Mostrar próximos 3 dias</Label>
                      <Switch checked={config.weather.showForecast3Days} onCheckedChange={v => updateWeather({ showForecast3Days: v })} />
                    </div>
                  </>
                )}
              </TabsContent>

              {/* Traffic */}
              <TabsContent value="traffic" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Trânsito</Label>
                  <Switch checked={config.traffic.enabled} onCheckedChange={v => updateTraffic({ enabled: v })} />
                </div>
                {config.traffic.enabled && (
                  <>
                    <p className="text-xs" style={{ color: mutedText }}>Adicione endereços/pontos para exibir no cenário.</p>
                    <div className="space-y-2">
                      <Input placeholder="Rótulo (ex: Av. Paulista)" value={newAddressLabel} onChange={e => setNewAddressLabel(e.target.value)} className="text-sm" />
                      <Input placeholder="Endereço completo" value={newAddress} onChange={e => setNewAddress(e.target.value)} className="text-sm" />
                      <Button size="sm" onClick={addTrafficPoint} className="gap-1 text-xs" style={{ background: "var(--layout-header-bg, #0d0446)", color: "var(--layout-header-text, #fff)" }}>
                        <Plus size={14} /> Adicionar ponto
                      </Button>
                    </div>
                    {config.traffic.points.length > 0 && (
                      <div className="space-y-2 mt-2">
                        {config.traffic.points.map(p => (
                          <div key={p.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)" }}>
                            <Car size={12} style={{ color: mutedText }} />
                            <div className="flex-1 min-w-0">
                              <span className="font-medium">{p.label}</span>
                              <span className="block truncate" style={{ color: mutedText }}>{p.address}</span>
                            </div>
                            <button onClick={() => removeTrafficPoint(p.id)} className="opacity-60 hover:opacity-100"><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* Currency */}
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

              {/* Chat */}
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

            {/* 9:16 container */}
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
              {/* Layout: dark sidebar + light content area */}
              <div className="absolute inset-0 flex" style={{ fontSize: 10 }}>

                {/* ── Dark sidebar with icon buttons ── */}
                <div className="w-[52px] flex-shrink-0 flex flex-col items-center py-4 gap-1" style={{ background: "#1a1a1a" }}>
                  {/* Home */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center mb-2" style={{ background: "rgba(255,255,255,0.12)" }}>
                    <Home size={16} className="text-white" />
                  </div>

                  {/* Weather icon */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.12)", opacity: config.weather.enabled ? 1 : 0.35 }}>
                    <CloudSun size={16} className="text-white" />
                  </div>
                  {config.weather.enabled && config.weather.showForecast3Days && mockWeather.forecast.map((_, i) => (
                    <div key={i} className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ background: "rgba(255,255,255,0.12)" }}>
                      {i + 1}
                    </div>
                  ))}

                  {/* Traffic icon */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center mt-2" style={{ background: "rgba(255,255,255,0.12)", opacity: config.traffic.enabled ? 1 : 0.35 }}>
                    <Car size={16} className="text-white" />
                  </div>

                  {/* Currency icon */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)", opacity: config.currency.enabled ? 1 : 0.35 }}>
                    <DollarSign size={16} className="text-white" />
                  </div>

                  {/* Chat icon */}
                  <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)", opacity: config.chat.enabled ? 1 : 0.35 }}>
                    <MessageCircle size={16} className="text-white" />
                  </div>
                </div>

                {/* ── Light content area ── */}
                <div className="flex-1" style={{ background: "#e8e8e8" }}>
                  {/* Content would render here based on active sidebar item */}
                </div>
              </div>

              {/* Empty state overlay */}
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
