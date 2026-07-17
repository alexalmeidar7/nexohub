import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Newspaper, Plus, Trash2, Loader2, X as XIcon, RefreshCw, ExternalLink, Globe, Settings, Pencil, Check } from "lucide-react";

const NEXO_CYAN = "#00BFF0";
const NEXO_CARD_BG = "#D6F4FB";
const NEXO_DARK = "#0A2540";

const PROXY = "https://api.allorigins.win/raw?url=";

type NewsItem = { title: string; link: string; thumbnail: string; pubDate: string };
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
      const pubDate =
        item.querySelector("pubDate")?.textContent?.trim() ||
        item.querySelector("published")?.textContent?.trim() ||
        item.querySelector("updated")?.textContent?.trim() ||
        item.querySelector("date")?.textContent?.trim() ||
        "";
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
      if (title) results.push({ title, link, thumbnail, pubDate });
    });
  } catch {}
  return results;
}

function formatPubDate(pubDate: string): string {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function fetchNews(rssUrl: string): Promise<NewsItem[]> {
  // Bust cache with timestamp so we always get fresh
  const cacheBust = `${rssUrl}${rssUrl.includes("?") ? "&" : "?"}_ts=${Date.now()}`;
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (supabaseUrl && supabaseKey) {
      const res = await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}`, "Cache-Control": "no-cache" },
        body: JSON.stringify({ url: cacheBust }),
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
    const res = await fetch(`${PROXY}${encodeURIComponent(cacheBust)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
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
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadSites = async (forceFetch = true) => {
    if (!user) return;
    setInitialLoading(true);
    const { data } = await supabase.from("custom_news_sites").select("id,name,rss_url").eq("user_id", user.id).order("created_at", { ascending: true });
    const list = (data as Site[]) || [];
    setSites(list);
    setInitialLoading(false);
    if (list.length && !activeTab) setActiveTab(list[0].id);
    if (forceFetch) list.forEach((s) => loadSiteNews(s));
  };

  const loadSiteNews = async (s: Site) => {
    setLoadingSite((prev) => ({ ...prev, [s.id]: true }));
    const news = await fetchNews(s.rss_url);
    setNewsBySite((prev) => ({ ...prev, [s.id]: news }));
    setLoadingSite((prev) => ({ ...prev, [s.id]: false }));
  };

  useEffect(() => {
    if (open) loadSites(true);
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
    if (!activeTab) setActiveTab(s.id);
  };

  const removeSite = async (id: string) => {
    setSites((prev) => prev.filter((s) => s.id !== id));
    setNewsBySite((prev) => { const c = { ...prev }; delete c[id]; return c; });
    if (activeTab === id) {
      const rest = sites.filter((s) => s.id !== id);
      setActiveTab(rest[0]?.id || "");
    }
    await supabase.from("custom_news_sites").delete().eq("id", id);
  };

  const startEdit = (s: Site) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditUrl(s.rss_url);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditUrl("");
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim() || !editUrl.trim()) return;
    setSavingEdit(true);
    let url = editUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const name = editName.trim();
    const { error } = await supabase.from("custom_news_sites").update({ name, rss_url: url }).eq("id", id);
    setSavingEdit(false);
    if (error) return;
    const updated: Site = { id, name, rss_url: url };
    setSites((prev) => prev.map((s) => (s.id === id ? updated : s)));
    setNewsBySite((prev) => { const c = { ...prev }; delete c[id]; return c; });
    cancelEdit();
    loadSiteNews(updated);
  };

  const closeSettings = () => {
    setShowSettings(false);
    // Refresh news for any newly-added sites without cache
    sites.forEach((s) => { if (!newsBySite[s.id] || newsBySite[s.id].length === 0) loadSiteNews(s); });
  };

  const totalNoticias = useMemo(() => Object.values(newsBySite).reduce((a, b) => a + b.length, 0), [newsBySite]);
  const activeSite = sites.find((s) => s.id === activeTab);
  const activeNews = activeSite ? newsBySite[activeSite.id] || [] : [];
  const activeLoading = activeSite ? loadingSite[activeSite.id] : false;

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
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg hover:bg-white/60 transition" style={{ color: NEXO_DARK }} title="Configurar fontes" aria-label="Configurar fontes">
              <Settings size={18} />
            </button>
            <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-white/60 transition" style={{ color: NEXO_DARK }} aria-label="Fechar">
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {sites.length > 0 && (
          <div className="flex items-center gap-1 px-4 py-2 overflow-x-auto border-b" style={{ borderColor: "rgba(10,37,64,0.08)", background: "#F5FAFC" }}>
            {sites.map((s) => {
              const active = s.id === activeTab;
              const count = (newsBySite[s.id] || []).length;
              const loading = loadingSite[s.id];
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveTab(s.id)}
                  className="shrink-0 h-8 px-3 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition"
                  style={{
                    background: active ? NEXO_CYAN : "#fff",
                    color: active ? "#fff" : NEXO_DARK,
                    border: `2px solid ${active ? NEXO_CYAN : `${NEXO_CYAN}44`}`,
                  }}
                >
                  <Globe size={11} />
                  <span className="truncate max-w-[140px]">{s.name}</span>
                  {loading ? (
                    <Loader2 size={10} className="animate-spin" />
                  ) : (
                    <span className="text-[9px] opacity-80">{count}</span>
                  )}
                </button>
              );
            })}
            {activeSite && (
              <button
                onClick={() => loadSiteNews(activeSite)}
                disabled={activeLoading}
                className="shrink-0 ml-auto h-8 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition hover:opacity-90 disabled:opacity-50"
                style={{ background: "#fff", color: NEXO_DARK, border: `2px solid ${NEXO_CYAN}44` }}
                title="Buscar notícias mais recentes"
              >
                <RefreshCw size={11} className={activeLoading ? "animate-spin" : ""} />
                Atualizar
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5" style={{ background: "#FAFCFD" }}>
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
              <p className="text-xs mt-1 mb-4" style={{ color: "rgba(10,37,64,0.55)" }}>Clique no ícone de configuração para adicionar sites.</p>
              <button
                onClick={() => setShowSettings(true)}
                className="h-9 px-4 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
                style={{ background: NEXO_CYAN, color: "#fff" }}
              >
                <Settings size={13} /> Configurar Fontes
              </button>
            </div>
          )}

          {!initialLoading && activeSite && (
            <>
              {activeLoading && activeNews.length === 0 ? (
                <div className="flex items-center justify-center py-10" style={{ color: NEXO_DARK }}>
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : activeNews.length === 0 ? (
                <p className="text-xs text-center py-10" style={{ color: "rgba(10,37,64,0.55)" }}>Nenhuma notícia encontrada nesta fonte.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {activeNews.map((n, i) => {
                    const dateLabel = formatPubDate(n.pubDate);
                    return (
                      <a
                        key={`${activeSite.id}-${i}`}
                        href={n.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group rounded-xl overflow-hidden flex flex-col hover:-translate-y-0.5 transition"
                        style={{ background: "#fff", border: `1px solid ${NEXO_CYAN}22`, boxShadow: "0 1px 3px rgba(10,37,64,0.06)" }}
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
                          <div className="mt-auto flex items-center justify-between gap-2">
                            {dateLabel ? (
                              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${NEXO_CYAN}18`, color: NEXO_DARK }}>{dateLabel}</span>
                            ) : <span />}
                            <span className="text-[10px] inline-flex items-center gap-1 opacity-70 group-hover:opacity-100" style={{ color: NEXO_CYAN }}>
                              Abrir <ExternalLink size={10} />
                            </span>
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Settings sub-popup */}
      {showSettings && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4" style={{ background: "rgba(10,37,64,0.55)", backdropFilter: "blur(4px)" }} onClick={closeSettings}>
          <div
            className="w-full max-w-lg max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
            style={{ background: "#fff", fontFamily: "'Montserrat', sans-serif", boxShadow: "0 24px 60px rgba(10,37,64,0.35)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: NEXO_CARD_BG, borderBottom: `1px solid ${NEXO_CYAN}33` }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NEXO_CYAN, color: "#fff" }}>
                  <Settings size={15} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: NEXO_DARK }}>Configurar Fontes</h3>
              </div>
              <button onClick={closeSettings} className="p-1.5 rounded-lg hover:bg-white/60 transition" style={{ color: NEXO_DARK }} aria-label="Fechar">
                <XIcon size={16} />
              </button>
            </div>

            <div className="px-5 py-4 flex items-center gap-2 border-b" style={{ borderColor: "rgba(10,37,64,0.08)" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${NEXO_CYAN}1A`, color: NEXO_CYAN }}>
                <Globe size={16} />
              </div>
              <input
                type="text"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addSite(); }}
                placeholder="URL do feed RSS (ex.: https://g1.globo.com/rss/g1/)"
                className="flex-1 h-10 px-3 rounded-lg text-xs outline-none"
                style={{ background: "#F5FAFC", border: `2px solid ${NEXO_CYAN}33`, color: NEXO_DARK }}
              />
              <button
                onClick={addSite}
                disabled={adding || !newUrl.trim()}
                className="h-10 px-4 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 transition hover:opacity-90"
                style={{ background: NEXO_CYAN, color: "#fff" }}
              >
                {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Adicionar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2" style={{ background: "#FAFCFD" }}>
              {sites.length === 0 && (
                <p className="text-xs text-center py-6" style={{ color: "rgba(10,37,64,0.55)" }}>Nenhum site cadastrado ainda.</p>
              )}
              {sites.map((s) => (
                <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#fff", border: `1px solid ${NEXO_CYAN}22` }}>
                  <Globe size={14} style={{ color: NEXO_CYAN }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: NEXO_DARK }}>{s.name}</p>
                    <p className="text-[10px] truncate" style={{ color: "rgba(10,37,64,0.55)" }}>{s.rss_url}</p>
                  </div>
                  <button onClick={() => removeSite(s.id)} className="p-1.5 rounded-md hover:bg-red-50 transition" style={{ color: "#dc2626" }} title="Remover">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: "rgba(10,37,64,0.08)" }}>
              <button
                onClick={closeSettings}
                className="h-9 px-5 rounded-full text-[11px] font-bold uppercase tracking-wider transition hover:opacity-90"
                style={{ background: NEXO_DARK, color: "#fff" }}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modal, document.body);
}
