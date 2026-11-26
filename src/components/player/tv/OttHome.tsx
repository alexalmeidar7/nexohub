import { Headphones as NexoListenRadioIcon } from "lucide-react";
import OttCommercialHomeBanner from "./OttCommercialHomeBanner";
import OttPresenterFadeV18 from "./OttPresenterFadeV18";
import {ProgramReminderToast} from "./TvProgramReminders";
import { OttInteractionCards, OttInteractionPanel, OttInteractionToggle, type Shortcut } from "./OttInteractionShared";
import { useOttActivePoll } from "./useOttActivePoll";
// NEXO_V7_13_CONTINUOUS_AUDIO
/* NEXO_V7_11_SKELETON_SEM_SOBREPOSICAO: nao cobrir conteudo real da Home durante atualizacoes. */
import OttArtistCrossfade from "./OttArtistCrossfade";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Sparkles, Sun, History, MessagesSquare, ListChecks, MicVocal, Undo2, Clapperboard, Clock3, Mic, Music2, Plus, Radio, Search, Tv, X , List } from "lucide-react";
import { OttBackdrop, OttClientBrand, OttFrame } from "./OttFrame";
import { fetchArtistImageCached, getArtistImageSync, upgradeArtistImageResolution } from "@/lib/artistImageCache";
import "./OttHomeBackdropMotion.css";
import NexoTvClimateHeader from "./NexoTvClimateHeader";
import "./OttHomeSearch.css";
import "./OttHomePolish.css";
import "./OttHomeRefinoV6.css";
import "./OttHomeRailV75.css";
import "./OttHomeRailV76.css";
import "./OttHomeRailV710.css";
import NexoTvScheduleGridPortraits from "./NexoTvScheduleGridPortraits";
import OttProgramSponsors from "./OttProgramSponsors";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import OttAvatar from "./OttAvatar";
import OttArtwork from "./OttArtwork";
import OttCircularSpectrum from "./OttCircularSpectrum";
import { ensureTvRadio, getTvAudioMedia, stopTvAudio, useTvAudio } from "./tvAudio";
import OttInteractivity from "./OttInteractivity";
import OttTvChat from "./OttTvChat";
import NexoTvHistoryCarousel from "./NexoTvHistoryCarousel";
import { useOttRemote } from "./useOttRemote";

interface Channel { url?: string; id: string; name: string; type: string; cover_url?: string | null; background_url?: string | null; logo_url?: string | null; catalog_name?: string; descricao?: string | null }
interface Programa { id?: string; nome: string; horario_inicio?: string | null; horario_fim?: string | null; dias_semana?: string[] | null; ativo?: boolean | null; variavel?: boolean | null; data_variavel?: string | null; estudio?: string | null; apresentador_id?: string | null; apresentadores_ids?: string[] | null; foto?: string | null; capa?: string | null; thumb?: string | null; descricao?: string | null }
interface Apresentador { id?: string; nome?: string; foto?: string | null }
interface PlaylistVideo { videoId: string; title: string; thumbnail: string; published?: string }
interface HistoryTrack { musica: string; artista: string; horario?: string | null; dia?: string | null; capa_url?: string | null }
type SearchKind = "Canal" | "Programa" | "Apresentador" | "Música tocada" | "On Demand";
interface SearchHit { id: string; kind: SearchKind; title: string; subtitle: string; image?: string | null; fallbackImage?: string | null; channelId?: string; catalogName?: string; track?: HistoryTrack }
const searchKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

