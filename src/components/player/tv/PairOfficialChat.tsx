/* NEXO_PAIRING_MOBILE_V9 */
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowDown, Check, Loader2, Reply, Send, UserPlus, Users, X } from "lucide-react";
import { usePlayerAuth } from "@/hooks/usePlayerAuth";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { radioChatChannelId } from "@/lib/playerRadioChatScope";

type Message = { id: string; channel_id: string; nome: string; message: string; created_at: string; author_listener_id?: string | null; reply_to_id?: string | null };
type Friendship = { id: string; requester_id: string; recipient_id: string; status: "pending" | "accepted"; requester_name?: string; recipient_name?: string };
const baseFields = "id,channel_id,nome,message,created_at";
const socialFields = baseFields + ",author_listener_id,reply_to_id";
const db = playerSupabase as any;
const merge = (a: Message[], b: Message[]) => Array.from(new Map([...a, ...b].map(m => [m.id, m])).values()).sort((x, y) => x.created_at.localeCompare(y.created_at) || x.id.localeCompare(y.id)).slice(-40);
const demoId = "preview-me";
const demoNames = ["Mariana", "Rafael", "Camila", "André"];
const demoTexts = ["Boa noite! Tô ouvindo aqui de casa.", "Essa música é boa demais!", "Mandem um abraço pra Goiânia!", "Adorando a programação de hoje."];
function demoMessage(i: number): Message { return {id: "preview-" + i, channel_id: "preview", nome: demoNames[i % 4], message: demoTexts[i % 4], created_at: new Date(Date.now() - Math.max(0, 3-i)*30000).toISOString(), author_listener_id: "preview-listener-" + (i % 4)}; }
const absentSchema = (e: any) => ["42703", "42P01", "PGRST204", "PGRST205"].includes(e?.code);

