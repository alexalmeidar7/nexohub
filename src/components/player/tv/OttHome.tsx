import { useMemo, useState } from "react";
import { ArrowLeft, Clapperboard, Headphones, Play, Radio, Search, Tv, UserRound } from "lucide-react";
import { OttBackdrop, OttBrand, OttFrame } from "./OttFrame";
import { useOttRemote } from "./useOttRemote";

interface Channel { id: string; name: string; type: string; cover_url?: string | null; background_url?: string | null; logo_url?: string | null; catalog_name?: string; descricao?: string | null }
interface Props { channels: Channel[]; radioName: string; logo?: string | null; background?: string | null; program?: string; presenter?: string | null; loading?: boolean; profileName: string; avatar?: string | null; onProfile: () => void; onPlay: (id: string) => void; onCatalog: (name: string) => void }
export default function OttHome(p: Props) {
  const [page, setPage] = useState<"home" | "live" | "catalog">("home"), [query, setQuery] = useState(""), [search, setSearch] = useState(false), [selection, setSelection] = useState<string | null>(null);
  const root = useOttRemote(() => { if (search) { setSearch(false); setQuery(""); } else if (page !== "home") setPage("home"); else p.onProfile(); }, `${page}:${search}`);
  const live = p.channels.filter(c => c.type === "video_live" || c.type === "audio_live"), catalogs = p.channels.filter(c => !live.includes(c));
  const items = useMemo(() => (page === "live" ? live : catalogs.filter((c,i,a) => a.findIndex(o => (o.catalog_name || o.name) === (c.catalog_name || c.name)) === i)).filter(c => `${c.name} ${c.catalog_name || ""}`.toLowerCase().includes(query.toLowerCase())), [p.channels, page, query]);
  const selected = items.find(c => c.id === selection) || items[0];
  const play = (type: string) => { const channel = live.find(c => c.type === type); if (channel) p.onPlay(channel.id); else setPage("live"); };
  return <OttFrame root={root} className="ott-home">
    <OttBackdrop image={page === "home" ? p.background : selected?.cover_url || selected?.background_url || p.background} />
    <header className="ott-header">{page === "home" ? <OttBrand /> : <><button aria-label="Voltar" onClick={() => setPage("home")}><ArrowLeft /></button><h1>{page === "live" ? "Ao vivo" : "Programas"}</h1></>}
      <button className="ott-search" onClick={() => { setPage("catalog"); setSearch(v => !v); }} aria-label="Buscar programas"><Search /><span>Buscar</span></button>
      <button className="ott-account" aria-label={`Perfil: ${p.profileName}`} onClick={p.onProfile}>{p.avatar ? <img src={p.avatar} alt="" /> : <UserRound />}</button>
    </header>
    {page === "home" ? <>
      <main className="ott-destinations"><span className="ott-eyebrow">{p.radioName || "Sua rádio"}</span><div className="ott-destination-row">
        {[{ title:"Assistir", text:"Transmissão ao vivo", icon:Tv, action:()=>play("video_live") },{ title:"Ouvir", text:"O som da sua rádio", icon:Radio, action:()=>play("audio_live") },{ title:"Programas", text:"Para ver no seu tempo", icon:Clapperboard, action:()=>setPage("catalog") }].map((card,i) => <button key={card.title} data-ott-initial={i===0 ? "" : undefined} className="ott-destination" onClick={card.action} disabled={p.loading}>
          <span className="ott-card-state">{i === 0 ? <><i /> AO VIVO</> : i === 1 ? "SÓ ÁUDIO" : "EXPLORE"}</span><div><card.icon /><h2>{card.title}</h2><p>{card.text}</p></div>
        </button>)}
      </div></main>
      <aside className="ott-now"><span className="ott-eyebrow">{p.loading ? "CARREGANDO" : "ACONTECE AGORA"}</span><h2>{p.program || p.radioName || "Positiva FM"}</h2>{p.presenter && <p>{p.presenter}</p>}<span className="ott-station-line" />{p.logo && <img src={p.logo} alt={p.radioName} />}</aside>
      <footer className="ott-footer"><span>Uma experiência Nexo</span><span>Use as setas para explorar</span></footer>
    </> : <>
      <nav className="ott-categories"><button onClick={() => setPage("live")} aria-current={page === "live" ? "page" : undefined}><Tv /> Ao vivo</button><button onClick={() => setPage("catalog")} aria-current={page === "catalog" ? "page" : undefined}><Clapperboard /> Programas</button><button onClick={()=>play("audio_live")}><Headphones /> Rádio</button></nav>
      <section className="ott-channel-list" data-ott-scroll>{search && <input data-ott-initial aria-label="Buscar programas" placeholder="Buscar programas" value={query} onChange={e=>setQuery(e.target.value)} />}
        {items.map((c,i)=><button data-ott-initial={!search && i===0 ? "" : undefined} className="ott-channel" key={c.id} onFocus={()=>setSelection(c.id)} onClick={()=>page === "live" ? p.onPlay(c.id) : p.onCatalog(c.catalog_name || c.name)}><div className="ott-channel-art">{c.logo_url || c.cover_url ? <img src={c.logo_url || c.cover_url || ""} alt="" /> : <Radio />}</div><div><h2>{page === "catalog" ? c.catalog_name || c.name : c.name}</h2><p>{c.type === "audio_live" ? "Rádio ao vivo" : page === "live" ? "Transmissão ao vivo" : "Vídeos e programas"}</p></div><Play /></button>)}
        {!items.length && <p role="status">{p.loading ? "Carregando conteúdos…" : query ? "Nenhum resultado para essa busca." : "Nenhum conteúdo disponível nesta categoria."}</p>}
      </section><aside className="ott-detail"><span className="ott-eyebrow">NA {p.radioName.toUpperCase()}</span><h2>{selected?.catalog_name || selected?.name || p.radioName}</h2><p>{selected?.descricao}</p></aside>
    </>}
  </OttFrame>;
}
