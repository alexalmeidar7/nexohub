type Program = {
  id: string; user_id: string; nome: string; ativo: boolean; estudo?: string;
  estudio?: string; dias_semana?: string[]; horario_inicio: string; horario_fim: string;
  selo?: string; thumb?: string; capa?: string; variavel?: boolean; data_variavel?: string | null;
  classificacao_etaria?: string | null;
};
type Group = { id: string; user_id: string; rows: number; cols: number; programa_ids: string[] };
type Tv = { grupo_id: string; user_id: string; posicao: number; imagem_url: string };
type Snapshot = { programs: Program[]; groups: Group[]; tvs: Tv[] };
type Desktop = NonNullable<Window["houseMixDesktop"]>;
type Overlay = { program: Program | null; logo: string; thumb: string; guest: string; anchor: string; scenesReady: boolean };
const overlays = new Map<string, Overlay>();
export function localXmlSlug(ownerId: string) { try { return localStorage.getItem("housemix:local-xml-slug:" + ownerId) || ""; } catch { return ""; } }
const days = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const seconds = (s: string) => { const [h, m, sec = 0] = (s || "").split(":").map(Number); return h * 3600 + m * 60 + sec; };
function clock(now: number) {
  const fmt = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const values = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]));
  const date = values.year + "-" + values.month + "-" + values.day;
  const day = new Date(date + "T12:00:00Z");
  const yesterday = new Date(day.getTime() - 86400000);
  return { date, yesterdayDate: yesterday.toISOString().slice(0, 10), day: days[day.getUTCDay()], yesterday: days[yesterday.getUTCDay()], time: seconds(values.hour + ":" + values.minute + ":" + values.second) };
}
export function selectLocalProgram(programs: Program[], now = Date.now()): Program | null {
  const c = clock(now);
  return programs.flatMap(p => {
    if (!p.ativo || !norm(p.estudio || "").includes("fm") || norm(p.estudio || "").includes("podcast")) return [];
    const start = seconds(p.horario_inicio), end = seconds(p.horario_fim);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return [];
    const overnight = end <= start;
    const previous = overnight && c.time < end;
    if (!(previous || (c.time >= start && (overnight || c.time < end)))) return [];
    const date = previous ? c.yesterdayDate : c.date;
    const day = previous ? c.yesterday : c.day;
    if (p.variavel && p.data_variavel ? p.data_variavel.slice(0,10) !== date : !(p.dias_semana || []).some(d => norm(d) === norm(day))) return [];
    return [{ p, priority: p.variavel && p.data_variavel ? 1 : 0, start: previous ? start - 86400 : start }];
  }).sort((a,b) => b.priority - a.priority || b.start - a.start || a.p.id.localeCompare(b.p.id))[0]?.p || null;
}
const escape = (s: string) => (s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
function tag(xml: string, name: string, value: string) {
  return xml.replace(new RegExp("<" + name + "\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/" + name + ">)", "i"), () => "<" + name + ">" + escape(value) + "</" + name + ">");
}
function sceneXml(o: Overlay) {
  const item = (name: string, url: string) => "<template><nome>" + name + "</nome><url>" + escape(url) + "</url><background_url>" + escape(url) + "</background_url></template>";
  return '<?xml version="1.0" encoding="UTF-8"?>\n<cenarios_estudio><templates>' + item("TVS ATRAS CONVIDADOS",o.guest) + item("TVS ATRAS ANCORA",o.anchor) + "</templates></cenarios_estudio>";
}
/** Overlay only the current program fields. Do not touch the next program or other feed content. */
export function applyLocalOnAirXml(xml: string, slug: string, filename: string) {
  const o = overlays.get(slug);
  if (!o) return xml;
  if (filename === "cenarios-estudio.xml") return o.scenesReady ? sceneXml(o) : xml;
  const p = o.program;
  if (!p) return xml;
  if (filename === "broadcast.xml") {
    const current = xml.split("<a_seguir>");
    current[0] = tag(tag(tag(current[0], "programa_nome", p.nome), "programa_logo", o.logo), "programa_thumb", o.thumb);
    return current.join("<a_seguir>");
  }
  if (filename === "geral.xml") {
    let output = tag(tag(xml, "programa_atual_nome", p.nome), "programa_atual_logo_url", o.logo);
    output = output.replace(/<programa_atual>[\s\S]*?<\/programa_atual>/i, current => tag(tag(current, "nome", p.nome), "logo_url", o.logo));
    const fields: Record<string,string> = { horario_inicio: p.horario_inicio.slice(0,5), horario_fim: p.horario_fim.slice(0,5), horario_formatado: p.horario_inicio.slice(0,5)+" às "+p.horario_fim.slice(0,5), estudio: p.estudio || "Estúdio FM", classificacao_etaria: p.classificacao_etaria || "Livre" };
    for (const [k,v] of Object.entries(fields)) {
      output = tag(output, "programa_atual_"+k, v);
      output = output.replace(/<programa_atual>[\s\S]*?<\/programa_atual>/i, current => tag(current,k,v));
    }
    return output;
  }
  return xml;
}
export const LOCAL_ON_AIR_EVENT = "housemix:local-on-air-change";
export function notifyLocalOnAir(ownerId: string, table: "programas" | "cenario_estudio_grupos" | "cenario_estudio_tvs", row: Record<string, unknown>, removed = false) {
  if (window.houseMixDesktop) window.dispatchEvent(new CustomEvent(LOCAL_ON_AIR_EVENT,{detail:{ownerId,table,row,removed}}));
}
export function startLocalOnAir(desktop: Desktop, ownerId: string, slug: string, write: (file: string) => Promise<unknown>) {
  const key = "housemix:local-on-air:v1:" + ownerId;
  try { localStorage.setItem("housemix:local-xml-slug:" + ownerId, slug); } catch {}
  let snapshot: Snapshot | null = null;
  try {
    const saved = JSON.parse(localStorage.getItem(key) || "null");
    if (saved && Array.isArray(saved.programs) && Array.isArray(saved.groups) && Array.isArray(saved.tvs) &&
        [...saved.programs,...saved.groups,...saved.tvs].every(row => row.user_id === ownerId)) snapshot = saved;
  } catch {}
  let stopped = false, revision = 0, generation = 0, running = false, pending = false;
  let lastSignature = "";
  const downloads = new Map<string, Promise<unknown>>();
  const persist = () => { try { localStorage.setItem(key, JSON.stringify(snapshot)); } catch {} };
  const cache = async (source: string, hint: string) => {
    if (!source) return "";
    const data = /^data:(image\/(?:png|jpeg|webp|gif));base64,([\s\S]+)$/.exec(source);
    if (data) {
      try {
        const bytes = Uint8Array.from(atob(data[2]), c => c.charCodeAt(0));
        const url = await desktop.saveLocalImage(slug, bytes.buffer, data[1], hint);
        return await desktop.getCachedImageFileUrl(url, hint, slug) || "";
      } catch { return ""; }
    }
    const cached = await desktop.getCachedImageFileUrl(source,hint,slug).catch(() => null);
    if (cached) return cached;
    if (navigator.onLine && /^https?:\/\//i.test(source) && !downloads.has(source)) {
      // Download out of the live path; retry only on the next snapshot sync.
      const job = desktop.cacheImageFileUrl(source,hint,slug).then(url => { if(url && !stopped) { lastSignature = ""; void render(); } }).catch(() => {});
      downloads.set(source,job);
    }
    return "";
  };
  const render = async () => {
    if (stopped || !snapshot) return;
    const current = snapshot;
    const p = selectLocalProgram(current.programs);
    const source = (size: number) => {
      const groups = current.groups.filter(g => g.rows*g.cols === size && !!p && g.programa_ids.includes(p.id));
      for (const g of groups) {
        const tv = current.tvs.find(t => t.grupo_id === g.id && t.posicao === 0 && t.imagem_url);
        if (tv) return tv.imagem_url;
      }
      return "";
    };
    const logo = p?.selo || p?.thumb || p?.capa || "", thumb = p?.thumb || p?.capa || p?.selo || "";
    const guest = source(4), anchor = source(2);
    const signature = JSON.stringify([p,guest,anchor]);
    if (signature === lastSignature) return;
    lastSignature = signature;
    const id = ++generation;
    const [logoPath, thumbPath, guestPath, anchorPath] = await Promise.all([cache(logo,"selos"),cache(thumb,"capas"),cache(guest,"fundos"),cache(anchor,"fundos")]);
    if (stopped || id !== generation) return;
    // Missing images must not replace a good cloud/local image for this same program.
    // Once cached, the local overlay takes over; no delay is imposed on cached artwork.
    const old = overlays.get(slug);
    const same = old?.program?.id === p?.id;
    overlays.set(slug,{ program: p, logo: logoPath || (same && old?.logo || ""), thumb: thumbPath || (same && old?.thumb || ""), guest: guestPath, anchor: anchorPath, scenesReady: (!guest || !!guestPath) && (!anchor || !!anchorPath) });
    if (!p && !old && !current.programs.length && !current.groups.length) return;
    await Promise.all(["geral.xml","broadcast.xml","cenarios-estudio.xml"].map(write));
  };
  const refresh = async () => {
    if (stopped || !navigator.onLine) return;
    if (running) { pending = true; return; }
    running = true; const at = revision;
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const [p,g,t] = await Promise.all([
        supabase.from("programas").select("id,user_id,nome,ativo,estudio,dias_semana,horario_inicio,horario_fim,selo,thumb,capa,variavel,data_variavel,classificacao_etaria").eq("user_id",ownerId),
        supabase.from("cenario_estudio_grupos" as any).select("id,user_id,rows,cols,programa_ids").eq("user_id",ownerId),
        supabase.from("cenario_estudio_tvs" as any).select("grupo_id,user_id,posicao,imagem_url").eq("user_id",ownerId),
      ]);
      if (stopped || p.error || g.error || t.error || at !== revision) return;
      const programs = ((p.data || []) as unknown as Program[]).filter(row => row.user_id === ownerId);
      const groups = ((g.data || []) as unknown as Group[]).filter(row => row.user_id === ownerId);
      const ids = new Set(groups.map(row => row.id));
      const tvs = ((t.data || []) as unknown as Tv[]).filter(row => row.user_id === ownerId && ids.has(row.grupo_id));
      snapshot = { programs, groups, tvs }; persist();
      downloads.clear(); lastSignature = ""; await render();
      // Warm the next programs and scenarios at snapshot refresh, not at the on-air switch.
      const sources = new Map<string,string>();
      for (const program of programs) if (program.ativo) {
        for (const [url,hint] of [[program.selo,"selos"],[program.thumb,"capas"],[program.capa,"capas"]]) if (url) sources.set(url,hint!);
      }
      for (const tv of tvs) if (tv.imagem_url) sources.set(tv.imagem_url,"fundos");
      const entries = [...sources]; let index = 0;
      void Promise.all(Array.from({length: Math.min(4,entries.length)}, async () => {
        while (!stopped && navigator.onLine && index < entries.length) {
          const [url,hint] = entries[index++];
          if (!/^https?:\/\//i.test(url) || downloads.has(url)) continue;
          const cached = await desktop.getCachedImageFileUrl(url,hint,slug).catch(() => null);
          if (cached || stopped || downloads.has(url)) continue;
          const job = desktop.cacheImageFileUrl(url,hint,slug).catch(() => null);
          downloads.set(url,job); const result = await job;
          if (result && !stopped) { lastSignature = ""; void render().catch(console.warn); }
        }
      })).catch(console.warn);
    } catch (error) { console.warn("Snapshot local de programação:", error); }
    finally { running = false; if (pending && !stopped) { pending = false; void refresh(); } }
  };
  const change = (event: Event) => {
    const d = (event as CustomEvent).detail;
    if (!d || d.ownerId !== ownerId || !snapshot) return;
    if (!["programas","cenario_estudio_grupos","cenario_estudio_tvs"].includes(d.table)) return;
    const row = {...d.row,user_id:ownerId};
    revision++;
    if (d.table === "programas") {
      const old = snapshot.programs.find(p => p.id === row.id);
      snapshot.programs = snapshot.programs.filter(p => p.id !== row.id);
      if (!d.removed) snapshot.programs.push({...old,...row});
    } else if (d.table === "cenario_estudio_grupos") {
      const old = snapshot.groups.find(g => g.id === row.id);
      snapshot.groups = snapshot.groups.filter(g => g.id !== row.id);
      if (!d.removed) snapshot.groups.push({...old,...row});
      else snapshot.tvs = snapshot.tvs.filter(t => t.grupo_id !== row.id);
    } else {
      snapshot.tvs = snapshot.tvs.filter(t => t.grupo_id !== row.grupo_id || t.posicao !== row.posicao);
      if (!d.removed) snapshot.tvs.push(row);
    }
    persist(); lastSignature = ""; void render().catch(console.warn);
  };
  window.addEventListener(LOCAL_ON_AIR_EVENT,change);
  window.addEventListener("online",refresh);
  // Only local CPU clock check. No disk write if the program has not changed.
  const timer = setInterval(() => void render().catch(console.warn),1000);
  const repair = setInterval(() => void refresh(),15*60_000);
  void render().catch(console.warn); void refresh();
  return { refresh, stop() { stopped = true; clearInterval(timer); clearInterval(repair); window.removeEventListener(LOCAL_ON_AIR_EVENT,change); window.removeEventListener("online",refresh); overlays.delete(slug); } };
}
