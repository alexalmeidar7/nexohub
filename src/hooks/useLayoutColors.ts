import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";

/** Convert hex color to HSL string "H S% L%" for CSS custom properties */
function hexToHsl(hex: string, lightnessOffset = 0): string | null {
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
  const L = Math.max(0, Math.min(100, Math.round(l * 100) + lightnessOffset));
  return `${H} ${S}% ${L}%`;
}

/** Relative luminance (0 = black, 1 = white) of a hex color */
function luminance(hex: string): number | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || "");
  if (!m) return null;
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number | null {
  const la = luminance(a), lb = luminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Guarantees legible text over a given background.
 * Keeps the user's chosen color when contrast is acceptable (>= 4.5),
 * otherwise falls back to white or near-black.
 */
export function readableOn(bg: string, desired: string): string {
  const ratio = contrastRatio(bg, desired);
  if (ratio === null || ratio >= 4.5) return desired;
  const lbg = luminance(bg);
  return lbg !== null && lbg > 0.5 ? "#111111" : "#ffffff";
}

export interface LayoutColors {
  pageBg: string;
  pageText: string;
  headerBg: string;
  headerText: string;
  buttonBg: string;
  buttonText: string;
  linkColor: string;
  accentColor: string;
  navBg: string;
  navText: string;
  widgetBg: string;
  widgetText: string;
  iconColor: string;
  borderColor: string;
  sliderBg: string;
  scrollbarColor: string;
  previewBarBg: string;
  homeBgType: "color" | "image";
  homeBgColor: string;
  homeBgImage: string;
}

export const defaultLayoutColors: LayoutColors = {
  pageBg: "#ffffff",
  pageText: "#1a1a1a",
  headerBg: "#1a1a1a",
  headerText: "#ffffff",
  buttonBg: "#333333",
  buttonText: "#ffffff",
  linkColor: "#555555",
  accentColor: "#444444",
  navBg: "#000000",
  navText: "#ffffff",
  widgetBg: "#1a1a1a",
  widgetText: "#ffffff",
  iconColor: "#888888",
  borderColor: "#333333",
  sliderBg: "#0d0d0d",
  scrollbarColor: "#555555",
  previewBarBg: "#0d0446",
  homeBgType: "color",
  homeBgColor: "#1a1a1a",
  homeBgImage: "",
};

/**
 * Applies layout colors as CSS custom properties on :root
 * so `.mv-content-area` and other selectors can use them.
 */
export function useLayoutColors() {
  const { user } = useAuth();
  const [colors, setColors] = useState<LayoutColors>(defaultLayoutColors);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);

  // Resolve effective user id (parent for sub-users)
  useEffect(() => {
    if (!user) return;
    const acc = findClientAccountById(user.id) || findClientAccountByEmail(user.email);
    if (acc?.parentUserId) {
      setEffectiveUserId(acc.parentUserId);
      return;
    }
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.id);
    if (!isUuid) {
      setEffectiveUserId(acc?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(acc.id) ? acc.id : null);
      return;
    }
    supabase.from("sub_users").select("parent_user_id, ativo").eq("auth_user_id", user.id).maybeSingle().then(({ data }) => {
      if (data?.ativo && data.parent_user_id) {
        setEffectiveUserId(data.parent_user_id);
      } else {
        setEffectiveUserId(user.id);
      }
    });
  }, [user]);

  const fetchColors = useCallback(() => {
    if (!effectiveUserId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(effectiveUserId)) return;
    supabase
      .from("user_settings")
      .select("dashboard_items")
      .eq("user_id", effectiveUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (
          data?.dashboard_items &&
          typeof data.dashboard_items === "object" &&
          (data.dashboard_items as any).layout_colors
        ) {
          const loaded = {
            ...defaultLayoutColors,
            ...(data.dashboard_items as any).layout_colors,
          };
          setColors(loaded);
          return;
        }

        const clientAcc = findClientAccountByEmail(user?.email) || findClientAccountById(targetId);
        if (clientAcc?.layoutColors) {
          setColors({
            ...defaultLayoutColors,
            pageBg: clientAcc.layoutColors.homeBgColor || defaultLayoutColors.pageBg,
            homeBgColor: clientAcc.layoutColors.homeBgColor || defaultLayoutColors.homeBgColor,
            widgetBg: clientAcc.layoutColors.cardBgColor || defaultLayoutColors.widgetBg,
            widgetText: clientAcc.layoutColors.cardTextColor || defaultLayoutColors.widgetText,
            accentColor: clientAcc.layoutColors.accentColor || defaultLayoutColors.accentColor,
            buttonBg: clientAcc.layoutColors.accentColor || defaultLayoutColors.buttonBg,
            buttonText: "#002132",
          });
        }
      });
  }, [effectiveUserId, user]);

  useEffect(() => {
    fetchColors();
  }, [fetchColors]);

  // Listen for custom event dispatched by LayoutCustomizer after save
  useEffect(() => {
    const handler = () => fetchColors();
    window.addEventListener("layout-colors-updated", handler);
    return () => window.removeEventListener("layout-colors-updated", handler);
  }, [fetchColors]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--layout-page-bg", colors.pageBg);
    root.style.setProperty("--layout-page-text", colors.pageText);
    root.style.setProperty("--layout-header-bg", colors.headerBg);
    root.style.setProperty("--layout-header-text", readableOn(colors.headerBg, colors.headerText));
    root.style.setProperty("--layout-button-bg", colors.buttonBg);
    root.style.setProperty("--layout-button-text", colors.buttonText);
    root.style.setProperty("--layout-link-color", colors.linkColor);
    root.style.setProperty("--layout-accent-color", colors.accentColor);
    root.style.setProperty("--layout-nav-bg", colors.navBg);
    root.style.setProperty("--layout-nav-text", colors.navText);
    root.style.setProperty("--layout-widget-bg", colors.widgetBg);
    root.style.setProperty("--layout-widget-text", colors.widgetText);
    root.style.setProperty("--layout-icon-color", colors.iconColor);
    root.style.setProperty("--layout-border-color", colors.borderColor);
    root.style.setProperty("--layout-home-bg-color", colors.homeBgColor);
    root.style.setProperty("--layout-slider-bg", colors.sliderBg);
    root.style.setProperty("--layout-scrollbar-color", colors.scrollbarColor);

    // Only set player CSS vars if usePlayerColors is NOT active on this page
    // (i.e. on the Dashboard). Player pages use usePlayerColors which has precedence.
    const isPlayerPage = window.location.pathname.includes("/player") || window.location.pathname.includes("/watch");
    if (!isPlayerPage) {
      const accentHsl = hexToHsl(colors.accentColor);
      if (accentHsl) {
        root.style.setProperty("--player-accent", accentHsl);
        const hoverHsl = hexToHsl(colors.accentColor, -7);
        if (hoverHsl) root.style.setProperty("--player-accent-hover", hoverHsl);
        root.style.setProperty("--player-accent-soft", accentHsl);
      }

      const bgHsl = hexToHsl(colors.homeBgColor);
      if (bgHsl) {
        root.style.setProperty("--player-bg", bgHsl);
      }

      const glowGradient = `radial-gradient(ellipse at 50% 100%, ${colors.accentColor}55 0%, ${colors.homeBgColor} 50%, ${colors.navBg} 100%)`;
      root.style.setProperty("--player-glow", glowGradient);
      root.style.setProperty("--player-glow-corner", glowGradient);
    }

    // Widget bg for presenter card, etc.
    root.style.setProperty("--layout-widget-bg-hex", colors.widgetBg);
    root.style.setProperty("--layout-accent-hex", colors.accentColor);
    root.style.setProperty("--layout-button-bg-hex", colors.buttonBg);

    // Header HSL for module headers
    const headerHsl = hexToHsl(colors.headerBg);
    if (headerHsl) {
      root.style.setProperty("--layout-header-hsl", headerHsl);
    }
  }, [colors]);

  return colors;
}
