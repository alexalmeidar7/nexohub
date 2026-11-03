// Regra específica do cliente Cultura FM (culturafm973@gmail.com):
// o arquivo local vem no formato MediaTouch (PlayList com múltiplas Entry).
// A música tocando é sempre a entry com Event="00", cujos campos Title e
// Artist trazem, respectivamente, o nome da música e o nome do artista.
// Aceitamos aspas simples ou duplas, e também a variante onde Title/Artist
// são elementos filhos ao invés de atributos.

import { normalizeMusicText } from "@/lib/textEncoding";

export const CULTURA_FM_USER_ID = "b67436c6-ede1-4438-881d-18b9e923adda";

function decodeIso88591IfNeeded(raw: string): string {
  const encodingMatch = raw.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
  const enc = (encodingMatch?.[1] || "").toLowerCase();
  if (!enc.includes("8859") && !enc.includes("1252")) return raw;
  try {
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    return new TextDecoder("windows-1252").decode(bytes);
  } catch {
    return raw;
  }
}

export function isCulturaFmXmlPayload(userId: string | null | undefined, text: string): boolean {
  if (userId !== CULTURA_FM_USER_ID) return false;
  const t = (text || "").trim();
  if (!t.startsWith("<")) return false;
  return /<PlayList\b/i.test(t) && /<Entry\b[^>]*Event\s*=/i.test(t);
}

// Extrai um atributo (aspas simples ou duplas) de um trecho de atributos.
function grabAttr(attrChunk: string, name: string): string {
  const m = attrChunk.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i"));
  return (m?.[1] ?? m?.[2] ?? "").trim();
}

// Extrai um elemento filho <Name>valor</Name> do corpo de uma entry.
function grabChild(body: string, name: string): string {
  const m = body.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return (m?.[1] ?? "").trim();
}

export function parseCulturaFmXml(text: string): { artista: string; titulo: string; duracao: number } | null {
  const decoded = decodeIso88591IfNeeded(text || "");

  // Captura toda a Entry (com ou sem body). Grupo 1 = atributos, grupo 2 = body ou undefined.
  const entryRegex = /<Entry\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Entry\s*>)/gi;
  let match: RegExpExecArray | null;
  let winningAttrs = "";
  let winningBody = "";
  while ((match = entryRegex.exec(decoded)) !== null) {
    const attrs = match[1] || "";
    // Event pode vir como "00", "0", '00', etc.
    const event = grabAttr(attrs, "Event");
    if (/^0+$/.test(event)) {
      winningAttrs = attrs;
      winningBody = match[2] || "";
      break;
    }
  }
  if (!winningAttrs && !winningBody) return null;

  const titulo = normalizeMusicText(
    grabAttr(winningAttrs, "Title") || grabChild(winningBody, "Title")
  );
  const artista = normalizeMusicText(
    grabAttr(winningAttrs, "Artist") || grabChild(winningBody, "Artist")
  );
  const duracaoRaw =
    grabAttr(winningAttrs, "Duration") || grabChild(winningBody, "Duration");
  // Duration em ms (ex: 220775). Se vier em segundos (< 10000), mantemos.
  let duracao = 0;
  if (duracaoRaw) {
    const n = Number(duracaoRaw);
    if (Number.isFinite(n) && n > 0) duracao = n > 10000 ? Math.round(n / 1000) : Math.round(n);
  }
  if (!titulo && !artista) return null;
  return { artista, titulo, duracao };
}

export function culturaFmXmlToPseudoXml(text: string): string | null {
  const parsed = parseCulturaFmXml(text);
  if (!parsed) return null;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<musica><interprete>${esc(parsed.artista || "Desconhecido")}</interprete><nome_musica>${esc(parsed.titulo || "Sem titulo")}</nome_musica><duracao>${parsed.duracao || 0}</duracao></musica>`;
}
