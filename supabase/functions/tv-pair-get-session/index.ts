import { serve } from "https://deno.land/std@0.192.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7";
import { corsHeaders } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

interface GetSessionRequest {
  pairedUserId?: string;
  userSlug?: string;
  deviceId?: string;
}

interface GetSessionResponse {
  ok: boolean;
  row?: {
    user_id: string;
    user_email?: string;
    user_name?: string;
    device_id: string;
    user_slug: string;
    expires_at: string;
    created_at: string;
    updated_at: string;
  };
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
    const { pairedUserId, userSlug, deviceId } = await req.json() as GetSessionRequest;

    if (!pairedUserId && !deviceId) {
      return new Response(
        JSON.stringify({ ok: false, reason: "missing_identifier" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let query = supabase
      .from("tv_device_sessions")
      .select("*");

    if (pairedUserId) {
      query = query.eq("user_id", pairedUserId);
    }
    
    if (deviceId) {
      query = query.eq("device_id", deviceId);
    }
    
    if (userSlug) {
      query = query.eq("user_slug", userSlug);
    }

    const { data: sessionData, error } = await query
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      console.error("Erro ao buscar sessão:", error);
      return new Response(
        JSON.stringify({ ok: false, reason: "query_failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!sessionData || sessionData.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, reason: "session_not_found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const session = sessionData[0];
    
    // Verifica se a sessão ainda é válida
    const expiresAt = new Date(session.expires_at);
    const now = new Date();
    
    if (expiresAt < now) {
      // Sessão expirada, remove do banco
      await supabase
        .from("tv_device_sessions")
        .delete()
        .eq("device_id", session.device_id)
        .eq("user_id", session.user_id);
      
      return new Response(
        JSON.stringify({ ok: false, reason: "session_expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const response: GetSessionResponse = {
      ok: true,
      row: {
        user_id: session.user_id,
        user_email: session.user_email,
        user_name: session.user_name,
        device_id: session.device_id,
        user_slug: session.user_slug,
        expires_at: session.expires_at,
        created_at: session.created_at,
        updated_at: session.updated_at,
      },
      sessionTokens: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
      },
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Erro ao recuperar sessão:", error);
    return new Response(
      JSON.stringify({ ok: false, reason: "server_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);