export interface LinkBioConfig {
  user_id: string;
  slug: string;
  station_name: string;
  logo_url: string;
  background_top: string;
  background_bottom: string;
  button_color: string;
  whatsapp_url: string;
  site_url: string;
  map_url: string;
  ios_store_url: string;
  android_store_url: string;
  instagram_url: string;
  facebook_url: string;
  youtube_url: string;
  published: boolean;
}
export interface LinkBioOnAir {
  programName: string;
  presenterName: string;
  presenterPhoto: string;
  start: string;
  end: string;
}
export const LINK_BIO_ORIGIN = "https://housemix.nexobrasil.net";
export const LINK_BIO_SLUG = /^[a-z0-9][a-z0-9-]{2,39}$/;
export const isLinkBioSlug = (value: string): boolean => LINK_BIO_SLUG.test(value);
export function shortLinkBioUrl(slug: string) {
  return LINK_BIO_ORIGIN + "/b/" + slug;
}
export function normalizeLinkBioUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || !url.hostname) return "";
    if (url.username || url.password) return "";
    return url.href;
  } catch { return ""; }
}
export function makeLinkBioDefaults(userId: string, slug = ""): LinkBioConfig {
  return {
    user_id: userId, slug, station_name: "", logo_url: "",
    background_top: "#260000", background_bottom: "#ee1116",
    button_color: "#f00810",
    whatsapp_url: "", site_url: "", map_url: "",
    ios_store_url: "", android_store_url: "",
    instagram_url: "", facebook_url: "", youtube_url: "",
    published: false,
  };
}
/** Backend computes currentProgram in the station timezone, including overnight shows. */
export function resolveLinkBioOnAir(payload: any): LinkBioOnAir | null {
  const program = payload?.currentProgram;
  if (!program?.nome) return null;
  const ids = Array.isArray(program.apresentadores_ids) ? program.apresentadores_ids : [];
  const presenter = payload?.currentPresenter ||
    (payload?.apresentadores || []).find((p: any) => p.id === (ids[0] || program.apresentador_id));
  const hhmm = (value: unknown) => typeof value === "string" ? value.slice(0, 5) : "";
  return {
    programName: program.nome,
    presenterName: presenter?.nome || "",
    presenterPhoto: presenter?.foto || "",
    start: hhmm(program.horario_inicio),
    end: hhmm(program.horario_fim),
  };
}
