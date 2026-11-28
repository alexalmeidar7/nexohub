/* NEXO_PAIRING_MOBILE_V14 — Friends em prévia; avatar persistido pelo PairPage. */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Heart, MessageCircle, Star, UserRound, Users, Vibrate, X, Hand, Send, Check, ImagePlus, UserMinus, UserPlus } from "lucide-react";

type Friend = { id: string; name: string; color: string; photo?: string; presenter?: boolean };
export type PairPresenter = { id: string; nome: string; foto?: string | null };
const AVATARS = ["/avatars/usr-default.png", ...Array.from({length:8},(_,i)=>`/avatars/usr-${i+1}.png`)];
const demoFriends: Friend[] = ["Mariana","Rafael","Camila","André","Lucas","Juliana","Bruno","Paula","Felipe","Ana"].map((name,i)=>({id:`friend-${i}`,name,color:["#755e80","#4c6e7d","#965d65","#786847","#536c59"][i%5]}));
const demoRequests: Friend[] = [{id:"req-1",name:"Gabriel",color:"#4c6e7d"},{id:"req-2",name:"Isabela",color:"#965d65"}];
type Interaction = { id: string; from: Friend; type: "wave" | "shake" };
type Chat = { id:string; friend:Friend; text:string; own:boolean };
const demoInteractions:Interaction[]=[{id:"wave-1",from:demoFriends[0],type:"wave"},{id:"shake-1",from:demoFriends[2],type:"shake"}];
function Avatar({friend,mark}:{friend:Friend;mark?:boolean}){
  const [failed,setFailed]=useState(false);
  useEffect(()=>setFailed(false),[friend.photo]);
  const image=!failed?(friend.photo||(friend.presenter?"/avatars/usr-default.png":null)):null;
  return <span className="pair11-friend-avatar" data-presenter={friend.presenter?"true":"false"} style={friend.presenter?undefined:{background:friend.color}}><span className="pair14-avatar-clip">{image?<img src={image} alt="" onError={e=>{if(friend.presenter&&!e.currentTarget.src.endsWith("/avatars/usr-default.png")){e.currentTarget.src="/avatars/usr-default.png";}else setFailed(true);}}/>:friend.name.slice(0,1)}</span>{mark&&<span className="pair11-shake-icon" aria-label="Chamou sua atenção"><Vibrate size={12}/></span>}</span>;
}

