import { useNexoAudioIdle } from "./useNexoAudioIdle";
import "./NexoAudioIdle.css";
import NexoLoadingImage from "./NexoLoadingImage";
import { isPlayerOtt, isPlayerTvApp } from "@/lib/playerTvApp";
import OttCommercialSlot from "./OttCommercialSlot";
import {useTvVisualAds,usePauseAd,useSplashAd} from "./useTvVisualAds";
import { OttInteractionCards, OttInteractionPanel, OttInteractionToggle, type Shortcut } from "./OttInteractionShared";
import { normalizeTvMusicText, resolveTvCatalogTrack } from "@/lib/tvMusicEncoding";
// NEXO_V718_POSITIVA_NO_AR
// NEXO_V716_POSITIVA_VIDEO
/* NEXO_V7_11_SKELETON_SEM_SOBREPOSICAO: buffering de audio nao e skeleton de tela completa. */
import NexoTvScheduleGridPortraits from "./NexoTvScheduleGridPortraits";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import OttTvChat from "./OttTvChat";
import { ArrowLeft, Undo2, CalendarDays, ChevronDown, ChevronLeft, ChevronUp, Heart, History, Loader2, Pause, Play, ListChecks, MessagesSquare, MicVocal, Sparkles, Sun, House } from "lucide-react";
import { OttBrand, OttFrame } from "./OttFrame";
import OttPresenterBackdrop from "./OttPresenterFadeV18";
import OttWatchArtistCycle from "./OttWatchArtistCycle";
import OttProgramSponsors from "./OttProgramSponsors";
import "./OttVideoV16.css";
import { ProgramReminderToast } from "./TvProgramReminders";
import { useOttSoftSwap } from "./useOttSoftSwap";
import OttAvatar from "./OttAvatar";
import OttInteractivity from "./OttInteractivity";
import NexoTvHistoryCarousel from "./NexoTvHistoryCarousel";
import OttArtwork from "./OttArtwork";
import OttAudioSpectrum from "./OttAudioSpectrum";
import NexoTvClimateHeader from "./NexoTvClimateHeader";
import { useOttControlsMotion } from "./useOttControlsMotion";
import { useOttRemote } from "./useOttRemote";
import { useOttActivePoll } from "./useOttActivePoll";

interface WatchProgram {
 id?: string;
 nome: string;
 horario_inicio?: string | null;
 horario_fim?: string | null;
}
interface Props {
 presenters?: { id?:string; nome?:string; foto?:string|null }[]; studio?:string|null;  musicTitle?:string; musicArtist?:string; avatar?:string|null; channelKey?:string; audioMedia: () => HTMLMediaElement | null; radioUserId?:string|null; video:boolean; playing:boolean; buffering:boolean; muted:boolean; title:string; subtitle?:string; radioName?:string|null; logo?:string|null; cover?:string|null; programSeal?:string|null; presenterPhoto?:string|null; presenterPhotos?:string[]; programKey?:string; currentProgram?:WatchProgram|null; presenterName?:string|null; presenterSocial?:string|null; guest?:boolean; liked:boolean; programs:WatchProgram[]; loadHistoryCover?:(artist:string,title:string)=>Promise<string|undefined>; onPlay:()=>void; onMute:()=>void; onLike:()=>boolean|void|Promise<boolean|void>; onBack:()=>void; onChannel:(dir:1|-1)=>void;
 unavailable?: boolean; playbackBlocked?: boolean; videoProgressing?: boolean; commercialPlayback?:boolean;
 videoChannels?: Array<{id:string;label:string;cover:string;available:boolean;liveStatus?:"live"|"offline"|"unknown"}>;
 onSelectVideoChannel?:(id:string)=>void; onOfflineConfirm?:()=>void;
 onProfile?:()=>void; renderProfile?:(onClose:()=>void)=>ReactNode }
function programHours({ horario_inicio, horario_fim }: WatchProgram) {
 return [horario_inicio?.slice(0, 5), horario_fim?.slice(0, 5)].filter(Boolean).join(" – ");
}

