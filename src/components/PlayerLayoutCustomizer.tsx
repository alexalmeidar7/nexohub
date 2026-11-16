import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { GradientPicker } from "@/components/ui/GradientPicker";
import { Slider } from "@/components/ui/slider";
import { Palette, Save, RotateCcw, Loader2, Monitor, Play, Home, Tv, Film, LogIn, Image, Paintbrush, Music } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { mergeUserDashboardItems } from "@/lib/userSettings";

/* ── Background Config ── */
export type BgType = "solid" | "image" | "gradient";
export type GradientType = "linear" | "radial";
export type GradientPosition = "top" | "top-right" | "right" | "bottom-right" | "bottom" | "bottom-left" | "left" | "top-left" | "center";

export interface ScreenBgConfig {
  bgType: BgType;
  bgImage: string;
  gradientType: GradientType;
  gradientColor1: string;
  gradientColor2: string;
  gradientPosition: GradientPosition;
  gradientAngle: number; // for linear
  gradientMidpoint: number; // 0-100, where color transition happens
}

export const defaultScreenBg: ScreenBgConfig = {
  bgType: "solid",
  bgImage: "",
  gradientType: "linear",
  gradientColor1: "#000000",
  gradientColor2: "#1a1a1a",
  gradientPosition: "center",
  gradientAngle: 135,
  gradientMidpoint: 50,
};

export type ScreenBgConfigs = Record<ScreenTab, ScreenBgConfig>;

const positionLabels: Record<GradientPosition, string> = {
  "top-left": "↖ Sup. Esq.", "top": "↑ Superior", "top-right": "↗ Sup. Dir.",
  "left": "← Esquerda", "center": "● Centro", "right": "→ Direita",
  "bottom-left": "↙ Inf. Esq.", "bottom": "↓ Inferior", "bottom-right": "↘ Inf. Dir.",
};

const positionToCSS: Record<GradientPosition, string> = {
  "top-left": "at top left", "top": "at top center", "top-right": "at top right",
  "left": "at center left", "center": "at center", "right": "at center right",
  "bottom-left": "at bottom left", "bottom": "at bottom center", "bottom-right": "at bottom right",
};

export function buildBgStyle(solidColor: string, bgCfg?: ScreenBgConfig): React.CSSProperties {
  if (!bgCfg || bgCfg.bgType === "solid") return { backgroundColor: solidColor };
  if (bgCfg.bgType === "image" && bgCfg.bgImage) return { backgroundImage: `url(${bgCfg.bgImage})`, backgroundSize: "cover", backgroundPosition: "center" };
  if (bgCfg.bgType === "gradient") {
    const mid = bgCfg.gradientMidpoint ?? 50;
    if (bgCfg.gradientType === "linear") return { background: `linear-gradient(${bgCfg.gradientAngle}deg, ${bgCfg.gradientColor1} 0%, ${bgCfg.gradientColor2} ${mid}%)` };
    return { background: `radial-gradient(ellipse ${positionToCSS[bgCfg.gradientPosition]}, ${bgCfg.gradientColor1} 0%, ${bgCfg.gradientColor2} ${mid}%)` };
  }
  return { backgroundColor: solidColor };
}

/* ── Player Color Schema ── */
export interface PlayerColors {
  // Global brand accent used as the source for the Player's red highlights.
  dominantColor: string;
  // Loading Screen
  loadingBg: string;
  loadingSpinner: string;
  loadingText: string;
  // Login/Access Screen
  loginBg: string;
  loginCardBg: string;
  loginButtonBg: string;
  loginButtonText: string;
  loginText: string;
  loginSubtext: string;
  // Home Screen
  homeBg: string;
  homeText: string;
  homeAccent: string;
  homeSectionTitle: string;
  homeCardBg: string;
  homeCardText: string;
  homeCardBorder: string;
  homeBadgeBg: string;
  homeBadgeText: string;
  homeBannerOverlay: string;
  // Live Channels
  liveBg: string;
  liveCardBg: string;
  liveCardText: string;
  liveCardBorder: string;
  liveAccent: string;
  liveBadgeBg: string;
  liveBadgeText: string;
  liveControlBg: string;
  liveControlText: string;
  liveControlIcon: string;
  // Audio Channel Settings
  liveAudioBgMode: string; // "thumb" | "cover" | "gradient"
  spectrumColor: string;
  liveAudioGradientColor1: string;
  liveAudioGradientColor2: string;
  liveAudioGradientType: string; // "linear" | "radial"
  liveAudioGradientPosition: string;
  liveAudioGradientAngle: number;
  liveAudioGradientMidpoint: number;
  // Watch / Player Controls
  watchTopBarBg: string;
  watchTopBarText: string;
  watchTopBarAccent: string;
  watchBottomBarBg: string;
  watchBottomBarText: string;
  watchScrubber: string;
  watchMusicBg: string;
  watchMusicText: string;
  watchMusicTitleColor: string;
  watchMusicArtistColor: string;
  watchMusicAccent: string;
  // Catalog / On Demand
  catalogBg: string;
  catalogText: string;
  catalogCardBg: string;
  catalogCardText: string;
  catalogAccent: string;
  catalogBadgeBg: string;
  catalogBadgeText: string;
  catalogPlayBg: string;
  catalogPlayText: string;
}

