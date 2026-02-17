import { useState, useEffect } from "react";
import { RefreshCw, ExternalLink, Plus, TrendingUp, TrendingDown, Minus, Trash2, ChevronDown, ChevronUp, ListPlus } from "lucide-react";
import XmlLinkRow from "./XmlLinkRow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface NewsItem {
  title: string;
  link: string;
  thumbnail?: string;
}

interface Portal {
  name: string;
  rssUrl: string;
}

interface CotacaoItem {
  name: string;
  value: string;
  change: string;
  direction: "up" | "down" | "neutral";
}

interface SelectedNews {
  id?: string;
  portal: string;
  title: string;
  imageUrl: string;
}

interface EscaladaNews {
  id?: string;
  portal: string;
  title: string;
  imageUrl: string;
}

interface SelectedCotacao {
  id?: string;
  name: string;
  value: string;
  change: string;
}

const DEFAULT_PORTALS: Portal[] = [
  { name: "G1", rssUrl: "https://g1.globo.com/rss/g1/" },
  { name: "UOL", rssUrl: "https://rss.uol.com.br/feed/noticias.xml" },
  { name: "GloboNews", rssUrl: "https://g1.globo.com/rss/g1/globonews/" },
  { name: "Folha de S.Paulo", rssUrl: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml" },
  { name: "CNN Brasil", rssUrl: "https://www.cnnbrasil.com.br/feed/" },
];

const PROXY = "https://api.rss2json.com/v1/api.json?rss_url=";

async function fetchNews(rssUrl: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(`${PROXY}${encodeURIComponent(rssUrl)}`);
    const data = await res.json();
    if (data.status === "ok" && data.items) {
      return data.items.slice(0, 8).map((item: any) => ({
        title: item.title,
        link: item.link,
        thumbnail: item.thumbnail || item.enclosure?.link || "",
      }));
    }
    return [];
  } catch { return []; }
}

async function fetchCotacoes(): Promise<CotacaoItem[]> {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL,BTC-BRL,ETH-BRL,JPY-BRL,ARS-BRL,CNY-BRL");
    const data = await res.json();
    const moedas: CotacaoItem[] = Object.values(data).map((item: any) => {
      const pctChange = parseFloat(item.pctChange);
      return {
        name: `${item.code}/${item.codein}`,
        value: parseFloat(item.bid).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        change: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`,
        direction: pctChange > 0 ? "up" : pctChange < 0 ? "down" : "neutral",
      };
    });
    const bolsas: CotacaoItem[] = [];
    try {
      const bolsaRes = await fetch("https://economia.awesomeapi.com.br/last/DOW-JONES,S&P500,NASDAQ,IBOVESPA,FTSE,NIKKEI,DAX,CAC");
      const bolsaData = await bolsaRes.json();
      Object.values(bolsaData).forEach((item: any) => {
        const pctChange = parseFloat(item.pctChange || "0");
        bolsas.push({
          name: item.name || `${item.code}`,
          value: parseFloat(item.bid).toLocaleString("pt-BR"),
          change: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`,
          direction: pctChange > 0 ? "up" : pctChange < 0 ? "down" : "neutral",
        });
      });
    } catch {}
    return [...moedas, ...bolsas];
  } catch { return []; }
}

