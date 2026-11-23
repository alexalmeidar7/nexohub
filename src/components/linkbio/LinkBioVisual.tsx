import { useState } from "react";
import {
  Apple, ExternalLink, Facebook, Globe2, Instagram, Link as LinkIcon,
  MapPin, MessageCircle, Mic2, Smartphone, Youtube,
} from "lucide-react";
import { type LinkBioConfig, type LinkBioOnAir, normalizeLinkBioUrl } from "@/lib/linkBio";

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
  const active = Boolean(href || onClick);
  const css = "group flex min-h-[63px] w-full items-center gap-3 rounded-full px-4 py-2 text-left " +
    "transition-transform duration-150 hover:-translate-y-0.5 active:scale-[0.99] sm:min-h-[76px] sm:px-5";
  const content = <>
    <span className="flex h-[45px] w-[45px] shrink-0 items-center justify-center rounded-full bg-[#270000] text-white sm:h-[54px] sm:w-[54px]">
      <Icon size={25} strokeWidth={2.6} className="sm:h-7 sm:w-7"/>
    </span>
    <span className="min-w-0 flex-1 truncate text-[clamp(19px,5.3vw,31px)] font-extrabold tracking-tight text-white">{title}</span>
    <ExternalLink size={16} className="shrink-0 text-white/50 opacity-0 transition-opacity group-hover:opacity-100"/>
  </>;
  const style = { backgroundColor: background, opacity: active || preview ? 1 : 0.6 };
  if (onClick) return <button type="button" onClick={onClick} disabled={!active} className={css} style={style}>{content}</button>;
  const url = safeLink(href || "");
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" className={css} style={style}>{content}</a> :
    <div aria-disabled="true" className={css + " cursor-not-allowed"} style={style} title="Link ainda não configurado">{content}</div>;
}
function SocialIcon({ label, url, icon: Icon, preview = false }: {
  label: string; url: string; icon: typeof Instagram; preview?: boolean;
}) {
  const normalized = safeLink(url);
  const inner = <Icon className="h-[25px] w-[25px] sm:h-[31px] sm:w-[31px]" strokeWidth={2.4}/>;
  const common = "flex h-[53px] w-[53px] items-center justify-center rounded-full bg-[#310000] text-white transition-transform hover:scale-105 sm:h-[65px] sm:w-[65px]";
  if (normalized) return <a className={common} href={normalized} rel="noopener noreferrer" target="_blank" aria-label={label}>{inner}</a>;
  if (preview) return <span title={label + " não configurado"} className={common + " opacity-45"}>{inner}</span>;
  return null;
}

export default function LinkBioVisual({ config, onAir, preview = false }: Props) {
  const [storesOpen, setStoresOpen] = useState(false);
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
      <div className="relative mx-auto flex min-h-svh w-full max-w-[620px] flex-col px-4 pb-8 pt-5 sm:px-7 sm:pt-9">
        {/* Hero mirrors the approved reference: presenter cutout at left, live show at right. */}
        <section className="relative mb-[-4px] h-[242px] shrink-0 sm:h-[320px]" aria-label="Programa no ar">
          {onAir?.presenterPhoto && (
            <img
              src={onAir.presenterPhoto}
              alt={onAir.presenterName ? "Foto de " + onAir.presenterName : "Apresentador no ar"}
              loading="eager"
              className="pointer-events-none absolute bottom-0 left-[-3%] h-[97%] w-[58%] object-contain object-bottom"
              style={{ filter: "drop-shadow(0 12px 28px rgba(0,0,0,0.16))" }}
            />
          )}
          <div className={"absolute inset-y-0 right-0 flex w-[59%] flex-col justify-center pb-5 pl-3 " +
            (!onAir?.presenterPhoto ? "w-full items-center pl-0 text-center" : "")}>
            <div className="mb-2 text-[clamp(16px,4.5vw,28px)] font-black tracking-tight text-[#ff191f] sm:mb-3">
              {onAir ? "agora no ar:" : "nossa programação"}
            </div>
            <h1 className="break-words text-[clamp(27px,7vw,47px)] font-light leading-[1.03] tracking-tight text-white">
              {onAir?.programName || name}
            </h1>
            {onAir && (onAir.start || onAir.end) && (
              <div className="mt-2 text-[clamp(15px,3.2vw,23px)] font-normal text-white/95 sm:mt-3">
                {onAir.start || "--:--"}/{onAir.end || "--:--"}
              </div>
            )}
            {onAir?.presenterName && (
              <div className="mt-4 inline-flex min-h-[41px] max-w-full items-center gap-2 rounded-full py-1 pl-3 pr-4 sm:mt-6 sm:min-h-[49px]"
                style={{ background: config.button_color }}>
                <Mic2 size={22} strokeWidth={2.7} className="shrink-0 text-white"/>
                <span className="truncate text-[clamp(14px,3.6vw,23px)] font-extrabold tracking-tight text-[#230000]">
                  {onAir.presenterName}
                </span>
              </div>
            )}
          </div>
        </section>

        {/* The black link deck, four red pills, social tray and bottom station mark. */}
        <main className="relative z-10 rounded-[31px] bg-gradient-to-b from-[#490000] via-[#1a0000] to-[#000000] px-4 pb-7 pt-6 sm:rounded-[39px] sm:px-9 sm:pb-9 sm:pt-9">
          <nav aria-label="Links da rádio" className="flex flex-col gap-3 sm:gap-3.5">
            <BioButton title="whats estúdio" href={config.whatsapp_url} icon={MessageCircle} background={config.button_color} preview={preview}/>
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
          {hasSocial && <div className="mx-auto mt-4 flex w-fit items-center justify-center gap-3 rounded-full px-3 py-3 sm:mt-5 sm:px-4"
            style={{ backgroundColor: config.button_color }}>
            <SocialIcon label="Instagram" url={config.instagram_url} icon={Instagram} preview={preview}/>
            <SocialIcon label="Facebook" url={config.facebook_url} icon={Facebook} preview={preview}/>
            <SocialIcon label="YouTube" url={config.youtube_url} icon={Youtube} preview={preview}/>
          </div>}
        </main>

        <div className="mx-auto mt-6 flex min-h-[110px] w-[74%] items-center justify-center sm:mt-8 sm:min-h-[148px]">
          {config.logo_url && safeLink(config.logo_url) ? (
            <img src={safeLink(config.logo_url)} loading="lazy" alt={"Logo " + name}
              className="max-h-36 w-auto max-w-full object-contain drop-shadow-[0_12px_12px_rgba(0,0,0,0.25)]"/>
          ) : (
            <div className="flex items-center gap-2 text-center text-3xl font-black text-white">
              <Globe2 size={29} className="shrink-0"/>{name}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