/** Scroll only if text actually exceeds its container. 2s start / 3s hold / smooth return. */
function ScrollingText({ text, className }: { text: string; className: string }) {
  const clip = useRef<HTMLSpanElement>(null);
  const content = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    const measure = () => setShift(Math.max(0, Math.ceil((content.current?.scrollWidth || 0) - (clip.current?.clientWidth || 0))));
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      if (clip.current) ro.observe(clip.current);
      if (content.current) ro.observe(content.current);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [text]);
  useEffect(() => {
    const el = content.current;
    if (!el || shift <= 1 || typeof el.animate !== "function" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const travel = Math.max(1.6, shift / 70);
    const total = 5 + 2 * travel;
    const animation = el.animate([
      { transform: "translateX(0)", offset: 0 },
      { transform: "translateX(0)", offset: 2 / total, easing: "ease-in-out" },
      { transform: `translateX(-${shift}px)`, offset: (2 + travel) / total },
      { transform: `translateX(-${shift}px)`, offset: (5 + travel) / total, easing: "ease-in-out" },
      { transform: "translateX(0)", offset: 1 },
    ], { duration: total * 1000, iterations: Infinity });
    return () => animation.cancel();
  }, [shift, text]);
  return <span ref={clip} className={`ott-marquee-clip ${className}`} title={text}>
    <span ref={content} key={text} className="ott-marquee-run">{text}</span>
  </span>;
}

