import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import OttTvChat from "./OttTvChat";
import { ArrowLeft, Undo2, CalendarDays, ChevronDown, ChevronLeft, ChevronUp, Heart, History, Loader2, Pause, Play, ListChecks, MessagesSquare, MicVocal, Sparkles, Sun, Volume2, VolumeX } from "lucide-react";
import { OttBrand, OttFrame } from "./OttFrame";
import OttPresenterBackdrop from "./OttPresenterBackdrop";
import { useOttSoftSwap } from "./useOttSoftSwap";
import OttAvatar from "./OttAvatar";
import OttInteractivity from "./OttInteractivity";
import OttMusicHistory from "./OttMusicHistory";
import OttArtwork from "./OttArtwork";
import OttAudioSpectrum from "./OttAudioSpectrum";
import PlayerClockWeather from "../PlayerClockWeather";
import { useOttControlsMotion } from "./useOttControlsMotion";
import { useOttRemote } from "./useOttRemote";

interface WatchProgram {
 id?: string;
 nome: string;
 horario_inicio?: string | null;
 horario_fim?: string | null;
}
interface Props { musicTitle?:string; musicArtist?:string; avatar?:string|null; channelKey?:string; audioMedia: () => HTMLMediaElement | null; radioUserId?:string|null; video:boolean; playing:boolean; buffering:boolean; muted:boolean; title:string; subtitle?:string; radioName?:string|null; logo?:string|null; cover?:string|null; programSeal?:string|null; presenterPhoto?:string|null; presenterPhotos?:string[]; programKey?:string; currentProgram?:WatchProgram|null; presenterName?:string|null; presenterSocial?:string|null; guest?:boolean; liked:boolean; programs:WatchProgram[]; loadHistoryCover?:(artist:string,title:string)=>Promise<string|undefined>; onPlay:()=>void; onMute:()=>void; onLike:()=>boolean|void|Promise<boolean|void>; onBack:()=>void; onChannel:(dir:1|-1)=>void; onProfile?:()=>void; renderProfile?:(onClose:()=>void)=>ReactNode }
const shortcuts = [
 { id: "lyrics", label: "Letra da música", Icon: MicVocal },
 { id: "chat", label: "Chat", Icon: MessagesSquare },
 { id: "poll", label: "Enquete", Icon: ListChecks },
 { id: "weather", label: "Previsão do tempo", Icon: Sun },
 { id: "history", label: "Músicas tocadas", Icon: History },
] as const;
type Shortcut = typeof shortcuts[number]["id"];

function programHours({ horario_inicio, horario_fim }: WatchProgram) {
 return [horario_inicio?.slice(0, 5), horario_fim?.slice(0, 5)].filter(Boolean).join(" – ");
}

