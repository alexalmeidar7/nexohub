import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

interface SyncSessionRequest {
  deviceId: string;
  userId: string;
  userSlug: string;
  userEmail?: string;
  userName?: string;
}

interface SyncSessionResponse {
  ok: boolean;
  sessionTokens?: {
    access_token: string;
    refresh_token: string;
  };
  reason?: string;
}

const handler = async (req: Request): Promise<Response> => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { deviceId, userId, userSlug, userEmail, userName } = await req.json() as SyncSessionRequest;

    if (!deviceId || !userId || !userSlug) {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing_fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verifica se o usuário existe e obtém sessão
    const { data: userData, error: userError } = await supabase.auth.admin.getUserById(userId);
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ ok: false, reason: "user_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Cria uma sessão para o dispositivo TV
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.createSession({
      user_id: userId,
      factors: [{ factor_id: "device_tv" }],
    });

    if (sessionError || !sessionData.session) {
      return new Response(
        JSON.stringify({ ok: false, reason: "session_creation_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Armazena os tokens de sessão vinculados ao dispositivo
    const { error: storageError } = await supabase
      .from("tv_device_sessions")
      .upsert({
        device_id: deviceId,
        user_id: userId,
        user_slug: userSlug,
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
        expires_at: new Date(sessionData.session.expires_at).toISOString(),
        user_email: userEmail,
        user_name: userName,
        created_at: new Date().toISOString(),
      }, {
        onConflict: "device_id,user_id",
      });

    if (storageError) {
      console.error("Erro ao armazenar sessão:", storageError);
      return new Response(
        JSON.stringify({ ok: false, reason: "storage_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response: SyncSessionResponse = {
      ok: true,
      sessionTokens: {
        access_token: sessionData.session.access_token,
        refresh_token: sessionData.session.refresh_token,
      },
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erro na sincronização de sessão:", error);
    return new Response(
      JSON.stringify({ ok: false, reason: "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);