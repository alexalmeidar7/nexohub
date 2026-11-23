import { useState, useEffect, useRef } from "react";
import {
  MessageCircle, Send, Loader2, Users, Zap, Megaphone, Settings, Search,
  Check, CheckCheck, AlertCircle, UserCheck, Phone, X, Plus, Trash2, PlayCircle,
  Headphones,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
import { toast } from "@/hooks/use-toast";
import { confirmDialog } from "@/lib/confirmDialog";
import SupportTab from "./SupportTab";
import { createOwnedRealtimeChannel } from "@/lib/ownedRealtimeChannel";

const isUuid = (str?: string | null): boolean => !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

type Tab = "support" | "inbox" | "flows" | "broadcast" | "settings";

interface Contact {
  id: string; phone: string; name: string | null; profile_name: string | null;
  ouvinte_id: string | null; unread_count: number; last_message_at: string | null;
  human_takeover: boolean; flow_state: any;
}
interface Message {
  id: string; contact_id: string; direction: "in" | "out"; body: string | null;
  status: string; created_at: string; type: string;
}

export default function ChatbotHome() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("inbox");
  const acc = (user?.id && findClientAccountById(user.id)) || (user?.email && findClientAccountByEmail(user.email));
  const rawUid = acc?.parentUserId || acc?.id || user?.id || "";
  const effectiveUserId = isUuid(rawUid) ? rawUid : "";

  return (
    <div className="max-w-none mx-0 w-full space-y-3.5 pb-4 font-sans animate-fade-in">
      <div id="module-header-title" style={{ display: "none" }}>
        Chatbot & Atendimento WhatsApp
      </div>

      {/* Header + tabs (Card Branco Moderno) */}
      <section className="bg-white rounded-3xl p-5 lg:p-6 shadow-[0_4px_24px_rgba(0,0,0,0.03)] border border-slate-100/90 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-base md:text-lg font-black tracking-wider text-[#002132] uppercase leading-tight">
            Chatbot & Atendimento WhatsApp
          </h2>
          <p className="text-xs text-slate-400 font-medium mt-0.5">
            Meta Cloud API oficial — automações, disparos em massa e atendimento humano
          </p>
        </div>
        <div className="flex items-center gap-1.5 p-1.5 rounded-full bg-[#f8fafc] border border-slate-200/80 flex-wrap">
          {([
            ["support", "Suporte", Headphones],
            ["inbox", "Caixa de Entrada", MessageCircle],
            ["flows", "Automações", Zap],
            ["broadcast", "Disparo em Massa", Megaphone],
            ["settings", "Configuração", Settings],
          ] as const).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setTab(id as Tab)}
              className={`flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                tab === id
                  ? "bg-[#0055ff] text-white shadow-sm"
                  : "text-slate-600 hover:text-black"
              }`}
            >
              <Icon size={14} className={tab === id ? "text-white" : "text-slate-400"} /> {label}
            </button>
          ))}
        </div>
      </section>

      {/* Body */}
      <div className="rounded-3xl overflow-hidden" style={{
        background: "linear-gradient(135deg,#ffffff 0%,#eafaff 100%)",
        border: "1px solid rgba(0,191,240,0.25)",
        boxShadow: "0 20px 60px rgba(0,33,50,0.08)",
        minHeight: "560px",
      }}>
        {!user ? (
          <div className="p-10 text-center text-sm" style={{ color: "#002132" }}>Faça login para usar o Chatbot.</div>
        ) : (
          <>
            {tab === "support"   && <SupportTab userId={effectiveUserId} clientAcc={acc} />}
            {tab === "inbox"     && <InboxTab userId={effectiveUserId} />}
            {tab === "flows"     && <FlowsTab userId={effectiveUserId} />}
            {tab === "broadcast" && <BroadcastTab userId={effectiveUserId} />}
            {tab === "settings"  && <SettingsTab userId={effectiveUserId} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------- INBOX ------------------------- */
const DEMO_CONTACTS_STORAGE_KEY = "nexohub_chatbot_contacts_v1";

const DEFAULT_DEMO_CONTACTS: Contact[] = [
  {
    id: "demo-contact-1",
    phone: "5567999887766",
    name: "Cultura FM (Emissora)",
    profile_name: "Cultura FM",
    ouvinte_id: null,
    unread_count: 1,
    last_message_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    human_takeover: true,
    flow_state: {},
  },
  {
    id: "demo-contact-2",
    phone: "5562988776655",
    name: "Interativa FM",
    profile_name: "Interativa FM",
    ouvinte_id: null,
    unread_count: 1,
    last_message_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    human_takeover: false,
    flow_state: {},
  },
];

export const DEMO_MESSAGES_STORAGE_KEY = "nexohub_chatbot_messages_v1";

const DEMO_MESSAGES: Record<string, Message[]> = {
  "demo-contact-1": [
    {
      id: "demo-m1",
      contact_id: "demo-contact-1",
      direction: "in",
      body: "Olá equipe Nexo! Estamos com uma dúvida sobre a transmissão de vídeo da rádio. #suporte",
      status: "delivered",
      created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      type: "text",
    },
  ],
  "demo-contact-2": [
    {
      id: "demo-m2",
      contact_id: "demo-contact-2",
      direction: "in",
      body: "Boa tarde! Gostaríamos de solicitar suporte para atualização da grade da próxima semana. #suporte",
      status: "delivered",
      created_at: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
      type: "text",
    },
  ],
};

function InboxTab({ userId }: { userId: string }) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [active, setActive] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [msgText, setMsgText] = useState("");
  const [sending, setSending] = useState(false);
  const [search, setSearch] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load contacts + realtime
  useEffect(() => {
    let mounted = true;
    if (!userId || !isUuid(userId)) {
      const local = localStorage.getItem(DEMO_CONTACTS_STORAGE_KEY);
      if (local) {
        try { setContacts(JSON.parse(local)); } catch { setContacts(DEFAULT_DEMO_CONTACTS); }
      } else {
        setContacts(DEFAULT_DEMO_CONTACTS);
      }
      return;
    }
    (async () => {
      try {
        const { data } = await supabase.from("wa_contacts").select("*")
          .eq("user_id", userId).order("last_message_at", { ascending: false, nullsFirst: false }).limit(200);
        if (mounted) {
          if (data && data.length > 0) {
            setContacts(data as Contact[]);
          } else {
            const local = localStorage.getItem(DEMO_CONTACTS_STORAGE_KEY);
            if (local) {
              try {
                setContacts(JSON.parse(local));
              } catch {
                setContacts(DEFAULT_DEMO_CONTACTS);
                localStorage.setItem(DEMO_CONTACTS_STORAGE_KEY, JSON.stringify(DEFAULT_DEMO_CONTACTS));
              }
            } else {
              setContacts(DEFAULT_DEMO_CONTACTS);
              localStorage.setItem(DEMO_CONTACTS_STORAGE_KEY, JSON.stringify(DEFAULT_DEMO_CONTACTS));
            }
          }
        }
      } catch {
        if (mounted) {
          setContacts(DEFAULT_DEMO_CONTACTS);
        }
      }
    })();
    const ch = createOwnedRealtimeChannel(supabase.realtime, `wa-contacts-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "wa_contacts", filter: `user_id=eq.${userId}` },
        (payload: any) => {
          setContacts(prev => {
            const rest = prev.filter(c => c.id !== (payload.new?.id ?? payload.old?.id));
            if (payload.eventType === "DELETE") return rest;
            return [payload.new as Contact, ...rest].sort((a, b) =>
              (b.last_message_at || "").localeCompare(a.last_message_at || ""));
          });
        })
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [userId]);

  // Sync unread messages with header
  useEffect(() => {
    const unread = contacts.reduce((sum, c) => sum + (c.unread_count || 0), 0);
    localStorage.setItem("nexohub_chatbot_unread_count", String(unread));
    localStorage.setItem(DEMO_CONTACTS_STORAGE_KEY, JSON.stringify(contacts));
    window.dispatchEvent(new CustomEvent("chatbot:unread_updated", { detail: { unreadCount: unread } }));
  }, [contacts]);

  const handleSelectContact = (c: Contact) => {
    setActive(c);
    if (c.unread_count > 0) {
      setContacts(prev => prev.map(item => item.id === c.id ? { ...item, unread_count: 0 } : item));
    }
  };

  // Load messages for active contact + realtime
  useEffect(() => {
    if (!active) return;
    let mounted = true;
    (async () => {
      if (active.id.startsWith("demo-")) {
        setMessages(DEMO_MESSAGES[active.id] || []);
        return;
      }
      const { data } = await supabase.from("wa_messages").select("*")
        .eq("contact_id", active.id).order("created_at").limit(300);
      if (mounted) setMessages((data || []) as Message[]);
      // Reset unread
      await supabase.from("wa_contacts").update({ unread_count: 0 }).eq("id", active.id);
    })();
    const ch = createOwnedRealtimeChannel(supabase.realtime, `wa-msgs-${active.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "wa_messages", filter: `contact_id=eq.${active.id}` },
        (payload: any) => setMessages(prev => [...prev, payload.new as Message]))
      .subscribe();
    return () => { mounted = false; supabase.removeChannel(ch); };
  }, [active?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  async function send() {
    if (!active || !msgText.trim() || sending) return;
    setSending(true);
    const text = msgText.trim();
    setMsgText("");

    if (active.id.startsWith("demo-")) {
      const newMsg: Message = {
        id: `demo-${Date.now()}`,
        contact_id: active.id,
        direction: "out",
        body: text,
        status: "read",
        created_at: new Date().toISOString(),
        type: "text",
      };
      setMessages(prev => [...prev, newMsg]);
      setSending(false);
      return;
    }

    const { error } = await supabase.functions.invoke("whatsapp-send", {
      body: { contact_id: active.id, text, take_over: true },
    });
    if (error) {
      toast({ title: "Falha ao enviar", description: error.message, variant: "destructive" });
      setMsgText(text);
    }
    setSending(false);
  }

  const filtered = contacts.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.name || "").toLowerCase().includes(s)
        || (c.profile_name || "").toLowerCase().includes(s)
        || c.phone.includes(s);
  });

  return (
    <div className="grid grid-cols-[320px_1fr] h-full" style={{ minHeight: "calc(100vh - 220px)" }}>
      {/* List */}
      <div className="border-r flex flex-col" style={{ borderColor: "rgba(0,191,240,0.2)" }}>
        <div className="p-3 border-b" style={{ borderColor: "rgba(0,191,240,0.2)" }}>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar contato..." className="w-full pl-9 pr-3 py-2 rounded-full text-xs outline-none"
              style={{ background: "#D6F4FB", color: "#002132" }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-xs" style={{ color: "#002132", opacity: 0.5 }}>
              Nenhuma conversa ainda.<br/>Assim que um ouvinte enviar mensagem, aparece aqui.
            </div>
          )}
          {filtered.map(c => (
            <button key={c.id} onClick={() => handleSelectContact(c)}
              className="w-full text-left px-4 py-3 border-b transition-colors"
              style={{
                borderColor: "rgba(0,191,240,0.12)",
                background: active?.id === c.id ? "rgba(0,191,240,0.12)" : "transparent",
              }}>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold"
                     style={{ background: "#00BFF0", color: "#fff" }}>
                  {(c.name || c.profile_name || c.phone || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <div className="text-xs font-bold truncate" style={{ color: "#002132" }}>
                      {c.name || c.profile_name || `+${c.phone}`}
                    </div>
                    {c.human_takeover && <UserCheck size={11} style={{ color: "#9fca1d" }} />}
                  </div>
                  <div className="text-[10px] truncate" style={{ color: "#002132", opacity: 0.55 }}>
                    +{c.phone} {c.ouvinte_id ? "• 🎧" : ""}
                  </div>
                </div>
                {c.unread_count > 0 && (
                  <div className="min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                       style={{ background: "#9fca1d", color: "#fff" }}>{c.unread_count}</div>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat */}
      <div className="flex flex-col">
        {!active ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8" style={{ color: "#002132" }}>
            <MessageCircle size={48} style={{ opacity: 0.2 }} />
            <div className="mt-3 text-sm font-bold">Selecione uma conversa</div>
            <div className="text-xs opacity-60 mt-1">Ou aguarde alguém enviar uma mensagem no seu WhatsApp</div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-4 py-3 border-b flex items-center gap-3" style={{ borderColor: "rgba(0,191,240,0.2)" }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold"
                   style={{ background: "#00BFF0", color: "#fff" }}>
                {(active.name || active.profile_name || active.phone).slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="text-sm font-bold" style={{ color: "#002132" }}>
                  {active.name || active.profile_name || `+${active.phone}`}
                </div>
                <div className="text-[11px]" style={{ color: "#002132", opacity: 0.55 }}>
                  +{active.phone} {active.ouvinte_id ? "• ouvinte cadastrado 🎧" : "• não cadastrado"}
                </div>
              </div>
              <button
                onClick={async () => {
                  await supabase.from("wa_contacts").update({ human_takeover: !active.human_takeover }).eq("id", active.id);
                  setActive({ ...active, human_takeover: !active.human_takeover });
                }}
                className="text-[11px] font-bold px-3 py-1.5 rounded-full"
                style={{
                  background: active.human_takeover ? "#9fca1d" : "#D6F4FB",
                  color: active.human_takeover ? "#fff" : "#002132",
                }}>
                {active.human_takeover ? "Atendimento humano ✓" : "Assumir atendimento"}
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2"
                 style={{ background: "linear-gradient(180deg,#f6fcff 0%,#eafaff 100%)" }}>
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[70%] px-3 py-2 rounded-2xl text-xs whitespace-pre-wrap break-words"
                    style={{
                      background: m.direction === "out" ? "#00BFF0" : "#fff",
                      color: m.direction === "out" ? "#fff" : "#002132",
                      border: m.direction === "out" ? "none" : "1px solid rgba(0,191,240,0.2)",
                      borderBottomRightRadius: m.direction === "out" ? 4 : 16,
                      borderBottomLeftRadius: m.direction === "in" ? 4 : 16,
                    }}>
                    {m.body || `[${m.type}]`}
                    <div className="text-[9px] mt-1 flex items-center gap-1 opacity-70">
                      {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      {m.direction === "out" && (
                        m.status === "failed" ? <AlertCircle size={10} /> :
                        m.status === "read" ? <CheckCheck size={10} /> :
                        m.status === "delivered" ? <CheckCheck size={10} /> :
                        <Check size={10} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Composer */}
            <div className="p-3 border-t flex gap-2" style={{ borderColor: "rgba(0,191,240,0.2)", background: "#fff" }}>
              <textarea value={msgText} onChange={e => setMsgText(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Digite uma mensagem..." rows={1}
                className="flex-1 px-3 py-2 rounded-2xl text-xs outline-none resize-none max-h-24"
                style={{ background: "#D6F4FB", color: "#002132" }} />
              <button onClick={send} disabled={!msgText.trim() || sending}
                className="px-4 rounded-full text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                style={{ background: "#00BFF0", color: "#fff" }}>
                {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------- FLOWS ------------------------- */
function FlowsTab({ userId }: { userId: string }) {
  const [flows, setFlows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    if (!userId || !isUuid(userId)) {
      setFlows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase.from("wa_flows").select("*").eq("user_id", userId).order("created_at");
    setFlows(data || []);
    setLoading(false);
  }
  useEffect(() => { load(); }, [userId]);

  async function ensureDefault() {
    if (!userId || !isUuid(userId)) return;
    const { data } = await supabase.from("wa_flows").select("id").eq("user_id", userId).eq("is_default", true).maybeSingle();
    if (data) return;
    await supabase.from("wa_flows").insert({
      user_id: userId, name: "Cadastro de Ouvinte", trigger: "first_contact", active: true, is_default: true,
      steps: [
        { key: "nome", prompt: "Olá! Qual seu nome completo?", validate: "nonempty" },
        { key: "cidade", prompt: "Em qual cidade você mora?", validate: "nonempty" },
        { key: "data_nascimento", prompt: "Data de nascimento (dd/mm/aaaa)?", validate: "date" },
        { key: "email", prompt: "Seu e-mail?", validate: "email" },
        { key: "sexo", prompt: "Sexo? (M/F/Outro)", validate: "nonempty" },
      ],
    });
    load();
  }
  useEffect(() => { ensureDefault(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-lg font-bold" style={{ color: "#002132" }}>Automações</div>
          <div className="text-xs" style={{ color: "#002132", opacity: 0.6 }}>
            Fluxos que rodam automaticamente no WhatsApp
          </div>
        </div>
      </div>
      {loading ? <Loader2 className="animate-spin" /> : (
        <div className="grid gap-3">
          {flows.map(f => (
            <div key={f.id} className="p-4 rounded-2xl flex items-start gap-3"
                 style={{ background: "#fff", border: "1px solid rgba(0,191,240,0.2)" }}>
              <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                   style={{ background: "#9fca1d" }}><Zap size={18} color="#fff" /></div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-bold" style={{ color: "#002132" }}>{f.name}</div>
                  {f.is_default && <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                    style={{ background: "#D6F4FB", color: "#00BFF0" }}>PADRÃO</span>}
                </div>
                <div className="text-[11px] mt-1" style={{ color: "#002132", opacity: 0.6 }}>
                  Gatilho: <b>{f.trigger === "first_contact" ? "primeiro contato" : f.trigger}</b>
                  {" • "}{(f.steps || []).length} passos
                </div>
              </div>
              <button onClick={async () => {
                await supabase.from("wa_flows").update({ active: !f.active }).eq("id", f.id);
                load();
              }} className="text-[11px] font-bold px-3 py-1.5 rounded-full"
                style={{ background: f.active ? "#9fca1d" : "#D6F4FB", color: f.active ? "#fff" : "#002132" }}>
                {f.active ? "Ativo" : "Inativo"}
              </button>
              {!f.is_default && (
                <button onClick={async () => {
                  if (!(await confirmDialog("Excluir automação?"))) return;
                  await supabase.from("wa_flows").delete().eq("id", f.id);
                  load();
                }} className="p-1.5 rounded-full" style={{ color: "#c00" }}><Trash2 size={14}/></button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 p-4 rounded-2xl text-[11px]" style={{ background: "#fff9e6", color: "#002132", border: "1px solid #ffe097" }}>
        📝 Por enquanto o cadastro de ouvinte é fixo (nome, cidade, nascimento, e-mail, sexo). Diga o que quer alterar e ajusto o script.
      </div>
    </div>
  );
}

/* ------------------------- BROADCAST ------------------------- */
function BroadcastTab({ userId }: { userId: string }) {
  const [list, setList] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    if (!userId || !isUuid(userId)) {
      setList([]);
      return;
    }
    const { data } = await supabase.from("wa_broadcasts").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(20);
    setList(data || []);
  }
  useEffect(() => { load(); }, [userId]);

  async function create(sendNow: boolean) {
    if (!name.trim() || !message.trim() || !userId || !isUuid(userId)) return;
    setSending(true);
    const { data, error } = await supabase.from("wa_broadcasts").insert({
      user_id: userId, name: name.trim(), message: message.trim(), status: "draft",
    }).select("id").single();
    if (error) { toast({ title: "Erro", description: error.message, variant: "destructive" }); setSending(false); return; }
    if (sendNow) {
      const { error: sErr } = await supabase.functions.invoke("whatsapp-broadcast", { body: { broadcast_id: data.id } });
      if (sErr) toast({ title: "Falha no disparo", description: sErr.message, variant: "destructive" });
      else toast({ title: "Disparo iniciado", description: "Acompanhe abaixo" });
    }
    setName(""); setMessage("");
    setSending(false);
    load();
  }

  return (
    <div className="p-6 grid gap-6" style={{ gridTemplateColumns: "1fr 1fr" }}>
      <div className="p-5 rounded-2xl" style={{ background: "#fff", border: "1px solid rgba(0,191,240,0.2)" }}>
        <div className="text-sm font-bold mb-3" style={{ color: "#002132" }}>Nova campanha</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Nome da campanha"
          className="w-full mb-2 px-3 py-2 rounded-lg text-xs outline-none"
          style={{ background: "#D6F4FB", color: "#002132" }} />
        <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Mensagem (máx 4096)"
          rows={6} maxLength={4096}
          className="w-full px-3 py-2 rounded-lg text-xs outline-none resize-none"
          style={{ background: "#D6F4FB", color: "#002132" }} />
        <div className="text-[10px] mt-1 text-right" style={{ color: "#002132", opacity: 0.5 }}>
          {message.length}/4096
        </div>
        <div className="mt-3 p-3 rounded-lg text-[11px]" style={{ background: "#fff9e6", color: "#002132" }}>
          ⚠️ Para contatos fora da janela de 24h, a Meta exige <b>template aprovado</b>. Contatos ativos recebem normal.
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={() => create(true)} disabled={sending || !name.trim() || !message.trim()}
            className="flex-1 py-2.5 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
            style={{ background: "#00BFF0", color: "#fff" }}>
            {sending ? <Loader2 size={14} className="animate-spin"/> : <PlayCircle size={14}/>} Enviar agora
          </button>
          <button onClick={() => create(false)} disabled={sending || !name.trim() || !message.trim()}
            className="flex-1 py-2.5 rounded-full text-xs font-bold disabled:opacity-50"
            style={{ background: "#D6F4FB", color: "#002132" }}>Salvar rascunho</button>
        </div>
      </div>

      <div>
        <div className="text-sm font-bold mb-3" style={{ color: "#002132" }}>Histórico</div>
        <div className="space-y-2">
          {list.length === 0 && <div className="text-xs opacity-60" style={{ color: "#002132" }}>Nenhuma campanha ainda.</div>}
          {list.map(b => (
            <div key={b.id} className="p-3 rounded-xl" style={{ background: "#fff", border: "1px solid rgba(0,191,240,0.2)" }}>
              <div className="flex items-center gap-2">
                <div className="flex-1 text-xs font-bold truncate" style={{ color: "#002132" }}>{b.name}</div>
                <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                  style={{
                    background: b.status === "done" ? "#9fca1d" : b.status === "sending" ? "#00BFF0" : "#D6F4FB",
                    color: b.status === "draft" ? "#002132" : "#fff",
                  }}>{b.status.toUpperCase()}</span>
              </div>
              <div className="text-[10px] mt-1 opacity-60" style={{ color: "#002132" }}>
                {b.sent_count}/{b.total_count} enviadas • {b.fail_count} falhas
              </div>
              {b.status === "draft" && (
                <button onClick={async () => {
                  await supabase.functions.invoke("whatsapp-broadcast", { body: { broadcast_id: b.id } });
                  load();
                }} className="mt-2 text-[10px] font-bold px-3 py-1 rounded-full"
                  style={{ background: "#00BFF0", color: "#fff" }}>Disparar</button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------ CONEXÃO WHATSAPP OFICIAL ------------------ */
type MetaConnectStatus = {
  ready: boolean; connected: boolean; pending_activation: boolean;
  app_id: string; config_id: string; graph_version: string; display_phone: string;
};
const WHATSAPP_WEB_SETTINGS_URL = "https://housemix.nexobrasil.net/home?page=chatbot";
function SettingsTab({ userId }: { userId: string }) {
  const [status, setStatus] = useState<MetaConnectStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const sdkRef = useRef(false);
  const { user } = useAuth();
  const canConfigure = !!userId && user?.id === userId;

  async function reload() {
    if (!isUuid(userId)) { setLoading(false); return; }
    setLoading(true);
    const { data, error: loadError } = await supabase.functions.invoke(
      "whatsapp-connect?owner_id=" + encodeURIComponent(userId), { method: "GET" },
    );
    if (loadError || !data) { setStatus(null); setError("Integração ainda não disponível. A configuração oficial da Meta precisa ser concluída."); }
    else { setStatus(data as MetaConnectStatus); setError(""); }
    setLoading(false);
  }
  useEffect(() => { void reload(); }, [userId]);

  useEffect(() => {
    if (!status?.ready || !status?.app_id || window.houseMixDesktop?.isDesktop) return;
    const init = () => {
      const fb = (window as any).FB;
      if (!fb || sdkRef.current) return;
      fb.init({ appId: status.app_id, autoLogAppEvents: false, xfbml: false, version: status.graph_version });
      sdkRef.current = true;
    };
    (window as any).fbAsyncInit = init;
    if ((window as any).FB) { init(); return; }
    const existing = document.getElementById("housemix-meta-sdk");
    if (existing) return;
    const script = document.createElement("script");
    script.id = "housemix-meta-sdk"; script.src = "https://connect.facebook.net/pt_BR/sdk.js";
    script.async = true; script.defer = true; script.crossOrigin = "anonymous";
    script.onerror = () => setError("Não foi possível carregar a autenticação da Meta. Verifique sua conexão.");
    document.head.appendChild(script);
  }, [status?.ready, status?.app_id, status?.graph_version]);

  function launch() {
    if (!status?.ready || !canConfigure || busy) return;
    if (window.houseMixDesktop?.isDesktop) {
      void window.houseMixDesktop.openExternal(WHATSAPP_WEB_SETTINGS_URL);
      toast({ title: "Conexão WhatsApp", description: "Conclua a autorização no navegador. Depois retorne ao HMD." });
      return;
    }
    const fb = (window as any).FB;
    if (!fb || !sdkRef.current) {
      setError("A autenticação da Meta ainda não está carregada. Tente novamente.");
      return;
    }
    setError(""); setBusy(true);
    let code = "", waba = "", phoneId = "", coexistence = false, sent = false;
    const cleanup = () => window.removeEventListener("message", onMessage);
    const complete = async () => {
      if (!code || !waba || !phoneId || sent) return;
      sent = true; cleanup();
      try {
        const { data, error: connectError } = await supabase.functions.invoke("whatsapp-connect", {
          body: { action: "finish", owner_id: userId, code, waba_id: waba, phone_number_id: phoneId, coexistence },
        });
        if (connectError || !data?.ok) throw new Error(data?.error || "A Meta não concluiu a vinculação.");
        if (data.pending_activation) {
          toast({ title: "Número autorizado", description: "Falta a ativação final do número na Meta." });
        } else {
          toast({ title: "WhatsApp conectado ✓", description: "O número da emissora foi vinculado com sucesso." });
        }
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Não foi possível concluir a conexão.");
      } finally { setBusy(false); }
    };
    const onMessage = (event: MessageEvent) => {
      let host = "";
      try { host = new URL(event.origin).hostname.toLowerCase(); } catch { return; }
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
      let payload: any;
      try { payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (String(payload.event || "").startsWith("FINISH")) {
        waba = String(payload.data?.waba_id || "");
        phoneId = String(payload.data?.phone_number_id || "");
        coexistence = payload.event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
        void complete();
      } else if (payload.event === "CANCEL" || payload.event === "ERROR") {
        cleanup(); setBusy(false);
        setError("A autorização foi cancelada ou não foi concluída. Você pode tentar novamente.");
      }
    };
    window.addEventListener("message", onMessage);
    fb.login((response: any) => {
      code = String(response?.authResponse?.code || "");
      if (!code && !sent) {
        cleanup(); setBusy(false);
        setError("A Meta não autorizou o acesso. Tente novamente.");
        return;
      }
      void complete();
    }, {
      config_id: status.config_id,
      response_type: "code",
      override_default_response_type: true,
      extras: { setup: {} },
    });
  }
  async function manage(action: "activate" | "disconnect") {
    if (!canConfigure || busy) return;
    if (action === "disconnect" && !window.confirm("Desconectar o número WhatsApp desta emissora?")) return;
    setBusy(true); setError("");
    try {
      const { data, error: requestError } = await supabase.functions.invoke("whatsapp-connect", {
        body: { owner_id: userId, action },
      });
      if (requestError || !data?.ok) throw new Error(data?.error || "Não foi possível concluir.");
      toast({ title: action === "activate" ? "WhatsApp ativado ✓" : "WhatsApp desconectado" });
      await reload();
    } catch (e) {
      setError(action === "activate"
        ? "A Meta ainda não concluiu o registro do número. Verifique a conta comercial ou tente conectar novamente."
        : (e instanceof Error ? e.message : "Falha ao desconectar."));
    } finally { setBusy(false); }
  }
  return (
    <div className="mx-auto w-full max-w-3xl p-5 sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0055ff]/10">
          <MessageCircle size={22} className="text-[#0055ff]"/>
        </div>
        <div><h3 className="text-lg font-extrabold text-slate-900">Conectar WhatsApp</h3>
          <p className="text-xs text-slate-500">Integração oficial com a Meta, sem configuração de webhooks ou tokens pelo usuário.</p>
        </div>
      </div>
      <div className="rounded-2xl bg-white p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div><span className="text-sm font-extrabold text-slate-900">WhatsApp Business da rádio</span>
            <p className="mt-1 text-xs text-slate-500">{status?.display_phone || "Nenhum número vinculado"}</p></div>
          <span className={`rounded-full px-3 py-1.5 text-[11px] font-semibold ${status?.connected ? "bg-green-50 text-green-700" : status?.pending_activation ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
            {loading ? "Verificando..." : status?.connected ? "Conectado" : status?.pending_activation ? "Ativação pendente" : "Não conectado"}
          </span>
        </div>
        {!status?.connected && !status?.pending_activation && <div className="mb-5 space-y-3 text-sm text-slate-700">
          <p><strong className="text-[#0055ff]">1.</strong> Clique em Conectar WhatsApp.</p>
          <p><strong className="text-[#0055ff]">2.</strong> Entre na sua conta Meta e selecione o número da rádio.</p>
          <p><strong className="text-[#0055ff]">3.</strong> Confirme a autorização e o número no celular, se solicitado.</p>
          <p><strong className="text-[#0055ff]">4.</strong> As mensagens novas aparecerão na Caixa de Entrada após a ativação.</p>
        </div>}
        {!canConfigure && <p className="mb-4 text-xs text-amber-700">Somente a conta principal da emissora pode vincular ou desconectar o número.</p>}
        {!status?.ready && !loading && <p className="mb-4 text-xs text-amber-700">O cadastro oficial da Meta ainda está em configuração. O botão será liberado quando estiver disponível.</p>}
        {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {!status?.connected && !status?.pending_activation &&
            <button type="button" disabled={loading || busy || !status?.ready || !canConfigure}
              onClick={launch} className="flex min-h-11 items-center gap-2 rounded-xl bg-[#0055ff] px-5 text-sm font-bold text-white hover:bg-[#0047d7] disabled:cursor-not-allowed disabled:opacity-40">
              {busy ? <Loader2 size={16} className="animate-spin"/> : <MessageCircle size={16}/>} Conectar WhatsApp
            </button>}
          {status?.pending_activation && <button type="button" disabled={busy || !canConfigure}
            onClick={() => void manage("activate")} className="rounded-xl bg-[#0055ff] px-5 py-3 text-xs font-bold text-white disabled:opacity-50">
            Concluir ativação
          </button>}
          {(status?.connected || status?.pending_activation) &&
            <button type="button" disabled={busy || !canConfigure} onClick={() => void manage("disconnect")}
              className="rounded-xl bg-slate-100 px-5 py-3 text-xs font-bold text-slate-700 disabled:opacity-50">Desconectar</button>}
          <button type="button" onClick={() => void reload()} disabled={busy || loading}
            className="rounded-xl bg-slate-100 px-4 py-3 text-xs font-semibold text-slate-600 disabled:opacity-50">
            Atualizar status
          </button>
        </div>
      </div>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        A autorização ocorre pela própria Meta. A conta comercial pode precisar de validação, registro do número e método de pagamento.
        Mensagens podem ter custos conforme as regras da plataforma.
      </p>
    </div>
  );
}
