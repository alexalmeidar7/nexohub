import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeStationWrite, assertOwnedRecordIds } from "../_shared/stationWriteAuth.ts";
import { ensureVmixPngUrl } from "../_shared/vmixPng.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const esc = (s: any) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const isUUID = (str: any) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(str || "").trim());

function normTime(t: any, def = "00:00"): string {
  const str = String(t ?? def).trim();
  const [h, m] = str.split(":");
  return `${(h || "0").padStart(2, "0")}:${(m || "00").slice(0, 2).padEnd(2, "0")}`;
}

const SLUG_TO_UID: Record<string, string> = {
  positivafm: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
  positiva: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
  p: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
  sub_positiva_opec: "452ebd1e-61a0-42dd-bf80-231a3f426c83",
  interativafm: "9cab6c46-c32a-4c19-94db-773dcfaf7632",
  interativa: "9cab6c46-c32a-4c19-94db-773dcfaf7632",
  transmissao: "98365ea6-0ebf-496d-83e9-69b38089586d",
  jornal: "98365ea6-0ebf-496d-83e9-69b38089586d",
  culturafm973: "b67436c6-ede1-4438-881d-18b9e923adda",
  cultura: "b67436c6-ede1-4438-881d-18b9e923adda",
  alex: "a05c5b71-a100-40f9-8be3-6eb7035a057b",
};

const LEGACY_UID_TO_UID: Record<string, string> = {
  "d17e65af-e407-466f-9b60-b55c43399513": "452ebd1e-61a0-42dd-bf80-231a3f426c83",
  "b2f70324-d086-4a5d-a407-cbc4acf98dce": "9cab6c46-c32a-4c19-94db-773dcfaf7632",
  "48423cc6-f3b1-4bea-8729-dd0ae76a89c3": "98365ea6-0ebf-496d-83e9-69b38089586d",
  "66337743-4e4f-4950-b58f-750b0c76861e": "b67436c6-ede1-4438-881d-18b9e923adda",
  "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5": "a05c5b71-a100-40f9-8be3-6eb7035a057b",
};

const SLUG_TO_NAME: Record<string, string> = {
  "452ebd1e-61a0-42dd-bf80-231a3f426c83": "Positiva FM 99.1",
  positivafm: "Positiva FM 99.1",
  positiva: "Positiva FM 99.1",
  p: "Positiva FM 99.1",
  sub_positiva_opec: "Positiva FM 99.1",
  "9cab6c46-c32a-4c19-94db-773dcfaf7632": "Interativa FM",
  interativafm: "Interativa FM",
  interativa: "Interativa FM",
  "98365ea6-0ebf-496d-83e9-69b38089586d": "Transmissão FM",
  transmissao: "Transmissão FM",
  jornal: "Transmissão FM",
  "b67436c6-ede1-4438-881d-18b9e923adda": "Cultura FM 97.3",
  culturafm973: "Cultura FM 97.3",
  cultura: "Cultura FM 97.3",
  "a05c5b71-a100-40f9-8be3-6eb7035a057b": "Alex Estúdio",
  alex: "Alex Estúdio",
};

