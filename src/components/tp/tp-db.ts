import { supabase } from "@/integrations/supabase/client";

export interface ActiveTeleprompter {
  id: string;
  nome: string;
  estudio: string;
  ativo: boolean;
  texto_atual: string | null;
  is_html: boolean | null;
}

export async function ensureActiveTeleprompter(userId: string): Promise<ActiveTeleprompter> {
  const { data: existing, error } = await (supabase as any)
    .from("teleprompters")
    .select("id, nome, estudio, ativo, texto_atual, is_html, created_at")
    .eq("user_id", userId)
    .order("ativo", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw error;

  const active = existing?.find((tp: any) => tp.ativo);
  if (active) return active as ActiveTeleprompter;

  const latest = existing?.[0];
  if (latest) {
    const { data: reactivated, error: reactivateError } = await (supabase as any)
      .from("teleprompters")
      .update({ ativo: true })
      .eq("id", latest.id)
      .select("id, nome, estudio, ativo, texto_atual, is_html")
      .single();

    if (reactivateError) throw reactivateError;
    return reactivated as ActiveTeleprompter;
  }

  const { data: programData } = await supabase
    .from("programas")
    .select("estudio")
    .eq("user_id", userId)
    .not("estudio", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);

  const estudio = programData?.[0]?.estudio?.trim() || "Estudio FM";

  const { data: created, error: createError } = await (supabase as any)
    .from("teleprompters")
    .insert({
      user_id: userId,
      estudio,
      nome: "TP Principal",
      ativo: true,
    })
    .select("id, nome, estudio, ativo, texto_atual, is_html")
    .single();

  if (createError) throw createError;
  return created as ActiveTeleprompter;
}