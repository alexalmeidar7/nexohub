import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CloudSun, TrendingUp, TrendingDown, Radio, Tag, Calendar, Newspaper,
  Play, Search, UserRound, Headphones, Gift, ArrowRight, Music2, Clock3,
  MoonStar, MapPin, ExternalLink,
} from "lucide-react";
import type { SiteConfig } from "@/hooks/useSiteConfig";
import { subscribeSiteSync } from "@/lib/siteSync";
import { todayInBrasilia } from "@/lib/brasiliaDate";

interface Props {
  config: SiteConfig;
  effectiveUserId: string | null;
}
interface Noticia {
  id: string;
  titulo: string;
  resumo?: string;
  imagem_url?: string;
  categoria_nome?: string;
}
interface Promo {
  id: string;
  titulo: string;
  data_fim: string;
}
interface Programa {
  id: string;
  nome: string;
  horario_inicio?: string;
  horario_fim?: string;
  dias_semana?: string[];
}
interface Stock {
  name: string;
  value: string;
  change: string;
  direction: "up" | "down" | "neutral";
  flag?: string;
}
interface Banner {
  id: string;
  nome: string;
  image_url: string;
  link_url?: string | null;
  posicao: string;
  ativo: boolean;
}

const formatTime = (value?: string) => value?.slice(0, 5) || "";
const dayNames: Record<string, string> = {
  seg: "SEG", ter: "TER", qua: "QUA", qui: "QUI", sex: "SEX", sab: "SÁB", dom: "DOM",
};

