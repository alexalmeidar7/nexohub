import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
/* NEXO_PAIRING_MOBILE_V7 — sessão própria do Player */
import { usePlayerAuth } from "@/hooks/usePlayerAuth";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { isRadioId } from "@/lib/playerRadioChatScope";

interface FormData {
  nome: string; email: string; whatsapp: string; cpf: string; sexo: string;
  data_nascimento: string; estado: string; cidade: string; setor: string;
}
const blank: FormData = {nome:"",email:"",whatsapp:"",cpf:"",sexo:"",data_nascimento:"",estado:"",cidade:"",setor:""};
const editableFields: ReadonlyArray<keyof FormData> = ["nome","whatsapp","cpf","sexo","data_nascimento","estado","cidade","setor"];
const labels: Record<keyof FormData,string> = {
 nome:"Nome completo", email:"E-mail Google", whatsapp:"WhatsApp",cpf:"CPF",sexo:"Sexo",
 data_nascimento:"Data de nascimento",estado:"Estado / UF",cidade:"Cidade",setor:"Bairro / Setor"
};
const requiredForCompletion: Array<keyof FormData> = ["nome","whatsapp","cpf","sexo","data_nascimento","estado","cidade","setor"];

export default function TvProfilePhone({userSlug,radioId}: {userSlug: string; radioId?: string}) {
  const {user,loading:authLoading} = usePlayerAuth();
  const [resolvedRadio,setResolvedRadio]=useState<string|null>(null);
  const [profile,setProfile] = useState<FormData>(blank);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [loggingIn,setLoggingIn] = useState(false);
  const [status,setStatus] = useState<{type:"error"|"success";message:string}|null>(null);
  const setField=(key:keyof FormData,value:string)=>setProfile(prev=>({...prev,[key]:value}));
  const incomplete=requiredForCompletion.filter(key=>!String(profile[key]||"").trim());
  const load=useCallback(async()=>{
    if(!user?.id || user.is_anonymous || !userSlug){setLoading(false);return;}
    setLoading(true);setStatus(null);setResolvedRadio(null);
    try {
      const {data:auth,error:authError}=await playerSupabase.auth.getUser();
      if(authError || auth.user?.id!==user.id)throw new Error("Sua sessão Google expirou.");
      let id=radioId;
      if(!isRadioId(id)){const {data,error}=await playerSupabase.functions.invoke("public-player-data",{body:{slug:userSlug}});if(error || data?.error || !isRadioId(data?.userId))throw new Error("Não foi possível identificar a rádio.");id=data.userId;}
      if(!isRadioId(id))throw new Error("Rádio inválida.");
      const {data,error}=await (playerSupabase as any).from("player_listener_profiles").select("nome,email,whatsapp,cpf,sexo,data_nascimento,estado,cidade,setor").eq("auth_user_id",user.id).eq("radio_user_id",id).maybeSingle();
      if(error)throw error;
      const result=data||{};
      setProfile({...blank,...Object.fromEntries(Object.keys(blank).map(key=>[key,String(result[key]??"")])),nome:result.nome||user.user_metadata?.full_name||user.user_metadata?.name||"",email:user.email||""} as FormData);
      setResolvedRadio(id);
    } catch(e){setStatus({type:"error",message:e instanceof Error?e.message:"Não foi possível carregar o cadastro. Tente recarregar."});}
    finally{setLoading(false);}
  },[user?.id,user?.is_anonymous,userSlug,radioId]);
  useEffect(()=>{if(!authLoading)void load();},[authLoading,load]);
  const login=async()=>{
    setLoggingIn(true);setStatus(null);
    try{
      const redirectTo=new URL(`/${encodeURIComponent(userSlug)}/pair?mode=profile`,window.location.origin).href;
      const {error}=await playerSupabase.auth.signInWithOAuth({provider:"google",options:{redirectTo,queryParams:{prompt:"select_account"}}});
      if(error)throw error;
    }catch(e){setStatus({type:"error",message:e instanceof Error?e.message:"Não foi possível iniciar o Google."});setLoggingIn(false);}
  };
  const save=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();if(!user?.id||user.is_anonymous||saving||!resolvedRadio)return;
    if(!profile.nome.trim()){setStatus({type:"error",message:"Informe seu nome completo."});return;}
    setSaving(true);setStatus(null);
    try{
      const {data:auth,error:authError}=await playerSupabase.auth.getUser();
      if(authError||auth.user?.id!==user.id)throw new Error("Sua sessão Google expirou.");
      const fields=Object.fromEntries(editableFields.map(key=>[key,key==="data_nascimento"?(profile[key]||null):profile[key].trim()]));
      const {data,error}=await (playerSupabase as any).from("player_listener_profiles").upsert({auth_user_id:user.id,radio_user_id:resolvedRadio,email:auth.user.email||"",...fields},{onConflict:"auth_user_id,radio_user_id"}).select("nome,email,whatsapp,cpf,sexo,data_nascimento,estado,cidade,setor").single();
      if(error||!data)throw error||new Error("Não foi possível salvar o cadastro.");
      setProfile(prev=>({...prev,...Object.fromEntries(Object.keys(blank).map(key=>[key,String(data[key]??prev[key]??"")]))} as FormData));
      setStatus({type:"success",message:"Cadastro salvo!"});
    }catch(e){setStatus({type:"error",message:e instanceof Error?e.message:"Não foi possível salvar. Confira os dados e tente novamente."});}
    finally{setSaving(false);}
  };
  return <main style={{minHeight:"100svh",background:"#090a0e",color:"white",fontFamily:"system-ui,sans-serif",padding:"28px 20px 60px"}}>
    <div style={{maxWidth:540,margin:"0 auto"}}>
      <header style={{display:"flex",alignItems:"center",gap:14,marginBottom:32}}><span style={{width:44,height:44,borderRadius:14,background:"#e41d23",display:"grid",placeItems:"center"}}><ClipboardCheck size={23}/></span>
        <div><strong style={{display:"block",fontSize:13,letterSpacing:".14em"}}>NEXO PLAYER</strong><span style={{color:"#a8a8a8",fontSize:13}}>{userSlug.toUpperCase()} · Cadastro do ouvinte</span></div></header>
      <h1 style={{fontSize:30,fontWeight:700,letterSpacing:"-.03em",margin:"0 0 8px"}}>Complete seu cadastro e pontue</h1>
      <p style={{color:"#b6b6b6",fontSize:15,lineHeight:1.5,margin:"0 0 26px"}}>Preencha os dados que faltam ou edite os já cadastrados. Use a mesma conta Google que foi conectada à televisão.</p>
      {authLoading?<p role="status">Verificando sua conta...</p>:(!user||user.is_anonymous)?<section style={{background:"#191b21",borderRadius:20,padding:24}}>
        <p style={{margin:"0 0 20px",color:"#dedede"}}>Entre com o Google para acessar seu próprio cadastro.</p>
        <button onClick={()=>void login()} disabled={loggingIn} style={{width:"100%",border:0,borderRadius:14,padding:16,background:"white",color:"#131313",fontWeight:700,cursor:"pointer"}}>{loggingIn?"Conectando...":"Continuar com Google"}</button></section>:
      loading?<p role="status"><Loader2 style={{display:"inline-block",verticalAlign:"middle"}}/> Carregando cadastro...</p>:
      <form onSubmit={event=>void save(event)} style={{display:"grid",gap:16}}>
        <div style={{borderRadius:16,background:"#1b1d23",padding:18,display:"flex",alignItems:"center",gap:12}}><CheckCircle2 color="#80d8a0" size={23}/><div style={{minWidth:0}}><strong style={{display:"block",fontSize:15,overflow:"hidden",textOverflow:"ellipsis"}}>{user.user_metadata?.full_name||user.email?.split("@")[0]}</strong><small style={{color:"#b8b8b8"}}>{user.email}</small></div></div>
        <p style={{fontSize:14,color:"#c2c2c2",margin:"0 0 2px"}}>{incomplete.length===0?"Todos os campos estão preenchidos.":`${incomplete.length} campo(s) para completar.`}</p>
        {(Object.keys(blank) as Array<keyof FormData>).map(key=><label key={key} style={{display:"grid",gap:7,fontSize:13,color:"#d2d2d2"}}>
          {labels[key]}{incomplete.includes(key) && <span style={{fontSize:11,color:"#efb4b4"}}>Pendente</span>}
          {key==="sexo"?<select value={profile[key]} onChange={e=>setField(key,e.target.value)} style={{border:0,borderRadius:12,padding:15,color:"white",background:"#25262b",fontSize:16}}><option value="">Selecionar</option><option value="Masculino">Masculino</option><option value="Feminino">Feminino</option><option value="Outro">Outro</option><option value="Prefiro não informar">Prefiro não informar</option></select>:
          <input value={profile[key]} disabled={key==="email"} onChange={e=>setField(key,e.target.value)} type={key==="data_nascimento"?"date":key==="email"?"email":key==="whatsapp"?"tel":"text"} maxLength={key==="nome"?120:key==="cpf"?18:key==="estado"?2:120} inputMode={key==="cpf"||key==="whatsapp"?"numeric":undefined} autoComplete={key==="nome"?"name":key==="email"?"email":undefined} style={{border:0,borderRadius:12,padding:15,color:"white",background:key==="email"?"#191a1d":"#25262b",fontSize:16,outlineOffset:2,opacity:key==="email" ? 0.7 : 1}}/>}
        </label>)}
        {status&&<p role={status.type==="error"?"alert":"status"} style={{padding:14,borderRadius:12,background:status.type==="success"?"#143a2a":"#522527",color:"white",fontSize:14}}>{status.message}</p>}
        <button disabled={saving||!resolvedRadio} type="submit" style={{border:0,borderRadius:14,background:"#e41d23",color:"white",padding:18,fontWeight:700,fontSize:16,cursor:"pointer",marginTop:6}}>{saving?"Salvando cadastro...":"Salvar cadastro"}</button>
        <button type="button" onClick={()=>void load()} disabled={saving} style={{border:0,background:"transparent",color:"#ccc",padding:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8,cursor:"pointer"}}><RefreshCw size={18}/> Recarregar dados</button>
      </form>}
      {status && (!user || loading) && <p role="alert" style={{padding:16,borderRadius:12,background:"#522527",marginTop:14}}>{status.message}</p>}
      <footer style={{display:"flex",alignItems:"center",justifyContent:"center",gap:8,marginTop:40,color:"#858585",fontSize:12}}><ShieldCheck size={16}/> Seus dados ficam vinculados à sua conta Google.</footer>
    </div>
  </main>;
}
