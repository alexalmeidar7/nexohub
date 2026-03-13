import { useState, useEffect, useRef, useCallback } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { RefreshCw, ExternalLink, Plus, TrendingUp, TrendingDown, Minus, Trash2, ChevronDown, ChevronUp, ListPlus, GripVertical, BookOpen, Loader2, X, Image as ImageIcon, Link as LinkIcon, Newspaper, CloudSun, Droplets, Thermometer } from "lucide-react";
import XmlLinkRow from "./XmlLinkRow";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import MontarJornalInline, { type JornalConfig } from "./MontarJornalInline";
import JornalBlockBuilder from "./JornalBlockBuilder";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NewsItem {
  title: string;
  link: string;
  thumbnail?: string;
  body?: string;
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
  { name: "G1 Goiás", rssUrl: "https://g1.globo.com/rss/g1/goias/" },
  { name: "UOL", rssUrl: "https://rss.uol.com.br/feed/noticias.xml" },
  { name: "GloboNews", rssUrl: "https://g1.globo.com/rss/g1/globonews/" },
  { name: "Folha de S.Paulo", rssUrl: "https://feeds.folha.uol.com.br/emcimadahora/rss091.xml" },
  { name: "CNN Brasil", rssUrl: "https://www.cnnbrasil.com.br/feed/" },
  { name: "R7", rssUrl: "https://noticias.r7.com/feed.xml" },
  { name: "Estadão", rssUrl: "https://www.estadao.com.br/arc/outboundfeeds/rss/?outputType=xml" },
  { name: "Gazeta do Povo", rssUrl: "https://www.gazetadopovo.com.br/feed/rss/" },
];

const PROXY = "https://api.allorigins.win/raw?url=";
const PROXY_FALLBACK = "https://corsproxy.io/?url=";

function decodeHtmlEntities(str: string): string {
  const textarea = document.createElement("textarea");
  textarea.innerHTML = str;
  return textarea.value;
}

function parseRss(text: string): NewsItem[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, "application/xml");
  const items = doc.querySelectorAll("item");
  const results: NewsItem[] = [];
  items.forEach((item, i) => {
    if (i >= 10) return;
    const title = decodeHtmlEntities(item.querySelector("title")?.textContent || "");
    const link = item.querySelector("link")?.textContent || "";
    let thumbnail = "";
    const mediaContent = item.querySelector("content[url]") || item.querySelector("thumbnail[url]");
    if (mediaContent) thumbnail = mediaContent.getAttribute("url") || "";
    if (!thumbnail) {
      const enclosure = item.querySelector("enclosure[url]");
      if (enclosure && (enclosure.getAttribute("type") || "").startsWith("image")) thumbnail = enclosure.getAttribute("url") || "";
    }
    if (!thumbnail) {
      const desc = item.querySelector("description")?.textContent || "";
      const imgMatch = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (imgMatch) thumbnail = imgMatch[1];
    }
    if (title) results.push({ title, link, thumbnail });
  });
  return results;
}

