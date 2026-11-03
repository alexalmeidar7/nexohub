// Regra específica do cliente Jornal FM: o arquivo local de origem é um TXT
// no formato "ARTISTA - MUSICA" (com aspas/espaços extras vindos do RDS).
// Convertemos em um pseudo-XML para reaproveitar todo o pipeline de música.

import { normalizeMusicText } from "@/lib/textEncoding";

export const JORNAL_FM_USER_ID = "98365ea6-0ebf-496d-83e9-69b38089586d";

/** Remove aspas envolventes, espaços duplicados e caracteres de controle. */
function cleanRdsFragment(s: string): string {
  return s
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/^[\s"'`´]+|[\s"'`´]+$/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function isJornalFmTxtPayload(userId: string | null | undefined, text: string): boolean {
  if (userId !== JORNAL_FM_USER_ID) return false;
  const trimmed = (text || "").trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("<")) return false; // XML — fluxo padrão
  return trimmed.includes("-");
}

export function parseJornalFmTxt(text: string): { artista: string; titulo: string } | null {
  const line = (text || "")
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(Boolean);
  if (!line) return null;
  const cleanedLine = cleanRdsFragment(line);
  const idx = cleanedLine.indexOf("-");
  if (idx < 0) return null;
  const artista = normalizeMusicText(cleanRdsFragment(cleanedLine.slice(0, idx)));
  const titulo = normalizeMusicText(cleanRdsFragment(cleanedLine.slice(idx + 1)));
  if (!artista && !titulo) return null;
  return { artista, titulo };
}

export function jornalFmTxtToPseudoXml(text: string): string | null {
  const parsed = parseJornalFmTxt(text);
  if (!parsed) return null;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<musica><interprete>${esc(parsed.artista || "Desconhecido")}</interprete><nome_musica>${esc(parsed.titulo || "Sem titulo")}</nome_musica><duracao>0</duracao></musica>`;
}
