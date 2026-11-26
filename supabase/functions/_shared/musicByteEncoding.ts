/** Decode automation XML/TXT before any lossy conversion to a string. */
export function decodeMusicBytes(buffer: ArrayBuffer, contentType = ""): string {
  const b = new Uint8Array(buffer);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(buffer);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(buffer);
  if (b[0] === 0x3c && b[1] === 0) return new TextDecoder("utf-16le").decode(buffer);
  if (b[0] === 0 && b[1] === 0x3c) return new TextDecoder("utf-16be").decode(buffer);
  // Valid UTF-8 wins, even when automation copied an obsolete Latin-1 declaration.
  try { return new TextDecoder("utf-8", { fatal: true }).decode(buffer); } catch { /* legacy bytes */ }
  const probe = new TextDecoder("windows-1252").decode(b.slice(0, 512));
  const declared = probe.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)/i)?.[1]
    || contentType.match(/charset\s*=\s*["']?([^;"'\s]+)/i)?.[1];
  if (declared && !/^utf-?8$/i.test(declared)) {
    try { return new TextDecoder(declared, { fatal: true }).decode(buffer); } catch { /* legacy fallback */ }
  }
  return new TextDecoder("windows-1252").decode(buffer);
}
export function xmlDeclarationUtf8(text: string): string {
  return text.replace(/^(\s*<\?xml[^>]*?\bencoding\s*=\s*)(["'])[^"']+\2/i, '$1"UTF-8"');
}
