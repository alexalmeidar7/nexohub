import { useEffect, useMemo, useState } from "react";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import SiteMockup from "./SiteMockup";
import SiteNoticiasManager from "./SiteNoticiasManager";
import SiteCategoriasManager from "./SiteCategoriasManager";
import SiteBannersManager from "./SiteBannersManager";
import SiteDeployPanel from "./SiteDeployPanel";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import {
  Globe, Newspaper, Cloud, Settings, Loader2, Search, Eye, EyeOff,
  Smartphone, Monitor, Palette, MapPin, LayoutDashboard, Image as ImageIcon, Server,
  FileText, Upload as UploadIcon, CheckCircle2,
} from "lucide-react";

interface Props { effectiveUserId: string | null; }

type ModuleId = "overview" | "secoes" | "noticias" | "banners" | "aparencia" | "clima" | "servidor";

const MODULES: { id: ModuleId; label: string; icon: any; desc: string }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard, desc: "Resumo e últimos envios" },
  { id: "secoes", label: "Seções", icon: Settings, desc: "O que aparece no site" },
  { id: "noticias", label: "Notícias & Categorias", icon: Newspaper, desc: "Conteúdo editorial" },
  { id: "banners", label: "Banners & Mídia", icon: ImageIcon, desc: "Imagens promocionais" },
  { id: "aparencia", label: "Aparência & SEO", icon: Palette, desc: "Marca, meta tags, OG" },
  { id: "clima", label: "Clima", icon: Cloud, desc: "Cidade padrão" },
  { id: "servidor", label: "Servidor & Deploy", icon: Server, desc: "FTP e publicação" },
];

