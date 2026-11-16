import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";
import { authResilientFetch } from "./authFetch";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Keep Player auth in a separate browser storage namespace. The dashboard can
// sign in or out without replacing the Player session (and vice versa).
export const playerSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  global: { fetch: authResilientFetch },
  auth: {
    storageKey: "nexohub-player-auth-token",
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Keep the Player's local development fallbacks available after separating its
// auth client from the dashboard client.
import { invokeWeatherFunction } from "@/lib/weatherService";
import { invokeFetchRss, invokeFetchRssTitles } from "@/lib/rssService";

const originalPlayerInvoke = playerSupabase.functions.invoke.bind(playerSupabase.functions);
playerSupabase.functions.invoke = (async (functionName: string, options?: any) => {
  if (functionName === "fetch-weather") return invokeWeatherFunction(options?.body);
  if (functionName === "fetch-rss") return invokeFetchRss(options?.body);
  if (functionName === "fetch-rss-titles") return invokeFetchRssTitles(options?.body);
  return originalPlayerInvoke(functionName, options);
}) as any;
