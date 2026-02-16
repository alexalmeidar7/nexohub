import { useState, useEffect } from "react";
import { RefreshCw, ExternalLink } from "lucide-react";

interface NewsItem {
  title: string;
  link: string;
}

interface Portal {
  name: string;
  rssUrl: string;
  color: string;
}

const PORTALS: Portal[] = [
  { name: "G1", rssUrl: "https://g1.globo.com/rss/g1/", color: "hsl(0, 80%, 50%)" },
  { name: "UOL", rssUrl: "https://rss.uol.com.br/feed/noticias.xml", color: "hsl(45, 100%, 50%)" },
  { name: "GloboNews", rssUrl: "https://g1.globo.com/rss/g1/globonews/", color: "hsl(210, 80%, 55%)" },
  { name: "Folha de S.Paulo", rssUrl: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml", color: "hsl(210, 30%, 40%)" },
  { name: "CNN Brasil", rssUrl: "https://www.cnnbrasil.com.br/feed/", color: "hsl(0, 70%, 45%)" },
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
      }));
    }
    return [];
  } catch {
    return [];
  }
}

export default function NoticiasPanel() {
  const [newsByPortal, setNewsByPortal] = useState<Record<string, NewsItem[]>>({});
  const [loading, setLoading] = useState(true);

  const loadAll = async () => {
    setLoading(true);
    const results: Record<string, NewsItem[]> = {};
    await Promise.all(
      PORTALS.map(async (portal) => {
        results[portal.name] = await fetchNews(portal.rssUrl);
      })
    );
    setNewsByPortal(results);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl text-primary">Principais Notícias</h3>
        <button
          onClick={loadAll}
          disabled={loading}
          className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50"
        >
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {loading && Object.keys(newsByPortal).length === 0 ? (
        <p className="text-muted-foreground">Carregando notícias...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {PORTALS.map((portal) => (
            <div
              key={portal.name}
              className="bg-muted rounded-xl border border-border overflow-hidden"
            >
              <div
                className="px-4 py-3 font-bold text-sm tracking-wide"
                style={{ backgroundColor: portal.color, color: "#fff" }}
              >
                {portal.name}
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
