import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useUserSlug } from "@/hooks/useUserSlug";
import { findClientAccountById } from "@/lib/clientAuthAccounts";

const desktopImageCache = new Map<string, Promise<string | null>>();

export default function LocalImageCache() {
  const { user } = useAuth();
  const account = findClientAccountById(user?.id);
  const slug = useUserSlug(account?.parentUserId || account?.id || user?.id);

  useEffect(() => {
    const desktop = window.houseMixDesktop;
    if (!desktop || !slug || !document.documentElement) return;
    const cacheImageElement = (image: HTMLImageElement) => {
      const source = image.getAttribute("src")?.trim() || image.getAttribute("data-housemix-online-src");
      if (!source || source.startsWith("housemix-local:") || /^(data|blob|file):/i.test(source)) return;
      if (image.dataset.housemixLocalMiss === source || image.dataset.housemixResolving === source) return;
      let parsed: URL;
      try { parsed = new URL(source, window.location.href); } catch { return; }
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
      const absoluteUrl = parsed.href;
      const hint = `${image.alt || ""} ${image.className || ""} ${image.parentElement?.textContent?.slice(0, 100) || ""}`;
      const key = `${slug}:${absoluteUrl}:${hint}`;
      let pending = desktopImageCache.get(key);
      if (!pending) {
        pending = desktop.cacheImage(absoluteUrl, hint, slug).catch(() => null);
        desktopImageCache.set(key, pending);
      }
      image.dataset.housemixResolving = source;
      if (image.getAttribute("src") === source) {
        image.setAttribute("data-housemix-online-src", source);
        image.removeAttribute("src");
      }
      void pending.then((localUrl) => {
        if (!image.isConnected || image.dataset.housemixResolving !== source) return;
        delete image.dataset.housemixResolving;
        if (localUrl) {
          image.setAttribute("src", localUrl);
          image.removeAttribute("srcset");
        } else {
          image.dataset.housemixLocalMiss = source;
          image.setAttribute("src", source);
        }
      });
    };
    const inspect = (element: Element) => {
      if (element instanceof HTMLImageElement) cacheImageElement(element);
      element.querySelectorAll("img").forEach((image) => cacheImageElement(image));
    };
    document.querySelectorAll("img").forEach((image) => cacheImageElement(image));
    const observer = new MutationObserver((changes) => {
      for (const change of changes) {
        if (change.type === "attributes" && change.target instanceof HTMLImageElement && change.attributeName === "src") {
          const image = change.target;
          const current = image.getAttribute("src");
          if (current && current !== image.dataset.housemixOnlineSrc) delete image.dataset.housemixLocalMiss;
          cacheImageElement(image);
        }
        change.addedNodes.forEach((node) => { if (node instanceof Element) inspect(node); });
      }
    });
    observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["src"] });
    return () => observer.disconnect();
  }, [slug]);
  return null;
}
