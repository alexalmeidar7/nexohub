import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

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

    // ── Current time & day (BRT) ──
    const now = new Date();
    const brFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    const brParts = brFormatter.formatToParts(now);
    const hh = brParts.find(p => p.type === "hour")!.value;
    const mm = brParts.find(p => p.type === "minute")!.value;
    const ss = brParts.find(p => p.type === "second")!.value;
    const nowTime = `${hh}:${mm}:00`;
    const dayFormatter = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" });
    const dayLong = dayFormatter.format(now);
    const dayMap: Record<string, string> = { "domingo": "Domingo", "segunda-feira": "Segunda", "terça-feira": "Terça", "quarta-feira": "Quarta", "quinta-feira": "Quinta", "sexta-feira": "Sexta", "sábado": "Sábado" };
    const todayName = dayMap[dayLong.toLowerCase()] || "Segunda";

    // ── Parallel fetches ──
    const [empRes, progsRes, roteiroRes, settingsRes] = await Promise.all([
      supabase.from("empresa_config").select("instagram, facebook, youtube, site, telefone_participacao").eq("user_id", userId).maybeSingle(),
      supabase.from("programas")
        .select("id, nome, selo, apresentadores_ids, apresentador_id, dias_semana")
        .eq("user_id", userId).eq("ativo", true)
        .lte("horario_inicio", nowTime).gte("horario_fim", nowTime)
        .contains("dias_semana", [todayName]),
      supabase.from("roteiros")
        .select("tickertitulos")
        .eq("user_id", userId).eq("tipo_programa", "Jornalístico")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("user_settings").select("dashboard_items, weather_city, cenario_config").eq("user_id", userId).maybeSingle(),
    ]);

    const emp = empRes.data;
    const prog = progsRes.data?.[0] || null;

    // ── Program & presenter ──
    let programaNome = "";
    let programaLogo = "";
    let locutorNome = "";
    let locutorInstagram = "";
    let programaId = "";

    if (prog) {
      programaNome = prog.nome || "";
      programaLogo = prog.selo || "";
      programaId = prog.id || "";

      const apIds = (prog.apresentadores_ids && prog.apresentadores_ids.length > 0) ? prog.apresentadores_ids : (prog.apresentador_id ? [prog.apresentador_id] : []);
      if (apIds.length > 0) {
        const { data: ap } = await supabase.from("apresentadores").select("nome, instagram").in("id", apIds).limit(1).maybeSingle();
        if (ap) {
          locutorNome = ap.nome || "";
          locutorInstagram = ap.instagram || "";
        }
      }
    }

    // ── Sponsor logos ──
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

    // ── Social links (handle + icon) ──
    const socialItems: { handle: string; icon: string }[] = [];
    if (emp?.instagram) {
      const raw = emp.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*/, "");
      socialItems.push({ handle: `@${raw}`, icon: "https://cdn-icons-png.flaticon.com/512/174/174855.png" });
    }
    if (emp?.facebook) {
      const raw = emp.facebook.replace(/^https?:\/\/(www\.)?facebook\.com\//, "").replace(/\/.*/, "");
      socialItems.push({ handle: `@${raw}`, icon: "https://cdn-icons-png.flaticon.com/512/124/124010.png" });
    }
    if (emp?.youtube) {
      const raw = emp.youtube.replace(/^https?:\/\/(www\.)?youtube\.com\//, "").replace(/\/.*/, "");
      socialItems.push({ handle: `@${raw}`, icon: "https://cdn-icons-png.flaticon.com/512/1384/1384060.png" });
    }
    if (emp?.site) {
      const raw = emp.site.replace(/^https?:\/\/(www\.)?/, "").replace(/\/.*/, "");
      socialItems.push({ handle: raw, icon: "https://cdn-icons-png.flaticon.com/512/1006/1006771.png" });
    }
    const whatsappNum = emp?.telefone_participacao?.replace(/\D/g, "") || "";
    if (whatsappNum) {
      socialItems.push({ handle: whatsappNum, icon: "https://cdn-icons-png.flaticon.com/512/124/124034.png" });
    }

    const totalSeconds = parseInt(hh) * 3600 + parseInt(mm) * 60 + parseInt(ss);
    let redeSocialAtual = "";
    let redeSocialIcone = "";
    if (socialItems.length > 0) {
      const idx = Math.floor(totalSeconds / 5) % socialItems.length;
      redeSocialAtual = socialItems[idx].handle;
      redeSocialIcone = socialItems[idx].icon;
    }

    // ── QR Code link ──
    const qrLink = whatsappNum ? `https://wa.me/${whatsappNum}` : "";

    // ── Ticker & Titulo from broadcast config ──
    const broadcastConfig = (settingsRes.data?.cenario_config as any)?.broadcast || {};
    const assunto = broadcastConfig.assunto || "";
    const ticker = roteiroRes.data?.tickertitulos || "";

    // ── Sponsor logo rotation (every 5s, .png enforced) ──
    let logoPatrocinador = "";
    if (sponsorLogos.length > 0) {
      const idx = Math.floor(totalSeconds / 5) % sponsorLogos.length;
      logoPatrocinador = sponsorLogos[idx].logo_url.replace(/\.webp$/i, ".png");
    }

    // ── Build flat XML for vMix Data Sources ──
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<items>");
    lines.push("  <dados>");
    lines.push(`    <programa_nome>${esc(programaNome)}</programa_nome>`);
    lines.push(`    <programa_logo>${esc(programaLogo)}</programa_logo>`);
    lines.push(`    <locutor_nome>${esc(locutorNome)}</locutor_nome>`);
    lines.push(`    <locutor_social>${esc(locutorInstagram)}</locutor_social>`);
    lines.push(`    <rede_social_atual>${esc(redeSocialAtual)}</rede_social_atual>`);
    lines.push(`    <rede_social_icone>${esc(redeSocialIcone)}</rede_social_icone>`);
    lines.push(`    <logo_patrocinador>${esc(logoPatrocinador)}</logo_patrocinador>`);
    lines.push(`    <titulo>${esc(assunto)}</titulo>`);
    lines.push(`    <qrcode_link>${esc(qrLink)}</qrcode_link>`);
    lines.push(`    <ticker>${esc(ticker)}</ticker>`);
    lines.push("  </dados>");
    lines.push("</items>");

    const xml = lines.join("\n");

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=5",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${err.message}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
});
