import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FIELD_KEYS = [
  "nome", "cpf", "telefone", "email", "sexo",
  "data_nascimento", "uf", "cidade", "setor",
  "escolaridade", "renda",
] as const;

const DEFAULT_RULES: Record<string, number> = {
  nome: 10, cpf: 15, telefone: 15, email: 10, sexo: 5,
  data_nascimento: 10, uf: 5, cidade: 5, setor: 5,
  escolaridade: 10, renda: 10,
};

const filled = (v: unknown) => v != null && String(v).trim().length > 0;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const radioUserId = str(body.radio_user_id);
    const p = (body.profile || {}) as Record<string, unknown>;
    const email = str(p.email).toLowerCase();
    const cpf = str(p.cpf);
    const telefone = str(p.telefone ?? p.whatsapp);
    const nome = str(p.nome);

    if (!radioUserId) return json({ ok: false, error: "radio_user_id_required" });
    if (!email && !cpf && !telefone) return json({ ok: false, error: "no_identifier" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Regras de pontuação do cadastro de ouvinte (dono da rádio)
    let rules = { ...DEFAULT_RULES };
    try {
      const { data: settings } = await admin
        .from("user_settings")
        .select("dashboard_items")
        .eq("user_id", radioUserId)
        .maybeSingle();
      const stored = (settings?.dashboard_items as Record<string, unknown> | null)
        ?.pontuacao_rules_cadastro as Record<string, number> | undefined;
      if (stored && typeof stored === "object") rules = { ...rules, ...stored };
    } catch { /* usa defaults */ }

    // Localiza ouvinte existente por qualquer identificador
    let existing: Record<string, any> | null = null;
    for (const f of [
      email ? { col: "email", val: email } : null,
      cpf ? { col: "cpf", val: cpf } : null,
      telefone ? { col: "telefone", val: telefone } : null,
    ].filter(Boolean) as Array<{ col: string; val: string }>) {
      const { data } = await admin
        .from("ouvintes")
        .select("*")
        .eq("user_id", radioUserId)
        .eq(f.col, f.val)
        .maybeSingle();
      if (data) { existing = data as Record<string, any>; break; }
    }

    if (existing?.banido === true) return json({ ok: false, error: "banido" });

    const uf = str(p.estado ?? p.uf).toUpperCase();
    const cidade = str(p.cidade);
    const cidadeFinal = cidade ? (uf ? `${cidade}/${uf}` : cidade) : null;

    const merged: Record<string, string | null> = {
      nome: nome || existing?.nome || null,
      cpf: cpf || existing?.cpf || null,
      telefone: telefone || existing?.telefone || null,
      email: email || existing?.email || null,
      sexo: str(p.sexo) || existing?.sexo || null,
      data_nascimento: str(p.data_nascimento) || existing?.data_nascimento || null,
      cidade: cidadeFinal || existing?.cidade || null,
      setor: str(p.setor) || existing?.setor || null,
      escolaridade: str(p.escolaridade) || existing?.escolaridade || null,
      renda: str(p.renda) || existing?.renda || null,
    };
    merged.uf = uf || (String(merged.cidade || "").match(/\/([A-Z]{2})$/)?.[1] ?? null);

    let pontuacao = 0;
    for (const key of FIELD_KEYS) {
      if (filled(merged[key])) pontuacao += Number(rules[key]) || 0;
    }

    const payload: Record<string, unknown> = {
      user_id: radioUserId,
      nome: merged.nome,
      cpf: merged.cpf,
      telefone: merged.telefone,
      email: merged.email,
      sexo: merged.sexo,
      data_nascimento: merged.data_nascimento,
      cidade: merged.cidade,
      setor: merged.setor,
      escolaridade: merged.escolaridade,
      renda: merged.renda,
      pontuacao,
      origem_cadastro: existing?.origem_cadastro || "player_site",
    };

    if (existing) {
      const { error } = await admin.from("ouvintes").update(payload).eq("id", existing.id);
      if (error) return json({ ok: false, error: error.message });
      return json({ ok: true, pontuacao, id: existing.id });
    }

    const { data, error } = await admin.from("ouvintes").insert(payload).select("id").maybeSingle();
    if (error) return json({ ok: false, error: error.message });
    return json({ ok: true, pontuacao, id: (data as any)?.id });
  } catch (e) {
    console.error("sync-listener-points exception:", e);
    return json({ ok: false, error: String(e) });
  }
});