export default function OttWatch(p:Props){
 // NEXO_SKELETON_WATCH_V10: apenas antes da primeira reprodução.
 const hasPlayed = useRef(false);
 if (p.playing) hasPlayed.current = true;
 const rawTitle = normalizeTvMusicText(p.musicTitle || p.title);
 const rawArtist = normalizeTvMusicText(p.musicArtist || (p.video ? "" : p.subtitle || ""));
 const incomingKey=JSON.stringify([rawTitle,rawArtist]);
 const [catalog,setCatalog]=useState<{key:string;title:string;artist:string;cover:string}|null>(null);
 useEffect(()=>{
  if(!rawTitle || !rawArtist || (!/�/.test(rawTitle+rawArtist) && p.cover))return;
  let live=true;
  void resolveTvCatalogTrack(rawTitle,rawArtist).then(result=>{if(live&&result)setCatalog({key:incomingKey,...result});});
  return ()=>{live=false;};
 },[incomingKey,rawTitle,rawArtist,p.cover,p.video]);
 const verified=catalog?.key===incomingKey?catalog:null;
 const songTitle=/�/.test(rawTitle)&&verified?verified.title.toLocaleUpperCase("pt-BR"):rawTitle;
 const songArtist=/�/.test(rawArtist)&&verified?verified.artist.toLocaleUpperCase("pt-BR"):rawArtist;
 const cover=p.cover||verified?.cover||undefined;
 const track = {displayed:{title:songTitle,subtitle:songArtist,cover},phase:"idle"};
 const [visible,setVisible]=useState(true),[activity,setActivity]=useState(0);
 const [shortcutsOpen, setShortcutsOpen] = useState(false);
 const [videoTrayFocused,setVideoTrayFocused] = useState(false);
 const [videoTrayHovered,setVideoTrayHovered] = useState(false);
 const [offlineDismissed,setOfflineDismissed] = useState(false);
 const [missingChannel,setMissingChannel] = useState(false);
 const offlineOpen = missingChannel || (!!p.unavailable && !offlineDismissed);
 const dismissOffline = () => {setMissingChannel(false);setOfflineDismissed(true);if(p.video){setVideoTrayFocused(false);setVideoTrayHovered(false);p.onOfflineConfirm?.();}requestAnimationFrame(()=>root.current?.querySelector<HTMLButtonElement>(".ott-play")?.focus({preventScroll:true}));};
 const offlineOk = useRef<HTMLButtonElement>(null);
 useEffect(()=>{if(!p.unavailable)setOfflineDismissed(false);},[p.unavailable]);
 useEffect(()=>{setOfflineDismissed(false);setMissingChannel(false);},[p.channelKey]);
 useEffect(()=>{if(offlineOpen){setVisible(true);offlineOk.current?.focus({preventScroll:true});}},[offlineOpen]);
 /* NEXO_ENQUETE_AVISO_LAYOUT_V2: indicador de enquete ativa */
 const hasActivePoll = useOttActivePoll(p.radioUserId);
 const [panel, setPanel] = useState<Shortcut | null>(null);
 const [panelClosing, setPanelClosing] = useState(false);
 useEffect(()=>{if(shortcutsOpen||panel){setVideoTrayFocused(false);setVideoTrayHovered(false);}},[shortcutsOpen,panel]);
 const [guestLikes, setGuestLikes] = useState<Set<string>>(() => new Set());
 const [burstSong, setBurstSong] = useState<string | null>(null);
 const songKey = JSON.stringify([p.musicTitle, p.musicArtist]);
 const likeSelected = !!p.musicTitle && !!p.musicArtist && (p.guest ? guestLikes.has(songKey) : p.liked);
 useEffect(() => { setBurstSong(null); }, [songKey]);
 const [modal, setModal] = useState<"schedule" | "profile" | null>(null);
 const positivaProgramVisible = true;
 const scheduleOpen = modal === "schedule";
 const [showPresenterSocial, setShowPresenterSocial] = useState(false);
 const activePanel = panelClosing ? null : panel;
 const presenterName = p.presenterName?.trim();
 const presenterSocial = p.presenterSocial?.trim();
 const presenterLabel = (showPresenterSocial ? presenterSocial : presenterName) || presenterName || presenterSocial;
 /* NEXO_APRESENTADOR_TRANSICAO_V6 */
 const [displayPresenter, setDisplayPresenter] = useState(presenterLabel || "");
 const [presenterExiting, setPresenterExiting] = useState(false);
 useEffect(() => {
  const next = presenterLabel || "";
  if (next === displayPresenter) return;
  if (!displayPresenter || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
   setDisplayPresenter(next);
   setPresenterExiting(false);
   return;
  }
  setPresenterExiting(true);
  const timer = window.setTimeout(() => {
   setDisplayPresenter(next);
   setPresenterExiting(false);
  }, 180);
  return () => window.clearTimeout(timer);
 }, [presenterLabel, displayPresenter]);
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
  if (!p.video) return;
  const frame = requestAnimationFrame(() => toggleRef.current?.focus({preventScroll:true}));
  return () => cancelAnimationFrame(frame);
 }, [p.video]);
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
  if (!panel || panelClosing) return;
  setShortcutsOpen(false);
  setPanelClosing(true);
 };
 // NEXO_FIX_VOLTAR_FECHA_SOMENTE_BOX_V2
 // Fecha o box com animacao; se animationend falhar, o timer evita ficar preso.
 useEffect(() => {
  if (!panelClosing) return;
  const timer = window.setTimeout(() => {
   setPanel(null);
   setPanelClosing(false);
   window.requestAnimationFrame(() => toggleRef.current?.focus({ preventScroll: true }));
  }, 410);
  return () => window.clearTimeout(timer);
 }, [panelClosing]);
 const closeShortcuts = () => {
  if (panel) setPanelClosing(true);
  setShortcutsOpen(false);
  toggleRef.current?.focus({ preventScroll: true });
 };
 // NEXO_V7_1_PANEL_FOCUS: nao focar Voltar; aguarda dados do box e escolhe o primeiro dia apos hoje.
 useEffect(() => {
  if(activePanel !== "weather") return;
  const container = document.getElementById("ott-interactivity-detail");
  if(!container)return;
  let done=false;
  const focus = () => {
   if(done)return;
   const cards=container.querySelectorAll<HTMLElement>('[data-forecast-card]');
   const chosen=cards.item(0);
   if(chosen){done=true;chosen.focus({preventScroll:true});chosen.scrollIntoView({block:"nearest",inline:"nearest",behavior:"smooth"});}
  };
  focus();const observer=new MutationObserver(focus);
  observer.observe(container,{childList:true,subtree:true});
  return()=>observer.disconnect();
 },[activePanel]);
 const [leaving,setLeaving]=useState(false);
 const leaveTimer=useRef<ReturnType<typeof setTimeout>>();
 const onBack=useRef(p.onBack);onBack.current=p.onBack;
 const leave=()=>{if(leaving)return;setLeaving(true);leaveTimer.current=setTimeout(()=>onBack.current(),window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?0:480);};
 useEffect(()=>()=>clearTimeout(leaveTimer.current),[]);
 const web = isPlayerOtt() && !isPlayerTvApp();
 const videoReady = !!(p.video && p.videoProgressing && p.playing && !p.buffering && !p.unavailable && !p.playbackBlocked);
 const showChrome = web || visible || (p.video && !videoReady);
 useEffect(()=>{if(p.video){setVisible(true);}},[p.video,p.channelKey,videoReady]);
 const controlsPhase=useOttControlsMotion(showChrome&&!leaving,p.channelKey);
 const closeModal = () => setModal(null);
 // Lote 15: the hook registers its capture listener before the existing navigation handler.
 useNexoAudioIdle(()=>root.current,!p.video&&!leaving&&!modal&&!panel&&!shortcutsOpen&&!offlineOpen&&!p.commercialPlayback,p.channelKey);
 const videoNavRef=useRef({video:p.video,modal,panel,shortcutsOpen,offlineOpen,showChrome,onChannel:p.onChannel});
 videoNavRef.current={video:p.video,modal,panel,shortcutsOpen,offlineOpen,showChrome,onChannel:p.onChannel};
 useLayoutEffect(()=>{
  const key=(e:KeyboardEvent)=>{
   if (isPlayerOtt() && !isPlayerTvApp()) return;
   const v=videoNavRef.current;
   if(v.modal||v.panel||v.shortcutsOpen||v.offlineOpen||document.querySelector('.nexo-tv-cep-overlay,.nexo-tv-commercial-playback'))return;
   if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;
   if(v.video&&!v.showChrome){e.preventDefault();e.stopImmediatePropagation();if(!e.repeat){setVisible(true);setActivity(x=>x+1);}return;}
   const active=document.activeElement as HTMLElement|null;
   const direction=e.key;
   const play=root.current?.querySelector<HTMLButtonElement>(".ott-play");
   const schedule=scheduleButtonRef.current;
   const toggle=toggleRef.current;
   const next=direction==="ArrowRight"?(active===play?schedule:active===schedule?toggle:null):direction==="ArrowLeft"?(active===toggle?schedule:active===schedule?play:null):null;
   if(next){e.preventDefault();e.stopImmediatePropagation();next.focus({preventScroll:true});setActivity(x=>x+1);return;}
   if(active instanceof HTMLButtonElement && active.matches('.ott-positiva-channel-card')&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){
    const cards=Array.from(active.parentElement?.querySelectorAll<HTMLButtonElement>('.ott-positiva-channel-card')||[]);
    const next=cards[cards.indexOf(active)+(e.key==='ArrowRight'?1:-1)];
    if(next){e.preventDefault();e.stopImmediatePropagation();next.focus({preventScroll:true});setActivity(x=>x+1);}
   }
  };
  window.addEventListener('keydown',key,true);return()=>window.removeEventListener('keydown',key,true);
 },[]);
 const root=useOttRemote(()=>{if(offlineOpen)dismissOffline();else if(modal)closeModal();else if(activePanel)closePanel();else if(shortcutsOpen)closeShortcuts();else if(!web&&p.video&&showChrome&&videoReady)setVisible(false);else leave();},showChrome,()=>{if(!showChrome){setVisible(true);setActivity(v=>v+1);return true;}setActivity(v=>v+1);return false;});
 useEffect(()=>{if(web||!videoReady||!visible||shortcutsOpen||panel||modal||offlineOpen)return;const timer=window.setTimeout(()=>setVisible(false),3000);return()=>clearTimeout(timer);},[web,videoReady,visible,shortcutsOpen,panel,modal,activity,offlineOpen,p.channelKey]);
 const overlay=useRef<HTMLDivElement>(null);
 useLayoutEffect(() => {
  overlay.current?.toggleAttribute("inert", modal !== null || offlineOpen);
  if (modal === "schedule") scheduleCloseRef.current?.focus({ preventScroll: true });
  if (!modal && modalTrigger.current) {
   modalTrigger.current.focus({ preventScroll: true });
   modalTrigger.current = null;
  }
 }, [modal,offlineOpen]);
 useEffect(()=>{let last=0;const wake=()=>{if(!p.video)return;const now=performance.now();if(now-last<250)return;last=now;setVisible(true);setActivity(v=>v+1);};const el=overlay.current;el?.addEventListener("pointermove",wake);return()=>el?.removeEventListener("pointermove",wake);},[p.video]);
 const adIdle=!panel&&!shortcutsOpen&&!modal&&!offlineOpen&&!p.commercialPlayback;
 const pauseAd=usePauseAd(adIdle&&hasPlayed.current&&!p.playing&&!p.buffering&&!p.unavailable&&!p.playbackBlocked);
 const splashAd=useSplashAd(!p.commercialPlayback&&!hasPlayed.current&&p.buffering&&!p.playing,p.channelKey||"");
 const visualAd=useTvVisualAds(p.radioUserId,p.currentProgram?.id,adIdle&&!p.video&&p.playing&&!p.buffering&&!pauseAd&&!splashAd,p.channelKey||"");
 const nowPlaying = (
  <div className="ott-audio-stage" data-track-phase={track.phase}><div className="ott-album"><OttCommercialSlot radioId={p.radioUserId} programId={p.currentProgram?.id} placement="cover_ads" visible={visualAd==="cover_ads"} fallback={<OttArtwork sources={[track.displayed.cover]} programSeal={p.programSeal} />} /><button className="ott-album-like" disabled={track.phase !== "idle"} onClick={() => void likeSong()} aria-label="Curtir música" aria-pressed={likeSelected}>
    <Heart aria-hidden="true" className="ott-album-heart" style={{fill:likeSelected?"currentColor":"none"}}/>
    {burstSong === songKey && <span className="ott-like-burst nexo-like-floating-hearts" aria-hidden="true">
     {/* NEXO_CORACAO_FLOAT_LIVE_20261121_V1: coracoes flutuantes, somente apos curtida confirmada. */}
     {[
      [-78, 300, 0, .77, -24], [46, 338, 35, .90, 28],
      [103, 270, 65, .66, -24], [-32, 375, 95, 1.00, 30],
      [72, 350, 120, .84, -22], [-104, 320, 155, .68, 18],
      [18, 415, 175, .97, -34], [-65, 355, 205, .86, 25],
      [123, 320, 225, .60, -21], [-9, 440, 255, 1.08, 33],
      [-118, 378, 280, .74, -27], [67, 420, 305, .95, 23],
      [-45, 455, 335, .88, -31], [35, 470, 375, 1.08, 26],
     ].map(([x, rise, delay, size, sway], index) => (
      <Heart key={index} className="nexo-live-heart" aria-hidden="true" fill="currentColor" strokeWidth={0}
       style={{
        "--float-x1": `calc(${Math.round(x * .14)} * var(--ott-u))`,
        "--float-x2": `calc(${Math.round(x * .55 + sway)} * var(--ott-u))`,
        "--float-x3": `calc(${Math.round(x * .82 - sway * .45)} * var(--ott-u))`,
        "--float-x4": `calc(${x} * var(--ott-u))`,
        "--float-rise": `calc(${rise} * var(--ott-u))`,
        "--float-delay": `${delay}ms`,
        "--float-duration": `${1370 + index * 24}ms`,
        "--float-scale": size,
       } as CSSProperties}
       onAnimationEnd={index === 13 ? () => setBurstSong(current => current === songKey ? null : current) : undefined}
      />
     ))}
    </span>}
   </button></div><section><span className="ott-eyebrow ott-playing-label">tocando</span><h1>{track.displayed.title}</h1><p>{track.displayed.subtitle}</p>{!p.video && <OttAudioSpectrum media={p.audioMedia} variant="ribbon" />}</section></div>
 );
 return <OttFrame root={root} className={`ott-watch-controls ${p.video ? "ott-video":"ott-audio ott-home-gradient"}${p.video && p.videoChannels?.length ? " ott-positiva-multivideo" : ""}${panel ? " ott-presenter-centered" : ""}${panel === "weather" ? " ott-weather-open" : ""}`} loading={!p.video && !!p.buffering && !p.playing && !hasPlayed.current && !Boolean(p.cover?.trim() || songTitle?.trim() || p.currentProgram?.nome?.trim())} skeletonVariant="watch">
 <ProgramReminderToast/>
  {!p.video && <OttCommercialSlot radioId={p.radioUserId} programId={p.currentProgram?.id} placement="background_ads" visible={visualAd==="background_ads"} fallback={<OttWatchArtistCycle artist={/^(break|hora certa)$/i.test(songTitle?.trim() || "") ? null : songArtist} />} />}
  {!p.video && <OttPresenterBackdrop key={p.programKey} photos={p.presenterPhotos?.length ? p.presenterPhotos : p.presenterPhoto ? [p.presenterPhoto] : []} />}
  <div ref={overlay} className="ott-watch-surface" onPointerDown={()=>{if(!visible){setVisible(true);setActivity(v=>v+1);}}}>
   {p.video&&p.buffering&&!p.unavailable&&!p.playbackBlocked&&!p.commercialPlayback&&!hasPlayed.current&&<div className="nexo-lote14-watch-pending" role="status" aria-label="Carregando vídeo"><span className="nexo-lote14-bone"/><span className="nexo-lote14-bone"/></div>}
   {!p.video && nowPlaying}
   <OttCommercialSlot radioId={p.radioUserId} programId={p.currentProgram?.id} placement="pause_ads" visible={pauseAd} />
   <OttCommercialSlot radioId={p.radioUserId} programId={p.currentProgram?.id} placement="splash_sponsor" visible={splashAd&&!pauseAd} />
   <div className="ott-watch-chrome" data-controls-phase={controlsPhase} aria-hidden={!showChrome} data-video-tray-open={videoTrayFocused||videoTrayHovered} style={{visibility:controlsPhase === "hidden" ? "hidden":"visible",pointerEvents:showChrome&&!leaving ? "auto":"none"}}>
    {p.video && !shortcutsOpen && !panel && p.channelKey !== "nexo-positiva-twitch" && p.musicTitle && <div className="ott-video-now-playing"><OttArtwork className="ott-video-now-cover" sources={[cover]} programSeal={p.programSeal}/><section><span className="ott-eyebrow ott-playing-label">tocando</span><h2>{songTitle}</h2><p>{songArtist}</p></section></div>}
    <header className="ott-watch-header">{p.logo ? <NexoLoadingImage src={p.logo} alt={p.radioName||"Emissora"}/>:<OttBrand/>}<span>{p.radioName}</span><span className="ott-channel-type">{p.video ? "Vídeo" : "Áudio"}</span><span className="ott-live-label"><i/> AO VIVO</span><NexoTvClimateHeader radioUserId={p.radioUserId} />{(p.onProfile || p.renderProfile) && <button ref={profileButtonRef} className="ott-account" onClick={() => {
     // All TV screens must open the same profile page, not an inline popup.
     p.onProfile?.();
    }} aria-label="Perfil"><OttAvatar src={p.avatar}/></button>}</header>

    <div className="nexo-lote12-watch-sponsor" hidden={shortcutsOpen || !!panel}>{!p.video && <OttCommercialSlot radioId={p.radioUserId} programId={p.currentProgram?.id} placement="naming_rights" visible={visualAd==="naming_rights"} fallback={<OttProgramSponsors radioUserId={p.radioUserId} programId={p.currentProgram?.id} variant="audio" />} />}{p.video && <OttProgramSponsors radioUserId={p.radioUserId} programId={p.currentProgram?.id} variant="audio" />}</div>
    <footer className="ott-watch-footer" data-nexo-box-open={panel !== null ? "true" : "false"} data-shortcuts-open={shortcutsOpen}>
     <button className="ott-watch-back" onClick={leave} aria-label="Voltar ao início">
      <ChevronLeft aria-hidden="true" className="ott-watch-back-icon"/><House aria-hidden="true" className="ott-watch-home-icon"/>
     </button>
     <OttInteractionCards {...{shortcutsOpen,activePanel,firstShortcutRef,selectedRef,closePanel,setPanelClosing,setPanel,closeShortcuts,hasActivePoll}} />
     <div className="ott-transport"><button data-ott-initial={!p.video ? true : undefined} className="ott-play" onClick={p.onPlay} aria-label={p.playing ? "Pausar":"Reproduzir"}>{p.buffering && !p.unavailable && !p.playbackBlocked ? <Loader2 className="animate-spin"/>:p.playing ? <Pause/>:<Play/>}</button></div>
     {<div data-positiva-program-visible={positivaProgramVisible ? "true" : "false"} className="ott-watch-program">
      {p.channelKey === "nexo-positiva-twitch" ? <><span className="ott-channel-type">Agora</span><div className="ott-watch-program-info"><strong>Positiva Cast</strong></div></> : p.currentProgram && <>
       <span className="ott-channel-type">Agora</span>
       <div className="ott-watch-program-info">
        <strong title={p.currentProgram.nome}>{p.currentProgram.nome}</strong>
        <div className="ott-watch-program-meta">
         <span>{programHours(p.currentProgram)}</span>
         {displayPresenter && <span className="ott-watch-presenter" title={displayPresenter}>
          <span key={displayPresenter} className={`ott-watch-presenter-swap${presenterExiting ? " is-exiting" : ""}`}>
           <MicVocal aria-hidden="true"/><span>{displayPresenter}</span>
          </span>
         </span>}
        </div>
       </div>
      </>}
      
     </div>}
     <div className="ott-tools">
      {!shortcutsOpen && <button ref={scheduleButtonRef} className="ott-watch-schedule-button ott-tools-programming" aria-label="Abrir programação" aria-haspopup="dialog" aria-expanded={scheduleOpen} onClick={() => { modalTrigger.current = scheduleButtonRef.current; setModal("schedule"); }}>
       <span>programação</span><CalendarDays aria-hidden="true"/>
      </button>}
      
