export function getTvAppLoginPath(slug?: string, userAgent = navigator.userAgent): string | null {
  if (!/NexoPlayerTV\//i.test(userAgent) || !slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) return null;
  return `/${slug}/player/tv`;
}
/** Presentation capability only; never used to authorize a listener or a profile. */
export function isPlayerTvApp() {
  if (typeof window === "undefined") return false;
  return /NexoPlayerTV\//i.test(navigator.userAgent)
    || document.documentElement.dataset.tvApp === "true"
    || new URLSearchParams(window.location.search).get("tv") === "1";
}
