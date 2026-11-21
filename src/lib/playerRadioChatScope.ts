/** Chave única por rádio. Nunca usar "default", slug livre ou canal de stream. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function radioChatChannelId(radioUserId: string | null | undefined): string | null {
  const id = radioUserId?.trim();
  return id && UUID.test(id) ? `radio-${id.toLowerCase()}` : null;
}

export function isRadioId(id: string | null | undefined): id is string {
  return typeof id === "string" && UUID.test(id);
}
