import { ReminderList } from "./TvProgramReminders";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Pencil, RefreshCw, Undo2, UserRound, QrCode, ClipboardCheck, CheckCircle2, Plus, LogOut, Trash2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { OttBackdrop, OttClientBrand, OttFrame } from "./OttFrame";
import OttArtwork from "./OttArtwork";
import { useOttRemote } from "./useOttRemote";
import { completeSecurePairing, getTvPairSessionId, newDeviceProof, pairingPath } from "@/lib/nexoTvPairClient";
import "./OttProfilesPolish.css";
import "./OttProfilesV7.css";
import "./OttProfilesV73.css";
import "./OttProfilesV74.css";
import "./OttProfileEntryV21.css";

export interface OttProfileData { nome: string; email: string; cpf: string; whatsapp: string; sexo: string; estado: string; cidade: string; setor: string; data_nascimento: string; avatar_url: string }
interface SubProfile { id: string; name: string; avatar_url: string }
interface Props { radioUserId?: string | null;  logo?: string | null; radioName?: string; profile: OttProfileData; authenticated: boolean; presentationOnly?: boolean; background?: string | null; accent?: string; initialEdit?: boolean; profiles: SubProfile[]; avatars: string[]; onContinue: () => void; onSwitch: (p: SubProfile) => void; onSave: (p: OttProfileData) => Promise<boolean>; onAdd: (name: string, avatar: string) => Promise<void | "local">; onUpdateSub: (profile: SubProfile) => Promise<void>; onDeleteSub: (profile: SubProfile) => Promise<void>; onLogin: () => void; onLogout: () => Promise<void>; userSlug?: string | null; nowPlaying?: {titulo: string; artista: string; capa?: string} | null; onPairSuccess?: () => void; onRegistrationRefresh?: () => void | Promise<void> }

function ProfileCircle({ avatar, name }: { avatar: string; name: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [avatar]);
  return <span className={`ott-avatar${!avatar || avatar.includes("usr-default") || failed ? " ott-avatar-default" : ""}`}>{avatar && !avatar.includes("usr-default") && !failed ? <img src={avatar} alt={name} onError={()=>setFailed(true)}/> : <UserRound aria-hidden="true"/>}</span>;
}

function GoogleWhiteIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12.24 10.285V14.4h6.806c-.274 1.764-2.057 5.175-6.806 5.175-4.095 0-7.434-3.39-7.434-7.575s3.339-7.575 7.434-7.575c2.327 0 3.885.992 4.776 1.851l3.254-3.14C18.187 1.194 15.48 0 12.24 0 5.59 0 .2 5.38.2 12s5.39 12 12.04 12C19.193 24 23.8 19.118 23.8 12.267c0-.825-.094-1.452-.21-2.082H12.24z"/></svg>;
}