export const defaultPlayerColors: PlayerColors = {
  dominantColor: "#dc2626",
  loadingBg: "#000000",
  loadingSpinner: "#dc2626",
  loadingText: "#ffffff",
  loginBg: "#0a0a0a",
  loginCardBg: "#1a1a1a",
  loginButtonBg: "#dc2626",
  loginButtonText: "#ffffff",
  loginText: "#ffffff",
  loginSubtext: "#999999",
  homeBg: "#0a0a0a",
  homeText: "#ffffff",
  homeAccent: "#dc2626",
  homeSectionTitle: "#ffffff",
  homeCardBg: "#1a1a1a",
  homeCardText: "#ffffff",
  homeCardBorder: "#333333",
  homeBadgeBg: "#dc2626",
  homeBadgeText: "#ffffff",
  homeBannerOverlay: "#000000",
  liveBg: "#000000",
  liveCardBg: "#1a1a1a",
  liveCardText: "#ffffff",
  liveCardBorder: "#333333",
  liveAccent: "#dc2626",
  liveBadgeBg: "#dc2626",
  liveBadgeText: "#ffffff",
  liveControlBg: "#0a0a0a",
  liveControlText: "#ffffff",
  liveControlIcon: "#999999",
  liveAudioBgMode: "cover",
  spectrumColor: "#dc2626",
  liveAudioGradientColor1: "#dc2626",
  liveAudioGradientColor2: "#000000",
  liveAudioGradientType: "radial",
  liveAudioGradientPosition: "bottom",
  liveAudioGradientAngle: 135,
  liveAudioGradientMidpoint: 62,
  watchTopBarBg: "#000000cc",
  watchTopBarText: "#ffffff",
  watchTopBarAccent: "#dc2626",
  watchBottomBarBg: "#000000cc",
  watchBottomBarText: "#ffffff",
  watchScrubber: "#dc2626",
  watchMusicBg: "#000000ee",
  watchMusicText: "#ffffff",
  watchMusicTitleColor: "#ffffff",
  watchMusicArtistColor: "#ffffffd9",
  watchMusicAccent: "#dc2626",
  catalogBg: "#0a0a0a",
  catalogText: "#ffffff",
  catalogCardBg: "#1a1a1a",
  catalogCardText: "#ffffff",
  catalogAccent: "#dc2626",
  catalogBadgeBg: "#dc2626",
  catalogBadgeText: "#ffffff",
  catalogPlayBg: "#dc2626",
  catalogPlayText: "#ffffff",
};

const dominantColorKeys: (keyof PlayerColors)[] = [
  "loadingSpinner", "loginButtonBg", "homeAccent", "homeBadgeBg", "liveAccent",
  "liveBadgeBg", "spectrumColor", "liveAudioGradientColor1", "watchTopBarAccent",
  "watchScrubber", "watchMusicAccent", "catalogAccent", "catalogBadgeBg", "catalogPlayBg",
];

/** Preserve explicit per-screen colors while letting defaults follow the brand color. */
export function resolvePlayerColors(source?: Partial<PlayerColors> | null): PlayerColors {
  const resolved: PlayerColors = { ...defaultPlayerColors, ...(source || {}) };
  const dominant = source?.dominantColor || source?.homeAccent || defaultPlayerColors.dominantColor;
  resolved.dominantColor = dominant;
  for (const key of dominantColorKeys) {
    if (!source?.[key] || source[key] === defaultPlayerColors[key]) {
      (resolved as any)[key] = dominant;
    }
  }
  return resolved;
}

type ScreenTab = "loading" | "login" | "home" | "live" | "catalog";

