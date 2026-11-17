import { ArrowRight, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { OttBackdrop, OttBrand, OttFrame } from "./OttFrame";
import { useOttRemote } from "./useOttRemote";

interface Props { radioName:string; logo?:string|null; background?:string|null; code:string|null; pairUrl:string; expired:boolean; remaining:string; error:string|null; claimed:string|null; onRetry:()=>void; onGuest:()=>void }
export default function OttPair(p:Props){
 const root=useOttRemote(p.onGuest,`${p.expired}:${!!p.error}`);
 if(!p.code&&!p.error) return <OttFrame root={root} className="ott-black"><img className="ott-splash-mark" src={p.logo||"/images/player-ott-seal-white.png"} alt={p.radioName||"Nexo OTT Player"}/><div className="ott-spinner" role="status" aria-label="Carregando"/></OttFrame>;
 return <OttFrame root={root} className="ott-pair"><OttBackdrop image={p.background}/><header className="ott-header"><OttBrand/></header><section className="ott-pair-copy"><span className="ott-eyebrow">{p.radioName}</span><h1>A sua rádio.<br/>Do seu jeito.</h1><p>Entre pelo celular para continuar<br/>com a sua conta na TV.</p><ol><li>Aponte a câmera para o QR Code.</li><li>Confirme o código no seu celular.</li></ol><button data-ott-initial={!p.expired&&!p.error ? "":undefined} onClick={p.onGuest}>Continuar como visitante <ArrowRight/></button></section><section className="ott-pair-panel"><span className="ott-eyebrow">CONECTAR SUA CONTA</span><div className="ott-pair-qr">{p.code&&!p.expired ? <QRCodeSVG value={p.pairUrl} size={250} level="M" includeMargin/>:<p role="status">{p.expired ? "Código expirado":"Gerando código…"}</p>}</div><span className="ott-eyebrow">CÓDIGO DE PAREAMENTO</span><strong>{p.code || "— — — —"}</strong><div aria-live="polite">{p.claimed ? `Pareado com ${p.claimed}. Entrando…`:p.error || (p.expired ? "Gere um novo código para continuar.":"Aguardando confirmação no celular")}</div>{!p.expired&&p.code&&<small>Válido por {p.remaining}</small>}{(p.expired||p.error)&&<button data-ott-initial onClick={p.onRetry}><RefreshCw/> Gerar novo código</button>}</section></OttFrame>;
}