async function fetchNews(rssUrl: string): Promise<NewsItem[]> {
  // Try edge function first (server-side, no CORS issues)
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ url: rssUrl }),
        signal: AbortSignal.timeout(18000),
      });
      const data = await res.json();
      if (data.content) {
        const results = parseRss(data.content);
        if (results.length > 0) return results;
      }
    }
  } catch {}

  // Fallback: rss2json
  try {
    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(rssUrl)}`, { signal: AbortSignal.timeout(10000) });
    const data = await res.json();
    if (data.status === "ok" && data.items && data.items.length > 0) {
      return data.items
        .slice(0, 10)
        .map((item: any) => ({
          title: decodeHtmlEntities(item.title || ""),
          link: item.link,
          thumbnail: item.thumbnail || item.enclosure?.link || "",
        }));
    }
  } catch {}

  // Fallback: allorigins proxy
  try {
    const res = await fetch(`${PROXY}${encodeURIComponent(rssUrl)}`, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    const results = parseRss(text);
    if (results.length > 0) return results;
  } catch {}

  // Fallback: corsproxy
  try {
    const res = await fetch(`${PROXY_FALLBACK}${encodeURIComponent(rssUrl)}`, { signal: AbortSignal.timeout(10000) });
    const text = await res.text();
    const results = parseRss(text);
    if (results.length > 0) return results;
  } catch {}

  return [];
}

async function fetchCotacoes(): Promise<CotacaoItem[]> {
  try {
    // Moedas: Dólar Comercial, Euro, Libra, Peso Argentino, Peso Chileno
    const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL,GBP-BRL,ARS-BRL,CLP-BRL");
    const data = await res.json();
    const moedaLabels: Record<string, string> = {
      "USDBRL": "Dólar Comercial",
      "EURBRL": "Euro",
      "GBPBRL": "Libra",
      "ARSBRL": "Peso Argentino",
      "CLPBRL": "Peso Chileno",
    };
    const moedas: CotacaoItem[] = Object.entries(data).map(([key, item]: [string, any]) => {
      const pctChange = parseFloat(item.pctChange);
      return {
        name: moedaLabels[key] || `${item.code}/${item.codein}`,
        value: parseFloat(item.bid).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
        change: `${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(2)}%`,
        direction: pctChange > 0 ? "up" : pctChange < 0 ? "down" : "neutral",
      };
    });

    // Bolsas: Ibovespa, S&P 500, Nasdaq, Dow Jones, Euro Stoxx, Nikkei 225
    const bolsas: CotacaoItem[] = [];
    const bolsaNames: Record<string, string> = {
      "^BVSP": "Ibovespa (B3)",
      "^GSPC": "S&P 500",
      "^IXIC": "Nasdaq",
      "^DJI": "Dow Jones",
      "^STOXX50E": "Euro Stoxx",
      "^N225": "Nikkei 225",
    };
    try {
      for (const [symbol, label] of Object.entries(bolsaNames)) {
        try {
          const bRes = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`);
          if (!bRes.ok) continue;
          const bData = await bRes.json();
          const result = bData?.chart?.result?.[0];
          if (result) {
            const meta = result.meta;
            const price = meta.regularMarketPrice || 0;
            const prevClose = meta.previousClose || meta.chartPreviousClose || price;
            const change = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
            bolsas.push({
              name: label,
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

interface NoticiasPanelProps {
  defaultJornalConfig?: JornalConfig | null;
}

export default function NoticiasPanel({ defaultJornalConfig }: NoticiasPanelProps = {}) {
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
  const [summaryPopup, setSummaryPopup] = useState<{ title: string; resumo: string; tempoLeitura: string } | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [jornalConfig, setJornalConfig] = useState<JornalConfig | null>(defaultJornalConfig || null);
  const [programas, setProgramas] = useState<{ id: string; nome: string }[]>([]);
  const [showAddSiteInput, setShowAddSiteInput] = useState(false);
  const [hoveredImage, setHoveredImage] = useState<{ url: string; x: number; y: number } | null>(null);
  const [showNoticiaAvulsaInput, setShowNoticiaAvulsaInput] = useState(false);
  const [noticiaAvulsaUrl, setNoticiaAvulsaUrl] = useState("");
  const [noticiasAvulsas, setNoticiasAvulsas] = useState<NewsItem[]>([]);
  const [loadingAvulsa, setLoadingAvulsa] = useState(false);
  const [collapsedBoxes, setCollapsedBoxes] = useState<Record<string, boolean>>({});
  const [readingPopup, setReadingPopup] = useState<NewsItem | null>(null);
  const [loadingReading, setLoadingReading] = useState(false);
  const [blocoEconomia, setBlocoEconomia] = useState<CotacaoItem[]>([]);
  const [miniWeather, setMiniWeather] = useState<{ city: string; temp: number; humidity: number; code: number; min: number; max: number } | null>(null);
  const [loadingWeather, setLoadingWeather] = useState(true);
  const [weatherAiDesc, setWeatherAiDesc] = useState("");
  const [loadingWeatherAi, setLoadingWeatherAi] = useState(false);

  const miniWeatherLabel = (code: number) => {
    const labels: Record<number, string> = {
      0: "Céu limpo", 1: "Parc. limpo", 2: "Parc. nublado", 3: "Nublado",
      45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
      61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
      80: "Pancadas", 81: "Pancadas", 82: "Pancadas fortes",
      95: "Tempestade", 96: "Tempestade", 99: "Tempestade severa",
    };
    const closest = Object.keys(labels).map(Number).reduce((prev, curr) => Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev);
    return labels[closest] || "Desconhecido";
  };

  useEffect(() => {
    const loadWeather = async () => {
      setLoadingWeather(true);
      try {
        const raw = localStorage.getItem("masterview_primary_city");
        const primary = raw ? JSON.parse(raw) : null;
        if (!primary) { setLoadingWeather(false); return; }
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${primary.lat}&longitude=${primary.lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`);
        const data = await res.json();
        const weatherData = {
          city: primary.name,
          temp: Math.round(data.current.temperature_2m),
          humidity: data.current.relative_humidity_2m,
          code: data.current.weather_code,
          min: Math.round(data.daily.temperature_2m_min[0]),
          max: Math.round(data.daily.temperature_2m_max[0]),
        };
        setMiniWeather(weatherData);

        // Fetch AI description
        setLoadingWeatherAi(true);
        try {
          const condLabel = miniWeatherLabel(data.current.weather_code);
          const rainChance = data.daily.precipitation_probability_max?.[0] ?? 0;
          const aiRes = await supabase.functions.invoke("weather-description", {
            body: {
              city: primary.name,
              temp: weatherData.temp,
              tempMin: weatherData.min,
              tempMax: weatherData.max,
              humidity: weatherData.humidity,
              rainChance,
              condition: condLabel,
            },
          });
          if (aiRes.data?.description) setWeatherAiDesc(aiRes.data.description);
        } catch { /* ignore AI error */ }
        setLoadingWeatherAi(false);
      } catch { /* ignore */ }
      setLoadingWeather(false);
    };
    loadWeather();
  }, []);

  const toggleBox = (key: string) => setCollapsedBoxes(prev => ({ ...prev, [key]: !prev[key] }));

  const addToBlocoEconomia = (c: CotacaoItem) => {
    if (blocoEconomia.some(b => b.name === c.name)) return;
    setBlocoEconomia(prev => [...prev, c]);
  };

  const removeFromBlocoEconomia = (name: string) => {
    setBlocoEconomia(prev => prev.filter(c => c.name !== name));
  };

  useEffect(() => {
    if (!user) return;
    supabase.from("programas").select("id, nome").then(({ data }) => {
      if (data) setProgramas(data);
    });
  }, [user]);

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

  const loadAll = useCallback(async () => {
    setLoading(true);
    const currentPortals = [...customSites, ...DEFAULT_PORTALS];
    const results: Record<string, NewsItem[]> = {};
    await Promise.all(currentPortals.map(async (portal) => { results[portal.name] = await fetchNews(portal.rssUrl); }));
    setNewsByPortal(results);
    setLoading(false);
  }, [customSites]);

  const loadCotacoes = async () => {
    setLoadingCotacoes(true);
    const data = await fetchCotacoes();
    setCotacoes(data);
    setLoadingCotacoes(false);
  };

  const customSitesCountRef = useRef(0);
  useEffect(() => {
    // Only reload news when sites are added (count increases), not removed
    if (customSites.length > customSitesCountRef.current || customSitesCountRef.current === 0) {
      loadAll();
    }
    customSitesCountRef.current = customSites.length;
  }, [customSites.length, loadAll]);

  useEffect(() => { loadCotacoes(); const interval = setInterval(loadCotacoes, 60 * 1000); return () => clearInterval(interval); }, []);

  const addCustomSite = async () => {
    if (!customUrl.trim() || !user) return;
    let url = customUrl.trim();
    let displayName: string;
    try { const parsed = new URL(url); displayName = parsed.hostname.replace("www.", ""); } catch { displayName = url; }
    const { data } = await supabase.from("custom_news_sites").insert({ user_id: user.id, name: displayName, rss_url: url }).select().single();
    if (data) {
      const newSite = { id: data.id, name: data.name, rssUrl: data.rss_url };
      setCustomSites(prev => [...prev, newSite]);
      fetchNews(url).then(news => { setNewsByPortal(prev => ({ ...prev, [displayName]: news })); });
    }
    setCustomUrl("");
  };

  const removeCustomSite = async (name: string) => {
    // Optimistically remove from UI first, then delete from DB
    let siteId: string | undefined;
    setCustomSites(prev => {
      const site = prev.find(s => s.name === name);
      siteId = site?.id;
      return prev.filter(s => s.name !== name);
    });
    setNewsByPortal(prev => { const copy = { ...prev }; delete copy[name]; return copy; });
    if (siteId) {
      await supabase.from("custom_news_sites").delete().eq("id", siteId);
    }
  };

  const addNoticiaAvulsa = async () => {
    if (!noticiaAvulsaUrl.trim()) return;
    const url = noticiaAvulsaUrl.trim();
    setLoadingAvulsa(true);
    try {
      let title = url;
      let thumbnail = "";
      let body = "";
      try {
        // Use edge function for reliable server-side fetch
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        let html = "";
        if (supabaseUrl && supabaseKey) {
          const res = await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
            body: JSON.stringify({ url }),
            signal: AbortSignal.timeout(15000),
          });
          const data = await res.json();
          if (data.content) html = data.content;
        }
        if (!html) {
          const res = await fetch(`${PROXY}${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(8000) });
          html = await res.text();
        }
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) title = decodeHtmlEntities(titleMatch[1].trim());
        const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (ogImageMatch) thumbnail = ogImageMatch[1];
        // Extract article body from <article> or og:description or <p> tags
        const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
        if (articleMatch) {
          body = articleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
        } else if (ogDescMatch) {
          body = decodeHtmlEntities(ogDescMatch[1]);
        } else {
          // Fallback: extract text from <p> tags
          const pMatches = html.match(/<p[^>]*>([^<]{40,})<\/p>/gi);
          if (pMatches) {
            body = pMatches.slice(0, 5).map(p => p.replace(/<[^>]+>/g, "").trim()).join("\n\n").slice(0, 2000);
          }
        }
        setNoticiasAvulsas(prev => [...prev, { title, link: url, thumbnail, body }]);
      } catch {
        setNoticiasAvulsas(prev => [...prev, { title, link: url }]);
      }
    } catch {
      setNoticiasAvulsas(prev => [...prev, { title: url, link: url }]);
    }
    setNoticiaAvulsaUrl("");
    setShowNoticiaAvulsaInput(false);
    setLoadingAvulsa(false);
  };

  const removeNoticiaAvulsa = (index: number) => {
    setNoticiasAvulsas(prev => prev.filter((_, i) => i !== index));
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

  const handleImageHover = (e: React.MouseEvent, url: string) => {
    if (!url) return;
    setHoveredImage({ url, x: e.clientX, y: e.clientY });
  };

  const openReadingPopup = async (item: NewsItem) => {
    setLoadingReading(true);
    setReadingPopup({ ...item, body: "" });
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
      if (supabaseUrl && supabaseKey) {
        const res = await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Authorization": `Bearer ${supabaseKey}` },
          body: JSON.stringify({ url: item.link }),
          signal: AbortSignal.timeout(15000),
        });
        const data = await res.json();
        if (data.content) {
          const html = data.content;
          let title = item.title;
          const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
          if (titleMatch) title = decodeHtmlEntities(titleMatch[1].trim());

          let thumbnail = item.thumbnail || "";
          if (!thumbnail) {
            const ogImageMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
            if (ogImageMatch) thumbnail = ogImageMatch[1];
          }
          // If still no thumbnail, use a placeholder based on first keyword
          if (!thumbnail) {
            const keyword = title.split(/[\s,.:;!?]+/).filter(w => w.length > 4).slice(0, 2).join(" ");
            thumbnail = `https://source.unsplash.com/400x250/?${encodeURIComponent(keyword || "news")}`;
          }

          let body = "";
          const ogDescMatch = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
          const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
          if (articleMatch) {
            body = articleMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 3000);
          } else if (ogDescMatch) {
            body = decodeHtmlEntities(ogDescMatch[1]);
          } else {
            const pMatches = html.match(/<p[^>]*>([^<]{40,})<\/p>/gi);
            if (pMatches) {
              body = pMatches.slice(0, 8).map(p => p.replace(/<[^>]+>/g, "").trim()).join("\n\n").slice(0, 3000);
            }
          }
          setReadingPopup({ title, link: item.link, thumbnail, body });
        }
      }
    } catch (err) {
      console.error("Error fetching article:", err);
    }
    setLoadingReading(false);
  };

  return (
    <TooltipProvider delayDuration={300}>
    <div className="animate-fade-in space-y-4">
      {/* Main Card */}
      <div className="rounded-2xl overflow-hidden" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.12)", padding: "20px" }}>
        {/* Header */}
        <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "rgba(13,4,70,0.08)" }}>
              <Newspaper size={20} style={{ color: "#0d0446" }} />
            </div>
            <h3 className="text-lg font-bold" style={{ color: "#0d0446" }}>Notícias do momento</h3>
            <button
              onClick={() => { setShowAddSiteInput(prev => !prev); setShowNoticiaAvulsaInput(false); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-[10px] transition-all"
              style={{ backgroundColor: "#0d0446", color: "#ffffff" }}
            >
              <Plus size={10} /> Adicionar Site
            </button>
            <button
              onClick={() => { setShowNoticiaAvulsaInput(prev => !prev); setShowAddSiteInput(false); }}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full font-bold text-[10px] transition-all"
              style={{ backgroundColor: "#0d0446", color: "#ffffff" }}
            >
              <LinkIcon size={10} /> Notícia Avulsa
            </button>
            {loading && (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "rgba(13,4,70,0.5)" }}>
                <Loader2 size={12} className="animate-spin" style={{ color: "#268ffa" }} />
                atualizando notícias...
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!defaultJornalConfig && (
              <button
                onClick={() => setWizardOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-[10px] transition-all hover:shadow-md"
                style={{ background: "linear-gradient(135deg, #268ffa, #2dbef3)", color: "#ffffff" }}
              >
                <Newspaper size={11} /> Montar Roteiro
              </button>
            )}
            <button onClick={() => { loadAll(); loadCotacoes(); }} disabled={loading}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-50"
              style={{ backgroundColor: "rgba(13,4,70,0.06)" }}
              onMouseEnter={e => { e.currentTarget.style.backgroundColor = "rgba(13,4,70,0.12)"; }}
              onMouseLeave={e => { e.currentTarget.style.backgroundColor = "rgba(13,4,70,0.06)"; }}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} style={{ color: "#0d0446" }} />
            </button>
          </div>
        </div>

      {showAddSiteInput && (
        <div className="flex gap-2 animate-fade-in">
          <input value={customUrl} onChange={(e) => setCustomUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { addCustomSite(); setShowAddSiteInput(false); } }}
            placeholder="URL do RSS feed (ex: https://site.com/feed)"
            className="flex-1 px-3 py-1 outline-none transition-colors text-xs"
            style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            autoFocus
          />
          <button onClick={() => { addCustomSite(); setShowAddSiteInput(false); }}
            className="px-3 py-1 font-bold transition-all flex items-center gap-1 text-xs"
            style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px" }}
          >
            <Plus size={12} /> Adicionar
          </button>
          <button onClick={() => setShowAddSiteInput(false)} className="px-2 py-1 rounded-full" style={{ color: "#0d0446" }}>
            <X size={14} />
          </button>
        </div>
      )}

      {showNoticiaAvulsaInput && (
        <div className="flex gap-2 animate-fade-in">
          <input value={noticiaAvulsaUrl} onChange={(e) => setNoticiaAvulsaUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addNoticiaAvulsa(); }}
            placeholder="URL da notícia (ex: https://site.com/noticia)"
            className="flex-1 px-3 py-1 outline-none transition-colors text-xs"
            style={{ backgroundColor: "#ffffff", border: "1px solid #0d0446", color: "#0d0446", borderRadius: "20px" }}
            onFocus={e => { e.currentTarget.style.borderColor = "#2dbef3"; }}
            onBlur={e => { e.currentTarget.style.borderColor = "#0d0446"; }}
            autoFocus
          />
          <button onClick={addNoticiaAvulsa} disabled={loadingAvulsa}
            className="px-3 py-1 font-bold transition-all flex items-center gap-1 text-xs"
            style={{ backgroundColor: "#0d0446", color: "#ffffff", borderRadius: "20px" }}
          >
            {loadingAvulsa ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />} Adicionar
          </button>
          <button onClick={() => setShowNoticiaAvulsaInput(false)} className="px-2 py-1 rounded-full" style={{ color: "#0d0446" }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main two-column layout: Left (Cotações + Portais) | Right (Jornal Builder) */}
      <div className="flex gap-4">
        {/* LEFT COLUMN */}
        <div className="space-y-4" style={{ width: (jornalConfig || wizardOpen) ? "50%" : "100%" }}>
          {/* Cotações marquee */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.06)", width: (jornalConfig || wizardOpen) ? "100%" : "50%", boxShadow: "0 2px 10px rgba(13,4,70,0.05)" }}>
            <div className="px-3 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
              <span style={{ color: "#ffffff" }}>💹 Cotações - Bolsas e Moedas</span>
              <button onClick={() => toggleBox('cotacoes')} className="p-0.5 rounded hover:bg-white/20 transition-colors">
                {collapsedBoxes['cotacoes'] ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </button>
            </div>
            {!collapsedBoxes['cotacoes'] && (
              <div className="p-2 overflow-hidden">
                {loadingCotacoes ? (
                  <div className="animate-pulse flex gap-2 overflow-hidden">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="rounded-md px-3 py-2 shrink-0 flex items-center gap-2" style={{ backgroundColor: "rgba(13,4,70,0.04)" }}>
                        <div className="h-2.5 w-14 rounded bg-[#0d0446]/10" />
                        <div className="h-2.5 w-10 rounded bg-[#0d0446]/5" />
                      </div>
                    ))}
                  </div>
                ) : cotacoes.length === 0 ? (
                  <p className="text-xs" style={{ color: "rgba(13,4,70,0.5)" }}>Cotações indisponíveis</p>
                ) : (
                  <div className="relative overflow-hidden">
                    <style>{`
                      @keyframes cotacoes-scroll { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
                      .cotacoes-marquee { display: flex; gap: 8px; animation: cotacoes-scroll 30s linear infinite; width: max-content; }
                      .cotacoes-marquee:hover { animation-play-state: paused; }
                    `}</style>
                    <div className="cotacoes-marquee">
                      {[...cotacoes, ...cotacoes].map((c, i) => (
                        <div key={`${c.name}-${i}`} onClick={() => addToBlocoEconomia(c)}
                          className="rounded-md px-2 py-1.5 flex items-center gap-1.5 text-[10px] shrink-0 transition-colors"
                          style={{ backgroundColor: c.direction === "down" ? "rgba(239,68,68,0.15)" : c.direction === "up" ? "rgba(34,197,94,0.15)" : "rgba(13,4,70,0.04)", cursor: "copy" }}
                          title="Clique para adicionar ao Bloco de Economia"
                        >
                          <span className="font-semibold whitespace-nowrap" style={{ color: "#0d0446" }}>{c.name}</span>
                          <span className="whitespace-nowrap" style={{ color: "#0d0446" }}>{c.value}</span>
                          <span className={`flex items-center gap-0.5 whitespace-nowrap font-semibold ${c.direction === "up" ? "text-green-600" : c.direction === "down" ? "text-red-600" : ""}`}
                            style={c.direction === "neutral" ? { color: "rgba(13,4,70,0.4)" } : undefined}>
                            {c.direction === "up" ? <TrendingUp size={9} /> : c.direction === "down" ? <TrendingDown size={9} /> : <Minus size={9} />}
                            {c.change}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mini Previsão do Tempo */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.06)", width: (jornalConfig || wizardOpen) ? "100%" : "50%", boxShadow: "0 2px 10px rgba(13,4,70,0.05)" }}
            draggable={!!miniWeather}
            onDragStart={(e) => {
              if (!miniWeather) return;
              const text = weatherAiDesc || `Previsão do tempo para ${miniWeather.city}: ${miniWeather.temp}°C, mín ${miniWeather.min}° máx ${miniWeather.max}°, umidade ${miniWeather.humidity}%. ${miniWeatherLabel(miniWeather.code)}.`;
              e.dataTransfer.setData("text/plain", JSON.stringify({
                type: "previsao_tempo",
                city: miniWeather.city,
                text,
              }));
            }}
          >
            <div className="px-3 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between cursor-grab" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
              <span className="flex items-center gap-1.5" style={{ color: "#ffffff" }}>
                <GripVertical size={12} className="opacity-60" />
                <CloudSun size={12} />
                Previsão do Tempo
              </span>
              <button onClick={() => toggleBox('miniWeather')} className="p-0.5 rounded hover:bg-white/20 transition-colors">
                {collapsedBoxes['miniWeather'] ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </button>
            </div>
            {!collapsedBoxes['miniWeather'] && (
              <div className="p-3">
                {loadingWeather ? (
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-8 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-2 w-16" />
                    </div>
                  </div>
                ) : !miniWeather ? (
                  <p className="text-xs" style={{ color: "rgba(13,4,70,0.5)" }}>Nenhuma cidade principal cadastrada. Defina em Previsão do Tempo.</p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <span className="text-2xl font-bold" style={{ color: "#2ec1f7" }}>{miniWeather.temp}°C</span>
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <p className="text-xs font-bold" style={{ color: "#0d0446" }}>{miniWeather.city}</p>
                        <p className="text-[10px]" style={{ color: "rgba(13,4,70,0.6)" }}>{miniWeatherLabel(miniWeather.code)}</p>
                        <div className="flex items-center gap-3 text-[10px]" style={{ color: "rgba(13,4,70,0.5)" }}>
                          <span className="flex items-center gap-0.5"><Thermometer size={9} /> Mín {miniWeather.min}° · Máx {miniWeather.max}°</span>
                          <span className="flex items-center gap-0.5"><Droplets size={9} /> {miniWeather.humidity}%</span>
                        </div>
                      </div>
                    </div>
                    {loadingWeatherAi ? (
                      <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "rgba(13,4,70,0.4)" }}>
                        <Loader2 size={10} className="animate-spin" /> Gerando descrição...
                      </div>
                    ) : weatherAiDesc && (
                      <p className="text-[10px] leading-relaxed rounded-md px-2 py-1.5" style={{ color: "#0d0446", backgroundColor: "rgba(46,193,247,0.06)", border: "1px solid rgba(46,193,247,0.15)" }}>
                        {weatherAiDesc}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bloco de Economia */}
          {blocoEconomia.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.06)", width: (jornalConfig || wizardOpen) ? "100%" : "50%", boxShadow: "0 2px 10px rgba(13,4,70,0.05)" }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", JSON.stringify({
                  type: "bloco_economia",
                  items: blocoEconomia.map(c => ({ name: c.name, value: c.value, change: c.change, direction: c.direction }))
                }));
              }}
            >
              <div className="px-3 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between cursor-grab" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
                <span className="flex items-center gap-1.5">
                  <GripVertical size={12} className="opacity-60" />
                  <span style={{ color: "#ffffff" }}>📊 Bloco de Economia</span>
                </span>
                <button onClick={() => toggleBox('blocoEconomia')} className="p-0.5 rounded hover:bg-white/20 transition-colors">
                  {collapsedBoxes['blocoEconomia'] ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </button>
              </div>
              {!collapsedBoxes['blocoEconomia'] && (
                <div className="divide-y" style={{ borderColor: "rgba(13,4,70,0.04)" }}>
                  {blocoEconomia.map((c) => (
                    <div key={c.name} className="flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-50">
                      <span className="font-semibold" style={{ color: "#0d0446" }}>{c.name}</span>
                      <span style={{ color: "#0d0446" }}>{c.value}</span>
                      <span className={`flex items-center gap-0.5 font-semibold ${c.direction === "up" ? "text-green-600" : c.direction === "down" ? "text-red-600" : ""}`}
                        style={c.direction === "neutral" ? { color: "rgba(13,4,70,0.4)" } : undefined}>
                        {c.direction === "up" ? <TrendingUp size={9} /> : c.direction === "down" ? <TrendingDown size={9} /> : <Minus size={9} />}
                        {c.change}
                      </span>
                      <button onClick={() => removeFromBlocoEconomia(c.name)}
                        className="ml-auto p-0.5 rounded hover:bg-red-50 transition-colors" title="Remover">
                        <Trash2 size={11} className="text-red-400 hover:text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* News Portals Accordion */}
          <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.06)", width: (jornalConfig || wizardOpen) ? "100%" : "50%", boxShadow: "0 2px 10px rgba(13,4,70,0.05)" }}>
            <div className="px-3 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
              <span style={{ color: "#ffffff" }}>📰 Portais de Notícias</span>
              <button onClick={() => toggleBox('portais')} className="p-0.5 rounded hover:bg-white/20 transition-colors">
                {collapsedBoxes['portais'] ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
              </button>
            </div>
            {!collapsedBoxes['portais'] && (
              loading ? (
                <div className="p-2 space-y-1">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: i % 2 === 0 ? "#ffffff" : "#f8f8fc" }}>
                      <Skeleton className="w-3 h-3 rounded-full bg-[#2ec1f7]/15 shrink-0" />
                      <Skeleton className="h-3 rounded bg-[#0d0446]/10" style={{ width: `${35 + (i % 3) * 15}%` }} />
                      <Skeleton className="h-4 w-8 rounded-full bg-[#2ec1f7]/10 ml-auto" />
                    </div>
                  ))}
                </div>
              ) : (
                <Accordion type="multiple" className="w-full">
                  {DEFAULT_PORTALS.map(portal => {
                    const news = newsByPortal[portal.name] || [];
                    return (
                      <AccordionItem key={portal.name} value={portal.name} className="border-b-0" style={{ borderBottom: "1px solid rgba(13,4,70,0.06)" }}>
                        <AccordionTrigger className="px-3 py-2 text-xs font-bold hover:no-underline" style={{ color: "#0d0446" }}>
                          <span className="flex items-center gap-2 flex-1">
                            <Newspaper size={12} style={{ color: "#2ec1f7" }} />
                            {portal.name}
                            <span className="text-[9px] font-normal px-1.5 rounded-full" style={{ backgroundColor: "rgba(46,193,247,0.1)", color: "#2ec1f7" }}>
                              {news.length}
                            </span>
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="pb-0">
                          <div className="divide-y" style={{ borderColor: "rgba(13,4,70,0.04)" }}>
                            {news.map((item, idx) => (
                              <div key={idx} draggable
                                onDragStart={(e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ portal: portal.name, title: item.title, imageUrl: item.thumbnail || "", link: item.link || "" })); }}
                                className="flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-50 cursor-grab active:cursor-grabbing group"
                              >
                                <GripVertical size={10} className="shrink-0 opacity-20" />
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="flex-1 line-clamp-1 cursor-default" style={{ color: "#0d0446" }}>{item.title}</span>
                                  </TooltipTrigger>
                                  <TooltipContent style={{ backgroundColor: "#2ec1f7", color: "#0d0446", maxWidth: 350 }} className="text-xs font-medium">
                                    {item.title}
                                  </TooltipContent>
                                </Tooltip>
                                <button onClick={(e) => { e.stopPropagation(); openReadingPopup(item); }}
                                  className="shrink-0 p-0.5 rounded hover:bg-blue-50 transition-opacity" title="Ler notícia">
                                  <BookOpen size={12} style={{ color: "#2ec1f7" }} />
                                </button>
                                {item.thumbnail && (
                                  <div className="shrink-0 relative"
                                    onMouseEnter={(e) => handleImageHover(e, item.thumbnail || "")}
                                    onMouseLeave={() => setHoveredImage(null)}>
                                    <ImageIcon size={12} style={{ color: "rgba(13,4,70,0.3)" }} className="cursor-pointer hover:opacity-70" />
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              )
            )}
          </div>

          {/* Sites Adicionados Box */}
          {customSites.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.06)", width: (jornalConfig || wizardOpen) ? "100%" : "50%", boxShadow: "0 2px 10px rgba(13,4,70,0.05)" }}>
              <div className="px-3 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
                <span style={{ color: "#ffffff" }}>🌐 Sites Adicionados</span>
                <button onClick={() => toggleBox('sitesAdicionados')} className="p-0.5 rounded hover:bg-white/20 transition-colors">
                  {collapsedBoxes['sitesAdicionados'] ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </button>
              </div>
              {!collapsedBoxes['sitesAdicionados'] && (
                loading ? (
                  <div className="p-4 flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin" style={{ color: "#2ec1f7" }} />
                    <span className="text-xs" style={{ color: "rgba(13,4,70,0.5)" }}>Carregando...</span>
                  </div>
                ) : (
                  <Accordion type="multiple" className="w-full">
                    {customSites.map(site => {
                      const news = newsByPortal[site.name] || [];
                      return (
                        <AccordionItem key={site.name} value={site.name} className="border-b-0" style={{ borderBottom: "1px solid rgba(13,4,70,0.06)" }}>
                          <AccordionTrigger className="px-3 py-2 text-xs font-bold hover:no-underline" style={{ color: "#0d0446" }}>
                            <span className="flex items-center gap-2 flex-1">
                              <Newspaper size={12} style={{ color: "#2ec1f7" }} />
                              {site.name}
                              <span className="text-[9px] font-normal px-1.5 rounded-full" style={{ backgroundColor: "rgba(46,193,247,0.1)", color: "#2ec1f7" }}>
                                {news.length}
                              </span>
                              <button onClick={(e) => { e.stopPropagation(); removeCustomSite(site.name); }}
                                className="ml-auto p-0.5 rounded hover:bg-red-50 transition-colors" title="Remover site">
                                <Trash2 size={11} className="text-red-400 hover:text-red-600" />
                              </button>
                            </span>
                          </AccordionTrigger>
                          <AccordionContent className="pb-0">
                            <div className="divide-y" style={{ borderColor: "rgba(13,4,70,0.04)" }}>
                              {news.map((item, idx) => (
                                <div key={idx} draggable
                                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ portal: site.name, title: item.title, imageUrl: item.thumbnail || "", link: item.link || "" })); }}
                                  className="flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-50 cursor-grab active:cursor-grabbing group"
                                >
                                  <GripVertical size={10} className="shrink-0 opacity-20" />
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="flex-1 line-clamp-1 cursor-default" style={{ color: "#0d0446" }}>{item.title}</span>
                                    </TooltipTrigger>
                                    <TooltipContent style={{ backgroundColor: "#2ec1f7", color: "#0d0446", maxWidth: 350 }} className="text-xs font-medium">
                                      {item.title}
                                    </TooltipContent>
                                  </Tooltip>
                                  <button onClick={(e) => { e.stopPropagation(); openReadingPopup(item); }}
                                    className="shrink-0 p-0.5 rounded hover:bg-blue-50 transition-opacity" title="Ler notícia">
                                    <BookOpen size={12} style={{ color: "#2ec1f7" }} />
                                  </button>
                                  {item.thumbnail && (
                                    <div className="shrink-0 relative"
                                      onMouseEnter={(e) => handleImageHover(e, item.thumbnail || "")}
                                      onMouseLeave={() => setHoveredImage(null)}>
                                      <ImageIcon size={12} style={{ color: "rgba(13,4,70,0.3)" }} className="cursor-pointer hover:opacity-70" />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )
              )}
            </div>
          )}

          {/* Notícia Avulsa Box */}
          {noticiasAvulsas.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.06)", width: (jornalConfig || wizardOpen) ? "100%" : "50%", boxShadow: "0 2px 10px rgba(13,4,70,0.05)" }}>
              <div className="px-3 py-2.5 font-bold text-xs tracking-wide text-white flex items-center justify-between" style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)" }}>
                <span style={{ color: "#ffffff" }}>📌 Notícia Avulsa</span>
                <button onClick={() => toggleBox('noticiaAvulsa')} className="p-0.5 rounded hover:bg-white/20 transition-colors">
                  {collapsedBoxes['noticiaAvulsa'] ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
                </button>
              </div>
              {!collapsedBoxes['noticiaAvulsa'] && (
                <div className="divide-y" style={{ borderColor: "rgba(13,4,70,0.04)" }}>
                  {noticiasAvulsas.map((item, idx) => (
                    <div key={idx} draggable
                      onDragStart={(e) => { e.dataTransfer.setData("text/plain", JSON.stringify({ portal: "Avulsa", title: item.title, imageUrl: item.thumbnail || "" })); }}
                      className="flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-gray-50 cursor-grab active:cursor-grabbing group"
                    >
                      <GripVertical size={10} className="shrink-0 opacity-20" />
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex-1 line-clamp-1 cursor-default" style={{ color: "#0d0446" }}>{item.title}</span>
                        </TooltipTrigger>
                        <TooltipContent style={{ backgroundColor: "#2ec1f7", color: "#0d0446", maxWidth: 350 }} className="text-xs font-medium">
                          {item.title}
                        </TooltipContent>
                      </Tooltip>
                      <button onClick={(e) => { e.stopPropagation(); setReadingPopup(item); }}
                        className="shrink-0 p-0.5 rounded hover:bg-blue-50 transition-opacity" title="Ler notícia">
                        <BookOpen size={12} style={{ color: "#2ec1f7" }} />
                      </button>
                      {item.thumbnail && (
                        <div className="shrink-0 relative"
                          onMouseEnter={(ev) => handleImageHover(ev, item.thumbnail || "")}
                          onMouseLeave={() => setHoveredImage(null)}>
                          <ImageIcon size={12} style={{ color: "rgba(13,4,70,0.3)" }} className="cursor-pointer hover:opacity-70" />
                        </div>
                      )}
                      <button onClick={() => removeNoticiaAvulsa(idx)}
                        className="shrink-0 p-0.5 rounded hover:bg-red-50 transition-colors" title="Remover">
                        <Trash2 size={11} className="text-red-400 hover:text-red-600" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN - Wizard or Jornal Builder */}
        {(wizardOpen || jornalConfig) && (
          <div className="flex-1" style={{ position: "sticky", top: "0", alignSelf: "flex-start" }}>
            {wizardOpen && !jornalConfig && (
              <MontarJornalInline
                programas={programas}
                onFinish={(config) => {
                  setJornalConfig(config);
                  setWizardOpen(false);
                }}
                onCancel={() => setWizardOpen(false)}
              />
            )}
            {jornalConfig && (
              <JornalBlockBuilder
                config={jornalConfig}
                selectedNews={selectedNews.map(sn => ({ portal: sn.portal, title: sn.title, imageUrl: sn.imageUrl }))}
                onClose={() => setJornalConfig(null)}
              />
            )}
          </div>
        )}
      </div>

      {/* XML abaixo */}
      {(selectedNews.length > 0 || selectedCotacoes.length > 0) && (
        <XmlLinkRow label="XML NOTICIAS" dark xmlContent={(() => {
          const newsXml = selectedNews.map(sn =>
            `  <noticia>\n    <portal>${sn.portal}</portal>\n    <titulo>${sn.title.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</titulo>\n    <imagem>${sn.imageUrl}</imagem>\n  </noticia>`
          ).join("\n");
          const cotXml = selectedCotacoes.map(sc =>
            `  <cotacao>\n    <nome>${sc.name}</nome>\n    <valor>${sc.value}</valor>\n    <variacao>${sc.change}</variacao>\n  </cotacao>`
          ).join("\n");
          return `<?xml version="1.0" encoding="UTF-8"?>\n<noticias>\n${newsXml}\n${cotXml}\n</noticias>`;
        })()} />
      )}
      </div>{/* End main card */}

      {hoveredImage && (
        <div
          className="fixed z-[9999] pointer-events-none rounded-lg overflow-hidden shadow-xl border"
          style={{
            left: hoveredImage.x + 16,
            top: hoveredImage.y - 60,
            borderColor: "rgba(13,4,70,0.1)",
          }}
        >
          <img src={hoveredImage.url} alt="" className="w-32 h-20 object-cover" />
        </div>
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

      {/* Reading Popup */}
      {readingPopup && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setReadingPopup(null)}>
          <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 relative max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setReadingPopup(null)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-700 z-10">
              <X size={20} />
            </button>
            <div className="flex gap-4 mb-4">
              <img
                src={readingPopup.thumbnail || `https://source.unsplash.com/400x250/?${encodeURIComponent(readingPopup.title.split(/[\s,.:;!?]+/).filter(w => w.length > 4).slice(0, 2).join(" ") || "news")}`}
                alt=""
                className="w-28 h-20 object-cover rounded-lg shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).src = "/placeholder.svg"; }}
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg leading-tight pr-6" style={{ color: "#0d0446" }}>{readingPopup.title}</h3>
                <a href={readingPopup.link} target="_blank" rel="noopener noreferrer"
                  className="text-[10px] mt-1 inline-block hover:underline" style={{ color: "#2ec1f7" }}>
                  {readingPopup.link}
                </a>
              </div>
            </div>
            {loadingReading ? (
              <div className="flex items-center gap-2 py-8 justify-center">
                <Loader2 size={20} className="animate-spin" style={{ color: "#2ec1f7" }} />
                <span className="text-sm" style={{ color: "rgba(13,4,70,0.5)" }}>Carregando conteúdo...</span>
              </div>
            ) : readingPopup.body ? (
              <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "#0d0446" }}>{readingPopup.body}</p>
            ) : (
              <p className="text-sm italic" style={{ color: "rgba(13,4,70,0.4)" }}>Conteúdo da matéria não disponível. Clique no link acima para ler no site original.</p>
            )}
          </div>
        </div>
      )}

    </div>
    </TooltipProvider>
  );
}