import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Save, Instagram, Globe, MessageCircle, Facebook, Youtube, Phone, Newspaper, CloudSun, Search, Copy, Check, Code2, RefreshCw, Upload, X, Image as ImageIcon } from "lucide-react";
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
  assuntoBgUrl: string;
  useCustomAssuntoBg: boolean;
  assuntoBgProgramaIds: string[];
}

const defaultBroadcast: BroadcastData = {
  assunto: "",
  ticker: "",
  locutor_override: "",
  tickerNews: false,
  tickerWeather: false,
  showQrCode: false,
  assuntoBgUrl: "",
  useCustomAssuntoBg: false,
  assuntoBgProgramaIds: [],
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
  const [allProgramas, setAllProgramas] = useState<{id: string; nome: string}[]>([]);
  const [activeProgramaId, setActiveProgramaId] = useState<string | null>(null);
  const [showProgramDropdown, setShowProgramDropdown] = useState(false);
  const latestDataRef = useRef<BroadcastData>(defaultBroadcast);

  // Ticker auto-content
  const [newsTitles, setNewsTitles] = useState<string[]>([]);
  const [weatherText, setWeatherText] = useState("");

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

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

      // All programs (for linking assunto background)
      const { data: allProgs } = await supabase
        .from("programas")
        .select("id, nome")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .order("nome");
      if (allProgs) setAllProgramas(allProgs);

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
        setActiveProgramaId(prog.id);
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

  const effectiveAssuntoBgUrl = useMemo(() => {
    if (!data.useCustomAssuntoBg || !data.assuntoBgUrl) return "";
    const linked = data.assuntoBgProgramaIds || [];
    // If no programs linked, apply globally; otherwise only when current program is in the linked list
    if (linked.length === 0) return data.assuntoBgUrl;
    if (activeProgramaId && linked.includes(activeProgramaId)) return data.assuntoBgUrl;
    return "";
  }, [data.useCustomAssuntoBg, data.assuntoBgUrl, data.assuntoBgProgramaIds, activeProgramaId]);

  const broadcastXml = useMemo(() => {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<broadcast>");
    lines.push(`  <titulo>${escXml(data.assunto || "")}</titulo>`);
    lines.push(`  <fundo_assunto>${escXml(effectiveAssuntoBgUrl)}</fundo_assunto>`);
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

  const handleSave = useCallback(async (payload?: BroadcastData) => {
    if (!user) return;
    setSaving(true);
    const toastId = toast("Atualizando XML...", { icon: <RefreshCw size={14} className="animate-spin" /> });
    try {
      const { data: current } = await supabase.from("user_settings").select("cenario_config").eq("user_id", user.id).maybeSingle();
      const existing = (current?.cenario_config && typeof current.cenario_config === "object") ? current.cenario_config as Record<string, any> : {};
      const nextData = payload || latestDataRef.current;
      
      await supabase.from("user_settings").update({
        cenario_config: { ...existing, broadcast: nextData } as any,
      }).eq("user_id", user.id);

      toast.success("XML atualizado!", { id: toastId });
    } catch {
      toast.error("Erro ao salvar", { id: toastId });
    }
    setSaving(false);
  }, [user]);

  const onFieldBlur = useCallback(() => {
    handleSave();
  }, [handleSave]);

  const [uploadingBg, setUploadingBg] = useState(false);
  const handleBgUpload = useCallback(async (file: File) => {
    if (!user || !file) return;
    if (file.type !== "image/png") {
      toast.error("A imagem deve ser .png");
      return;
    }
    setUploadingBg(true);
    try {
      const path = `broadcast/${user.id}/assunto-bg-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from("empresa-assets")
        .upload(path, file, { upsert: true, contentType: "image/png", cacheControl: "3600" });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      const next = { ...latestDataRef.current, assuntoBgUrl: url, useCustomAssuntoBg: true };
      setData(next);
      await handleSave(next);
      toast.success("Fundo do assunto atualizado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar imagem");
    }
    setUploadingBg(false);
  }, [user, handleSave]);

  const removeBgImage = useCallback(() => {
    const next = { ...latestDataRef.current, assuntoBgUrl: "", useCustomAssuntoBg: false };
    setData(next);
    void handleSave(next);
  }, [handleSave]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-full min-h-0 px-2 pt-2 pb-4">
      {/* ── Left: Mockup Preview ── */}
      <div className="flex-1 min-w-0">
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
          assuntoBgUrl={effectiveAssuntoBgUrl}
        />
      </div>

      {/* ── Right: Form controls stacked ── */}
      <div className="w-full lg:w-[360px] flex-shrink-0 overflow-y-auto" style={{ maxHeight: "calc(100vh - 180px)" }}>
        <div className="grid grid-cols-1 gap-4">

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

            {/* Background image upload for Assunto */}
            <div className="space-y-1 pt-2 border-t" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
              <label className="text-[10px] font-semibold uppercase tracking-wider flex items-center justify-between" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                <span>Fundo do Assunto (.png)</span>
                {data.assuntoBgUrl && (
                  <label className="flex items-center gap-1 cursor-pointer normal-case tracking-normal text-[9px]">
                    <input
                      type="checkbox"
                      checked={data.useCustomAssuntoBg}
                      onChange={e => {
                        const next = { ...latestDataRef.current, useCustomAssuntoBg: e.target.checked };
                        setData(next);
                        void handleSave(next);
                      }}
                      style={{ accentColor: "var(--layout-accent-color, #dc2626)" }}
                    />
                    Usar
                  </label>
                )}
              </label>
              {data.assuntoBgUrl ? (
                <div className="relative rounded-xl overflow-hidden" style={{ backgroundColor: "#0a0a0a", aspectRatio: "16/4" }}>
                  <img src={data.assuntoBgUrl} alt="Fundo assunto" className="w-full h-full object-contain" />
                  <button
                    onClick={removeBgImage}
                    className="absolute top-1 right-1 p-1 rounded-full"
                    style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
                    title="Remover"
                  >
                    <X size={11} />
                  </button>
                </div>
              ) : (
                <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-xl cursor-pointer text-[11px] font-medium border-2 border-dashed" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)", color: "var(--layout-icon-color, #888)" }}>
                  {uploadingBg ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  <span>{uploadingBg ? "Enviando..." : "Enviar PNG"}</span>
                  <input
                    type="file"
                    accept="image/png"
                    className="hidden"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleBgUpload(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
              <p className="text-[9px]" style={{ color: "var(--layout-icon-color, #888)" }}>
                Padrão: apenas o texto. Imagem opcional substituirá o fundo da tarja.
              </p>

              {/* Vincular fundo a programas */}
              {data.assuntoBgUrl && (
                <div className="space-y-1 pt-2 relative">
                  <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                    Vincular a programas
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowProgramDropdown(v => !v)}
                    className="w-full px-3 py-2 rounded-xl text-[11px] outline-none text-left flex items-center justify-between"
                    style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
                  >
                    <span className="truncate">
                      {data.assuntoBgProgramaIds.length === 0
                        ? "Todos os programas (global)"
                        : `${data.assuntoBgProgramaIds.length} programa(s) selecionado(s)`}
                    </span>
                    <span className="text-[9px]" style={{ color: "var(--layout-icon-color, #888)" }}>{showProgramDropdown ? "▲" : "▼"}</span>
                  </button>
                  {showProgramDropdown && (
                    <div
                      className="absolute z-50 w-full mt-1 rounded-xl shadow-lg overflow-y-auto max-h-48"
                      style={{ backgroundColor: "var(--layout-page-bg, #fff)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}
                    >
                      {allProgramas.length === 0 ? (
                        <div className="px-3 py-2 text-[10px]" style={{ color: "var(--layout-icon-color, #888)" }}>Nenhum programa cadastrado</div>
                      ) : (
                        allProgramas.map(p => {
                          const checked = data.assuntoBgProgramaIds.includes(p.id);
                          return (
                            <label
                              key={p.id}
                              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:brightness-110"
                              style={{ color: "var(--layout-page-text, #1a1a1a)" }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => {
                                  const ids = new Set(latestDataRef.current.assuntoBgProgramaIds || []);
                                  if (e.target.checked) ids.add(p.id); else ids.delete(p.id);
                                  const next = { ...latestDataRef.current, assuntoBgProgramaIds: Array.from(ids) };
                                  setData(next);
                                  void handleSave(next);
                                }}
                                style={{ accentColor: "var(--layout-accent-color, #dc2626)" }}
                              />
                              <span className="text-[11px] flex-1 truncate">{p.nome}</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                  <p className="text-[9px]" style={{ color: "var(--layout-icon-color, #888)" }}>
                    Vazio = aplica em todos. Selecione múltiplos para reusar a mesma arte.
                  </p>
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
                  onChange={e => {
                    const nextData = { ...latestDataRef.current, showQrCode: e.target.checked };
                    setData(nextData);
                    void handleSave(nextData);
                  }}
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
                onChange={e => {
                  const nextData = { ...latestDataRef.current, tickerNews: e.target.checked };
                  setData(nextData);
                  void handleSave(nextData);
                }}
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
                onChange={e => {
                  const nextData = { ...latestDataRef.current, tickerWeather: e.target.checked };
                  setData(nextData);
                  void handleSave(nextData);
                }}
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
  empresaSocials, composedTicker, sponsorLogos, assuntoBgUrl,
}: {
  empresaLogo: string; programaNome: string; programaLogo: string;
  displayLocutor: string; locutorInstagram: string; locutorFoto: string;
  accentColor: string; assunto: string; showQrCode: boolean;
  whatsappNumber: string; empresaSocials: SocialItem[]; composedTicker: string;
  sponsorLogos: {nome: string; logo_url: string}[];
  assuntoBgUrl?: string;
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
                backgroundColor: assuntoBgUrl ? "transparent" : "rgba(240,240,240,0.95)",
                backgroundImage: assuntoBgUrl ? `url(${assuntoBgUrl})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                padding: "10px 16px",
                borderRadius: "0 0 6px 6px",
                minHeight: assuntoBgUrl ? 38 : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                {!assuntoBgUrl && (
                  <div className="w-1.5 h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: accentColor }} />
                )}
                <span
                  className="text-sm font-black uppercase truncate"
                  style={{
                    color: assuntoBgUrl ? "#fff" : "#111",
                    textShadow: assuntoBgUrl ? "0 1px 4px rgba(0,0,0,0.7)" : undefined,
                  }}
                >
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