<OttInteractionToggle {...{toggleRef,shortcutsOpen,closeShortcuts,hasActivePoll}} openShortcuts={()=>setShortcutsOpen(true)}/>
     </div>    </footer>
    {p.video && !!p.videoChannels?.length && !shortcutsOpen && !panel && (
     <nav className="ott-positiva-channel-tray" aria-label="Escolher canal de vídeo"
      onPointerEnter={()=>setVideoTrayHovered(true)} onPointerLeave={()=>setVideoTrayHovered(false)}
      onFocusCapture={() => {setVideoTrayFocused(true);setVisible(true);setActivity(value=>value+1);}}
      onBlurCapture={event => {if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setVideoTrayFocused(false);}}>
      <div className="ott-positiva-channel-track">{p.videoChannels.map(channel => (
       <button type="button" key={channel.id} className="ott-positiva-channel-card"
        aria-disabled={!channel.available}
        aria-label={channel.available ? "Assistir " + channel.label : channel.label + " — transmissão ainda não cadastrada"}
        aria-pressed={p.channelKey === channel.id}
        
        onClick={() => {if(channel.available) p.onSelectVideoChannel?.(channel.id);else setMissingChannel(true);}}>
        <NexoLoadingImage src={channel.cover} alt="" loading="eager"/>
        <span className="ott-positiva-channel-title" aria-hidden="true">{channel.label}</span>
        <span className="nexo-v16-live-status" data-live={channel.liveStatus === "live"} aria-hidden="true">{channel.liveStatus === "live" ? "ao vivo agora" : !channel.available || channel.liveStatus === "offline" ? "sem transmissão no momento" : "status indisponível"}</span>
       </button>
      ))}</div>
     </nav>
    )}
    {panel && <OttInteractionPanel key={panel} {...{panel,panelClosing,setPanel,panelBackRef,closePanel}} owner={p.radioUserId} programId={p.currentProgram?.id} title={p.musicTitle||p.title} artist={p.musicArtist||p.subtitle} canVote={!p.guest} loadHistoryCover={p.loadHistoryCover}/>}
    <button className="ott-channel-up" onClick={()=>p.onChannel(-1)} aria-label="Canal anterior"><ChevronUp/></button>
    <button className="ott-open-schedule" onClick={()=>p.onChannel(1)} aria-label="Próximo canal"><ChevronDown/></button>
   </div>
  </div>
  {offlineOpen && <div className="ott-stream-offline-scrim"><section className="ott-stream-offline" role="dialog" aria-modal="true" aria-labelledby="ott-stream-offline-title"><header><h2 id="ott-stream-offline-title">Canal indisponível</h2></header><p>No momento este canal está indisponível. Volte mais tarde.</p><button type="button" data-ott-initial ref={offlineOk} className="ott-stream-offline-ok" onClick={dismissOffline}>OK</button></section></div>}
  {modal && !offlineOpen && <div className="ott-modal-scrim" data-nexo-schedule={scheduleOpen ? "true" : undefined} onClick={event => {
   if (event.target === event.currentTarget) closeModal();
  }}>
   {scheduleOpen ? <NexoTvScheduleGridPortraits programs={p.programs} presenters={p.presenters} studio={p.studio} currentProgramId={p.currentProgram?.id} onClose={closeModal} /> : <section role="dialog" aria-modal="true" aria-label="Perfil">
    {p.renderProfile?.(closeModal)}
   </section>}
  </div>}
 </OttFrame>;
}