interface Props { authenticated?: boolean;  programs?: Programa[]; presenters?: Apresentador[]; onDemandVideos?: Record<string, PlaylistVideo[]>; currentProgramId?: string | null; radioUserId?: string | null; channels: Channel[]; radioName: string; logo?: string | null; background?: string | null; nowPlaying?: {musica: string; artista: string; capa?: string} | null; program?: string; nextProgram?: {nome: string; horario_inicio?: string} | null; presenter?: string | null; presenterPhoto?: string | null; loading?: boolean; loadError?: boolean; onRetry?: () => void; profileName: string; avatar?: string | null; onProfile: () => void; onPlay: (id: string) => void; onCatalog: (name: string) => void; onPlayVideo?: (channelId: string, videoId: string) => void }
export default function OttHome(p: Props) {
  // NEXO_V7_2_HOME_CLASS: cor da marca disponivel desde o primeiro quadro da TV.
  const isPositivaTv = /\/positivafm\//i.test(typeof window !== "undefined" ? window.location.pathname : "") || /positiva/i.test(p.radioName || "");
  const [page, setPage] = useState<"home" | "live" | "catalog">("home");
  const audio = useTvAudio();
  // Gradiente 10s / fotografia do artista 20s. Troca a imagem junto com a música.
  const [artistSnapshot, setArtistSnapshot] = useState<{artist:string;url:string|null} | null>(null);
  const [artistBackgroundVisible, setArtistBackgroundVisible] = useState(true);
  const currentArtist = p.nowPlaying?.artista?.trim() || "";
  const artistBackground = artistSnapshot?.url || null;
  useEffect(() => {
    let active = true;
    const setArtistBackground = (url:string|null) => setArtistSnapshot(prev=>prev?.artist===currentArtist && prev.url===url ? prev : {artist:currentArtist,url});
    // Keep last artist visible until the new image has finished decoding.
    if (!currentArtist || /^(break|vinhetas|hora certa|desconhecido)$/i.test(currentArtist) || /^(break|hora certa)$/i.test(p.nowPlaying?.musica?.trim() || "")) { setArtistBackground(null); return () => {active = false;}; }
    const cached = getArtistImageSync(currentArtist);
    if (cached) setArtistBackground(upgradeArtistImageResolution(cached));
    void fetchArtistImageCached(currentArtist).then((url) => {
      if (active) setArtistBackground(url ? upgradeArtistImageResolution(url) : null);
    }).catch(() => { /* Gradiente permanece quando a imagem não existir. */ });
    return () => { active = false; };
  }, [currentArtist, /^(break|hora certa)$/i.test(p.nowPlaying?.musica?.trim() || "")]);
  useEffect(() => {
    if (page !== "home" || !artistBackground) return;
    const timeout = window.setTimeout(() => setArtistBackgroundVisible(previous => !previous),
      artistBackgroundVisible ? 20000 : 10000);
    return () => window.clearTimeout(timeout);
  }, [page, artistBackground, artistBackgroundVisible]);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [shortcutsOpen,setShortcutsOpen]=useState(false);
  const [panel,setPanel]=useState<Shortcut|null>(null);
  const [panelClosing,setPanelClosing]=useState(false);
  const activePanel=panelClosing?null:panel;
  const toggleRef=useRef<HTMLButtonElement>(null),firstShortcutRef=useRef<HTMLButtonElement>(null),panelBackRef=useRef<HTMLButtonElement>(null),selectedRef=useRef<HTMLButtonElement|null>(null);
  const hasActivePoll=useOttActivePoll(p.radioUserId);
  const closePanel=()=>{setShortcutsOpen(false);setPanelClosing(true);};
  const closeShortcuts=()=>{if(panel) setPanelClosing(true);setShortcutsOpen(false);toggleRef.current?.focus({preventScroll:true});};
  // The generic remote initializer must not steal focus from the opening shortcuts.
  useLayoutEffect(()=>{
    if(!shortcutsOpen || activePanel || page !== "home")return;
    const first=firstShortcutRef.current;
    first?.focus({preventScroll:true});
    const frame=requestAnimationFrame(()=>{
      if(first?.isConnected && !first.disabled) first.focus({preventScroll:true});
    });
    return()=>cancelAnimationFrame(frame);
  },[shortcutsOpen,activePanel,page]);
  useEffect(()=>{if(!panelClosing)return;const timer=setTimeout(()=>{setPanel(null);setPanelClosing(false);toggleRef.current?.focus({preventScroll:true});},410);return()=>clearTimeout(timer);},[panelClosing]);
  useEffect(()=>{if(!activePanel)return;const el=document.getElementById("ott-interactivity-detail");if(!el)return;const focus=()=>{const target=el.querySelector<HTMLElement>(activePanel==="weather"?"[data-forecast-card]":"[data-ott-initial], button:not(:disabled)");target?.focus({preventScroll:true});return !!target;};if(focus())return;const observer=new MutationObserver(()=>{if(focus())observer.disconnect();});observer.observe(el,{childList:true,subtree:true});return()=>observer.disconnect();},[activePanel]);
  const [historyDetail, setHistoryDetail] = useState<HistoryTrack | null>(null);
  const scheduleButtonRef = useRef<HTMLButtonElement>(null);
  /* NEXO_V7_10_GRADE_MENU_FIX */
  const railScheduleRef = useRef<HTMLButtonElement>(null);
  const scheduleWasOpenedFromRail = useRef(false);
  const restoreScheduleFocus = () => (scheduleWasOpenedFromRail.current ? railScheduleRef.current : scheduleButtonRef.current)?.focus({ preventScroll: true });
  const [historyTracks, setHistoryTracks] = useState<HistoryTrack[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // Busca local da Home: não navega para catálogo nem reinicia o Player.
  const [homeSearchOpen, setHomeSearchOpen] = useState(false);
  const [homeQuery, setHomeQuery] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const homeSearchRef = useRef<HTMLDivElement>(null);
  const homeSearchInputRef = useRef<HTMLInputElement>(null);
  const homeSearchButtonRef = useRef<HTMLButtonElement>(null);
  const historyKey = `nexo_home_search_v1:${p.radioUserId || p.radioName}:${p.profileName}`;
  const rememberHomeSearch = (value: string) => {
    const term = value.trim().slice(0, 120);
    if (!term) return;
    setRecentSearches(previous => {
      const next = [term, ...previous.filter(item => item.toLocaleLowerCase("pt-BR") !== term.toLocaleLowerCase("pt-BR"))].slice(0, 3);
      try { localStorage.setItem(historyKey, JSON.stringify(next)); } catch { /* Perfil sem armazenamento local */ }
      return next;
    });
  };
  const closeHomeSearch = () => {
    rememberHomeSearch(homeQuery);
    setHomeSearchOpen(false);
    setHomeQuery("");
    homeSearchButtonRef.current?.focus({ preventScroll: true });
  };
  const root = useOttRemote(() => {
    if (activePanel) { closePanel(); } else if (shortcutsOpen) { closeShortcuts(); }
    else if (scheduleOpen) { setScheduleOpen(false); restoreScheduleFocus(); }
    else if (historyDetail) setHistoryDetail(null);
    else if (homeSearchOpen) closeHomeSearch();
    else if (page !== "home") setPage("home");
    else p.onProfile();
  }, `${page}:${homeSearchOpen}:${scheduleOpen}:${!!historyDetail}:${!!p.loading}`);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(historyKey) || "[]");
      setRecentSearches(Array.isArray(saved) ? saved.filter((item): item is string => typeof item === "string").slice(0, 3) : []);
    } catch { setRecentSearches([]); }
  }, [historyKey]);
  useEffect(() => {
    if (!homeSearchOpen) return;
    const frame = requestAnimationFrame(() => homeSearchInputRef.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [homeSearchOpen]);
  useEffect(() => {
    if (!homeSearchOpen) return;
    const onOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !homeSearchRef.current?.contains(event.target)) closeHomeSearch();
    };
    document.addEventListener("pointerdown", onOutside);
    return () => document.removeEventListener("pointerdown", onOutside);
  }, [homeSearchOpen, homeQuery, historyKey]);
  // A mesma Edge Function pública utilizada pelo histórico das músicas do /watch.
  // Somente quando a busca é aberta; sem consultar a tabela privada do usuário.
  useEffect(() => {
    if (!homeSearchOpen || !p.radioUserId) return;
    let cancelled = false;
    setHistoryLoading(true);
    const params = new URLSearchParams({ user_id: p.radioUserId, limit: "50" });
    void playerSupabase.functions.invoke<{ok?: boolean; items?: HistoryTrack[]}>(`public-music-history?${params}`, { method: "GET" })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data?.ok || !Array.isArray(data.items)) { setHistoryTracks([]); return; }
        setHistoryTracks(data.items.filter(t => typeof t?.musica === "string" && typeof t?.artista === "string").slice(0, 50));
      })
      .catch(() => { if (!cancelled) setHistoryTracks([]); })
      .finally(() => { if (!cancelled) setHistoryLoading(false); });
    return () => { cancelled = true; };
  }, [homeSearchOpen, p.radioUserId]);
  const live = p.channels.filter(c => c.type === "video_live" || c.type === "audio_live");
  const radioUrl = live.find(c=>c.type === "audio_live")?.url;
  const station = p.radioUserId || p.radioName;
  useLayoutEffect(() => {
    if (!radioUrl) return;
    void ensureTvRadio(radioUrl, station);
    // Audio is a singleton and must keep playing while profiles and pairing are open.
    // The controller replaces the stream only when the station/source changes.
  }, [radioUrl, station]);
  const firstName = p.profileName.trim().split(/\s+/)[0];
  const greeting = `Olá, ${!firstName || firstName.toLowerCase() === "visitante" ? "visitante" : firstName}!`;
  // NEXO_V7_4_HOME_ACCOUNT: greeting and avatar are ONE TV focusable button.
  const account = <button className="ott-home-account ott-home-account-action" aria-label={`Abrir perfil de ${p.profileName}`} onClick={p.onProfile}><span className="ott-home-greeting" title={greeting}>{greeting}</span><span className="ott-account ott-account-avatar"><OttAvatar src={p.avatar}/></span></button>;
  const normalizedHomeQuery = searchKey(homeQuery.trim());
  const homeResults = useMemo<SearchHit[]>(() => {
    if (!normalizedHomeQuery) return [];
    const matches = (...values: Array<string | null | undefined>) => searchKey(values.filter(Boolean).join(" ")).includes(normalizedHomeQuery);
    const results: SearchHit[] = [], seen = new Set<string>();
    const add = (item: SearchHit) => { if (!seen.has(item.id)) { seen.add(item.id); results.push(item); } };
    const people = new Map((p.presenters || []).filter(person => person.id).map(person => [String(person.id), person]));
    // 1. Canais de rádio/vídeo e seus catálogos.
    p.channels.forEach(channel => {
      if (!matches(channel.name, channel.catalog_name, channel.descricao)) return;
      const isLive = channel.type === "video_live" || channel.type === "audio_live";
      add({id: `channel:${isLive ? channel.id : channel.catalog_name || channel.name}`, kind: "Canal", title: channel.catalog_name || channel.name,
        subtitle: isLive ? (channel.type === "video_live" ? "Canal ao vivo" : "Rádio ao vivo") : "Catálogo On Demand",
        image: channel.cover_url || channel.logo_url || channel.background_url, fallbackImage: p.logo,
        channelId: isLive ? channel.id : undefined, catalogName: isLive ? undefined : channel.catalog_name || channel.name});
    });
    // 2. Apresentadores cadastrados.
    (p.presenters || []).forEach(person => { if (person.nome && matches(person.nome)) add({ id: `presenter:${person.id || person.nome}`, kind: "Apresentador", title: person.nome, subtitle: "Apresentador da rádio", image: person.foto }); });
    // 3. Grade: programa, descrição, horário e apresentadores.
    (p.programs || []).forEach(program => {
      const ids = [program.apresentador_id, ...(program.apresentadores_ids || [])].filter(Boolean).map(String);
      const names = ids.map(id => people.get(id)?.nome).filter(Boolean).join(" • ");
      if (!matches(program.nome, program.descricao, program.horario_inicio, names)) return;
      const firstPhoto = ids.map(id => people.get(id)?.foto).find(Boolean);
      add({id: `program:${program.id || program.nome}`, kind: "Programa", title: program.nome,
        subtitle: `${program.horario_inicio?.slice(0, 5) || ""}${program.horario_fim ? " – " + program.horario_fim.slice(0, 5) : ""}${names ? " · " + names : ""}`.trim() || "Na grade de programação",
        image: program.thumb || program.capa || firstPhoto, fallbackImage: firstPhoto});
    });
    // 4. Conteúdo do On Demand, incluindo vídeos das playlists por canal.
    p.channels.forEach(channel => (p.onDemandVideos?.[channel.id] || []).forEach(video => {
      if (!matches(video.title, channel.name, channel.catalog_name)) return;
      add({id:`video:${channel.id}:${video.videoId}`,kind:"On Demand",title:video.title,subtitle:channel.catalog_name || channel.name,
        image:video.thumbnail, fallbackImage:channel.cover_url || channel.logo_url, catalogName:channel.catalog_name || channel.name});
    }));
    // 5. Histórico público das músicas tocadas, até 50 registros.
    historyTracks.forEach((track, i) => {
      if (!matches(track.musica, track.artista)) return;
      add({id:`history:${i}:${track.artista}:${track.musica}`,kind:"Música tocada",title:track.musica,
        subtitle:`${track.artista}${track.horario ? " · " + track.horario.slice(0,5) : ""}`,
        image:track.capa_url || ((track.musica === p.nowPlaying?.musica && track.artista === p.nowPlaying?.artista) ? p.nowPlaying?.capa : null),track});
    });
    return results.slice(0, 24);
  }, [normalizedHomeQuery, p.channels, p.programs, p.presenters, p.onDemandVideos, historyTracks, p.nowPlaying, p.logo]);
  const openHomeSearchResult = (result: SearchHit) => {
    rememberHomeSearch(homeQuery || result.title);
    setHomeSearchOpen(false);
    setHomeQuery("");
    if (result.channelId) p.onPlay(result.channelId);
    else if (result.catalogName) p.onCatalog(result.catalogName);
    else if (result.track) setHistoryDetail(result.track);
    else if (result.kind === "Programa" || result.kind === "Apresentador") setScheduleOpen(true);
  };
  const play = (type: string) => { if (type === "video_live") stopTvAudio(); const candidates = live.filter(c => c.type === type); const isPositiva = /\/(positiva|positivafm)\//i.test(window.location.pathname); const channel = type === "video_live" && isPositiva ? candidates.find(c => !/positiva\s*cast|podcast|pod\s*cast|radio\s*cast/i.test(c.name)) || candidates[0] : candidates[0]; if (channel) p.onPlay(channel.id); else setPage("live"); };
  return <OttFrame root={root} className={`ott-home ${page === "home" ? "ott-home-gradient ott-rail-layout" : "ott-content-view"} ${isPositivaTv ? "ott-positiva" : ""}`} loading={!!p.loading && !p.loadError && !Boolean(p.program?.trim() || p.nowPlaying?.musica?.trim() || p.nowPlaying?.artista?.trim())} skeletonVariant={page === "home" ? "home" : "catalog"}><ProgramReminderToast/>
    <OttBackdrop image={null} />
    {page === "home" && <div className={`ott-home-artist-cycle${artistBackground && artistBackgroundVisible ? " is-visible" : ""}`} aria-hidden="true">
      <OttArtistCrossfade source={artistBackground} />
      <span className="ott-home-artist-scrim" />
    </div>}
    {page === "home" && p.presenterPhoto && <OttPresenterFadeV18 photos={[p.presenterPhoto]} rotate={false}/>}
    <header className="ott-header"><OttClientBrand logo={p.logo} name={p.radioName} />
      <button type="button" data-ott-initial={!homeSearchOpen && page === "home" ? "" : undefined} className="ott-header-track" onClick={audio.toggle} aria-disabled={!audio.active} aria-label={audio.active ? audio.playing ? "Pausar áudio" : "Continuar áudio" : "Tocando agora"}>
        <OttArtwork className="ott-header-artwork" sources={[p.nowPlaying?.capa, p.logo]} />
        <div className="ott-header-track-names">
          <ScrollingText className="ott-header-track-title" text={p.nowPlaying?.musica || "Ao vivo"} />
          <ScrollingText className="ott-header-track-artist" text={p.nowPlaying?.artista || p.radioName} />
        </div>
        {audio.active && <OttCircularSpectrum media={getTvAudioMedia} />}
      </button>
      <div className={`ott-home-search-wrap${homeSearchOpen ? " is-open" : ""}`} ref={homeSearchRef}>
        <button ref={homeSearchButtonRef} type="button" className="ott-search" onClick={() => homeSearchOpen ? closeHomeSearch() : setHomeSearchOpen(true)} aria-expanded={homeSearchOpen} aria-controls="ott-home-search-content" aria-label="Buscar conteúdos"><Search /><span>Buscar</span></button>
        <div className="ott-home-search-expand">
          {homeSearchOpen && <>
            <input ref={homeSearchInputRef} className="ott-home-search-input" placeholder="Buscar em tudo..." autoComplete="off" maxLength={120} value={homeQuery}
              aria-label="Pesquisar canais, apresentadores, programação, músicas e On Demand" onChange={event => setHomeQuery(event.target.value)}
              onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); closeHomeSearch(); } else if (event.key === "Enter") { event.preventDefault(); if (homeResults[0]) openHomeSearchResult(homeResults[0]); else rememberHomeSearch(homeQuery); } }} />
            <button type="button" className="ott-home-search-close" aria-label="Voltar e fechar busca" onClick={closeHomeSearch}><Undo2 aria-hidden="true" /></button>
          </>}
        </div>
        {homeSearchOpen && <div id="ott-home-search-content" className="ott-home-search-results" aria-label="Resultados da busca">
          {normalizedHomeQuery ? <>
            {homeResults.map(result => <button key={result.id} type="button" className="ott-home-search-result" onClick={() => openHomeSearchResult(result)}>
              <span className="ott-home-search-result-art">
                {result.image || result.fallbackImage ? <OttArtwork sources={[result.image, result.fallbackImage]} /> : result.kind === "Apresentador" ? <Mic aria-hidden="true" /> : result.kind === "Música tocada" ? <Music2 aria-hidden="true" /> : <Clapperboard aria-hidden="true" />}
              </span>
              <span className="ott-home-search-result-text"><strong>{result.title}</strong><small><em>{result.kind}</em> · {result.subtitle}</small></span>
            </button>)}
            {!homeResults.length && <p className="ott-home-search-empty" role="status">{historyLoading ? "Buscando músicas e conteúdos..." : "Nenhum conteúdo encontrado."}</p>}
          </> : <>
            <span className="ott-home-search-caption">Últimas pesquisas</span>
            {recentSearches.length ? recentSearches.map(term => <button key={term} type="button" className="ott-home-search-recent" onClick={() => { setHomeQuery(term); homeSearchInputRef.current?.focus({ preventScroll: true }); }}><Clock3 aria-hidden="true" /><span>{term}</span></button>) : <p className="ott-home-search-empty">Suas últimas pesquisas aparecem aqui.</p>}
          </>}
        </div>}
      </div>
      <div className="ott-header-right-group">
        <NexoTvClimateHeader radioUserId={p.radioUserId} />
        <div className="ott-home-account"><span className="ott-home-greeting" title={greeting}>{greeting}</span>{account}</div>
      </div>
    </header>
    {page === "home" ? <>
      {/* NEXO_V7_5_HOME_SIDE_MENU: layout novo apenas na Home. */}
      <nav className="ott-home-rail" aria-label="Menu principal da Home">
        <div className="ott-home-rail-actions">
          {[{ title:"Ouvir", icon:NexoListenRadioIcon, action:()=>play("audio_live") },
            { title:"Assistir", icon:Tv, action:()=>play("video_live") },
            { title:"On Demand", icon:Clapperboard, action:()=>setPage("catalog") },
            { title:"Grade de programação", icon:List, action:()=>{ scheduleWasOpenedFromRail.current = true; setScheduleOpen(true); } }].map((entry) =>
            <button type="button" key={entry.title} className="ott-home-rail-button" aria-label={entry.title}
              ref={entry.title === "Grade de programação" ? railScheduleRef : undefined}
              disabled={p.loading} onClick={entry.action}
              onPointerLeave={event => { if (event.pointerType === "mouse" && !event.currentTarget.matches(":focus-visible") && document.activeElement === event.currentTarget) event.currentTarget.blur(); }}>
              <span className="ott-home-rail-circle"><entry.icon aria-hidden="true" /></span>
              <span className="ott-home-rail-name">{entry.title}</span>
            </button>)}
        </div>
        <button type="button" className="ott-home-rail-profile" aria-label={`Abrir perfil de ${p.profileName || "visitante"}`}
          onClick={p.onProfile} title="Perfil"
          onPointerLeave={event => { if (event.pointerType === "mouse" && !event.currentTarget.matches(":focus-visible") && document.activeElement === event.currentTarget) event.currentTarget.blur(); }}>
          <span className="ott-home-rail-circle"><OttAvatar src={p.avatar} /></span>
          <span className="ott-home-rail-name">Olá, {p.profileName?.trim() || "visitante"}</span>
        </button>
      </nav>
      <OttCommercialHomeBanner radioId={p.radioUserId} programId={p.currentProgramId} visible={!homeSearchOpen && !shortcutsOpen && !panel && !scheduleOpen && !historyDetail} />
      <aside className="ott-now">
        <span className="ott-now-live-label"><span>{p.loading ? "CARREGANDO" : "NO AR"}</span></span>
        <h2>{p.program || p.radioName || "Positiva FM"}</h2>
        {p.presenter && <p className="ott-now-presenter"><Mic aria-hidden="true" />{p.presenter}</p>}
        <button ref={scheduleButtonRef} type="button" className="ott-now-grade" aria-label="Abrir grade de programação" onClick={() => { scheduleWasOpenedFromRail.current = false; setScheduleOpen(true); }}>
          <Plus aria-hidden="true" /> Grade de programação
        </button>
        <OttProgramSponsors radioUserId={p.radioUserId} programId={p.currentProgramId} variant="home" />
      </aside>
      {p.loadError && <div className="ott-home-load-error" role="alert">
        <strong>Não foi possível atualizar os dados da rádio.</strong>
        <span>Verifique a conexão e tente novamente.</span>
        <button type="button" onClick={p.onRetry}>Tentar novamente</button>
      </div>}
    </> : <>
      {/* Espaço livre para catálogo On Demand: sem menu, título ou detalhe duplicado. */}
      {/* NEXO_V7_1_ONDEMAND_FIX: lista real de episodios; nao renderizar tela preta ou placeholder vazio. */}
      <main className="ott-demand-content" aria-label="On Demand" data-ott-scroll>
        <h1>On Demand</h1>
        {p.loading ? <p className="ott-demand-message" role="status">Carregando conteúdos…</p> : (() => {
          const entries = (Array.isArray(p.channels) ? p.channels : []).filter(c => c && c.type !== "audio_live" && c.type !== "video_live");
          const groups = entries.map(channel => ({ channel, videos: p.onDemandVideos?.[channel.id] || [] }));
          const withVideos = groups.filter(group => group.videos.length > 0);
          return withVideos.length ? <div className="ott-demand-groups">{withVideos.map(({channel,videos}) => <section className="ott-demand-group" key={channel.id}>
            <h2>{channel.catalog_name || channel.name}</h2>
            <div className="ott-demand-videos">{videos.map(video => <button type="button" className="ott-demand-video" key={video.videoId} onClick={() => p.onPlayVideo ? p.onPlayVideo(channel.id,video.videoId) : p.onCatalog(channel.catalog_name || channel.name)}>
              {video.thumbnail ? <img src={video.thumbnail} loading="lazy" alt="" /> : <span className="ott-demand-video-fallback"><Clapperboard aria-hidden="true"/></span>}
              <span>{video.title}</span>
            </button>)}</div>
          </section>)}</div> : <p className="ott-demand-message" role="status">Ainda não há conteúdos On Demand disponíveis nesta rádio.</p>;
        })()}
      </main>
    </>}
    {/* Rodapé idêntico em Home e Programas, alinhado no canto inferior direito. */}
    <footer className={`ott-footer${page !== "home" ? " ott-footer-subpage" : ""}`}>{page !== "home" && <button type="button" data-ott-initial className="ott-subpage-bottom-back" onClick={() => setPage("home")}><Undo2 aria-hidden="true"/> Voltar</button>}<span className="ott-footer-version">Nexo TV v1.2.0</span></footer>
    {page === "home" && <><div className="ott-home-interaction-tools ott-tools"><OttInteractionToggle {...{toggleRef,shortcutsOpen,closeShortcuts,hasActivePoll}} openShortcuts={()=>setShortcutsOpen(true)}/></div><div className="ott-home-interaction-rail"><OttInteractionCards {...{shortcutsOpen,activePanel,firstShortcutRef,selectedRef,closePanel,setPanelClosing,setPanel,closeShortcuts,hasActivePoll}} /></div>{panel && <OttInteractionPanel key={panel} {...{panel,panelClosing,setPanel,panelBackRef,closePanel}} owner={p.radioUserId} programId={p.currentProgramId} title={p.nowPlaying?.musica||""} artist={p.nowPlaying?.artista} canVote={!!p.authenticated}/>}</>}
    {scheduleOpen && <div className="ott-modal-scrim" data-nexo-schedule="true" onClick={event => { if (event.target === event.currentTarget) setScheduleOpen(false); }}>
      <NexoTvScheduleGridPortraits programs={p.programs || []} presenters={p.presenters || []} currentProgramId={p.currentProgramId} onClose={() => {setScheduleOpen(false); restoreScheduleFocus();}} />
    </div>}
    {historyDetail && <div className="ott-modal-scrim" onClick={event => {if (event.target === event.currentTarget) setHistoryDetail(null);}}>
      <section className="ott-home-history-dialog" role="dialog" aria-modal="true" aria-label="Música tocada">
        <button className="ott-home-history-close" type="button" aria-label="Fechar" onClick={() => setHistoryDetail(null)}><X aria-hidden="true" /></button>
        <span className="ott-home-history-label">Música tocada</span><h2>{historyDetail.musica}</h2><p>{historyDetail.artista}</p>
        {historyDetail.horario && <small>Última execução: {historyDetail.horario.slice(0,5)}</small>}
        <button type="button" className="ott-home-history-play" onClick={() => {setHistoryDetail(null); play("audio_live");}}><Radio aria-hidden="true" /> Ouvir rádio</button>
      </section>
    </div>}
  </OttFrame>;
}
