export function getTvAppLoginPath(slug?: string, userAgent = navigator.userAgent): string | null {
  if (!/NexoPlayerTV\//i.test(userAgent) || !slug || !/^[a-z0-9][a-z0-9_-]*$/i.test(slug)) return null;
  return `/${slug}/player/tv`;
}