const screenTabs: { key: ScreenTab; label: string; icon: React.ReactNode }[] = [
  { key: "loading", label: "Loading", icon: <Loader2 size={14} /> },
  { key: "login", label: "Login", icon: <LogIn size={14} /> },
  { key: "home", label: "Home", icon: <Home size={14} /> },
  { key: "live", label: "Ao Vivo", icon: <Tv size={14} /> },
  { key: "catalog", label: "Catálogo", icon: <Film size={14} /> },
];

const screenColorKeys: Record<ScreenTab, { key: keyof PlayerColors; label: string }[]> = {
  loading: [
    { key: "loadingBg", label: "Fundo" },
    { key: "loadingSpinner", label: "Spinner" },
    { key: "loadingText", label: "Texto" },
  ],
  login: [
    { key: "loginBg", label: "Fundo" },
    { key: "loginCardBg", label: "Card" },
    { key: "loginButtonBg", label: "Botão" },
    { key: "loginButtonText", label: "Texto do Botão" },
    { key: "loginText", label: "Texto" },
    { key: "loginSubtext", label: "Subtexto" },
  ],
  home: [
    { key: "homeBg", label: "Fundo" },
    { key: "homeText", label: "Texto" },
    { key: "homeAccent", label: "Destaque" },
    { key: "homeSectionTitle", label: "Título Seção" },
    { key: "homeCardBg", label: "Card" },
    { key: "homeCardText", label: "Texto Card" },
    { key: "homeCardBorder", label: "Borda Card" },
    { key: "homeBadgeBg", label: "Badge" },
    { key: "homeBadgeText", label: "Texto Badge" },
    { key: "homeBannerOverlay", label: "Overlay Banner" },
  ],
  live: [],
  catalog: [
    { key: "catalogBg", label: "Fundo" },
    { key: "catalogText", label: "Texto" },
    { key: "catalogCardBg", label: "Card" },
    { key: "catalogCardText", label: "Texto Card" },
    { key: "catalogAccent", label: "Destaque" },
    { key: "catalogBadgeBg", label: "Badge" },
    { key: "catalogBadgeText", label: "Texto Badge" },
    { key: "catalogPlayBg", label: "Botão Play" },
    { key: "catalogPlayText", label: "Texto Play" },
  ],
};

/* ── Color Input ── */
function PColorInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim().replace(/^#?/, "#").toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(v)) onChange(v);
    else setDraft(value);
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded-lg cursor-pointer border-none p-0 shrink-0"
        style={{ WebkitAppearance: "none", background: "none" }}
      />
      <div className="flex-1 min-w-0">
        <span className="text-[10px] font-semibold block truncate" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{label}</span>
        {editing ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(value); setEditing(false); } }}
            className="text-[9px] font-mono block w-full bg-transparent border-b outline-none"
            style={{ color: "var(--layout-page-text, #1a1a1a)", borderColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 30%, transparent)" }}
          />
        ) : (
          <span
            className="text-[9px] font-mono block cursor-pointer hover:underline"
            style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}
            onClick={() => setEditing(true)}
            title="Clique para editar o código da cor"
          >{value}</span>
        )}
      </div>
    </div>
  );
}

/* ── Mockup Components ── */
function MockupFrame({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
      <div className="px-3 py-1.5 flex items-center justify-between" style={{ background: "#1a1a1a" }}>
        <div className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#ff5f57" }} />
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#febc2e" }} />
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "#28c840" }} />
        </div>
        <span className="text-[8px] font-bold text-white/40 uppercase tracking-wider">{label}</span>
        <div className="w-12" />
      </div>
      <div className="aspect-video relative overflow-hidden">
        {children}
      </div>
    </div>
  );
}

function LoadingMockup({ c, bg }: { c: PlayerColors; bg?: ScreenBgConfig }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3" style={buildBgStyle(c.loadingBg, bg)}>
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ backgroundColor: c.loadingSpinner + "22" }}>
        <div className="w-8 h-8 rounded-full border-3 animate-spin" style={{ borderColor: c.loadingSpinner + "33", borderTopColor: c.loadingSpinner }} />
      </div>
      <span className="text-[10px] font-medium" style={{ color: c.loadingText, opacity: 0.7 }}>Carregando player...</span>
    </div>
  );
}

