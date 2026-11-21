import { playerSupabase } from "@/integrations/supabase/playerClient";
import { markPlayerSession, getPlayerSessionUserId } from "./playerSession";

export interface PairingSyncData {
  deviceId: string;
  userId: string;
  slug: string;
  pairedUserEmail?: string;
  pairedUserName?: string;
  sessionTokens?: {
    access_token: string;
    refresh_token: string;
  };
}

/**
 * Armazena dados de pareamento para sincronização entre celular e TV
 */
export function savePairingSyncData(data: PairingSyncData) {
  try {
    const key = `nexohub_pairing_sync:${data.slug}:${data.deviceId}`;
    localStorage.setItem(key, JSON.stringify({
      ...data,
      savedAt: Date.now()
    }));
  } catch { /* ignore */ }
}

/**
 * Obtém dados de pareamento para um dispositivo específico
 */
export function getPairingSyncData(slug: string, deviceId: string): PairingSyncData | null {
  try {
    const key = `nexohub_pairing_sync:${slug}:${deviceId}`;
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    // Remove timestamp antes de retornar
    const { savedAt, ...data } = parsed;
    return data;
  } catch { return null; }
}

/**
 * Remove dados de pareamento
 */
export function clearPairingSyncData(slug?: string, deviceId?: string) {
  try {
    if (slug && deviceId) {
      const key = `nexohub_pairing_sync:${slug}:${deviceId}`;
      localStorage.removeItem(key);
    } else {
      // Remove todos os dados de pareamento
      const keys = Object.keys(localStorage);
      for (const key of keys) {
        if (key.startsWith("nexohub_pairing_sync:")) {
          localStorage.removeItem(key);
        }
      }
    }
  } catch { /* ignore */ }
}

/**
 * Sincroniza sessão entre celular e TV após pareamento bem-sucedido
 */
export async function syncSessionAfterPairing(
  deviceId: string,
  userId: string,
  slug: string
): Promise<boolean> {
  try {
    // Verifica se o dispositivo já está vinculado
    const { data: statusData, error: statusError } = await playerSupabase.functions.invoke(
      "nexo-tv-device",
      { body: { action: "status", deviceId } }
    );

    if (statusError || !statusData?.ok) {
      return false;
    }

    // Obtém tokens de sessão para a TV
    const { data: tokenData, error: tokenError } = await playerSupabase.functions.invoke(
      "nexo-tv-device",
      { body: { action: "getSession", deviceId } }
    );

    if (tokenError || !tokenData?.ok) {
      return false;
    }

    // Salva dados para a TV recuperar
    savePairingSyncData({
      deviceId,
      userId,
      slug,
      sessionTokens: tokenData.tokens
    });

    return true;
  } catch {
    return false;
  }
}

/**
 * Restaura sessão na TV a partir dos dados sincronizados pelo celular
 */
export async function restoreTvSessionFromPairing(
  deviceId: string,
  slug: string
): Promise<{ userId: string | null; success: boolean }> {
  try {
    const pairingData = getPairingSyncData(slug, deviceId);
    if (!pairingData || !pairingData.sessionTokens) {
      return { userId: null, success: false };
    }

    const { access_token, refresh_token } = pairingData.sessionTokens;

    // Restaura sessão na TV
    const { data: sessionData, error: sessionError } = await playerSupabase.auth.setSession({
      access_token,
      refresh_token
    });

    if (sessionError || !sessionData?.session?.user?.id) {
      return { userId: null, success: false };
    }

    const userId = sessionData.session.user.id;

    // Marca sessão do player
    markPlayerSession(userId);

    // Remove dados de pareamento após uso bem-sucedido
    clearPairingSyncData(slug, deviceId);

    return { userId, success: true };
  } catch {
    return { userId: null, success: false };
  }
}

/**
 * Verifica se há sessão pareada disponível para a TV
 */
export async function checkPairedSessionAvailable(
  slug: string,
  tvSessionId: string
): Promise<{ hasPairedSession: boolean; pairedUserName?: string }> {
  try {
    const { data, error } = await playerSupabase.functions.invoke("tv-pair-status", {
      body: { tvSessionId, userSlug: slug }
    });

    if (error || !data?.ok) {
      return { hasPairedSession: false };
    }

    const row = data.row;
    if (row?.status === "claimed" && row.paired_user_id) {
      return {
        hasPairedSession: true,
        pairedUserName: row.paired_name || row.paired_email || "Usuário"
      };
    }

    return { hasPairedSession: false };
  } catch {
    return { hasPairedSession: false };
  }
}
