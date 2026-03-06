const WINDOWS_1252_TO_BYTE: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

const MOJIBAKE_PATTERN = /(Ã.|Â.|â.|ðŸ|�)/;

function toPossibleUtf8Bytes(value: string): Uint8Array | null {
  const bytes: number[] = [];

  for (const char of value) {
    const code = char.charCodeAt(0);

    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }

    const mapped = WINDOWS_1252_TO_BYTE[code];
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }

    return null;
  }

  return Uint8Array.from(bytes);
}

export function decodeHtmlEntities(value: string): string {
  if (typeof document === "undefined") return value;
  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

export function fixMojibake(value: string): string {
  if (!value || !MOJIBAKE_PATTERN.test(value)) return value;

  const bytes = toPossibleUtf8Bytes(value);
  if (!bytes) return value;

  try {
    const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    return decoded && !decoded.includes("�") ? decoded : value;
  } catch {
    return value;
  }
}

export function normalizeMusicText(value: string): string {
  let normalized = decodeHtmlEntities(value).trim();

  for (let i = 0; i < 2; i++) {
    const fixed = fixMojibake(normalized);
    if (fixed === normalized) break;
    normalized = fixed;
  }

  return normalized.normalize("NFC");
}