export default function PairOfficialChat({ radioId, preview = false, displayName = "Ouvinte de teste" }: { radioId: string; preview?: boolean; displayName?: string }) {
  const { user, loading: authLoading } = usePlayerAuth();
  const channelId = radioChatChannelId(radioId);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState<Message | null>(null);
  const [socialReady, setSocialReady] = useState(false);
  const [listenerId, setListenerId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [friendBusy, setFriendBusy] = useState(false);
  const [showFriends, setShowFriends] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const follow = useRef(true);
  const refresh = useRef<() => Promise<void>>(async () => {});
  const mode = useRef<"unknown" | "legacy" | "social">("unknown");
  const name = preview ? displayName : String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || "Ouvinte").slice(0, 100);
  const ownId = preview ? demoId : listenerId;
  const signed = preview || (!!user && !user.is_anonymous && !authLoading);

  useEffect(() => {
    setMessages([]); setError(""); setLoading(true); setSelected(null); setReply(null); follow.current = true;
    if (preview) {
      setMessages([0,1,2,3].map(demoMessage)); setLoading(false); setSocialReady(true);
      let i = 4;
      const t = window.setInterval(() => setMessages(prev => merge(prev,[demoMessage(i++)])), 7500);
      return () => clearInterval(t);
    }
    if (!channelId) { setLoading(false); return; }
    let active = true, busy = false;
    mode.current = "unknown";
    setSocialReady(false);
    const load = async () => {
      if (!active || busy || document.hidden) return;
      busy = true;
      const fetchRows = (fields:string) => db.from("player_chat_messages").select(fields).eq("channel_id",channelId).gte("created_at",new Date(Date.now()-86400000).toISOString()).order("created_at",{ascending:false}).limit(40);
      try {
        let result = await fetchRows(mode.current === "legacy" ? baseFields : socialFields);
        if (result.error && mode.current !== "legacy" && absentSchema(result.error)) { mode.current = "legacy"; result = await fetchRows(baseFields); }
        if (result.error) throw result.error;
        if (!active) return;
        if (mode.current !== "legacy") mode.current = "social";
        setSocialReady(mode.current === "social");
        setMessages(prev => merge(prev.filter(m => Date.parse(m.created_at)>=Date.now()-86400000), (result.data||[]) as Message[])); setError("");
      } catch { if (active) setError("Não foi possível atualizar o chat. Tentaremos novamente."); }
      finally { busy=false; if(active) setLoading(false); }
    };
    refresh.current = load;
    const realtime = playerSupabase.channel(`pair9-chat-${channelId}-${Date.now()}`).on("postgres_changes", {event:"INSERT",schema:"public",table:"player_chat_messages",filter:`channel_id=eq.${channelId}`}, event=>{
      const row=event.new as Message;
      if(active && row.channel_id===channelId) setMessages(prev=>merge(prev,[row]));
    }).subscribe(status=>{if(status==="SUBSCRIBED") void load();});
    void load();
    const timer=window.setInterval(()=>void load(),5000);
    const visible=()=>{if(!document.hidden) void load();};
    document.addEventListener("visibilitychange",visible);
    return ()=>{active=false;clearInterval(timer);document.removeEventListener("visibilitychange",visible);void playerSupabase.removeChannel(realtime);refresh.current=async()=>{};};
  },[channelId,preview]);

  useEffect(()=>{
    if(preview || !socialReady || !user?.id || user.is_anonymous || !channelId) return;
    let active=true;
    void (async()=>{
      const {data,error}=await db.from("player_listener_profiles").select("id").eq("radio_user_id",radioId).eq("auth_user_id",user.id).maybeSingle();
      if(active) setListenerId(!error && data ? data.id : null);
    })();
    return ()=>{active=false;setListenerId(null);};
  },[preview,socialReady,user?.id,user?.is_anonymous,channelId,radioId]);

  async function reloadFriends() {
    if(preview || !socialReady || !ownId) return;
    const {data,error}=await db.from("player_listener_friendships").select("id,requester_id,recipient_id,status,requester_name,recipient_name").eq("radio_user_id",radioId).or(`requester_id.eq.${ownId},recipient_id.eq.${ownId}`).limit(100);
    if(error) setNotice("Não foi possível consultar as amizades. Tente novamente."); else setFriends(data||[]);
  }
  useEffect(()=>{setFriends([]);if(!preview && ownId) void reloadFriends();},[ownId,radioId,preview]);
  useEffect(()=>{
    const el=list.current;
    if(el && follow.current) el.scrollTo({top:el.scrollHeight,behavior:"smooth"});
  },[messages.length,messages[messages.length-1]?.id]);
  function chooseReply(m:Message){setReply(m);setSelected(null);setNotice("");input.current?.focus();}
  function friendOf(id:string){return friends.find(f=>f.requester_id===id||f.recipient_id===id);}
  function labelFor(id:string){return messages.find(m=>m.author_listener_id===id)?.nome||"Ouvinte";}
  async function addFriend(m:Message){
    if(friendBusy) return;
    const target=m.author_listener_id;
    setSelected(null);setNotice("");
    if(!target || (!preview && !socialReady)){setNotice("Este ouvinte ainda não possui identificação compatível com a lista de amigos.");return;}
    if(!ownId){setNotice("Complete seu cadastro para adicionar amigos.");return;}
    if(target===ownId){setNotice("Esta mensagem é sua.");return;}
    if(friendOf(target)){setNotice("Já existe uma amizade ou solicitação com este ouvinte.");return;}
    setFriendBusy(true);
    try {
      if(preview){setFriends(prev=>[...prev,{id:"demo-friend-"+target,requester_id:ownId,recipient_id:target,status:"pending",requester_name:name,recipient_name:m.nome}]);}
      else {const {error}=await db.from("player_listener_friendships").insert({radio_user_id:radioId,requester_id:ownId,recipient_id:target});if(error)throw error;await reloadFriends();}
      setNotice("Solicitação de amizade enviada"+(preview?" (prévia).":"."));
    }catch{setNotice("Não foi possível enviar a solicitação. Confira se a amizade já existe.");}
    finally{setFriendBusy(false);}
  }
  async function changeFriend(f:Friendship,accept:boolean){
    if(friendBusy||!ownId)return;
    setFriendBusy(true);
    try{
      if(preview)setFriends(prev=>accept?prev.map(x=>x.id===f.id?{...x,status:"accepted"}:x):prev.filter(x=>x.id!==f.id));
      else {const q=db.from("player_listener_friendships");const {error}=await (accept?q.update({status:"accepted"}):q.delete()).eq("id",f.id).eq("radio_user_id",radioId);if(error)throw error;await reloadFriends();}
    }catch{setNotice("Não foi possível atualizar a amizade.");}finally{setFriendBusy(false);}
  }
  async function send(event:FormEvent<HTMLFormElement>){
    event.preventDefault();const text=message.trim();
    if(!signed||!text||sending||(!preview&&!channelId))return;
    // Mention remains visible on existing TV versions, including replies sent before migration.
    const prefix=reply?`@${reply.nome.slice(0,100)} `:"";
    const body=prefix+text;
    if(body.length>400){setNotice("A mensagem é muito longa para esta resposta.");return;}
    setSending(true);setNotice("");
    try{
      if(preview){setMessages(prev=>merge(prev,[{id:crypto.randomUUID(),channel_id:"preview",nome:name,message:body,created_at:new Date().toISOString(),author_listener_id:demoId,reply_to_id:reply?.id}]));}
      else{
        const {data:auth,error:authError}=await playerSupabase.auth.getUser();
        if(authError||auth.user?.id!==user?.id)throw new Error("Sua sessão expirou. Reconecte sua conta Google.");
        const record={channel_id:channelId,nome:name,cidade:"",message:body,...(mode.current==="social"&&reply?{reply_to_id:reply.id}:{})};
        const {data,error}=await db.from("player_chat_messages").insert(record).select(mode.current==="social"?socialFields:baseFields).single();
        if(error)throw error;
        if(data)setMessages(prev=>merge(prev,[data]));void refresh.current();
      }
      follow.current=true;setAtBottom(true);setMessage("");setReply(null);setSelected(null);
    }catch(e){setNotice(e instanceof Error?e.message:"Não foi possível enviar a mensagem. Tente novamente.");}
    finally{setSending(false);}
  }
  return <div className="pair9-chat">
    <div className="pair9-chat-tools"><button type="button" className="pair9-friends-toggle" aria-expanded={showFriends} onClick={()=>{setShowFriends(v=>!v);setSelected(null);void reloadFriends();}}><Users size={18}/> Amigos</button></div>
    {showFriends ? <div className="pair9-friends-list">
      {!socialReady&&!preview?<p>A lista de amigos será habilitada após a atualização do banco.</p>:!ownId?<p>Complete seu cadastro para usar a lista de amigos.</p>:!friends.length?<p>Nenhum amigo ou solicitação ainda.</p>:friends.map(f=>{const incoming=f.recipient_id===ownId;const other=incoming?f.requester_id:f.recipient_id;return <article key={f.id}><div><strong>{(incoming?f.requester_name:f.recipient_name)||labelFor(other)}</strong><small>{f.status==="accepted"?"Amigo":incoming?"Solicitação recebida":"Aguardando aceitação"}</small></div><div>{incoming&&f.status==="pending"&&<button type="button" disabled={friendBusy} onClick={()=>void changeFriend(f,true)} aria-label="Aceitar solicitação"><Check size={18}/></button>}<button type="button" disabled={friendBusy} aria-label="Remover amizade ou solicitação" onClick={()=>void changeFriend(f,false)}><X size={18}/></button></div></article>;})}
    </div> : <div className="pair9-message-wrap"><div ref={list} className="pair9-message-list" role="log" aria-live="polite" aria-label="Mensagens recentes" onScroll={()=>{const el=list.current;if(!el)return;const bottom=el.scrollHeight-el.scrollTop-el.clientHeight<60;follow.current=bottom;setAtBottom(bottom);}}>
      {loading?<p className="pair9-empty">Carregando mensagens…</p>:!messages.length?<p className="pair9-empty">Nenhuma mensagem recente.</p>:messages.map(m=>{const own=!!ownId&&m.author_listener_id===ownId;const parent=messages.find(x=>x.id===m.reply_to_id);const f=m.author_listener_id?friendOf(m.author_listener_id):undefined;return <article key={m.id} className={"pair9-row"+(own?" own":"")}>
        <button type="button" className="pair9-bubble" aria-expanded={selected===m.id} onClick={()=>setSelected(v=>v===m.id?null:m.id)}><strong>{m.nome}</strong>{parent&&<small className="pair9-quote">↳ {parent.nome}: {parent.message.slice(0,80)}</small>}<span>{m.message}</span></button>
        {selected===m.id&&<div className="pair9-message-actions"><button type="button" onClick={()=>chooseReply(m)}><Reply size={15}/> Responder</button>{!own&&<button type="button" disabled={friendBusy||!!f} onClick={()=>void addFriend(m)}><UserPlus size={15}/>{f?f.status==="accepted"?"Amigo":"Solicitado":"Adicionar amigo"}</button>}</div>}
      </article>;})}
    </div>{!atBottom&&<button className="pair9-latest" type="button" aria-label="Últimas mensagens" onClick={()=>{follow.current=true;list.current?.scrollTo({top:list.current.scrollHeight,behavior:"smooth"});}}><ArrowDown size={17}/></button>}</div>}
    {reply&&<div className="pair9-reply"><div><strong>Respondendo a {reply.nome}</strong><span>{reply.message.slice(0,100)}</span></div><button type="button" aria-label="Cancelar resposta" onClick={()=>setReply(null)}><X size={18}/></button></div>}
    {(notice||error)&&<p className="pair9-notice" role="status">{notice||error}</p>}
    {signed?<form onSubmit={send} className="pair9-compose"><textarea ref={input} aria-label="Sua mensagem" value={message} onChange={e=>setMessage(e.target.value)} maxLength={Math.max(1,400-(reply?reply.nome.slice(0,100).length+2:0))} rows={2} placeholder="Escreva sua mensagem…"/><button className="pair9-send" type="submit" aria-label="Enviar mensagem" disabled={sending||!message.trim()||(!preview&&!channelId)}>{sending?<Loader2 className="animate-spin" size={21}/>:<Send size={21}/>}</button></form>:<p className="pair9-notice">{authLoading?"Verificando sua conta…":"Conecte sua conta Google para participar."}</p>}
  </div>;
}