export function PairFriends({open,preview,onClose,onCount,presenters=[]}:{open:boolean;preview:boolean;onClose:()=>void;onCount:(n:number)=>void;presenters?:PairPresenter[]}){
  const [tab,setTab]=useState<"friends"|"requests"|"messages">("friends");
  const [friends,setFriends]=useState(demoFriends);
  const presentersList:Friend[]=Array.from(new Map(presenters.filter(p=>p?.id&&p?.nome).map(p=>[String(p.id),p])).values()).map(p=>({id:`presenter-${p.id}`,name:p.nome,color:"#303036",photo:p.foto||undefined,presenter:true}));
  const availablePresenters=presentersList.filter(p=>!friends.some(f=>f.id===p.id));
  const sortedFriends=[...friends].sort((a,b)=>Number(!!b.presenter)-Number(!!a.presenter));
  const addPresenter=(p:Friend)=>{if(!preview)return;setFriends(prev=>prev.some(f=>f.id===p.id)?prev:[p,...prev]);setNotice(`${p.name} adicionado à lista — prévia.`);};
  const removeFriend=(p:Friend)=>{if(!preview)return;setFriends(prev=>prev.filter(f=>f.id!==p.id));setEvents(prev=>prev.filter(e=>e.from.id!==p.id));setSelected(null);setNotice("Amizade desfeita — prévia.");};
  const [requests,setRequests]=useState(demoRequests);
  const [events,setEvents]=useState(demoInteractions);
  const [unread,setUnread]=useState(true);
  const [selected,setSelected]=useState<Friend|null>(null);
  const actionsRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{if(selected)actionsRef.current?.scrollIntoView({block:"nearest",behavior:"smooth"});},[selected?.id]);
  const [conversation,setConversation]=useState<Friend|null>(null);
  const [messages,setMessages]=useState<Chat[]>([{id:"chat-1",friend:demoFriends[0],text:"Oi! Está ouvindo a rádio?",own:false}]);
  const [message,setMessage]=useState("");
  const [notice,setNotice]=useState("");
  const [shake,setShake]=useState(false);
  const count=preview?requests.length+events.length+Number(unread):0;
  useEffect(()=>{onCount(count);},[count,onCount]);
  useEffect(()=>{if(!open){setSelected(null);setConversation(null);setTab("friends");setNotice("");return;}if(preview&&events.some(e=>e.type==="shake")){setShake(true);const t=window.setTimeout(()=>setShake(false),700);return()=>{clearTimeout(t);setShake(false);};}},[open,preview]);
  function selectTab(next:typeof tab){setTab(next);setSelected(null);setConversation(null);setNotice("");}
  function respond(id:string,accept:boolean){if(!preview)return;const target=requests.find(r=>r.id===id);if(accept&&target)setFriends(prev=>[...prev,target]);setRequests(prev=>prev.filter(r=>r.id!==id));}
  function openChat(friend:Friend){setConversation(friend);setSelected(null);setTab("messages");if(friend.id===demoFriends[0].id)setUnread(false);setMessage("");}
  function send(){if(!preview||!conversation||!message.trim())return;setMessages(prev=>[...prev,{id:crypto.randomUUID(),friend:conversation,text:message.trim(),own:true}]);setMessage("");}
  if(!open)return null;
  const marked=new Set(events.filter(e=>e.type==="shake").map(e=>e.from.id));
  const contacts=Array.from(new Map(messages.map(m=>[m.friend.id,m.friend])).values());
  return <section className="pair11-friends-page" aria-label="Friends">
    <div className="pair11-friends-title"><button type="button" aria-label="Voltar" onClick={onClose}><ArrowLeft size={20}/></button><h2>Friends</h2></div>
    <div className="pair11-tabs" aria-label="Área Friends">
      <button type="button" aria-pressed={tab==="friends"} onClick={()=>selectTab("friends")}>Friends</button>
      <button type="button" aria-pressed={tab==="requests"} onClick={()=>selectTab("requests")}>Solicitações{preview&&requests.length+events.length>0&&<b>{requests.length+events.length}</b>}</button>
      <button type="button" aria-pressed={tab==="messages"} onClick={()=>selectTab("messages")}>Mensagens{preview&&unread&&<b>1</b>}</button>
    </div>
    {!preview?<div className="pair11-empty"><Users size={32}/><p>A área Friends está em preparação. As solicitações existentes continuam disponíveis no chat oficial.</p></div>:
      <><div className="pair11-friends-content">
      {tab==="friends"?<>{availablePresenters.length>0&&<section className="pair13-presenters"><h3>Locutores</h3><div className="pair13-presenter-strip" aria-label="Locutores disponíveis">{availablePresenters.map(p=><button type="button" key={p.id} onClick={()=>addPresenter(p)} aria-label={`Adicionar ${p.name}`}><span className="pair13-presenter-wrap"><Avatar friend={p}/><span className="pair13-add"><UserPlus size={11}/></span></span><span>{p.name}</span></button>)}</div></section>}<h3 className="pair13-friends-label">Amigos do Chat</h3><div className="pair14-friend-rows">{Array.from({length:Math.ceil(sortedFriends.length/5)},(_,i)=>sortedFriends.slice(i*5,i*5+5)).map((row,i)=><div key={i} className="pair14-friend-row"><div className={"pair11-friends-grid"+(shake?" pair11-shake":"")}>{row.map(f=><button type="button" key={f.id} aria-pressed={selected?.id===f.id} onClick={()=>{setSelected(prev=>prev?.id===f.id?null:f);setNotice("");setEvents(prev=>prev.filter(e=>e.type!=="shake"||e.from.id!==f.id));}}><Avatar friend={f} mark={marked.has(f.id)}/><span>{f.name}</span></button>)}</div>{selected&&row.some(f=>f.id===selected.id)&&<div ref={actionsRef} className="pair11-friend-actions pair14-inline-actions"><div className="pair11-selected"><strong>{selected.name}</strong><button type="button" aria-label="Fechar opções" onClick={()=>setSelected(null)}><X size={17}/></button></div><button type="button" onClick={()=>openChat(selected)}><MessageCircle size={18}/> Enviar mensagem</button><button type="button" onClick={()=>setNotice(`Aceno para ${selected.name} — prévia.`)}><Hand size={18}/> Enviar aceno</button><button type="button" onClick={()=>setNotice(`Chacoalho para ${selected.name} — prévia.`)}><Vibrate size={18}/> Chamar atenção</button><button type="button" onClick={()=>removeFriend(selected)}><UserMinus size={18}/> Desfazer amizade</button></div>}</div>)}</div></>:
      tab==="requests"?<div className="pair11-social-list">{requests.length===0&&events.length===0&&<p>Nenhuma solicitação pendente.</p>}{requests.map(f=><article key={f.id}><Avatar friend={f}/><div><strong>{f.name}</strong><small>Solicitação de amizade</small></div><button type="button" aria-label={`Aceitar ${f.name}`} onClick={()=>respond(f.id,true)}><Check size={18}/></button><button type="button" aria-label={`Recusar ${f.name}`} onClick={()=>respond(f.id,false)}><X size={18}/></button></article>)}{events.map(e=><article key={e.id}><Avatar friend={e.from} mark={e.type==="shake"}/><div><strong>{e.from.name}</strong><small>{e.type==="wave"?"Enviou um aceno":"Chamou sua atenção"}</small></div><button type="button" aria-label="Marcar como visto" onClick={()=>setEvents(prev=>prev.filter(x=>x.id!==e.id))}><Check size={18}/></button></article>)}</div>:
      conversation?<div className="pair11-private-chat"><div className="pair11-conversation-header"><button type="button" aria-label="Voltar às mensagens" onClick={()=>setConversation(null)}><ArrowLeft size={18}/></button><Avatar friend={conversation}/><strong>{conversation.name}</strong></div><div className="pair11-private-messages" role="log">{messages.filter(m=>m.friend.id===conversation.id).map(m=><p key={m.id} className={m.own?"own":""}>{m.text}</p>)}</div><form onSubmit={e=>{e.preventDefault();send();}}><input value={message} onChange={e=>setMessage(e.target.value)} maxLength={400} placeholder="Escreva sua mensagem…" aria-label="Mensagem privada"/><button type="submit" disabled={!message.trim()} aria-label="Enviar"><Send size={19}/></button></form></div>:<div className="pair11-social-list">{contacts.map(f=><button type="button" className="pair11-thread" key={f.id} onClick={()=>openChat(f)}><Avatar friend={f}/><div><strong>{f.name}</strong><small>{messages.filter(m=>m.friend.id===f.id).slice(-1)[0]?.text}</small></div>{unread&&f.id===demoFriends[0].id&&<b>1</b>}<ChevronRight size={18}/></button>)}</div>}
      {notice&&<p role="status" className="pair11-notice">{notice}</p>}
      </div><small className="pair11-demo">Demonstração local • nenhuma interação é enviada</small></>}
  </section>;
}

