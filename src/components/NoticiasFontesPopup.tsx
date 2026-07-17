import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Newspaper, Plus, Trash2, Loader2, X as XIcon, RefreshCw, ExternalLink, Globe } from "lucide-react";

const NEXO_CYAN = "#00BFF0";
const NEXO_CARD_BG = "#D6F4FB";
const NEXO_DARK = "#0A2540";

const PROXY = "https://api.allorigins.win/raw?url=";

type NewsItem = { title: string; link: string; thumbnail: string };
type Site = { id: string; name: string; rss_url: string };

function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function parseRss(xml: string): NewsItem[] {
  const results: NewsItem[] = [];
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    const items = doc.querySelectorAll("item, entry");
    items.forEach((item) => {
      let rawTitle = decodeHtmlEntities(item.querySelector("title")?.textContent?.trim() || "");
      let title = rawTitle.includes("|") ? rawTitle.split("|")[0].trim() : rawTitle;
      if (title.includes(" - ")) title = title.split(" - ")[0].trim();
      const linkEl = item.querySelector("link");
      const link = (linkEl?.textContent?.trim() || linkEl?.getAttribute("href") || "").trim();
      let thumbnail = "";
      const mediaContent = item.querySelector("content[url], thumbnail[url]");
      if (mediaContent) thumbnail = mediaContent.getAttribute("url") || "";
      if (!thumbnail) {
        const enc = item.querySelector("enclosure[url]");
        if (enc && (enc.getAttribute("type") || "").startsWith("image")) thumbnail = enc.getAttribute("url") || "";
      }
      if (!thumbnail) {
        const desc = item.querySelector("description")?.textContent || "";
        const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m) thumbnail = m[1];
      }
      if (title) results.push({ title, link, thumbnail });
    });
  } catch {}
  return results;
}