Deno.const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey, { global: { fetch: fastSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } });

  // Get current date and time in America/Sao_Paulo (Brasília)
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value;

  const today = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
  const currentTime = `${getPart("hour")}:${getPart("minute")}`;

  try {
    // ── POST: SALVAR / EXCLUIR / SINCRONIZAR BATALHAS VIA SERVICE ROLE (IGNORA RLS) ──
    if (req.method === "POST") {
      let body: any = {};
      try {
        body = await req.json();
      } catch {
        body = {};
      }

      const action = body.action || "save";
      if (!["save", "sync", "delete"].includes(action)) {
        return new Response(JSON.stringify({ ok: false, error: "Ação inválida." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const authorization = await authorizeStationWrite(req, body, SLUG_TO_UID, sb);
      if (!authorization.ok) return authorization.response;
      const targetUid = authorization.targetUid;

      if (action === "delete") {
        const idToDelete = body.id || body.batalhaId;
        if (!isUUID(idToDelete)) return new Response(JSON.stringify({ ok: false, error: "ID da batalha inválido." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data, error } = await sb.from("batalhas_agendadas").delete().eq("id", idToDelete).eq("user_id", targetUid).select("id");
        if (error) throw error;
        if (!data?.length) return new Response(JSON.stringify({ ok: false, error: "Batalha não encontrada nesta emissora." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, action: "deleted" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "sync" && Array.isArray(body.batalhas)) {
        if (body.batalhas.length > 500) return new Response(JSON.stringify({ ok: false, error: "Limite de 500 batalhas por sincronização." }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const ownershipError = await assertOwnedRecordIds(sb, "batalhas_agendadas", body.batalhas.map((item: any) => item?.id), targetUid);
        if (ownershipError) return ownershipError;
        const rows = body.batalhas.map((item: any) => ({
          ...(isUUID(item?.id) ? { id: item.id } : {}),
          user_id: targetUid,
          artista1_nome: item?.artista1_nome || "",
          artista1_musica: item?.artista1_musica || "",
          artista1_porcentagem: Number(item?.artista1_porcentagem ?? 50),
          artista1_imagem: item?.artista1_imagem || "",
          artista2_nome: item?.artista2_nome || "",
          artista2_musica: item?.artista2_musica || "",
          artista2_porcentagem: Number(item?.artista2_porcentagem ?? 50),
          artista2_imagem: item?.artista2_imagem || "",
          data_batalha: item?.data_batalha || today,
          horario_inicio: item?.horario_inicio || "00:00",
          horario_fim: item?.horario_fim || "23:59",
        }));
        if (rows.length) {
          const { error } = await sb.from("batalhas_agendadas").upsert(rows);
          if (error) throw error;
        }
        return new Response(JSON.stringify({ ok: true, action: "synced", count: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Default: save single batalha
      const bt = body.batalha || body;
      if (bt.artista1_nome || bt.artista2_nome) {
        const row: any = {
          user_id: targetUid,
          artista1_nome: bt.artista1_nome || "",
          artista1_musica: bt.artista1_musica || "",
          artista1_porcentagem: Number(bt.artista1_porcentagem ?? 50),
          artista1_imagem: bt.artista1_imagem || "",
          artista2_nome: bt.artista2_nome || "",
          artista2_musica: bt.artista2_musica || "",
          artista2_porcentagem: Number(bt.artista2_porcentagem ?? 50),
          artista2_imagem: bt.artista2_imagem || "",
          data_batalha: bt.data_batalha || today,
          horario_inicio: bt.horario_inicio || "00:00",
          horario_fim: bt.horario_fim || "23:59",
        };
        if (isUUID(bt.id)) row.id = bt.id;
        const ownershipError = await assertOwnedRecordIds(sb, "batalhas_agendadas", [row.id], targetUid);
        if (ownershipError) return ownershipError;
        const { data, error } = await sb.from("batalhas_agendadas").upsert(row).select();
        if (error) {
          console.error("[serve-xml-batalha] Save error:", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, action: "saved", data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: false, error: "Dados incompletos da batalha" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET: SERVIR XML DA BATALHA ATIVA ──
    const url = new URL(req.url);
    const rawUserId = url.searchParams.get("user_id") || "";
    const rawSlug = url.searchParams.get("slug") || "";

    const normalizedUserId = rawUserId.toLowerCase().trim();
    const normalizedSlug = rawSlug.toLowerCase().trim();
    const userIdFromParam = isUUID(rawUserId)
      ? (LEGACY_UID_TO_UID[normalizedUserId] || rawUserId)
      : (SLUG_TO_UID[normalizedUserId] || "");
    const userIdFromSlug = isUUID(rawSlug)
      ? (LEGACY_UID_TO_UID[normalizedSlug] || rawSlug)
      : (SLUG_TO_UID[normalizedSlug] || "");
    const cleanInput = normalizedSlug || normalizedUserId;
    if (userIdFromParam && userIdFromSlug && userIdFromParam !== userIdFromSlug) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>Identificadores da emissora conflitantes</error>`, {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
    const resolvedUid = userIdFromParam || userIdFromSlug;
    if (!resolvedUid) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>Identificador da emissora ausente ou inválido</error>`, {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    console.log(`[serve-xml-batalha] GET for userId: ${resolvedUid}, Date: ${today}, Time: ${currentTime}`);

    // Query scheduled battles for today
    const { data: list, error: queryErr } = await sb
      .from("batalhas_agendadas")
      .select("*")
      .eq("user_id", resolvedUid)
      .eq("data_batalha", today)
      .order("horario_inicio", { ascending: false });

    if (queryErr) {
      console.error("[serve-xml-batalha] query error:", queryErr.message);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${esc("Não foi possível carregar a batalha")}</error>`, {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    // Filter by time window (supporting midnight crossing)
    let scheduled = (list || []).find((b: any) => {
      const start = normTime(b.horario_inicio, "00:00");
      const end = normTime(b.horario_fim, "23:59");
      if (start <= end) {
        return currentTime >= start && currentTime <= end;
      }
      return currentTime >= start || currentTime <= end;
    });

    const allowLatest = url.searchParams.get("latest") === "1" || url.searchParams.get("preview") === "1";
    if (!scheduled && (list || []).length > 0 && allowLatest) {
      scheduled = (list || [])[0];
    }

    let nome1 = "", musica1 = "", pct1 = "", img1 = "";
    let nome2 = "", musica2 = "", pct2 = "", img2 = "";
    let ini = "", fim = "";

    if (scheduled) {
      nome1 = scheduled.artista1_nome ?? "";
      musica1 = scheduled.artista1_musica ?? "";
      pct1 = scheduled.artista1_porcentagem !== undefined && scheduled.artista1_porcentagem !== null ? `${scheduled.artista1_porcentagem}%` : "0%";
      img1 = scheduled.artista1_imagem ?? "";
      nome2 = scheduled.artista2_nome ?? "";
      musica2 = scheduled.artista2_musica ?? "";
      pct2 = scheduled.artista2_porcentagem !== undefined && scheduled.artista2_porcentagem !== null ? `${scheduled.artista2_porcentagem}%` : "0%";
      img2 = scheduled.artista2_imagem ?? "";
      ini = scheduled.horario_inicio ?? "";
      fim = scheduled.horario_fim ?? "";
    }

    [img1, img2] = await Promise.all([ensureVmixPngUrl(sb, img1, `vmix-batalha/${resolvedUid}`), ensureVmixPngUrl(sb, img2, `vmix-batalha/${resolvedUid}`)]);

    const emissoraName = SLUG_TO_NAME[cleanInput] || SLUG_TO_NAME[resolvedUid] || "House Mix Emissora";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <emissora>${esc(emissoraName)}</emissora>
    <artista1_nome>${esc(nome1)}</artista1_nome>
    <artista1_musica>${esc(musica1)}</artista1_musica>
    <artista1_porcentagem>${esc(pct1)}</artista1_porcentagem>
    <artista1_imagem>${esc(img1)}</artista1_imagem>
    <artista2_nome>${esc(nome2)}</artista2_nome>
    <artista2_musica>${esc(musica2)}</artista2_musica>
    <artista2_porcentagem>${esc(pct2)}</artista2_porcentagem>
    <artista2_imagem>${esc(img2)}</artista2_imagem>
    <horario_inicio>${esc(ini)}</horario_inicio>
    <horario_fim>${esc(fim)}</horario_fim>
  </batalha>
</items>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    });
  } catch (err: any) {
    console.error("[serve-xml-batalha] Error:", err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${esc(err?.message || "internal error")}</error>`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  }
});
