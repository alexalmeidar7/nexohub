import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { postSiteSync, subscribeSiteSync } from "@/lib/siteSync";
import { toast } from "@/hooks/use-toast";

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
  logo_url?: string;
  favicon_url?: string;
  meta_description?: string;
  meta_keywords?: string;
  og_image_url?: string;
  site_dominio?: string;
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
  logo_url: "",
  favicon_url: "",
  meta_description: "",
  meta_keywords: "",
  og_image_url: "",
  site_dominio: "",
});


const getStoredSiteConfig = (uid: string): SiteConfig | null => {
  try {
    const raw = localStorage.getItem(`nexohub_site_config_${uid}`);
    if (raw) return JSON.parse(raw);
  } catch {}
  return null;
};

const saveStoredSiteConfig = (uid: string, cfg: SiteConfig) => {
  try {
    localStorage.setItem(`nexohub_site_config_${uid}`, JSON.stringify(cfg));
  } catch {}
};

export function useSiteConfig(userId: string | null | undefined) {
  const [config, setConfig] = useState<SiteConfig | null>(() => userId ? getStoredSiteConfig(userId) : null);
  const [loading, setLoading] = useState(true);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localPatchRef = useRef(0); // counts pending local edits to ignore self-echo

  const fetchConfig = useCallback(async (uid: string) => {
    try {
      const { data } = await supabase
        .from("site_config")
        .select("*")
        .eq("user_id", uid)
        .maybeSingle();
      if (data) {
        setConfig(data as SiteConfig);
        saveStoredSiteConfig(uid, data as SiteConfig);
      }
    } catch (err) {
      console.warn("Supabase fetch site_config warning:", err);
    }
  }, []);

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
        const localCfg = getStoredSiteConfig(userId);
        if (localCfg && !cancelled) {
          setConfig(localCfg);
        }

        const { data } = await supabase
          .from("site_config")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle();

        if (cancelled) return;
        if (data) {
          setConfig(data as SiteConfig);
          saveStoredSiteConfig(userId, data as SiteConfig);
        } else if (!localCfg) {
          const seed = defaults(userId);
          setConfig(seed);
          saveStoredSiteConfig(userId, seed);
          try {
            await supabase.from("site_config").insert(seed);
          } catch {}
        }
      } catch (err) {
        console.warn("useSiteConfig load warning (usando cache local):", err);
        if (!cancelled && !config) {
          const fallback = getStoredSiteConfig(userId) || defaults(userId);
          setConfig(fallback);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Listen for cross-tab config changes and refetch.
  useEffect(() => {
    if (!userId) return;
    const unsub = subscribeSiteSync((ev) => {
      if (ev.type !== "config") return;
      if (localPatchRef.current > 0) return; // skip echo of our own save
      fetchConfig(userId);
    });
    return unsub;
  }, [userId, fetchConfig]);

  const update = useCallback(
    (patch: Partial<SiteConfig>) => {
      if (!config || !userId) return;
      const previous = config;
      const next = { ...config, ...patch };
      setConfig(next);
      saveStoredSiteConfig(userId, next);

      if (saveTimer.current) clearTimeout(saveTimer.current);
      // One pending debounced write at a time. A counter here leaked on every
      // keystroke whose previous timer was cancelled, disabling cross-tab sync.
      localPatchRef.current = 1;
      saveTimer.current = setTimeout(async () => {
        let saved = false;
        try {
          const { data, error } = await supabase
            .from("site_config")
            .upsert(next, { onConflict: "user_id" })
            .select("user_id")
            .single();
          if (error) throw error;
          if (!data?.user_id) throw new Error("O banco não confirmou a gravação das configurações do site.");
          saved = true;
        } catch (err: any) {
          console.error("Supabase site_config save failed:", err);
          setConfig(previous);
          saveStoredSiteConfig(userId, previous);
          toast({
            title: "Configuração do site não foi salva",
            description: err?.message || "Verifique sua conexão e tente novamente.",
            variant: "destructive",
          });
        } finally {
          saveTimer.current = null;
          localPatchRef.current = 0;
        }
        if (saved) postSiteSync({ type: "config" });
      }, 400);
    },
    [config, userId]
  );

  return { config, loading, update };
}
