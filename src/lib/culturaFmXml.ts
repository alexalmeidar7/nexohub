// Regra específica do cliente Cultura FM (culturafm973@gmail.com):
// o arquivo local vem no formato MediaTouch (PlayList com múltiplas Entry).
// A música tocando é sempre a linha com Event="00", cujos atributos Title e
// Artist trazem, respectivamente, o nome da música e o nome do artista.
// Convertemos em pseudo-XML no formato padrão do pipeline para reaproveitar
// todo o downstream (parser, storage sync, XML público, etc).

import { normalizeMusicText } from "@/lib/textEncoding";

export const CULTURA_FM_USER_ID = "66337743-4e4f-4950-b58f-750b0c76861e";

function decodeIso88591IfNeeded(raw: string): string {
  // Se o header declara iso-8859-1 mas o navegador leu como UTF-8, os bytes
  // ficam misinterpretados. Fazemos um round-trip best-effort.
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
  return /<PlayList\b/i.test(t) && /<Entry\b[^>]*Event=/i.test(t);
}

export function parseCulturaFmXml(text: string): { artista: string; titulo: string; duracao: number } | null {
  const decoded = decodeIso88591IfNeeded(text || "");
  // Pega a Entry com Event="00" (música atual).
  const entryRegex = /<Entry\b([^/>]*)\/?>/gi;
  let match: RegExpExecArray | null;
  let attrs: string | null = null;
  while ((match = entryRegex.exec(decoded)) !== null) {
    const a = match[1];
    if (/Event\s*=\s*"0*0"/i.test(a)) { attrs = a; break; }
  }
  if (!attrs) return null;

  const grab = (name: string) => {
    const m = attrs!.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i"));
    return m ? m[1] : "";
  };
  const titulo = normalizeMusicText(grab("Title"));
  const artista = normalizeMusicText(grab("Artist"));
  const duracaoRaw = grab("Duration");
  // Duration vem em ms (ex: 220775). Convertemos para segundos.
  const duracao = duracaoRaw ? Math.max(0, Math.round(Number(duracaoRaw) / 1000)) : 0;
  if (!titulo && !artista) return null;
  return { artista, titulo, duracao: Number.isFinite(duracao) ? duracao : 0 };
}

export function culturaFmXmlToPseudoXml(text: string): string | null {
  const parsed = parseCulturaFmXml(text);
  if (!parsed) return null;
  const esc = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<musica><interprete>${esc(parsed.artista || "Desconhecido")}</interprete><nome_musica>${esc(parsed.titulo || "Sem titulo")}</nome_musica><duracao>${parsed.duracao || 0}</duracao></musica>`;
}
