import { useState } from "react";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import SiteMockup from "./SiteMockup";
import SiteNoticiasManager from "./SiteNoticiasManager";
import SiteCategoriasManager from "./SiteCategoriasManager";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  ChevronDown, ChevronUp, Globe, Sliders, Newspaper, Cloud, Settings, Loader2, Search,
} from "lucide-react";

interface Props { effectiveUserId: string | null; }

function Section({
  title, icon: Icon, open, onToggle, children,
}: {
  title: string; icon: any; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden transition-all"
      style={{
        background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)",
        border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)",
      }}
    >
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-black/5 transition"
      >
        <div className="flex items-center gap-2">
          <Icon size={16} style={{ color: "var(--layout-accent-color, #268ffa)" }} />
          <span className="text-sm font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{title}</span>
        </div>
        {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {open && <div className="p-4 pt-0">{children}</div>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

export default function SitePage({ effectiveUserId }: Props) {
  const { config, loading, update } = useSiteConfig(effectiveUserId);
  const [open, setOpen] = useState<Record<string, boolean>>({ id: true, sec: true, news: false, weather: false, pub: false });
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

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

  const toggle = (k: string) => setOpen((o) => ({ ...o, [k]: !o[k] }));

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-4 h-full">
      {/* Mockup */}
      <div className="rounded-2xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)" }}>
        {/* Browser bar */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 10%, transparent)" }}>
          <div className="flex gap-1.5">
            <span className="w-3 h-3 rounded-full bg-red-400" />
            <span className="w-3 h-3 rounded-full bg-yellow-400" />
            <span className="w-3 h-3 rounded-full bg-green-400" />
          </div>
          <div className="flex-1 mx-3 px-3 py-1 rounded-md text-xs flex items-center gap-2"
            style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
            <Globe size={12} />
            <span className="opacity-70">meusite.com.br</span>
          </div>
        </div>
        <div className="flex-1 min-h-[640px] bg-white">
          <SiteMockup config={config} effectiveUserId={effectiveUserId} />
        </div>
      </div>

      {/* Painel admin */}
      <div className="space-y-3">
        <Section title="Identidade" icon={Sliders} open={open.id} onToggle={() => toggle("id")}>
          <div className="space-y-2">
            <Input
              placeholder="Nome do site"
              value={config.site_nome}
              onChange={(e) => update({ site_nome: e.target.value })}
            />
            <Input
              placeholder="Descrição curta"
              value={config.site_descricao}
              onChange={(e) => update({ site_descricao: e.target.value })}
            />
            <label className="flex items-center justify-between text-sm">
              <span>Cor primária</span>
              <input
                type="color"
                value={config.cor_primaria}
                onChange={(e) => update({ cor_primaria: e.target.value })}
                className="w-10 h-8 rounded cursor-pointer border-0"
              />
            </label>
          </div>
        </Section>

        <Section title="Seções visíveis" icon={Settings} open={open.sec} onToggle={() => toggle("sec")}>
          <Toggle label="No Ar agora" checked={config.show_no_ar} onChange={(v) => update({ show_no_ar: v })} />
          <Toggle label="Notícias" checked={config.show_noticias} onChange={(v) => update({ show_noticias: v })} />
          <Toggle label="Clima" checked={config.show_clima} onChange={(v) => update({ show_clima: v })} />
          <Toggle label="Economia / Cotações" checked={config.show_economia} onChange={(v) => update({ show_economia: v })} />
          <Toggle label="Promoções" checked={config.show_promocoes} onChange={(v) => update({ show_promocoes: v })} />
          <Toggle label="Grade de programação" checked={config.show_grade} onChange={(v) => update({ show_grade: v })} />
        </Section>

        <Section title="Notícias" icon={Newspaper} open={open.news} onToggle={() => toggle("news")}>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                onClick={() => update({ fonte_noticias: "roteiro" })}
                className={`flex-1 text-xs py-2 rounded transition ${config.fonte_noticias === "roteiro" ? "font-semibold" : "opacity-60"}`}
                style={{ background: config.fonte_noticias === "roteiro" ? "var(--layout-accent-color, #268ffa)" : "transparent", color: config.fonte_noticias === "roteiro" ? "#fff" : "inherit", border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)" }}
              >
                Último roteiro jornalístico
              </button>
              <button
                onClick={() => update({ fonte_noticias: "manual" })}
                className={`flex-1 text-xs py-2 rounded transition ${config.fonte_noticias === "manual" ? "font-semibold" : "opacity-60"}`}
                style={{ background: config.fonte_noticias === "manual" ? "var(--layout-accent-color, #268ffa)" : "transparent", color: config.fonte_noticias === "manual" ? "#fff" : "inherit", border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)" }}
              >
                Notícias manuais
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold mb-1 opacity-70">Categorias</p>
              <SiteCategoriasManager effectiveUserId={effectiveUserId} />
            </div>

            {config.fonte_noticias === "manual" && (
              <div>
                <p className="text-xs font-semibold mb-1 opacity-70">Notícias publicadas</p>
                <SiteNoticiasManager effectiveUserId={effectiveUserId} />
              </div>
            )}
          </div>
        </Section>

        <Section title="Clima" icon={Cloud} open={open.weather} onToggle={() => toggle("weather")}>
          <div className="space-y-2">
            {config.cidade_clima && (
              <p className="text-xs opacity-70">
                Atual: <span className="font-semibold">{config.cidade_clima}</span>
              </p>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="Buscar cidade"
                value={cityQuery}
                onChange={(e) => setCityQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") searchCity(); }}
              />
              <Button size="sm" onClick={searchCity} disabled={searching}>
                {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
              </Button>
            </div>
            {cityResults.length > 0 && (
              <ul className="space-y-1 max-h-40 overflow-y-auto">
                {cityResults.map((c, i) => (
                  <li key={i}>
                    <button
                      onClick={() => pickCity(c)}
                      className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-black/5"
                    >
                      {c.display_name || c.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        <Section title="Publicar" icon={Globe} open={open.pub} onToggle={() => toggle("pub")}>
          <p className="text-xs opacity-70">
            Em breve: URL pública e domínio personalizado. Por enquanto, este painel já gera o preview ao vivo do seu site.
          </p>
        </Section>
      </div>
    </div>
  );
}
