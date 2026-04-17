import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

const timeToSeconds = (value: string | null | undefined): number => {
  if (!value) return -1;

  const [hours = "0", minutes = "0", seconds = "0"] = value.split(":");
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);

  return Number.isFinite(total) ? total : -1;
};

const normalizeDateValue = (value: string | null | undefined): string =>
  (value || "").trim().slice(0, 10);

const getCurrentProgramSortKey = (
  nowSeconds: number,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  weekDays: string[] | null | undefined,
  todayName: string,
  yesterdayName: string,
  isVariable: boolean | null | undefined,
  programDate: string | null | undefined,
  todayDate: string,
  yesterdayDate: string,
): number => {
  const startSeconds = timeToSeconds(startTime);
  const endSeconds = timeToSeconds(endTime);
  const days = Array.isArray(weekDays) ? weekDays : [];
  const normalizedProgramDate = normalizeDateValue(programDate);

  if (startSeconds < 0 || endSeconds < 0) return -1;

  const runsToday = isVariable
    ? normalizedProgramDate === todayDate
    : days.includes(todayName);
  const ranYesterday = isVariable
    ? normalizedProgramDate === yesterdayDate
    : days.includes(yesterdayName);
  const crossesMidnight = endSeconds <= startSeconds;

  if (!crossesMidnight) {
    return runsToday && nowSeconds >= startSeconds && nowSeconds < endSeconds
      ? startSeconds
      : -1;
  }

  if (runsToday && nowSeconds >= startSeconds) {
    return startSeconds;
  }

  if (ranYesterday && nowSeconds < endSeconds) {
    return startSeconds - 86400;
  }

  return -1;
};

const normalizeImageUrl = (value: string | null | undefined, size = 512): string => {
  const trimmed = (value || "").trim();

  if (!trimmed || trimmed.startsWith("data:")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    if (
      parsed.pathname.includes("/storage/v1/object/public/") &&
      /\.webp$/i.test(parsed.pathname)
    ) {
      parsed.pathname = parsed.pathname.replace(
        "/storage/v1/object/public/",
        "/storage/v1/render/image/public/",
      );

      if (!parsed.searchParams.has("width")) {
        parsed.searchParams.set("width", String(size));
        parsed.searchParams.set("height", String(size));
        parsed.searchParams.set("resize", "contain");
      }

      return parsed.toString();
    }

    return trimmed;
  } catch {
    return trimmed;
  }
};

const SOCIAL_ICONS: Record<string, string> = {
  instagram: "https://img.icons8.com/ios-filled/100/000000/instagram-new.png",
  facebook: "https://img.icons8.com/ios-filled/100/000000/facebook-new.png",
  youtube: "https://img.icons8.com/ios-filled/100/000000/youtube-play.png",
  site: "https://img.icons8.com/ios-filled/100/000000/domain.png",
  whatsapp: "https://img.icons8.com/ios-filled/100/000000/whatsapp.png",
};

