import { useState, useEffect } from "react";
import { RefreshCw, ExternalLink, Plus, TrendingUp, TrendingDown, Minus, Trash2 } from "lucide-react";

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
  portal: string;
  title: string;
  imageUrl: string;
}

interface SelectedCotacao {
  name: string;
  value: string;
  change: string;
}

const SELECTED_COTACOES_KEY = "masterview_selected_cotacoes";

const PORTALS: Portal[] = [
  { name: "G1", rssUrl: "https://g1.globo.com/rss/g1/" },
  { name: "UOL", rssUrl: "https://rss.uol.com.br/feed/noticias.xml" },
  { name: "GloboNews", rssUrl: "https://g1.globo.com/rss/g1/globonews/" },
  { name: "Folha de S.Paulo", rssUrl: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml" },
  { name: "CNN Brasil", rssUrl: "https://www.cnnbrasil.com.br/feed/" },
];

const PROXY = "https://api.rss2json.com/v1/api.json?rss_url=";
const CUSTOM_SITES_KEY = "masterview_custom_news_sites";
const SELECTED_NEWS_KEY = "masterview_selected_news";

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

    // Add stock exchange indices (static names, fetched from awesome API)
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
    } catch { /* bolsas unavailable */ }

    return [...moedas, ...bolsas];
  } catch { return []; }
}

export default function NoticiasPanel() {
  const [newsByPortal, setNewsByPortal] = useState<Record<string, NewsItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [customUrl, setCustomUrl] = useState("");
  const [customSites, setCustomSites] = useState<Portal[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_SITES_KEY) || "[]"); } catch { return []; }
  });
  const [cotacoes, setCotacoes] = useState<CotacaoItem[]>([]);
  const [loadingCotacoes, setLoadingCotacoes] = useState(true);
  const [selectedNews, setSelectedNews] = useState<SelectedNews[]>(() => {
    try { return JSON.parse(localStorage.getItem(SELECTED_NEWS_KEY) || "[]"); } catch { return []; }
  });
  const [selectedCotacoes, setSelectedCotacoes] = useState<SelectedCotacao[]>(() => {
    try { return JSON.parse(localStorage.getItem(SELECTED_COTACOES_KEY) || "[]"); } catch { return []; }
  });

  const addCotacao = (c: CotacaoItem) => {
    if (selectedCotacoes.some(sc => sc.name === c.name)) return;
    const updated = [...selectedCotacoes, { name: c.name, value: c.value, change: c.change }];
    setSelectedCotacoes(updated);
    localStorage.setItem(SELECTED_COTACOES_KEY, JSON.stringify(updated));
  };

  const removeCotacao = (name: string) => {
    const updated = selectedCotacoes.filter(sc => sc.name !== name);
    setSelectedCotacoes(updated);
    localStorage.setItem(SELECTED_COTACOES_KEY, JSON.stringify(updated));
  };

  const allPortals = [...PORTALS, ...customSites];

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

  useEffect(() => { loadAll(); loadCotacoes(); const interval = setInterval(loadCotacoes, 60 * 1000); return () => clearInterval(interval); }, []);
  useEffect(() => { if (customSites.length > 0 || PORTALS.length > 0) loadAll(); }, [customSites.length]);

  const addCustomSite = () => {
    if (!customUrl.trim()) return;
    let url = customUrl.trim();
    let displayName: string;
    try { const parsed = new URL(url); displayName = parsed.hostname.replace("www.", ""); } catch { displayName = url; }
    const newSite: Portal = { name: displayName, rssUrl: url };
    const updated = [...customSites, newSite];
    setCustomSites(updated);
    localStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(updated));
    setCustomUrl("");
    fetchNews(url).then(news => { setNewsByPortal(prev => ({ ...prev, [displayName]: news })); });
  };

  const removeCustomSite = (name: string) => {
    const updated = customSites.filter(s => s.name !== name);
    setCustomSites(updated);
    localStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(updated));
    setNewsByPortal(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
  };

  const addToSelected = (portal: string, news: NewsItem) => {
    const item: SelectedNews = { portal, title: news.title, imageUrl: news.thumbnail || "" };
    const updated = [...selectedNews, item];
    setSelectedNews(updated);
    localStorage.setItem(SELECTED_NEWS_KEY, JSON.stringify(updated));
  };

  const removeFromSelected = (index: number) => {
    const updated = selectedNews.filter((_, i) => i !== index);
    setSelectedNews(updated);
    localStorage.setItem(SELECTED_NEWS_KEY, JSON.stringify(updated));
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

      {/* Custom URL Field */}
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

      {/* Selected News Table */}
      {selectedNews.length > 0 && (
        <div className="bg-muted rounded-xl border border-border overflow-hidden">
          <div className={headerStyle}>📋 Notícias Selecionadas</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  <th className="text-left px-3 py-2">Portal</th>
                  <th className="text-left px-3 py-2">Título</th>
                  <th className="text-left px-3 py-2">URL da Imagem</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {selectedNews.map((sn, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-3 py-2 text-foreground font-semibold whitespace-nowrap">{sn.portal}</td>
                    <td className="px-3 py-2 text-foreground">{sn.title}</td>
                    <td className="px-3 py-2 text-muted-foreground truncate max-w-[200px]">{sn.imageUrl || "—"}</td>
                    <td className="px-3 py-2">
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
      )}

      {/* Cotações */}
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

      {/* Selected Cotações */}
      {selectedCotacoes.length > 0 && (
        <div className="bg-muted rounded-xl border border-border overflow-hidden">
          <div className={headerStyle}>📊 Cotações Selecionadas</div>
          <div className="p-4 flex flex-wrap gap-2">
            {selectedCotacoes.map(sc => (
              <div key={sc.name} className="bg-background/50 rounded-lg px-3 py-2 flex items-center gap-2 text-xs">
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

      {/* News Grid */}
      {loading && Object.keys(newsByPortal).length === 0 ? (
        <p className="text-muted-foreground">Carregando notícias...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {allPortals.map((portal) => (
            <div key={portal.name} className="bg-muted rounded-xl border border-border overflow-hidden">
              <div className={`${headerStyle} flex items-center justify-between`}>
                <span>{portal.name}</span>
                {customSites.some(s => s.name === portal.name) && (
                  <button onClick={() => removeCustomSite(portal.name)} className="text-primary-foreground/70 hover:text-primary-foreground text-xs">✕</button>
                )}
              </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