export default function NoticiasPanel() {
  const { user } = useAuth();
  const [newsByPortal, setNewsByPortal] = useState<Record<string, NewsItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [customUrl, setCustomUrl] = useState("");
  const [customSites, setCustomSites] = useState<(Portal & { id?: string })[]>([]);
  const [cotacoes, setCotacoes] = useState<CotacaoItem[]>([]);
  const [loadingCotacoes, setLoadingCotacoes] = useState(true);
  const [selectedNews, setSelectedNews] = useState<SelectedNews[]>([]);
  const [escaladaNews, setEscaladaNews] = useState<EscaladaNews[]>([]);
  const [selectedCotacoes, setSelectedCotacoes] = useState<SelectedCotacao[]>([]);
  const [expandedPortals, setExpandedPortals] = useState<Record<string, boolean>>({});

  // Load from DB
  useEffect(() => {
    if (!user) return;
    const loadDb = async () => {
      const [sitesRes, newsRes, cotRes, escRes] = await Promise.all([
        supabase.from("custom_news_sites").select("*"),
        supabase.from("selected_news").select("*"),
        supabase.from("selected_cotacoes").select("*"),
        supabase.from("escalada_news").select("*"),
      ]);
      setCustomSites((sitesRes.data || []).map(s => ({ id: s.id, name: s.name, rssUrl: s.rss_url })));
      setSelectedNews((newsRes.data || []).map(n => ({ id: n.id, portal: n.portal, title: n.title, imageUrl: n.image_url || "" })));
      setSelectedCotacoes((cotRes.data || []).map(c => ({ id: c.id, name: c.name, value: c.value, change: c.change })));
      setEscaladaNews((escRes.data || []).map(n => ({ id: n.id, portal: n.portal, title: n.title, imageUrl: n.image_url || "" })));
    };
    loadDb();
  }, [user]);

  const allPortals = [...DEFAULT_PORTALS, ...customSites];

  const loadAll = async () => {
    setLoading(true);
    const results: Record<string, NewsItem[]> = {};
    await Promise.all(allPortals.map(async (portal) => { results[portal.name] = await fetchNews(portal.rssUrl); }));
    setNewsByPortal(results);
    setLoading(false);
  };

  const loadCotacoes = async () => {
    setLoadingCotacoes(true);
    const data = await fetchCotacoes();
    setCotacoes(data);
    setLoadingCotacoes(false);
  };

  useEffect(() => { loadAll(); loadCotacoes(); const interval = setInterval(loadCotacoes, 60 * 1000); return () => clearInterval(interval); }, [customSites.length]);

  const addCustomSite = async () => {
    if (!customUrl.trim() || !user) return;
    let url = customUrl.trim();
    let displayName: string;
    try { const parsed = new URL(url); displayName = parsed.hostname.replace("www.", ""); } catch { displayName = url; }
    const { data } = await supabase.from("custom_news_sites").insert({ user_id: user.id, name: displayName, rss_url: url }).select().single();
    if (data) {
      setCustomSites(prev => [...prev, { id: data.id, name: data.name, rssUrl: data.rss_url }]);
    }
    setCustomUrl("");
    fetchNews(url).then(news => { setNewsByPortal(prev => ({ ...prev, [displayName]: news })); });
  };

  const removeCustomSite = async (name: string) => {
    const site = customSites.find(s => s.name === name);
    if (site?.id) await supabase.from("custom_news_sites").delete().eq("id", site.id);
    setCustomSites(prev => prev.filter(s => s.name !== name));
    setNewsByPortal(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
  };

  const addToSelected = async (portal: string, news: NewsItem) => {
    if (!user) return;
    const item: SelectedNews = { portal, title: news.title, imageUrl: news.thumbnail || "" };
    const { data } = await supabase.from("selected_news").insert({ user_id: user.id, portal, title: news.title, image_url: news.thumbnail || "" }).select().single();
    if (data) setSelectedNews(prev => [...prev, { ...item, id: data.id }]);
  };

  const removeFromSelected = async (index: number) => {
    const item = selectedNews[index];
    if (item?.id) await supabase.from("selected_news").delete().eq("id", item.id);
    setSelectedNews(prev => prev.filter((_, i) => i !== index));
  };

  const addToEscalada = async (sn: SelectedNews) => {
    if (!user) return;
    // Check if already in escalada
    if (escaladaNews.some(e => e.title === sn.title && e.portal === sn.portal)) return;
    const { data } = await supabase.from("escalada_news").insert({
      user_id: user.id,
      portal: sn.portal,
      title: sn.title,
      image_url: sn.imageUrl,
    }).select().single();
    if (data) setEscaladaNews(prev => [...prev, { id: data.id, portal: data.portal, title: data.title, imageUrl: data.image_url || "" }]);
  };

  const removeFromEscalada = async (index: number) => {
    const item = escaladaNews[index];
    if (item?.id) await supabase.from("escalada_news").delete().eq("id", item.id);
    setEscaladaNews(prev => prev.filter((_, i) => i !== index));
  };

  const addCotacao = async (c: CotacaoItem) => {
    if (!user || selectedCotacoes.some(sc => sc.name === c.name)) return;
    const { data } = await supabase.from("selected_cotacoes").insert({ user_id: user.id, name: c.name, value: c.value, change: c.change }).select().single();
    if (data) setSelectedCotacoes(prev => [...prev, { id: data.id, name: c.name, value: c.value, change: c.change }]);
  };

  const removeCotacao = async (name: string) => {
    const item = selectedCotacoes.find(sc => sc.name === name);
    if (item?.id) await supabase.from("selected_cotacoes").delete().eq("id", item.id);
    setSelectedCotacoes(prev => prev.filter(sc => sc.name !== name));
  };

  const headerStyle = "px-4 py-3 font-bold text-sm tracking-wide bg-primary text-primary-foreground";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl text-primary">Principais Notícias</h3>
        <button onClick={() => { loadAll(); loadCotacoes(); }} disabled={loading}
          className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex gap-2">
        <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustomSite()}
          placeholder="URL do RSS feed (ex: https://site.com/feed)"
          className="flex-1 bg-muted border border-border p-2 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
        <button onClick={addCustomSite}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold hover:brightness-95 transition-all flex items-center gap-1">
          <Plus size={16} /> Adicionar Site
        </button>
      </div>

      {/* Selected News + Escalada side by side */}
      {(selectedNews.length > 0 || escaladaNews.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Notícias Selecionadas */}
          <div className="bg-muted rounded-xl border border-border overflow-hidden">
            <div className={headerStyle}>📋 Notícias Selecionadas</div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left px-3 py-2">Portal</th>
                    <th className="text-left px-3 py-2">Título</th>
                    <th className="px-3 py-2 w-20"></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedNews.map((sn, i) => (
                    <tr key={sn.id || i} className="border-b border-border/50">
                      <td className="px-3 py-2 text-foreground font-semibold whitespace-nowrap">{sn.portal}</td>
                      <td className="px-3 py-2 text-foreground">{sn.title}</td>
                      <td className="px-3 py-2 flex items-center gap-1">
                        <button onClick={() => addToEscalada(sn)} className="text-primary hover:text-primary/80" title="Por na escalada">
                          <ListPlus size={14} />
                        </button>
                        <button onClick={() => removeFromSelected(i)} className="text-destructive hover:text-destructive/80">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Notícias Escalada */}
          <div className="bg-muted rounded-xl border border-border overflow-hidden">
            <div className={headerStyle}>🎯 Notícias Escalada</div>
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              {escaladaNews.length === 0 ? (
                <p className="text-muted-foreground text-xs p-4">Nenhuma notícia na escalada. Use o botão <ListPlus size={12} className="inline" /> nas notícias selecionadas.</p>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="text-left px-3 py-2">Portal</th>
                      <th className="text-left px-3 py-2">Título</th>
                      <th className="px-3 py-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {escaladaNews.map((en, i) => (
                      <tr key={en.id || i} className="border-b border-border/50">
                        <td className="px-3 py-2 text-foreground font-semibold whitespace-nowrap">{en.portal}</td>
                        <td className="px-3 py-2 text-foreground">{en.title}</td>
                        <td className="px-3 py-2">
                          <button onClick={() => removeFromEscalada(i)} className="text-destructive hover:text-destructive/80">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-muted rounded-xl border border-border overflow-hidden">
        <div className={headerStyle}>💹 Cotações - Bolsas e Moedas</div>
        <div className="p-4">
          {loadingCotacoes ? (
            <p className="text-muted-foreground text-sm">Carregando cotações...</p>
          ) : cotacoes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Cotações indisponíveis</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
              {cotacoes.map(c => (
                <div key={c.name} className="bg-background/50 rounded-lg p-3 text-center relative group">
                  <button onClick={() => addCotacao(c)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-primary transition-all"
                    title="Adicionar cotação">
                    <Plus size={12} />
                  </button>
                  <p className="text-[10px] text-muted-foreground mb-1">{c.name}</p>
                  <p className="text-sm font-semibold text-foreground">{c.value}</p>
                  <div className={`flex items-center justify-center gap-1 text-xs mt-1 ${
                    c.direction === "up" ? "text-green-400" : c.direction === "down" ? "text-red-400" : "text-muted-foreground"
                  }`}>
                    {c.direction === "up" ? <TrendingUp size={12} /> : c.direction === "down" ? <TrendingDown size={12} /> : <Minus size={12} />}
                    {c.change}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedCotacoes.length > 0 && (
        <div className="bg-muted rounded-xl border border-border overflow-hidden">
          <div className={headerStyle}>📊 Cotações Selecionadas</div>
          <div className="p-4 flex flex-wrap gap-2">
            {selectedCotacoes.map(sc => (
              <div key={sc.id || sc.name} className="bg-background/50 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
                <span className="font-semibold text-foreground">{sc.name}</span>
                <span className="text-muted-foreground">{sc.value}</span>
                <span className="text-muted-foreground">{sc.change}</span>
                <button onClick={() => removeCotacao(sc.name)} className="text-destructive hover:text-destructive/80">
                  <Trash2 size={10} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading && Object.keys(newsByPortal).length === 0 ? (
        <p className="text-muted-foreground">Carregando notícias...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {allPortals.map((portal) => (
            <div key={portal.name} className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className={`${headerStyle} flex items-center justify-between cursor-pointer select-none`}
                onClick={() => setExpandedPortals(prev => ({ ...prev, [portal.name]: !prev[portal.name] }))}>
                <span className="flex items-center gap-2">
                  {expandedPortals[portal.name] ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  {portal.name}
                </span>
                <div className="flex items-center gap-2">
                  {customSites.some(s => s.name === portal.name) && (
                    <button onClick={(e) => { e.stopPropagation(); removeCustomSite(portal.name); }} className="text-primary-foreground/70 hover:text-primary-foreground text-xs">✕</button>
                  )}
                </div>
              </div>
              {expandedPortals[portal.name] && (
                <ul className="divide-y divide-border">
                  {(newsByPortal[portal.name] || []).length === 0 ? (
                    <li className="px-4 py-3 text-sm text-muted-foreground">Sem notícias disponíveis</li>
                  ) : (
                    newsByPortal[portal.name].map((news, i) => (
                      <li key={i} className="flex items-center">
                        <a href={news.link} target="_blank" rel="noopener noreferrer"
                          className="flex-1 px-4 py-3 text-sm text-foreground hover:text-primary hover:bg-background/50 transition-colors flex items-start gap-2 group">
                          <span className="flex-1 line-clamp-2">{news.title}</span>
                          <ExternalLink size={14} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground" />
                        </a>
                        <button onClick={() => addToSelected(portal.name, news)}
                          className="px-2 py-1 mr-2 text-muted-foreground hover:text-primary transition-colors" title="Adicionar à seleção">
                          <Plus size={14} />
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {(selectedNews.length > 0 || selectedCotacoes.length > 0) && (
        <XmlLinkRow label="XML NOTICIAS" xmlContent={(() => {
          const newsXml = selectedNews.map(sn =>
            `  <noticia>\n    <portal>${sn.portal}</portal>\n    <titulo>${sn.title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</titulo>\n    <imagem>${sn.imageUrl}</imagem>\n  </noticia>`
          ).join("\n");
          const cotXml = selectedCotacoes.map(sc =>
            `  <cotacao>\n    <nome>${sc.name}</nome>\n    <valor>${sc.value}</valor>\n    <variacao>${sc.change}</variacao>\n  </cotacao>`
          ).join("\n");
          return `<?xml version="1.0" encoding="UTF-8"?>\n<noticias>\n${newsXml}\n${cotXml}\n</noticias>`;
        })()} />
      )}
    </div>
  );
}
