import { isPlayerOtt } from "@/lib/playerTvApp";
import { useEffect, useLayoutEffect, useState, useCallback } from "react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { usePlayerAuth } from "@/hooks/usePlayerAuth";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
import { defaultPlayerColors, resolvePlayerColors, type PlayerColors, type ScreenBgConfig, buildBgStyle, defaultScreenBg } from "@/components/PlayerLayoutCustomizer";

const tvAccentMemory = new Map<string, string>();

type ScreenTab = "loading" | "login" | "home" | "live" | "catalog";
type ScreenBgConfigs = Record<ScreenTab, ScreenBgConfig>;

const defaultBgConfigs: ScreenBgConfigs = {
  loading: { ...defaultScreenBg },
  login: { ...defaultScreenBg },
  home: { ...defaultScreenBg },
  live: { ...defaultScreenBg },
  catalog: { ...defaultScreenBg },
};

/** Convert hex color to HSL string "H S% L%" for CSS custom properties */
function hexToHsl(hex: string): string | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return null;
  let r = parseInt(result[1], 16) / 255;
  let g = parseInt(result[2], 16) / 255;
  let b = parseInt(result[3], 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  const H = Math.round(h * 360);
  const S = Math.round(s * 100);
  const L = Math.round(l * 100);
  return `${H} ${S}% ${L}%`;
}

/**
 * Loads saved player colors + bg configs from user_settings.dashboard_items
 * and applies them as CSS custom properties on :root so all player screens pick them up.
 */
