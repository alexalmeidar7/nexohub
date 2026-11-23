// Broadcast a WhatsApp message to a filtered audience of wa_contacts
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
  const { broadcast_id } = body;
  if (!broadcast_id) return json({ error: "broadcast_id obrigatório" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const { data: member } = await admin.from("sub_users").select("parent_user_id")
    .eq("auth_user_id", userId).eq("ativo", true).maybeSingle();
  const ownerId = member?.parent_user_id || userId;

  const { data: bc, error: bErr } = await admin.from("wa_broadcasts").select("*").eq("id", broadcast_id).eq("user_id", ownerId).maybeSingle();
  if (bErr || !bc) return json({ error: "Campanha não encontrada" }, 404);
  if (bc.status === "sending" || bc.status === "done") return json({ error: `Campanha já está ${bc.status}` }, 400);

  const { data: cfg } = await admin.from("wa_config").select("phone_number_id").eq("user_id", ownerId).eq("active", true).maybeSingle();
  if (!cfg?.phone_number_id) return json({ error: "Nenhum número WhatsApp configurado" }, 400);

  const token = await loadStationWhatsAppToken(admin, ownerId, cfg.phone_number_id).catch(() => null);
  if (!token) return json({ error: "WhatsApp da emissora não está conectado" }, 409);
  const version = Deno.env.get("META_GRAPH_VERSION") || "v24.0";

  // Build audience
  const filter = bc.audience_filter || {};
  let q = admin.from("wa_contacts").select("id, phone").eq("user_id", ownerId).eq("blocked", false);
  if (filter.tags && Array.isArray(filter.tags) && filter.tags.length) q = q.overlaps("tags", filter.tags);
  const { data: contacts } = await q;
  const list = contacts || [];

  await admin.from("wa_broadcasts").update({
    status: "sending", total_count: list.length, sent_count: 0, fail_count: 0, started_at: new Date().toISOString(),
  }).eq("id", broadcast_id);

  // Fire in background so response returns fast
  (async () => {
    let sent = 0, fail = 0;
    for (const c of list) {
      try {
        const res = await fetch(`https://graph.facebook.com/${version}/${cfg.phone_number_id}/messages`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp", to: c.phone, type: "text",
            text: { body: bc.message, preview_url: true },
          }),
        });
        const data = await res.json();
        const waId = data?.messages?.[0]?.id ?? null;
        await admin.from("wa_messages").insert({
          user_id: ownerId, contact_id: c.id, direction: "out", type: "text",
          body: bc.message, wa_message_id: waId,
          status: res.ok ? "sent" : "failed",
          error: res.ok ? null : (data?.error?.message || `HTTP ${res.status}`),
        });
        if (res.ok) sent++; else fail++;
      } catch (e) {
        fail++;
        console.error("broadcast send err", e);
      }
      // Small delay to respect Meta rate-limit (~250 msgs/s for higher tiers, well below)
      await new Promise(r => setTimeout(r, 120));
      if ((sent + fail) % 10 === 0) {
        await admin.from("wa_broadcasts").update({ sent_count: sent, fail_count: fail }).eq("id", broadcast_id);
      }
    }
    await admin.from("wa_broadcasts").update({
      status: "done", sent_count: sent, fail_count: fail, finished_at: new Date().toISOString(),
    }).eq("id", broadcast_id);
  })();

  return json({ ok: true, queued: list.length });
});

function json(obj: any, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