type AreaProps={radioName:string;displayName:string;avatar?:string;googleAvatar?:string;onAvatarChange:(url:string)=>Promise<void>;points:number|null;preview:boolean;registrationComplete?:boolean;children:ReactNode};
export function PairMyRadio({radioName,displayName,avatar,googleAvatar,onAvatarChange,points,preview,registrationComplete=false,children}:AreaProps){
  const [tab,setTab]=useState<"profile"|"likes"|"data">("profile");
  const [gallery,setGallery]=useState(false);
  const [savingAvatar,setSavingAvatar]=useState(false);
  const [avatarError,setAvatarError]=useState("");
  async function chooseAvatar(url:string){if(savingAvatar)return;setSavingAvatar(true);setAvatarError("");try{await onAvatarChange(url);setGallery(false);}catch{setAvatarError("Não foi possível salvar a foto. Tente novamente.");}finally{setSavingAvatar(false);}}
  return <div className="pair11-my-radio">
    <h2 id="pair11-my-title"><Star className="pair13-filled-star" size={19}/> Minha {radioName}</h2>
    <div className="pair11-tabs"><button type="button" aria-pressed={tab==="profile"} onClick={()=>setTab("profile")}>Meu perfil</button><button type="button" aria-pressed={tab==="likes"} onClick={()=>setTab("likes")}>Curtidas</button><button type="button" aria-pressed={tab==="data"} onClick={()=>setTab("data")}>Cadastro{preview&&!registrationComplete&&<i className="pair11-pending" aria-label="Cadastro incompleto"/>}</button></div>
    {tab==="profile"?<><div className="pair11-profile-hero"><div className="pair13-avatar-wrap"><div className="pair11-big-avatar">{avatar?<img key={avatar} src={avatar} alt="Sua foto"/>:<UserRound size={55}/>}</div><button type="button" className="pair13-avatar-edit" aria-label="Trocar foto do perfil" aria-expanded={gallery} onClick={()=>{setGallery(v=>!v);setAvatarError("");}}><ImagePlus size={18}/></button></div>{gallery&&<section className="pair13-avatar-gallery" aria-label="Escolher avatar"><h3>Escolha sua foto</h3><div>{googleAvatar&&<button type="button" disabled={savingAvatar} aria-label="Foto original do Google" aria-pressed={avatar===googleAvatar} onClick={()=>void chooseAvatar(googleAvatar)}><img src={googleAvatar} alt=""/><small>Google</small></button>}{AVATARS.map((url,i)=><button type="button" key={url} disabled={savingAvatar} aria-label={`Avatar ${i+1}`} aria-pressed={avatar===url} onClick={()=>void chooseAvatar(url)}><img src={url} alt=""/></button>)}</div>{avatarError&&<p role="alert">{avatarError}</p>}{savingAvatar&&<p role="status">Salvando…</p>}</section>}<div className="pair11-score"><Star size={14}/>{points===null?"—":points.toLocaleString("pt-BR")} pontos</div><h3>{displayName}</h3></div><div className="pair11-profile-links"><button type="button" onClick={()=>setTab("likes")}><Heart size={22}/><span><strong>Minhas músicas curtidas</strong><small>Suas músicas favoritas</small></span><ChevronRight size={18}/></button><button type="button" onClick={()=>setTab("data")}><UserRound size={22}/><span><strong>Meus dados cadastrais</strong><small>{preview?(registrationComplete?"Cadastro completo":"Cadastro incompleto"):"Consultar e editar seu cadastro"}</small></span>{preview&&!registrationComplete&&<i className="pair11-pending" aria-label="Cadastro incompleto"/>}<ChevronRight size={18}/></button></div></>:tab==="likes"?<div className="pair11-likes">{preview?<><small className="pair11-demo">Exemplos de músicas curtidas</small>{[{title:"Amo Noite e Dia",artist:"Jorge & Mateus"},{title:"Te Assumi pro Brasil",artist:"Matheus & Kauan"},{title:"Propaganda",artist:"Jorge & Mateus"}].map(s=><article key={s.title}><span className="pair11-song-art">♫</span><div><strong>{s.title}</strong><small>{s.artist}</small></div><Heart size={19} fill="currentColor"/></article>)}</>:<div className="pair11-empty"><Heart size={29}/><p>O histórico de curtidas será exibido quando a integração estiver disponível.</p></div>}</div>:<div className="pair11-profile-form">{children}</div>}
  </div>;
}
