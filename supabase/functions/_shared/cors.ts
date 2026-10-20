// Shared CORS headers for NexoHub Bridge Edge Functions.
// Keep this local to avoid resolving the npm subpath during Deno type-checks.
export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};
