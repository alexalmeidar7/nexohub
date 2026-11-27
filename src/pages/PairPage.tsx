/* NEXO_PAIR_CHAT_MESCLADO_V6: pareamento completo TV + chat separado */
import TvProfilePhone from "@/components/player/tv/TvProfilePhone";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { getStationLogoFallback } from "@/lib/playerBranding";
import { resolveEffectiveOnAir } from "@/lib/onAirResolver";
import { resolvePresenterForProgram } from "@/lib/onAirPresenterResolver";
import { ClipboardPen, Keyboard, Gamepad2 } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
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
    next.delete("pairCode"); next.delete("code");
    setSp(next);
  };
  const rawPairCode = sp.get("pairCode") || sp.get("code") || "";
  const initialCode = /^\d{4}$/.test(rawPairCode) ? rawPairCode : "";

  const { user, loading } = usePlayerAuth();

  const [code, setCode] = useState<string>(initialCode);
  const [signingIn, setSigningIn] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const completedAsGuest = false;
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "error" | "expired"; message?: string }>({ kind: "idle" });

  const [station, setStation] = useState<any>(null);
  const [clock, setClock] = useState(() => new Date());
  const [points, setPoints] = useState<number | null>(null);
  const [panel, setPanel] = useState<"profile" | "chat" | "remote" | null>(null);
  useEffect(() => {
    let active = true;
    setStation(null);
    const load = async () => {
      try { const {data,error} = await playerSupabase.functions.invoke("public-player-data", {body:{slug:userSlug}}); if(active && !error && data && !data.error) setStation(data); } catch { /* retain last confirmed data */ }
    };
    if (userSlug) void load();
    const timer = window.setInterval(() => { if (!document.hidden) { setClock(new Date()); void load(); } }, 60000);
    return () => { active=false; clearInterval(timer); };
  }, [userSlug]);
  useEffect(() => {
    let active = true;
    let pending = false;
    setPoints(null);
    if (preview || !user?.id || !userSlug || status.kind !== "ok") return;
    const refresh = async () => {
      if (!active || pending || document.hidden) return;
      pending = true;
      try {
        const {data,error} = await playerSupabase.functions.invoke("tv-profile-registration", {body:{action:"get",userSlug}});
        const score = data?.profile?.pontuacao ?? data?.total ?? data?.pontuacao;
        if (active && !error && data?.ok && typeof score === "number" && Number.isFinite(score) && score >= 0) setPoints(score);
      } catch { /* preserve last confirmed balance */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    const onVisible = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [user?.id, userSlug, preview, status.kind]);

  const canConfirm = useMemo(() => /^\d{4}$/.test(code), [code]);

  const handleGoogleLogin = async () => {
    if (preview) { previewStep("code"); return; }
    setSigningIn(true);
    try {
      const returnUrl = new URL(`/${encodeURIComponent(userSlug)}/pair`, window.location.origin);
      if (code) returnUrl.searchParams.set("pairCode", code);
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
    if (!canConfirm || !user || confirming) return;
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
      setStatus({ kind: "ok", message: "TV pareada com sucesso! Você já pode fechar esta página — a TV entrará no player em instantes." });
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

  const done = preview ? preview === "success" : status.kind === "ok";
  const visiblePoints = preview === "success" ? 150 : points;
  const showLogin = preview ? preview === "login" : !user && !done;
  const displayName = completedAsGuest ? "Visitante" : String(user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0] || (preview ? "Ouvinte de teste" : "Ouvinte"));
  const avatar = !completedAsGuest && (user?.user_metadata?.avatar_url || user?.user_metadata?.picture);

  const candidate = station?.playerColors?.dominantColor || station?.playerColors?.homeAccent;
  const color = typeof candidate === "string" && /^#[0-9a-f]{6}$/i.test(candidate) ? candidate : (userSlug.startsWith("interativa") ? "#555555" : "#f20d0f");
  const logo = station?.empresa?.logo || station?.empresa?.logo_url || getStationLogoFallback(userSlug);
  const radioName = station?.empresa?.nome || (userSlug.startsWith("positiva") ? "Positiva FM" : userSlug.startsWith("interativa") ? "Interativa FM" : userSlug);
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
  return <main className="pair30" style={{"--pair-color":color} as CSSProperties}>
    <section className="pair30-screen" style={{width:"min(100%, 420px)", maxWidth:"420px", minWidth:0, boxSizing:"border-box", paddingInline:"20px", marginInline:"auto"}} key={done ? "done" : showLogin ? "login" : "code"}>
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
      <header>essa é uma experiência Nexo</header>
      {loading && !preview ? <div className="pair30-center" role="status"><Loader2 className="animate-spin"/> Carregando…</div> : showLogin ? <>
        <h1>Faça login com sua conta Google</h1>
        <div className="pair30-center"><button className="pair30-google" aria-label="Faça login com Google" disabled={signingIn} onClick={handleGoogleLogin}>{signingIn ? <Loader2 className="animate-spin"/> : <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.25 5.48-4.76 7.18l7.73 6C44.43 38.02 46.98 31.9 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 010-9.18l-7.98-6.19A24 24 0 000 24c0 3.87.93 7.53 2.56 10.78z"/><path fill="#34A853" d="M24 48c6.48 0 11.94-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>}</button></div>
      </> : <>
        <div className="pair30-identity"><div className="pair6-avatar-wrap"><div className="pair30-avatar">{avatar ? <img src={String(avatar)} alt=""/> : <span>{displayName.charAt(0).toUpperCase()}</span>}</div>{done && <div className="pair6-points" role="status" aria-live="polite" title={preview ? "Pontuação fictícia para prévia" : "Pontuação do ouvinte"}><span aria-hidden="true">★</span><span key={visiblePoints ?? "unavailable"} className="pair6-points-value">{visiblePoints === null ? "—" : visiblePoints.toLocaleString("pt-BR")} pts</span></div>}</div><strong>olá,</strong><h1 style={{maxWidth:"100%", overflowWrap:"anywhere"}}>{displayName}</h1></div>
        {done ? <><div className="pair30-success-sequence"><h2 className="pair30-success-message">Tudo certo! Aproveite essa experiência com a {radioName}!</h2><div className="pair30-live pair30-success-live"><div className="pair5-portraits" aria-hidden="true">{photos.map((url,i)=><img key={url} className={i===photoIndex%photos.length?"active":""} src={url} alt=""/>)}</div>{current && <div className="pair30-onair"><b>no ar</b><strong>{current.nome}</strong><small>{current.horario_inicio.slice(0,5)} - {current.horario_fim.slice(0,5)}</small>{(presenter?.nome || current.apresentador_nome) && <small>{presenter?.nome || current.apresentador_nome}</small>}</div>}<div className="pair30-actions"><button disabled={completedAsGuest} onClick={()=>setPanel("profile")}><ClipboardPen/><span>complete seu<br/>cadastro</span></button><button disabled={!preview && (!station?.userId)} onClick={()=>{setPanel("chat")}}><Keyboard/><span>teclado do<br/>chat</span></button><button disabled={!preview} onClick={()=>{if(preview)setPanel("remote")}} title={preview ? "Visualizar controle remoto" : "Integração com a TV ainda indisponível"}><Gamepad2/><span>controle<br/>remoto</span></button></div>{!preview && <p className="pair30-note">Controle remoto: integração pendente.</p>}</div></div></> : <div className="pair30-code-area" style={{width:"100%", minWidth:0, maxWidth:"100%", boxSizing:"border-box"}}><p>confirme o código da sua tv<br/>e aguarde o pareamento</p><label className="pair30-code" style={{width:"100%", maxWidth:"320px", minWidth:0, boxSizing:"border-box", marginInline:"auto"}} htmlFor="tv-pair-code"><span>código da sua tv</span><input style={{width:"100%", maxWidth:"100%", minWidth:0, boxSizing:"border-box", border:0, outline:"none", boxShadow:"none", background:"transparent", fontSize:"clamp(36px, 12vw, 64px)", letterSpacing:"0.08em", textAlign:"center"}} id="tv-pair-code" inputMode="numeric" autoComplete="one-time-code" maxLength={4} value={code} placeholder="0000" onChange={e=>{setCode(e.target.value.replace(/\D/g,"").slice(0,4));setStatus({kind:"idle"})}}/></label><button className="pair30-confirm" disabled={!canConfirm || confirming} onClick={handleConfirm}>{confirming ? "Pareando…" : "Confirmar pareamento"}</button></div>}
      </>}
      {!preview && (status.kind === "error" || status.kind === "expired") && <p className="pair30-error" role="alert">{status.message}</p>}
      <footer>{logo && <img src={logo} alt={radioName}/>}</footer>
      {panel && <PairModal kind={panel} color={color} radioName={radioName} onClose={()=>setPanel(null)}>{preview ? <PairPreviewPanel kind={panel} radioName={radioName} color={color} onBack={()=>setPanel(null)} displayName={displayName} avatar={avatar}/> : panel==="profile" ? <TvProfilePhone userSlug={userSlug}/> : <div><p>Digite sua mensagem no chat da sua rádio.</p><button type="button" onClick={()=>window.location.assign(`/${encodeURIComponent(userSlug)}/pair?mode=chat&radio=${encodeURIComponent(station?.userId || "")}`)}>Abrir chat</button></div>}</PairModal>}
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
  return <PairPage />;
}


function PairModal({kind,color,radioName,onClose,children}:{kind:"profile"|"chat"|"remote";color:string;radioName:string;onClose:()=>void;children:ReactNode}) {
  useEffect(()=>{const previous=document.activeElement as HTMLElement|null;const key=(e:KeyboardEvent)=>{if(e.key==="Escape")onClose();};document.addEventListener("keydown",key);const old=document.body.style.overflow;document.body.style.overflow="hidden";document.getElementById("pair5-close")?.focus();return()=>{document.body.style.overflow=old;document.removeEventListener("keydown",key);previous?.focus();};},[]);
  return <div className="pair5-overlay" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section role="dialog" aria-modal="true" aria-labelledby="pair5-title" className="pair5-modal" data-kind={kind} style={{"--pair-color":color} as CSSProperties}><button id="pair5-close" className="pair5-close" type="button" aria-label="Fechar" onClick={onClose}>×</button><p style={{fontSize:11,color:"#777",marginBottom:5}}>NEXO PLAYER · {radioName}</p><h2 id="pair5-title">{kind==="profile"?"Complete seu cadastro":kind==="chat"?"Teclado do chat":"Controle remoto"}</h2>{children}</section></div>;
}
function PairPreviewPanel({kind,color,displayName,avatar}:{kind:"profile"|"chat"|"remote";radioName:string;color:string;onBack:()=>void;displayName:string;avatar?:string}) {
  const [notice,setNotice]=useState("");
  const [message,setMessage]=useState("");
  const field:CSSProperties={width:"100%",boxSizing:"border-box",border:0,borderRadius:12,padding:13,color:"#222",background:"#f0f1f3",fontSize:16,minHeight:44};
  const button:CSSProperties={border:0,borderRadius:14,background:color,color:"white",padding:14,fontWeight:700,cursor:"pointer",minHeight:44};
  const previewAction=(text:string)=>setNotice(text+" — somente demonstração local.");
  return <div style={{color:"#222",fontFamily:"Montserrat, system-ui, sans-serif"}}>
    {kind==="profile" ? <form onSubmit={e=>{e.preventDefault();previewAction("Cadastro simulado")}} style={{display:"grid",gap:12}}><p style={{fontSize:13,color:"#666"}}>Complete seus dados e pontue.</p>
      {[["Nome completo","text"],["E-mail Google","email"],["WhatsApp","tel"],["CPF","text"],["Sexo","select"],["Data de nascimento","date"],["Estado / UF","text"],["Cidade","text"],["Bairro / Setor","text"]].map(([label,type])=><label key={label} style={{display:"grid",gap:6,fontSize:13,fontWeight:600}}>{label}{type==="select"?<select style={field}><option>Selecionar</option><option>Masculino</option><option>Feminino</option><option>Outro</option><option>Prefiro não informar</option></select>:<input style={field} type={type} readOnly={type==="email"} defaultValue={type==="email"?"ouvinte@example.com":label==="Nome completo"?displayName:undefined}/>}</label>)}
      <button style={button} type="submit">Salvar cadastro</button>
    </form>:kind==="chat"?<form onSubmit={e=>{e.preventDefault();if(message.trim()){setMessage("");previewAction("Envio simulado")}}} style={{display:"grid",gap:14}}><div style={{display:"flex",alignItems:"center",gap:10}}>{avatar?<img src={avatar} alt="" style={{width:38,height:38,borderRadius:"50%",objectFit:"cover"}}/>:<span style={{width:38,height:38,borderRadius:"50%",display:"grid",placeItems:"center",background:"#f0f1f3"}}>{displayName.charAt(0)}</span>}<strong style={{fontSize:13}}>{displayName}</strong></div><label htmlFor="pair-preview-chat" style={{fontSize:13}}>Sua mensagem</label><textarea id="pair-preview-chat" style={field} rows={4} maxLength={400} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Escreva aqui..."/><button style={{...button,opacity:message.trim()?1:.5}} disabled={!message.trim()}>Enviar mensagem</button></form>:<div style={{display:"grid",gap:18}}><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,maxWidth:240,width:"100%",margin:"auto"}}>{["","↑","","←","OK","→","","↓",""].map((key,i)=>key?<button type="button" key={i} style={{...button,background:key==="OK"?color:"#f0f1f3",color:key==="OK"?"white":"#222",fontSize:22,aspectRatio:"1.3"}} onClick={()=>previewAction(key)}>{key}</button>:<span key={i}/>)}</div><div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>{["Voltar","Home","Play / Pause","Volume +","Volume −","Mudo"].map(key=><button type="button" key={key} style={{...button,background:"#f0f1f3",color:"#222",fontSize:12}} onClick={()=>previewAction(key)}>{key}</button>)}</div></div>}
    {notice && <p role="status" style={{marginTop:12,fontSize:12,color:"#666"}}>{notice}</p>}
  </div>;
}