function PairInProfile({ slug, onClose, onSuccess }: { slug: string; onClose: ()=>void; onSuccess:()=>void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const successRef = useRef(onSuccess); successRef.current = onSuccess;
  const [expiresAt, setExpiresAt] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const succeeded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      succeeded.current = false;
      setCode(""); setError(""); setBusy(false);
      if (!slug) { setError("Emissora não identificada."); return; }
      try {
        const { secret, proofHash } = await newDeviceProof();
        const tvSessionId = getTvPairSessionId(slug);
        const { data, error: createError } = await playerSupabase.functions.invoke("tv-pair-create", {body:{userSlug:slug, tvSessionId, proofHash}});
        if (cancelled) return;
        const displayCode = typeof data?.displayCode === "string" ? data.displayCode : String(data?.code || "");
        const privateCode = String(data?.code || "");
        if (createError || !data?.ok || !/^\d{4}$/.test(displayCode) || !privateCode) {
          throw new Error("O servidor não retornou um código de 4 números. Gere outro código ou verifique o serviço de pareamento.");
        }
        setCode(displayCode);
        const expiry = Date.parse(data.expiresAt || "");
        setExpiresAt(Number.isFinite(expiry) ? expiry : Date.now() + 15*60*1000);
        if (data.devicePairing !== true) {setError("O servidor de pareamento ainda precisa ser atualizado para conectar a conta Google com segurança."); return;}
        const poll = async () => {
          if (cancelled || succeeded.current) return;
          if (Date.now() >= (Number.isFinite(expiry) ? expiry : Date.now()+1)) { setError("Código expirado. Gere um novo código."); return; }
          try {
            const { data: status, error: statusError } = await playerSupabase.functions.invoke("tv-pair-status", {body:{code:privateCode,tvSessionId}});
            if (statusError || !status?.ok) throw new Error("Não foi possível acompanhar o pareamento.");
            if (status.row?.status === "claimed") {
              if (!status.row.paired_user_id) { setError("O celular entrou como visitante, não com Google. Gere outro QR code."); return; }
              succeeded.current = true; setBusy(true);
              try {
                await completeSecurePairing({code:privateCode,secret,tvSessionId,expectedUserId:status.row.paired_user_id,slug});
                if (!cancelled) successRef.current();
              } catch(e) { succeeded.current=false; if(!cancelled) setError(e instanceof Error?e.message:"Falha na autenticação da TV."); }
              finally { if(!cancelled) setBusy(false); }
              return;
            }
          } catch(e) { if (!cancelled) setError(e instanceof Error?e.message:"Erro de conexão."); return; }
          if (!cancelled) timer=setTimeout(()=>void poll(),2000);
        };
        void poll();
      } catch(e) {if(!cancelled) setError(e instanceof Error?e.message:"Não foi possível gerar o código.");}
    };
    void run();
    return ()=>{cancelled=true;clearTimeout(timer);};
  }, [slug,generation]);
  useEffect(()=>{ const tick=()=>setSeconds(Math.max(0,Math.ceil((expiresAt-Date.now())/1000))); tick(); const id=setInterval(tick,1000);return ()=>clearInterval(id); },[expiresAt]);
  const remaining = `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`;
  return <div className="ott-inline-pair-scrim" role="presentation" onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
    <section className="ott-inline-pair" role="dialog" aria-modal="true" aria-label="Conectar minha conta Google">
      <button className="ott-inline-pair-close ott-standard-back" type="button" aria-label="Voltar" onClick={onClose}><Undo2 strokeWidth={2.5}/></button>
      <h2>Conectar minha conta</h2>
      <div className={`ott-inline-pair-qr${code ? "" : " ott-skeleton-qr-loading"}`}>{code ? <QRCodeSVG value={pairingPath(slug,code)} size={274} level="M" includeMargin/> : <span className="ott-skeleton-qr-bone" role="status" aria-label="Gerando QR code" />}</div>
      <p>Escaneie com seu celular e entre com Google.</p>
      <div className="ott-inline-pair-code-label">Código de pareamento</div>
      <strong className="ott-inline-pair-code">{code || "••••"}</strong>
      {code && !error && <small role="status">Aguardando login no celular · {remaining}</small>}
      {busy && <small role="status">Validando sua conta na TV...</small>}
      {error && <p className="ott-inline-pair-error" role="alert">{error}</p>}
      {(error || seconds === 0) && <button type="button" className="ott-inline-pair-retry" onClick={()=>setGeneration(n=>n+1)}><RefreshCw/> Gerar outro código</button>}
    </section>
  </div>;
}

