import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface LayoutColors {
  pageBg: string;
  pageText: string;
  headerBg: string;
  headerText: string;
  buttonBg: string;
  buttonText: string;
  linkColor: string;
  accentColor: string;
  homeBgType: "color" | "image";
  homeBgColor: string;
  homeBgImage: string;
}

export const defaultLayoutColors: LayoutColors = {
  pageBg: "#ffffff",
  pageText: "#0d0446",
  headerBg: "#0d0446",
  headerText: "#ffffff",
  buttonBg: "#be0101",
  buttonText: "#ffffff",
  linkColor: "#2dbef3",
  accentColor: "#be0101",
  homeBgType: "color",
  homeBgColor: "#0d0446",
  homeBgImage: "",
};

/**
 * Applies layout colors as CSS custom properties on :root
 * so `.mv-content-area` and other selectors can use them.
 */
export function useLayoutColors() {
  const { user } = useAuth();
  const [colors, setColors] = useState<LayoutColors>(defaultLayoutColors);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_settings")
      .select("dashboard_items")
      .eq("user_id", user.id)
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
        }
      });
  }, [user]);

  // Apply as CSS custom properties
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--layout-page-bg", colors.pageBg);
    root.style.setProperty("--layout-page-text", colors.pageText);
    root.style.setProperty("--layout-header-bg", colors.headerBg);
    root.style.setProperty("--layout-header-text", colors.headerText);
    root.style.setProperty("--layout-button-bg", colors.buttonBg);
    root.style.setProperty("--layout-button-text", colors.buttonText);
    root.style.setProperty("--layout-link-color", colors.linkColor);
    root.style.setProperty("--layout-accent-color", colors.accentColor);
    root.style.setProperty("--layout-home-bg-color", colors.homeBgColor);
  }, [colors]);

  return colors;
}
