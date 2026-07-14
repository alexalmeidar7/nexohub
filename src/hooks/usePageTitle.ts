import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

let cachedEmpresaNome: string | null = null;
let cachedEmpresaLogo: string | null = null;

// Small in-memory cache so multiple public pages using the same slug
// don't refetch the same empresa info on every navigation.
const slugHeadCache = new Map<string, { nome: string | null; logo: string | null }>();

const DEFAULT_FAVICON = "/favicon.ico";
const DEFAULT_TITLE = "NexoHub";

export function usePageTitle(pageName: string) {
  const { user } = useAuth();
  const [empresaNome, setEmpresaNome] = useState(cachedEmpresaNome);

  // Public/anonymous pages pass an empty pageName. In that case we must NOT
  // reuse a cached authenticated user's name or favicon — the calling page
  // is responsible for setting title/favicon based on the URL slug.
  const isPublic = !pageName;

  useEffect(() => {
    if (isPublic) return;
    if (cachedEmpresaNome) {
      setEmpresaNome(cachedEmpresaNome);
      if (cachedEmpresaLogo) setFavicon(cachedEmpresaLogo);
      return;
    }
    if (!user) return;
    supabase
      .from("empresa_config")
      .select("nome, logo")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const nome = data?.nome || "NexoHub";
        cachedEmpresaNome = nome;
        setEmpresaNome(nome);

        const logo = data?.logo || "";
        if (logo) {
          cachedEmpresaLogo = logo;
          setFavicon(logo);
        }
      });
  }, [user, isPublic]);

  useEffect(() => {
    if (isPublic) return;
    const prefix = empresaNome || "NexoHub";
    document.title = `${prefix} - ${pageName}`;
  }, [empresaNome, pageName, isPublic]);
}

export function setFavicon(url: string) {
  const href = url || DEFAULT_FAVICON;
  // Update all existing icon links (some templates ship multiple, e.g. icon + shortcut icon)
  const links = document.querySelectorAll<HTMLLinkElement>(
    "link[rel~='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']"
  );
  if (links.length === 0) {
    const link = document.createElement("link");
    link.rel = "icon";
    link.href = href;
    document.head.appendChild(link);
    return;
  }
  links.forEach((l) => {
    l.href = href;
  });
}

/**
 * Applies favicon + document.title for a public page based on already-known
 * empresa data. Safe to call every render — it only touches the DOM when
 * values change.
 */
export function applyPublicHead(
  nome: string | null | undefined,
  logo: string | null | undefined,
  pageName?: string,
) {
  const displayName = nome || DEFAULT_TITLE;
  const title = pageName ? `${displayName} - ${pageName}` : displayName;
  if (document.title !== title) document.title = title;
  setFavicon(logo || DEFAULT_FAVICON);
}

/**
 * Fetches empresa (nome + logo) for the given public slug and applies it as
 * favicon + tab title. Use in public slug pages (Promo, Player, Notícias,
 * Tela Interativa, etc.) so the tab always reflects the routed user, never
 * the authenticated user or a stale cache.
 */
export function usePublicHead(slug: string | null | undefined, pageName?: string) {
  useEffect(() => {
    if (!slug || slug === ":userSlug") return;

    let cancelled = false;

    const cached = slugHeadCache.get(slug);
    if (cached) {
      applyPublicHead(cached.nome, cached.logo, pageName);
    } else {
      // Optimistic: reset to default while we fetch, so the previous route's
      // favicon (e.g. the auth user's) does not leak into this render.
      applyPublicHead(null, null, pageName);
    }

    supabase.functions
      .invoke("public-player-data", { body: { slug } })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error || !data || (data as any)?.error) return;
        const empresa = (data as any).empresa || {};
        const nome = empresa.nome || null;
        const logo = empresa.logo || null;
        slugHeadCache.set(slug, { nome, logo });
        applyPublicHead(nome, logo, pageName);
      })
      .catch(() => { /* keep defaults */ });

    return () => { cancelled = true; };
  }, [slug, pageName]);
}
