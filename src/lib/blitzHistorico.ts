import { supabase } from "@/integrations/supabase/client";

export type BlitzHistAcao =
  | "criada"
  | "editada"
  | "encerrada"
  | "reaberta"
  | "excluida"
  | "expirada";

export interface BlitzHistPayload {
  userId: string;
  blitzId: string | null;
  cliente?: string | null;
  acao: BlitzHistAcao;
  motivo?: string | null;
  dadosAntes?: any;
  dadosDepois?: any;
}

export async function logBlitzHistorico(p: BlitzHistPayload) {
  try {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("blitz_promocionais_historico").insert({
      user_id: p.userId,
      blitz_id: p.blitzId,
      cliente: p.cliente ?? null,
      acao: p.acao,
      motivo: p.motivo ?? null,
      dados_antes: p.dadosAntes ?? null,
      dados_depois: p.dadosDepois ?? null,
      changed_by: u.user?.id ?? null,
      changed_by_email: u.user?.email ?? null,
    });
  } catch (e) {
    console.warn("[blitz-hist] falhou", e);
  }
}
