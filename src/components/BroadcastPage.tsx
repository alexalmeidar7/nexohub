import { useState, useEffect, useMemo } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Instagram, Globe, MessageCircle, Facebook, Youtube, Phone, Newspaper, CloudSun, Search } from "lucide-react";

/** Extract @username from a URL or handle string */
function extractHandle(value: string): string {
  const clean = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(clean.startsWith("http") ? clean : `https://${clean}`);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      return `@${last.replace(/^@/, "")}`;
    }
  } catch { /* not a URL */ }
  return `@${clean.replace(/^@/, "")}`;
}

const WMO_LABELS: Record<number, string> = {
  0: "Céu limpo", 1: "Poucas nuvens", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Nevoeiro", 48: "Nevoeiro com geada", 51: "Garoa leve", 53: "Garoa moderada",
  55: "Garoa intensa", 61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve moderada", 75: "Neve forte", 80: "Pancadas leves",
  81: "Pancadas moderadas", 82: "Pancadas fortes", 95: "Trovoadas", 96: "Trovoadas com granizo",
};

interface BroadcastData {
  assunto: string;
  ticker: string;
  locutor_override: string;
  tickerNews: boolean;
  tickerWeather: boolean;
  showQrCode: boolean;
}

const defaultBroadcast: BroadcastData = {
  assunto: "",
  ticker: "",
  locutor_override: "",
  tickerNews: false,
  tickerWeather: false,
  showQrCode: false,
};

interface SocialItem {
  tipo: string;
  valor: string;
  icon: React.ReactNode;
}