async function fetchNews(rssUrl: string): Promise<NewsItem[]> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}` },
        body: JSON.stringify({ url: rssUrl }),
        signal: AbortSignal.timeout(18000),
      });
      const data = await res.json();
      if (data?.content) {
        const r = parseRss(data.content);
        if (r.length) return r.slice(0, 15);
      }
    }
  } catch {}
  try {
    const res = await fetch(`${PROXY}${encodeURIComponent(rssUrl)}`, { signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    const r = parseRss(text);
    if (r.length) return r.slice(0, 15);
  } catch {}
  return [];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export default function NoticiasFontesPopup({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [newsBySite, setNewsBySite] = useState<Record<string, NewsItem[]>>({});
  const [loadingSite, setLoadingSite] = useState<Record<string, boolean>>({});
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);

  const loadSites = async () => {
    if (!user) return;
    setInitialLoading(true);
    const { data } = await supabase.from("custom_news_sites").select("id,name,rss_url").eq("user_id", user.id).order("created_at", { ascending: true });
    const list = (data as Site[]) || [];
    setSites(list);
    setInitialLoading(false);
    list.forEach((s) => loadSiteNews(s));
  };

  const loadSiteNews = async (s: Site) => {
    setLoadingSite((prev) => ({ ...prev, [s.id]: true }));
    const news = await fetchNews(s.rss_url);
    setNewsBySite((prev) => ({ ...prev, [s.id]: news }));
    setLoadingSite((prev) => ({ ...prev, [s.id]: false }));
  };

  useEffect(() => {
    if (open) loadSites();
  }, [open, user?.id]);

  const addSite = async () => {
    if (!newUrl.trim() || !user) return;
    setAdding(true);
    let url = newUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    let displayName = url;
    try { displayName = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    const { data, error } = await supabase.from("custom_news_sites").insert({ user_id: user.id, name: displayName, rss_url: url }).select("id,name,rss_url").single();
    setAdding(false);
    if (error || !data) return;
    setNewUrl("");
    const s = data as Site;
    setSites((prev) => [...prev, s]);
    loadSiteNews(s);
  };

  const removeSite = async (id: string) => {
    setSites((prev) => prev.filter((s) => s.id !== id));
    setNewsBySite((prev) => { const c = { ...prev }; delete c[id]; return c; });
    await supabase.from("custom_news_sites").delete().eq("id", id);
  };

  const totalNoticias = useMemo(() => Object.values(newsBySite).reduce((a, b) => a + b.length, 0), [newsBySite]);

  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" style={{ background: "rgba(10,37,64,0.55)", backdropFilter: "blur(4px)" }} onClick={() => onOpenChange(false)}>
      <div
        className="w-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#FFFFFF", fontFamily: "'Montserrat', sans-serif", boxShadow: "0 24px 60px rgba(10,37,64,0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: NEXO_CARD_BG, borderBottom: `1px solid ${NEXO_CYAN}33` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: NEXO_CYAN, color: "#fff" }}>
              <Newspaper size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-widest" style={{ color: NEXO_DARK }}>Notícias de Fontes</h3>
              <p className="text-[11px]" style={{ color: "rgba(10,37,64,0.65)" }}>
                {sites.length} {sites.length === 1 ? "fonte" : "fontes"} · {totalNoticias} notícias carregadas
              </p>
            </div>
          </div>
          <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-white/60 transition" style={{ color: NEXO_DARK }} aria-label="Fechar">
            <XIcon size={18} />
          </button>
        </div>

        {/* Add site */}
        <div className="px-6 py-4 flex items-center gap-2 border-b" style={{ borderColor: "rgba(10,37,64,0.08)" }}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${NEXO_CYAN}1A`, color: NEXO_CYAN }}>
            <Globe size={16} />
          </div>
          <input
            type="text"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addSite(); }}
            placeholder="Cole a URL do feed RSS do site (ex.: https://g1.globo.com/rss/g1/)"
            className="flex-1 h-10 px-3 rounded-lg text-xs outline-none"
            style={{ background: "#F5FAFC", border: `2px solid ${NEXO_CYAN}33`, color: NEXO_DARK }}
          />
          <button
            onClick={addSite}
            disabled={adding || !newUrl.trim()}
            className="h-10 px-4 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 transition hover:opacity-90"
            style={{ background: NEXO_CYAN, color: "#fff" }}
          >
            {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Adicionar Site
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6" style={{ background: "#FAFCFD" }}>
          {initialLoading && (
            <div className="flex items-center justify-center py-10" style={{ color: NEXO_DARK }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {!initialLoading && sites.length === 0 && (
            <div className="text-center py-16">
              <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: `${NEXO_CYAN}1A`, color: NEXO_CYAN }}>
                <Newspaper size={26} />
              </div>
              <p className="text-sm font-bold" style={{ color: NEXO_DARK }}>Nenhuma fonte cadastrada</p>
              <p className="text-xs mt-1" style={{ color: "rgba(10,37,64,0.55)" }}>Adicione um feed RSS acima para ver as principais notícias.</p>
            </div>
          )}

          {sites.map((s) => {
            const news = newsBySite[s.id] || [];
            const loading = loadingSite[s.id];
            return (
              <section key={s.id} className="rounded-2xl overflow-hidden" style={{ background: "#fff", border: `1px solid ${NEXO_CYAN}22` }}>
                <header className="px-4 py-3 flex items-center justify-between" style={{ background: NEXO_CARD_BG }}>
                  <div className="flex items-center gap-2 min-w-0">
                    <Globe size={14} style={{ color: NEXO_CYAN }} />
                    <span className="text-xs font-bold uppercase tracking-wider truncate" style={{ color: NEXO_DARK }}>{s.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: `${NEXO_CYAN}22`, color: NEXO_DARK }}>{news.length}/15</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => loadSiteNews(s)} disabled={loading} className="p-1.5 rounded-md hover:bg-white/70 transition" style={{ color: NEXO_DARK }} title="Atualizar">
                      <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                    </button>
                    <button onClick={() => removeSite(s.id)} className="p-1.5 rounded-md hover:bg-white/70 transition" style={{ color: "#dc2626" }} title="Remover fonte">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </header>
                <div className="p-4">
                  {loading && news.length === 0 ? (
                    <div className="flex items-center justify-center py-6" style={{ color: NEXO_DARK }}>
                      <Loader2 size={16} className="animate-spin" />
                    </div>
                  ) : news.length === 0 ? (
                    <p className="text-[11px] text-center py-4" style={{ color: "rgba(10,37,64,0.55)" }}>Nenhuma notícia encontrada nesta fonte.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {news.map((n, i) => (
                        <a
                          key={`${s.id}-${i}`}
                          href={n.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="group rounded-xl overflow-hidden flex flex-col hover:-translate-y-0.5 transition"
                          style={{ background: "#F5FAFC", border: `1px solid ${NEXO_CYAN}22` }}
                        >
                          <div className="aspect-video w-full overflow-hidden" style={{ background: `${NEXO_DARK}0A` }}>
                            {n.thumbnail ? (
                              <img src={n.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center" style={{ color: `${NEXO_DARK}55` }}>
                                <Newspaper size={22} />
                              </div>
                            )}
                          </div>
                          <div className="p-3 flex-1 flex flex-col gap-1.5">
                            <p className="text-[11px] font-semibold leading-snug line-clamp-3" style={{ color: NEXO_DARK }}>{n.title}</p>
                            <span className="text-[10px] mt-auto inline-flex items-center gap-1 opacity-70 group-hover:opacity-100" style={{ color: NEXO_CYAN }}>
                              Abrir <ExternalLink size={10} />
                            </span>
                          </div>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
