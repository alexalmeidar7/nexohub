export function getTvAppLoginPath(slug?: string, userAgent = navigator.userAgent): string | null {
  if (!/NexoPlayerTV\//i.test(userAgent) || !slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) return null;
  return `/${slug}/player/tv`;
}
/** Presentation capability only; never used to authorize a listener or a profile. */
export function isPlayerTvApp() {
  if (typeof window === "undefined") return false;
  // Keep an explicitly selected preview mode across SPA routes, never across
  // browser documents or in authentication/session storage.
  const requested = new URLSearchParams(window.location.search).get("tv");
  const tvLoginRoute = /\/player\/tv\/?$/.test(window.location.pathname);
  if (requested === "1" || (tvLoginRoute && requested !== "0")) document.documentElement.dataset.ottTvPreview = "true";
  else if (requested === "0") delete document.documentElement.dataset.ottTvPreview;
  return /NexoPlayerTV\//i.test(navigator.userAgent)
    || document.documentElement.dataset.tvApp === "true"
    || document.documentElement.dataset.ottTvPreview === "true";
}
