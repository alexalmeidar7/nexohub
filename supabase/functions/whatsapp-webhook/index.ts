// WhatsApp Cloud API webhook (Meta) — receives inbound msgs and status updates
// GET  → verification handshake
// POST → message events (validated via HMAC of x-hub-signature-256)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadStationWhatsAppToken } from "../_shared/whatsapp-credentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") || "";
const APP_SECRET = Deno.env.get("WHATSAPP_APP_SECRET") || "";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

// ---------- HMAC signature check ----------
async function verifySignature(rawBody: string, header: string | null): Promise<boolean> {
  if (!APP_SECRET) return false; // fail closed: never accept unsigned webhooks
  if (!header?.startsWith("sha256=")) return false;
  const expected = header.slice(7);
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const hex = Array.from(new Uint8Array(sigBuf)).map(b => b.toString(16).padStart(2, "0")).join("");
  return hex === expected;
}

// ---------- Send helper (used by flow runner) ----------
async function sendText(userId: string, phoneNumberId: string, to: string, text: string) {
  const token = await loadStationWhatsAppToken(admin, userId, phoneNumberId).catch(() => null);
  if (!token) { console.warn("No WhatsApp business token for station"); return null; }
  const version = Deno.env.get("META_GRAPH_VERSION") || "v24.0";
  const res = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text, preview_url: false },
    }),
  });
  const data = await res.json();
  if (!res.ok) console.error("WA send error:", data);
  return data;
}

// ---------- Flow runner ----------
// Simple sequential flow. Each step: { key, prompt, validate?: "email"|"date"|"nonempty" }
// After last step, saves to `ouvintes` and posts a menu.
const REGISTRATION_STEPS = [
  { key: "nome",            prompt: "Olá! 👋 Bem-vindo à nossa rádio.\n\nPara te cadastrar, qual seu *nome completo*?", validate: "nonempty" },
  { key: "cidade",          prompt: "Prazer, {nome}! 🙌\n\nEm qual *cidade* você mora?", validate: "nonempty" },
  { key: "data_nascimento", prompt: "Qual sua *data de nascimento*? (dd/mm/aaaa)", validate: "date" },
  { key: "email",           prompt: "Qual seu *e-mail*?", validate: "email" },
  { key: "sexo",            prompt: "Qual seu *sexo*? (M / F / Outro)", validate: "nonempty" },
];

function validate(value: string, type?: string): { ok: boolean; parsed?: any; msg?: string } {
  const v = value.trim();
  if (!v) return { ok: false, msg: "Não recebi sua resposta, pode enviar novamente?" };
  if (type === "email") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return { ok: false, msg: "Esse e-mail parece inválido. Pode reenviar?" };
    return { ok: true, parsed: v };
  }
  if (type === "date") {
    const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!m) return { ok: false, msg: "Formato inválido. Use *dd/mm/aaaa* (ex: 15/03/1990)." };
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    if (isNaN(Date.parse(iso))) return { ok: false, msg: "Data inválida. Tente novamente (dd/mm/aaaa)." };
    return { ok: true, parsed: iso };
  }
  return { ok: true, parsed: v };
}

async function runFlow(opts: {
  userId: string;
  phoneNumberId: string;
  contact: any;
  incomingText: string;
}) {
  const { userId, phoneNumberId, contact, incomingText } = opts;
  if (contact.human_takeover) return; // handled by human

  const state = (contact.flow_state as any) || {};
  const stepIdx: number = state.step ?? -1;
  const data: Record<string, any> = state.data || {};

  // Start
  if (stepIdx < 0) {
    const first = REGISTRATION_STEPS[0];
    await admin.from("wa_contacts").update({
      flow_state: { flow: "registration", step: 0, data: {} },
    }).eq("id", contact.id);
    await sendAndLog(userId, phoneNumberId, contact, first.prompt);
    return;
  }

  const currentStep = REGISTRATION_STEPS[stepIdx];
  const { ok, parsed, msg } = validate(incomingText, currentStep.validate);
  if (!ok) {
    await sendAndLog(userId, phoneNumberId, contact, msg!);
    return;
  }
  data[currentStep.key] = parsed;
  const nextIdx = stepIdx + 1;

  if (nextIdx >= REGISTRATION_STEPS.length) {
    // Finalize: save ouvinte
    const { data: ouv, error: ouvErr } = await admin.from("ouvintes").insert({
      user_id: userId,
      nome: data.nome,
      cidade: data.cidade,
      data_nascimento: data.data_nascimento,
      email: data.email,
      sexo: data.sexo,
      telefone: contact.phone,
    }).select("id").single();
    if (ouvErr) console.error("ouvinte insert error", ouvErr);

    await admin.from("wa_contacts").update({
      ouvinte_id: ouv?.id ?? null,
      name: data.nome,
      flow_state: {},
    }).eq("id", contact.id);

    const summary = `✅ Cadastro concluído, ${data.nome}! Muito obrigado.\n\n` +
      `Agora você faz parte da nossa lista de ouvintes 🎧\n\n` +
      `Digite *menu* a qualquer momento para ver as opções.`;
    await sendAndLog(userId, phoneNumberId, contact, summary);
    return;
  }

  const nextStep = REGISTRATION_STEPS[nextIdx];
  await admin.from("wa_contacts").update({
    flow_state: { flow: "registration", step: nextIdx, data },
  }).eq("id", contact.id);

  const prompt = nextStep.prompt.replace(/\{(\w+)\}/g, (_, k) => data[k] ?? "");
  await sendAndLog(userId, phoneNumberId, contact, prompt);
}