export default function SiteMockup({ config, effectiveUserId }: Props) {
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [playingPreview, setPlayingPreview] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => subscribeSiteSync(() => setRefreshTick((t) => t + 1)), []);

  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("site_banners")
        .select("id,nome,image_url,link_url,posicao,ativo")
        .eq("user_id", effectiveUserId)
        .eq("ativo", true)
        .order("created_at", { ascending: false });
      if (!cancelled) setBanners((data as Banner[]) || []);
    })();
    return () => { cancelled = true; };
  }, [effectiveUserId, refreshTick]);

  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    (async () => {
      if (config.fonte_noticias === "manual") {
        const { data } = await supabase
          .from("site_noticias")
          .select("id, titulo, resumo, imagem_url, site_categorias(nome)")
          .eq("user_id", effectiveUserId)
          .eq("publicado", true)
          .order("created_at", { ascending: false })
          .limit(6);
        if (cancelled) return;
        setNoticias((data || []).map((n: any) => ({
          id: n.id, titulo: n.titulo, resumo: n.resumo, imagem_url: n.imagem_url,
          categoria_nome: n.site_categorias?.nome,
        })));
      } else {
        const { data } = await supabase
          .from("roteiros")
          .select("conteudo_html, titulo, tickertitulos")
          .eq("user_id", effectiveUserId)
          .ilike("tipo_programa", "%jornal%")
          .order("created_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        const r = data?.[0];
        const lines = r
          ? String(r.tickertitulos || r.conteudo_html || "").replace(/<[^>]+>/g, "\\n")
              .split("\\n").map((l) => l.trim()).filter((l) => l.length > 30 && l.length < 180).slice(0, 6)
          : [];
        setNoticias(lines.map((titulo, i) => ({ id: String(i), titulo, categoria_nome: "Jornal" })));
      }
    })();
    return () => { cancelled = true; };
  }, [effectiveUserId, config.fonte_noticias, refreshTick]);

  useEffect(() => {
    if (!effectiveUserId || !config.show_promocoes) { setPromos([]); return; }
    (async () => {
      const { data } = await supabase.from("promocoes").select("id, titulo, data_fim")
        .eq("user_id", effectiveUserId).gte("data_fim", todayInBrasilia())
        .order("data_fim", { ascending: true }).limit(4);
      setPromos((data as any) || []);
    })();
  }, [effectiveUserId, config.show_promocoes, refreshTick]);

  useEffect(() => {
    if (!effectiveUserId || !config.show_grade) { setProgramas([]); return; }
    (async () => {
      const { data } = await supabase.from("programas")
        .select("id, nome, horario_inicio, horario_fim, dias_semana")
        .eq("user_id", effectiveUserId).eq("ativo", true).ilike("estudio", "%fm%")
        .order("horario_inicio", { ascending: true }).limit(8);
      setProgramas((data as any) || []);
    })();
  }, [effectiveUserId, config.show_grade, refreshTick]);

  useEffect(() => {
    if (!config.show_economia) { setStocks([]); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("fetch-stocks");
        if (!cancelled && data?.stocks) setStocks(data.stocks.slice(0, 4));
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [config.show_economia]);

  useEffect(() => {
    if (!config.show_clima || !config.cidade_lat || !config.cidade_lon) { setWeather(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("fetch-weather", {
          body: { action: "forecast", lat: config.cidade_lat, lon: config.cidade_lon, forecast_days: 3 },
        });
        if (!cancelled && data?.ok) setWeather(data.data);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [config.show_clima, config.cidade_lat, config.cidade_lon]);

  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const currentProgram = programas.find((p) => {
    if (!p.horario_inicio || !p.horario_fim) return false;
    const start = p.horario_inicio.split(":").map(Number);
    const end = p.horario_fim.split(":").map(Number);
    const from = start[0] * 60 + start[1];
    const to = end[0] * 60 + end[1];
    return from <= to ? nowMinutes >= from && nowMinutes < to : nowMinutes >= from || nowMinutes < to;
  });
  const nextProgram = currentProgram
    ? programas.find((p) => p.id !== currentProgram.id && formatTime(p.horario_inicio) >= formatTime(currentProgram.horario_fim))
    : programas.find((p) => formatTime(p.horario_inicio) > now.toTimeString().slice(0, 5));
  const accent = config.cor_primaria || "#F59E0B";
  const heroBanner = banners.find((b) => b.posicao === "topo");
  const midBanner = banners.find((b) => b.posicao === "meio");
  const footerBanner = banners.find((b) => b.posicao === "rodape");
  const weatherCurrent = weather?.current;
  const heroStyle = heroBanner?.image_url
    ? { backgroundImage: `linear-gradient(90deg, rgba(4,13,34,.92) 0%, rgba(4,13,34,.7) 38%, rgba(4,13,34,.15) 100%), url("${heroBanner.image_url}")` }
    : { backgroundImage: `radial-gradient(circle at 72% 38%, ${accent}55 0, transparent 28%), linear-gradient(112deg, #07152f 0%, #0b2450 58%, #07152f 100%)` };

  return (
    <div className="w-full bg-[#f6f7f9] text-slate-900 overflow-hidden" style={{ fontFamily: "Inter, Montserrat, system-ui, sans-serif" }}>
      {/* Template Nexo — header floats over a full-bleed hero; all content aligns to one centered container. */}
      <section className="relative text-white bg-cover bg-center" style={{ ...heroStyle, backgroundColor: "#07152f" }}>
        <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4">
          <a href="#" className="min-w-0 no-underline text-white">
            {config.logo_url ? <img src={config.logo_url} alt={config.site_nome} className="max-h-12 max-w-36 object-contain" /> : (
              <div className="leading-tight">
                <div className="text-lg font-black tracking-tight">{config.site_nome || "Sua Rádio"}<span style={{ color: accent }}> FM</span></div>
                <div className="text-[9px] tracking-[.2em] text-white/65">{config.site_descricao || "A SUA RÁDIO, TODOS OS DIAS"}</div>
              </div>
            )}
          </a>
          <nav className="hidden items-center gap-4 lg:flex">
            {["Home", "Notícias", "Podcasts", "Player", "Promoções", "A rádio"].map((item) => (
              <a key={item} href="#" className="text-[10px] font-semibold uppercase tracking-wide text-white/90 no-underline hover:text-white">{item}</a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-white/25 px-3 py-2 text-[10px] text-white/70 md:flex"><Search size={12} /> Buscar</div>
            <div className="hidden items-center gap-1 rounded-full px-3 py-2 text-[10px] font-bold text-[#07152f] sm:flex" style={{ background: accent }}><UserRound size={12} /> Ouvinte</div>
          </div>
        </header>

        <div className="mx-auto grid min-h-[245px] max-w-6xl grid-cols-1 items-center gap-6 px-5 pb-8 pt-5 md:min-h-[300px] md:grid-cols-[1fr_0.65fr] md:pb-12">
          <div className="max-w-xl">
            {config.show_no_ar && <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.16em]" style={{ color: accent }}>
              <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: accent }} /> No ar agora
            </div>}
            <h1 className="text-3xl font-black leading-[.98] tracking-tight sm:text-5xl">{currentProgram?.nome || config.site_nome || "Sua rádio, seu momento"}</h1>
            <p className="mt-3 text-sm text-white/80">{config.site_descricao || "Música, informação e companhia para o seu dia."}</p>
            <div className="mt-3 text-[11px] tracking-wide text-white/65">
              {currentProgram ? `${formatTime(currentProgram.horario_inicio)} — ${formatTime(currentProgram.horario_fim)}` : "Programação ao vivo"}
            </div>
            {config.show_no_ar && <button type="button" onClick={() => setPlayingPreview((v) => !v)}
              className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-xs font-bold text-[#07152f] transition hover:scale-[1.02]"
              style={{ background: accent }}><Play size={13} fill="currentColor" /> Ouvir ao vivo</button>}
          </div>
          <div className="justify-self-end border-l border-white/35 pl-5 md:min-w-[190px]">
            <div className="text-[10px] uppercase tracking-[.18em] text-white/60">A seguir</div>
            <div className="mt-2 text-base font-bold">{nextProgram?.nome || "Próximo programa"}</div>
            <div className="mt-1 text-xs text-white/70">{formatTime(nextProgram?.horario_inicio) || "Confira a programação"}</div>
            {nextProgram?.horario_fim && <div className="mt-1 text-[10px] text-white/50">{formatTime(nextProgram.horario_inicio)} — {formatTime(nextProgram.horario_fim)}</div>}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-7 px-5 py-5 sm:py-7">
        {/* Compact player aligned to the same central container. Preview control is visual only. */}
        <section className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm sm:px-4">
          <button type="button" aria-label="Reproduzir prévia" onClick={() => setPlayingPreview((v) => !v)}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white" style={{ background: accent }}>
            {playingPreview ? <span className="text-sm font-black">Ⅱ</span> : <Play size={15} fill="currentColor" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="text-[9px] font-bold uppercase tracking-[.15em] text-slate-400">Rádio ao vivo</div>
            <div className="truncate text-xs font-bold text-slate-900">{currentProgram?.nome || config.site_nome}</div>
            <div className="truncate text-[10px] text-slate-500">{config.site_descricao || "Transmissão ao vivo"}</div>
          </div>
          <div className="hidden items-center gap-1 sm:flex" aria-hidden="true">
            {Array.from({ length: 18 }).map((_, i) => <span key={i} className="w-1 rounded-full" style={{ height: 5 + ((i * 7) % 15), background: i < 7 ? accent : "#d8dee8" }} />)}
          </div>
          <div className="hidden text-[10px] font-medium text-slate-500 sm:block">AO VIVO</div>
        </section>

        <section>
          <div className="mb-3">
            <h2 className="text-base font-bold tracking-tight text-slate-900">Informação para o seu dia</h2>
            <p className="mt-1 text-xs text-slate-500">Serviços rápidos, sem sair da rádio.</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {config.show_clima && <article className="min-h-28 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-slate-500"><CloudSun size={15} style={{ color: accent }} /> Previsão do tempo</div>
              {weatherCurrent ? <div className="mt-3 flex items-end justify-between">
                <div><div className="text-2xl font-bold text-slate-900">{Math.round(weatherCurrent.temperature_2m)}°</div>
                  <div className="mt-1 text-[10px] text-slate-500">{config.cidade_clima || "Sua cidade"} · sensação {Math.round(weatherCurrent.apparent_temperature)}°</div></div>
                <div className="text-xs text-slate-400">Hoje</div>
              </div> : <div className="mt-3 text-xs text-slate-500">{config.cidade_clima ? "Previsão indisponível no momento" : "Configure a cidade no Gestor de Site"}</div>}
            </article>}
            <article className="min-h-28 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-slate-500"><MoonStar size={15} style={{ color: accent }} /> Signos</div>
              <div className="mt-3 text-sm font-bold text-slate-900">Horóscopo do dia</div>
              <div className="mt-1 text-[11px] leading-relaxed text-slate-500">Descubra as previsões para o seu signo.</div>
              <div className="mt-3 flex items-center gap-1 text-[10px] font-semibold" style={{ color: accent }}>Ver signos <ArrowRight size={12} /></div>
            </article>
            {config.show_economia && <article className="min-h-28 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[.13em] text-slate-500"><TrendingUp size={15} style={{ color: accent }} /> Cotações e bolsas</div>
              {stocks.length ? <div className="mt-3 space-y-1.5">
                {stocks.slice(0, 3).map((s) => <div key={s.name} className="flex items-center justify-between gap-2 text-[10px]">
                  <span className="truncate font-medium text-slate-700">{s.flag} {s.name}</span>
                  <span className={s.direction === "up" ? "text-emerald-600" : s.direction === "down" ? "text-rose-600" : "text-slate-500"}>
                    {s.value || s.change} {s.direction === "up" ? <TrendingUp className="inline" size={10} /> : s.direction === "down" ? <TrendingDown className="inline" size={10} /> : null}
                  </span>
                </div>)}
              </div> : <div className="mt-3 text-xs text-slate-500">Indicadores de mercado</div>}
            </article>}
          </div>
        </section>

        {/* Advertisement between utility boxes and on-demand content. Uses the existing banner manager. */}
        {midBanner && <a href={midBanner.link_url || "#"} className="block overflow-hidden rounded-xl bg-slate-100 no-underline" target={midBanner.link_url ? "_blank" : undefined} rel="noreferrer">
          <img src={midBanner.image_url} alt={midBanner.nome || "Publicidade"} className="max-h-44 w-full object-cover sm:max-h-52" />
        </a>}
        {!midBanner && <section className="flex min-h-20 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 py-5 text-center">
          <div><div className="text-[9px] font-bold uppercase tracking-[.18em] text-slate-400">Publicidade</div><div className="mt-1 text-sm font-semibold text-slate-600">Espaço para banner comercial horizontal</div></div>
        </section>}

        {/* On-demand preview uses the programs already configured for this station; no duplicate promotion records are created. */}
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="text-base font-bold tracking-tight text-slate-900">Conteúdos sob demanda</h2>
              <p className="mt-1 text-xs text-slate-500">Programas e conteúdos para ouvir quando quiser.</p></div>
            <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-slate-500">Ver no Player <ArrowRight size={12} /></span>
          </div>
          {programas.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {programas.slice(0, 4).map((p, i) => <article key={p.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <div className="flex aspect-[5/3] items-center justify-center" style={{ background: `linear-gradient(135deg, #07152f, ${accent}88)` }}>
                {i % 2 === 0 ? <Headphones className="text-white/90" size={28} /> : <Music2 className="text-white/90" size={28} />}
              </div>
              <div className="p-3"><div className="line-clamp-2 text-xs font-bold text-slate-900">{p.nome}</div>
                <div className="mt-1 flex items-center gap-1 text-[10px] text-slate-500"><Clock3 size={10} /> {formatTime(p.horario_inicio) || "Programa"}</div>
              </div>
            </article>)}
          </div> : <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500">Os programas cadastrados aparecerão aqui como conteúdos em destaque.</div>}
        </section>

        {config.show_noticias && <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div><h2 className="text-base font-bold tracking-tight text-slate-900">Notícias</h2>
              <p className="mt-1 text-xs text-slate-500">Informação que conecta você.</p></div>
            <span className="shrink-0 text-[10px] font-semibold text-slate-500">Todas as notícias <ArrowRight className="inline" size={12} /></span>
          </div>
          {noticias.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {noticias.slice(0, 6).map((n, i) => <article key={n.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {n.imagem_url ? <img src={n.imagem_url} alt="" className="aspect-[5/3] w-full object-cover" /> :
                <div className="flex aspect-[5/3] items-center justify-center" style={{ background: `linear-gradient(135deg, #e8edf4, ${accent}30)` }}><Newspaper size={24} className="text-slate-400" /></div>}
              <div className="p-3">{n.categoria_nome && <div className="mb-1 text-[9px] font-bold uppercase tracking-wide" style={{ color: accent }}>{n.categoria_nome}</div>}
                <h3 className="line-clamp-3 text-xs font-bold leading-relaxed text-slate-900">{n.titulo}</h3>
                {n.resumo && <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{n.resumo}</p>}
              </div>
            </article>)}
          </div> : <div className="rounded-xl border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-500">As notícias publicadas aparecerão aqui.</div>}
        </section>}

        {config.show_promocoes && promos.length > 0 && <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold tracking-tight text-slate-900">Promoções</h2><Tag size={15} style={{ color: accent }} /></div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{promos.slice(0, 4).map((p) => <article key={p.id} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${accent}18`, color: accent }}><Gift size={17} /></div>
            <div className="min-w-0 flex-1"><div className="truncate text-xs font-bold">{p.titulo}</div><div className="mt-1 text-[10px] text-slate-500">Até {new Date(p.data_fim).toLocaleDateString("pt-BR")}</div></div>
          </article>)}</div>
        </section>}

        {config.show_grade && programas.length > 0 && <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-base font-bold tracking-tight text-slate-900">Programação</h2><Calendar size={15} style={{ color: accent }} /></div>
          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {programas.slice(0, 6).map((p) => <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 text-xs">
              <span className="font-semibold text-slate-800">{p.nome}</span><span className="shrink-0 text-[10px] text-slate-500">{formatTime(p.horario_inicio)} — {formatTime(p.horario_fim)}</span>
            </div>)}
          </div>
        </section>}

        {footerBanner && <a href={footerBanner.link_url || "#"} className="block overflow-hidden rounded-xl no-underline" target={footerBanner.link_url ? "_blank" : undefined} rel="noreferrer"><img src={footerBanner.image_url} alt={footerBanner.nome || "Publicidade"} className="max-h-36 w-full object-cover" /></a>}
      </main>

      <footer className="bg-[#07152f] text-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-6 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="text-sm font-bold">{config.site_nome || "Sua Rádio"}</div><div className="mt-1 text-[10px] text-white/55">{config.site_descricao || "Música, informação e companhia."}</div></div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-white/70"><span>Home</span><span>Notícias</span><span>Player</span><span>Promoções</span><span>A rádio</span></div>
          <div className="text-[10px] text-white/45">© {new Date().getFullYear()} {config.site_nome}</div>
        </div>
      </footer>
    </div>
  );
}
