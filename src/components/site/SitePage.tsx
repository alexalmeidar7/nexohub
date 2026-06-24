import { useMemo, useState } from "react";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import SiteMockup from "./SiteMockup";
import SiteNoticiasManager from "./SiteNoticiasManager";
import SiteCategoriasManager from "./SiteCategoriasManager";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import {
  Globe, Sliders, Newspaper, Cloud, Settings, Loader2, Search,
  ExternalLink, Eye, EyeOff, Smartphone, Monitor, Palette, MapPin,
} from "lucide-react";

interface Props { effectiveUserId: string | null; }

function Toggle({
  label, description, checked, onChange,
}: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg transition"
      style={{
        background: checked
          ? "color-mix(in srgb, var(--layout-accent-color, #268ffa) 8%, transparent)"
          : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)",
        border: `1px solid color-mix(in srgb, var(--layout-${checked ? "accent-color, #268ffa" : "page-text, #1a1a1a"}) ${checked ? 20 : 8}%, transparent)`,
      }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {checked ? <Eye size={13} style={{ color: "var(--layout-accent-color, #268ffa)" }} /> : <EyeOff size={13} className="opacity-40" />}
          <span className="text-sm font-medium">{label}</span>
        </div>
        {description && <p className="text-[11px] opacity-60 mt-0.5 pl-5">{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-wider opacity-60 block mb-1.5">
      {children}
    </label>
  );
}

export default function SitePage({ effectiveUserId }: Props) {
  const { config, loading, update } = useSiteConfig(effectiveUserId);
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  const visibleCount = useMemo(() => {
    if (!config) return 0;
    return [
      config.show_no_ar, config.show_noticias, config.show_clima,
      config.show_economia, config.show_promocoes, config.show_grade,
    ].filter(Boolean).length;
  }, [config]);

  if (!effectiveUserId) {
    return (
      <div className="flex items-center justify-center h-64 text-sm opacity-70">
        Aguarde a sessão carregar para abrir o admin do site.
      </div>
    );
  }
  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>;
  }
  if (!config) {
    return (
      <div className="flex items-center justify-center h-64 text-sm opacity-70">
        Não foi possível carregar as configurações do site agora.
      </div>
    );
  }

  const searchCity = async () => {
    if (!cityQuery.trim()) return;
    setSearching(true);
    try {
      const { data } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query: cityQuery, count: 5 },
      });
      setCityResults(data?.results || []);
    } finally {
      setSearching(false);
    }
  };

  const pickCity = (c: any) => {
    update({ cidade_clima: c.name, cidade_lat: c.latitude, cidade_lon: c.longitude });
    setCityResults([]);
    setCityQuery("");
  };

  const openPreview = () => {
    window.open(`/site-preview?user=${effectiveUserId}`, "_blank", "noopener");
  };

  const accent = "var(--layout-accent-color, #268ffa)";
  const textColor = "var(--layout-page-text, #1a1a1a)";
  const subtleBg = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)";
  const subtleBorder = "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)";

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Header bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl"
        style={{ background: subtleBg, border: subtleBorder }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: accent, color: "#fff" }}
          >
            <Globe size={18} />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold truncate" style={{ color: textColor }}>
              {config.site_nome || "Meu Site"}
            </h1>
            <p className="text-[11px] opacity-60 truncate">
              {visibleCount} seções ativas · preview ao vivo
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div
            className="flex items-center rounded-lg p-0.5"
            style={{ background: subtleBg, border: subtleBorder }}
          >
            <button
              onClick={() => setDevice("desktop")}
              className="px-2.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition"
              style={{
                background: device === "desktop" ? accent : "transparent",
                color: device === "desktop" ? "#fff" : "inherit",
              }}
            >
              <Monitor size={12} /> Desktop
            </button>
            <button
              onClick={() => setDevice("mobile")}
              className="px-2.5 py-1.5 rounded-md text-xs flex items-center gap-1.5 transition"
              style={{
                background: device === "mobile" ? accent : "transparent",
                color: device === "mobile" ? "#fff" : "inherit",
              }}
            >
              <Smartphone size={12} /> Mobile
            </button>
          </div>

          <Button
            size="sm"
            onClick={openPreview}
            className="gap-1.5"
            style={{ background: accent, color: "#fff" }}
          >
            <ExternalLink size={14} /> Abrir em nova aba
          </Button>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 flex-1 min-h-0">
        {/* Mockup */}
        <div
          className="rounded-2xl overflow-hidden shadow-2xl flex flex-col"
          style={{ background: subtleBg, border: subtleBorder }}
        >
          {/* Browser bar */}
          <div
            className="flex items-center gap-2 px-4 py-2.5 border-b"
            style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)" }}
          >
            <div className="flex gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-400" />
              <span className="w-3 h-3 rounded-full bg-yellow-400" />
              <span className="w-3 h-3 rounded-full bg-green-400" />
            </div>
            <div
              className="flex-1 mx-3 px-3 py-1 rounded-md text-xs flex items-center gap-2"
              style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}
            >
              <Globe size={12} />
              <span className="opacity-70 truncate">
                {(config.site_nome || "meusite").toLowerCase().replace(/\s+/g, "")}.com.br
              </span>
            </div>
          </div>
          <div className="flex-1 min-h-[640px] bg-white flex justify-center overflow-auto">
            <div
              className="transition-all duration-300 bg-white"
              style={{
                width: device === "mobile" ? 390 : "100%",
                maxWidth: device === "mobile" ? 390 : "none",
                boxShadow: device === "mobile" ? "0 0 0 1px rgba(0,0,0,0.08)" : "none",
              }}
            >
              <SiteMockup config={config} effectiveUserId={effectiveUserId} />
            </div>
          </div>
        </div>

        {/* Admin panel */}
        <div
          className="rounded-2xl flex flex-col overflow-hidden"
          style={{ background: subtleBg, border: subtleBorder }}
        >
          <Tabs defaultValue="secoes" className="flex flex-col flex-1 min-h-0">
            <TabsList className="grid grid-cols-4 m-2 mb-0 h-auto p-1">
              <TabsTrigger value="secoes" className="text-xs gap-1 py-1.5">
                <Settings size={12} /> Seções
              </TabsTrigger>
              <TabsTrigger value="ident" className="text-xs gap-1 py-1.5">
                <Palette size={12} /> Marca
              </TabsTrigger>
              <TabsTrigger value="news" className="text-xs gap-1 py-1.5">
                <Newspaper size={12} /> Notícias
              </TabsTrigger>
              <TabsTrigger value="weather" className="text-xs gap-1 py-1.5">
                <Cloud size={12} /> Clima
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-3">
              <TabsContent value="secoes" className="space-y-2 m-0">
                <p className="text-[11px] opacity-60 mb-2">
                  Ative ou desative os blocos exibidos no seu site público.
                </p>
                <Toggle label="No Ar agora" description="Mostra o programa em transmissão" checked={config.show_no_ar} onChange={(v) => update({ show_no_ar: v })} />
                <Toggle label="Notícias" description="Manchetes do roteiro ou cadastradas" checked={config.show_noticias} onChange={(v) => update({ show_noticias: v })} />
                <Toggle label="Clima" description="Previsão da cidade configurada" checked={config.show_clima} onChange={(v) => update({ show_clima: v })} />
                <Toggle label="Economia" description="Cotações de moedas e bolsas" checked={config.show_economia} onChange={(v) => update({ show_economia: v })} />
                <Toggle label="Promoções" description="Promoções vigentes" checked={config.show_promocoes} onChange={(v) => update({ show_promocoes: v })} />
                <Toggle label="Grade de programação" description="Programas e horários" checked={config.show_grade} onChange={(v) => update({ show_grade: v })} />
              </TabsContent>

              <TabsContent value="ident" className="space-y-4 m-0">
                <div>
                  <FieldLabel>Nome do site</FieldLabel>
                  <Input
                    placeholder="Minha Rádio"
                    value={config.site_nome}
                    onChange={(e) => update({ site_nome: e.target.value })}
                  />
                </div>
                <div>
                  <FieldLabel>Descrição curta</FieldLabel>
                  <Input
                    placeholder="A melhor rádio da cidade"
                    value={config.site_descricao}
                    onChange={(e) => update({ site_descricao: e.target.value })}
                  />
                </div>
                <div>
                  <FieldLabel>Cor primária</FieldLabel>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={config.cor_primaria}
                      onChange={(e) => update({ cor_primaria: e.target.value })}
                      className="w-12 h-10 rounded-lg cursor-pointer border-0 bg-transparent"
                    />
                    <Input
                      value={config.cor_primaria}
                      onChange={(e) => update({ cor_primaria: e.target.value })}
                      className="font-mono text-xs"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="news" className="space-y-4 m-0">
                <div>
                  <FieldLabel>Fonte das notícias</FieldLabel>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { v: "roteiro", l: "Último roteiro" },
                      { v: "manual", l: "Cadastro manual" },
                    ].map((opt) => {
                      const active = config.fonte_noticias === opt.v;
                      return (
                        <button
                          key={opt.v}
                          onClick={() => update({ fonte_noticias: opt.v as any })}
                          className="text-xs py-2.5 rounded-lg transition font-medium"
                          style={{
                            background: active ? accent : "transparent",
                            color: active ? "#fff" : "inherit",
                            border: `1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) ${active ? 0 : 12}%, transparent)`,
                          }}
                        >
                          {opt.l}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <FieldLabel>Categorias</FieldLabel>
                  <SiteCategoriasManager effectiveUserId={effectiveUserId} />
                </div>

                {config.fonte_noticias === "manual" && (
                  <div>
                    <FieldLabel>Notícias publicadas</FieldLabel>
                    <SiteNoticiasManager effectiveUserId={effectiveUserId} />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="weather" className="space-y-3 m-0">
                {config.cidade_clima && (
                  <div
                    className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
                    style={{
                      background: "color-mix(in srgb, var(--layout-accent-color, #268ffa) 10%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--layout-accent-color, #268ffa) 25%, transparent)",
                    }}
                  >
                    <MapPin size={14} style={{ color: accent }} />
                    <span className="text-sm font-semibold flex-1">{config.cidade_clima}</span>
                    <span className="text-[10px] opacity-60">
                      {config.cidade_lat?.toFixed(2)}, {config.cidade_lon?.toFixed(2)}
                    </span>
                  </div>
                )}
                <div>
                  <FieldLabel>Buscar cidade</FieldLabel>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Ex.: São Paulo"
                      value={cityQuery}
                      onChange={(e) => setCityQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") searchCity(); }}
                    />
                    <Button size="sm" onClick={searchCity} disabled={searching}>
                      {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    </Button>
                  </div>
                </div>
                {cityResults.length > 0 && (
                  <ul className="space-y-1 max-h-64 overflow-y-auto">
                    {cityResults.map((c, i) => (
                      <li key={i}>
                        <button
                          onClick={() => pickCity(c)}
                          className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-black/5 transition"
                          style={{ border: subtleBorder }}
                        >
                          <div className="font-medium">{c.name}</div>
                          {c.admin1 && <div className="opacity-60 text-[10px]">{c.admin1}{c.country ? ` · ${c.country}` : ""}</div>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
