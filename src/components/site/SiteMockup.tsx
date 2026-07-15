import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Cloud, TrendingUp, TrendingDown, Radio, Tag, Calendar, Newspaper } from "lucide-react";
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

export default function SiteMockup({ config, effectiveUserId }: Props) {
  const [noticias, setNoticias] = useState<Noticia[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [programas, setProgramas] = useState<Programa[]>([]);
  const [stocks, setStocks] = useState<Stock[]>([]);
  const [weather, setWeather] = useState<any>(null);
  const [noAr, setNoAr] = useState<string>("");
  const [refreshTick, setRefreshTick] = useState(0);

  // Cross-tab refresh from admin panel
  useEffect(() => subscribeSiteSync(() => setRefreshTick((t) => t + 1)), []);


  // Notícias
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
        setNoticias(
          (data || []).map((n: any) => ({
            id: n.id,
            titulo: n.titulo,
            resumo: n.resumo,
            imagem_url: n.imagem_url,
            categoria_nome: n.site_categorias?.nome,
          }))
        );
      } else {
        // Pega último roteiro do usuário e extrai manchetes
        const { data } = await supabase
          .from("roteiros")
          .select("conteudo_html, titulo, tickertitulos")
          .eq("user_id", effectiveUserId)
          .ilike("tipo_programa", "%jornal%")
          .order("created_at", { ascending: false })
          .limit(1);
        if (cancelled) return;
        const r = data?.[0];
        if (r) {
          const txt = String(r.tickertitulos || r.conteudo_html || "");
          // extrai linhas de manchete simples
          const lines = txt
            .replace(/<[^>]+>/g, "\n")
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.length > 30 && l.length < 180)
            .slice(0, 6);
          setNoticias(
            lines.map((titulo, i) => ({
              id: String(i),
              titulo,
              categoria_nome: "Jornal",
            }))
          );
        } else {
          setNoticias([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effectiveUserId, config.fonte_noticias, refreshTick]);

  // Promoções
  useEffect(() => {
    if (!effectiveUserId || !config.show_promocoes) return;
    (async () => {
      const today = todayInBrasilia();
      const { data } = await supabase
        .from("promocoes")
        .select("id, titulo, data_fim")
        .eq("user_id", effectiveUserId)
        .gte("data_fim", today)
        .order("data_fim", { ascending: true })
        .limit(4);
      setPromos((data as any) || []);
    })();
  }, [effectiveUserId, config.show_promocoes, refreshTick]);

  // Programas
  useEffect(() => {
    if (!effectiveUserId || !config.show_grade) return;
    (async () => {
      const { data } = await supabase
        .from("programas")
        .select("id, nome, horario_inicio, horario_fim, dias_semana")
        .eq("user_id", effectiveUserId)
        .eq("ativo", true)
        .ilike("estudio", "%fm%")
        .order("horario_inicio", { ascending: true })
        .limit(8);
      setProgramas((data as any) || []);
    })();
  }, [effectiveUserId, config.show_grade, refreshTick]);

  // Economia
  useEffect(() => {
    if (!config.show_economia) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("fetch-stocks");
        if (data?.stocks) setStocks(data.stocks.slice(0, 4));
      } catch {}
    })();
  }, [config.show_economia]);

  // Clima
  useEffect(() => {
    if (!config.show_clima || !config.cidade_lat || !config.cidade_lon) return;
    (async () => {
      try {
        const { data } = await supabase.functions.invoke("fetch-weather", {
          body: { action: "forecast", lat: config.cidade_lat, lon: config.cidade_lon, forecast_days: 3 },
        });
        if (data?.ok) setWeather(data.data);
      } catch {}
    })();
  }, [config.show_clima, config.cidade_lat, config.cidade_lon]);

  // No Ar (programa por horário)
  useEffect(() => {
    if (!config.show_no_ar) return;
    const now = new Date();
    const hm = now.toTimeString().slice(0, 5);
    const atual = programas.find((p) => {
      if (!p.horario_inicio || !p.horario_fim) return false;
      return hm >= p.horario_inicio.slice(0, 5) && hm <= p.horario_fim.slice(0, 5);
    });
    setNoAr(atual?.nome || "");
  }, [programas, config.show_no_ar]);

  const accent = config.cor_primaria || "#268ffa";

  return (
    <div className="w-full h-full flex flex-col bg-white text-slate-900 overflow-hidden">
      {/* Header */}
      <header
        className="px-6 py-4 flex items-center justify-between text-white"
        style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)` }}
      >
        <div>
          <h1 className="text-xl font-bold tracking-tight">{config.site_nome}</h1>
          {config.site_descricao && (
            <p className="text-xs opacity-80">{config.site_descricao}</p>
          )}
        </div>
        {config.show_no_ar && noAr && (
          <div className="flex items-center gap-2 text-xs bg-white/15 px-3 py-1.5 rounded-full backdrop-blur">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <Radio size={12} />
            <span className="font-semibold">No ar:</span> {noAr}
          </div>
        )}
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Notícias */}
        {config.show_noticias && (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-bold mb-2" style={{ color: accent }}>
              <Newspaper size={14} /> Notícias
            </h2>
            {noticias.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Sem notícias publicadas.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {noticias.map((n) => (
                  <article key={n.id} className="rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
                    {n.imagem_url ? (
                      <div className="h-20 bg-slate-200" style={{ backgroundImage: `url(${n.imagem_url})`, backgroundSize: "cover", backgroundPosition: "center" }} />
                    ) : (
                      <div className="h-1" style={{ background: accent }} />
                    )}
                    <div className="p-2">
                      {n.categoria_nome && (
                        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>
                          {n.categoria_nome}
                        </span>
                      )}
                      <h3 className="text-xs font-semibold leading-tight line-clamp-3">{n.titulo}</h3>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="grid grid-cols-2 gap-3">
          {/* Clima */}
          {config.show_clima && (
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h2 className="flex items-center gap-2 text-xs font-bold mb-2" style={{ color: accent }}>
                <Cloud size={12} /> {config.cidade_clima || "Clima"}
              </h2>
              {weather?.current ? (
                <div>
                  <div className="text-2xl font-bold">{Math.round(weather.current.temperature_2m)}°</div>
                  <div className="text-[10px] text-slate-500">
                    Sensação {Math.round(weather.current.apparent_temperature)}° · Umidade {weather.current.relative_humidity_2m}%
                  </div>
                </div>
              ) : (
                <p className="text-[10px] text-slate-400 italic">Configure a cidade.</p>
              )}
            </section>
          )}

          {/* Economia */}
          {config.show_economia && (
            <section className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <h2 className="flex items-center gap-2 text-xs font-bold mb-2" style={{ color: accent }}>
                <TrendingUp size={12} /> Mercado
              </h2>
              <ul className="space-y-1">
                {stocks.map((s) => (
                  <li key={s.name} className="flex justify-between text-[10px]">
                    <span className="font-medium">{s.flag} {s.name}</span>
                    <span className={s.direction === "up" ? "text-emerald-600" : s.direction === "down" ? "text-red-600" : "text-slate-500"}>
                      {s.change}
                    </span>
                  </li>
                ))}
                {stocks.length === 0 && <li className="text-[10px] text-slate-400 italic">Carregando…</li>}
              </ul>
            </section>
          )}
        </div>

        {/* Promoções */}
        {config.show_promocoes && (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-bold mb-2" style={{ color: accent }}>
              <Tag size={14} /> Promoções
            </h2>
            {promos.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Nenhuma promoção vigente.</p>
            ) : (
              <ul className="space-y-1.5">
                {promos.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-xs px-3 py-2 rounded border border-slate-200 bg-slate-50">
                    <span className="font-medium">{p.titulo}</span>
                    <span className="text-[10px] text-slate-500">até {new Date(p.data_fim).toLocaleDateString("pt-BR")}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Grade */}
        {config.show_grade && (
          <section>
            <h2 className="flex items-center gap-2 text-sm font-bold mb-2" style={{ color: accent }}>
              <Calendar size={14} /> Programação
            </h2>
            <ul className="divide-y divide-slate-200 border border-slate-200 rounded bg-slate-50">
              {programas.map((p) => {
                const isOnAir = p.nome === noAr;
                return (
                  <li
                    key={p.id}
                    className="flex items-center justify-between px-3 py-2 text-xs"
                    style={isOnAir ? { background: `${accent}15` } : {}}
                  >
                    <span className="font-medium">{p.nome}</span>
                    <span className="text-[10px] text-slate-500">
                      {p.horario_inicio?.slice(0, 5)} – {p.horario_fim?.slice(0, 5)}
                      {isOnAir && <span className="ml-2 font-bold" style={{ color: accent }}>NO AR</span>}
                    </span>
                  </li>
                );
              })}
              {programas.length === 0 && (
                <li className="px-3 py-2 text-xs text-slate-400 italic">Sem programas cadastrados.</li>
              )}
            </ul>
          </section>
        )}
      </div>

      {/* Footer */}
      <footer className="px-4 py-2 text-[10px] text-center text-slate-400 border-t border-slate-200">
        © {new Date().getFullYear()} {config.site_nome}
      </footer>
    </div>
  );
}