export function usePlayerColors(externalUserId?: string | null, publicSlug?: string | null) {
  const { user } = usePlayerAuth();
  const [colors, setColors] = useState<PlayerColors>(defaultPlayerColors);
  const [bgConfigs, setBgConfigs] = useState<ScreenBgConfigs>(defaultBgConfigs);
  const [colorsReady, setColorsReady] = useState(false);

  // If an explicit externalUserId is provided (public/slug mode), it takes priority
  // over the logged-in user to prevent cross-user color contamination.
  const acc = (user?.id && findClientAccountById(user.id)) || (user?.email && findClientAccountByEmail(user.email));
  const rawTargetId = externalUserId || acc?.parentUserId || acc?.id || user?.id || null;
  const effectiveUserId = rawTargetId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawTargetId) ? rawTargetId : null;

  const tvMode = isPlayerOtt();
  const tvSlug = publicSlug || (typeof window !== "undefined" ? window.location.pathname.match(/^\/([^/]+)\/(?:player|watch)(?:\/|$)/i)?.[1] : undefined);
  const tvAccentKey = tvMode && tvSlug ? `nexo-tv-accent:${tvSlug.toLowerCase()}` : null;
  const cachedTvAccent = () => {
    if (tvAccentKey && tvAccentMemory.has(tvAccentKey)) return tvAccentMemory.get(tvAccentKey)!;
    try { const value = tvAccentKey && localStorage.getItem(tvAccentKey); if (value && /^#[0-9a-f]{6}$/i.test(value)) return value; } catch {}
    return tvSlug?.toLowerCase() === "positivafm" ? "#f20d0f" : (defaultPlayerColors.dominantColor || defaultPlayerColors.homeAccent);
  };
  const storeTvAccent = (value: PlayerColors) => {
    const accent = value.dominantColor || value.homeAccent;
    if (tvAccentKey && /^#[0-9a-f]{6}$/i.test(accent)) {
      tvAccentMemory.set(tvAccentKey, accent);
      try { localStorage.setItem(tvAccentKey, accent); } catch {}
    }
  };
  const fetchColors = useCallback(async () => {
    if (publicSlug) {
      const { data, error } = await playerSupabase.functions.invoke("public-player-data", {
        body: { slug: publicSlug },
      });
      if (!error && data && !data.error) {
        let receivedPlayerConfig = false;
        if (data.playerColors && typeof data.playerColors === "object") {
          const resolved = resolvePlayerColors(data.playerColors);
          storeTvAccent(resolved);
          setColors(resolved);
          receivedPlayerConfig = true;
        }
        if (data.playerBgConfigs && typeof data.playerBgConfigs === "object") {
          setBgConfigs({ ...defaultBgConfigs, ...data.playerBgConfigs });
          receivedPlayerConfig = true;
        }
        // Older deployed versions of public-player-data omit these fields.
        // In that case, keep going so an authenticated/local fallback can load them.
        if (receivedPlayerConfig || !effectiveUserId) return;
      }
    }

    if (!effectiveUserId) return;

    const { data } = await playerSupabase
      .from("user_settings")
      .select("dashboard_items")
      .eq("user_id", effectiveUserId)
      .maybeSingle();

    if (data?.dashboard_items && typeof data.dashboard_items === "object") {
      const di = data.dashboard_items as any;
      if (di.player_colors) {
        const resolved = resolvePlayerColors(di.player_colors);
        storeTvAccent(resolved);
        setColors(resolved);
      }
      if (di.player_bg_configs) {
        setBgConfigs({ ...defaultBgConfigs, ...di.player_bg_configs });
      }
    }
  }, [effectiveUserId, publicSlug, tvAccentKey]);

  useEffect(() => {
    let active = true;
    setColorsReady(false);
    fetchColors().finally(() => {
      if (active) setColorsReady(true);
    });
    return () => { active = false; };
  }, [fetchColors]);

  useEffect(() => {
    const handler = () => {
      setColorsReady(false);
      fetchColors().finally(() => setColorsReady(true));
    };
    window.addEventListener("player-colors-updated", handler);
    return () => window.removeEventListener("player-colors-updated", handler);
  }, [fetchColors]);

  // Apply CSS custom properties
  useLayoutEffect(() => {
    const root = document.documentElement;
    const inheritedWatchAccent =
      colors.liveAccent && colors.liveAccent !== defaultPlayerColors.liveAccent
        ? colors.liveAccent
        : colors.homeAccent;

    const resolvedWatchTopBarAccent =
      colors.watchTopBarAccent &&
      colors.watchTopBarAccent !== defaultPlayerColors.watchTopBarAccent
        ? colors.watchTopBarAccent
        : inheritedWatchAccent;

    const resolvedWatchScrubber =
      colors.watchScrubber && colors.watchScrubber !== defaultPlayerColors.watchScrubber
        ? colors.watchScrubber
        : inheritedWatchAccent;

    const resolvedWatchMusicAccent =
      colors.watchMusicAccent &&
      colors.watchMusicAccent !== defaultPlayerColors.watchMusicAccent
        ? colors.watchMusicAccent
        : inheritedWatchAccent;

    // Map player colors to CSS variables
    // Do not paint the default station red while the saved brand color is
    // still loading. This avoids a red flash behind the user's chosen color.
    const dominantColor = tvMode ? cachedTvAccent() : (colorsReady ? (colors.dominantColor || colors.homeAccent) : "#111214");
    const accentHsl = hexToHsl(dominantColor);
    const accentHoverHsl = hexToHsl(dominantColor);
    const bgHsl = hexToHsl(colors.homeBg);
    const fgHsl = hexToHsl(colors.homeText);

    if (bgHsl) root.style.setProperty("--player-bg", bgHsl);
    if (fgHsl) root.style.setProperty("--player-foreground", fgHsl);
    if (accentHsl) {
      root.style.setProperty("--player-accent", accentHsl);
      root.style.setProperty("--player-accent-soft", accentHsl);
    }
    // Preserve the exact saved brand color for screens that need a CSS color
    // value (including /watch); never fall back to a hard-coded station red.
    root.style.setProperty("--player-dominant-color", dominantColor);
    if (accentHoverHsl) root.style.setProperty("--player-accent-hover", accentHoverHsl);

    // Muted colors derived from foreground
    const mutedHsl = hexToHsl(colors.homeCardText);
    if (mutedHsl) root.style.setProperty("--player-muted-foreground", mutedHsl);

    // Surface/card colors
    const surfaceHsl = hexToHsl(colors.homeCardBg);
    if (surfaceHsl) root.style.setProperty("--player-surface", surfaceHsl);

    const borderHsl = hexToHsl(colors.homeCardBorder);
    if (borderHsl) root.style.setProperty("--player-border", borderHsl);

    // Loading screen specific
    root.style.setProperty("--player-loading-bg", colors.loadingBg);
    root.style.setProperty("--player-loading-spinner", colorsReady ? colors.loadingSpinner : dominantColor);
    root.style.setProperty("--player-loading-text", colors.loadingText);

    // Login screen specific
    root.style.setProperty("--player-login-bg", colors.loginBg);
    root.style.setProperty("--player-login-card-bg", colors.loginCardBg);
    root.style.setProperty("--player-login-button-bg", colorsReady ? colors.loginButtonBg : dominantColor);
    root.style.setProperty("--player-login-button-text", colors.loginButtonText);
    root.style.setProperty("--player-login-text", colors.loginText);
    root.style.setProperty("--player-login-subtext", colors.loginSubtext);

    // Live screen specific
    root.style.setProperty("--player-live-accent", colorsReady ? colors.liveAccent : dominantColor);
    root.style.setProperty("--player-live-badge-bg", colorsReady ? colors.liveBadgeBg : dominantColor);
    root.style.setProperty("--player-live-badge-text", colors.liveBadgeText);
    root.style.setProperty("--player-live-control-bg", colors.liveControlBg);
    root.style.setProperty("--player-live-control-text", colors.liveControlText);

    // Audio channel settings
    root.style.setProperty("--player-live-audio-bg-mode", colors.liveAudioBgMode || "cover");
    root.style.setProperty("--player-spectrum-color", colorsReady ? (colors.spectrumColor || dominantColor) : dominantColor);

    // Audio gradient settings
    root.style.setProperty("--player-audio-gradient-color1", String(colorsReady ? (colors.liveAudioGradientColor1 || dominantColor) : dominantColor));
    root.style.setProperty("--player-audio-gradient-color2", String(colors.liveAudioGradientColor2 || "#000000"));
    root.style.setProperty("--player-audio-gradient-type", String(colors.liveAudioGradientType || "radial"));
    root.style.setProperty("--player-audio-gradient-position", String(colors.liveAudioGradientPosition || "bottom"));
    root.style.setProperty("--player-audio-gradient-angle", String(colors.liveAudioGradientAngle ?? 135));
    root.style.setProperty("--player-audio-gradient-midpoint", String(colors.liveAudioGradientMidpoint ?? 62));

    // Watch controls
    root.style.setProperty("--player-watch-topbar-bg", colors.watchTopBarBg || "#000000cc");
    root.style.setProperty("--player-watch-topbar-text", colors.watchTopBarText || "#ffffff");
    root.style.setProperty("--player-watch-topbar-accent", colorsReady ? resolvedWatchTopBarAccent : dominantColor);
    root.style.setProperty("--player-watch-bottombar-bg", colors.watchBottomBarBg || "#000000cc");
    root.style.setProperty("--player-watch-bottombar-text", colors.watchBottomBarText || "#ffffff");
    root.style.setProperty("--player-watch-scrubber", colorsReady ? resolvedWatchScrubber : dominantColor);
    root.style.setProperty("--player-watch-music-bg", colors.watchMusicBg || "#000000ee");
    root.style.setProperty("--player-watch-music-text", colors.watchMusicText || "#ffffff");
    root.style.setProperty("--player-watch-music-title-color", colors.watchMusicTitleColor || colors.watchMusicText || "#ffffff");
    root.style.setProperty("--player-watch-music-artist-color", colors.watchMusicArtistColor || "color-mix(in srgb, " + (colors.watchMusicText || "#ffffff") + " 85%, transparent)");
    root.style.setProperty("--player-watch-music-accent", colorsReady ? resolvedWatchMusicAccent : dominantColor);

    // Glow gradient from accent + bg
    const glowGradient = `radial-gradient(ellipse at 50% 100%, ${dominantColor}55 0%, ${colors.homeBg} 50%, ${colors.homeBg} 100%)`;
    root.style.setProperty("--player-glow", glowGradient);
    root.style.setProperty("--player-glow-corner", glowGradient);

    // Store bg configs as CSS vars for screens that build backgrounds
    const loadingBgStyle = buildBgStyle(colors.loadingBg, bgConfigs.loading);
    if (loadingBgStyle.background) root.style.setProperty("--player-loading-background", loadingBgStyle.background as string);
    else if (loadingBgStyle.backgroundColor) root.style.setProperty("--player-loading-background", loadingBgStyle.backgroundColor as string);

  }, [colors, bgConfigs, colorsReady, tvAccentKey, tvMode]);

  return { colors, bgConfigs };
}
