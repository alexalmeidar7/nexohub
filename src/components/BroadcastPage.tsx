import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Save, Instagram, Globe, MessageCircle, Facebook, Youtube, Phone, Newspaper, CloudSun, Search, Copy, Check, Code2, RefreshCw } from "lucide-react";
import XmlLinkRow from "@/components/XmlLinkRow";

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
  iconPng?: string;
}

export default function BroadcastPage() {
  const { user } = useAuth();
  
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
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [empresaSocials, setEmpresaSocials] = useState<SocialItem[]>([]);
  const [sponsorLogos, setSponsorLogos] = useState<{nome: string; logo_url: string}[]>([]);
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
      if (emp?.instagram) socials.push({ tipo: "instagram", valor: extractHandle(emp.instagram), icon: <Instagram size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/instagram.png" });
      if (emp?.facebook) socials.push({ tipo: "facebook", valor: extractHandle(emp.facebook), icon: <Facebook size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/facebook.png" });
      if (emp?.youtube) socials.push({ tipo: "youtube", valor: extractHandle(emp.youtube), icon: <Youtube size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/youtube.png" });
      if (emp?.site) socials.push({ tipo: "site", valor: extractHandle(emp.site), icon: <Globe size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlechrome.png" });
      if (emp?.telefone_participacao) {
        socials.push({ tipo: "whatsapp", valor: emp.telefone_participacao, icon: <MessageCircle size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/whatsapp.png" });
        setWhatsappNumber(emp.telefone_participacao);
      }
      setEmpresaSocials(socials);

      // Current program – match by time AND day of week
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const nowTime = `${hh}:${mm}:00`;
      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const todayName = dayNames[now.getDay()];

      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, selo, capa, thumb, apresentadores_ids, apresentador_id, dias_semana")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .lte("horario_inicio", nowTime)
        .gte("horario_fim", nowTime)
        .contains("dias_semana", [todayName]);

      const prog = progs?.find(() => true);
      if (prog) {
        setProgramaNome(prog.nome);
        const logoUrl = prog.selo || null;
        if (logoUrl) setProgramaLogo(logoUrl);

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

        // Fetch sponsor logos for this program
        const { data: logos } = await supabase
          .from("logos_patrocinadores")
          .select("nome, logo_url")
          .eq("user_id", user.id)
          .eq("programa_id", prog.id)
          .eq("ativo", true)
          .eq("excluido", false);
        if (logos && logos.length > 0) setSponsorLogos(logos);
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

  const displayLocutor = data.locutor_override || locutorNome || "Locutor";

  // Generate XML content
  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const broadcastXml = useMemo(() => {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<broadcast>");
    lines.push(`  <titulo>${escXml(data.assunto || "")}</titulo>`);
    lines.push("  <programa>");
    lines.push(`    <nome>${escXml(programaNome || "")}</nome>`);
    lines.push(`    <logo_url>${escXml(programaLogo || "")}</logo_url>`);
    lines.push("  </programa>");
    lines.push("  <locutor>");
    lines.push(`    <nome>${escXml(displayLocutor)}</nome>`);
    lines.push(`    <rede_social>${escXml(locutorInstagram || "")}</rede_social>`);
    lines.push("  </locutor>");
    lines.push("  <redes_sociais>");
    empresaSocials.forEach(s => {
      lines.push(`    <item>`);
      lines.push(`      <icone>${escXml(s.iconPng || s.tipo + ".png")}</icone>`);
      lines.push(`      <texto>${escXml(s.valor)}</texto>`);
      lines.push(`    </item>`);
    });
    lines.push("  </redes_sociais>");
    lines.push("  <logos_patrocinadores>");
    sponsorLogos.forEach(l => {
      lines.push("    <logo>");
      lines.push(`      <nome>${escXml(l.nome)}</nome>`);
      lines.push(`      <url>${escXml(l.logo_url)}</url>`);
      lines.push("    </logo>");
    });
    lines.push("  </logos_patrocinadores>");
    const qrLink = whatsappNumber ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}` : "";
    lines.push(`  <qrcode_link>${escXml(qrLink)}</qrcode_link>`);
    lines.push(`  <ticker>${escXml(composedTicker)}</ticker>`);
    lines.push("</broadcast>");
    return lines.join("\n");
  }, [data.assunto, displayLocutor, locutorInstagram, empresaSocials, data.showQrCode, whatsappNumber, composedTicker, programaNome, programaLogo, sponsorLogos]);

  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    const toastId = toast("Atualizando XML...", { icon: <RefreshCw size={14} className="animate-spin" /> });
    try {
      const { data: current } = await supabase.from("user_settings").select("cenario_config").eq("user_id", user.id).maybeSingle();
      const existing = (current?.cenario_config && typeof current.cenario_config === "object") ? current.cenario_config as Record<string, any> : {};
      
      await supabase.from("user_settings").update({
        cenario_config: { ...existing, broadcast: data } as any,
      }).eq("user_id", user.id);

      toast.success("XML atualizado!", { id: toastId });
    } catch {
      toast.error("Erro ao salvar", { id: toastId });
    }
    setSaving(false);
  }, [user, data]);

  const onFieldBlur = useCallback(() => {
    handleSave();
  }, [handleSave]);

  return (
    <div className="flex flex-col gap-6 h-full min-h-0">
      {/* ── Top: Mockup Preview (hero) ── */}
      <div className="w-full flex justify-center px-2 pt-2">
        <div className="w-full" style={{ maxWidth: 960 }}>
          <MockupPreview
            empresaLogo={empresaLogo}
            programaNome={programaNome}
            programaLogo={programaLogo}
            displayLocutor={displayLocutor}
            locutorInstagram={locutorInstagram}
            locutorFoto={locutorFoto}
            accentColor={accentColor}
            assunto={data.assunto}
            showQrCode={data.showQrCode}
            whatsappNumber={whatsappNumber}
            empresaSocials={empresaSocials}
            composedTicker={composedTicker}
            sponsorLogos={sponsorLogos}
          />
        </div>
      </div>

      {/* ── Bottom: Form controls in compact grid ── */}
      <div className="flex-1 overflow-y-auto px-2 pb-4" style={{ maxHeight: "calc(100vh - 520px)" }}>
        <div className="mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" style={{ maxWidth: 960 }}>

          {/* Card: Assunto + Locutor */}
          <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "var(--layout-page-bg, #fff)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--layout-icon-color, #888)" }}>Identidade</h3>

            <div className="space-y-1">
              <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Assunto / Título</label>
              <input
                type="text"
                value={data.assunto}
                onChange={e => setData({ ...data, assunto: e.target.value })}
                placeholder="Base para assunto"
                className="w-full px-3 py-2 rounded-xl text-xs outline-none"
                style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", color: "var(--layout-page-text, #1a1a1a)", border: "none" }}
                onBlur={onFieldBlur}
              />
            </div>

            <div className="space-y-1 relative">
              <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Locutor (override)</label>
              <div className="relative">
                <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--layout-icon-color, #888)" }} />
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
                  onBlur={() => { setTimeout(() => setShowLocutorDropdown(false), 200); setTimeout(onFieldBlur, 300); }}
                  placeholder={locutorNome || "Buscar locutor..."}
                  className="w-full pl-7 pr-3 py-2 rounded-xl text-xs outline-none"
                  style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", color: "var(--layout-page-text, #1a1a1a)", border: "none" }}
                />
              </div>
              {showLocutorDropdown && locutorSearchResults.length > 0 && (
                <div className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-hidden" style={{ backgroundColor: "var(--layout-page-bg, #fff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}>
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
                      className="w-full text-left px-3 py-2 text-xs hover:brightness-110 transition-all flex items-center gap-2"
                      style={{ color: "var(--layout-page-text, #1a1a1a)", borderBottom: i < locutorSearchResults.length - 1 ? "1px solid color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)" : "none" }}
                    >
                      {r.foto && <img src={r.foto} alt="" className="w-6 h-6 rounded-full object-cover" />}
                      <span className="font-semibold flex-1 truncate">{r.nome}</span>
                      {r.instagram && <span className="text-[10px]" style={{ color: "var(--layout-accent-color, #dc2626)" }}>@{r.instagram.replace("@", "")}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Card: Redes Sociais */}
          <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "var(--layout-page-bg, #fff)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--layout-icon-color, #888)" }}>Redes Sociais</h3>
            {empresaSocials.length === 0 ? (
              <p className="text-[10px]" style={{ color: "var(--layout-icon-color, #888)" }}>Nenhuma rede social cadastrada.</p>
            ) : (
              <div className="space-y-1.5">
                {empresaSocials.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)" }}>
                    <span style={{ color: "var(--layout-accent-color, #dc2626)" }}>{s.icon}</span>
                    <span className="text-[11px]" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{s.valor}</span>
                  </div>
                ))}
              </div>
            )}

            {whatsappNumber && (
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer mt-1" style={{ backgroundColor: data.showQrCode ? "color-mix(in srgb, var(--layout-accent-color, #dc2626) 8%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)" }}>
                <input
                  type="checkbox"
                  checked={data.showQrCode}
                  onChange={e => { setData({ ...data, showQrCode: e.target.checked }); setTimeout(onFieldBlur, 100); }}
                  className="accent-current"
                  style={{ accentColor: "var(--layout-accent-color, #dc2626)" }}
                />
                <MessageCircle size={12} style={{ color: data.showQrCode ? "var(--layout-accent-color, #dc2626)" : "var(--layout-icon-color, #888)" }} />
                <div>
                  <span className="text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>QR Code WhatsApp</span>
                  <p className="text-[9px]" style={{ color: "var(--layout-icon-color, #888)" }}>Exibir QR Code para enviar mensagem</p>
                </div>
              </label>
            )}
          </div>

          {/* Card: Ticker */}
          <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "var(--layout-page-bg, #fff)", boxShadow: "0 2px 16px rgba(0,0,0,0.06)" }}>
            <h3 className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--layout-icon-color, #888)" }}>Ticker</h3>

            <label className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer" style={{ backgroundColor: data.tickerNews ? "color-mix(in srgb, var(--layout-accent-color, #dc2626) 8%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)" }}>
              <input
                type="checkbox"
                checked={data.tickerNews}
                onChange={e => { setData({ ...data, tickerNews: e.target.checked }); setTimeout(onFieldBlur, 100); }}
                className="accent-current"
                style={{ accentColor: "var(--layout-accent-color, #dc2626)" }}
              />
              <Newspaper size={12} style={{ color: data.tickerNews ? "var(--layout-accent-color, #dc2626)" : "var(--layout-icon-color, #888)" }} />
              <div>
                <span className="text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Notícias</span>
                <p className="text-[9px]" style={{ color: "var(--layout-icon-color, #888)" }}>Títulos das últimas notícias</p>
              </div>
            </label>

            <label className="flex items-center gap-2 px-3 py-2 rounded-xl cursor-pointer" style={{ backgroundColor: data.tickerWeather ? "color-mix(in srgb, var(--layout-accent-color, #dc2626) 8%, transparent)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)" }}>
              <input
                type="checkbox"
                checked={data.tickerWeather}
                onChange={e => { setData({ ...data, tickerWeather: e.target.checked }); setTimeout(onFieldBlur, 100); }}
                className="accent-current"
                style={{ accentColor: "var(--layout-accent-color, #dc2626)" }}
              />
              <CloudSun size={12} style={{ color: data.tickerWeather ? "var(--layout-accent-color, #dc2626)" : "var(--layout-icon-color, #888)" }} />
              <div>
                <span className="text-[11px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>Previsão do Tempo</span>
                <p className="text-[9px]" style={{ color: "var(--layout-icon-color, #888)" }}>Tempo atual e amanhã</p>
              </div>
            </label>

            <textarea
              value={data.ticker}
              onChange={e => setData({ ...data, ticker: e.target.value })}
              placeholder="Texto adicional (opcional)..."
              rows={2}
              className="w-full px-3 py-2 rounded-xl text-[11px] outline-none resize-none"
              style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", color: "var(--layout-page-text, #1a1a1a)", border: "none" }}
              onBlur={onFieldBlur}
            />

            <XmlLinkRow label="Broadcast XML" permanentUrl={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-broadcast?user_id=${user?.id}`} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Mockup Preview component with animations ─── */
function MockupPreview({
  empresaLogo, programaNome, programaLogo, displayLocutor, locutorInstagram,
  locutorFoto, accentColor, assunto, showQrCode, whatsappNumber,
  empresaSocials, composedTicker, sponsorLogos,
}: {
  empresaLogo: string; programaNome: string; programaLogo: string;
  displayLocutor: string; locutorInstagram: string; locutorFoto: string;
  accentColor: string; assunto: string; showQrCode: boolean;
  whatsappNumber: string; empresaSocials: SocialItem[]; composedTicker: string;
  sponsorLogos: {nome: string; logo_url: string}[];
}) {
  // Social cycling animation
  const [socialIdx, setSocialIdx] = useState(0);
  const [socialVisible, setSocialVisible] = useState(true);

  // Sponsor logo cycling animation
  const [sponsorIdx, setSponsorIdx] = useState(0);
  const [sponsorVisible, setSponsorVisible] = useState(true);

  useEffect(() => {
    if (empresaSocials.length <= 1) return;
    const interval = setInterval(() => {
      setSocialVisible(false);
      setTimeout(() => {
        setSocialIdx(prev => (prev + 1) % empresaSocials.length);
        setSocialVisible(true);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, [empresaSocials.length]);

  useEffect(() => {
    if (sponsorLogos.length <= 1) return;
    const interval = setInterval(() => {
      setSponsorVisible(false);
      setTimeout(() => {
        setSponsorIdx(prev => (prev + 1) % sponsorLogos.length);
        setSponsorVisible(true);
      }, 400);
    }, 5000);
    return () => clearInterval(interval);
  }, [sponsorLogos.length]);

  const currentSocial = empresaSocials[socialIdx] || null;
  const currentSponsor = sponsorLogos[sponsorIdx] || null;

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden"
      style={{
        aspectRatio: "16/9",
        backgroundColor: "#0a0a0a",
        boxShadow: "0 24px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      {/* Safe area guides (invisible but layout-based on 1920x1080 proportions) */}

      {/* ── Top bar ── */}
      <div className="absolute flex items-center justify-between" style={{ top: "5%", left: "4%", right: "4%" }}>
        {/* Logo empresa */}
        <div className="flex items-center gap-3">
          {empresaLogo ? (
            <img src={empresaLogo} alt="Logo" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: accentColor, color: "#000" }}>LOGO</div>
          )}
        </div>

        {/* Logo programa no ar */}
        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <span className="text-[8px] font-medium uppercase tracking-wider block" style={{ color: "#ffffff60" }}>NO AR</span>
            <span className="text-[10px] font-bold block" style={{ color: "#fff" }}>{programaNome || "PROGRAMA"}</span>
          </div>
          {programaLogo ? (
            <img src={programaLogo} alt="Programa" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: accentColor + "30", color: accentColor, border: `1px solid ${accentColor}50` }}>PROG</div>
          )}
        </div>
      </div>

      {/* ── Center: QR Code (if enabled) ── */}
      {showQrCode && whatsappNumber && (
        <div className="absolute flex flex-col items-center gap-1" style={{ bottom: "28%", left: "4%" }}>
          <div className="bg-white rounded-lg p-2 shadow-lg" style={{ boxShadow: `0 4px 20px ${accentColor}30` }}>
            <QRCodeSVG
              value={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`}
              size={56}
              bgColor="#ffffff"
              fgColor="#111111"
            />
          </div>
          <span className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "#ffffff50" }}>WhatsApp</span>
        </div>
      )}

      {/* ── Bottom section ── */}
      <div className="absolute" style={{ bottom: "4%", left: "4%", right: "4%" }}>

        {/* Locutor + Assunto + Social row */}
        <div className="flex items-end">
          <div className="flex-shrink-0" style={{ maxWidth: "45%" }}>
            {/* Locutor box */}
            <div
              className="backdrop-blur-sm relative overflow-hidden"
              style={{
                backgroundColor: "rgba(255,255,255,0.97)",
                padding: "8px 20px 6px",
                borderRadius: "6px 6px 0 0",
                minWidth: 180,
                minHeight: locutorFoto ? 72 : undefined,
              }}
            >
              {locutorFoto && (
                <img
                  src={locutorFoto}
                  alt={displayLocutor}
                  className="absolute bottom-0 left-0 object-contain object-left-bottom pointer-events-none"
                  style={{ height: "140%", maxWidth: "42%", opacity: 0.92 }}
                />
              )}
              <div className="relative" style={{ marginLeft: locutorFoto ? "38%" : 0 }}>
                <div className="text-sm font-black uppercase leading-tight tracking-wide" style={{ color: "#111" }}>
                  {displayLocutor}
                </div>
                {locutorInstagram && (
                  <div className="flex items-center gap-1 mt-0.5 text-[9px] font-semibold" style={{ color: accentColor }}>
                    <Instagram size={9} /> {locutorInstagram}
                  </div>
                )}
              </div>
            </div>

            {/* Subject bar – separated from ticker */}
            <div
              style={{
                backgroundColor: "rgba(240,240,240,0.95)",
                padding: "10px 16px",
                borderRadius: "0 0 6px 6px",
              }}
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: accentColor }} />
                <span className="text-sm font-black uppercase truncate" style={{ color: "#111" }}>
                  {assunto || "BASE PARA ASSUNTO"}
                </span>
              </div>
            </div>
          </div>

          {/* Sponsor logo + Social item cycling */}
          <div className="flex-1 flex flex-col items-end justify-end pb-2 pr-1 gap-2" style={{ minHeight: 40 }}>
            {/* Sponsor logo */}
            {currentSponsor && (
              <div
                className="transition-all duration-400"
                style={{
                  opacity: sponsorVisible ? 1 : 0,
                  transform: sponsorVisible ? "scale(1)" : "scale(0.9)",
                }}
              >
                <img
                  src={currentSponsor.logo_url}
                  alt={currentSponsor.nome}
                  className="h-[52px] max-w-[160px] object-contain"
                />
              </div>
            )}
            {/* Social item */}
            {currentSocial && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300"
                style={{
                  backgroundColor: accentColor + "18",
                  border: `1px solid ${accentColor}30`,
                  opacity: socialVisible ? 1 : 0,
                  transform: socialVisible ? "translateY(0)" : "translateY(6px)",
                }}
              >
                <span style={{ color: accentColor }}>{currentSocial.icon}</span>
                <span className="text-[10px] font-semibold" style={{ color: "#fff" }}>{currentSocial.valor}</span>
              </div>
            )}
          </div>
        </div>

        {/* Ticker bar – separate from title, with gap */}
        {composedTicker && (
          <div className="overflow-hidden mt-3" style={{ backgroundColor: accentColor + "18", border: `1px solid ${accentColor}30`, height: 28, borderRadius: 8 }}>
            <div
              className="flex items-center h-full whitespace-nowrap"
              style={{
                animation: "tickerSlide 20s linear infinite",
                paddingLeft: "100%",
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#fff" }}>
                {composedTicker}
              </span>
            </div>
            <style>{`
              @keyframes tickerSlide {
                0% { transform: translateX(0); }
                100% { transform: translateX(-100%); }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}
