/* NEXO_PAIRING_MOBILE_V14 — formulário isolado do pareamento mobile. */
import {useEffect,useRef,useState,type FormEvent} from "react";
import {usePlayerAuth} from "@/hooks/usePlayerAuth";
import {playerSupabase} from "@/integrations/supabase/playerClient";
import {isRadioId} from "@/lib/playerRadioChatScope";

export const emptyRegistration={nome:"",email:"",whatsapp:"",cpf:"",sexo:"",data_nascimento:"",estado:"",cidade:"",setor:"",cep:""};
export type Registration=typeof emptyRegistration;
export type RegistrationField=keyof Registration;
const requiredFields=(Object.keys(emptyRegistration) as RegistrationField[]).filter(k=>k!=="email");
const labels:Record<RegistrationField,string>={nome:"Nome completo",email:"E-mail Google",whatsapp:"WhatsApp",cpf:"CPF",sexo:"Sexo",data_nascimento:"Data de nascimento",estado:"Estado / UF",cidade:"Cidade",setor:"Bairro / Setor",cep:"CEP"};
const UFS=Object.entries({AC:"Acre",AL:"Alagoas",AP:"Amapá",AM:"Amazonas",BA:"Bahia",CE:"Ceará",DF:"Distrito Federal",ES:"Espírito Santo",GO:"Goiás",MA:"Maranhão",MT:"Mato Grosso",MS:"Mato Grosso do Sul",MG:"Minas Gerais",PA:"Pará",PB:"Paraíba",PR:"Paraná",PE:"Pernambuco",PI:"Piauí",RJ:"Rio de Janeiro",RN:"Rio Grande do Norte",RS:"Rio Grande do Sul",RO:"Rondônia",RR:"Roraima",SC:"Santa Catarina",SP:"São Paulo",SE:"Sergipe",TO:"Tocantins"}).sort((a,b)=>a[1].localeCompare(b[1],"pt-BR"));
const cityCache=new Map<string,string[]>();
const normalize=(v:string)=>v.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const digits=(v:string,n=99)=>v.replace(/\D/g,"").slice(0,n);
export function maskRegistration(k:RegistrationField,value:string){
 const d=digits(value,k==="cep"?8:11);
 if(k==="cpf")return [d.slice(0,3),d.slice(3,6),d.slice(6,9)].filter(Boolean).join(".")+(d.length>9?"-"+d.slice(9):"");
 if(k==="cep")return d.replace(/^(\d{5})(\d)/,"$1-$2");
 if(k==="whatsapp")return d.length<=2?d.length?`(${d}`:"":`(${d.slice(0,2)}) ${d.slice(2,d.length===11?7:6)}${d.length>(d.length===11?7:6)?"-"+d.slice(d.length===11?7:6):""}`;
 return value;
}
function cpfValid(value:string){const d=digits(value);if(d.length!==11||/^(\d)\1{10}$/.test(d))return false;for(const n of [9,10]){let sum=0;for(let i=0;i<n;i++)sum+=Number(d[i])*(n+1-i);const x=(sum*10)%11;if((x===10?0:x)!==Number(d[n]))return false;}return true;}
export function validRegistration(k:RegistrationField,v:string){
 if(k==="cpf")return cpfValid(v);
 if(k==="whatsapp")return /^\d{2}[2-9]\d{7,8}$/.test(digits(v));
 if(k==="cep")return /^\d{8}$/.test(digits(v));
 if(k==="estado")return UFS.some(([uf])=>uf===v);
 if(k==="data_nascimento")return /^\d{4}-\d{2}-\d{2}$/.test(v)&&!isNaN(Date.parse(v))&&v>="1900-01-01"&&v<=new Date().toISOString().slice(0,10);
 if(k==="nome")return v.trim().length>=3;
 return !!v.trim();
}
export const registrationComplete=(v:Registration)=>requiredFields.every(k=>validRegistration(k,v[k]));
function flyStars(source:HTMLElement,arrive:()=>void){
 const target=document.querySelector<HTMLElement>(".pair7-header .pair6-points");
 if(!target||window.matchMedia("(prefers-reduced-motion: reduce)").matches){arrive();return;}
 const a=source.getBoundingClientRect(),b=target.getBoundingClientRect(),sx=a.right-15,sy=a.top+a.height/2,dx=b.left+b.width/2-sx,dy=b.top+b.height/2-sy;
 for(let i=0;i<5;i++){const star=document.createElement("span");star.className="pair14-flying-star";star.textContent="★";star.setAttribute("aria-hidden","true");star.style.left=`${sx}px`;star.style.top=`${sy}px`;document.body.appendChild(star);
 const anim=star.animate([{transform:"translate(0,0) scale(.45)",opacity:0},{transform:`translate(${dx*.35+((i-2)*19)}px,${dy*.35-30}px) scale(1.15)`,opacity:1,offset:.35},{transform:`translate(${dx}px,${dy}px) scale(.32)`,opacity:.9}],{duration:560,delay:i*38,easing:"ease-in-out",fill:"both"});anim.onfinish=()=>star.remove();anim.oncancel=()=>star.remove();window.setTimeout(()=>star.remove(),1000);}
 window.setTimeout(()=>{arrive();target.classList.remove("pair14-reward-pulse");void target.offsetWidth;target.classList.add("pair14-reward-pulse");window.setTimeout(()=>target.classList.remove("pair14-reward-pulse"),500);},725);
}
type Props={preview:boolean;radioId?:string;displayName:string;draft:Registration;onDraft:(next:Registration)=>void;earned:RegistrationField[];onEarn:(key:RegistrationField)=>void};
export default function PairRegistration({preview,radioId,displayName,draft,onDraft,earned,onEarn}:Props){
 const {user,loading:authLoading}=usePlayerAuth();
 const [real,setReal]=useState<Registration>(emptyRegistration),[loading,setLoading]=useState(!preview),[saving,setSaving]=useState(false),[status,setStatus]=useState(""),[cepReady,setCepReady]=useState(false),[loaded,setLoaded]=useState(false);
 const values=preview?draft:real;const setValues=preview?onDraft:setReal;
 const [stateText,setStateText]=useState(""),[cityText,setCityText]=useState(""),[active,setActive]=useState<"estado"|"cidade"|null>(null),[cities,setCities]=useState<string[]>([]),[cityBusy,setCityBusy]=useState(false),[cityError,setCityError]=useState(false),[retry,setRetry]=useState(0);
 const [sound,setSound]=useState(true);const audio=useRef<AudioContext|null>(null);const pending=useRef(new Set<RegistrationField>());const initial=useRef(new Set<RegistrationField>(requiredFields.filter(k=>validRegistration(k,draft[k])&&!earned.includes(k))));
 const latest=useRef(values);latest.current=values;
 const unlockSound=()=>{if(!preview||!sound)return;try{audio.current??=new AudioContext();void audio.current.resume().catch(()=>{});}catch{/* silent fallback */}};
 const chime=()=>{const ctx=audio.current;if(!sound||!ctx||ctx.state!=="running")return;try{[880,1174.66,1567.98].forEach((hz,i)=>{const o=ctx.createOscillator(),g=ctx.createGain(),t=ctx.currentTime+i*.065;o.type="sine";o.frequency.value=hz;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(.035,t+.018);g.gain.exponentialRampToValueAtTime(.0001,t+.18);o.connect(g);g.connect(ctx.destination);o.start(t);o.stop(t+.2);});}catch{}};
 useEffect(()=>()=>{void audio.current?.close().catch(()=>{});},[]);
 useEffect(()=>{if(preview||authLoading)return;let alive=true;setLoaded(false);setLoading(true);setStatus("");(async()=>{try{if(!user?.id||user.is_anonymous||!isRadioId(radioId))throw Error("Conecte sua conta Google e aguarde a identificação da rádio.");const auth=await playerSupabase.auth.getUser();if(auth.error||auth.data.user?.id!==user.id)throw Error("Sessão expirada.");const db=playerSupabase as any;const cols="nome,email,whatsapp,cpf,sexo,data_nascimento,estado,cidade,setor";const query=(columns:string)=>db.from("player_listener_profiles").select(columns).eq("auth_user_id",user.id).eq("radio_user_id",radioId).maybeSingle();let result=await query(cols+",cep"),hasCep=true;if(result.error&&["42703","PGRST204"].includes(result.error.code)){hasCep=false;result=await query(cols);}if(result.error)throw result.error;if(!alive)return;const row=result.data||{};const next={...emptyRegistration};for(const k of Object.keys(next) as RegistrationField[])next[k]=maskRegistration(k,String(row[k]??""));next.email=user.email||"";next.nome=next.nome||displayName;const uf=UFS.find(([code,name])=>normalize(code)===normalize(next.estado)||normalize(name)===normalize(next.estado));next.estado=uf?.[0]||"";setReal(next);setCepReady(hasCep);setLoaded(true);}catch(e){if(alive)setStatus(e instanceof Error?e.message:"Não foi possível carregar o cadastro.");}finally{if(alive)setLoading(false);}})();return()=>{alive=false;};},[preview,authLoading,user?.id,radioId]);
 useEffect(()=>{setStateText(UFS.find(([uf])=>uf===values.estado)?.[1]||"");setCityText(values.cidade);},[values.estado,values.cidade]);
 useEffect(()=>{setCities([]);setCityError(false);if(!values.estado){setCityBusy(false);return;}const uf=values.estado,cached=cityCache.get(uf);if(cached){setCities(cached);setCityBusy(false);return;}let alive=true;const ctrl=new AbortController();setCityBusy(true);const timer=window.setTimeout(()=>ctrl.abort(),10000);fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`,{signal:ctrl.signal}).then(r=>{if(!r.ok)throw Error("IBGE");return r.json();}).then((rows:unknown)=>{if(!Array.isArray(rows))throw Error("IBGE");const list=rows.map(r=>String(r?.nome||"")).filter(Boolean).sort((a,b)=>a.localeCompare(b,"pt-BR"));if(!list.length)throw Error("IBGE");cityCache.set(uf,list);if(alive)setCities(list);}).catch(()=>{if(alive)setCityError(true);}).finally(()=>{clearTimeout(timer);if(alive)setCityBusy(false);});return()=>{alive=false;ctrl.abort();clearTimeout(timer);};},[values.estado,retry]);
 function change(k:RegistrationField,v:string){const next={...latest.current,[k]:maskRegistration(k,v)};latest.current=next;setValues(next);}
 function reward(k:RegistrationField,v:string,source:HTMLElement){if(!preview||k==="email"||initial.current.has(k)||earned.includes(k)||pending.current.has(k)||!validRegistration(k,v))return;pending.current.add(k);flyStars(source,()=>{onEarn(k);chime();});}
 function chooseState(uf:string,source:HTMLElement){const next={...latest.current,estado:uf,cidade:latest.current.estado===uf?latest.current.cidade:""};latest.current=next;setValues(next);setStateText(UFS.find(([code])=>code===uf)?.[1]||uf);setCityText(next.cidade);setActive(null);reward("estado",uf,source);}
 function chooseCity(city:string,source:HTMLElement){change("cidade",city);setCityText(city);setActive(null);reward("cidade",city,source);}
 async function save(e:FormEvent){e.preventDefault();setStatus("");const v=latest.current;for(const k of requiredFields){if(v[k].trim()&&!validRegistration(k,v[k])){setStatus(`Confira o campo ${labels[k]}.`);return;}}if(!validRegistration("nome",v.nome)){setStatus("Informe seu nome completo.");return;}if(preview){setStatus(registrationComplete(v)?"★ Cadastro completo! Parabéns! (prévia)":"Cadastro salvo na demonstração.");return;}if(!loaded||saving||!user?.id||!isRadioId(radioId))return;if(v.cep&&!cepReady){setStatus("O CEP ainda não pode ser gravado: a atualização do banco está pendente. Nenhum dado foi enviado.");return;}setSaving(true);try{const auth=await playerSupabase.auth.getUser();if(auth.error||auth.data.user?.id!==user.id)throw Error("Sessão expirada.");const data:any={auth_user_id:user.id,radio_user_id:radioId,updated_at:new Date().toISOString(),email:user.email||""};for(const k of requiredFields){if(k==="cep"&&!cepReady)continue;data[k]=k==="data_nascimento"?v[k]||null:["cpf","cep","whatsapp"].includes(k)?digits(v[k]):v[k].trim();}const {error}=await (playerSupabase as any).from("player_listener_profiles").upsert(data,{onConflict:"auth_user_id,radio_user_id"});if(error)throw error;setStatus("Cadastro salvo! A pontuação real depende das regras oficiais da rádio.");}catch(e){setStatus(e instanceof Error?e.message:"Não foi possível salvar o cadastro.");}finally{setSaving(false);}}
 if(!preview&&(loading||authLoading))return <p role="status">Carregando cadastro…</p>;
 if(!preview&&!loaded)return <p role="alert">{status||"Cadastro indisponível."}</p>;
 const stateMatches=UFS.filter(([uf,name])=>normalize(name).includes(normalize(stateText))||normalize(uf).startsWith(normalize(stateText))).slice(0,10);
 const cityMatches=cities.filter(c=>normalize(c).includes(normalize(cityText))).slice(0,15);
 return <form className="pair14-registration" onSubmit={save} onPointerDown={unlockSound} onKeyDown={unlockSound}>
 {preview&&<div className="pair14-sound"><span>Prévia: +10 pontos por campo novo válido</span><label><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/> Som</label></div>}
 {registrationComplete(values)&&<p className="pair14-done">★ Cadastro completo!</p>}
 {(Object.keys(emptyRegistration) as RegistrationField[]).map(k=><div key={k}><label htmlFor={`pair14-${k}`}><span className="pair14-field-caption">{labels[k]}{k!=="email"&&!validRegistration(k,values[k])&&<small>Pendente</small>}</span>
 {k==="estado"?<input id={`pair14-${k}`} value={stateText} placeholder="Digite seu estado" autoComplete="off" onFocus={()=>setActive("estado")} onChange={e=>{setStateText(e.target.value);setActive("estado");}} onBlur={e=>{if(e.relatedTarget instanceof Node&&e.currentTarget.closest(".pair14-registration > div")?.contains(e.relatedTarget))return;setActive(null);setStateText(UFS.find(([uf])=>uf===latest.current.estado)?.[1]||"");}}/>:k==="cidade"?<input id={`pair14-${k}`} value={cityText} disabled={!values.estado||cityBusy} placeholder={!values.estado?"Selecione o estado primeiro":cityBusy?"Carregando cidades…":"Digite sua cidade"} autoComplete="off" onFocus={()=>setActive("cidade")} onChange={e=>{setCityText(e.target.value);setActive("cidade");}} onBlur={e=>{if(e.relatedTarget instanceof Node&&e.currentTarget.closest(".pair14-registration > div")?.contains(e.relatedTarget))return;setActive(null);setCityText(latest.current.cidade);}}/>:k==="sexo"?<select id={`pair14-${k}`} value={values[k]} onChange={e=>{change(k,e.target.value);reward(k,e.target.value,e.currentTarget);}}><option value="">Selecionar</option>{["Masculino","Feminino","Outro","Prefiro não informar"].map(x=><option key={x}>{x}</option>)}</select>:<input id={`pair14-${k}`} value={values[k]} disabled={k==="email"||k==="cep"&&!preview&&!cepReady} type={k==="data_nascimento"?"date":k==="email"?"email":"text"} maxLength={k==="cpf"?14:k==="whatsapp"?15:k==="cep"?9:120} inputMode={["cpf","whatsapp","cep"].includes(k)?"numeric":undefined} placeholder={k==="cpf"?"000.000.000-00":k==="whatsapp"?"(00) 00000-0000":k==="cep"?"00000-000":undefined} onChange={e=>change(k,e.target.value)} onBlur={e=>reward(k,e.target.value,e.currentTarget)}/>}</label>
 {k==="estado"&&active==="estado"&&<div className="pair14-suggestions" aria-label="Estados sugeridos">{stateMatches.length?stateMatches.map(([uf,name])=><button key={uf} type="button" onPointerDown={e=>e.preventDefault()} onClick={e=>chooseState(uf,e.currentTarget)}>{name} — {uf}</button>):<small>Nenhum estado encontrado.</small>}</div>}
 {k==="cidade"&&active==="cidade"&&!cityBusy&&!cityError&&<div className="pair14-suggestions" aria-label="Cidades sugeridas">{cityMatches.length?cityMatches.map(c=><button type="button" key={c} onPointerDown={e=>e.preventDefault()} onClick={e=>chooseCity(c,e.currentTarget)}>{c}</button>):<small>Nenhuma cidade encontrada.</small>}</div>}
 {k==="cidade"&&cityError&&<p className="pair14-form-status">Não foi possível consultar o IBGE. <button type="button" onClick={()=>setRetry(r=>r+1)}>Tentar novamente</button></p>}
 {k==="cep"&&!preview&&!cepReady&&<small>Salvamento do CEP aguardando atualização do banco.</small>}</div>)}
 <button className="pair14-save" type="submit" disabled={saving}>{saving?"Salvando…":"Salvar cadastro"}</button>{status&&<p className="pair14-form-status" role="status">{status}</p>}
 </form>;
}
