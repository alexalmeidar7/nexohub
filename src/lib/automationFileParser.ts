/**
 * automationFileParser.ts
 *
 * Universal parser for radio automation files (XML, TXT, LOG, INI, Key-Value).
 * Supports softwares such as Playlist Digital, Pulsar, RadioBoss, ZaraRadio,
 * Digisat, MasterView, Dinesat, Jazler, MegaMix, etc.
 */

import { normalizeMusicText } from "@/lib/textEncoding";

export interface ParsedAutomationTrack {
  titulo: string;
  artista: string;
  duracao: number;
  horario?: string;
  capa?: string;
  isStopped?: boolean;
}

function cleanFragment(s: string): string {
  return (s || "")
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/^[\s"'`´“”—-]+|[\s"'`´“”–-]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseDurationString(duracaoStr: string): number {
  if (!duracaoStr) return 0;
  const cleaned = duracaoStr.trim();
  if (cleaned.includes(":")) {
    const parts = cleaned.split(":").map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] * 60 + parts[1];
    }
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
  }
  const num = parseFloat(cleaned.replace(",", "."));
  if (!isNaN(num) && num > 0) {
    return num > 600 ? num / 1000 : num; // handles milliseconds vs seconds
  }
  return 0;
}

function firstLeafText(doc: Document, selectors: string[]): string {
  for (const selector of selectors) {
    const element = doc.querySelector(selector);
    if (!element || element.children.length > 0) continue;
    const value = element.textContent?.trim() || "";
    if (value) return value;
  }
  return "";
}

/**
 * Attempts to parse raw text as XML.
 */
function parseXmlContent(text: string): ParsedAutomationTrack | null {
  const trimmed = text.trim();
  if (!trimmed.includes("<") || !trimmed.includes(">")) return null;

  try {
    const cleaned = trimmed.replace(/<\?xml[^?]*\?>\s*/i, "");
    const parser = new DOMParser();
    let doc = parser.parseFromString(cleaned, "application/xml");
    if (doc.querySelector("parsererror")) {
      doc = parser.parseFromString(cleaned, "text/xml");
      if (doc.querySelector("parsererror")) return null;
    }

    const categoria = (doc.querySelector("categoria, category, type")?.textContent || "").trim().toUpperCase();
    if (categoria === "STOPPED") {
      return { titulo: "", artista: "", duracao: 0, isStopped: true };
    }

    // Never read a container such as <musica> or <track> as the title. Its
    // textContent concatenates every child and duplicates title/artist.
    const rawTitulo = firstLeafText(doc, ["nome_musica", "titulo", "title", "track > name", "song > name"]);
    const rawArtista = firstLeafText(doc, ["interprete", "nome_interprete", "artista", "artist", "band", "cantora", "cantor"]);

    const titulo = normalizeMusicText(cleanFragment(rawTitulo));
    const artista = normalizeMusicText(cleanFragment(rawArtista));

    if (!titulo && !artista) {
      if (doc.querySelector("musica, music, track, song")) {
        return { titulo: "", artista: "", duracao: 0, isStopped: true };
      }
      return null;
    }

    const duracaoStr =
      doc.querySelector("duracao, duration, length, tempo, time_total")?.textContent || "0";
    const duracao = parseDurationString(duracaoStr);

    const capa =
      doc.querySelector("capa, cover, image, art, picture, album_art")?.textContent?.trim() || "";
    const horario =
      doc.querySelector("horario, hora, hora_inicio, start_time, time")?.textContent?.trim() || "";

    return { titulo, artista, duracao, horario, capa };
  } catch {
    return null;
  }
}

/**
 * Parses plain text / LOG / Key-Value lines.
 */
