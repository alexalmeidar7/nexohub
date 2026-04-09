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

    if (prog) {
      programaNome = prog.nome || "";
      programaLogo = prog.selo || "";

      const apIds = prog.apresentadores_ids || (prog.apresentador_id ? [prog.apresentador_id] : []);
      if (apIds.length > 0) {
        const { data: ap } = await supabase.from("apresentadores").select("nome, instagram").in("id", apIds).limit(1).maybeSingle();
        if (ap) {
          locutorNome = ap.nome || "";
          locutorInstagram = ap.instagram || "";
        }
      }
    }

    // ── Social links ──
    const socials: { tipo: string; icone: string; texto: string }[] = [];
    if (emp?.instagram) socials.push({ tipo: "instagram", icone: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/instagram.png", texto: extractHandle(emp.instagram) });
    if (emp?.facebook) socials.push({ tipo: "facebook", icone: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/facebook.png", texto: extractHandle(emp.facebook) });
    if (emp?.youtube) socials.push({ tipo: "youtube", icone: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/youtube.png", texto: extractHandle(emp.youtube) });
    if (emp?.site) socials.push({ tipo: "site", icone: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlechrome.png", texto: extractHandle(emp.site) });
    if (emp?.telefone_participacao) socials.push({ tipo: "whatsapp", icone: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/whatsapp.png", texto: emp.telefone_participacao });

    // ── QR Code link ──
    const whatsappNum = emp?.telefone_participacao?.replace(/\D/g, "") || "";
    const qrLink = whatsappNum ? `https://wa.me/${whatsappNum}` : "";

    // ── Ticker ──
    const ticker = roteiroRes.data?.tickertitulos || "";

    // ── Build XML ──
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<broadcast>");
    lines.push("  <programa>");
    lines.push(`    <nome>${esc(programaNome)}</nome>`);
    lines.push(`    <logo_url>${esc(programaLogo)}</logo_url>`);
    lines.push("  </programa>");
    lines.push("  <locutor>");
    lines.push(`    <nome>${esc(locutorNome)}</nome>`);
    lines.push(`    <rede_social>${esc(locutorInstagram)}</rede_social>`);
    lines.push("  </locutor>");
    lines.push("  <redes_sociais>");
    socials.forEach(s => {
      lines.push("    <item>");
      lines.push(`      <icone>${esc(s.icone)}</icone>`);
      lines.push(`      <texto>${esc(s.texto)}</texto>`);
      lines.push("    </item>");
    });
    lines.push("  </redes_sociais>");
    lines.push(`  <qrcode_link>${esc(qrLink)}</qrcode_link>`);
    lines.push(`  <ticker>${esc(ticker)}</ticker>`);
    lines.push("</broadcast>");

    const xml = lines.join("\n");

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=15",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${err.message}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
});
