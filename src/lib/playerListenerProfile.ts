import type { User } from "@supabase/supabase-js";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { readLinkedTv } from "@/lib/nexoTvDevice";

export const PLAYER_DEFAULT_AVATAR = "/avatars/usr-default.png";

export type PlayerListenerProfile = {
  nome: string;
  email: string;
  cidade: string;
  estado: string;
  whatsapp?: string;
  sexo?: string;
  cpf?: string;
  setor?: string;
  data_nascimento?: string;
  avatar_url: string;
  sub_profiles?: Array<{ id: string; name: string; avatar_url: string; points?: number }>;
};

export function getGoogleProfileFallback(user: User | null | undefined, fallbackName = "Visitante"): PlayerListenerProfile {
  const googleIdentity = (user?.identities || []).find((i: any) => i.provider === "google");
  const gData: any = googleIdentity?.identity_data || {};
  const meta: any = user?.user_metadata || {};
  const email = gData.email || user?.email || "";
  return {
    nome: gData.full_name || gData.name || meta.full_name || meta.name || email.split("@")[0] || fallbackName,
    email,
    cidade: "",
    estado: "",
    avatar_url: gData.avatar_url || gData.picture || meta.avatar_url || meta.picture || PLAYER_DEFAULT_AVATAR,
    sub_profiles: [],
  };
}

export async function fetchPlayerListenerProfile(
  authUser: User | null | undefined,
  radioUserId: string | null | undefined,
  fallbackName = "Visitante",
): Promise<PlayerListenerProfile> {
  const fallback = getGoogleProfileFallback(authUser, fallbackName);
  if (!authUser?.id || !radioUserId) return fallback;

  const { data } = await playerSupabase
    .from("player_listener_profiles")
    .select("nome, email, cidade, estado, whatsapp, sexo, cpf, setor, data_nascimento, avatar_url, sub_profiles")
    .eq("auth_user_id", authUser.id)
    .eq("radio_user_id", radioUserId)
    .maybeSingle();

  if (!data && authUser.id === radioUserId) {
    const { data: ownerProfile } = await playerSupabase
      .from("profiles")
      .select("nome, email, cidade, estado, whatsapp, sexo, cpf, setor, data_nascimento, avatar_url, sub_profiles")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (ownerProfile) {
      return {
        nome: ownerProfile.nome || fallback.nome,
        email: ownerProfile.email || fallback.email,
        cidade: ownerProfile.cidade || "",
        estado: ownerProfile.estado || "",
        whatsapp: ownerProfile.whatsapp || "",
        sexo: ownerProfile.sexo || "",
        cpf: ownerProfile.cpf || "",
        setor: ownerProfile.setor || "",
        data_nascimento: ownerProfile.data_nascimento || "",
        avatar_url: ownerProfile.avatar_url || fallback.avatar_url || PLAYER_DEFAULT_AVATAR,
        sub_profiles: Array.isArray(ownerProfile.sub_profiles) ? ownerProfile.sub_profiles as PlayerListenerProfile["sub_profiles"] : [],
      };
    }
  }

  if (!data) return fallback;
  const subProfiles = Array.isArray(data.sub_profiles) ? data.sub_profiles as PlayerListenerProfile["sub_profiles"] : [];
  return {
    nome: data.nome || fallback.nome,
    email: data.email || fallback.email,
    cidade: data.cidade || "",
    estado: data.estado || "",
    whatsapp: data.whatsapp || "",
    sexo: data.sexo || "",
    cpf: data.cpf || "",
    setor: data.setor || "",
    data_nascimento: data.data_nascimento || "",
    avatar_url: data.avatar_url || fallback.avatar_url || PLAYER_DEFAULT_AVATAR,
    sub_profiles: subProfiles,
  };
}

export async function upsertPlayerListenerProfile(
  authUserId: string,
  radioUserId: string,
  patch: Partial<PlayerListenerProfile>,
  origem: "player_site" | "app" = "player_site",
) {
  const result = await playerSupabase.from("player_listener_profiles").upsert({
    auth_user_id: authUserId,
    radio_user_id: radioUserId,
    ...patch,
    updated_at: new Date().toISOString(),
  } as any, { onConflict: "auth_user_id,radio_user_id" });

  // A linked TV edits presentation profiles. Its registration is completed
  // through the mobile enrollment endpoint, which owns field-credit accounting.
  if (readLinkedTv()?.userId === authUserId) return result;

  // Reflete o cadastro na tabela `ouvintes` (CRM) — sem interromper o fluxo
  // caso o upsert do CRM falhe. Origem preserva a fonte original quando o
  // ouvinte já existir (definido em upsertOuvinteRecord).
  try {
    const { upsertOuvinteRecord } = await import("./ouvintesUpsert");
    // Separa cidade/UF quando o profile persistir campos separados.
    const cidade = (patch as any).cidade || "";
    const estado = (patch as any).estado || "";
    const cidade_uf = cidade
      ? (estado ? `${String(cidade).trim()}/${String(estado).trim()}` : String(cidade).trim())
      : null;
    void upsertOuvinteRecord({
      radioUserId,
      origem,
      fields: {
        nome: (patch as any).nome || null,
        email: (patch as any).email || null,
        cpf: (patch as any).cpf || null,
        telefone: (patch as any).whatsapp || null,
        sexo: (patch as any).sexo || null,
        data_nascimento: (patch as any).data_nascimento || null,
        setor: (patch as any).setor || null,
        cidade_uf,
      },
    });
  } catch { /* ignore — CRM é best-effort */ }

  return result;
}

export function scopedRadioFilter<T extends { eq: (column: string, value: any) => T; is: (column: string, value: null) => T }>(
  query: T,
  radioUserId: string | null | undefined,
) {
  return radioUserId ? query.eq("radio_user_id", radioUserId) : query.is("radio_user_id", null);
}
