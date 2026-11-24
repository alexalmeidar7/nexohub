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
export interface LinkBioPresenter { id: string; name: string; photo: string }
export interface LinkBioOnAir {
  programIdV14?: string;
  programSealV14?: string;
  hasEndedV10?: boolean;
  schedule?: LinkBioProgramV8[];
  scheduleId?: string;
  isLive?: boolean;
  presenters?: LinkBioPresenter[];
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
    background_top: "#260000", background_bottom: "#0055ff",
    button_color: "#0055ff",
    whatsapp_url: "", site_url: "", map_url: "",
    ios_store_url: "", android_store_url: "",
    instagram_url: "", facebook_url: "", youtube_url: "",
    published: false,
  };
}
/** Backend computes currentProgram in the station timezone, including overnight shows. */
function resolveLinkBioLiveV8(payload: any): LinkBioOnAir | null {
  const timezone = payload?.empresa?.timezone || "America/Sao_Paulo";
  const programs = Array.isArray(payload?.programas) ? payload.programas : [];
  const normalize = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/-feira$/, "").trim();
  const days = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  let scheduled: any = null;
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23"}).formatToParts(new Date());
    const get = (k: string) => parts.find(p => p.type === k)?.value || "";
    const date = new Date(Date.UTC(Number(get("year")), Number(get("month"))-1, Number(get("day"))));
    const time = get("hour") + ":" + get("minute");
    scheduled = programs.filter((p: any) => {
      const start = String(p.horario_inicio || "").slice(0,5), end = String(p.horario_fim || "").slice(0,5);
      if (p.ativo === false || !start || !end || start === end) return false;
      const overnight = start > end;
      if (!(overnight ? time >= start || time <= end : time >= start && time <= end)) return false;
      const day = new Date(date);
      if (overnight && time <= end) day.setUTCDate(day.getUTCDate()-1);
      if (p.variavel) return String(p.data_variavel || "").slice(0,10) === day.toISOString().slice(0,10);
      return Array.isArray(p.dias_semana) && p.dias_semana.some((d: unknown) => normalize(d) === days[day.getUTCDay()]);
    }).sort((a: any,b: any) => Number(Boolean(b.variavel))-Number(Boolean(a.variavel)) || String(b.horario_inicio).localeCompare(String(a.horario_inicio)))[0];
  } catch { /* Keep backend fallback for invalid timezone. */ }
  const program = scheduled || payload?.currentProgram;
  if (!program?.nome) return null;
  const ids = Array.isArray(program.apresentadores_ids) ? program.apresentadores_ids : [];
  const presenter = (payload?.currentProgram?.id === program.id ? payload?.currentPresenter : null) ||
    (payload?.apresentadores || []).find((p: any) => p.id === (ids[0] || program.apresentador_id));
  const presenterIds = [...new Set<string>([...(ids.length ? ids : [program.apresentador_id])].filter((id): id is string => typeof id === "string" && !!id))];
  const people = Array.isArray(payload?.apresentadores) ? payload.apresentadores : [];
  const presenters: LinkBioPresenter[] = presenterIds.map(id => {
    const person = people.find((p: any) => p.id === id) || (presenter?.id === id ? presenter : null);
    return person ? { id, name: person.nome || "", photo: person.foto || "" } : null;
  }).filter((p): p is LinkBioPresenter => p !== null && Boolean(p.name || p.photo));
  if (!presenters.length && presenter) presenters.push({ id: String(presenter.id || "primary"), name: presenter.nome || "", photo: presenter.foto || "" });
  const hhmm = (value: unknown) => typeof value === "string" ? value.slice(0, 5) : "";
  return {
    programName: program.nome, presenters,
    presenterName: presenter?.nome || "",
    presenterPhoto: presenter?.foto || "",
    start: hhmm(program.horario_inicio),
    end: hhmm(program.horario_fim),
  };
}

// linkBioScheduleV8: today's station schedule, including overnight carryover.
export interface LinkBioProgramV8 extends LinkBioOnAir { scheduleId: string; isLive: boolean }
export function resolveLinkBioOnAir(payload: any): LinkBioOnAir | null {
  const live = resolveLinkBioLiveV8(payload);
  const programs = Array.isArray(payload?.programas) ? payload.programas : [];
  const people = Array.isArray(payload?.apresentadores) ? payload.apresentadores : [];
  const normalize = (v: unknown) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/-feira$/, "").trim();
  const days = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"];
  const now = new Date();
  const getParts = (tz: string) => new Intl.DateTimeFormat("en-CA", {timeZone: tz, year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", hourCycle:"h23"}).formatToParts(now);
  let parts; try { parts = getParts(payload?.empresa?.timezone || "America/Sao_Paulo"); } catch { parts = getParts("America/Sao_Paulo"); }
  const get = (k: string) => parts.find(p=>p.type===k)?.value || "";
  const today = new Date(Date.UTC(Number(get("year")),Number(get("month"))-1,Number(get("day"))));
  const yesterday = new Date(today); yesterday.setUTCDate(today.getUTCDate()-1);
  const time = get("hour")+":"+get("minute");
  const matchesDay = (p:any,d:Date) => p.variavel ? String(p.data_variavel||"").slice(0,10)===d.toISOString().slice(0,10) : Array.isArray(p.dias_semana) && p.dias_semana.some((x:unknown)=>normalize(x)===days[d.getUTCDay()]);
  const items: LinkBioProgramV8[] = [];
  const hhmm = (v:unknown)=>String(v||"").slice(0,5);
  for (const p of programs) {
    const start=hhmm(p.horario_inicio), end=hhmm(p.horario_fim);
    if (p.ativo===false || !p.nome || !start || !end || start===end) continue;
    const ids: string[] = [...new Set<string>((Array.isArray(p.apresentadores_ids)&&p.apresentadores_ids.length?p.apresentadores_ids:[p.apresentador_id]).filter(Boolean).map(String))];
    const presenters: LinkBioPresenter[] = ids.map(id=>people.find((x:any)=>String(x.id)===id)).filter(Boolean).map((x:any)=>({id:String(x.id),name:x.nome||"",photo:x.foto||""}));
    for (const [date, carry] of [[yesterday,true],[today,false]] as const) {
      if (!matchesDay(p,date) || (carry && start<=end)) continue;
      const scheduleId=String(p.id||p.nome+start)+":"+date.toISOString().slice(0,10);
      const isLive=carry ? time<end : start<=end ? time>=start&&time<end : time>=start;
      items.push({scheduleId, isLive, programIdV14: String(p.id || ""), programSealV14: typeof p.selo === "string" ? p.selo : "", hasEndedV10: carry ? time >= end : start < end && time >= end, programName:p.nome, presenterName:presenters[0]?.name||"", presenterPhoto:presenters[0]?.photo||"", presenters, start,end});
    }
  }
  items.sort((a,b)=>a.scheduleId.slice(-10).localeCompare(b.scheduleId.slice(-10))||a.start.localeCompare(b.start));
  const matched = live && items.find(p=>p.isLive&&p.programName===live.programName&&p.start===live.start);
  const actual = matched || items.find(p=>p.isLive);
  const schedule = items.map(p=>({...p,isLive:p.scheduleId===actual?.scheduleId}));
  if(actual) return {...actual,...(matched ? live : {}),scheduleId:actual.scheduleId,isLive:true,schedule};
  if(live && !items.length) return {...live,isLive:true,schedule:[]};
  if(schedule.length) {const next=schedule.find(p=>p.scheduleId.endsWith(today.toISOString().slice(0,10))&&p.start>=time)||schedule[0]; return {...next,isLive:false,schedule};}
  return null;
}