export default function OttWatch(p:Props){
 const songTitle = p.musicTitle || p.title;
 const songArtist = p.musicArtist || (p.video ? undefined : p.subtitle);
 const track = useOttSoftSwap({title:songTitle,subtitle:songArtist,cover:p.cover}, JSON.stringify([songTitle,songArtist,p.cover]));
 const [visible,setVisible]=useState(true),[activity,setActivity]=useState(0);
 const [shortcutsOpen, setShortcutsOpen] = useState(false);
 const [panel, setPanel] = useState<Shortcut | null>(null);
 const [panelClosing, setPanelClosing] = useState(false);
 const [guestLikes, setGuestLikes] = useState<Set<string>>(() => new Set());
 const [burstSong, setBurstSong] = useState<string | null>(null);
 const songKey = JSON.stringify([p.musicTitle, p.musicArtist]);
 const likeSelected = p.liked || (!!p.guest && guestLikes.has(songKey));
 const [modal, setModal] = useState<"schedule" | "profile" | null>(null);
 const scheduleOpen = modal === "schedule";
 const [showPresenterSocial, setShowPresenterSocial] = useState(false);
 const activePanel = panelClosing ? null : panel;
 const presenterName = p.presenterName?.trim();
 const presenterSocial = p.presenterSocial?.trim();
 const presenterLabel = (showPresenterSocial ? presenterSocial : presenterName) || presenterName || presenterSocial;
 const scheduleButtonRef = useRef<HTMLButtonElement>(null);
 const scheduleCloseRef = useRef<HTMLButtonElement>(null);
 const profileButtonRef = useRef<HTMLButtonElement>(null);
 const modalTrigger = useRef<HTMLButtonElement | null>(null);
 const toggleRef = useRef<HTMLButtonElement>(null);
 const firstShortcutRef = useRef<HTMLButtonElement>(null);
 const panelBackRef = useRef<HTMLButtonElement>(null);
 const selectedRef = useRef<HTMLButtonElement | null>(null);
 useLayoutEffect(() => {
  if (shortcutsOpen) firstShortcutRef.current?.focus({ preventScroll: true });
 }, [shortcutsOpen]);
 useEffect(() => {
  setShowPresenterSocial(false);
  if (!presenterName || !presenterSocial) return;
  const timer = window.setInterval(() => setShowPresenterSocial(show => !show), 4000);
  return () => window.clearInterval(timer);
 }, [p.programKey, presenterName, presenterSocial]);

 const likeSong = async () => {
  if (likeSelected) return;
  if (p.guest) {
   if (!p.musicTitle || !p.musicArtist) return;
   setGuestLikes(previous => new Set(previous).add(songKey));
  } else if (await p.onLike() !== true) {
   return;
  }
  setBurstSong(songKey);
 };

 const closePanel = () => {
  setPanelClosing(true);
  selectedRef.current?.focus({ preventScroll: true });
 };
 const closeShortcuts = () => {
  if (panel) setPanelClosing(true);
  setShortcutsOpen(false);
  toggleRef.current?.focus({ preventScroll: true });
 };
 useEffect(() => {
  if (activePanel && activePanel !== "weather") panelBackRef.current?.focus({ preventScroll: true });
 }, [activePanel]);
 const [leaving,setLeaving]=useState(false);
 const leaveTimer=useRef<ReturnType<typeof setTimeout>>();
 const onBack=useRef(p.onBack);onBack.current=p.onBack;
 const leave=()=>{if(leaving)return;setLeaving(true);leaveTimer.current=setTimeout(()=>onBack.current(),window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?0:480);};
 useEffect(()=>()=>clearTimeout(leaveTimer.current),[]);
 const controlsPhase=useOttControlsMotion(visible&&!leaving,p.channelKey);
 const closeModal = () => setModal(null);
 const root=useOttRemote(()=>{if(modal)closeModal();else if(activePanel)closePanel();else if(shortcutsOpen)closeShortcuts();else if(p.video&&visible)setVisible(false);else leave();},visible,()=>{if(!visible){setVisible(true);setActivity(v=>v+1);return true;}setActivity(v=>v+1);return false;});
 useEffect(()=>{if(!p.video||!visible||shortcutsOpen||panel||modal)return;const timer=window.setTimeout(()=>setVisible(false),5000);return()=>clearTimeout(timer);},[p.video,visible,shortcutsOpen,modal,activity]);
 const overlay=useRef<HTMLDivElement>(null);
 useLayoutEffect(() => {
  overlay.current?.toggleAttribute("inert", modal !== null);
  if (modal === "schedule") scheduleCloseRef.current?.focus({ preventScroll: true });
  if (!modal && modalTrigger.current) {
   modalTrigger.current.focus({ preventScroll: true });
   modalTrigger.current = null;
  }
 }, [modal]);
 useEffect(()=>{const wake=()=>{setVisible(true);setActivity(v=>v+1);};const el=overlay.current;el?.addEventListener("pointermove",wake);return()=>el?.removeEventListener("pointermove",wake);},[]);
 const nowPlaying = (
  <div className="ott-audio-stage" data-track-phase={track.phase}><div className="ott-album"><OttArtwork sources={[track.displayed.cover]} programSeal={p.programSeal} /><button className="ott-album-like" disabled={track.phase !== "idle"} onClick={() => void likeSong()} aria-label="Curtir música" aria-pressed={likeSelected}>
    <Heart aria-hidden="true" className="ott-album-heart" fill="currentColor"/>
    {burstSong === songKey && <span className="ott-like-burst" aria-hidden="true" onAnimationEnd={() => setBurstSong(current => current === songKey ? null : current)}>
     {[[0,-1],[.7,-.7],[1,0],[.7,.7],[0,1],[-.7,.7],[-1,0],[-.7,-.7]].map(([x,y], index) =>
      <Heart key={index} fill="currentColor" style={{ "--heart-x": x, "--heart-y": y } as CSSProperties}/>
     )}
    </span>}
   </button></div><section><span className="ott-eyebrow ott-playing-label">tocando</span><h1>{track.displayed.title}</h1><p>{track.displayed.subtitle}</p>{!p.video && <OttAudioSpectrum media={p.audioMedia} />}</section></div>
 );
 return <OttFrame root={root} className={`ott-watch-controls ${p.video ? "ott-video":"ott-audio ott-home-gradient"}${activePanel && activePanel !== "history" && activePanel !== "chat" ? " ott-presenter-centered" : ""}${panel === "weather" ? " ott-weather-open" : ""}`}>
  {!p.video && <OttPresenterBackdrop key={p.programKey} photos={p.presenterPhotos?.length ? p.presenterPhotos : p.presenterPhoto ? [p.presenterPhoto] : []} />}
  <div ref={overlay} className="ott-watch-surface" onPointerDown={()=>{if(!visible){setVisible(true);setActivity(v=>v+1);}}}>
   {!p.video && nowPlaying}
   <div className="ott-watch-chrome" data-controls-phase={controlsPhase} style={{visibility:controlsPhase === "hidden" ? "hidden":"visible",pointerEvents:visible&&!leaving ? "auto":"none"}}>
    <header className="ott-watch-header">{p.logo ? <img src={p.logo} alt={p.radioName||"Emissora"}/>:<OttBrand/>}<span>{p.radioName}</span><span className="ott-channel-type">{p.video ? "Vídeo" : "Áudio"}</span><span className="ott-live-label"><i/> AO VIVO</span><PlayerClockWeather radioUserId={p.radioUserId} tvHeader />{(p.onProfile || p.renderProfile) && <button ref={profileButtonRef} className="ott-account" onClick={() => {
     if (!p.renderProfile) { p.onProfile?.(); return; }
     modalTrigger.current = profileButtonRef.current;
     setModal("profile");
    }} aria-label="Perfil"><OttAvatar src={p.avatar}/></button>}</header>
    {p.video && (p.musicTitle ? nowPlaying : <section className="ott-watch-description"><span className="ott-live-tag">AO VIVO</span><h1>{p.title}</h1><p>{p.subtitle}</p></section>)}
    <footer className="ott-watch-footer">
     <button className="ott-watch-back" onClick={leave} aria-label="Voltar ao início">
      <ChevronLeft aria-hidden="true"/><span aria-hidden="true">Voltar</span>
     </button>
     <div id="ott-interactivity-shortcuts" className="ott-interactivity-shortcuts" data-open={shortcutsOpen} style={{ "--ott-shortcut-count": shortcuts.length } as CSSProperties} role="group" aria-label="Atalhos de interatividade" aria-hidden={!shortcutsOpen}>
      {shortcuts.map(({ id, label, Icon }, index) => (
       <button
        key={id}
        ref={index === 0 ? firstShortcutRef : undefined}
        className="ott-interactivity-card"
        type="button"
        disabled={!shortcutsOpen}
        aria-expanded={activePanel === id}
        aria-controls={activePanel === id ? "ott-interactivity-detail" : undefined}
        style={{ "--ott-card-index": index } as CSSProperties}
        onClick={event => {
         selectedRef.current = event.currentTarget;
         if (activePanel === id) closePanel();
         else {
          setPanelClosing(false);
          setPanel(id);
         }
        }}
       >
        <span>{label}</span>
        <Icon aria-hidden="true" strokeWidth={1.35} />
       </button>
      ))}
     </div>
     <div className="ott-transport"><button data-ott-initial className="ott-play" onClick={p.onPlay} aria-label={p.playing ? "Pausar":"Reproduzir"}>{p.buffering ? <Loader2 className="animate-spin"/>:p.playing ? <Pause/>:<Play/>}</button></div>
     <div className="ott-watch-program">
      {p.currentProgram && <>
       <span className="ott-channel-type">Agora</span>
       <div className="ott-watch-program-info">
        <strong title={p.currentProgram.nome}>{p.currentProgram.nome}</strong>
        <div className="ott-watch-program-meta">
         <span>{programHours(p.currentProgram)}</span>
         {presenterLabel && <span className="ott-watch-presenter" title={presenterLabel}>
          <MicVocal aria-hidden="true"/><span key={presenterLabel}>{presenterLabel}</span>
         </span>}
        </div>
       </div>
      </>}
      <button ref={scheduleButtonRef} className="ott-watch-schedule-button" aria-label="Abrir programação" aria-haspopup="dialog" aria-expanded={scheduleOpen} onClick={() => { modalTrigger.current = scheduleButtonRef.current; setModal("schedule"); }}>
       <CalendarDays aria-hidden="true"/>
      </button>
     </div>
     <div className="ott-tools">
      <button className="ott-volume-button" onClick={p.onMute} aria-label={p.muted ? "Ativar som":"Silenciar"}>{p.muted?<VolumeX/>:<Volume2/>}</button>
      <button ref={toggleRef} className="ott-interactivity-button" aria-label="Interatividade" title="Interatividade" aria-expanded={shortcutsOpen} aria-controls="ott-interactivity-shortcuts" onClick={() => shortcutsOpen ? closeShortcuts() : setShortcutsOpen(true)}>
       <Sparkles aria-hidden="true" fill="currentColor" strokeWidth={1.4} />
      </button>
     </div>
    </footer>
    {panel && (
     <section
      key={panel}
      id="ott-interactivity-detail"
      className={`ott-interactivity-panel ott-interactivity-panel-${panel}${panel === "history" || panel === "weather" ? " ott-interactivity-rail" : ""}`}
      data-phase={panelClosing ? "exit" : "enter"}
      aria-labelledby={panel === "chat" ? undefined : "ott-watch-panel-title"}
      aria-label={panel === "chat" ? "Chat" : undefined}
      aria-hidden={panelClosing || undefined}
      tabIndex={panelClosing || panel !== "lyrics" ? -1 : 0}
      data-ott-scroll={panel === "lyrics" || undefined}
      ref={element => { element?.toggleAttribute("inert", panelClosing); }}
      onAnimationEnd={event => {
       if (panelClosing && event.target === event.currentTarget) setPanel(null);
      }}
     >
      {panel === "chat" ? (
        <OttTvChat radioUserId={p.radioUserId} onClose={closePanel}/>
      ) : <>
      <header>
       <h2 id="ott-watch-panel-title">{shortcuts.find(shortcut => shortcut.id === panel)?.label}</h2>
       <button ref={panelBackRef} className="ott-standard-back" onClick={closePanel} aria-label="Voltar aos atalhos"><Undo2 strokeWidth={2.5}/></button>
      </header>
      {panel === "history" ? <OttMusicHistory owner={p.radioUserId} loadCover={p.loadHistoryCover}/> :
       <OttInteractivity page={panel} owner={p.radioUserId} canVote={!p.guest} title={p.musicTitle||p.title} artist={p.musicArtist||p.subtitle}/>}
      </>}
     </section>
    )}
    <button className="ott-channel-up" onClick={()=>p.onChannel(-1)} aria-label="Canal anterior"><ChevronUp/></button>
    <button className="ott-open-schedule" onClick={()=>p.onChannel(1)} aria-label="Próximo canal"><ChevronDown/></button>
   </div>
  </div>
  {modal && <div className="ott-modal-scrim" onClick={event => {
   if (event.target === event.currentTarget) closeModal();
  }}>
   {scheduleOpen ? <section className="ott-watch-schedule" role="dialog" aria-modal="true" aria-labelledby="ott-watch-schedule-title">
    <header>
     <h2 id="ott-watch-schedule-title">Programação de hoje</h2>
     <button ref={scheduleCloseRef} onClick={closeModal} aria-label="Fechar programação"><ChevronLeft aria-hidden="true"/></button>
    </header>
    {p.programs.length > 0 ? <ul tabIndex={0} data-ott-scroll aria-label="Programas">
     {p.programs.map((program, index) => <li key={program.id || index} aria-current={program.id && program.id === p.currentProgram?.id ? "true" : undefined}>
      <span>{programHours(program)}</span><strong>{program.nome}</strong>
     </li>)}
    </ul> : <p>Nenhum programa cadastrado para hoje.</p>}
   </section> : <section role="dialog" aria-modal="true" aria-label="Perfil">
    {p.renderProfile?.(closeModal)}
   </section>}
  </div>}
 </OttFrame>;
}
