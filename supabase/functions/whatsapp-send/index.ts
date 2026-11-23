// Send a WhatsApp message via Meta Cloud API on behalf of the authenticated user
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadStationWhatsAppToken } from "../_shared/whatsapp-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) return json({ error: "Unauthorized" }, 401);
  const userId = userData.user.id;


  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Bad JSON" }, 400); }

  const { contact_id, to, text, take_over } = body;
  if (!text || typeof text !== "string" || !text.trim()) return json({ error: "Mensagem vazia" }, 400);
  if (text.length > 4096) return json({ error: "Mensagem muito longa (máx 4096)" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: account } = await admin.from("sub_users").select("parent_user_id")
    .eq("auth_user_id", userId).eq("ativo", true).maybeSingle();
  const stationOwnerId = account?.parent_user_id || userId;

  // Resolve contact
  let contact: any = null;
  if (contact_id) {
    const { data } = await admin.from("wa_contacts").select("*").eq("id", contact_id).eq("user_id", stationOwnerId).maybeSingle();
    contact = data;
  } else if (to) {
    const phone = String(to).replace(/\D/g, "");
    const { data: found } = await admin.from("wa_contacts").select("*").eq("user_id", stationOwnerId).eq("phone", phone).maybeSingle();
    if (found) contact = found;
    else {
      const { data: ins } = await admin.from("wa_contacts").insert({ user_id: stationOwnerId, phone }).select("*").single();
      contact = ins;
    }
  }
  if (!contact) return json({ error: "Contato não encontrado" }, 404);

  // Which phone_number_id sends?
  const { data: cfg } = await admin.from("wa_config").select("phone_number_id").eq("user_id", stationOwnerId).eq("active", true).maybeSingle();
  if (!cfg?.phone_number_id) return json({ error: "Nenhum número WhatsApp configurado. Cadastre em Configurações do Chatbot." }, 400);

  const token = await loadStationWhatsAppToken(admin, stationOwnerId, cfg.phone_number_id).catch(() => null);
  if (!token) return json({ error: "WhatsApp da emissora não está conectado." }, 409);
  const version = Deno.env.get("META_GRAPH_VERSION") || "v24.0";
  // Send
  const res = await fetch(`https://graph.facebook.com/${version}/${cfg.phone_number_id}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", to: contact.phone, type: "text",
      text: { body: text, preview_url: true },
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("WA send error:", data);
    await admin.from("wa_messages").insert({
      user_id: stationOwnerId, contact_id: contact.id, direction: "out", type: "text", body: text,
      status: "failed", error: data?.error?.message || `HTTP ${res.status}`,
    });
    return json({ error: data?.error?.message || "Falha ao enviar", details: data }, res.status);
  }

  const waId = data?.messages?.[0]?.id ?? null;
  await admin.from("wa_messages").insert({
    user_id: stationOwnerId, contact_id: contact.id, direction: "out", type: "text", body: text,
    wa_message_id: waId, status: "sent",
  });

  const patch: any = { last_message_at: new Date().toISOString(), unread_count: 0 };
  if (take_over) patch.human_takeover = true;
  await admin.from("wa_contacts").update(patch).eq("id", contact.id);

  return json({ ok: true, wa_message_id: waId });
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
