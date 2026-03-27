import { useState, useRef, useEffect, useCallback } from "react";
import { MonitorPlay, CloudSun, Car, DollarSign, MessageCircle, Trash2, Eye, Settings, Home, MapPin, Satellite, Sun, CalendarDays, Search, Upload, Image, Clock, Loader2, Droplets, Wind, Thermometer } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/* ─── types ─── */
interface WeatherConfig {
  enabled: boolean;
  showCurrent: boolean;
  showForecast3Days: boolean;
  showSatellite: boolean;
  city: string;
  bgImage: string;
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
  bgImage: string;
}

interface CurrencyConfig {
  enabled: boolean;
  currencies: string[];
  bgImage: string;
}

interface ChatConfig {
  enabled: boolean;
  youtubeVideoUrl: string;
  bgImage: string;
}

interface HomeConfig {
  bgImage: string;
}

interface CenarioConfig {
  city: string;
  home: HomeConfig;
  weather: WeatherConfig;
  traffic: TrafficConfig;
  currency: CurrencyConfig;
  chat: ChatConfig;
}

const defaultConfig: CenarioConfig = {
  city: "",
  home: { bgImage: "" },
  weather: { enabled: true, showCurrent: true, showForecast3Days: true, showSatellite: false, city: "", bgImage: "" },
  traffic: { enabled: false, city: "", points: [], bgImage: "" },
  currency: { enabled: true, currencies: ["USD", "EUR"], bgImage: "" },
  chat: { enabled: false, youtubeVideoUrl: "", bgImage: "" },
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

const weatherIcons: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️", 61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️", 80: "🌧️", 81: "🌧️", 82: "🌧️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};
const weatherLabels: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve", 75: "Neve forte",
  80: "Pancadas leves", 81: "Pancadas", 82: "Pancadas fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade severa",
};
function getWIcon(code: number) { return weatherIcons[code] ?? weatherIcons[Object.keys(weatherIcons).map(Number).reduce((a, b) => Math.abs(b - code) < Math.abs(a - code) ? b : a)] ?? "🌡️"; }
function getWLabel(code: number) { return weatherLabels[code] ?? weatherLabels[Object.keys(weatherLabels).map(Number).reduce((a, b) => Math.abs(b - code) < Math.abs(a - code) ? b : a)] ?? ""; }

interface LiveWeather {
  current: { temp: number; humidity: number; code: number };
  daily: { date: string; min: number; max: number; code: number; humidity: number; precip: number }[];
}

const mockCurrencies = [
  { code: "USD", name: "Dólar", value: "5,42", change: "+0,12%" },
  { code: "EUR", name: "Euro", value: "5,89", change: "-0,05%" },
];

const mockMessages = [
  { user: "João Silva", text: "Boa tarde! 🎉" },
  { user: "Maria", text: "Excelente programa hoje!" },
  { user: "Carlos", text: "Manda salve pra galera!" },
];

