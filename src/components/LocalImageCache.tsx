import { useEffect } from "react";

const desktopImageCache = new Map<string, Promise<string | null>>();

function cacheImageElement(image: HTMLImageElement) {
  const source = image.getAttribute("src")?.trim();
  if (!source || source.startsWith("housemix-local:") || /^(data|blob|file):/i.test(source)) return;
  let parsed: URL;
  try { parsed = new URL(source, window.location.href); } catch { return; }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
  const absoluteUrl = parsed.href;
  let pending = desktopImageCache.get(absoluteUrl);
  if (!pending) {
    const hint = `${image.alt || ""} ${image.className || ""} ${image.parentElement?.textContent?.slice(0, 100) || ""}`;
    pending = window.houseMixDesktop!.cacheImage(absoluteUrl, hint).catch(() => null);
    desktopImageCache.set(absoluteUrl, pending);
  }
  void pending.then((localUrl) => {
    if (!localUrl || !image.isConnected || image.getAttribute("src") !== source) return;
    image.setAttribute("data-housemix-online-src", source);
    image.setAttribute("src", localUrl);
    if (image.hasAttribute("srcset")) {
      image.setAttribute("data-housemix-online-srcset", image.getAttribute("srcset") || "");
      image.removeAttribute("srcset");
    }
  });
}

export default function LocalImageCache() {
  useEffect(() => {
    if (!window.houseMixDesktop || !document.documentElement) return;
    const inspect = (element: Element) => {
      if (element instanceof HTMLImageElement) cacheImageElement(element);
      element.querySelectorAll("img").forEach((image) => cacheImageElement(image));
    };
    document.querySelectorAll("img").forEach((image) => cacheImageElement(image));
    const observer = new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === "attributes" && change.target instanceof HTMLImageElement && change.attributeName === "src") {
          cacheImageElement(change.target);
        }
        change.addedNodes.forEach((node) => {
          if (node instanceof Element) inspect(node);
        });
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
    return () => observer.disconnect();
  }, []);
  return null;
}
