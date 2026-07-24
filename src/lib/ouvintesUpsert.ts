/**
 * Shared helper para o cadastro unificado de ouvintes.
 *
 * Objetivo: garantir que os 3 caminhos de origem alimentem a mesma tabela
 * `public.ouvintes`, sem duplicar registros e aplicando automaticamente as
 * REGRAS DE PONTUAÇÃO cadastradas em Ouvintes → Regras de Pontuação
 * (aba "Formulário de Cadastro").
 *
 * Origens suportadas:
 *  - "manual"      — cadastro direto na página Ouvintes (admin)
 *  - "player_site" — via formulário do player/site
 *  - "app"         — via aplicativo mobile
 *  - "chatbot"     — legado (mantido)
 */

import { supabase } from "@/integrations/supabase/client";

export type OuvinteOrigem = "manual" | "player_site" | "app" | "chatbot";

/** Chaves de campo que somam pontos no formulário de cadastro. */
export const CADASTRO_FIELD_KEYS = [
  "nome", "cpf", "telefone", "email", "sexo",
  "data_nascimento", "uf", "cidade", "setor",
  "escolaridade", "renda",
] as const;

export type CadastroFieldKey = typeof CADASTRO_FIELD_KEYS[number];

/** Valores padrão (idênticos aos exibidos em PontuacaoRulesSection). */
export const DEFAULT_CADASTRO_RULES: Record<CadastroFieldKey, number> = {
  nome: 10, cpf: 15, telefone: 15, email: 10, sexo: 5,
  data_nascimento: 10, uf: 5, cidade: 5, setor: 5,
  escolaridade: 10, renda: 10,
};

const rulesLocalKey = (uid?: string | null) => `nexohub_pontuacao_rules_cadastro_${uid || "anon"}`;

/**
 * Lê as regras persistidas para um radio_user_id (dono da rádio).
 * Prioridade: localStorage (rápido, aba do admin) → user_settings.dashboard_items → defaults.
 */
export async function getPontuacaoRulesCadastro(radioUserId: string | null | undefined): Promise<Record<string, number>> {
  // 1) localStorage
  try {
    const raw = localStorage.getItem(rulesLocalKey(radioUserId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { ...DEFAULT_CADASTRO_RULES, ...parsed };
      }
    }
  } catch { /* ignore */ }
  // 2) user_settings.dashboard_items (compartilhado — funciona no player/app)
  if (radioUserId) {
    try {
      const { data } = await supabase
        .from("user_settings")
        .select("dashboard_items")
        .eq("user_id", radioUserId)
        .maybeSingle();
      const items = (data?.dashboard_items || {}) as Record<string, unknown>;
      const stored = items.pontuacao_rules_cadastro as Record<string, number> | undefined;
      if (stored && typeof stored === "object") {
        return { ...DEFAULT_CADASTRO_RULES, ...stored };
      }
    } catch { /* ignore */ }
  }
  return { ...DEFAULT_CADASTRO_RULES };
}

/** Considera um campo "preenchido" apenas se tem valor não vazio. */
function isFilled(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  return s.length > 0;
}

export interface CadastroFieldMap {
  nome?: string | null;
  cpf?: string | null;
  telefone?: string | null;
  email?: string | null;
  sexo?: string | null;
  data_nascimento?: string | null;
  uf?: string | null;
  cidade?: string | null;
  setor?: string | null;
  escolaridade?: string | null;
  renda?: string | null;
}

/** Soma dos pontos para os campos preenchidos, conforme as regras. */
export function computePontuacaoFromRules(
  fields: CadastroFieldMap,
  rules: Record<string, number>,
): number {
  let total = 0;
  for (const key of CADASTRO_FIELD_KEYS) {
    if (isFilled(fields[key])) {
      total += Number(rules[key]) || 0;
    }
  }
  return total;
}

export interface UpsertOuvinteInput {
  /** ID do dono da rádio (coluna user_id em ouvintes). */
  radioUserId: string;
  origem: OuvinteOrigem;
  fields: CadastroFieldMap & { cidade_uf?: string | null };
  /** Identificador da mensagem do WhatsApp (auditoria) — usado quando origem = "chatbot". */
  whatsappMessageId?: string | null;
}

