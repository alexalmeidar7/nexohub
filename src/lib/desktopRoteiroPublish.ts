import { localizeXmlImageUrls } from "./desktopLocalXml";
import { saveDesktopXml } from "./desktopPromotionBanners";
import { localXmlSlug } from "./desktopLocalOnAir";
import { findClientAccountById } from "./clientAuthAccounts";

export function resolveDesktopRoteiroSlug(ownerId: string) {
  return findClientAccountById(ownerId)?.slug || localXmlSlug(ownerId);
}

/** The permanent roteiro.xml is the FM feed; never replace it with a podcast or future draft. */
export function isFmRoteiroStudio(studio: string) {
  const normalized = (studio || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return !normalized.includes("podcast") && (normalized.includes("fm") || normalized.includes("estudio principal") || normalized.trim() === "principal");
}

export function stampRoteiroXml(xml: string, publishedAt: string, html = "", horario = "") {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.querySelector("parsererror") || document.documentElement.tagName !== "programaExpress") {
    throw new Error("XML de roteiro inválido");
  }
  const root = document.documentElement;
  const set = (tag: string, value: string) => {
    let node = Array.from(root.children).find(child => child.tagName === tag);
    if (!node) { node = document.createElement(tag); root.appendChild(node); }
    node.textContent = value;
  };
  set("atualizado_em", publishedAt);
  if (horario) { set("horario", horario); set("hora", horario); }
  if (html) {
    set("conteudo_html", html);
    const parsed = new DOMParser().parseFromString(html.replace(/<\/(?:p|h[1-6]|li|section|div)>|<br\s*\/?>/gi, "$&\n"), "text/html");
    set("roteiro_texto", parsed.body.textContent?.trim() || "");
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(root);
}

/** Publish using only already-downloaded artwork. No HTTP or Edge Function on the live path. */
export async function publishDesktopRoteiro(slug: string, studio: string, xml: string, publishedAt: string, html = "", horario = "") {
  const desktop = window.houseMixDesktop;
  if (!desktop || !isFmRoteiroStudio(studio)) return false;
  if (!slug) throw new Error("Emissora do roteiro não identificada");
  const stamped = stampRoteiroXml(xml, publishedAt, html, horario);
  const local = await localizeXmlImageUrls(stamped, slug, desktop, true);
  await saveDesktopXml(desktop, slug, "roteiro.xml", local);
  // Missing artwork may be fetched later, but never delay the local text publication.
  if (navigator.onLine) {
    void localizeXmlImageUrls(stamped, slug, desktop).then(async enriched => {
      if (enriched === local) return;
      // Only enrich if this exact edition is still on air.
      const current = await desktop.readXml(slug, "roteiro.xml");
      if (current === local) await saveDesktopXml(desktop, slug, "roteiro.xml", enriched);
    }).catch(() => {});
  }
  return true;
}