function LoginMockup({ c, bg }: { c: PlayerColors; bg?: ScreenBgConfig }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={buildBgStyle(c.loginBg, bg)}>
      <div className="w-[60%] max-w-[200px] rounded-2xl p-4 space-y-3" style={{ backgroundColor: c.loginCardBg, border: "1px solid rgba(255,255,255,0.08)" }}>
        <div className="w-10 h-10 mx-auto rounded-xl" style={{ background: `linear-gradient(135deg, ${c.loginButtonBg}, ${c.loginButtonBg}88)` }} />
        <p className="text-center text-[10px] font-bold" style={{ color: c.loginText }}>Bem-vindo</p>
        <p className="text-center text-[8px]" style={{ color: c.loginSubtext }}>Faça login para continuar</p>
        <div className="h-5 rounded-lg" style={{ backgroundColor: c.loginBg, border: "1px solid rgba(255,255,255,0.1)" }} />
        <div className="h-5 rounded-lg" style={{ backgroundColor: c.loginBg, border: "1px solid rgba(255,255,255,0.1)" }} />
        <button className="w-full py-1.5 text-[9px] font-bold rounded-lg" style={{ backgroundColor: c.loginButtonBg, color: c.loginButtonText }}>
          Entrar
        </button>
        <p className="text-center text-[8px]" style={{ color: c.loginSubtext }}>ou entre como visitante</p>
      </div>
    </div>
  );
}