function extractHandle(raw: string): string {
  if (!raw) return "";
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length > 0 ? `@${parts[parts.length - 1]}` : raw;
  } catch {
    return raw.startsWith("@") ? raw : `@${raw}`;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><error>user_id is required</error>',
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const now = new Date();
    const brFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const brParts = brFormatter.formatToParts(now);
    const hh = brParts.find((p) => p.type === "hour")?.value || "00";
    const mm = brParts.find((p) => p.type === "minute")?.value || "00";
    const ss = brParts.find((p) => p.type === "second")?.value || "00";
    const nowSeconds = Number(hh) * 3600 + Number(mm) * 60 + Number(ss);

    const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      weekday: "long",
    });
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dayMap: Record<string, string> = {
      "domingo": "Domingo",
      "segunda-feira": "Segunda",
      "terça-feira": "Terça",
      "quarta-feira": "Quarta",
      "quinta-feira": "Quinta",
      "sexta-feira": "Sexta",
      "sábado": "Sábado",
    };
    const todayName = dayMap[dayFormatter.format(now).toLowerCase()] || "Segunda";
    const yesterdayName = dayMap[dayFormatter.format(yesterday).toLowerCase()] || "Domingo";
    const todayDate = dateFormatter.format(now);
    const yesterdayDate = dateFormatter.format(yesterday);

    const WMO_LABELS: Record<number, string> = {
      0: "Ensolarado", 1: "Quase limpo", 2: "Parcialmente nublado", 3: "Nublado",
      45: "Neblina", 48: "Neblina densa", 51: "Garoa fraca", 53: "Garoa", 55: "Garoa intensa",
      61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 71: "Neve fraca", 73: "Neve", 75: "Neve forte",
      80: "Pancadas de chuva", 81: "Pancadas fortes", 82: "Pancadas violentas",
      95: "Tempestade", 96: "Tempestade c/ granizo", 99: "Tempestade severa",
    };

    const [empRes, progsRes, roteiroRes, settingsRes] = await Promise.all([
      supabase
        .from("empresa_config")
        .select("instagram, facebook, youtube, site, telefone_participacao")
        .eq("user_id", userId)
        .maybeSingle(),
      supabase
        .from("programas")
        .select("id, nome, selo, apresentadores_ids, apresentador_id, dias_semana, horario_inicio, horario_fim, variavel, data_variavel")
        .eq("user_id", userId)
        .eq("ativo", true),
      supabase
        .from("roteiros")
        .select("tickertitulos")
        .eq("user_id", userId)
        .eq("tipo_programa", "Jornalístico")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("user_settings")
        .select("cenario_config")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    const emp = empRes.data;
    const prog = (progsRes.data || [])
      .map((item) => ({
        item,
        sortKey: getCurrentProgramSortKey(
          nowSeconds,
          item.horario_inicio,
          item.horario_fim,
          item.dias_semana,
          todayName,
          yesterdayName,
          item.variavel,
          item.data_variavel,
          todayDate,
          yesterdayDate,
        ),
      }))
      .filter((entry) => entry.sortKey >= 0)
      .sort((a, b) => b.sortKey - a.sortKey)[0]?.item || null;

    let programaNome = "";
    let programaLogo = "";
    let locutorNome = "";
    let locutorInstagram = "";
    let locutorFoto = "";
    let programaId = "";

    if (prog) {
      programaNome = prog.nome || "";
      programaLogo = normalizeImageUrl(prog.selo);
      programaId = prog.id || "";

      const apIds = (prog.apresentadores_ids && prog.apresentadores_ids.length > 0)
        ? prog.apresentadores_ids
        : (prog.apresentador_id ? [prog.apresentador_id] : []);

      if (apIds.length > 0) {
        const { data: presenters } = await supabase
          .from("apresentadores")
          .select("id, nome, instagram, foto")
          .eq("user_id", userId)
          .in("id", apIds);

        const ap = (presenters || [])
          .sort((a, b) => apIds.indexOf(a.id) - apIds.indexOf(b.id))[0];

        if (ap) {
          locutorNome = ap.nome || "";
          locutorInstagram = ap.instagram ? extractHandle(ap.instagram) : "";
          locutorFoto = normalizeImageUrl(ap.foto, 1080);
        }
      }
    }

    let sponsorLogos: { nome: string; logo_url: string }[] = [];
    if (programaId) {
      const { data: logos } = await supabase
        .from("logos_patrocinadores")
        .select("nome, logo_url")
        .eq("user_id", userId)
        .eq("programa_id", programaId)
        .eq("ativo", true)
        .eq("excluido", false);
      if (logos) sponsorLogos = logos;
    }

    const socialItems: { handle: string; icon: string }[] = [];
    if (emp?.instagram) socialItems.push({ handle: extractHandle(emp.instagram), icon: SOCIAL_ICONS.instagram });
    if (emp?.facebook) socialItems.push({ handle: extractHandle(emp.facebook), icon: SOCIAL_ICONS.facebook });
    if (emp?.youtube) socialItems.push({ handle: extractHandle(emp.youtube), icon: SOCIAL_ICONS.youtube });
    if (emp?.site) {
      const raw = emp.site.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
      socialItems.push({ handle: raw, icon: SOCIAL_ICONS.site });
    }

    const whatsappRaw = emp?.telefone_participacao || "";
    const whatsappDigits = whatsappRaw.replace(/\D/g, "");
    if (whatsappDigits) {
      socialItems.push({ handle: whatsappRaw.trim(), icon: SOCIAL_ICONS.whatsapp });
    }

    const rotationSlot = Math.floor(now.getTime() / 5000);
    let redeSocialAtual = "";
    let redeSocialIcone = "";
    if (socialItems.length > 0) {
      const idx = rotationSlot % socialItems.length;
      redeSocialAtual = socialItems[idx].handle;
      redeSocialIcone = socialItems[idx].icon;
    }

    const qrLink = whatsappDigits ? `https://wa.me/${whatsappDigits}` : "";
    const broadcastConfig = (settingsRes.data?.cenario_config as any)?.broadcast || {};
    const assunto = broadcastConfig.assunto || "";
    const ticker = roteiroRes.data?.tickertitulos || "";

    let logoPatrocinador = "";
    if (sponsorLogos.length > 0) {
      const idx = rotationSlot % sponsorLogos.length;
      logoPatrocinador = normalizeImageUrl(sponsorLogos[idx].logo_url);
    }

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<items>");
    lines.push("  <dados>");
    lines.push(`    <programa_nome>${esc(programaNome)}</programa_nome>`);
    lines.push(`    <programa_logo>${esc(programaLogo)}</programa_logo>`);
    lines.push(`    <locutor_nome>${esc(locutorNome)}</locutor_nome>`);
    lines.push(`    <locutor_foto>${esc(locutorFoto)}</locutor_foto>`);
    lines.push(`    <locutor_social>${esc(locutorInstagram)}</locutor_social>`);
    lines.push(`    <rede_social_atual>${esc(redeSocialAtual)}</rede_social_atual>`);
    lines.push(`    <rede_social_icone>${esc(redeSocialIcone)}</rede_social_icone>`);
    lines.push(`    <logo_patrocinador>${esc(logoPatrocinador)}</logo_patrocinador>`);
    lines.push(`    <titulo>${esc(assunto)}</titulo>`);
    lines.push(`    <qrcode_link>${esc(qrLink)}</qrcode_link>`);
    lines.push(`    <ticker>${esc(ticker)}</ticker>`);
    lines.push("  </dados>");
    lines.push("</items>");

    return new Response(lines.join("\n"), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "CDN-Cache-Control": "no-store",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${err.message}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
});