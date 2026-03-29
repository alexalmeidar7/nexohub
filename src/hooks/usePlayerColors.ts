import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { defaultPlayerColors, type PlayerColors, type ScreenBgConfig, buildBgStyle, defaultScreenBg } from "@/components/PlayerLayoutCustomizer";

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
export function usePlayerColors() {
  const { user } = useAuth();
  const [colors, setColors] = useState<PlayerColors>(defaultPlayerColors);
  const [bgConfigs, setBgConfigs] = useState<ScreenBgConfigs>(defaultBgConfigs);

  const fetchColors = useCallback(async () => {
    // Try authenticated user first
    let userId = user?.id;

    // Also try fetching via slug for public access
    if (!userId) return;

    const { data } = await supabase
      .from("user_settings")
      .select("dashboard_items")
      .eq("user_id", userId)
      .maybeSingle();

    if (data?.dashboard_items && typeof data.dashboard_items === "object") {
      const di = data.dashboard_items as any;
      if (di.player_colors) {
        setColors({ ...defaultPlayerColors, ...di.player_colors });
      }
      if (di.player_bg_configs) {
        setBgConfigs({ ...defaultBgConfigs, ...di.player_bg_configs });
      }
    }
  }, [user]);

  useEffect(() => {
    fetchColors();
  }, [fetchColors]);

  useEffect(() => {
    const handler = () => fetchColors();
    window.addEventListener("player-colors-updated", handler);
    return () => window.removeEventListener("player-colors-updated", handler);
  }, [fetchColors]);

  // Apply CSS custom properties
  useEffect(() => {
    const root = document.documentElement;

    // Map player colors to CSS variables
    const accentHsl = hexToHsl(colors.homeAccent);
    const accentHoverHsl = hexToHsl(colors.homeAccent);
    const bgHsl = hexToHsl(colors.homeBg);
    const fgHsl = hexToHsl(colors.homeText);

    if (bgHsl) root.style.setProperty("--player-bg", bgHsl);
    if (fgHsl) root.style.setProperty("--player-foreground", fgHsl);
    if (accentHsl) {
      root.style.setProperty("--player-accent", accentHsl);
      root.style.setProperty("--player-accent-soft", accentHsl);
    }
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
    root.style.setProperty("--player-loading-spinner", colors.loadingSpinner);
    root.style.setProperty("--player-loading-text", colors.loadingText);

    // Login screen specific
    root.style.setProperty("--player-login-bg", colors.loginBg);
    root.style.setProperty("--player-login-card-bg", colors.loginCardBg);
    root.style.setProperty("--player-login-button-bg", colors.loginButtonBg);
    root.style.setProperty("--player-login-button-text", colors.loginButtonText);
    root.style.setProperty("--player-login-text", colors.loginText);
    root.style.setProperty("--player-login-subtext", colors.loginSubtext);

    // Live screen specific
    root.style.setProperty("--player-live-accent", colors.liveAccent);
    root.style.setProperty("--player-live-badge-bg", colors.liveBadgeBg);
    root.style.setProperty("--player-live-badge-text", colors.liveBadgeText);
    root.style.setProperty("--player-live-control-bg", colors.liveControlBg);
    root.style.setProperty("--player-live-control-text", colors.liveControlText);

    // Glow gradient from accent + bg
    const glowGradient = `radial-gradient(ellipse at 50% 100%, ${colors.homeAccent}55 0%, ${colors.homeBg} 50%, ${colors.homeBg} 100%)`;
    root.style.setProperty("--player-glow", glowGradient);
    root.style.setProperty("--player-glow-corner", glowGradient);

    // Store bg configs as CSS vars for screens that build backgrounds
    const loadingBgStyle = buildBgStyle(colors.loadingBg, bgConfigs.loading);
    if (loadingBgStyle.background) root.style.setProperty("--player-loading-background", loadingBgStyle.background as string);
    else if (loadingBgStyle.backgroundColor) root.style.setProperty("--player-loading-background", loadingBgStyle.backgroundColor as string);

  }, [colors, bgConfigs]);

  return { colors, bgConfigs };
}
