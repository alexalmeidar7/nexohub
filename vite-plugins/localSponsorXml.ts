import { JSDOM } from "jsdom";
import { pngSponsorUrl } from "../supabase/functions/_shared/sponsorRotation";

function parseXml(xml: string): Document {
  return new JSDOM(xml, { contentType: "text/xml" }).window.document;
}

function directChild(parent: Element, name: string): Element | undefined {
  return Array.from(parent.children).find((child) => child.tagName === name);
}

function selectSponsor(document: Document): { name: string; url: string } {
  const program = document.documentElement.tagName === "estudio"
    ? directChild(document.documentElement, "programa_no_ar")
    : undefined;
  const sponsor = program && directChild(program, "patrocinador");
  if (!program || !sponsor) throw new Error("O XML de logos não contém o patrocinador do programa no ar.");
  const name = directChild(sponsor, "nome")?.textContent || "";
  const sourceUrl = (directChild(sponsor, "logo_url") || directChild(sponsor, "url"))?.textContent?.trim() || "";
  return { name, url: sourceUrl ? pngSponsorUrl(sourceUrl) : "" };
}

function writeSponsor(document: Document, parent: Element, sponsor: { name: string; url: string }) {
  const element = document.createElement("patrocinador");
  for (const [name, value] of [["nome", sponsor.name], ["logo_url", sponsor.url]]) {
    const child = document.createElement(name);
    child.textContent = value;
    element.appendChild(child);
  }
  parent.appendChild(element);
}

function serialize(document: Document): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n${document.documentElement.outerHTML}`;
}

export function localLogosXml(xml: string): string {
  const document = parseXml(xml);
  const sponsor = selectSponsor(document);
  const program = directChild(document.documentElement, "programa_no_ar")!;
  for (const child of Array.from(program.children)) {
    if (["id", "patrocinador", "logo_url", "indice", "total", "intervalo_atualizacao"].includes(child.tagName)) child.remove();
  }
  writeSponsor(document, program, sponsor);
  return serialize(document);
}

export function localGeralXml(xml: string, logosXml: string): string {
  const document = parseXml(xml);
  if (document.documentElement.tagName !== "geral") throw new Error("XML geral inválido.");
  const sponsor = selectSponsor(parseXml(logosXml));
  const existing = directChild(document.documentElement, "patrocinadores");
  const container = document.createElement("patrocinadores");
  const program = document.createElement("programa_no_ar");
  const previousProgram = existing && directChild(existing, "programa_no_ar");
  for (const name of ["programa_id", "programa_nome"]) {
    const old = previousProgram && directChild(previousProgram, name);
    if (old) program.appendChild(old.cloneNode(true));
  }
  writeSponsor(document, program, sponsor);
  container.appendChild(program);
  if (existing) existing.replaceWith(container);
  else document.documentElement.appendChild(container);
  return serialize(document);
}