async function sendAndLog(userId: string, phoneNumberId: string, contact: any, body: string) {
  const resp = await sendText(userId, phoneNumberId, contact.phone, body);
  const waId = resp?.messages?.[0]?.id ?? null;
  await admin.from("wa_messages").insert({
    user_id: userId,
    contact_id: contact.id,
    direction: "out",
    type: "text",
    body,
    wa_message_id: waId,
    status: resp?.error ? "failed" : "sent",
    error: resp?.error?.message ?? null,
  });
  await admin.from("wa_contacts").update({ last_message_at: new Date().toISOString() }).eq("id", contact.id);
}

// ---------- Main handler ----------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // --- Verification (Meta calls with hub.mode=subscribe) ---
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && VERIFY_TOKEN && token === VERIFY_TOKEN) {
      return new Response(challenge ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const rawBody = await req.text();
  const sigHeader = req.headers.get("x-hub-signature-256");
  const validSig = await verifySignature(rawBody, sigHeader);
  if (!validSig) {
    console.warn("Invalid webhook signature");
    return new Response("Invalid signature", { status: 401, headers: corsHeaders });
  }

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return new Response("Bad JSON", { status: 400, headers: corsHeaders }); }

  try {
    const entries = payload.entry || [];
    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const phoneNumberId: string = value.metadata?.phone_number_id;
        if (!phoneNumberId) continue;

        // Find owner
        const { data: station } = await admin.from("wa_private_credentials")
          .select("user_id").eq("phone_number_id", phoneNumberId).maybeSingle();
        if (!station?.user_id) continue;
        const { data: cfg } = await admin.from("wa_config")
          .select("user_id").eq("user_id", station.user_id).eq("phone_number_id", phoneNumberId)
          .eq("active", true).maybeSingle();
        if (!cfg?.user_id) continue;
        const userId = cfg.user_id;

        // ---- Status updates ----
        for (const st of (value.statuses || [])) {
          await admin.from("wa_messages")
            .update({ status: st.status })
            .eq("wa_message_id", st.id).eq("user_id", userId);
        }

        // ---- Inbound messages ----
        for (const m of (value.messages || [])) {
          const from: string = m.from; // digits
          const profileName: string | undefined = value.contacts?.[0]?.profile?.name;

          // Upsert contact
          let { data: contact } = await admin.from("wa_contacts")
            .select("*").eq("user_id", userId).eq("phone", from).maybeSingle();

          const isNew = !contact;
          if (!contact) {
            const ins = await admin.from("wa_contacts").insert({
              user_id: userId, phone: from, profile_name: profileName, name: profileName,
            }).select("*").single();
            contact = ins.data;
          } else if (profileName && contact.profile_name !== profileName) {
            await admin.from("wa_contacts").update({ profile_name: profileName }).eq("id", contact.id);
            contact.profile_name = profileName;
          }
          if (!contact) continue;

          // Extract text
          let body = "";
          let type = m.type || "text";
          let mediaUrl: string | null = null;
          if (m.type === "text") body = m.text?.body || "";
          else if (m.type === "button") body = m.button?.text || "";
          else if (m.type === "interactive") body = m.interactive?.button_reply?.title || m.interactive?.list_reply?.title || "";
          else body = `[${m.type}]`;

          // Log inbound
          await admin.from("wa_messages").insert({
            user_id: userId, contact_id: contact.id,
            direction: "in", type, body, media_url: mediaUrl,
            wa_message_id: m.id, status: "delivered",
          });
          await admin.from("wa_contacts").update({
            last_message_at: new Date().toISOString(),
            last_inbound_at: new Date().toISOString(),
            unread_count: (contact.unread_count || 0) + 1,
          }).eq("id", contact.id);

          // Trigger flow
          const lower = body.trim().toLowerCase();
          const state = (contact.flow_state as any) || {};
          const inFlow = !!state.flow;
          const shouldStart = isNew || lower === "cadastrar" || lower === "cadastro" || lower === "oi" || lower === "olá" || lower === "ola";

          if (!contact.human_takeover && (inFlow || shouldStart)) {
            await runFlow({ userId, phoneNumberId, contact, incomingText: body });
          } else if (!contact.human_takeover && lower === "menu") {
            await sendAndLog(userId, phoneNumberId, contact,
              "🎧 *Menu*\n\n1️⃣ Pedir uma música\n2️⃣ Participar de promoção\n3️⃣ Falar com locutor\n\nResponda com o número da opção.");
          }
        }
      }
    }
  } catch (e) {
    console.error("webhook processing error", e);
  }

  // Always ack Meta
  return new Response("EVENT_RECEIVED", { status: 200, headers: corsHeaders });
});
