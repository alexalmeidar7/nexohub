import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

  const { data } = await supabase
    .from("player_listener_profiles")
    .select("nome, email, cidade, estado, whatsapp, sexo, cpf, setor, data_nascimento, avatar_url, sub_profiles")
    .eq("auth_user_id", authUser.id)
    .eq("radio_user_id", radioUserId)
    .maybeSingle();

  if (!data && authUser.id === radioUserId) {
    const { data: ownerProfile } = await supabase
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
) {
  return supabase.from("player_listener_profiles").upsert({
    auth_user_id: authUserId,
    radio_user_id: radioUserId,
    ...patch,
    updated_at: new Date().toISOString(),
  } as any, { onConflict: "auth_user_id,radio_user_id" });
}

export function scopedRadioFilter<T extends { eq: (column: string, value: any) => T; is: (column: string, value: null) => T }>(
  query: T,
  radioUserId: string | null | undefined,
) {
  return radioUserId ? query.eq("radio_user_id", radioUserId) : query.is("radio_user_id", null);
}