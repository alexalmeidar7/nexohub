import { useState, useEffect } from "react";
import { RefreshCw, ExternalLink, Plus, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface NewsItem {
  title: string;
  link: string;
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

const PORTALS: Portal[] = [
  { name: "G1", rssUrl: "https://g1.globo.com/rss/g1/" },
  { name: "UOL", rssUrl: "https://rss.uol.com.br/feed/noticias.xml" },
  { name: "GloboNews", rssUrl: "https://g1.globo.com/rss/g1/globonews/" },
  { name: "Folha de S.Paulo", rssUrl: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml" },
  { name: "CNN Brasil", rssUrl: "https://www.cnnbrasil.com.br/feed/" },
];

const PROXY = "https://api.rss2json.com/v1/api.json?rss_url=";
const CUSTOM_SITES_KEY = "masterview_custom_news_sites";

async function fetchNews(rssUrl: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(`${PROXY}${encodeURIComponent(rssUrl)}`);
    const data = await res.json();
    if (data.status === "ok" && data.items) {
      return data.items.slice(0, 8).map((item: any) => ({
        title: item.title,
        link: item.link,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

async function fetchCotacoes(): Promise<CotacaoItem[]> {
  try {
    const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL,BTC-BRL,ETH-BRL");
    const data = await res.json();
    return Object.values(data).map((item: any) => {
      const pctChange = parseFloat(item.pctChange);
      return {
        name: `${item.code}/${item.codein}`,
        value: parseFloat(item.bid).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        change: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`,
        direction: pctChange > 0 ? "up" : pctChange < 0 ? "down" : "neutral",
      };
    });
  } catch {
    return [];
  }
}

export default function NoticiasPanel() {
  const [newsByPortal, setNewsByPortal] = useState<Record<string, NewsItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [customUrl, setCustomUrl] = useState("");
  const [customSites, setCustomSites] = useState<Portal[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(CUSTOM_SITES_KEY) || "[]");
    } catch { return []; }
  });
  const [cotacoes, setCotacoes] = useState<CotacaoItem[]>([]);
  const [loadingCotacoes, setLoadingCotacoes] = useState(true);

  const allPortals = [...PORTALS, ...customSites];

  const loadAll = async () => {
    setLoading(true);
    const results: Record<string, NewsItem[]> = {};
    await Promise.all(
      allPortals.map(async (portal) => {
        results[portal.name] = await fetchNews(portal.rssUrl);
      })
    );
    setNewsByPortal(results);
    setLoading(false);
  };

  const loadCotacoes = async () => {
    setLoadingCotacoes(true);
    const data = await fetchCotacoes();
    setCotacoes(data);
    setLoadingCotacoes(false);
  };

  useEffect(() => {
    loadAll();
    loadCotacoes();
    const interval = setInterval(loadCotacoes, 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Reload news when custom sites change
  useEffect(() => {
    if (customSites.length > 0 || PORTALS.length > 0) loadAll();
  }, [customSites.length]);

  const addCustomSite = () => {
    if (!customUrl.trim()) return;
    let url = customUrl.trim();
    // Extract domain name for display
    let displayName: string;
    try {
      const parsed = new URL(url);
      displayName = parsed.hostname.replace("www.", "");
    } catch {
      displayName = url;
    }

    const newSite: Portal = { name: displayName, rssUrl: url };
    const updated = [...customSites, newSite];
    setCustomSites(updated);
    localStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(updated));
    setCustomUrl("");

    // Fetch news for the new site immediately
    fetchNews(url).then(news => {
      setNewsByPortal(prev => ({ ...prev, [displayName]: news }));
    });
  };

  const removeCustomSite = (name: string) => {
    const updated = customSites.filter(s => s.name !== name);
    setCustomSites(updated);
    localStorage.setItem(CUSTOM_SITES_KEY, JSON.stringify(updated));
    setNewsByPortal(prev => {
      const copy = { ...prev };
      delete copy[name];
      return copy;
    });
  };

  const headerStyle = "px-4 py-3 font-bold text-sm tracking-wide bg-primary text-primary-foreground";

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl text-primary">Principais Notícias</h3>
        <button
          onClick={() => { loadAll(); loadCotacoes(); }}
          disabled={loading}
          className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Custom URL Field */}
      <div className="flex gap-2">
        <input
          value={customUrl}
          onChange={(e) => setCustomUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustomSite()}
          placeholder="URL do RSS feed (ex: https://site.com/feed)"
          className="flex-1 bg-muted border border-border p-2 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={addCustomSite}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-lg font-bold hover:brightness-95 transition-all flex items-center gap-1"
        >
          <Plus size={16} /> Adicionar Site
        </button>
      </div>

      {/* Cotações */}
      <div className="bg-muted rounded-xl border border-border overflow-hidden">
        <div className={headerStyle}>
          💹 Cotações - Bolsas e Moedas
        </div>
        <div className="p-4">
          {loadingCotacoes ? (
            <p className="text-muted-foreground text-sm">Carregando cotações...</p>
          ) : cotacoes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Cotações indisponíveis</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {cotacoes.map(c => (
                <div key={c.name} className="bg-background/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{c.name}</p>
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

      {/* News Grid */}
      {loading && Object.keys(newsByPortal).length === 0 ? (
        <p className="text-muted-foreground">Carregando notícias...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {allPortals.map((portal) => (
            <div
              key={portal.name}
              className="bg-muted rounded-xl border border-border overflow-hidden"
            >
              <div className={`${headerStyle} flex items-center justify-between`}>
                <span>{portal.name}</span>
                {customSites.some(s => s.name === portal.name) && (
                  <button
                    onClick={() => removeCustomSite(portal.name)}
                    className="text-primary-foreground/70 hover:text-primary-foreground text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>
              <ul className="divide-y divide-border">
                {(newsByPortal[portal.name] || []).length === 0 ? (
                  <li className="px-4 py-3 text-sm text-muted-foreground">
                    Sem notícias disponíveis
                  </li>
                ) : (
                  newsByPortal[portal.name].map((news, i) => (
                    <li key={i}>
                      <a
                        href={news.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-3 text-sm text-foreground hover:text-primary hover:bg-background/50 transition-colors flex items-start gap-2 group"
                      >
                        <span className="flex-1 line-clamp-2">{news.title}</span>
                        <ExternalLink
                          size={14}
                          className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground"
                        />
                      </a>
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
