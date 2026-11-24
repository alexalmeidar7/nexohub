import { supabase } from "@/integrations/supabase/client";
import { useRef, useEffect, useState } from "react";
import {
  Apple, ChevronLeft, ChevronRight, ExternalLink, Facebook, Globe2, Instagram, Link as LinkIcon,
  MapPin, MessageCircle, Mic2, Smartphone, Youtube,
} from "lucide-react";
import { type LinkBioConfig, type LinkBioOnAir, normalizeLinkBioWhatsApp, normalizeLinkBioUrl } from "@/lib/linkBio";

interface Props {
  config: LinkBioConfig;
  onAir: LinkBioOnAir | null;
  preview?: boolean;
}
function safeLink(value: string): string {
  if (/^\+?\d[\d\s()+-]{8,19}$/.test(value.trim())) {
    const digits = value.replace(/\D/g, "");
    return digits.length >= 10 && digits.length <= 15 ? "https://wa.me/" + digits : "";
  }
  return normalizeLinkBioUrl(value);
}
function BioButton({ title, href, icon: Icon, background, onClick, preview = false }: {
  title: string;
  href?: string;
  icon: typeof Globe2;
  background: string;
  onClick?: () => void;
  preview?: boolean;
}) {
  const url = safeLink(href || "");
  const active = Boolean(url || onClick);
  const css = "group flex min-h-[52px] w-full items-center gap-3 rounded-full px-4 py-2 text-left " +
    "transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99] sm:min-h-[60px] sm:px-3";
  const content = <>
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full bg-[#270000] text-white sm:h-[36px] sm:w-[36px]">
      <Icon size={20} strokeWidth={2.6} className="sm:h-5 sm:w-5"/>
    </span>
    <span className="min-w-0 flex-1 truncate text-[clamp(17px,5vw,22px)] font-extrabold tracking-tight text-white">{title}</span>
    <ExternalLink size={16} className="shrink-0 text-white/50 opacity-0 transition-opacity group-hover:opacity-100"/>
  </>;
  const style = { backgroundColor: background, opacity: active || preview ? 1 : 0.6 };
  if (onClick) return <button type="button" onClick={onClick} disabled={!active} className={css} style={style}>{content}</button>;
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" className={css} style={style}>{content}</a> :
    <div aria-disabled="true" className={css + " cursor-not-allowed"} style={style} title="Link ainda não configurado">{content}</div>;
}
function SocialIcon({ label, url, icon: Icon, preview = false }: {
  label: string; url: string; icon: typeof Instagram; preview?: boolean;
}) {
  const normalized = safeLink(url);
  const inner = <Icon className="h-[25px] w-[25px] sm:h-[24px] sm:w-[24px]" strokeWidth={2.4}/>;
  const common = "flex h-[38px] w-[38px] items-center justify-center rounded-full bg-[#310000] text-white transition-transform hover:scale-105 sm:h-[42px] sm:w-[42px]";
  if (normalized) return <a className={common} href={normalized} rel="noopener noreferrer" target="_blank" aria-label={label}>{inner}</a>;
  if (preview) return <span title={label + " não configurado"} className={common + " opacity-45"}>{inner}</span>;
  return null;
}

function LinkBioFitLabelV10({label}: {label: string}) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!el || !parent) return;
    let alive = true;
    const fit = () => {
      if (!alive || !parent.clientWidth) return;
      el.style.fontSize = "";
      parent.style.width = "100%";
      parent.style.minWidth = "0";
      const base = parseFloat(window.getComputedStyle(el).fontSize);
      const required = el.getBoundingClientRect().width;
      if (required > parent.clientWidth && base > 0) el.style.fontSize = (base * parent.clientWidth / required * .96) + "px";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(parent);
    document.fonts?.ready.then(fit);
    return () => { alive = false; observer.disconnect(); };
  }, [label]);
  return <span ref={ref} style={{ display: "block", whiteSpace: "nowrap", width: "max-content" }}>{label}</span>;
}
function LinkBioOfferV14({ live, owner, preview }: { live: LinkBioOnAir | null; owner: string; preview: boolean }) {
  const programId = live?.isLive === false ? "" : live?.programIdV14 || "";
  const seal = programId ? normalizeLinkBioUrl(live?.programSealV14 || "") : "";
  const [result, setResult] = useState<{key:string; logos:{id:string;nome:string;logo_url:string}[]}>({key:"",logos:[]});
  const key = owner + ":" + programId;
  useEffect(() => {
    if (!programId || !owner) return;
    let active = true;
    const refresh = async () => {
      const query = new URLSearchParams({ slug: owner, section: "linkbio_sponsors", program_id: programId });
      const response = preview
        ? await supabase.from("logos_patrocinadores").select("id,nome,logo_url").eq("user_id",owner).eq("programa_id",programId).eq("ativo",true).eq("excluido",false).gte("data_final",new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())).order("id")
        : await supabase.functions.invoke("public-player-data?" + query.toString(), { method: "GET" });
      const rows = preview ? response.data : response.data?.logos;
      if (!active || response.error || !Array.isArray(rows)) return;
      const logos = (rows as {id:string;nome:string;logo_url:string}[]).filter(x => normalizeLinkBioUrl(x.logo_url));
      logos.forEach(x => { const img = new Image(); img.src = x.logo_url; });
      setResult({key,logos});
    };
    void refresh(); const timer = window.setInterval(()=>{if(document.visibilityState === "visible")void refresh();},60000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[key,owner,programId,preview]);
  const logos = result.key === key ? result.logos : [];
  const signature = logos.map(x=>x.id+":"+x.logo_url).join("|");
  const [index,setIndex]=useState(0);
  useEffect(()=>{setIndex(0);if(logos.length<2)return;const timer=window.setInterval(()=>setIndex(i=>(i+1)%logos.length),3000);return()=>window.clearInterval(timer);},[signature,logos.length]);
  const current = logos[index % (logos.length || 1)];
  return <section aria-label="Oferecimento do programa no ar" className="mx-auto mt-8 flex h-[150px] w-[84%] shrink-0 items-center gap-4">
    <style>{`@keyframes linkBioOfferFadeV14 {0%{opacity:0;transform:translateY(9px)} 17%,83%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(-7px)}} @media(prefers-reduced-motion:reduce){.linkBioOfferRotatingV14{animation:none!important}}`}</style>
    {seal && <div className="flex min-w-0 flex-1 items-center justify-center"><img src={seal} alt={"Selo de " + live?.programName} className="max-h-[110px] max-w-full object-contain"/></div>}
    {seal && current && <span className="h-[55px] w-px shrink-0 bg-white"/>}
    {current && <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2"><span className="text-xs font-semibold text-white">oferecimento</span><div className="flex h-[82px] w-full items-center justify-center"><img key={current.id+current.logo_url} src={current.logo_url} alt={current.nome} className="linkBioOfferRotatingV14 max-h-full max-w-full object-contain" style={{animation:logos.length>1?"linkBioOfferFadeV14 3000ms ease-in-out both":"none"}}/></div></div>}
  </section>;
}
export default function LinkBioVisual({ config, onAir: liveOnAir, preview = false }: Props) {
  const [storesOpen, setStoresOpen] = useState(false);
  // linkBioScheduleV8: navigation is independent of presenter rotation.
  const [selectedProgramId, setSelectedProgramId] = useState<string | null>(null);
  const schedule = liveOnAir?.schedule || [];
  const selected = schedule.find(p=>p.scheduleId===selectedProgramId);
  const onAir = selected || liveOnAir;
  const currentIndex = schedule.findIndex(p=>p.scheduleId===onAir?.scheduleId);
  const [pendingProgram, setPendingProgram] = useState<{id: string; direction: number} | null>(null);
  const [programDirection, setProgramDirection] = useState(1);
  useEffect(() => {
    if (!pendingProgram) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      setProgramDirection(pendingProgram.direction);
      setSelectedProgramId(pendingProgram.id === liveOnAir?.scheduleId ? null : pendingProgram.id);
      setPendingProgram(null);
    }, reduced ? 0 : 200);
    return () => window.clearTimeout(timer);
  }, [pendingProgram, liveOnAir?.scheduleId]);
  const moveProgram = (delta: number) => {
    if (schedule.length < 2 || pendingProgram) return;
    const next = schedule[((currentIndex < 0 ? 0 : currentIndex) + delta + schedule.length) % schedule.length];
    setPendingProgram({id: next.scheduleId, direction: delta});
  };
  const people = onAir?.presenters?.length ? onAir.presenters : onAir ? [{ id: "primary", name: onAir.presenterName, photo: onAir.presenterPhoto }] : [];
  const rosterKey = JSON.stringify([onAir?.programName, onAir?.start, people.map(p => [p.id, p.name, p.photo])]);
  const [rotation, setRotation] = useState({ key: "", index: 0 });
  const index = rotation.key === rosterKey ? rotation.index % Math.max(people.length, 1) : 0;
  const activePresenter = people[index];
  const rotating = people.length > 1;
  useEffect(() => {
    const roster = JSON.parse(rosterKey)[2] as string[][];
    setRotation({ key: rosterKey, index: 0 });
    for (const [, , photo] of roster) { if (photo) { const img = new Image(); img.src = photo; } }
    if (roster.length < 2) return;
    const timer = window.setInterval(() => setRotation(prev => ({ key: rosterKey, index: (prev.index + 1) % roster.length })), 4000);
    return () => window.clearInterval(timer);
  }, [rosterKey]);
  const appStore = safeLink(config.ios_store_url);
  const googlePlay = safeLink(config.android_store_url);
  const appEnabled = Boolean(appStore || googlePlay);
  const hasSocial = Boolean(safeLink(config.instagram_url) || safeLink(config.facebook_url) || safeLink(config.youtube_url)) || preview;
  const name = config.station_name || "A sua rádio";
  return (
    <div
      className="relative isolate min-h-svh overflow-hidden text-white"
      style={{
        background: "radial-gradient(ellipse 90% 58% at 16% 100%, " + config.background_bottom +
          " 0%, transparent 88%), linear-gradient(180deg, " + config.background_top +
          " 0%, #330000 40%, " + config.background_bottom + " 100%)",
      }}
    >
      <div className="relative mx-auto flex min-h-svh w-full max-w-[440px] flex-col px-4 pb-8 pt-5 sm:px-7 sm:pt-5">
        <style>{`@keyframes linkBioProgramInV9 { from { opacity:0; transform:translateX(calc(var(--bio-direction,1) * 12px)); } to { opacity:1; transform:translateX(0); } }
@keyframes linkBioProgramOutV9 { from { opacity:1; transform:translateX(0); } to { opacity:0; transform:translateX(calc(var(--bio-direction,1) * -12px)); } }
.linkBioProgramEnterV9 { animation: linkBioProgramInV9 420ms cubic-bezier(.16,1,.3,1) both; }
.linkBioProgramExitV9 { animation: linkBioProgramOutV9 200ms ease-in both; }
.linkBioProgramV9 h1 { display:-webkit-box; -webkit-box-orient:vertical; -webkit-line-clamp:3; overflow:hidden; }
@media (prefers-reduced-motion:reduce) { .linkBioProgramV9 { animation:none!important; } }
@keyframes linkBioPortraitSmoothV6 {
  0% { transform: translate3d(0,65%,0); opacity: 0; animation-timing-function: cubic-bezier(.16,1,.3,1); }
  17%, 83% { transform: translate3d(0,0,0); opacity: 1; }
  83% { animation-timing-function: cubic-bezier(.4,0,.8,.35); }
  100% { transform: translate3d(0,65%,0); opacity: 0; }
} @keyframes linkBioNameSmoothV6 {
  0% { transform: translate3d(0,7px,0); opacity: 0; animation-timing-function: cubic-bezier(.16,1,.3,1); }
  17%, 83% { transform: translate3d(0,0,0); opacity: 1; }
  83% { animation-timing-function: cubic-bezier(.4,0,.8,.35); }
  100% { transform: translate3d(0,5px,0); opacity: 0; }
} @media (prefers-reduced-motion: reduce) { [style*="linkBioPortraitSmoothV6"], [style*="linkBioNameSmoothV6"] { animation: none !important; } }`}</style>
        <div className="mx-auto flex min-h-[110px] w-[74%] items-center justify-center sm:min-h-[100px] linkBioLogoV11 shrink-0" style={{ marginBottom: 8 }}>
          {config.logo_url && (safeLink(config.logo_url) || (preview && config.logo_url.startsWith("data:image/png;base64,"))) ? (
            <img src={preview && config.logo_url.startsWith("data:image/png;base64,") ? config.logo_url : safeLink(config.logo_url)} loading="eager" alt={"Logo " + name}
              className="max-h-24 w-auto max-w-full object-contain drop-shadow-[0_12px_12px_rgba(0,0,0,0.25)]"/>
          ) : (
            <div className="flex items-center gap-2 text-center text-3xl font-black text-white">
              <Globe2 size={29} className="shrink-0"/>{name}
            </div>
          )}
        </div>
        {/* Hero mirrors the approved reference: presenter cutout at left, live show at right. */}
        <section className="relative overflow-hidden mb-[-4px] h-[168px] shrink-0 sm:h-[188px]" aria-label="Programa no ar">
          {schedule.length > 1 && <>
            <button type="button" aria-label="Programa anterior" disabled={Boolean(pendingProgram)} onClick={() => moveProgram(-1)} className="absolute left-0 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white"><ChevronLeft size={20}/></button>
            <button type="button" aria-label="Próximo programa" disabled={Boolean(pendingProgram)} onClick={() => moveProgram(1)} className="absolute right-0 top-1/2 z-30 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/70 focus-visible:ring-2 focus-visible:ring-white"><ChevronRight size={20}/></button>
          </>}
          <div key={onAir?.scheduleId || onAir?.programName || "station"} className={"linkBioProgramV9 absolute inset-y-0 overflow-hidden " + (pendingProgram ? "linkBioProgramExitV9" : "linkBioProgramEnterV9")} style={{ left: schedule.length > 1 ? 38 : 0, right: schedule.length > 1 ? 38 : 0, "--bio-direction": pendingProgram?.direction || programDirection } as import("react").CSSProperties}>
          {activePresenter?.photo && (
            <img
              key={rosterKey + index}
              src={activePresenter.photo}
              alt={activePresenter.name ? "Foto de " + activePresenter.name : "Apresentador no ar"}
              loading="eager"
              className="pointer-events-none absolute bottom-0 left-0 h-[96%] w-[42%] object-contain object-bottom"
              style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.16))", animation: rotating ? "linkBioPortraitSmoothV6 4s linear both" : undefined }}
            />
          )}
          <div className={"absolute inset-y-0 right-0 flex w-[58%] flex-col justify-center pb-2 pl-1 " +
            (!activePresenter?.photo ? "!w-full items-center pl-0 text-center" : "")}>
            <div className="mb-1 text-[clamp(13px,3.6vw,17px)] font-black tracking-tight sm:mb-1" style={{ color: config.button_color }}>
              <LinkBioFitLabelV10 label={onAir ? (onAir.isLive === false ? (onAir.hasEndedV10 ? "já foi" : "hoje na " + name) : "agora no ar:") : "nossa programação"}/>
            </div>
            <h1 title={onAir?.programName || name} className="break-words text-[clamp(16px,4vw,21px)] font-light leading-[1.03] tracking-tight text-white line-clamp-3 [overflow-wrap:anywhere]">
              {onAir?.programName || name}
            </h1>
            {onAir && (onAir.start || onAir.end) && (
              <div className="mt-1 text-[11px] font-normal text-white/95 sm:mt-1.5">
                {onAir.start || "--:--"}/{onAir.end || "--:--"}
              </div>
            )}
            {activePresenter?.name && (
              <div className="mt-2 inline-flex min-h-[22px] max-w-full items-center gap-2 rounded-full py-1 pl-3 pr-4 sm:mt-1.5 sm:min-h-[22px] w-fit self-start" style={{ background: config.button_color, width: "fit-content", alignSelf: "flex-start" }}>
                <Mic2 size={14} strokeWidth={2.7} className="shrink-0 text-white"/>
                <span className="truncate text-[11px] font-extrabold tracking-tight text-[#230000]">
                  <span key={rosterKey + index} style={{ display: "block", animation: rotating ? "linkBioNameSmoothV6 4s linear both" : undefined }}>{activePresenter.name}</span>
                </span>
              </div>
            )}
          </div>
        
          </div>
        </section>

        {/* The black link deck, four red pills, social tray and bottom station mark. */}
        <main className="relative z-10 rounded-[31px] bg-gradient-to-b from-[#490000] via-[#1a0000] to-[#000000] px-4 pb-7 pt-6 sm:rounded-[22px] sm:px-6 sm:pb-6 sm:pt-6">
          <nav aria-label="Links da rádio" className="flex flex-col gap-1.5 sm:gap-1.5">
            <BioButton title="whats estúdio" href={normalizeLinkBioWhatsApp(config.whatsapp_url)} icon={MessageCircle} background={config.button_color} preview={preview}/>
            <BioButton title="site" href={config.site_url} icon={LinkIcon} background={config.button_color} preview={preview}/>
            <BioButton title="localização" href={config.map_url} icon={MapPin} background={config.button_color} preview={preview}/>
            <BioButton title="app" icon={Smartphone} background={config.button_color}
              preview={preview} onClick={appEnabled ? () => setStoresOpen(previous => !previous) : undefined}/>
          </nav>
          {storesOpen && appEnabled && (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded-2xl bg-black/60 p-3 sm:grid-cols-2" aria-label="Baixar aplicativo">
              {appStore && <a href={appStore} target="_blank" rel="noopener noreferrer"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#200000] hover:bg-slate-100">
                <Apple size={20}/> App Store
              </a>}
              {googlePlay && <a href={googlePlay} target="_blank" rel="noopener noreferrer"
                className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-4 text-sm font-bold text-[#200000] hover:bg-slate-100">
                <Smartphone size={20}/> Google Play
              </a>}
            </div>
          )}
          {hasSocial && <div className="mx-auto mt-4 flex w-fit items-center justify-center gap-2 rounded-full px-2 py-2 sm:mt-2 sm:px-2"
            style={{ backgroundColor: config.button_color }}>
            <SocialIcon label="Instagram" url={config.instagram_url} icon={Instagram} preview={preview}/>
            <SocialIcon label="Facebook" url={config.facebook_url} icon={Facebook} preview={preview}/>
            <SocialIcon label="YouTube" url={config.youtube_url} icon={Youtube} preview={preview}/>
          </div>}
        </main>

        <LinkBioOfferV14 live={liveOnAir} owner={config.user_id} preview={preview}/>

      </div>
    </div>
  );
}
