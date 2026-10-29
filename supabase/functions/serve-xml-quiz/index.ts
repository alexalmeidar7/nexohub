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
  positivafm: "d17e65af-e407-466f-9b60-b55c43399513",
  positiva: "d17e65af-e407-466f-9b60-b55c43399513",
  p: "d17e65af-e407-466f-9b60-b55c43399513",
  sub_positiva_opec: "d17e65af-e407-466f-9b60-b55c43399513",
  interativafm: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
  interativa: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
  transmissao: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
  jornal: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
  culturafm973: "66337743-4e4f-4950-b58f-750b0c76861e",
  cultura: "66337743-4e4f-4950-b58f-750b0c76861e",
  alex: "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const sb = createClient(supabaseUrl, serviceKey);

  // Get current date and time in America/Sao_Paulo
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

  try {
    // ── POST: SALVAR / EXCLUIR / SINCRONIZAR QUIZ VIA SERVICE ROLE (IGNORA RLS) ──
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
        const idToDelete = body.id || body.quizId;
        let query = sb.from("quiz_agendados").delete().eq("user_id", targetUid);
        if (isUUID(idToDelete)) query = query.eq("id", idToDelete);
        else if (typeof body.pergunta === "string" && body.pergunta.trim()) query = query.eq("pergunta", body.pergunta);
        else return new Response(JSON.stringify({ ok: false, error: "Informe um ID ou pergunta válida para excluir." }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { data, error } = await query.select("id");
        if (error) throw error;
        if (!data?.length) return new Response(JSON.stringify({ ok: false, error: "Quiz não encontrado nesta emissora." }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ ok: true, action: "deleted", count: data.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === "sync" && Array.isArray(body.quizzes)) {
        if (body.quizzes.length > 500) return new Response(JSON.stringify({ ok: false, error: "Limite de 500 quizzes por sincronização." }), { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const ownershipError = await assertOwnedRecordIds(sb, "quiz_agendados", body.quizzes.map((item: any) => item?.id), targetUid);
        if (ownershipError) return ownershipError;
        const rows = body.quizzes.map((item: any) => ({
          ...(isUUID(item?.id) ? { id: item.id } : {}),
          user_id: targetUid,
          pergunta: item?.pergunta || "",
          resposta1: item?.resposta1 || "",
          resposta2: item?.resposta2 || "",
          resposta3: item?.resposta3 || "",
          resposta4: item?.resposta4 || "",
          resposta_correta: Number(item?.resposta_correta) || 1,
          data_quiz: item?.data_quiz || today,
          horario_inicio: item?.horario_inicio || "00:00",
          horario_fim: item?.horario_fim || "23:59",
          explicacao: item?.explicacao || "",
          imagem_resposta: item?.imagem_resposta || "",
        }));
        if (rows.length) {
          const { error } = await sb.from("quiz_agendados").upsert(rows);
          if (error) throw error;
        }
        return new Response(JSON.stringify({ ok: true, action: "synced", count: rows.length }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Default: save single quiz
      const qz = body.quiz || body;
      if (qz.pergunta && qz.resposta1) {
        const row: any = {
          user_id: targetUid,
          pergunta: qz.pergunta,
          resposta1: qz.resposta1,
          resposta2: qz.resposta2 || "",
          resposta3: qz.resposta3 || "",
          resposta4: qz.resposta4 || "",
          resposta_correta: Number(qz.resposta_correta) || 1,
          data_quiz: qz.data_quiz || today,
          horario_inicio: qz.horario_inicio || "00:00",
          horario_fim: qz.horario_fim || "23:59",
          explicacao: qz.explicacao || "",
          imagem_resposta: qz.imagem_resposta || "",
        };
        if (isUUID(qz.id)) row.id = qz.id;
        const ownershipError = await assertOwnedRecordIds(sb, "quiz_agendados", [row.id], targetUid);
        if (ownershipError) return ownershipError;
        const { data, error } = await sb.from("quiz_agendados").upsert(row).select();
        if (error) {
          console.error("[serve-xml-quiz] Save error:", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, action: "saved", data }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ ok: false, error: "Dados incompletos do quiz" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── GET: SERVIR XML DO QUIZ ATIVO ──
    const url = new URL(req.url);
    const rawUserId = url.searchParams.get("user_id") || "";
    const rawSlug = url.searchParams.get("slug") || "";

    const cleanInput = (rawUserId || rawSlug).toLowerCase().trim();
    const resolvedUid = SLUG_TO_UID[cleanInput] || (isUUID(rawUserId) ? rawUserId : "");
    if (!resolvedUid) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>Identificador da emissora ausente ou inválido</error>`, {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    console.log(`[serve-xml-quiz] GET for userId: ${resolvedUid}, Date: ${today}, Time: ${currentTime}`);

    const { data: list, error: queryErr } = await sb
      .from("quiz_agendados")
      .select("*")
      .eq("user_id", resolvedUid)
      .eq("data_quiz", today)
      .order("created_at", { ascending: false });

    if (queryErr) {
      console.error("[serve-xml-quiz] query error:", queryErr.message);
      return new Response('<?xml version="1.0" encoding="UTF-8"?><items><dados><erro>Não foi possível carregar o quiz</erro></dados></items>', {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      });
    }

    // Filter by time window (including cross-midnight)
    let quiz = (list || []).find((q: any) => {
      const start = normTime(q.horario_inicio, "00:00");
      const end = normTime(q.horario_fim, "23:59");
      if (start <= end) {
        return currentTime >= start && currentTime <= end;
      }
      return currentTime >= start || currentTime <= end;
    });

    const allowLatest = url.searchParams.get("latest") === "1" || url.searchParams.get("preview") === "1";
    if (!quiz && (list || []).length > 0 && allowLatest) {
      quiz = (list || [])[0];
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<items>\n  <dados>\n';
    if (quiz) {
      const respostaCorretaNum = Number(quiz.resposta_correta) || 1;
      const respostaCorretaTexto =
        respostaCorretaNum === 1
          ? quiz.resposta1
          : respostaCorretaNum === 2
          ? quiz.resposta2
          : respostaCorretaNum === 3
          ? quiz.resposta3
          : quiz.resposta4;

      xml += `    <pergunta>${esc(quiz.pergunta)}</pergunta>\n`;
      xml += `    <resposta1>${esc(quiz.resposta1)}</resposta1>\n`;
      xml += `    <resposta2>${esc(quiz.resposta2)}</resposta2>\n`;
      xml += `    <resposta3>${esc(quiz.resposta3 || "")}</resposta3>\n`;
      xml += `    <resposta4>${esc(quiz.resposta4 || "")}</resposta4>\n`;
      xml += `    <resposta_correta>${esc(quiz.resposta_correta || 1)}</resposta_correta>\n`;
      xml += `    <resposta_correta_texto>${esc(respostaCorretaTexto || "")}</resposta_correta_texto>\n`;
      xml += `    <horario_inicio>${esc(quiz.horario_inicio || "")}</horario_inicio>\n`;
      xml += `    <horario_fim>${esc(quiz.horario_fim || "")}</horario_fim>\n`;
      xml += `    <explicacao>${esc(quiz.explicacao || "")}</explicacao>\n`;
      xml += `    <imagem_resposta>${esc(quiz.imagem_resposta || "")}</imagem_resposta>\n`;
    } else {
      xml += `    <pergunta></pergunta>\n`;
      xml += `    <resposta1></resposta1>\n`;
      xml += `    <resposta2></resposta2>\n`;
      xml += `    <resposta3></resposta3>\n`;
      xml += `    <resposta4></resposta4>\n`;
      xml += `    <resposta_correta></resposta_correta>\n`;
      xml += `    <resposta_correta_texto></resposta_correta_texto>\n`;
      xml += `    <horario_inicio></horario_inicio>\n`;
      xml += `    <horario_fim></horario_fim>\n`;
      xml += `    <explicacao></explicacao>\n`;
      xml += `    <imagem_resposta></imagem_resposta>\n`;
    }
    xml += `  </dados>\n</items>`;

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
    return new Response("<items><dados><erro>internal error</erro></dados></items>", {
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store" },
      status: 500,
    });
  }
});