/**
 * Faz upsert seguro do ouvinte:
 *  - Localiza registro existente por (user_id + email) OU (user_id + cpf) OU (user_id + telefone).
 *  - Se existe: atualiza apenas campos VAZIOS (não sobrescreve dados que o admin já editou).
 *    A pontuação é RECALCULADA sobre os campos resultantes.
 *  - Se não existe: cria com `origem_cadastro` = `origem` e pontuação calculada.
 *
 * Nunca lança — retorna { ok, id?, error? } para não interromper login/registro.
 */
export async function upsertOuvinteRecord(input: UpsertOuvinteInput): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { radioUserId, origem, fields, whatsappMessageId } = input;
  if (!radioUserId) return { ok: false, error: "missing radioUserId" };
  const nome = (fields.nome || "").trim();
  const email = (fields.email || "").trim();
  const cpf = (fields.cpf || "").trim();
  const telefone = (fields.telefone || "").trim();
  if (!nome && !email && !cpf && !telefone) return { ok: false, error: "no identifier" };

  try {
    // Look up existing por qualquer identificador único informado.
    let existing: Record<string, any> | null = null;
    const identifierFilters: Array<{ col: "email" | "cpf" | "telefone"; val: string }> = [];
    if (email) identifierFilters.push({ col: "email", val: email });
    if (cpf) identifierFilters.push({ col: "cpf", val: cpf });
    if (telefone) identifierFilters.push({ col: "telefone", val: telefone });

    for (const f of identifierFilters) {
      const { data } = await (supabase as any)
        .from("ouvintes")
        .select("*")
        .eq("user_id", radioUserId)
        .eq(f.col, f.val)
        .maybeSingle();
      if (data) { existing = data as Record<string, any>; break; }
    }

    // Banimento: ouvintes banidos não podem participar de promoções,
    // receber mensagens ou logar no player/site. Rejeitamos o upsert.
    if (existing && (existing as any).banido === true) {
      return { ok: false, error: "banido", id: existing.id as string };
    }

    const cidadeFinal = fields.cidade_uf
      ?? (fields.cidade && fields.uf
        ? `${String(fields.cidade).trim()}/${String(fields.uf).trim()}`
        : (fields.cidade || null));

    const merged: CadastroFieldMap = {
      nome: existing?.nome || nome || null,
      cpf: existing?.cpf || cpf || null,
      telefone: existing?.telefone || telefone || null,
      email: existing?.email || email || null,
      sexo: existing?.sexo || fields.sexo || null,
      data_nascimento: existing?.data_nascimento || fields.data_nascimento || null,
      cidade: existing?.cidade || cidadeFinal || null,
      // uf é embutido em `cidade` no formato "Cidade/UF"
      uf: (() => {
        const raw = existing?.cidade || cidadeFinal || "";
        const m = String(raw).match(/\/([A-Z]{2})$/);
        return m ? m[1] : (fields.uf || null);
      })(),
      setor: existing?.setor || fields.setor || null,
      escolaridade: existing?.escolaridade || fields.escolaridade || null,
      renda: existing?.renda || fields.renda || null,
    };

    const rules = await getPontuacaoRulesCadastro(radioUserId);
    const pontuacao = computePontuacaoFromRules(merged, rules);

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
      origem_cadastro: existing?.origem_cadastro || origem,
      whatsapp_message_id:
        origem === "chatbot"
          ? (whatsappMessageId || (existing as any)?.whatsapp_message_id || null)
          : ((existing as any)?.whatsapp_message_id ?? null),
    };

    if (existing) {
      const { error } = await (supabase as any).from("ouvintes").update(payload).eq("id", existing.id);
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: existing.id as string };
    } else {
      const { data, error } = await (supabase as any).from("ouvintes").insert(payload).select("id").maybeSingle();
      if (error) return { ok: false, error: error.message };
      return { ok: true, id: (data as any)?.id };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