function Toggle({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-full transition"
      style={{
        background: "#ffffff",
        border: `2px solid ${checked ? "#0055ff" : "rgba(226, 232, 240, 0.9)"}`,
      }} data-nexo-skip>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {checked ? <Eye size={13} style={{ color: "#0055ff" }} /> : <EyeOff size={13} style={{ color: "#64748B" }} />}
          <span className="text-[12px] font-extrabold uppercase tracking-wider" style={{ color: "#002132" }}>{label}</span>
        </div>
        {description && <p className="text-[11px] mt-0.5 pl-5" style={{ color: "#64748B" }}>{description}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[10px] font-extrabold uppercase tracking-wider block mb-1.5" style={{ color: "#64748b", letterSpacing: "1.2px" }}>{children}</label>;
}

function StatCard({ icon: Icon, label, value, hint, accent }: { icon: any; label: string; value: string | number; hint?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-4 flex flex-col gap-1 transition hover:-translate-y-0.5"
      style={{
        background: accent ? "#0055ff" : "#f8fafc",
        border: `1px solid ${accent ? "#0055ff" : "rgba(226, 232, 240, 0.9)"}`,
        boxShadow: accent ? "0 4px 14px rgba(0,85,255,0.25)" : "0 2px 8px rgba(0,0,0,0.03)",
      }} data-nexo-skip>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-extrabold" style={{ color: accent ? "#ffffff" : "#64748b", letterSpacing: "1px" }}>
        <Icon size={11} /> {label}
      </div>
      <div className="text-2xl font-black leading-none" style={{ color: accent ? "#ffffff" : "#002132" }}>{value}</div>
      {hint && <div className="text-[10px] font-semibold" style={{ color: accent ? "rgba(255,255,255,0.8)" : "#64748B" }}>{hint}</div>}
    </div>
  );
}

export default function SitePage({ effectiveUserId }: Props) {
  const { config, loading, update } = useSiteConfig(effectiveUserId);
  const [module, setModule] = useState<ModuleId>("overview");
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [stats, setStats] = useState({ noticias: 0, banners: 0, categorias: 0, lastDeploy: null as string | null, deployStatus: null as string | null });

  const visibleCount = useMemo(() => {
    if (!config) return 0;
    return [config.show_no_ar, config.show_noticias, config.show_clima, config.show_economia, config.show_promocoes, config.show_grade].filter(Boolean).length;
  }, [config]);

  useEffect(() => {
    if (!effectiveUserId) return;
    (async () => {
      const [n, b, c, d] = await Promise.all([
        supabase.from("site_noticias").select("id", { count: "exact", head: true }).eq("user_id", effectiveUserId).eq("publicado", true),
        supabase.from("site_banners").select("id", { count: "exact", head: true }).eq("user_id", effectiveUserId).eq("ativo", true),
        supabase.from("site_categorias").select("id", { count: "exact", head: true }).eq("user_id", effectiveUserId),
        supabase.from("site_deploy_history").select("status,created_at").eq("user_id", effectiveUserId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      setStats({
        noticias: n.count || 0,
        banners: b.count || 0,
        categorias: c.count || 0,
        lastDeploy: d.data?.created_at || null,
        deployStatus: d.data?.status || null,
      });
    })();
  }, [effectiveUserId, module]);

  if (!effectiveUserId) return <div className="flex items-center justify-center h-64 text-sm opacity-70">Aguarde a sessão carregar…</div>;
  if (loading) return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin" /></div>;
  if (!config) return <div className="flex items-center justify-center h-64 text-sm opacity-70">Não foi possível carregar as configurações.</div>;

  const searchCity = async () => {
    if (!cityQuery.trim()) return;
    setSearching(true);
    try {
      const { data } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: cityQuery, count: 5 } });
      setCityResults(data?.results || []);
    } finally { setSearching(false); }
  };
  const pickCity = (c: any) => {
    update({ cidade_clima: c.name, cidade_lat: c.latitude, cidade_lon: c.longitude });
    setCityResults([]); setCityQuery("");
  };
  

  const accent = "var(--layout-accent-color, #268ffa)";
  const textColor = "var(--layout-page-text, #1a1a1a)";
  const subtleBg = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 3%, transparent)";
  const subtleBorder = "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)";

  return (
    <div className="nexo-scope space-y-4 w-full max-w-none mx-0">
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Site — Admin
      </div>
      <div className="nexo-scope animate-fade-in flex flex-col gap-4 h-full min-h-0" style={{ fontFamily: "Montserrat, system-ui, sans-serif" }}>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5 rounded-3xl" style={{ background: "#ffffff", border: "1px solid rgba(226, 232, 240, 0.9)", boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)" }} data-nexo-skip>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: "#0055ff", color: "#fff" }}>
            <Globe size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-sm font-extrabold uppercase tracking-wider truncate" style={{ color: "#002132" }}>
              {config.site_nome || "Meu Site"}
            </h1>
            <p className="text-[11px] font-semibold truncate" style={{ color: "#64748b" }}>
              Painel administrativo · {visibleCount} seções ativas
              {config.site_dominio ? ` · ${config.site_dominio}` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModule("servidor")}
            data-nexo="primary"
            className="inline-flex items-center gap-1.5 h-10 px-5 rounded-full text-xs font-extrabold uppercase tracking-wider transition hover:scale-105"
            style={{ background: "#0055ff", color: "#ffffff", boxShadow: "0 4px 14px rgba(0, 85, 255, 0.25)" }}>
            <UploadIcon size={13} /> Publicar
          </button>
        </div>
      </div>

      {/* Layout: sidebar modules + content */}
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-4 flex-1 min-h-0">
        {/* Sidebar */}
        <nav className="rounded-3xl p-3 flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible"
          style={{ background: "#ffffff", border: "1px solid rgba(226, 232, 240, 0.9)", boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)" }} data-nexo-skip>
          {MODULES.map((m) => {
            const active = module === m.id;
            const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => setModule(m.id)}
                className="flex items-center gap-2.5 px-4 py-2.5 rounded-full text-left transition shrink-0 lg:w-full"
                style={{
                  background: active ? "#0055ff" : "transparent",
                  color: active ? "#ffffff" : "#002132",
                  fontFamily: "Montserrat, system-ui, sans-serif",
                }}>
                <Icon size={15} className="shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider truncate">{m.label}</div>
                  <div className="text-[10px] font-medium opacity-80 truncate hidden lg:block" style={{ color: active ? "rgba(255,255,255,0.85)" : "#64748b" }}>{m.desc}</div>
                </div>
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="rounded-3xl overflow-hidden flex flex-col min-h-0"
          style={{ background: "#ffffff", border: "1px solid rgba(226, 232, 240, 0.9)", boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)" }} data-nexo-skip>
          <div className="flex-1 overflow-y-auto p-5">

            {module === "overview" && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <StatCard icon={Newspaper} label="Notícias" value={stats.noticias} hint="publicadas" />
                  <StatCard icon={ImageIcon} label="Banners" value={stats.banners} hint="ativos" />
                  <StatCard icon={FileText} label="Categorias" value={stats.categorias} />
                  <StatCard icon={CheckCircle2} label="Seções" value={visibleCount} hint="de 6 ativas" accent />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="md:col-span-2 rounded-xl overflow-hidden flex flex-col"
                    style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 2%, transparent)", border: subtleBorder }}>
                    <div className="flex items-center gap-2 px-3 py-2 border-b text-xs font-semibold" style={{ borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
                      <button onClick={() => setDevice("desktop")} className="p-1 rounded" style={{ background: device === "desktop" ? accent : "transparent", color: device === "desktop" ? "#fff" : "inherit" }}>
                        <Monitor size={12} />
                      </button>
                      <button onClick={() => setDevice("mobile")} className="p-1 rounded" style={{ background: device === "mobile" ? accent : "transparent", color: device === "mobile" ? "#fff" : "inherit" }}>
                        <Smartphone size={12} />
                      </button>
                      <span className="opacity-60 ml-2">Preview ao vivo</span>
                      <span className="ml-auto text-[10px] opacity-70">preview ao vivo</span>
                    </div>
                    <div className="bg-white flex justify-center overflow-auto" style={{ maxHeight: 480 }}>
                      <div style={{ width: device === "mobile" ? 360 : "100%", maxWidth: device === "mobile" ? 360 : "none" }}>
                        <SiteMockup config={config} effectiveUserId={effectiveUserId} />
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl p-3 flex flex-col gap-2"
                    style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 2%, transparent)", border: subtleBorder }}>
                    <div className="text-xs font-semibold flex items-center gap-1.5 opacity-70">
                      <Server size={12} /> Último envio
                    </div>
                    {stats.lastDeploy ? (
                      <>
                        <div className="text-sm font-medium flex items-center gap-1.5">
                          {stats.deployStatus === "success" ? <CheckCircle2 size={14} className="text-emerald-500" /> : <span className="text-red-500">⚠</span>}
                          {stats.deployStatus === "success" ? "Publicado" : "Falhou"}
                        </div>
                        <div className="text-[11px] opacity-60">{new Date(stats.lastDeploy).toLocaleString("pt-BR")}</div>
                      </>
                    ) : (
                      <div className="text-xs opacity-60">Nenhuma publicação ainda.</div>
                    )}
                    <Button size="sm" className="mt-2 gap-1.5" onClick={() => setModule("servidor")}
                      style={{ background: accent, color: "#fff" }}>
                      <UploadIcon size={12} /> Ir para Servidor
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {module === "secoes" && (
              <div className="space-y-2 max-w-xl">
                <p className="text-[11px] opacity-60 mb-2">Ative ou desative os blocos exibidos no site público.</p>
                <Toggle label="No Ar agora" description="Programa em transmissão" checked={config.show_no_ar} onChange={(v) => update({ show_no_ar: v })} />
                <Toggle label="Notícias" description="Manchetes do roteiro ou cadastradas" checked={config.show_noticias} onChange={(v) => update({ show_noticias: v })} />
                <Toggle label="Clima" description="Previsão da cidade configurada" checked={config.show_clima} onChange={(v) => update({ show_clima: v })} />
                <Toggle label="Economia" description="Cotações de moedas e bolsas" checked={config.show_economia} onChange={(v) => update({ show_economia: v })} />
                <Toggle label="Promoções" description="Promoções vigentes" checked={config.show_promocoes} onChange={(v) => update({ show_promocoes: v })} />
                <Toggle label="Grade de programação" description="Programas e horários" checked={config.show_grade} onChange={(v) => update({ show_grade: v })} />
              </div>
            )}

            {module === "noticias" && (
              <div className="space-y-4 max-w-3xl">
                <div>
                  <FieldLabel>Fonte das notícias</FieldLabel>
                  <div className="grid grid-cols-2 gap-2 max-w-sm">
                    {[{ v: "roteiro", l: "Último roteiro" }, { v: "manual", l: "Cadastro manual" }].map((opt) => {
                      const active = config.fonte_noticias === opt.v;
                      return (
                        <button key={opt.v} onClick={() => update({ fonte_noticias: opt.v as any })}
                          className="text-xs py-2.5 rounded-lg transition font-medium"
                          style={{ background: active ? accent : "transparent", color: active ? "#fff" : "inherit",
                            border: `1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) ${active ? 0 : 12}%, transparent)` }}>
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
              </div>
            )}

            {module === "banners" && (
              <div className="max-w-2xl">
                <p className="text-[11px] opacity-60 mb-3">Envie imagens promocionais e defina onde aparecem no site.</p>
                <SiteBannersManager effectiveUserId={effectiveUserId} />
              </div>
            )}

            {module === "aparencia" && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl">
                <div className="space-y-3">
                  <div><FieldLabel>Nome do site</FieldLabel>
                    <Input value={config.site_nome} onChange={(e) => update({ site_nome: e.target.value })} /></div>
                  <div><FieldLabel>Domínio</FieldLabel>
                    <Input placeholder="www.meusite.com.br" value={config.site_dominio || ""} onChange={(e) => update({ site_dominio: e.target.value })} /></div>
                  <div><FieldLabel>Descrição curta</FieldLabel>
                    <Input value={config.site_descricao} onChange={(e) => update({ site_descricao: e.target.value })} /></div>
                  <div>
                    <FieldLabel>Cor primária</FieldLabel>
                    <div className="flex items-center gap-2">
                      <input type="color" value={config.cor_primaria} onChange={(e) => update({ cor_primaria: e.target.value })}
                        className="w-12 h-10 rounded-lg cursor-pointer border-0 bg-transparent" />
                      <Input value={config.cor_primaria} onChange={(e) => update({ cor_primaria: e.target.value })} className="font-mono text-xs" />
                    </div>
                  </div>
                </div>
                <div className="space-y-3">
                  <div><FieldLabel>Logo (URL)</FieldLabel>
                    <Input placeholder="https://.../logo.png" value={config.logo_url || ""} onChange={(e) => update({ logo_url: e.target.value })} /></div>
                  <div><FieldLabel>Favicon (URL)</FieldLabel>
                    <Input placeholder="https://.../favicon.ico" value={config.favicon_url || ""} onChange={(e) => update({ favicon_url: e.target.value })} /></div>
                  <div><FieldLabel>Meta description (SEO)</FieldLabel>
                    <Input placeholder="Até 160 caracteres" maxLength={160} value={config.meta_description || ""} onChange={(e) => update({ meta_description: e.target.value })} />
                    <div className="text-[10px] opacity-50 text-right mt-1">{(config.meta_description || "").length}/160</div>
                  </div>
                  <div><FieldLabel>Palavras-chave</FieldLabel>
                    <Input placeholder="rádio, notícias, música" value={config.meta_keywords || ""} onChange={(e) => update({ meta_keywords: e.target.value })} /></div>
                  <div><FieldLabel>Imagem Open Graph (compartilhamento)</FieldLabel>
                    <Input placeholder="https://.../og.jpg 1200x630" value={config.og_image_url || ""} onChange={(e) => update({ og_image_url: e.target.value })} /></div>
                </div>
              </div>
            )}

            {module === "clima" && (
              <div className="space-y-3 max-w-md">
                {config.cidade_clima && (
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg"
                    style={{ background: "color-mix(in srgb, var(--layout-accent-color, #268ffa) 10%, transparent)",
                      border: "1px solid color-mix(in srgb, var(--layout-accent-color, #268ffa) 25%, transparent)" }}>
                    <MapPin size={14} style={{ color: accent }} />
                    <span className="text-sm font-semibold flex-1">{config.cidade_clima}</span>
                    <span className="text-[10px] opacity-60">{config.cidade_lat?.toFixed(2)}, {config.cidade_lon?.toFixed(2)}</span>
                  </div>
                )}
                <div>
                  <FieldLabel>Buscar cidade</FieldLabel>
                  <div className="flex gap-2">
                    <Input placeholder="Ex.: São Paulo" value={cityQuery} onChange={(e) => setCityQuery(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") searchCity(); }} />
                    <Button size="sm" onClick={searchCity} disabled={searching}>
                      {searching ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                    </Button>
                  </div>
                </div>
                {cityResults.length > 0 && (
                  <ul className="space-y-1 max-h-64 overflow-y-auto">
                    {cityResults.map((c, i) => (
                      <li key={i}>
                        <button onClick={() => pickCity(c)} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-black/5 transition" style={{ border: subtleBorder }}>
                          <div className="font-medium">{c.name}</div>
                          {c.admin1 && <div className="opacity-60 text-[10px]">{c.admin1}{c.country ? ` · ${c.country}` : ""}</div>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {module === "servidor" && (
              <div className="max-w-xl">
                <SiteDeployPanel effectiveUserId={effectiveUserId} />
              </div>
            )}

          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