function HomeMockup({ c, bg }: { c: PlayerColors; bg?: ScreenBgConfig }) {
  return (
    <div className="absolute inset-0 flex flex-col" style={buildBgStyle(c.homeBg, bg)}>
      {/* Sidebar indicator */}
      <div className="absolute left-0 top-0 bottom-0 w-[30px] flex flex-col items-center justify-center gap-2 z-10" style={{ backgroundColor: c.homeBg + "ee" }}>
        {[Home, Tv, Film].map((Icon, i) => (
          <div key={i} className="w-4 h-4 rounded flex items-center justify-center" style={{ backgroundColor: i === 0 ? c.homeAccent + "33" : "transparent" }}>
            <Icon size={8} style={{ color: i === 0 ? c.homeAccent : c.homeCardText + "66" }} />
          </div>
        ))}
      </div>
      {/* Hero */}
      <div className="ml-[30px] h-[45%] relative" style={{ background: `linear-gradient(to right, ${c.homeBannerOverlay}dd, transparent)` }}>
        <div className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${c.homeAccent}22, ${c.homeBg})` }} />
        <div className="absolute bottom-2 left-3 z-10">
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: c.homeAccent, color: "#fff" }}>AO VIVO</span>
          <p className="text-[9px] font-bold mt-1" style={{ color: c.homeText }}>Programa da Manhã</p>
          <p className="text-[7px]" style={{ color: c.homeText, opacity: 0.5 }}>06:00 - 09:00</p>
        </div>
      </div>
      {/* Section */}
      <div className="ml-[30px] flex-1 px-3 py-2">
        <p className="text-[8px] font-bold mb-1.5" style={{ color: c.homeSectionTitle }}>Em Alta</p>
        <div className="flex gap-1.5">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-1 rounded-lg overflow-hidden" style={{ backgroundColor: c.homeCardBg, border: `1px solid ${c.homeCardBorder}` }}>
              <div className="h-6" style={{ background: `linear-gradient(135deg, ${c.homeAccent}15, ${c.homeCardBg})` }} />
              <div className="p-1">
                <div className="h-1.5 w-8 rounded-sm" style={{ backgroundColor: c.homeCardText + "33" }} />
                <div className="h-1 w-5 mt-0.5 rounded-sm" style={{ backgroundColor: c.homeCardText + "1a" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LiveMockup({ c, bg }: { c: PlayerColors; bg?: ScreenBgConfig }) {
  const bgMode = c.liveAudioBgMode || "cover";
  return (
    <div className="absolute inset-0 flex flex-col" style={buildBgStyle(c.liveBg, bg)}>
      {/* Video area */}
      <div className="flex-1 relative" style={{ background: `linear-gradient(180deg, ${c.liveBg}, ${c.liveAccent}11)` }}>
        <div className="absolute top-2 left-2">
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded animate-pulse" style={{ backgroundColor: c.liveBadgeBg, color: c.liveBadgeText }}>● AO VIVO</span>
        </div>
        {/* Background mode indicator */}
        <div className="absolute top-2 right-2">
          <span className="text-[6px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)" }}>
            {bgMode === "thumb" ? "THUMB" : bgMode === "cover" ? "CAPA" : "DEGRADÊ"}
          </span>
        </div>
        {/* Music cover mockup */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-16 h-16 rounded-xl overflow-hidden" style={{ backgroundColor: c.liveCardBg, border: `1px solid rgba(255,255,255,0.1)`, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
            <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${c.liveAccent}33, ${c.liveBg})` }} />
          </div>
        </div>
        {/* Spectrum bars */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-end gap-[2px]" style={{ height: "30%", width: "60%" }}>
          {Array.from({ length: 16 }).map((_, i) => {
            const h = 20 + Math.sin(i * 0.8) * 40 + Math.random() * 30;
            return (
              <div key={i} className="flex-1 rounded-t-sm" style={{ height: `${h}%`, backgroundColor: c.spectrumColor || c.liveAccent, opacity: 0.7 }} />
            );
          })}
        </div>
      </div>
      {/* Control bar */}
      <div className="h-[28%] flex items-center gap-2 px-3" style={{ backgroundColor: c.liveControlBg, borderTop: `1px solid ${c.liveCardBorder}` }}>
        <div className="w-8 h-8 rounded-lg" style={{ backgroundColor: c.liveCardBg, border: `1px solid ${c.liveCardBorder}` }} />
        <div className="flex-1 min-w-0">
          <p className="text-[8px] font-bold truncate" style={{ color: c.liveControlText }}>Manhã Show</p>
          <p className="text-[7px]" style={{ color: c.liveControlIcon }}>06:00 - 09:00</p>
          <div className="h-1 mt-1 rounded-full overflow-hidden" style={{ backgroundColor: c.liveCardBorder }}>
            <div className="h-full w-[40%] rounded-full" style={{ backgroundColor: c.liveAccent }} />
          </div>
        </div>
        <div className="flex gap-1">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-4 h-4 rounded-full flex items-center justify-center" style={{ backgroundColor: c.liveCardBg }}>
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: c.liveControlIcon }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CatalogMockup({ c, bg }: { c: PlayerColors; bg?: ScreenBgConfig }) {
  return (
    <div className="absolute inset-0 flex flex-col" style={buildBgStyle(c.catalogBg, bg)}>
      {/* Hero */}
      <div className="h-[40%] relative" style={{ background: `linear-gradient(135deg, ${c.catalogAccent}22, ${c.catalogBg})` }}>
        <div className="absolute bottom-2 left-3">
          <span className="text-[7px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: c.catalogBadgeBg, color: c.catalogBadgeText }}>ON DEMAND</span>
          <p className="text-[9px] font-bold mt-1" style={{ color: c.catalogText }}>Programa Especial</p>
          <p className="text-[7px]" style={{ color: c.catalogText, opacity: 0.5 }}>4 episódios disponíveis</p>
          <button className="mt-1 px-3 py-1 text-[7px] font-bold rounded-full" style={{ backgroundColor: c.catalogPlayBg, color: c.catalogPlayText }}>
            ▶ Assistir
          </button>
        </div>
      </div>
      {/* Playlist */}
      <div className="flex-1 px-3 py-2">
        <p className="text-[8px] font-bold mb-1.5" style={{ color: c.catalogText }}>Últimos Programas</p>
        <div className="flex gap-1.5 overflow-hidden">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex-shrink-0 w-[30%] rounded-lg overflow-hidden" style={{ backgroundColor: c.catalogCardBg, border: `1px solid ${c.catalogAccent}22` }}>
              <div className="h-7 relative" style={{ background: `linear-gradient(135deg, ${c.catalogAccent}10, ${c.catalogCardBg})` }}>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full flex items-center justify-center" style={{ backgroundColor: c.catalogPlayBg + "66" }}>
                    <Play size={5} style={{ color: c.catalogPlayText }} />
                  </div>
                </div>
              </div>
              <div className="p-1">
                <div className="h-1.5 w-8 rounded-sm" style={{ backgroundColor: c.catalogCardText + "33" }} />
                <div className="h-1 w-5 mt-0.5 rounded-sm" style={{ backgroundColor: c.catalogCardText + "1a" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Background Config UI ── */
function BgConfigEditor({ config, onChange, solidColor }: { config: ScreenBgConfig; solidColor: string; onChange: (c: ScreenBgConfig) => void }) {
  const bgTypes: { value: BgType; label: string; icon: React.ReactNode }[] = [
    { value: "solid", label: "Cor Sólida", icon: <Paintbrush size={12} /> },
    { value: "image", label: "Imagem", icon: <Image size={12} /> },
    { value: "gradient", label: "Degradê", icon: <Palette size={12} /> },
  ];

  const positions: GradientPosition[] = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];

  return (
    <div className="space-y-3 p-3 rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
      <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>Tipo de Fundo</span>
      <div className="flex gap-1.5">
        {bgTypes.map(t => (
          <button key={t.value} onClick={() => onChange({ ...config, bgType: t.value })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all"
            style={{
              backgroundColor: config.bgType === t.value ? "var(--layout-header-bg, #1a1a1a)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)",
              color: config.bgType === t.value ? "var(--layout-header-text, #fff)" : "var(--layout-page-text, #1a1a1a)",
            }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {config.bgType === "image" && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>URL da Imagem</span>
          <input
            value={config.bgImage}
            onChange={(e) => onChange({ ...config, bgImage: e.target.value })}
            placeholder="https://exemplo.com/imagem.jpg"
            className="w-full px-3 py-2 rounded-lg text-[11px] outline-none"
            style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)", color: "var(--layout-page-text, #1a1a1a)", border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)" }}
          />
        </div>
      )}

      {config.bgType === "gradient" && (
        <div className="space-y-3">
          <GradientPicker
            colorA={config.gradientColor1}
            colorB={config.gradientColor2}
            angle={config.gradientAngle}
            midpoint={config.gradientMidpoint ?? 50}
            gradientType={config.gradientType}
            onChangeColorA={v => onChange({ ...config, gradientColor1: v })}
            onChangeColorB={v => onChange({ ...config, gradientColor2: v })}
            onChangeAngle={v => onChange({ ...config, gradientAngle: v })}
            onChangeMidpoint={v => onChange({ ...config, gradientMidpoint: v })}
            onChangeType={v => onChange({ ...config, gradientType: v })}
            showType
            showMidpoint
            position={config.gradientPosition}
            onChangePosition={v => onChange({ ...config, gradientPosition: v as GradientPosition })}
          />
          {/* Preview strip */}
          <div className="h-6 rounded-lg" style={buildBgStyle(solidColor, config)} />
        </div>
      )}
    </div>
  );
}

const defaultBgConfigs: ScreenBgConfigs = {
  loading: { ...defaultScreenBg },
  login: { ...defaultScreenBg },
  home: { ...defaultScreenBg },
  live: { ...defaultScreenBg },
  catalog: { ...defaultScreenBg },
};

const screenBgColorKey: Record<ScreenTab, keyof PlayerColors> = {
  loading: "loadingBg", login: "loginBg", home: "homeBg", live: "liveBg", catalog: "catalogBg",
};

/* ── Main Component ── */
export default function PlayerLayoutCustomizer() {
  const { user } = useAuth();
  const [colors, setColors] = useState<PlayerColors>(defaultPlayerColors);
  const [bgConfigs, setBgConfigs] = useState<ScreenBgConfigs>({ ...defaultBgConfigs });
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [activeTab, setActiveTab] = useState<ScreenTab>("loading");
  const originalRef = useRef<PlayerColors>(defaultPlayerColors);

  useEffect(() => {
    if (!user) return;
    let active = true;
    (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("dashboard_items")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!active) return;
      const di = data?.dashboard_items as any;
      if (di && typeof di === "object") {
        if (di.player_colors) {
          const loaded = resolvePlayerColors(di.player_colors);
          setColors(loaded);
          originalRef.current = loaded;
        }
        if (di.player_bg_configs) {
          setBgConfigs(prev => {
            const merged = { ...prev };
            for (const k of Object.keys(prev) as ScreenTab[]) {
              if (di.player_bg_configs[k]) merged[k] = { ...defaultScreenBg, ...di.player_bg_configs[k] };
            }
            return merged;
          });
        }
      }
    })();
    return () => { active = false; };
  }, [user]);

  const updateColor = (key: keyof PlayerColors, value: string) => {
    setColors(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const updateBgConfig = (tab: ScreenTab, cfg: ScreenBgConfig) => {
    setBgConfigs(prev => ({ ...prev, [tab]: cfg }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await mergeUserDashboardItems(user.id, {
        player_colors: colors as unknown as Record<string, unknown>,
        player_bg_configs: bgConfigs as unknown as Record<string, unknown>,
      });

      toast.success("Cores do Player salvas com sucesso!");
      originalRef.current = colors;
      setHasChanges(false);
      window.dispatchEvent(new Event("player-colors-updated"));
    } catch (err) {
      console.error(err);
      toast.error("Erro ao salvar cores do Player.");
    }
    setSaving(false);
  };

  const resetColors = async () => {
    setColors(defaultPlayerColors);
    setBgConfigs({ ...defaultBgConfigs });
    if (!user) return;
    setSaving(true);
    try {
      await mergeUserDashboardItems(user.id, {
        player_colors: defaultPlayerColors as unknown as Record<string, unknown>,
        player_bg_configs: defaultBgConfigs as unknown as Record<string, unknown>,
      });

      toast.success("Cores do Player restauradas ao padrão.");
      originalRef.current = defaultPlayerColors;
      setHasChanges(false);
      window.dispatchEvent(new Event("player-colors-updated"));
    } catch { toast.error("Erro ao restaurar cores."); }
    setSaving(false);
  };

  const mockupMap: Record<ScreenTab, React.ReactNode> = {
    loading: <LoadingMockup c={colors} bg={bgConfigs.loading} />,
    login: <LoginMockup c={colors} bg={bgConfigs.login} />,
    home: <HomeMockup c={colors} bg={bgConfigs.home} />,
    live: <LiveMockup c={colors} bg={bgConfigs.live} />,
    catalog: <CatalogMockup c={colors} bg={bgConfigs.catalog} />,
  };

  return (
    <div className="nexo-scope space-y-5">
      {/* Screen tabs */}
      <div className="flex flex-wrap gap-1.5">
        {screenTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-[11px] font-bold rounded-xl transition-all"
            style={{
              backgroundColor: activeTab === tab.key ? "var(--layout-header-bg, #1a1a1a)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)",
              color: activeTab === tab.key ? "var(--layout-header-text, #ffffff)" : "var(--layout-page-text, #1a1a1a)",
              boxShadow: activeTab === tab.key ? "0 4px 12px color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 25%, transparent)" : "none",
            }}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Mockup + Color pickers layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Mockup preview */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Monitor size={14} style={{ color: "var(--layout-icon-color, #888)" }} />
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
              Pré-visualização
            </span>
          </div>
          <MockupFrame label={screenTabs.find(t => t.key === activeTab)?.label || ""}>
            {mockupMap[activeTab]}
          </MockupFrame>
        </div>

        {/* Background config + Color pickers */}
        <div className="space-y-4">
          {/* Background type */}
          <BgConfigEditor
            config={bgConfigs[activeTab]}
            solidColor={String(colors[screenBgColorKey[activeTab]])}
            onChange={(cfg) => updateBgConfig(activeTab, cfg)}
          />

          {/* Audio channel background mode — only on live tab */}
          {activeTab === "live" && (
            <div className="space-y-3 p-3 rounded-xl" style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 4%, transparent)", border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)" }}>
                Fundo do Canal de Áudio
              </span>
              <div className="flex gap-1.5">
                {([
                  { value: "thumb", label: "Thumb Programa", icon: <Image size={12} /> },
                  { value: "cover", label: "Capa da Música", icon: <Music size={12} /> },
                  { value: "gradient", label: "Degradê", icon: <Palette size={12} /> },
                ] as { value: string; label: string; icon: React.ReactNode }[]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => updateColor("liveAudioBgMode", opt.value)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all"
                    style={{
                      backgroundColor: colors.liveAudioBgMode === opt.value ? "var(--layout-header-bg, #1a1a1a)" : "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)",
                      color: colors.liveAudioBgMode === opt.value ? "var(--layout-header-text, #fff)" : "var(--layout-page-text, #1a1a1a)",
                    }}
                  >
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>

              {/* Gradient config when Degradê is selected */}
              {colors.liveAudioBgMode === "gradient" && (
                <div className="space-y-3 mt-2">
                  <GradientPicker
                    colorA={String(colors.liveAudioGradientColor1)}
                    colorB={String(colors.liveAudioGradientColor2)}
                    angle={Number(colors.liveAudioGradientAngle) || 135}
                    midpoint={Number(colors.liveAudioGradientMidpoint) || 62}
                    gradientType={(colors.liveAudioGradientType as "linear" | "radial") || "radial"}
                    onChangeColorA={v => updateColor("liveAudioGradientColor1", v)}
                    onChangeColorB={v => updateColor("liveAudioGradientColor2", v)}
                    onChangeAngle={v => { setColors(prev => ({ ...prev, liveAudioGradientAngle: v })); setHasChanges(true); }}
                    onChangeMidpoint={v => { setColors(prev => ({ ...prev, liveAudioGradientMidpoint: v })); setHasChanges(true); }}
                    onChangeType={v => updateColor("liveAudioGradientType", v)}
                    showType
                    showMidpoint
                    position={String(colors.liveAudioGradientPosition)}
                    onChangePosition={v => updateColor("liveAudioGradientPosition", v)}
                  />
                  {/* Preview strip */}
                  <div className="h-6 rounded-lg" style={(() => {
                    const mid = Number(colors.liveAudioGradientMidpoint) || 62;
                    const c1 = String(colors.liveAudioGradientColor1);
                    const c2 = String(colors.liveAudioGradientColor2);
                    if (colors.liveAudioGradientType === "linear") return { background: `linear-gradient(${colors.liveAudioGradientAngle}deg, ${c1} 0%, ${c2} ${mid}%)` };
                    return { background: `radial-gradient(ellipse ${positionToCSS[colors.liveAudioGradientPosition as GradientPosition] || "at bottom center"}, ${c1} 0%, ${c2} ${mid}%)` };
                  })()} />
                </div>
              )}
            </div>
          )}

          {/* Color pickers */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Palette size={14} style={{ color: "var(--layout-icon-color, #888)" }} />
              <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)" }}>
                Cores — {screenTabs.find(t => t.key === activeTab)?.label}
              </span>
            </div>

            {activeTab === "live" ? (
              <div className="space-y-4">
                {/* Group: Cores — Ao Vivo */}
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider mb-2 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Geral</span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      { key: "liveBg" as const, label: "Fundo" },
                      { key: "liveCardBg" as const, label: "Card" },
                      { key: "liveCardText" as const, label: "Texto Card" },
                      { key: "liveCardBorder" as const, label: "Borda Card" },
                      { key: "liveAccent" as const, label: "Destaque" },
                      { key: "liveBadgeBg" as const, label: "Badge" },
                      { key: "liveBadgeText" as const, label: "Texto Badge" },
                      { key: "liveControlBg" as const, label: "Controles" },
                      { key: "liveControlText" as const, label: "Texto Controles" },
                      { key: "liveControlIcon" as const, label: "Ícones" },
                      { key: "spectrumColor" as const, label: "Cor do Espectro" },
                    ]).map(({ key, label }) => (
                      <PColorInput key={key} label={label} value={String(colors[key])} onChange={(v) => updateColor(key, v)} />
                    ))}
                  </div>
                </div>

                {/* Group: Barra Topo */}
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider mb-2 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Barra Superior</span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      { key: "watchTopBarBg" as const, label: "Fundo" },
                      { key: "watchTopBarText" as const, label: "Texto" },
                      { key: "watchTopBarAccent" as const, label: "Destaque" },
                    ]).map(({ key, label }) => (
                      <PColorInput key={key} label={label} value={String(colors[key])} onChange={(v) => updateColor(key, v)} />
                    ))}
                  </div>
                </div>

                {/* Group: Barra Inferior */}
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider mb-2 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Barra Inferior</span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      { key: "watchBottomBarBg" as const, label: "Fundo" },
                      { key: "watchBottomBarText" as const, label: "Texto" },
                      { key: "watchScrubber" as const, label: "Scrubber" },
                    ]).map(({ key, label }) => (
                      <PColorInput key={key} label={label} value={String(colors[key])} onChange={(v) => updateColor(key, v)} />
                    ))}
                  </div>
                </div>

                {/* Group: Card Música */}
                <div>
                  <span className="text-[9px] font-bold uppercase tracking-wider mb-2 block" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 40%, transparent)" }}>Card Música</span>
                  <div className="grid grid-cols-2 gap-2.5">
                    {([
                      { key: "watchMusicBg" as const, label: "Fundo" },
                      { key: "watchMusicText" as const, label: "Texto" },
                      { key: "watchMusicTitleColor" as const, label: "Texto Música" },
                      { key: "watchMusicArtistColor" as const, label: "Texto Artista" },
                      { key: "watchMusicAccent" as const, label: "Destaque" },
                    ]).map(({ key, label }) => (
                      <PColorInput key={key} label={label} value={String(colors[key])} onChange={(v) => updateColor(key, v)} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                {screenColorKeys[activeTab].map(({ key, label }) => (
                  <PColorInput key={key} label={label} value={String(colors[key])} onChange={(v) => updateColor(key, v)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <button
          onClick={resetColors}
          className="px-5 py-2.5 text-xs font-bold flex items-center gap-2 rounded-xl transition-all"
          style={{ backgroundColor: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 5%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
        >
          <RotateCcw size={13} /> Restaurar Padrão
        </button>
        <Button variant="save"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          {saving ? "Salvando..." : "Salvar Alterações"}
        </Button>
      </div>
    </div>
  );
}