export default function OttProfiles(p: Props) {
  // NEXO_V717_QR_GOOGLE_POSITIVA: validar pela emissora da rota, e nao pelo visitante Google.
  const nexoPairRouteSlug = (typeof window !== "undefined"
    ? window.location.pathname.match(/^\/([^/]+)\/player(?:\/|$)/i)?.[1] : null) || "";
  const nexoPairSlug = String(p.userSlug || nexoPairRouteSlug || "").trim().toLowerCase();
  const nexoPairStationId = p.radioUserId || (/^(positivafm|positiva)$/.test(nexoPairSlug)
    ? "452ebd1e-61a0-42dd-bf80-231a3f426c83" : null);

  const guestKey=`nexohub_tv_guest_preview:${nexoPairSlug || p.radioName || "radio"}`;
  const [guestDraft,setGuestDraft]=useState<{name:string;avatar:string}>(()=>{
    try {const value=JSON.parse(sessionStorage.getItem(guestKey)||"null");if(typeof value?.name==="string")return {name:value.name,avatar:value.avatar||"/avatars/usr-default.png"};}catch{}
    return {name:"Visitante",avatar:"/avatars/usr-default.png"};
  });
  const [entryReady,setEntryReady]=useState(false);
  const [mode,setMode]=useState<"select"|"edit"|"avatar"|"add"|"subedit"|"subavatar">(p.initialEdit && p.authenticated?"edit":"select");
  const [draft,setDraft]=useState<OttProfileData>(p.profile);
  const [error,setError]=useState("");
  const [saving,setSaving]=useState(false);
  const [newProfileName,setNewProfileName]=useState("");
  const [newProfileAvatar,setNewProfileAvatar]=useState("/avatars/usr-default.png");
  const [newProfileAvatarOpen,setNewProfileAvatarOpen]=useState(false);
  const [registrationOpen,setRegistrationOpen]=useState(false);
  const [pairOpen,setPairOpen]=useState(false);
  const [confirmLogout,setConfirmLogout]=useState(false);
  const [saveNotice,setSaveNotice]=useState("");
  // NEXO_V7_4_PROFILES: isolated secondary-profile draft, never edits primary Google account.
  const [selectedSub,setSelectedSub]=useState<SubProfile|null>(null);
  const [subDraftName,setSubDraftName]=useState("");
  const [subDraftAvatar,setSubDraftAvatar]=useState("/avatars/usr-default.png");
  const [confirmDeleteSub,setConfirmDeleteSub]=useState(false);
  const startSubEdit=(sp:SubProfile)=>{setError("");setSelectedSub(sp);setSubDraftName(sp.name);setSubDraftAvatar(sp.avatar_url);setMode("subedit");};
  const updateSub=async()=>{if(!selectedSub||!subDraftName.trim()||saving)return;setSaving(true);setError("");try{await p.onUpdateSub({...selectedSub,name:subDraftName.trim(),avatar_url:subDraftAvatar});setMode("select");setSelectedSub(null);}catch(e){setError(e instanceof Error?e.message:"Não foi possível atualizar o perfil.");}finally{setSaving(false);}};
  const deleteSub=async()=>{if(!selectedSub||saving)return;setSaving(true);setError("");try{await p.onDeleteSub(selectedSub);setConfirmDeleteSub(false);setMode("select");setSelectedSub(null);}catch(e){setConfirmDeleteSub(false);setError(e instanceof Error?e.message:"Não foi possível excluir o perfil.");}finally{setSaving(false);}};
  const displayName=p.authenticated?p.profile.nome||"Minha conta":guestDraft.name;
  const displayAvatar=p.authenticated?p.profile.avatar_url:guestDraft.avatar;
  const registrationFields = ["whatsapp","cpf","sexo","data_nascimento","estado","cidade","setor"] as const;
  const missingFields = registrationFields.filter(key => !String(p.profile[key] || "").trim());
  const registrationUrl = (() => {
    const origin = /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname)
      ? "https://housemix.nexobrasil.net" : window.location.origin;
    const slug = encodeURIComponent(nexoPairSlug || "");
    return `${origin}/${slug}/pair?mode=profile`;
  })();
  const openEdit=()=>{setDraft(p.authenticated?p.profile:{...p.profile,nome:guestDraft.name,avatar_url:guestDraft.avatar});setMode("edit");};
  const close=()=>{if(registrationOpen){setRegistrationOpen(false);void p.onRegistrationRefresh?.();return;}if(pairOpen){setPairOpen(false);return;}if(confirmLogout){setConfirmLogout(false);return;}if(confirmDeleteSub){setConfirmDeleteSub(false);return;}if(mode==="subavatar"){setMode("subedit");return;}if(mode==="avatar"){setMode("edit");return;}if(mode==="add" && newProfileAvatarOpen){setNewProfileAvatarOpen(false);return;}if(mode!=="select"){setMode("select");return;}p.onContinue();};
  useEffect(()=>{ if(mode!=="select"){setEntryReady(false);return;} let second=0;const first=requestAnimationFrame(()=>{second=requestAnimationFrame(()=>setEntryReady(true));});return()=>{cancelAnimationFrame(first);cancelAnimationFrame(second);};},[mode]);
  const root=useOttRemote(close,`${mode}:${pairOpen}:${registrationOpen}:${confirmLogout}:${confirmDeleteSub}`);
  const onSave=async()=>{setError("");setSaving(true);try{
    if(!draft.nome.trim())throw new Error("Informe o nome do perfil.");
    if(p.authenticated){if(!await p.onSave(draft))throw new Error("Não foi possível salvar o perfil.");}
    else {const next={name:draft.nome.trim(),avatar:draft.avatar_url};setGuestDraft(next);try{sessionStorage.setItem(guestKey,JSON.stringify(next));}catch{}}
    setMode("select");
  }catch(e){setError(e instanceof Error?e.message:"Erro ao salvar.");}finally{setSaving(false);}};
  const success=()=>{setPairOpen(false);if(p.onPairSuccess){p.onPairSuccess();return;}const url=new URL(window.location.href);url.pathname=`/${encodeURIComponent(nexoPairSlug)}/player`;url.search="?tv=1&step=profiles";window.location.replace(url.toString());};
  const createNewProfile=async()=>{if(!p.authenticated || saving || !newProfileName.trim())return;setError("");setSaving(true);try{const location=await p.onAdd(newProfileName.trim(),newProfileAvatar);setSaveNotice(location === "local" ? "Perfil criado nesta TV. Sincronização com a nuvem pendente." : "");setNewProfileName("");setNewProfileAvatar("/avatars/usr-default.png");setNewProfileAvatarOpen(false);setMode("select");}catch(e){setError(e instanceof Error?e.message:"Nao foi possivel criar o perfil.");}finally{setSaving(false);}};
  const now=p.nowPlaying;
  return <OttFrame root={root} className={`ott-profiles ott-profiles-refined ${mode==="edit"||mode==="subedit" ? "ott-profile-edit-page" : ""} ${!p.authenticated?"ott-guest-profiles":""}`} accent={p.accent}>
    <OttBackdrop image={p.background}/>
    <header className="ott-header"><OttClientBrand logo={p.logo} name={p.radioName}/>{mode==="select" && <h1 className="ott-profile-heading">Escolha seu perfil ou crie um novo perfil</h1>}</header>
    {mode==="select" ? <section className="ott-profile-select" data-entry-ready={entryReady} data-ott-scroll>
      <div className="ott-profile-row">
        <button className="ott-profile-entry ott-profile-main" data-ott-initial aria-label={`Continuar como ${displayName}`} onClick={p.onContinue}>
          <ProfileCircle avatar={displayAvatar} name={displayName}/>
        </button>
        <div className="ott-profile-meta"><b>{displayName}</b><div className="ott-profile-meta-actions">
          <small className="ott-profile-guest-badge">{p.authenticated?"Conta Google":"Visitante"}</small>
          <button type="button" className="ott-profile-edit-link" aria-label="Editar perfil" title="Editar perfil" onClick={openEdit}><Pencil aria-hidden="true"/></button>
        </div>
          {p.authenticated && <button className="ott-profile-meta-exit" type="button" onClick={()=>setConfirmLogout(true)} aria-label="Sair da conta Google"><LogOut aria-hidden="true"/>Sair</button>}
        </div>
      </div>
      {p.authenticated && <div className="ott-profile-add-row" data-ott-scroll>
        {p.profiles.map((sp,index)=><div className="ott-profile-row ott-profile-sub-row" style={{animationDelay:`${(index+1)*150}ms`}} key={sp.id}>
          <button type="button" className="ott-profile-entry ott-profile-main" aria-label={`Entrar no perfil ${sp.name}`} onClick={()=>p.onSwitch(sp)}><ProfileCircle avatar={sp.avatar_url} name={sp.name}/></button>
          <div className="ott-profile-meta"><b>{sp.name}</b><div className="ott-profile-meta-actions">
            <small className="ott-profile-guest-badge">Perfil</small>
            <button type="button" className="ott-profile-edit-link" aria-label={`Editar perfil ${sp.name}`} title={`Editar perfil ${sp.name}`} onClick={()=>startSubEdit(sp)}><Pencil aria-hidden="true"/></button>
          </div></div>
        </div>)}
        <div className="ott-profile-row ott-profile-sub-add-row" style={{animationDelay:`${(p.profiles.length+1)*150}ms`}}>
          <button type="button" className="ott-profile-add-button" aria-label="Criar novo perfil" onClick={()=>{setError("");setNewProfileName("");setNewProfileAvatar(p.avatars[0]||"/avatars/usr-default.png");setMode("add");}}><span className="ott-avatar ott-add"><Plus aria-hidden="true"/></span></button>
          <span className="ott-profile-new-label">Novo perfil</span>
        </div>
      </div>}
      {!p.authenticated && <button className="ott-profile-entry ott-subprofile ott-profile-connect" onClick={()=>setPairOpen(true)}><span className="ott-avatar ott-add"><GoogleWhiteIcon/></span><span>Conectar minha conta</span></button>}
    </section> : mode==="add" ? <section className="ott-profile-create" data-ott-scroll>
      <header><button type="button" className="ott-profile-create-back" aria-label="Voltar" onClick={close}><Undo2 aria-hidden="true"/></button><h2>Criar novo perfil</h2></header>
      <label>Nome do perfil<input data-ott-initial maxLength={60} placeholder="Digite o nome do perfil" value={newProfileName} onChange={e=>setNewProfileName(e.target.value)}/></label>
      <button type="button" className="ott-profile-avatar-picker" onClick={()=>setNewProfileAvatarOpen(v=>!v)} aria-expanded={newProfileAvatarOpen}><ProfileCircle avatar={newProfileAvatar} name="Avatar do novo perfil"/><span>Escolher avatar</span><ChevronRight aria-hidden="true"/></button>
      {newProfileAvatarOpen && <div className="ott-create-avatars" data-ott-scroll>{p.avatars.map((src,i)=><button type="button" key={`${src}-${i}`} aria-label={`Selecionar avatar ${i+1}`} onClick={()=>{setNewProfileAvatar(src);setNewProfileAvatarOpen(false);}}><ProfileCircle avatar={src} name={`Avatar ${i+1}`}/></button>)}</div>}
      {error && <p className="ott-error" role="alert">{error}</p>}
      <button type="button" className="ott-profile-create-save" disabled={saving || !newProfileName.trim()} onClick={()=>void createNewProfile()}>{saving?"Criando perfil...":"Criar perfil"}</button>
    </section> : mode==="subavatar" ? <section className="ott-avatar-grid" data-ott-scroll>
      {p.avatars.map((avatar,i)=><button type="button" data-ott-initial={i===0?"":undefined} key={`sub-${avatar}-${i}`} aria-label={`Escolher avatar ${i+1}`} onClick={()=>{setSubDraftAvatar(avatar);setMode("subedit");}}><ProfileCircle avatar={avatar} name={`Avatar ${i+1}`}/></button>)}
    </section> : mode==="subedit" ? <>
      <header className="ott-edit-header ott-profile-sub-edit-header"><button type="button" aria-label="Voltar" onClick={close}><Undo2/></button><div><h1>Editar perfil</h1><p>Personalize o nome e o avatar deste perfil.</p></div></header>
      <main className="ott-edit-main"><section className="ott-fields ott-profile-form" data-ott-scroll>
        <label className="ott-field ott-field-name"><UserRound/><span>Nome do perfil<input data-ott-initial maxLength={60} value={subDraftName} onChange={e=>setSubDraftName(e.target.value)}/></span></label>
        <button type="button" className="ott-field" onClick={()=>setMode("subavatar")}><UserRound/><b>Trocar avatar</b><ChevronRight/></button>
        {selectedSub && <ReminderList profile={selectedSub.id}/>}<div className="ott-edit-actions"><button type="button" className="ott-primary" disabled={saving||!subDraftName.trim()} onClick={()=>void updateSub()}>{saving?"Salvando...":"Salvar"}</button><button type="button" onClick={close}>Cancelar</button><button type="button" className="ott-subprofile-delete" disabled={saving} onClick={()=>setConfirmDeleteSub(true)}><Trash2 aria-hidden="true"/>Excluir perfil</button></div>
      </section><aside className="ott-avatar-preview"><ProfileCircle avatar={subDraftAvatar} name={subDraftName}/><h2>{subDraftName}</h2></aside></main>
      {error && <p className="ott-error" role="alert">{error}</p>}
    </> : mode==="avatar" ? <section className="ott-avatar-grid" data-ott-scroll>{p.avatars.map((avatar,i)=><button type="button" data-ott-initial={i===0?"":undefined} key={avatar} aria-label={`Escolher avatar ${i+1}`} onClick={()=>{setDraft(d=>({...d,avatar_url:avatar}));setMode("edit");}}><ProfileCircle avatar={avatar} name={`Avatar ${i+1}`}/></button>)}</section> : <>
      <header className="ott-edit-header"><button onClick={close} aria-label="Voltar"><Undo2/></button><div><h1>Editar perfil</h1><p>Personalize seu perfil e mantenha seu cadastro em dia.</p></div></header>
      <main className="ott-edit-main"><section className="ott-fields ott-profile-form" data-ott-scroll>
        <label className="ott-field ott-field-name"><UserRound/><span>Nome<input data-ott-initial maxLength={60} value={draft.nome} onChange={e=>setDraft(d=>({...d,nome:e.target.value}))}/></span></label>
        <button className="ott-field" onClick={()=>setMode("avatar")}><UserRound/><b>Trocar avatar</b><ChevronRight/></button>
        {p.authenticated && !p.presentationOnly && <button type="button" className="ott-field ott-profile-register-action" onClick={()=>setRegistrationOpen(true)}>
          <ClipboardCheck aria-hidden="true"/><span><b>Complete seu cadastro e pontue</b><small>{missingFields.length ? `${missingFields.length} campo(s) para revisar no celular` : "Cadastro preenchido · toque para editar"}</small></span><QrCode aria-hidden="true"/>
        </button>}
        <ReminderList profile="main"/><div className="ott-edit-actions"><button className="ott-primary" disabled={saving||!draft.nome.trim()} onClick={()=>void onSave()}>{saving?"Salvando...":"Salvar"}</button><button onClick={close}>Cancelar</button>{p.authenticated && <button type="button" className="ott-logout-inline" onClick={()=>setConfirmLogout(true)}>Sair da conta</button>}</div>
      </section><aside className="ott-avatar-preview"><ProfileCircle avatar={draft.avatar_url} name={draft.nome}/><h2>{draft.nome}</h2></aside></main>
      {error && <p className="ott-error" role="alert">{error}</p>}
    </>}
    {saveNotice && mode==="select" && <p className="ott-profile-save-notice" role="status">{saveNotice}</p>}
    {now && (now.titulo||now.artista) && <div className="ott-profiles-now"><OttArtwork sources={[now.capa]}/><div><small>tocando agora</small><strong>{now.titulo}</strong><span>{now.artista}</span></div></div>}
    {registrationOpen && p.authenticated && <div className="ott-inline-pair-scrim" role="presentation" onClick={event=>{if(event.target===event.currentTarget){setRegistrationOpen(false);void p.onRegistrationRefresh?.();}}}>
      <section className="ott-inline-pair ott-registration-qr-panel" role="dialog" aria-modal="true" aria-label="Complete seu cadastro pelo celular">
        <button className="ott-inline-pair-close ott-standard-back" type="button" aria-label="Voltar" onClick={()=>{setRegistrationOpen(false);void p.onRegistrationRefresh?.();}}><Undo2 strokeWidth={2.5}/></button>
        <h2>Complete seu cadastro e pontue</h2>
        <p>Escaneie com o celular em que você entrou com Google. Revise e complete seus dados.</p>
        <div className="ott-inline-pair-qr"><QRCodeSVG value={registrationUrl} size={274} level="M" includeMargin/></div>
        <small role="status">{missingFields.length ? `${missingFields.length} campos ainda não preenchidos.` : "Você pode atualizar os dados preenchidos."}</small>
        {/^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname) && <small role="status" className="ott-registration-publish-note">O formulário do celular ficará disponível após publicar esta atualização no site.</small>}
        <button type="button" className="ott-inline-pair-retry" onClick={()=>void p.onRegistrationRefresh?.()}><CheckCircle2 aria-hidden="true"/> Atualizar dados da TV</button>
      </section>
    </div>}
    {pairOpen && !p.authenticated && <PairInProfile slug={nexoPairSlug||""} onClose={()=>setPairOpen(false)} onSuccess={success}/>}
    {confirmDeleteSub && selectedSub && <div className="ott-modal-scrim"><section className="ott-dialog ott-subprofile-delete-dialog" role="dialog" aria-modal="true" aria-label="Confirmar exclusão do perfil"><h2>Excluir perfil?</h2><p>O perfil “{selectedSub.name}” será removido da sua lista. Esta ação não exclui a conta Google.</p><div className="ott-dialog-actions"><button type="button" className="ott-primary" data-ott-initial disabled={saving} onClick={()=>setConfirmDeleteSub(false)}>Cancelar</button><button type="button" className="ott-confirm-delete" disabled={saving} onClick={()=>void deleteSub()}>{saving?"Excluindo...":"Sim, excluir perfil"}</button></div></section></div>}
    {confirmLogout && <div className="ott-modal-scrim"><section className="ott-dialog" role="dialog" aria-modal="true" aria-label="Sair da conta"><h2>Sair da conta?</h2><p>Você poderá conectar sua conta novamente pelo QR code.</p><div><button className="ott-primary" onClick={()=>setConfirmLogout(false)}>Cancelar</button><button onClick={()=>void p.onLogout()}>Sair</button></div></section></div>}
  </OttFrame>;
}
