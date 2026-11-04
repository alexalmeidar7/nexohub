import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeStationWrite, assertOwnedRecordIds } from "../_shared/stationWriteAuth.ts";

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

const serve = Deno.serve;

const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
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
  const getPart = (type: string) => parts.find(p => p.type === type)?.value;
  const today = `${getPart("year")}-${getPart("month")}-${getPart("day")}`;
  const currentTime = `${getPart("hour")}:${getPart("minute")}`;
  const [year, month, day] = today.split("-").map(Number);
  const yesterday = new Date(Date.UTC(year, month - 1, day - 1)).toISOString().slice(0, 10);

  try {
    // ── POST: SALVAR / EXCLUIR / SINCRONIZAR ENQUETES VIA SERVICE ROLE (IGNORA RLS) ──
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
        const idToDelete = body.id || body.enqueteId;
        let query = sb.from("enquetes_agendadas").delete().eq("user_id", targetUid);
        if (isUUID(idToDelete)) query = query.eq("id", idToDelete);
        else if (typeof body.pergunta === "string" && body.pergunta.trim()) query = query.eq("pergunta", body.pergunta);
        else return new Response(JSON.stringify({ ok: false, error: "Informe um ID ou pergunta válida para excluir." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data, error } = await query.select("id");
        if (error) throw error;
        if (!data?.length) return new Response(JSON.stringify({ ok: false, error: "Enquete não encontrada nesta emissora." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, action: "deleted", count: data.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "sync" && Array.isArray(body.enquetes)) {
        if (body.enquetes.length > 500) return new Response(JSON.stringify({ ok: false, error: "Limite de 500 enquetes por sincronização." }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const ownershipError = await assertOwnedRecordIds(sb, "enquetes_agendadas", body.enquetes.map((item: any) => item?.id), targetUid);
        if (ownershipError) return ownershipError;
        let synced = 0;
        for (const item of body.enquetes) {
          if (!item?.pergunta) continue;
          const row: any = {
            user_id: targetUid,
            pergunta: item.pergunta || "",
            resposta1: item.resposta1 || "",
            resposta2: item.resposta2 || "",
            resposta3: item.resposta3 || "",
            resposta4: item.resposta4 || "",
            resposta_correta: Number(item.resposta_correta) || 1,
            data_enquete: item.data_enquete || today,
            horario_inicio: item.horario_inicio || "00:00",
            horario_fim: item.horario_fim || "23:59",
          };
          if (isUUID(item.id)) {
            row.id = item.id;
            const { error } = await sb.from("enquetes_agendadas").upsert(row);
            if (error) throw error;
            synced++;
            continue;
          }
          // IDs locais (enq_...) não existem no banco: casa pela pergunta para evitar duplicidade.
          const { data: existing, error: lookupError } = await sb
            .from("enquetes_agendadas")
            .select("id")
            .eq("user_id", targetUid)
            .eq("pergunta", row.pergunta)
            .limit(1);
          if (lookupError) throw lookupError;
          if (existing?.length) {
            const { error } = await sb.from("enquetes_agendadas").update(row).eq("id", existing[0].id).eq("user_id", targetUid);
            if (error) throw error;
          } else {
            const { error } = await sb.from("enquetes_agendadas").insert(row);
            if (error) throw error;
          }
          synced++;
        }
        return new Response(JSON.stringify({ ok: true, action: "synced", count: synced }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Default: save single enquete
      const eq = body.enquete || body;
      if (eq.pergunta && eq.resposta1) {
        const row: any = {
          user_id: targetUid,
          pergunta: eq.pergunta,
          resposta1: eq.resposta1,
          resposta2: eq.resposta2 || "",
          resposta3: eq.resposta3 || "",
          resposta4: eq.resposta4 || "",
          resposta_correta: Number(eq.resposta_correta) || 1,
          data_enquete: eq.data_enquete || today,
          horario_inicio: eq.horario_inicio || "00:00",
          horario_fim: eq.horario_fim || "23:59",
        };
        if (isUUID(eq.id)) row.id = eq.id;
        const ownershipError = await assertOwnedRecordIds(sb, "enquetes_agendadas", [row.id], targetUid);
        if (ownershipError) return ownershipError;
        const { data, error } = await sb.from("enquetes_agendadas").upsert(row).select();
        if (error) {
          console.error("[serve-xml-enquete] Save error:", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, action: "saved", data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: false, error: "Dados incompletos da enquete" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET: SERVIR XML DA ENQUETE ATIVA ──
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

    console.log(`[serve-xml-enquete] GET for userId: ${resolvedUid}, Date: ${today}, Time: ${currentTime}`);

    // Query scheduled enquetes for today
    const { data: list, error: queryErr } = await sb
      .from("enquetes_agendadas")
      .select("*")
      .eq("user_id", resolvedUid)
      .eq("data_enquete", today)
      .order("horario_inicio", { ascending: false });

    if (queryErr) {
      console.error("[serve-xml-enquete] query error:", queryErr.message);
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${esc("Não foi possível carregar a enquete")}</error>`, {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    // Filter by time window (including cross-midnight)
    let scheduled = (list || []).find((e: any) => {
      const start = normTime(e.horario_inicio, "00:00");
      const end = normTime(e.horario_fim, "23:59");
      if (start <= end) {
        return currentTime >= start && currentTime <= end;
      }
      return currentTime >= start || currentTime <= end;
    });

    // Fallback: se solicitado preview ou latest, ou se existe apenas 1 enquete cadastrada para hoje
    const allowLatest = url.searchParams.get("latest") === "1" || url.searchParams.get("preview") === "1";
    if (!scheduled && (list || []).length > 0 && allowLatest) {
      scheduled = (list || [])[0];
    }

    // Única exceção fora da data atual: uma enquete de ontem que atravessa
    // a meia-noite e ainda está dentro do seu horário final.
    if (!scheduled) {
      const { data: yesterdayList, error: yesterdayErr } = await sb
        .from("enquetes_agendadas")
        .select("*")
        .eq("user_id", resolvedUid)
        .eq("data_enquete", yesterday)
        .order("horario_inicio", { ascending: false });
      if (yesterdayErr) {
        console.error("[serve-xml-enquete] previous-day query error:", yesterdayErr.message);
        return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${esc("Não foi possível carregar a enquete")}</error>`, {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
        });
      }
      scheduled = (yesterdayList || []).find((e: any) => {
        const start = normTime(e.horario_inicio, "00:00");
        const end = normTime(e.horario_fim, "23:59");
        return start > end && currentTime <= end;
      });
    }


    let pergunta = "", r1 = "", r2 = "", r3 = "", r4 = "";
    let correta = 1, ini = "", fim = "";

    if (scheduled) {
      pergunta = scheduled.pergunta ?? "";
      r1 = scheduled.resposta1 ?? "";
      r2 = scheduled.resposta2 ?? "";
      r3 = scheduled.resposta3 ?? "";
      r4 = scheduled.resposta4 ?? "";
      correta = scheduled.resposta_correta ?? 1;
      ini = scheduled.horario_inicio ?? "";
      fim = scheduled.horario_fim ?? "";
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <enquete>
    <pergunta>${esc(pergunta)}</pergunta>
    <resposta1>${esc(r1)}</resposta1>
    <resposta2>${esc(r2)}</resposta2>
    <resposta3>${esc(r3)}</resposta3>
    <resposta4>${esc(r4)}</resposta4>
    <resposta_correta>${esc(correta)}</resposta_correta>
    <horario_inicio>${esc(ini)}</horario_inicio>
    <horario_fim>${esc(fim)}</horario_fim>
  </enquete>
</items>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
      },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response("<error>internal error</error>", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  }
});
