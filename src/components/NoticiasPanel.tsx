import { useState, useEffect, useRef, useCallback } from "react";
import { RefreshCw, ExternalLink, Plus, TrendingUp, TrendingDown, Minus, Trash2, ChevronDown, ChevronUp, ListPlus, GripVertical, BookOpen, Loader2, X, Image as ImageIcon } from "lucide-react";
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

const PROXY = "https://api.allorigins.win/raw?url=";

function decodeHtmlEntities(str: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

async function fetchNews(rssUrl: string): Promise<NewsItem[]> {
  try {
    const res = await fetch(`${PROXY}${encodeURIComponent(rssUrl)}`);
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "application/xml");
    const items = doc.querySelectorAll("item");
    const results: NewsItem[] = [];
    items.forEach((item, i) => {
      if (i >= 10) return;
      const title = decodeHtmlEntities(item.querySelector("title")?.textContent || "");
      const link = item.querySelector("link")?.textContent || "";
      let thumbnail = "";
      // Try media:content, media:thumbnail, enclosure, or image in description
      const mediaContent = item.querySelector("content[url]") || item.querySelector("thumbnail[url]");
      if (mediaContent) {
        thumbnail = mediaContent.getAttribute("url") || "";
      }
      if (!thumbnail) {
        const enclosure = item.querySelector("enclosure[url]");
        if (enclosure && (enclosure.getAttribute("type") || "").startsWith("image")) {
          thumbnail = enclosure.getAttribute("url") || "";
        }
      }
      if (!thumbnail) {
        const desc = item.querySelector("description")?.textContent || "";
        const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) thumbnail = imgMatch[1];
      }
      // Only add news with images
      if (title && thumbnail) {
        results.push({ title, link, thumbnail });
      }
    });
    return results;
  } catch {
    // Fallback to rss2json
    try {
      const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`);
      const data = await res.json();
      if (data.status === "ok" && data.items) {
        return data.items
          .slice(0, 10)
          .map((item: any) => ({
            title: decodeHtmlEntities(item.title || ""),
            link: item.link,
            thumbnail: item.thumbnail || item.enclosure?.link || "",
          }))
          .filter((n: NewsItem) => n.thumbnail);
      }
    } catch {}
    return [];
  }
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

    // Fetch stock market indices
    const bolsas: CotacaoItem[] = [];
    const bolsaNames: Record<string, string> = {
      "^BVSP": "B3 (IBOVESPA)",
      "^GSPC": "S&P 500",
      "^DJI": "Dow Jones",
      "^IXIC": "NASDAQ",
      "^FTSE": "FTSE 100",
      "^GDAXI": "DAX 40",
      "^N225": "Nikkei (Japão)",
      "^HSI": "Hong Kong SE",
      "000001.SS": "Shanghai SE",
    };
    // Use a simple approach with available APIs
    try {
      const symbols = Object.keys(bolsaNames);
      for (const symbol of symbols) {
        try {
          const bRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
          const bData = await bRes.json();
          const result = bData?.chart?.result?.[0];
          if (result) {
            const meta = result.meta;
            const price = meta.regularMarketPrice || 0;
            const prevClose = meta.previousClose || meta.chartPreviousClose || price;
            const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
            bolsas.push({
              name: bolsaNames[symbol],
              value: price.toLocaleString("pt-BR", { minimumFractionDigits: 2 }),
              change: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`,
              direction: change > 0 ? "up" : change < 0 ? "down" : "neutral",
            });
          }
        } catch {}
      }
    } catch {}

    return [...moedas, ...bolsas];
  } catch { return []; }
}