function parsePlainTextContent(text: string): ParsedAutomationTrack | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const lines = trimmed
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return null;

  // 1. Key-Value Check (e.g. Artist=..., Title=...)
  let kvArtist = "";
  let kvTitle = "";
  let kvDuration = 0;
  let kvTime = "";
  let kvCover = "";

  for (const line of lines) {
    const artMatch = line.match(/^(?:artist|artista|cantor|interprete)\s*[=:]\s*(.+)$/i);
    if (artMatch) kvArtist = cleanFragment(artMatch[1]);

    const titleMatch = line.match(/^(?:title|titulo|musica|nome|track)\s*[=:]\s*(.+)$/i);
    if (titleMatch) kvTitle = cleanFragment(titleMatch[1]);

    const durMatch = line.match(/^(?:dur|duracao|duration|length)\s*[=:]\s*(.+)$/i);
    if (durMatch) kvDuration = parseDurationString(durMatch[1]);

    const timeMatch = line.match(/^(?:time|hora|horario)\s*[=:]\s*(.+)$/i);
    if (timeMatch) kvTime = cleanFragment(timeMatch[1]);

    const covMatch = line.match(/^(?:cover|capa|image)\s*[=:]\s*(.+)$/i);
    if (covMatch) kvCover = cleanFragment(covMatch[1]);
  }

  if (kvArtist || kvTitle) {
    const cleanArt = normalizeMusicText(kvArtist || "Desconhecido");
    const cleanTit = normalizeMusicText(kvTitle || "Sem título");
    return {
      artista: cleanArt,
      titulo: cleanTit,
      duracao: kvDuration,
      horario: kvTime,
      capa: kvCover,
    };
  }

  // 2. Single or multi-line delimiter (e.g. "Artist - Track" or "Track - Artist")
  // Pick the most relevant line (usually line 0 or the first line that isn't a header)
  let candidateLine = lines[0];
  for (const l of lines) {
    if (l.includes("-") || l.includes("–") || l.includes("|")) {
      candidateLine = l;
      break;
    }
  }

  // Strip leading timestamp like "14:20:15 - " or "[14:20] "
  let cleaned = candidateLine.replace(/^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-–]?\s*/, "").trim();

  // Strip generic prefixes like "!SB - " or "RDS: "
  cleaned = cleaned.replace(/^(!SB|RDS|PLAYING)\s*[-–:]\s*/i, "").trim();

  const delimiter = [" - ", " – ", " — ", " | "].find(d => cleaned.includes(d));
  if (!delimiter) {
    // Single string without delimiter
    const norm = normalizeMusicText(cleanFragment(cleaned));
    if (!norm) return null;
    return {
      artista: "Desconhecido",
      titulo: norm,
      duracao: 0,
    };
  }

  const parts = cleaned.split(delimiter).map(cleanFragment).filter(Boolean);
  if (parts.length < 2) return null;

  const artista = normalizeMusicText(parts[0]);
  const titulo = normalizeMusicText(parts.slice(1).join(" - "));

  if (!artista && !titulo) return null;

  return {
    artista: artista || "Desconhecido",
    titulo: titulo || "Sem título",
    duracao: 0,
  };
}

/**
 * Universal entry point: Parses any file content (XML, TXT, LOG, INI).
 */
export function parseAnyAutomationFile(rawText: string): ParsedAutomationTrack | null {
  if (!rawText) return null;

  // Try XML first
  const xmlResult = parseXmlContent(rawText);
  if (xmlResult) return xmlResult;

  // Fallback to plain text / key-value
  return parsePlainTextContent(rawText);
}

/**
 * Converts any automation content into a standardized XML string.
 * This guarantees downstream components expecting XML (or Supabase storage upload)
 * always receive a valid XML payload.
 */
export function convertToStandardXml(rawText: string): string | null {
  const parsed = parseAnyAutomationFile(rawText);
  if (!parsed) return null;

  if (parsed.isStopped) {
    return `<?xml version="1.0" encoding="UTF-8"?>\n<musica><categoria>STOPPED</categoria><titulo></titulo><artista></artista><duracao>0</duracao></musica>`;
  }

  const esc = (s: string) =>
    (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return `<?xml version="1.0" encoding="UTF-8"?>
<musica>
  <interprete>${esc(parsed.artista)}</interprete>
  <nome_musica>${esc(parsed.titulo)}</nome_musica>
  <titulo>${esc(parsed.titulo)}</titulo>
  <artista>${esc(parsed.artista)}</artista>
  <duracao>${parsed.duracao || 0}</duracao>
  <capa>${esc(parsed.capa || "")}</capa>
  <horario>${esc(parsed.horario || "")}</horario>
</musica>
`;
}
