import { createClient } from "npm:@supabase/supabase-js@2";
import { ensureVmixPngUrl } from "../_shared/vmixPng.ts";

const serve = Deno.serve;
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });

const esc = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&apos;");

const seconds = (value: string) => {
  const [h = "0", m = "0", s = "0"] = String(value || "00:00:00").split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(s);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const headers = {
    ...corsHeaders,
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Pragma": "no-cache",
    "Expires": "0",
  };

  try {
    const url = new URL(req.url);
    const requestedUserId = url.searchParams.get("user_id") || url.searchParams.get("uid") || "";
    if (!requestedUserId) {
      return new Response('<?xml version="1.0" encoding="UTF-8"?><error>user_id is required</error>', { status: 400, headers });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { fetch: fastSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: subUser } = await supabase.from("sub_users")
      .select("parent_user_id, ativo").eq("auth_user_id", requestedUserId).maybeSingle();
    const userId = subUser?.ativo && subUser.parent_user_id ? subUser.parent_user_id : requestedUserId;

    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "long", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).formatToParts(new Date());
    const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
    const today = `${part("year")}-${part("month")}-${part("day")}`;
    const now = seconds(`${part("hour")}:${part("minute")}:${part("second")}`);
    const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayIndex = weekDays.indexOf(part("weekday"));
    const todayName = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][Math.max(0, todayIndex)];
    const yesterdayName = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][(Math.max(0, todayIndex) + 6) % 7];

    const { data: programas, error: programError } = await supabase.from("programas")
      .select("id, nome, estudio, dias_semana, horario_inicio, horario_fim, ativo")
      .eq("user_id", userId).eq("ativo", true).order("horario_inicio", { ascending: true });
    if (programError) throw programError;

    const onAirCandidates = (programas || []).filter((programa: any) => {
      const start = seconds(programa.horario_inicio);
      const end = seconds(programa.horario_fim);
      const days = Array.isArray(programa.dias_semana) ? programa.dias_semana : [];
      if (end <= start) {
        return (days.includes(todayName) && now >= start) || (days.includes(yesterdayName) && now < end);
      }
      return days.includes(todayName) && now >= start && now < end;
    });
    const onAir = onAirCandidates.find((programa: any) => String(programa.estudio || "").toLowerCase().includes("fm"))
      || onAirCandidates[0]
      || null;

    let sponsorLogos: any[] = [];
    if (onAir) {
      const { data, error } = await supabase.from("logos_patrocinadores")
        .select("id, nome, logo_url, data_final, created_at")
        .eq("user_id", userId).eq("programa_id", onAir.id)
        .eq("ativo", true).eq("excluido", false)
        .gte("data_final", today)
        .order("created_at", { ascending: true });
      if (error) throw error;
      sponsorLogos = data || [];
    }

    const rotationSlot = Math.floor(Date.now() / 5000);
    const sponsorCount = sponsorLogos.length;
    const selectedIndex = sponsorCount > 0 ? rotationSlot % sponsorCount : -1;
    const selected = selectedIndex >= 0 ? sponsorLogos[selectedIndex] : null;
    let logoUrl = "";
    if (selected?.logo_url) {
      const pngUrl = await ensureVmixPngUrl(supabase, selected.logo_url, `vmix-logos/${userId}`);
      if (pngUrl) {
        const separator = pngUrl.includes("?") ? "&" : "?";
        logoUrl = `${pngUrl}${separator}v=${rotationSlot}-${selected.id}`;
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<estudio>
  <programa_no_ar>
    <id>${esc(onAir?.id || "")}</id>
    <nome>${esc(onAir?.nome || "")}</nome>
    <estudio>${esc(onAir?.estudio || "")}</estudio>
    <patrocinador>
      <id>${esc(selected?.id || "")}</id>
      <nome>${esc(selected?.nome || "")}</nome>
      <url>${esc(logoUrl)}</url>
    </patrocinador>
    <logo_url>${esc(logoUrl)}</logo_url>
    <indice>${selectedIndex >= 0 ? selectedIndex + 1 : 0}</indice>
    <total>${sponsorCount}</total>
    <intervalo_atualizacao>5</intervalo_atualizacao>
    <atualizado_em>${new Date().toISOString()}</atualizado_em>
  </programa_no_ar>
</estudio>`;

    return new Response(xml, { headers });
  } catch (error) {
    console.error("[serve-xml-logos] error:", error);
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${esc(error instanceof Error ? error.message : String(error))}</error>`,
      { status: 500, headers },
    );
  }
});