// Simple drag reorder hook
function useDragReorder<T>(items: T[], setItems: (items: T[]) => void) {
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (idx: number) => { dragItem.current = idx; };
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); dragOverItem.current = idx; };
  const handleDrop = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    const reordered = [...items];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);
    setItems(reordered);
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return { handleDragStart, handleDragOver, handleDrop };
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
  const [portalOrder, setPortalOrder] = useState<string[]>([]);
  const [summaryPopup, setSummaryPopup] = useState<{ title: string; resumo: string; tempoLeitura: string } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);

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

  useEffect(() => {
    const customNames = customSites.map(s => s.name);
    const defaultNames = DEFAULT_PORTALS.map(p => p.name);
    setPortalOrder([...customNames, ...defaultNames]);
  }, [customSites]);

  const allPortals = [...customSites, ...DEFAULT_PORTALS];
  const orderedPortals = portalOrder
    .map(name => allPortals.find(p => p.name === name))
    .filter(Boolean) as Portal[];
  const portalDrag = useDragReorder(portalOrder, setPortalOrder);

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
      const newSite = { id: data.id, name: data.name, rssUrl: data.rss_url };
      setCustomSites(prev => [...prev, newSite]);
      // Immediately fetch news for the new site
      fetchNews(url).then(news => { setNewsByPortal(prev => ({ ...prev, [displayName]: news })); });
    }
    setCustomUrl("");
  };

  const removeCustomSite = async (name: string) => {
    const site = customSites.find(s => s.name === name);
    if (site?.id) await supabase.from("custom_news_sites").delete().eq("id", site.id);
    setCustomSites(prev => prev.filter(s => s.name !== name));
    setNewsByPortal(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
  };

  const addToSelected = async (portal: string, news: NewsItem) => {
    if (!user || !news.thumbnail) return;
    const item: SelectedNews = { portal, title: news.title, imageUrl: news.thumbnail || "" };
    const { data } = await supabase.from("selected_news").insert({ user_id: user.id, portal, title: news.title, image_url: news.thumbnail || "" }).select().single();
    if (data) setSelectedNews(prev => [...prev, { ...item, id: data.id }]);
  };

  const removeFromSelected = async (index: number) => {
    const item = selectedNews[index];
    if (item?.id) await supabase.from("selected_news").delete().eq("id", item.id);
    setSelectedNews(prev => prev.filter((_, i) => i !== index));
  };

  const updateSelectedField = async (index: number, field: keyof SelectedNews, value: string) => {
    const item = selectedNews[index];
    if (!item?.id) return;
    const dbField = field === "imageUrl" ? "image_url" : field;
    await supabase.from("selected_news").update({ [dbField]: value }).eq("id", item.id);
    setSelectedNews(prev => prev.map((n, i) => i === index ? { ...n, [field]: value } : n));
  };

  const addToEscalada = async (sn: SelectedNews) => {
    if (!user) return;
    if (escaladaNews.some(e => e.title === sn.title && e.portal === sn.portal)) return;
    const { data } = await supabase.from("escalada_news").insert({
      user_id: user.id, portal: sn.portal, title: sn.title, image_url: sn.imageUrl,
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

  const openSummary = async (news: SelectedNews) => {
    setLoadingSummary(true);
    setSummaryPopup({ title: news.title, resumo: "", tempoLeitura: "" });
    try {
      const { data, error } = await supabase.functions.invoke("summarize-news", {
        body: { title: news.title, url: "" },
      });
      if (error) throw error;
      setSummaryPopup({
        title: news.title,
        resumo: data.resumo || "Não foi possível gerar o resumo.",
        tempoLeitura: data.tempo_leitura || "1 min",
      });
    } catch (err: any) {
      setSummaryPopup({
        title: news.title,
        resumo: "Erro ao gerar resumo. Tente novamente.",
        tempoLeitura: "",
      });
    }
    setLoadingSummary(false);
  };

  const headerStyle = "px-4 py-3 font-bold text-sm tracking-wide text-white" + " " + "rounded-t-xl";
  const headerInline = { backgroundColor: "#0d0446" } as React.CSSProperties;

  return (
    <div className="animate-fade-in space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold" style={{ color: "#0d0446" }}>Notícias do momento</h3>
        <button onClick={() => { loadAll(); loadCotacoes(); }} disabled={loading}
          className="text-muted-foreground hover:text-primary transition-colors disabled:opacity-50">
          <RefreshCw size={18} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      <div className="flex gap-2">
        <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addCustomSite()}
          placeholder="URL do RSS feed (ex: https://site.com/feed)"
          className="flex-1 px-4 py-1.5 outline-none transition-colors text-sm"
          style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
          onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
          onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
        />
        <button onClick={addCustomSite}
          className="px-5 py-1.5 font-bold transition-all flex items-center gap-1"
          style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px", border: "2px solid #0d0446" }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "#ffffff"; e.currentTarget.style.color = "#0d0446"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "#0d0446"; e.currentTarget.style.color = "#ffffff"; }}
        >
          <Plus size={16} /> Adicionar Site
        </button>
      </div>

      {/* Top row: Noticias Selecionadas + Cotações side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Notícias Selecionadas */}
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
          <div className={headerStyle} style={headerInline}>📋 Notícias Selecionadas</div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            {selectedNews.length === 0 ? (
              <p className="text-gray-500 text-xs p-4">Nenhuma notícia selecionada.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(13,4,70,0.1)", color: "rgba(13,4,70,0.5)" }}>
                    <th className="text-left px-3 py-2">Portal</th>
                    <th className="text-left px-3 py-2">Título</th>
                    <th className="text-left px-3 py-2">Imagem URL</th>
                    <th className="px-3 py-2 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {selectedNews.map((sn, i) => (
                    <tr key={sn.id || i} style={{ borderBottom: "1px solid rgba(13,4,70,0.05)" }}>
                      <td className="px-3 py-2">
                        <input
                          defaultValue={sn.portal}
                          onBlur={(e) => updateSelectedField(i, "portal", e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-gray-300 outline-none font-semibold w-full text-xs" style={{ color: "#0d0446" }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          defaultValue={sn.title}
                          onBlur={(e) => updateSelectedField(i, "title", e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-gray-300 outline-none w-full text-xs" style={{ color: "#0d0446" }}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          defaultValue={sn.imageUrl}
                          onBlur={(e) => updateSelectedField(i, "imageUrl", e.target.value)}
                          className="bg-transparent border-b border-transparent hover:border-gray-300 outline-none w-full text-xs truncate" style={{ color: "rgba(13,4,70,0.5)" }}
                          title={sn.imageUrl}
                        />
                      </td>
                      <td className="px-3 py-2 flex items-center gap-1">
                        <button onClick={() => openSummary(sn)} className="text-blue-500 hover:text-blue-700" title="Ler resumo">
                          <BookOpen size={14} />
                        </button>
                        <button onClick={() => addToEscalada(sn)} className="text-primary hover:text-primary/80" title="Inserir na escalada">
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
            )}
          </div>
        </div>

        {/* Cotações ao lado */}
        <div className="space-y-4">
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
            <div className={headerStyle} style={headerInline}>💹 Cotações - Bolsas e Moedas</div>
            <div className="p-4">
              {loadingCotacoes ? (
                <p className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>Carregando cotações...</p>
              ) : cotacoes.length === 0 ? (
                <p className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>Cotações indisponíveis</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {cotacoes.map(c => (
                    <div key={c.name} className="rounded-lg p-3 text-center relative group" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                      <button onClick={() => addCotacao(c)}
                        className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-all"
                        style={{ color: "rgba(13,4,70,0.4)" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "#2dbef3"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "rgba(13,4,70,0.4)"; }}
                        title="Adicionar cotação">
                        <Plus size={12} />
                      </button>
                      <p className="text-[10px] mb-1" style={{ color: "rgba(13,4,70,0.5)" }}>{c.name}</p>
                      <p className="text-sm font-semibold" style={{ color: "#0d0446" }}>{c.value}</p>
                      <div className={`flex items-center justify-center gap-1 text-xs mt-1 ${
                        c.direction === "up" ? "text-green-500" : c.direction === "down" ? "text-red-500" : ""
                      }`} style={c.direction !== "up" && c.direction !== "down" ? { color: "rgba(13,4,70,0.4)" } : undefined}>
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
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
              <div className={headerStyle} style={headerInline}>📊 Cotações Selecionadas</div>
              <div className="p-4 flex flex-wrap gap-2">
                {selectedCotacoes.map(sc => (
                  <div key={sc.id || sc.name} className="rounded-lg px-3 py-2 flex items-center gap-2 text-xs" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                    <span className="font-semibold" style={{ color: "#0d0446" }}>{sc.name}</span>
                    <span style={{ color: "rgba(13,4,70,0.5)" }}>{sc.value}</span>
                    <span style={{ color: "rgba(13,4,70,0.5)" }}>{sc.change}</span>
                    <button onClick={() => removeCotacao(sc.name)} className="text-destructive hover:text-destructive/80">
                      <Trash2 size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Notícias Escalada - below Selecionadas */}
      {escaladaNews.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.1)" }}>
          <div className={headerStyle} style={headerInline}>🎯 Notícias Escalada</div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(13,4,70,0.1)", color: "rgba(13,4,70,0.5)" }}>
                    <th className="text-left px-3 py-2">Portal</th>
                    <th className="text-left px-3 py-2">Título</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
              </thead>
              <tbody>
                {escaladaNews.map((en, i) => (
                    <tr key={en.id || i} style={{ borderBottom: "1px solid rgba(13,4,70,0.05)" }}>
                      <td className="px-3 py-2 font-semibold whitespace-nowrap" style={{ color: "#0d0446" }}>{en.portal}</td>
                      <td className="px-3 py-2" style={{ color: "#0d0446" }}>{en.title}</td>
                    <td className="px-3 py-2">
                      <button onClick={() => removeFromEscalada(i)} className="text-destructive hover:text-destructive/80">
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

      {/* News portals grid */}
      {loading && Object.keys(newsByPortal).length === 0 ? (
        <p className="text-muted-foreground">Carregando notícias...</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {orderedPortals.map((portal, idx) => {
            const isCustom = customSites.some(s => s.name === portal.name);
            return (
            <div
              key={portal.name}
              className={`rounded-xl border border-border overflow-hidden cursor-grab active:cursor-grabbing ${isCustom ? "" : "bg-muted"}`}
              style={isCustom ? { backgroundColor: "#0d0446", color: "#ffffff" } : {}}
              draggable
              onDragStart={() => portalDrag.handleDragStart(idx)}
              onDragOver={(e) => portalDrag.handleDragOver(e, idx)}
              onDrop={portalDrag.handleDrop}
            >
              <div className={`${headerStyle} flex items-center justify-between cursor-pointer select-none`}
                style={headerInline}
                onClick={() => setExpandedPortals(prev => ({ ...prev, [portal.name]: !prev[portal.name] }))}>
                <span className="flex items-center gap-2">
                  <GripVertical size={14} className="opacity-50" />
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
                        {news.thumbnail && (
                          <img src={news.thumbnail} alt="" className="w-10 h-10 object-cover rounded ml-2 shrink-0" />
                        )}
                        <a href={news.link} target="_blank" rel="noopener noreferrer"
                          className="flex-1 px-3 py-3 text-sm text-foreground hover:text-primary hover:bg-background/50 transition-colors flex items-start gap-2 group">
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

      {/* Summary Popup */}
      {summaryPopup && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setSummaryPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSummaryPopup(null)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700">
              <X size={20} />
            </button>
            <h3 className="font-bold text-gray-800 text-lg mb-2 pr-8">{summaryPopup.title}</h3>
            {summaryPopup.tempoLeitura && (
              <p className="text-xs text-gray-500 mb-4 flex items-center gap-1">
                ⏱ Tempo estimado de leitura: <strong>{summaryPopup.tempoLeitura}</strong>
              </p>
            )}
            {loadingSummary ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <Loader2 size={20} className="animate-spin text-primary" />
                <span className="text-gray-500 text-sm">Gerando resumo...</span>
              </div>
            ) : (
              <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-line">{summaryPopup.resumo}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
