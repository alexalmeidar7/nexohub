import { useEffect, useMemo, useRef, useState } from "react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { resolveSponsorLogoUrl } from "@/lib/sponsorLogoResolver";
import "./OttProgramSponsors.css";
import "./OttSponsorsV16.css";

type Sponsor = { id: string; name: string; url: string };
type Row = { id?: string | null; nome?: string | null; logo_url?: string | null };
type Snapshot = { logos: Sponsor[]; at: number };
const cache = new Map<string, Snapshot>();
const pending = new Map<string, Promise<Sponsor[] | null>>();
const refreshMs = 60_000;
function clockInBrasilia() {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo", weekday: "long", year: "numeric", month: "2-digit",
    day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const read = (key: Intl.DateTimeFormatPartTypes) => parts.find(p => p.type === key)?.value || "";
  const day = read("weekday").replace(/-feira$/i, "");
  return { date: `${read("year")}-${read("month")}-${read("day")}`, day: day.charAt(0).toUpperCase() + day.slice(1), time: `${read("hour")}:${read("minute")}` };
}
function normalize(rows: Row[]): Sponsor[] {
  const seen = new Set<string>();
  return rows.flatMap((row, i) => {
    if (!row || !row.logo_url?.trim()) return [];
    const url = resolveSponsorLogoUrl(row.logo_url, row.nome);
    if (!/^(https?:\/\/|\/(?!\/)|data:image\/(png|jpeg|jpg|webp|gif);base64,)/i.test(url) || url.includes("default-sponsor-logo.png") || seen.has(url)) return [];
    seen.add(url);
    return [{ id: String(row.id || i), name: String(row.nome || "Patrocinador"), url }];
  });
}
function getCached(key: string): Sponsor[] {
  const entry = cache.get(key);
  if (entry) return entry.logos;
  // Session cache is scoped to the exact station and program, never another station.
  try {
    const raw = sessionStorage.getItem(`nexo:sponsors:v2:${key}`);
    if (raw) {
      const saved = JSON.parse(raw) as Snapshot;
      if (Array.isArray(saved.logos) && Date.now() - saved.at < 5 * 60_000) { cache.set(key, saved); return saved.logos; }
    }
  } catch { /* Storage may be disabled. */ }
  return [];
}
async function loadSponsors(uid: string, programId: string, key: string): Promise<Sponsor[] | null> {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < refreshMs) return cached.logos;
  const inflight = pending.get(key);
  if (inflight) return inflight;
  const request = (async (): Promise<Sponsor[] | null> => {
    const clock = clockInBrasilia();
    let confirmed: Sponsor[] | null = null;
    // Same public endpoint and API key as the existing public scenario screen.
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    try {
      const params = new URLSearchParams({ uid, ...clock });
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-cenario-data?${params}`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, signal: controller.signal,
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data?.ok && String(data.currentProgram?.id) === programId && Array.isArray(data.sponsorLogos)) confirmed = normalize(data.sponsorLogos);
      }
    } catch { /* Preserve last confirmed data on transport failure. */ }
    finally { window.clearTimeout(timer); }
    // Fallback to the same exact program's registered logos, subject to existing RLS.
    if (confirmed === null) {
      try {
        const { data, error } = await playerSupabase.from("logos_patrocinadores")
          .select("id,nome,logo_url").eq("user_id", uid).eq("programa_id", programId)
          .eq("ativo", true).eq("excluido", false).gte("data_final", clock.date).order("id");
        if (!error && data?.length) confirmed = normalize(data);
      } catch { /* A visitor may not have table access; do not bypass RLS. */ }
    }
    if (confirmed !== null) {
      const entry = { logos: confirmed, at: Date.now() };
      cache.set(key, entry);
      if (cache.size > 32) cache.delete(cache.keys().next().value!);
      try { sessionStorage.setItem(`nexo:sponsors:v2:${key}`, JSON.stringify(entry)); } catch { /* optional cache */ }
    }
    return confirmed;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}
export default function OttProgramSponsors({ radioUserId, programId, variant }: {
  radioUserId?: string | null; programId?: string | null; variant: "home" | "audio";
}) {
  const key = `${radioUserId || ""}:${programId || ""}`;
  const [snapshot, setSnapshot] = useState(() => ({ key, logos: getCached(key) }));
  const logos = snapshot.key === key ? snapshot.logos : getCached(key);
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const loadedRef = useRef(loaded); loadedRef.current = loaded;
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setSnapshot({ key, logos: getCached(key) });
    setLoaded({}); setSelected(null);
    if (!radioUserId || !programId) return;
    const refresh = async () => {
      if (document.hidden) return;
      const result = await loadSponsors(radioUserId, String(programId), key);
      if (!alive) return;
      if (result !== null) setSnapshot(prev => prev.key === key && JSON.stringify(prev.logos) === JSON.stringify(result) ? prev : {key, logos:result});
      if (result?.some(logo => !loadedRef.current[logo.url])) setRetry(n => n + 1);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), refreshMs);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { alive = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [radioUserId, programId, key]);
  // Preload candidates; an unavailable image must not replace a visible sponsor.
  useEffect(() => {
    let alive = true;
    const images = logos.filter(logo => !loadedRef.current[logo.url]).map(logo => {
      const image = new Image();
      image.onload = () => { if (alive) setLoaded(prev => prev[logo.url] ? prev : {...prev, [logo.url]: true}); };
      image.onerror = () => { if (alive) setLoaded(prev => prev[logo.url] ? {...prev, [logo.url]: false} : prev); };
      image.src = logo.url;
      return image;
    });
    return () => { alive = false; images.forEach(image => { image.onload = null; image.onerror = null; }); };
  }, [logos, retry]);
  const available = useMemo(() => logos.filter(logo => loaded[logo.url]), [logos, loaded]);
  const current = available.find(logo => logo.url === selected) || available[0];
  useEffect(() => {
    if (available.length <= 1) return;
    const timer = window.setInterval(() => { if (document.hidden) return; setSelected(previous => {
      const i = available.findIndex(logo => logo.url === previous);
      return available[(Math.max(i, 0) + 1) % available.length].url;
    }); }, 5000);
    return () => window.clearInterval(timer);
  }, [available]);
  if (!radioUserId || !programId || !current) return null;
  return <div className={`ott-program-sponsors ott-program-sponsors--${variant}`} aria-label="Patrocinadores do programa no ar">
    <span className="ott-program-sponsors-label">oferecimento</span>
    <div className="ott-program-sponsors-logo-wrap">
      {available.map(logo => <img key={logo.url} className={logo.url === current.url ? "is-current" : "is-preloaded"}
        src={logo.url} alt={logo.name} aria-hidden={logo.url !== current.url} loading="eager" decoding="async"
        onError={() => setLoaded(prev => prev[logo.url] ? {...prev, [logo.url]: false} : prev)} />)}
    </div>
  </div>;
}