export default function BroadcastPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<BroadcastData>(defaultBroadcast);
  const [saving, setSaving] = useState(false);
  const [empresaLogo, setEmpresaLogo] = useState<string | null>(null);
  const [programaLogo, setProgramaLogo] = useState<string | null>(null);
  const [locutorFoto, setLocutorFoto] = useState<string | null>(null);
  const [locutorNome, setLocutorNome] = useState("");
  const [locutorCargo, setLocutorCargo] = useState("");
  const [locutorInstagram, setLocutorInstagram] = useState("");
  const [programaNome, setProgramaNome] = useState("");
  const [accentColor, setAccentColor] = useState("#dc2626");
  const [empresaSocials, setEmpresaSocials] = useState<SocialItem[]>([]);
  const [locutorSearchResults, setLocutorSearchResults] = useState<{nome: string; instagram: string; foto: string | null}[]>([]);
  const [showLocutorDropdown, setShowLocutorDropdown] = useState(false);

  // Ticker auto-content
  const [newsTitles, setNewsTitles] = useState<string[]>([]);
  const [weatherText, setWeatherText] = useState("");

  // Load data
  useEffect(() => {
    if (!user) return;
    (async () => {
      // Empresa config (logo + socials)
      const { data: emp } = await supabase
        .from("empresa_config")
        .select("logo, nome, instagram, facebook, youtube, site, telefone_participacao")
        .eq("user_id", user.id)
        .maybeSingle();

      if (emp?.logo) setEmpresaLogo(emp.logo);

      // Build social list from empresa_config
      const socials: SocialItem[] = [];
      if (emp?.instagram) socials.push({ tipo: "instagram", valor: extractHandle(emp.instagram), icon: <Instagram size={11} /> });
      if (emp?.facebook) socials.push({ tipo: "facebook", valor: extractHandle(emp.facebook), icon: <Facebook size={11} /> });
      if (emp?.youtube) socials.push({ tipo: "youtube", valor: extractHandle(emp.youtube), icon: <Youtube size={11} /> });
      if (emp?.site) socials.push({ tipo: "site", valor: extractHandle(emp.site), icon: <Globe size={11} /> });
      if (emp?.telefone_participacao) socials.push({ tipo: "whatsapp", valor: emp.telefone_participacao, icon: <MessageCircle size={11} /> });
      setEmpresaSocials(socials);

      // Current program
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const nowTime = `${hh}:${mm}`;

      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, selo, apresentadores_ids, apresentador_id")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .lte("horario_inicio", nowTime)
        .gte("horario_fim", nowTime);

      const prog = progs?.find(() => true);
      if (prog) {
        setProgramaNome(prog.nome);
        if (prog.selo) setProgramaLogo(prog.selo);

        const apIds = prog.apresentadores_ids || (prog.apresentador_id ? [prog.apresentador_id] : []);
        if (apIds.length > 0) {
          const { data: ap } = await supabase.from("apresentadores").select("nome, foto, instagram, cargo").in("id", apIds).limit(1).maybeSingle();
          if (ap) {
            setLocutorNome(ap.nome);
            if (ap.foto) setLocutorFoto(ap.foto);
            if (ap.instagram) setLocutorInstagram(ap.instagram);
            if (ap.cargo) setLocutorCargo(ap.cargo);
          }
        }
      }

      // Accent color
      const { data: settings } = await supabase.from("user_settings").select("dashboard_items, weather_city, weather_lat, weather_lon").eq("user_id", user.id).maybeSingle();
      if (settings?.dashboard_items && typeof settings.dashboard_items === "object") {
        const lc = (settings.dashboard_items as any).layout_colors;
        if (lc?.accentColor) setAccentColor(lc.accentColor);
      }

      // Fetch ticker titles from latest journalistic roteiro
      const { data: latestRoteiro } = await supabase
        .from("roteiros")
        .select("tickertitulos, conteudo_html")
        .eq("user_id", user.id)
        .eq("tipo_programa", "Jornalístico")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestRoteiro) {
        if (latestRoteiro.tickertitulos) {
          setNewsTitles(latestRoteiro.tickertitulos.split("  •  ").filter(Boolean));
        } else if (latestRoteiro.conteudo_html) {
          const matches = latestRoteiro.conteudo_html.match(/<strong>Notícia\s*\d+:<\/strong>\s*([^<]+)/g);
          if (matches) {
            const titles = matches.map((m: string) => m.replace(/<strong>Notícia\s*\d+:<\/strong>\s*/, "").trim()).filter(Boolean);
            setNewsTitles(titles);
          }
        }
      }

      // Fetch weather
      if (settings?.weather_lat && settings?.weather_lon) {
        try {
          const { data: wxResp } = await supabase.functions.invoke("fetch-weather", {
            body: { action: "forecast", lat: settings.weather_lat, lon: settings.weather_lon, forecast_days: 2 },
          });
          if (wxResp?.ok && wxResp.data) {
            const d = wxResp.data;
            const currentTemp = d.current?.temperature_2m;
            const currentCode = d.current?.weather_code;
            const currentLabel = WMO_LABELS[currentCode] || "—";
            const tomorrow = d.daily;
            let tomorrowPart = "";
            if (tomorrow?.temperature_2m_min?.[1] !== undefined) {
              const tMin = Math.round(tomorrow.temperature_2m_min[1]);
              const tMax = Math.round(tomorrow.temperature_2m_max[1]);
              const tCode = tomorrow.weather_code?.[1];
              const tLabel = WMO_LABELS[tCode] || "—";
              tomorrowPart = ` | Amanhã: ${tMin}°–${tMax}° ${tLabel}`;
            }
            const cityName = settings.weather_city || "";
            setWeatherText(`${cityName ? cityName + ": " : ""}Agora ${Math.round(currentTemp)}° ${currentLabel}${tomorrowPart}`);
          }
        } catch { /* silent */ }
      }

      // Load saved broadcast data
      const { data: us } = await supabase.from("user_settings").select("cenario_config").eq("user_id", user.id).maybeSingle();
      if (us?.cenario_config && typeof us.cenario_config === "object") {
        const bc = (us.cenario_config as any).broadcast;
        if (bc) setData({ ...defaultBroadcast, ...bc });
      }
    })();
  }, [user]);

  // Compose ticker from sources
  const composedTicker = useMemo(() => {
    const parts: string[] = [];
    if (data.tickerNews && newsTitles.length > 0) {
      parts.push(newsTitles.join("  •  "));
    }
    if (data.tickerWeather && weatherText) {
      parts.push(weatherText);
    }
    if (data.ticker) {
      parts.push(data.ticker);
    }
    return parts.join("  •  ");
  }, [data.tickerNews, data.tickerWeather, data.ticker, newsTitles, weatherText]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { data: current } = await supabase.from("user_settings").select("cenario_config").eq("user_id", user.id).maybeSingle();
      const existing = (current?.cenario_config && typeof current.cenario_config === "object") ? current.cenario_config as Record<string, any> : {};
      
      await supabase.from("user_settings").update({
        cenario_config: { ...existing, broadcast: data } as any,
      }).eq("user_id", user.id);

      toast({ title: "Broadcast salvo com sucesso!" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    }
    setSaving(false);
  };

  const displayLocutor = data.locutor_override || locutorNome || "Locutor";

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* ── Left: Form ── */}
      <div className="w-[340px] shrink-0 space-y-4 overflow-y-auto pr-2" style={{ maxHeight: "calc(100vh - 200px)" }}>
        <h2 className="text-sm font-bold uppercase tracking-widest" style={{ color: "#aaa" }}>Configurar Broadcast</h2>

        {/* Assunto */}
        <div className="space-y-1">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Assunto / Título</label>
          <input
            type="text"
            value={data.assunto}
            onChange={e => setData({ ...data, assunto: e.target.value })}
            placeholder="Base para assunto"
            className="w-full px-3 py-2 rounded-lg text-sm outline-none"
            style={{ backgroundColor: "#1e1e24", color: "#e0e0e0", border: "1px solid #ffffff10" }}
          />
        </div>

        {/* Locutor override */}
        <div className="space-y-1 relative">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Nome do Locutor (override)</label>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#666" }} />
            <input
              type="text"
              value={data.locutor_override}
              onChange={async e => {
                const val = e.target.value;
                setData({ ...data, locutor_override: val });
                if (val.trim().length >= 2 && user) {
                  const { data: results } = await supabase
                    .from("apresentadores")
                    .select("nome, instagram, foto")
                    .eq("user_id", user.id)
                    .ilike("nome", `%${val.trim()}%`)
                    .limit(5);
                  setLocutorSearchResults(results || []);
                  setShowLocutorDropdown(true);
                } else {
                  setLocutorSearchResults([]);
                  setShowLocutorDropdown(false);
                }
              }}
              onFocus={() => { if (locutorSearchResults.length > 0) setShowLocutorDropdown(true); }}
              onBlur={() => setTimeout(() => setShowLocutorDropdown(false), 200)}
              placeholder={locutorNome || "Buscar locutor..."}
              className="w-full pl-7 pr-3 py-2 rounded-lg text-sm outline-none"
              style={{ backgroundColor: "#1e1e24", color: "#e0e0e0", border: "1px solid #ffffff10" }}
            />
          </div>
          {showLocutorDropdown && locutorSearchResults.length > 0 && (
            <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden" style={{ backgroundColor: "#1e1e24", border: "1px solid #ffffff20" }}>
              {locutorSearchResults.map((r, i) => (
                <button
                  key={i}
                  onMouseDown={e => {
                    e.preventDefault();
                    setData({ ...data, locutor_override: r.nome });
                    if (r.instagram) setLocutorInstagram(r.instagram.startsWith("@") ? r.instagram : `@${r.instagram}`);
                    if (r.foto) setLocutorFoto(r.foto);
                    setShowLocutorDropdown(false);
                    setLocutorSearchResults([]);
                  }}
                  className="w-full text-left px-3 py-2 text-xs hover:brightness-125 transition-all flex items-center gap-2"
                  style={{ color: "#e0e0e0", borderBottom: i < locutorSearchResults.length - 1 ? "1px solid #ffffff10" : "none" }}
                >
                  {r.foto && <img src={r.foto} alt="" className="w-6 h-6 rounded-full object-cover" />}
                  <span className="font-semibold flex-1 truncate">{r.nome}</span>
                  {r.instagram && <span className="text-[10px]" style={{ color: accentColor }}>@{r.instagram.replace("@", "")}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Redes Sociais (read-only from empresa_config) */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Redes Sociais (da empresa)</label>
          {empresaSocials.length === 0 ? (
            <p className="text-[10px]" style={{ color: "#555" }}>Nenhuma rede social cadastrada em Configurações.</p>
          ) : (
            <div className="space-y-1.5">
              {empresaSocials.map((s, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#1e1e24", border: "1px solid #ffffff08" }}>
                  <span style={{ color: accentColor }}>{s.icon}</span>
                  <span className="text-xs" style={{ color: "#ccc" }}>{s.valor}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ticker Sources */}
        <div className="space-y-2">
          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#888" }}>Conteúdo do Ticker</label>

          {/* News check */}
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer" style={{ backgroundColor: "#1e1e24", border: `1px solid ${data.tickerNews ? accentColor + "60" : "#ffffff08"}` }}>
            <input
              type="checkbox"
              checked={data.tickerNews}
              onChange={e => setData({ ...data, tickerNews: e.target.checked })}
              className="accent-current"
              style={{ accentColor }}
            />
            <Newspaper size={13} style={{ color: data.tickerNews ? accentColor : "#666" }} />
            <div>
              <span className="text-xs font-semibold" style={{ color: data.tickerNews ? "#e0e0e0" : "#888" }}>Notícias</span>
              <p className="text-[9px]" style={{ color: "#555" }}>Títulos das últimas notícias selecionadas</p>
            </div>
          </label>

          {/* Weather check */}
          <label className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer" style={{ backgroundColor: "#1e1e24", border: `1px solid ${data.tickerWeather ? accentColor + "60" : "#ffffff08"}` }}>
            <input
              type="checkbox"
              checked={data.tickerWeather}
              onChange={e => setData({ ...data, tickerWeather: e.target.checked })}
              className="accent-current"
              style={{ accentColor }}
            />
            <CloudSun size={13} style={{ color: data.tickerWeather ? accentColor : "#666" }} />
            <div>
              <span className="text-xs font-semibold" style={{ color: data.tickerWeather ? "#e0e0e0" : "#888" }}>Previsão do Tempo</span>
              <p className="text-[9px]" style={{ color: "#555" }}>Tempo atual e previsão para amanhã</p>
            </div>
          </label>

          {/* Manual ticker text */}
          <textarea
            value={data.ticker}
            onChange={e => setData({ ...data, ticker: e.target.value })}
            placeholder="Texto adicional do ticker (opcional)..."
            rows={2}
            className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
            style={{ backgroundColor: "#1e1e24", color: "#e0e0e0", border: "1px solid #ffffff10" }}
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: "#dc2626", color: "#fff" }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Salvar Broadcast
        </button>
      </div>

      {/* ── Right: Mockup Preview ── */}
      <div className="flex-1 flex items-center justify-center">
        <div
          className="relative w-full rounded-xl overflow-hidden"
          style={{
            aspectRatio: "16/9",
            maxWidth: 900,
            backgroundColor: "#000",
            border: "1px solid #ffffff10",
          }}
        >
          {/* Top left: Logo empresa */}
          <div className="absolute" style={{ top: "5%", left: "4%" }}>
            {empresaLogo ? (
              <img src={empresaLogo} alt="Logo" className="h-12 w-12 rounded-full object-cover" style={{ border: `2px solid ${accentColor}` }} />
            ) : (
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: accentColor, color: "#000" }}>
                LOGO
              </div>
            )}
            <span className="text-[9px] font-bold mt-1 block" style={{ color: "#fff" }}>LOGO DA EMPRESA</span>
          </div>

          {/* Top right: Logo programa no ar */}
          <div className="absolute flex items-center gap-2" style={{ top: "5%", right: "4%" }}>
            <span className="text-[9px] font-bold" style={{ color: "#fff" }}>{programaNome || "PROGRAMA NO AR"}</span>
            {programaLogo ? (
              <img src={programaLogo} alt="Programa" className="h-12 w-12 rounded-full object-cover" style={{ border: `2px solid ${accentColor}` }} />
            ) : (
              <div className="h-12 w-12 rounded-full flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: accentColor, color: "#000" }}>
                PROG
              </div>
            )}
          </div>

          {/* Bottom left: Locutor data – stacked above subject bar */}
          <div
            className="absolute flex flex-col"
            style={{
              bottom: 0,
              left: "4%",
            }}
          >
            {/* Locutor box */}
            <div
              style={{
                backgroundColor: "#fff",
                padding: "10px 18px",
                borderRadius: "4px 4px 0 0",
                minWidth: 180,
              }}
            >
              <div className="text-sm font-black uppercase leading-tight" style={{ color: "#111" }}>
                {displayLocutor}
              </div>
              {locutorInstagram && (
                <div className="flex items-center gap-1 mt-0.5 text-[9px] font-semibold" style={{ color: accentColor }}>
                  <Instagram size={10} /> {locutorInstagram}
                </div>
              )}
            </div>

            {/* Subject bar */}
            <div
              style={{
                backgroundColor: "rgba(245,245,245,0.95)",
                padding: "10px 16px",
                width: "calc(100% / 0.92 * 0.92)",
                minWidth: 300,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1 h-5 rounded-sm" style={{ backgroundColor: accentColor }} />
                <span className="text-sm font-black uppercase" style={{ color: "#111" }}>
                  {data.assunto || "BASE PARA ASSUNTO"}
                </span>
              </div>
              <div className="flex items-center gap-3 flex-wrap text-[10px]" style={{ color: "#555" }}>
                {empresaSocials.map((s, i) => (
                  <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-semibold" style={{ backgroundColor: accentColor + "22", color: accentColor }}>
                    {s.icon}
                    {s.valor}
                  </span>
                ))}
                {composedTicker && (
                  <>
                    <span style={{ color: "#bbb" }}>→</span>
                    <span className="text-[10px] truncate" style={{ color: "#777", maxWidth: 400 }}>
                      {composedTicker}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
