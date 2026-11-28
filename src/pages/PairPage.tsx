/* NEXO_PAIR_CHAT_MESCLADO_V6: pareamento completo TV + chat separado */
/* NEXO_PAIRING_MOBILE_V7 */
import TvProfilePhone from "@/components/player/tv/TvProfilePhone";
import PairOfficialChat from "@/components/player/tv/PairOfficialChat";
import { playerSupabase } from "@/integrations/supabase/playerClient";

import { resolveEffectiveOnAir } from "@/lib/onAirResolver";
import { resolvePresenterForProgram } from "@/lib/onAirPresenterResolver";
/* NEXO_PAIRING_MOBILE_V11 */
/* NEXO_PAIRING_MOBILE_V12 */
/* NEXO_PAIRING_MOBILE_V13 */
/* NEXO_PAIRING_MOBILE_V14 */
/* NEXO_PAIRING_MOBILE_V15 */
/* NEXO_PAIRING_MOBILE_V16 */
import PairRegistration, { emptyRegistration, registrationComplete, type RegistrationField } from "@/components/player/tv/PairRegistration";
import OttCommercialSlot from "@/components/player/tv/OttCommercialSlot";
import { getGoogleProfileFallback } from "@/lib/playerListenerProfile";
import { isRadioId } from "@/lib/playerRadioChatScope";
import { Star, MessageCircle, Users } from "lucide-react";
import { PairFriends, PairMyRadio } from "@/components/player/tv/PairSocialVisual";
import type { CSSProperties } from "react";
import "./PairPage30.css";
import TvChatPhone from "@/components/player/tv/TvChatPhone";
import { useParams as useNexoChatSlug, useSearchParams as useNexoChatQuery } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { usePlayerAuth } from "@/hooks/usePlayerAuth";
import { Loader2 } from "lucide-react";

/**
 * Página mobile de pareamento com a TV. O usuário lê o QR code, faz login com
 * Google, digita/valida o código de 4 dígitos e confirma o pareamento.
 */