/* ─── BG Upload helper ─── */
async function uploadBgImage(file: File, userId: string, category: string): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `cenario/${userId}/${category}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("empresa-assets").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("empresa-assets").getPublicUrl(path);
  return data.publicUrl;
}

function BgImageUpload({ value, onChange, mutedText, userId, category }: { value: string; onChange: (v: string) => void; mutedText: string; userId?: string; category: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }
    if (!userId) { toast.error("Faça login para enviar imagens"); return; }
    setUploading(true);
    try {
      const url = await uploadBgImage(file, userId, category);
      onChange(url);
      toast.success("Imagem enviada!");
    } catch (err) {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1" style={{ color: mutedText }}>
        <Image size={12} /> Imagem de fundo
      </Label>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }}>
          <img src={value} alt="Fundo" className="w-full h-24 object-cover" />
          <button
            onClick={() => onChange("")}
            className="absolute top-1 right-1 rounded-full p-1"
            style={{ background: "rgba(0,0,0,0.6)" }}
          >
            <Trash2 size={12} className="text-white" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 py-4 text-xs transition-colors hover:opacity-80"
          style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 30%, transparent)", color: mutedText }}
        >
          <Upload size={16} />
          <span>{uploading ? "Enviando..." : "Clique para enviar imagem"}</span>
          <span className="text-[10px]">PNG, JPG (máx. 5MB)</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

/* ─── COMPONENT ─── */
export default function CenarioInterativoPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<CenarioConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState("home");
  const [weatherSubTab, setWeatherSubTab] = useState("today");
  const [trafficSearchCity, setTrafficSearchCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentProgram, setCurrentProgram] = useState<{ nome: string; id: string } | null>(null);
  const [sponsorLogos, setSponsorLogos] = useState<{ id: string; nome: string; logo_url: string }[]>([]);

  /* ─── Clock tick ─── */
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* ─── Fetch current program + sponsor logos ─── */
  useEffect(() => {
    if (!user?.id) return;
    const now = new Date();
    const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    const today = dayNames[now.getDay()];
    const nowTime = now.toTimeString().slice(0, 5);

    (async () => {
      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, horario_inicio, horario_fim, dias_semana")
        .eq("user_id", user.id)
        .eq("ativo", true);

      const onAir = progs?.find(p => {
        const dias = p.dias_semana || [];
        return dias.includes(today) && p.horario_inicio <= nowTime && p.horario_fim > nowTime;
      });

      if (onAir) {
        setCurrentProgram({ nome: onAir.nome, id: onAir.id });
        const { data: logos } = await supabase
          .from("logos_patrocinadores")
          .select("id, nome, logo_url")
          .eq("programa_id", onAir.id)
          .eq("user_id", user.id)
          .eq("ativo", true)
          .eq("excluido", false);
        setSponsorLogos(logos || []);
      } else {
        setCurrentProgram(null);
        setSponsorLogos([]);
      }
    })();
  }, [user?.id]);

  /* ─── Load from DB ─── */
  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("cenario_config" as any)
        .eq("user_id", user.id)
        .maybeSingle();
      if ((data as any)?.cenario_config && typeof (data as any).cenario_config === "object") {
        setConfig(prev => ({ ...prev, ...((data as any).cenario_config as Partial<CenarioConfig>) }));
      }
      setLoaded(true);
    })();
  }, [user?.id]);

  /* ─── Auto-save on config change (debounced) ─── */
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!user?.id || !loaded) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(async () => {
      setSaving(true);
      const payload = { user_id: user.id, cenario_config: config } as any;
      const { error } = await supabase
        .from("user_settings")
        .upsert(payload, { onConflict: "user_id" });
      if (error) {
        console.error("Erro ao salvar cenário:", error);
      }
      setSaving(false);
    }, 1500);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); };
  }, [config, user?.id, loaded]);

  const updateHome = (partial: Partial<HomeConfig>) =>
    setConfig(c => ({ ...c, home: { ...c.home, ...partial } }));
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

  const trafficMapCity = config.traffic.city || config.city || "São Paulo";
  const uid = user?.id;

  /* ─── styles ─── */
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
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Settings size={16} style={{ color: mutedText }} />
              <span className="text-sm font-semibold">Configuração</span>
              <div className="flex items-center gap-2 ml-auto">
                <div className="flex items-center gap-1.5 rounded-lg px-2 py-1 border" style={{ background: "var(--layout-page-bg, #ffffff)", borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 30%, transparent)" }}>
                  <MapPin size={13} style={{ color: mutedText }} />
                  <Input
                    placeholder="Cidade principal..."
                    value={config.city}
                    onChange={e => setConfig(c => ({ ...c, city: e.target.value }))}
                    className="text-xs h-7 w-36 border-0 bg-transparent p-0 focus-visible:ring-0"
                    style={{ color: textColor }}
                  />
                </div>
                {saving && <span className="text-[10px] animate-pulse" style={{ color: mutedText }}>Salvando...</span>}
                {!saving && loaded && <span className="text-[10px]" style={{ color: mutedText }}>✓ Salvo</span>}
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="w-full grid grid-cols-5 mb-4" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
                <TabsTrigger value="home" className="text-xs gap-1 data-[state=active]:shadow-sm"><Home size={14} /> Home</TabsTrigger>
                <TabsTrigger value="weather" className="text-xs gap-1 data-[state=active]:shadow-sm"><CloudSun size={14} /> Tempo</TabsTrigger>
                <TabsTrigger value="traffic" className="text-xs gap-1 data-[state=active]:shadow-sm"><Car size={14} /> Trânsito</TabsTrigger>
                <TabsTrigger value="currency" className="text-xs gap-1 data-[state=active]:shadow-sm"><DollarSign size={14} /> Cotação</TabsTrigger>
                <TabsTrigger value="chat" className="text-xs gap-1 data-[state=active]:shadow-sm"><MessageCircle size={14} /> Chat</TabsTrigger>
              </TabsList>

              {/* ═══ Home ═══ */}
              <TabsContent value="home" className="space-y-4">
                <p className="text-xs" style={{ color: mutedText }}>
                  Tela inicial: exibe hora atual, data e logos dos patrocinadores do programa no ar.
                </p>

                {/* Current program info */}
                <div className="rounded-lg p-3 text-sm" style={{ background: subTabBg }}>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock size={14} style={{ color: mutedText }} />
                    <span className="font-medium">Programa no ar</span>
                  </div>
                  {currentProgram ? (
                    <div className="space-y-1">
                      <span className="text-xs font-bold">{currentProgram.nome}</span>
                      {sponsorLogos.length > 0 && (
                        <div className="flex flex-wrap gap-2 mt-2">
                          {sponsorLogos.map(l => (
                            <div key={l.id} className="flex items-center gap-1 rounded px-2 py-1 text-[10px]" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)" }}>
                              {l.logo_url && <img src={l.logo_url} alt={l.nome} className="w-5 h-5 object-contain rounded" />}
                              <span>{l.nome}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs" style={{ color: mutedText }}>Nenhum programa no ar no momento</span>
                  )}
                </div>

                <BgImageUpload value={config.home.bgImage} onChange={v => updateHome({ bgImage: v })} mutedText={mutedText} userId={uid} category="home" />
              </TabsContent>

              {/* ═══ Weather ═══ */}
              <TabsContent value="weather" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Previsão do Tempo</Label>
                  <Switch checked={config.weather.enabled} onCheckedChange={v => updateWeather({ enabled: v })} />
                </div>

                {config.weather.enabled && (
                  <>
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
                          <Input placeholder="Ex: São Paulo" value={config.weather.city} onChange={e => updateWeather({ city: e.target.value })} className="text-sm" style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }} />
                        </div>
                      </div>
                    )}

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
                          <Input placeholder="Ex: São Paulo" value={config.weather.city} onChange={e => updateWeather({ city: e.target.value })} className="text-sm" style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }} />
                        </div>
                        {config.weather.showSatellite && (
                          <div className="rounded-lg overflow-hidden border" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }}>
                            <img
                              src="https://satellite.imdl.es/imagery/GOES16_ABI/BAND13/-23.55/-46.63/4/latest.jpg"
                              alt="Imagem de satélite"
                              className="w-full h-40 object-cover"
                              onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/400x200/1a1a2e/white?text=Satélite"; }}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <BgImageUpload value={config.weather.bgImage} onChange={v => updateWeather({ bgImage: v })} mutedText={mutedText} userId={uid} category="weather" />
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
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nome da cidade..."
                        value={trafficSearchCity}
                        onChange={e => setTrafficSearchCity(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleTrafficSearch()}
                        className="text-sm flex-1"
                        style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }}
                      />
                      <Button size="sm" onClick={handleTrafficSearch} className="gap-1 text-xs" style={{ background: "var(--layout-header-bg, #0d0446)", color: "var(--layout-header-text, #fff)" }}>
                        <Search size={14} /> Buscar
                      </Button>
                    </div>

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

                    <BgImageUpload value={config.traffic.bgImage} onChange={v => updateTraffic({ bgImage: v })} mutedText={mutedText} userId={uid} category="traffic" />
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
                  <div className="space-y-3">
                    <p className="text-xs" style={{ color: mutedText }}>Selecione as moedas para exibir:</p>
                    {CURRENCY_OPTIONS.map(opt => (
                      <label key={opt.value} className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer text-sm hover:bg-black/5 transition-colors" style={{ background: config.currency.currencies.includes(opt.value) ? "color-mix(in srgb, var(--layout-header-bg, #0d0446) 10%, transparent)" : "transparent" }}>
                        <input type="checkbox" checked={config.currency.currencies.includes(opt.value)} onChange={() => toggleCurrency(opt.value)} className="accent-[var(--layout-header-bg)]" />
                        <DollarSign size={14} style={{ color: mutedText }} />
                        {opt.label}
                      </label>
                    ))}
                    <BgImageUpload value={config.currency.bgImage} onChange={v => updateCurrency({ bgImage: v })} mutedText={mutedText} userId={uid} category="currency" />
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
                  <div className="space-y-3">
                    <Label className="text-xs mb-1 block" style={{ color: mutedText }}>URL do vídeo/live do YouTube</Label>
                    <Input placeholder="https://youtube.com/watch?v=..." value={config.chat.youtubeVideoUrl} onChange={e => updateChat({ youtubeVideoUrl: e.target.value })} className="text-sm" style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }} />
                    <BgImageUpload value={config.chat.bgImage} onChange={v => updateChat({ bgImage: v })} mutedText={mutedText} userId={uid} category="chat" />
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

                {/* ── Content area with bg image ── */}
                <div className="flex-1 relative" style={{ background: "#e8e8e8" }}>
                  {/* Show bg image based on active tab */}
                  {activeTab === "home" && config.home.bgImage && (
                    <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {activeTab === "weather" && config.weather.bgImage && (
                    <img src={config.weather.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {activeTab === "traffic" && config.traffic.bgImage && (
                    <img src={config.traffic.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {activeTab === "currency" && config.currency.bgImage && (
                    <img src={config.currency.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}
                  {activeTab === "chat" && config.chat.bgImage && (
                    <img src={config.chat.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  )}

                  {/* Home overlay: clock + date + logos */}
                  {activeTab === "home" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-3" style={{ color: config.home.bgImage ? "#fff" : "#333" }}>
                      <div className="text-3xl font-bold leading-none drop-shadow-md" style={{ fontVariantNumeric: "tabular-nums" }}>
                        {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                      <div className="text-[10px] mt-1 drop-shadow-sm opacity-80">
                        {currentTime.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                      </div>
                      {currentProgram && (
                        <div className="text-[9px] mt-2 font-semibold drop-shadow-sm opacity-90">
                          {currentProgram.nome}
                        </div>
                      )}
                      {sponsorLogos.length > 0 && (
                        <div className="flex flex-wrap justify-center gap-2 mt-3">
                          {sponsorLogos.map(l => (
                            l.logo_url && <img key={l.id} src={l.logo_url} alt={l.nome} className="w-8 h-8 object-contain rounded drop-shadow-md" style={{ background: "rgba(255,255,255,0.15)", padding: 2 }} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {!config.weather.enabled && !config.traffic.enabled && !config.currency.enabled && !config.chat.enabled && !config.home.bgImage && (
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
