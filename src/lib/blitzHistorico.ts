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
    // Nunca deixar a UI presa: se a sessão demorar, seguimos sem o autor.
    const u = await Promise.race([
      supabase.auth.getUser().then(r => r.data?.user ?? null),
      new Promise<null>(res => setTimeout(() => res(null), 3000)),
    ]);
    await supabase.from("blitz_promocionais_historico").insert({
      user_id: p.userId,
      blitz_id: p.blitzId,
      cliente: p.cliente ?? null,
      acao: p.acao,
      motivo: p.motivo ?? null,
      dados_antes: p.dadosAntes ?? null,
      dados_depois: p.dadosDepois ?? null,
      changed_by: u?.id ?? null,
      changed_by_email: u?.email ?? null,
    });
  } catch (e) {
    console.warn("[blitz-hist] falhou", e);
  }
}
