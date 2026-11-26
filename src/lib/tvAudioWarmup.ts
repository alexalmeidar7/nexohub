/** Best-effort live-audio warmup: connects transport without playing audio.
 * A 10-second media buffer cannot be guaranteed for live/HLS streams on a WebView.
 */
let preconnectedUrl = "";
let warming: HTMLAudioElement | null = null;
export function warmTvAudioConnection(channels: unknown) {
  if (typeof document === "undefined" || !Array.isArray(channels)) return;
  const channel = channels.find((x: any) =>
    x && x.active !== false && x.type === "audio_live" && typeof x.url === "string" && /^https?:\/\//i.test(x.url));
  if (!channel || channel.url === preconnectedUrl) return;
  preconnectedUrl = channel.url;
  try {
    const origin = new URL(channel.url).origin;
    if (!document.querySelector(`link[data-nexo-audio-preconnect="${origin}"]`)) {
      const link = document.createElement("link");
      link.rel = "preconnect"; link.href = origin;
      link.crossOrigin = "anonymous"; link.dataset.nexoAudioPreconnect = origin;
      document.head.appendChild(link);
    }
    // Plain MPEG/AAC audio supports preload more often than HLS manifests.
    if (/\.m3u8(?:\?|$)/i.test(channel.url)) return;
    if (warming) { warming.pause(); warming.removeAttribute("src"); warming.load(); }
    const a = new Audio(); a.preload = "auto"; a.muted = true; a.src = channel.url;
    warming = a; a.load();
    window.setTimeout(() => { if (warming !== a) return; warming=null; a.pause(); a.removeAttribute("src"); a.load(); }, 10000);
  } catch { /* Preloading is optional and must not block profiles/Player. */ }
}