type PairBrand = {color:string;logo:string;name:string};
// A identidade vem exclusivamente da resposta pública da própria emissora.
function readPairBrand(data:any):PairBrand|null {
  if(!data||data.error||!isRadioId(data.userId)||!data.empresa)return null;
  if(data.empresa.user_id && String(data.empresa.user_id).toLowerCase()!==String(data.userId).toLowerCase())return null;
  const color=typeof data.playerColors?.dominantColor==="string"?data.playerColors.dominantColor.trim():"";
  const name=typeof data.empresa.nome==="string"?data.empresa.nome.trim():"";
  const logo=[data.empresa.logo,data.empresa.logo_url].find(value=>typeof value==="string"&&/^(https?:\/\/|\/(?!\/)|data:image\/)/i.test(value.trim()));
  if(!/^#[0-9a-f]{6}$/i.test(color)||!name||typeof logo!=="string")return null;
  return {color,logo:logo.trim(),name};
}
function preloadPairLogo(url:string):Promise<void>{
  return new Promise((resolve,reject)=>{
    const image=new Image();
    const timer=window.setTimeout(()=>finish(false),12000);
    function finish(ok:boolean){window.clearTimeout(timer);image.onload=null;image.onerror=null;ok?resolve():reject(new Error("Logo indisponível"));}
    image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=url;
  });
}
function PairPage() {
  const { userSlug: rawSlug } = useParams();
  const userSlug = (rawSlug || "").toLowerCase();
  const [sp, setSp] = useSearchParams();
  const previewAllowed = import.meta.env.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname);
  const requestedPreview = sp.get("preview");
  const preview = previewAllowed && (requestedPreview === "login" || requestedPreview === "code" || requestedPreview === "success") ? requestedPreview : null;
  const previewStep = (step: "login" | "code" | "success") => {
    const next = new URLSearchParams(sp);
    next.set("preview", step);
    // Keep the example/QR code while moving through the preview.
    setSp(next);
  };
  const rawPairCode = sp.get("pairCode") || sp.get("code") || "";
  const initialCode = /^\d{4}$/.test(rawPairCode) ? rawPairCode : preview ? "1234" : "";

  const { user, loading } = usePlayerAuth();

  const [code, setCode] = useState<string>(initialCode);
  useEffect(() => { if (/^\d{4}$/.test(initialCode)) setCode(initialCode); }, [initialCode]);
  const [signingIn, setSigningIn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const completedAsGuest = false;
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error" | "expired"; message?: string }>({ kind: "idle" });

  const [stationRecord,setStationRecord]=useState<{slug:string;data:any;brand:PairBrand}|null>(null);
  const [brandFailure,setBrandFailure]=useState(false);
  const [brandRetry,setBrandRetry]=useState(0);
  const station=stationRecord?.slug===userSlug?stationRecord.data:null;
  const brand=stationRecord?.slug===userSlug?stationRecord.brand:null;
  const onBrandImageError=()=>{setStationRecord(null);setBrandFailure(true);};
  const [clock, setClock] = useState(() => new Date());
  // Nenhuma fonte de pontuação real está disponível no schema atual.
  const [points,setPoints]=useState<number|null>(null);
  useEffect(()=>{let active=true;setPoints(null);if(!user?.id||user.is_anonymous||!isRadioId(station?.userId))return;const refresh=async()=>{if(document.hidden)return;try{const {data,error}=await (playerSupabase as any).rpc("nexo_listener_points_total",{p_radio:station.userId});if(active&&!error&&data!=null&&Number.isFinite(Number(data)))setPoints(Number(data));}catch{/* keep last confirmed total */}};void refresh();const timer=window.setInterval(refresh,60000);return()=>{active=false;window.clearInterval(timer);};},[user?.id,user?.is_anonymous,station?.userId]);
  const [panel, setPanel] = useState<"profile" | "chat" | "friends" | null>(null);
  const [panelLeaving,setPanelLeaving]=useState(false);
  const openPanel=(next:"profile"|"chat"|"friends")=>{setPanelLeaving(false);setPanel(next);};
  const closePanel=()=>setPanelLeaving(true);
  useEffect(()=>{if(!panelLeaving)return;const timer=window.setTimeout(()=>{setPanel(null);setPanelLeaving(false);},window.matchMedia("(prefers-reduced-motion: reduce)").matches?0:230);return()=>window.clearTimeout(timer);},[panelLeaving]);
  useEffect(()=>{if(!panel)return;const handler=(event:KeyboardEvent)=>{if(event.key==="Escape")setPanelLeaving(true);};document.addEventListener("keydown",handler);return()=>document.removeEventListener("keydown",handler);},[panel]);
  const [friendsCount,setFriendsCount]=useState(0);
  useEffect(() => {
    let active=true, busy=false, confirmed=false;
    let confirmedLogo="", confirmedOwner="";
    let retryTimer:number|undefined;
    setBrandFailure(false);
    const load=async()=>{
      if(!active||busy||!userSlug)return;
      busy=true;
      try {
        const {data,error}=await playerSupabase.functions.invoke("public-player-data",{body:{slug:userSlug}});
        if(!active)return;
        const nextBrand=readPairBrand(data);
        if(error||!nextBrand)throw new Error("Identidade da emissora indisponível");
        if(confirmedOwner&&confirmedOwner!==data.userId)throw new Error("Identidade da emissora mudou");
        if(confirmedLogo!==nextBrand.logo)await preloadPairLogo(nextBrand.logo);
        if(!active)return;
        confirmed=true;confirmedLogo=nextBrand.logo;confirmedOwner=data.userId;
        setStationRecord({slug:userSlug,data,brand:nextBrand});setBrandFailure(false);
      }catch{
        if(active&&!confirmed)setBrandFailure(true);
      }finally{busy=false;}
    };
    if(userSlug){void load();retryTimer=window.setTimeout(()=>{if(!confirmed)void load();},5000);}
    else setBrandFailure(true);
    const timer=window.setInterval(()=>{if(!document.hidden){setClock(new Date());void load();}},60000);
    return()=>{active=false;window.clearInterval(timer);if(retryTimer!==undefined)window.clearTimeout(retryTimer);};
  }, [userSlug,brandRetry]);
  // Evita chamadas periódicas a tv-profile-registration (serviço ausente).
  // O saldo real será conectado quando houver uma fonte oficial de pontuação.
  useEffect(() => {
    if (preview || !user?.id || user.is_anonymous || !userSlug) return;
    try { const stored = sessionStorage.getItem(`nexo-pair-ok:${userSlug}:${user.id}`); if (stored && (!initialCode || stored === initialCode)) setStatus(prev => prev.kind === "idle" ? {kind:"ok"} : prev); } catch { /* storage unavailable */ }
  }, [preview, user?.id, user?.is_anonymous, userSlug, initialCode]);

  const canConfirm = useMemo(() => /^\d{4}$/.test(code), [code]);

  const handleGoogleLogin = async () => {
    if (preview) { previewStep("code"); return; }
    setSigningIn(true);
    try {
      const returnUrl = new URL(`/${encodeURIComponent(userSlug)}/pair`, window.location.origin);
      if (code) returnUrl.searchParams.set("pairCode", code);
      if(sp.get("resume")==="1")returnUrl.searchParams.set("resume","1");
      if (window.houseMixDesktop?.openExternal) {
        const opened = await window.houseMixDesktop.openExternal(returnUrl.href);
        if (opened === false) throw new Error("Abra esta pagina no Chrome para entrar com Google.");
        setSigningIn(false);
        return;
      }
      if (/Electron|; wv\)|NexoPreview/i.test(navigator.userAgent) || window.self !== window.top) {
        throw new Error("Abra o endereco desta pagina no Chrome ou no navegador do celular para entrar com Google.");
      }
      const { data, error } = await playerSupabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: returnUrl.href, queryParams: { prompt: "select_account" } },
      });
      if (error) {
        setStatus({ kind: "error", message: error.message });
        setSigningIn(false);
        return;
      }
      if (data?.url) return;
      setSigningIn(false);
    } catch (e: any) {
      setStatus({ kind: "error", message: String(e?.message || e) });
      setSigningIn(false);
    }
  };

  const handleConfirm = async () => {
    if (preview) { if (canConfirm) previewStep("success"); return; }
    if (!canConfirm || !user || user.is_anonymous || confirming) return;
    setConfirming(true);
    setStatus({ kind: "idle" });
    try {
      const { data, error } = await playerSupabase.functions.invoke("tv-pair-claim", { body: { code } });
      if (error || !(data as any)?.ok) {
        const reason = (data as any)?.reason;
        if (reason === "code_expired") {
          setStatus({ kind: "expired", message: "O código exibido na TV expirou. Toque em \"Gerar novo código\" na TV e digite os novos 4 dígitos aqui." });
          setConfirming(false);
          return;
        }
        const map: Record<string, string> = {
          invalid_code: "Código inválido. Confira os 4 dígitos exibidos na TV.",
          code_not_found: "Código não encontrado. Gere um novo na TV.",
          code_already_used: "Este código já foi usado em outro dispositivo.",
          not_authenticated: "Faça login com o Google para continuar.",
        };
        setStatus({ kind: "error", message: map[reason] || "Não foi possível parear. Verifique sua conexão e tente novamente." });
        setConfirming(false);
        return;
      }
      try { sessionStorage.setItem(`nexo-pair-ok:${userSlug}:${user.id}`, code); } catch { /* optional */ }
      setStatus({ kind: "ok", message: "TV pareada com sucesso!" });
    } catch (e: any) {
      setStatus({ kind: "error", message: String(e?.message || e) });
    } finally {
      setConfirming(false);
    }
  };

  // Registra evento "scanned" quando a página é aberta com um código (via QR code).
  useEffect(() => {
    if (preview || !initialCode || !userSlug) return;
    playerSupabase.functions.invoke("tv-pair-track", {
      body: { event: "scanned", code: initialCode, userSlug, meta: { referrer: document.referrer || null } },
    }).catch(() => { /* fire-and-forget */ });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const done = preview ? preview === "success" : (status.kind === "ok" || sp.get("resume")==="1"&&!initialCode) && !!user && !user.is_anonymous;
  const [previewRegistration,setPreviewRegistration]=useState({...emptyRegistration,nome:"Ouvinte de teste",email:"ouvinte@example.com"});
  const [previewEarned,setPreviewEarned]=useState<RegistrationField[]>([]);
  const visiblePoints: number | null = preview ? 150 + previewEarned.length*10 : points;
  const showLogin = preview ? preview === "login" : (!user || user.is_anonymous) && !done;
  const displayName = completedAsGuest ? "Visitante" : String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || (preview ? "Ouvinte de teste" : "Ouvinte"));
  const googleAvatar = getGoogleProfileFallback(user).avatar_url;
  const avatarScope = preview ? "preview:"+userSlug : user?.id && isRadioId(station?.userId) ? user.id+":"+station.userId : "";
  const [chosenAvatar,setChosenAvatar]=useState<{scope:string;url:string}|null>(null);
  const avatar=chosenAvatar?.scope===avatarScope ? chosenAvatar.url : googleAvatar;
  useEffect(()=>{
    if(preview||!user?.id||user.is_anonymous||!isRadioId(station?.userId))return;
    let active=true;const scope=avatarScope;
    void (async()=>{try{const {data,error}=await playerSupabase.from("player_listener_profiles").select("avatar_url").eq("auth_user_id",user.id).eq("radio_user_id",station.userId).maybeSingle();if(active&&!error&&data?.avatar_url)setChosenAvatar(prev=>prev?.scope===scope?prev:{scope,url:data.avatar_url});}catch{/* preserve Google fallback */}})();
    return()=>{active=false;};
  },[preview,user?.id,user?.is_anonymous,station?.userId,avatarScope]);
  const changeAvatar=async(url:string)=>{
    if(url!==googleAvatar&&!/^\/avatars\/usr-(?:default|[1-8])\.png$/.test(url))throw new Error("Avatar inválido.");
    if(!preview){
      if(!user?.id||user.is_anonymous||!isRadioId(station?.userId))throw new Error("Identificação indisponível.");
      const {data:auth,error:authError}=await playerSupabase.auth.getUser();
      if(authError||auth.user?.id!==user.id)throw new Error("Sessão expirada.");
      const {error}=await playerSupabase.from("player_listener_profiles").upsert({auth_user_id:user.id,radio_user_id:station.userId,avatar_url:url,updated_at:new Date().toISOString()},{onConflict:"auth_user_id,radio_user_id"});
      if(error)throw error;
    }
    setChosenAvatar({scope:avatarScope,url});
  };

  const color=brand?.color||"";
  const logo=brand?.logo||"";
  const radioName=brand?.name||"";
  const { current } = resolveEffectiveOnAir((Array.isArray(station?.programas) ? station.programas : []).filter((p:any)=>p.ativo!==false && typeof p.horario_inicio==="string" && typeof p.horario_fim==="string"), clock, station?.empresa?.timezone || "America/Sao_Paulo");
  const presenter = current ? resolvePresenterForProgram(current, station?.apresentadores || [], userSlug) : null;
  const photos = useMemo(() => {
    if (!current) return [];
    const ids = [...new Set([current.apresentador_id, ...(Array.isArray(current.apresentadores_ids) ? current.apresentadores_ids : [])].filter(Boolean))];
    const resolved = ids.length ? ids.map(id => resolvePresenterForProgram({...current, apresentador_id:id}, station?.apresentadores || [], userSlug)) : [presenter];
    return [...new Set(resolved.map(p=>p?.foto).filter((p): p is string=>!!p))];
  }, [current, station, userSlug, presenter]);
  const photoKey = JSON.stringify(photos);
  const [photoIndex,setPhotoIndex] = useState(0);
  useEffect(()=>{
    setPhotoIndex(0);
    if (!done) return;
    const urls: string[] = JSON.parse(photoKey);
    urls.forEach(url=>{const image=new Image();image.src=url;});
    if(urls.length<2) return;
    const timer=window.setInterval(()=>setPhotoIndex(i=>(i+1)%urls.length),4000);
    return ()=>window.clearInterval(timer);
  },[photoKey,done]);
  // Todos os hooks acima permanecem montados; nenhuma tela do Pairing usa marca provisória.
  if(!brand)return <main className="pair16-brand-wait" aria-busy={!brandFailure}><div role={brandFailure?"alert":"status"}>{brandFailure?<><p>Não foi possível carregar a identidade da emissora.</p><button type="button" onClick={()=>{setBrandFailure(false);setBrandRetry(value=>value+1);}}>Tentar novamente</button></>:<><Loader2 className="pair16-brand-spinner" aria-hidden="true"/><p>Carregando emissora…</p></>}</div></main>;
  return <main className="pair30" data-pair-station={userSlug === "interativafm" ? "interativafm" : undefined} style={{"--pair-color":color} as CSSProperties}>
    <section className={"pair30-screen pair7-screen"+(done?" pair12-success":"")} style={{width:"min(100%, 420px)", maxWidth:"420px", minWidth:0, boxSizing:"border-box", paddingInline:"20px", marginInline:"auto"}} key={done ? "done" : showLogin ? "login" : "code"}>
      <style>{`.pair30 #tv-pair-code, .pair30 #tv-pair-code:focus, .pair30 #tv-pair-code:focus-visible { border: 0 !important; outline: none !important; box-shadow: none !important; background: transparent !important; }
.pair30 .pair30-success-sequence {position:relative; width:100%; min-width:0; flex:1; display:flex; flex-direction:column; justify-content:flex-end;}
.pair30 .pair30-success-message {position:absolute; inset:0; display:flex; align-items:center; justify-content:center; text-align:center; margin:0; pointer-events:none; animation:pair4-message 2.7s both;}
@keyframes pair4-message {0%{opacity:0;transform:translateY(10px)} 13%{opacity:1;transform:translateY(0)} 87%{opacity:1;transform:translateY(0)} 100%{opacity:0;transform:translateY(-10px);visibility:hidden}}
.pair30 .pair30-success-live {width:100%; animation:pair4-live .45s 2.7s both;}
@keyframes pair4-live {from{opacity:0;visibility:hidden;transform:translateY(12px)}to{opacity:1;visibility:visible;transform:translateY(0)}}
.pair30 .pair30-success-live .pair30-presenter {left:50% !important;right:auto !important;transform:translateX(-50%) !important;object-position:center bottom;mask-image:linear-gradient(to bottom,#000 0%,#000 68%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 68%,transparent 100%);}
.pair30 .pair30-success-live .pair30-onair {width:100%;left:0;right:0;text-align:center;align-items:center;display:flex;flex-direction:column;justify-content:center;position:relative;z-index:1;}
.pair30 .pair30-success-live .pair30-actions {position:relative;z-index:2;}
.pair30 .pair5-portraits{position:absolute;left:0;right:0;bottom:100px;height:clamp(220px,44vh,410px);pointer-events:none;z-index:0;}
.pair30 .pair5-portraits img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:center bottom;opacity:0;transition:opacity .4s ease;mask-image:linear-gradient(to bottom,#000 0%,#000 70%,transparent 100%);-webkit-mask-image:linear-gradient(to bottom,#000 0%,#000 70%,transparent 100%);}
.pair30 .pair5-portraits img.active{opacity:1;}
.pair30 .pair6-avatar-wrap{position:relative;display:inline-flex;flex-shrink:0;align-items:center;justify-content:center;align-self:center;}
.pair30 .pair6-points{position:absolute;top:-7px;left:calc(100% - 12px);z-index:3;display:flex;align-items:center;gap:5px;padding:5px 9px;background:var(--pair-color);color:#fff;border-radius:999px;font-size:11px;font-weight:800;line-height:1.2;white-space:nowrap;font-variant-numeric:tabular-nums;}
.pair30 .pair6-points-value{display:inline-block;animation:pair6-score .25s ease-out both;}
@keyframes pair6-score{from{opacity:.55;transform:translateY(3px)}to{opacity:1;transform:translateY(0)}}
@media(max-width:340px){.pair30 .pair6-points{left:auto;right:-25px;top:-12px;}}
@media(prefers-reduced-motion:reduce){.pair30 .pair6-points-value{animation:none;}}
.pair30 .pair5-overlay{position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:15px;box-sizing:border-box;animation:pair5-in .2s ease both;}
.pair30 .pair5-modal{width:min(100%,460px);max-height:100%;overflow:auto;overscroll-behavior:contain;background:#fff;color:#202124;border-radius:22px;padding:20px;box-sizing:border-box;position:relative;text-align:left;animation:pair5-up .25s ease both;}
.pair30 .pair5-modal[data-kind="profile"]{max-height:100%;height:100%;}
.pair30 .pair5-modal h2{margin:0 34px 16px 0;font-size:22px;font-weight:800;line-height:1.2;color:#161616;}
.pair30 .pair5-modal button{cursor:pointer;}
.pair30 .pair5-close{position:sticky;top:0;float:right;z-index:3;background:#f0f1f3;color:#222;width:34px;height:34px;border:0;border-radius:50%;font-size:22px;display:grid;place-items:center;}
.pair30 .pair5-modal input,.pair30 .pair5-modal select,.pair30 .pair5-modal textarea{color:#222!important;background:#f0f1f3!important;border:0!important;box-shadow:none!important;min-width:0;}
.pair30 .pair5-modal input:focus-visible,.pair30 .pair5-modal textarea:focus-visible,.pair30 .pair5-modal select:focus-visible{outline:2px solid var(--pair-color);outline-offset:2px;}
.pair30 .pair5-modal main{min-height:0!important;background:white!important;color:#222!important;padding:0!important;}
.pair30 .pair5-modal main label,.pair30 .pair5-modal main p,.pair30 .pair5-modal main small{color:#444!important;}
@keyframes pair5-in{from{opacity:0}to{opacity:1}} @keyframes pair5-up{from{transform:translateY(12px)}to{transform:translateY(0)}}
@media(prefers-reduced-motion:reduce){.pair30 .pair30-success-message{animation-duration:2.7s;}.pair30 .pair30-success-live{animation-duration:0.01s;}}
`}</style>
      {(showLogin || (loading && !preview)) && <div className="pair7-login-brand">{logo && <img src={logo} alt={radioName} onError={onBrandImageError}/>}</div>}
      {loading && !preview ? <div className="pair30-center" role="status"><Loader2 className="animate-spin"/> Carregando…</div> : showLogin ? <>
        <h1 className="pair7-login-title">Faça login com sua conta Google</h1>
        <div className="pair30-center"><button className="pair30-google" aria-label="Faça login com Google" disabled={signingIn} onClick={handleGoogleLogin}>{signingIn ? <Loader2 className="animate-spin"/> : <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.76 7.18l7.73 6C44.43 38.02 46.98 31.9 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 010-9.18l-7.98-6.19A24 24 0 000 24c0 3.87.93 7.53 2.56 10.78z"/><path fill="#34A853" d="M24 48c6.48 0 11.94-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>}</button></div>
      </> : <>
        <div className="pair7-header"><div className="pair30-avatar">{avatar ? <img src={String(avatar)} alt=""/> : <span>{displayName.charAt(0).toUpperCase()}</span>}</div><div className="pair7-person"><strong>olá,</strong><h1>{displayName}</h1><div className="pair6-points" role="status" title={preview ? "Pontuação fictícia para prévia" : visiblePoints === null ? "Pontuação ainda indisponível" : "Pontuação do ouvinte"}><span aria-hidden="true">★</span><span className="pair6-points-value">{visiblePoints === null ? "—" : visiblePoints.toLocaleString("pt-BR")} pts</span></div></div>{logo && <img className="pair7-brand" src={logo} alt={radioName} onError={onBrandImageError}/>}</div>
        {done ? <><div className="pair30-success-sequence"><h2 className="pair30-success-message" aria-label={"Tudo certo! Aproveite essa experiência com a " + radioName + "!"}><span className="pair7-first" aria-hidden="true">Tudo certo!</span><span className="pair7-phrase" aria-hidden="true">{["Aproveite","essa","experiência","com","a"].map((word,index)=><span key={index} className="pair7-word" style={{"--word-delay": (0.50+index*0.10)+"s"} as CSSProperties}>{word}</span>)}<span className="pair7-radio">{radioName}!</span></span></h2><div className="pair30-live pair30-success-live"><div className="pair12-stage"><div className="pair5-portraits" aria-hidden="true">{photos.map((url,i)=><img key={url} className={i===photoIndex%photos.length?"active":""} src={url} alt=""/>)}</div>{current && <div className="pair30-onair"><b>no ar</b><strong>{current.nome}</strong><small>{current.horario_inicio.slice(0,5)} - {current.horario_fim.slice(0,5)}</small>{(presenter?.nome || current.apresentador_nome) && <small>{presenter?.nome || current.apresentador_nome}</small>}</div>}<div className="pair12-panel" data-kind={panel||"closed"} data-leaving={panelLeaving?"true":"false"} hidden={!panel} role="region" aria-label={panel==="profile"?"Minha "+radioName:panel==="chat"?"Chat oficial da rádio":"Friends"}><button className="pair12-close" type="button" aria-label="Fechar painel" onClick={closePanel}>×</button><div className="pair12-panel-body">
 {panel==="profile"&&<PairMyRadio radioName={radioName} displayName={displayName} avatar={avatar?String(avatar):undefined} googleAvatar={googleAvatar} onAvatarChange={changeAvatar} points={visiblePoints} preview={!!preview} registrationComplete={!!preview&&registrationComplete(previewRegistration)}><PairRegistration preview={!!preview} radioId={station?.userId} displayName={displayName} draft={previewRegistration} onDraft={setPreviewRegistration} earned={previewEarned} onEarn={key=>setPreviewEarned(prev=>prev.includes(key)?prev:[...prev,key])}/></PairMyRadio>}
 {panel==="chat"&&<><div className="pair13-chat-ad"><OttCommercialSlot radioId={station?.userId} placement="chat_ads" programId={current?.id}/></div><PairOfficialChat radioId={station?.userId || ""} preview={!!preview} displayName={displayName}/></>}
 <div className="pair12-friends-slot" hidden={panel!=="friends"}><PairFriends open={panel==="friends"} preview={!!preview} onClose={closePanel} onCount={setFriendsCount} presenters={Array.isArray(station?.apresentadores)?station.apresentadores:[]}/></div>
 </div></div></div><div className="pair30-actions"><button disabled={completedAsGuest} onClick={()=>openPanel("profile")}><Star/><span>Minha {radioName}</span></button><button disabled={!preview && !station?.userId} onClick={()=>openPanel("chat")}><MessageCircle/><span>Chat</span></button><button type="button" onClick={()=>openPanel("friends")} aria-label={friendsCount?`Friends, ${friendsCount} notificações`:"Friends"}><Users/><span>Friends</span>{friendsCount>0&&<b className="pair11-action-count">{friendsCount}</b>}</button></div></div></div></> : <div className="pair30-code-area" style={{width:"100%", minWidth:0, maxWidth:"100%", boxSizing:"border-box"}}><p>confirme o código da sua tv<br/>e aguarde o pareamento</p><label className="pair30-code" style={{width:"100%", maxWidth:"320px", minWidth:0, boxSizing:"border-box", marginInline:"auto"}} htmlFor="tv-pair-code"><span>código da sua tv</span><input style={{width:"100%", maxWidth:"100%", minWidth:0, boxSizing:"border-box", border:0, outline:"none", boxShadow:"none", background:"transparent", fontSize:"clamp(36px, 12vw, 64px)", letterSpacing:"0.08em", textAlign:"center"}} id="tv-pair-code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} placeholder="0000" onChange={e=>{setCode(e.target.value.replace(/\D/g,"").slice(0,4));setStatus({kind:"idle"})}}/></label><button className="pair30-confirm" disabled={!canConfirm || confirming} onClick={handleConfirm}>{confirming ? "Pareando…" : "Confirmar pareamento"}</button></div>}
      </>}
      {!preview && (status.kind === "error" || status.kind === "expired") && <p className="pair30-error" role="alert">{status.message}</p>}
      <footer className="pair7-footer">essa é uma experiência Nexo</footer>
      
    </section>
  </main>;

}

export default function NexoPairPageRoute() {
  const { userSlug: rawSlug } = useNexoChatSlug();
  const [chatQuery] = useNexoChatQuery();
  if (chatQuery.get("mode") === "profile") return <TvProfilePhone userSlug={(rawSlug || "").toLowerCase()}/>;
  if (chatQuery.get("mode") === "chat") {
    return <TvChatPhone userSlug={(rawSlug || "").toLowerCase()} />;
  }
  return <PairPage key={(rawSlug||"").toLowerCase()} />;
}


