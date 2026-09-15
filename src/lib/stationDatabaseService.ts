import { supabase } from "@/integrations/supabase/client";
import { findClientAccountByEmail, findClientAccountById, ClientAccountInfo } from "./clientAuthAccounts";
import { getClientHouseMixProgramsSync, HouseMixProgramInfo } from "./houseMixProgramasService";

export interface StationDatabaseData {
  userId: string;
  slug: string;
  channels: any[];
  programas: any[];
  apresentadores: any[];
  prerolls: any[];
  empresa: any | null;
  shopProducts: any[];
  musicData: {
    titulo: string;
    artista: string;
    capa: string;
    horario?: string;
    duracao?: number;
  } | null;
  musicStartTime: number | null;
  currentProgram: any | null;
  currentPresenter: { id: string; nome: string; foto: string } | null;
  lastUpdated: number;
}

const memoryCache = new Map<string, StationDatabaseData>();
const inflightRequests = new Map<string, Promise<StationDatabaseData | null>>();

function getStorageKey(key: string): string {
  return `nexohub_station_db_${key}`;
}

/**
 * Returns instantaneous cached database data for a user or station slug.
 */
export function getStationDatabaseSync(userIdOrEmailOrSlug?: string | null): StationDatabaseData | null {
  if (!userIdOrEmailOrSlug) return null;
  
  const acc = findClientAccountByEmail(userIdOrEmailOrSlug) || findClientAccountById(userIdOrEmailOrSlug);
  const lookupKeys = [
    userIdOrEmailOrSlug,
    acc?.id,
    acc?.slug,
    acc?.email,
    acc?.parentUserId
  ].filter(Boolean) as string[];

  for (const k of lookupKeys) {
    if (memoryCache.has(k)) {
      return memoryCache.get(k)!;
    }
    try {
      const stored = localStorage.getItem(getStorageKey(k));
      if (stored) {
        const parsed: StationDatabaseData = JSON.parse(stored);
        if (parsed && parsed.programas) {
          memoryCache.set(k, parsed);
          return parsed;
        }
      }
    } catch {}
  }

  // If not yet in cache, synthesize from official grade & client account
  if (acc) {
    const fallbackRaw = getClientHouseMixProgramsSync(acc.id, acc.email);
    const fallbackPrograms: any[] = Array.isArray(fallbackRaw) ? fallbackRaw : (fallbackRaw?.programas || []);
    const synth: StationDatabaseData = {
      userId: acc.id,
      slug: acc.slug,
      channels: [],
      programas: fallbackPrograms,
      apresentadores: [],
      prerolls: [],
      empresa: {
        nome_fantasia: acc.nome,
        razao_social: acc.razaoSocial,
        cidade: acc.cidade,
      },
      shopProducts: [],
      musicData: null,
      musicStartTime: null,
      currentProgram: null,
      currentPresenter: null,
      lastUpdated: Date.now()
    };
    return synth;
  }

  return null;
}

/**
 * Fetches real database rows for a station from Supabase public-player-data edge function.
 */
export async function fetchStationDatabaseData(
  userIdOrEmailOrSlug?: string | null
): Promise<StationDatabaseData | null> {
  if (!userIdOrEmailOrSlug) return null;

  const acc = findClientAccountByEmail(userIdOrEmailOrSlug) || findClientAccountById(userIdOrEmailOrSlug);
  const targetSlug = acc?.slug || userIdOrEmailOrSlug;

  const cacheKey = acc?.id || targetSlug;
  if (inflightRequests.has(cacheKey)) {
    return inflightRequests.get(cacheKey)!;
  }

  const promise = (async (): Promise<StationDatabaseData | null> => {
    try {
      const SUPABASE_URL = (import.meta as any).env?.VITE_SUPABASE_URL || "https://zzjfzxxvxbspbdkodoix.supabase.co";
      const ANON_KEY =
        (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp6amZ6eHh2eGJzcGJka29kb2l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyOTUxNDEsImV4cCI6MjA4Njg3MTE0MX0.isUmXafM1scN8AogofAEw5ffcVZSZX4ff-WVusaB1OU";

      const url = `${SUPABASE_URL}/functions/v1/public-player-data?slug=${encodeURIComponent(targetSlug)}`;
      const res = await fetch(url, {
        headers: {
          apikey: ANON_KEY,
          Authorization: `Bearer ${ANON_KEY}`,
        },
      });

      if (!res.ok) {
        console.warn(`[stationDatabaseService] public-player-data returned ${res.status} for slug=${targetSlug}`);
        return getStationDatabaseSync(userIdOrEmailOrSlug);
      }

      const data = await res.json();
      if (!data || data.error) {
        return getStationDatabaseSync(userIdOrEmailOrSlug);
      }

      const fallbackRaw = acc ? getClientHouseMixProgramsSync(acc.id, acc.email) : [];
      const fallbackPrograms: any[] = Array.isArray(fallbackRaw) ? fallbackRaw : (fallbackRaw?.programas || []);

      const result: StationDatabaseData = {
        userId: data.userId || acc?.id || "",
        slug: targetSlug,
        channels: Array.isArray(data.channels) ? data.channels : [],
        programas: Array.isArray(data.programas) && data.programas.length > 0
          ? data.programas
          : fallbackPrograms,
        apresentadores: Array.isArray(data.apresentadores) ? data.apresentadores : [],
        prerolls: Array.isArray(data.prerolls) ? data.prerolls : [],
        empresa: data.empresa || (acc ? { nome_fantasia: acc.nome, razao_social: acc.razaoSocial, cidade: acc.cidade } : null),
        shopProducts: Array.isArray(data.shopProducts) ? data.shopProducts : [],
        musicData: data.musicData || null,
        musicStartTime: data.musicStartTime || null,
        currentProgram: data.currentProgram || null,
        currentPresenter: data.currentPresenter || null,
        lastUpdated: Date.now(),
      };

      // Store in memory & localStorage
      const saveKeys = [result.userId, result.slug, acc?.email, acc?.id].filter(Boolean) as string[];
      for (const k of saveKeys) {
        memoryCache.set(k, result);
        try {
          localStorage.setItem(getStorageKey(k), JSON.stringify(result));
        } catch {}
      }

      return result;
    } catch (err) {
      console.warn(`[stationDatabaseService] Error fetching station data:`, err);
      return getStationDatabaseSync(userIdOrEmailOrSlug);
    } finally {
      inflightRequests.delete(cacheKey);
    }
  })();

  inflightRequests.set(cacheKey, promise);
  return promise;
}

/**
 * Preloads all known radio stations into cache in background.
 */
export async function preloadAllStationsDatabase(): Promise<void> {
  const slugs = ["positivafm", "interativafm", "transmissao", "culturafm973"];
  await Promise.allSettled(slugs.map((s) => fetchStationDatabaseData(s)));
}
