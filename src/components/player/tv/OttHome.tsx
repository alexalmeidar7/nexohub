import { useLayoutEffect, useMemo, useState } from "react";
import { Undo2, Clapperboard, Headphones, Mic, Play, Radio, Search, Tv } from "lucide-react";
import { OttBackdrop, OttClientBrand, OttFrame } from "./OttFrame";
import PlayerClockWeather from "../PlayerClockWeather";
import OttAvatar from "./OttAvatar";
import OttArtwork from "./OttArtwork";
import OttAudioSpectrum from "./OttAudioSpectrum";
import { ensureTvRadio, getTvAudioMedia, stopTvAudio, useTvAudio } from "./tvAudio";
import { useOttRemote } from "./useOttRemote";

interface Channel { url?: string; id: string; name: string; type: string; cover_url?: string | null; background_url?: string | null; logo_url?: string | null; catalog_name?: string; descricao?: string | null }
interface Props { radioUserId?: string | null; channels: Channel[]; radioName: string; logo?: string | null; background?: string | null; nowPlaying?: {musica: string; artista: string; capa?: string} | null; program?: string; nextProgram?: {nome: string; horario_inicio?: string} | null; presenter?: string | null; presenterPhoto?: string | null; loading?: boolean; profileName: string; avatar?: string | null; onProfile: () => void; onPlay: (id: string) => void; onCatalog: (name: string) => void }
export default function OttHome(p: Props) {
  const audio = useTvAudio();
  const [page, setPage] = useState<"home" | "live" | "catalog">("home"), [query, setQuery] = useState(""), [search, setSearch] = useState(false), [selection, setSelection] = useState<string | null>(null);
  const root = useOttRemote(() => { if (search) { setSearch(false); setQuery(""); } else if (page !== "home") setPage("home"); else p.onProfile(); }, `${page}:${search}:${!!p.loading}`);
  const live = p.channels.filter(c => c.type === "video_live" || c.type === "audio_live"), catalogs = p.channels.filter(c => !live.includes(c));
  const radioUrl = live.find(c=>c.type === "audio_live")?.url;
  const station = p.radioUserId || p.radioName;
  useLayoutEffect(() => {
    if (!radioUrl) return;
    void ensureTvRadio(radioUrl, station);
    return stopTvAudio;
  }, [radioUrl, station]);
  const firstName = p.profileName.trim().split(/\s+/)[0];
  const greeting = `Olá, ${!firstName || firstName.toLowerCase() === "visitante" ? "visitante" : firstName}!`;
  const account = <button className="ott-account" aria-label={`Perfil: ${p.profileName}`} onClick={p.onProfile}><OttAvatar src={p.avatar} /></button>;
  const items = useMemo(() => (page === "live" ? live : catalogs.filter((c,i,a) => a.findIndex(o => (o.catalog_name || o.name) === (c.catalog_name || c.name)) === i)).filter(c => `${c.name} ${c.catalog_name || ""}`.toLowerCase().includes(query.toLowerCase())), [p.channels, page, query]);
  const selected = items.find(c => c.id === selection) || items[0];
  const play = (type: string) => { const channel = live.find(c => c.type === type); if (channel) p.onPlay(channel.id); else setPage("live"); };
  return <OttFrame root={root} className={`ott-home ${page === "home" ? "ott-home-gradient" : ""}`}>
    <OttBackdrop image={page === "home" ? p.background : selected?.cover_url || selected?.background_url || p.background} />
    {page === "home" && p.presenterPhoto && <div className="ott-presenter-backdrop" aria-hidden="true"><img key={p.presenterPhoto} src={p.presenterPhoto} alt="" onError={e=>{e.currentTarget.style.visibility="hidden";}} /></div>}
    <header className="ott-header">{page === "home" ? <OttClientBrand logo={p.logo} name={p.radioName} /> : <><button aria-label="Voltar" onClick={() => setPage("home")}><Undo2 /></button><h1>{page === "live" ? "Ao vivo" : "Programas"}</h1></>}
      {page === "home" && <button type="button" className="ott-header-track" onClick={audio.toggle} disabled={!audio.active} aria-label={audio.active ? audio.playing ? "Pausar áudio" : "Continuar áudio" : "Tocando agora"}>
        <OttArtwork className="ott-header-artwork" sources={[p.nowPlaying?.capa, p.logo]} />
        <div><strong>{p.nowPlaying?.musica || "Ao vivo"}</strong><span>{p.nowPlaying?.artista || p.radioName}</span></div>
        {audio.active && <OttAudioSpectrum media={getTvAudioMedia} compact />}
      </button>}
      <button className="ott-search" onClick={() => { setPage("catalog"); setSearch(v => !v); }} aria-label="Buscar programas"><Search /><span>Buscar</span></button>
      <div className="ott-header-right-group">
        <PlayerClockWeather radioUserId={p.radioUserId} tvHeader />
        {page === "home" ? <div className="ott-home-account"><span className="ott-home-greeting" title={greeting}>{greeting}</span>{account}</div> : account}
      </div>
    </header>
    {page === "home" ? <>
      <main className="ott-destinations"><span className="ott-eyebrow">{p.radioName || "Sua rádio"}</span><div className="ott-destination-row">
        {[{ title:"Assistir", text:"Transmissão ao vivo", icon:Tv, action:()=>play("video_live") },{ title:"Ouvir", text:"O som da sua rádio", icon:Radio, action:()=>play("audio_live") },{ title:"Programas", text:"Para ver no seu tempo", icon:Clapperboard, action:()=>setPage("catalog") }].map((card,i) => <button key={card.title} data-ott-initial={i===0 ? "" : undefined} className="ott-destination" onClick={card.action} disabled={p.loading}>
          <span className="ott-card-state">{i === 0 ? <><i /> AO VIVO</> : i === 1 ? "SÓ ÁUDIO" : "EXPLORE"}</span><div><card.icon /><h2>{card.title}</h2><p>{card.text}</p></div>
        </button>)}
      </div></main>
      <aside className="ott-now"><span className="ott-eyebrow">{p.loading ? "CARREGANDO" : "NO AR"}</span><h2>{p.program || p.radioName || "Positiva FM"}</h2>{p.presenter && <p className="ott-now-presenter"><Mic aria-hidden="true" />{p.presenter}</p>}<span className="ott-station-line" />{p.nextProgram && <p className="ott-up-next"><span>A seguir:</span> {p.nextProgram.nome}{p.nextProgram.horario_inicio && ` - ${p.nextProgram.horario_inicio.slice(0,5)}`}</p>}</aside>
      <footer className="ott-footer">
        <span className="ott-footer-version">Nexo TV v1.2.0</span>
      </footer>
    </> : <>
      <nav className="ott-categories"><button onClick={() => setPage("live")} aria-current={page === "live" ? "page" : undefined}><Tv /> Ao vivo</button><button onClick={() => setPage("catalog")} aria-current={page === "catalog" ? "page" : undefined}><Clapperboard /> Programas</button><button onClick={()=>play("audio_live")}><Headphones /> Rádio</button></nav>
      <section className="ott-channel-list" data-ott-scroll>{search && <input data-ott-initial aria-label="Buscar programas" placeholder="Buscar programas" value={query} onChange={e=>setQuery(e.target.value)} />}
        {items.map((c,i)=><button data-ott-initial={!search && i===0 ? "" : undefined} className="ott-channel" key={c.id} onFocus={()=>setSelection(c.id)} onClick={()=>page === "live" ? p.onPlay(c.id) : p.onCatalog(c.catalog_name || c.name)}><div className="ott-channel-art">{c.logo_url || c.cover_url ? <img src={c.logo_url || c.cover_url || ""} alt="" /> : <Radio />}</div><div><h2>{page === "catalog" ? c.catalog_name || c.name : c.name}</h2><p>{c.type === "audio_live" ? "Rádio ao vivo" : page === "live" ? "Transmissão ao vivo" : "Vídeos e programas"}</p></div><Play /></button>)}
        {!items.length && <p role="status">{p.loading ? "Carregando conteúdos…" : query ? "Nenhum resultado para essa busca." : "Nenhum conteúdo disponível nesta categoria."}</p>}
      </section><aside className="ott-detail"><span className="ott-eyebrow">NA {p.radioName.toUpperCase()}</span><h2>{selected?.catalog_name || selected?.name || p.radioName}</h2><p>{selected?.descricao}</p></aside>
    </>}
  </OttFrame>;
}
