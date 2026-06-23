import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface SiteConfig {
  user_id: string;
  site_nome: string;
  site_descricao: string;
  cor_primaria: string;
  show_no_ar: boolean;
  show_noticias: boolean;
  show_clima: boolean;
  show_economia: boolean;
  show_promocoes: boolean;
  show_grade: boolean;
  fonte_noticias: "roteiro" | "manual";
  cidade_clima: string;
  cidade_lat: number | null;
  cidade_lon: number | null;
}

const defaults = (userId: string): SiteConfig => ({
  user_id: userId,
  site_nome: "Meu Site",
  site_descricao: "",
  cor_primaria: "#268ffa",
  show_no_ar: true,
  show_noticias: true,
  show_clima: true,
  show_economia: true,
  show_promocoes: true,
  show_grade: true,
  fonte_noticias: "roteiro",
  cidade_clima: "",
  cidade_lat: null,
  cidade_lon: null,
});

export function useSiteConfig(userId: string | null | undefined) {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) {
      setConfig(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from("site_config")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();
        if (cancelled) return;
        if (data) {
          setConfig(data as SiteConfig);
        } else {
          const seed = defaults(userId);
          const { error } = await supabase.from("site_config").insert(seed);
          if (cancelled) return;
          if (!error) setConfig(seed);
          else setConfig(seed);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const update = useCallback(
    (patch: Partial<SiteConfig>) => {
      if (!config || !userId) return;
      const next = { ...config, ...patch };
      setConfig(next);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(async () => {
        const { user_id, ...rest } = next;
        await supabase.from("site_config").update(rest).eq("user_id", userId);
      }, 500);
    },
    [config, userId]
  );

  return { config, loading, update };
}
