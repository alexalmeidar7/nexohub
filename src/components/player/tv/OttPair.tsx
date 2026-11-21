import { Undo2, ArrowRight, RefreshCw } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { OttBackdrop, OttFrame } from "./OttFrame";
import PlayerClockWeather from "../PlayerClockWeather";
import OttArtwork from "./OttArtwork";
import { useOttRemote } from "./useOttRemote";
interface Props { radioName:string; radioUserId?:string|null; logo?:string|null; background?:string|null; code:string|null; pairUrl:string; expired:boolean; remaining:string; error:string|null; claimed:string|null; musicTitle?:string; musicArtist?:string; musicCover?:string|null; onRetry:()=>void; onGuest:()=>void; onBack?:()=>void }
export default function OttPair(p:Props){
 const back=p.onBack||p.onGuest;
 const root=useOttRemote(back,`${p.expired}:${!!p.error}`);
 return <OttFrame root={root} className="ott-pair ott-pair-glass"><OttBackdrop image={p.background}/>
  <header className="ott-header"><button className="ott-pair-back" aria-label="Voltar" onClick={back}><Undo2/><span>Voltar</span></button><div className="ott-pair-station"><PlayerClockWeather radioUserId={p.radioUserId} tvHeader/>{p.logo&&<img src={p.logo} alt={p.radioName}/>}</div></header>
  <section className="ott-pair-panel" aria-label="Conectar pelo celular">
   <div className="ott-pair-qr">{p.code&&!p.expired?<QRCodeSVG value={p.pairUrl} size={340} level="M" includeMargin/>:<p role="status">{p.expired?"Código expirado":"Gerando QR code…"}</p>}</div>
   <p className="ott-pair-help">escaneie o QR code e faça login</p>
   <div className="ott-pair-code"><span>código de pareamento</span><strong>{p.code||"— — — —"}</strong></div>
   <div className="ott-pair-status" aria-live="polite">{p.claimed?`Pareado com ${p.claimed}. Entrando…`:p.error||(p.expired?"Gere um novo código para continuar.":"Aguardando confirmação no celular")}</div>
   {!p.expired&&p.code&&<small>Válido por {p.remaining}</small>}
   {(p.expired||p.error)&&<button data-ott-initial onClick={p.onRetry}><RefreshCw/>Gerar novo código</button>}
   <button className="ott-pair-guest" onClick={p.onGuest}>Continuar como visitante<ArrowRight/></button>
  </section>
  {(p.musicTitle||p.musicArtist)&&<section className="ott-pair-now"><OttArtwork sources={[p.musicCover]}/><div><span>tocando agora:</span><h2>{p.musicTitle}</h2><p>{p.musicArtist}</p></div></section>}
 </OttFrame>;
}
