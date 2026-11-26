import type { CSSProperties } from "react";
import "./OttSkeleton.css";

export type OttSkeletonVariant = "home" | "watch" | "profiles" | "catalog" | "generic";
export type OttSkeletonContentVariant = "lyrics" | "poll" | "weather" | "history" | "generic";

/** Placeholder visual. Nunca busca dados, nunca altera o stream e não anuncia cada faixa. */
function Bone({ kind = "line", className = "", style }: { kind?: "line" | "badge" | "art" | "avatar" | "card" | "button"; className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`ott-skeleton-bone ott-skeleton-${kind} ${className}`} style={style} />;
}

export function OttSkeletonPage({ variant = "generic" }: { variant?: OttSkeletonVariant }) {
  return <div className={`ott-skeleton-page ott-skeleton-page--${variant}`} role="status" aria-label="Carregando informações" aria-live="polite">
    <span className="ott-skeleton-sr">Carregando informações da rádio</span>
    <header className="ott-skeleton-header" aria-hidden="true">
      <Bone kind="art" className="ott-skeleton-brand" />
      <div className="ott-skeleton-header-text"><Bone className="ott-skeleton-line-m"/><Bone className="ott-skeleton-line-s"/></div>
      <Bone kind="badge" className="ott-skeleton-status"/>
      <div className="ott-skeleton-header-end"><Bone className="ott-skeleton-line-s"/><Bone kind="avatar"/></div>
    </header>
    {variant === "profiles" ? <main className="ott-skeleton-profile" aria-hidden="true">
      <Bone kind="avatar" className="ott-skeleton-profile-photo" />
      <div className="ott-skeleton-profile-info"><Bone className="ott-skeleton-line-l"/><Bone kind="badge"/><Bone kind="button" className="ott-skeleton-line-s"/></div>
      <Bone kind="card" className="ott-skeleton-profile-add" />
    </main> : variant === "watch" ? <main className="ott-skeleton-watch" aria-hidden="true">
      <Bone kind="art" className="ott-skeleton-album" />
      <div className="ott-skeleton-watch-description"><Bone kind="badge"/><Bone className="ott-skeleton-line-xl"/><Bone className="ott-skeleton-line-l"/><Bone className="ott-skeleton-line-m"/></div>
      <div className="ott-skeleton-watch-footer"><Bone kind="button"/><Bone className="ott-skeleton-line-m"/><Bone kind="badge"/></div>
    </main> : variant === "home" ? <main className="ott-skeleton-home" aria-hidden="true">
      <div className="ott-skeleton-home-cards">{[0,1,2].map(n=><Bone key={n} kind="card" className="ott-skeleton-home-card" />)}</div>
      <div className="ott-skeleton-home-info"><Bone kind="badge"/><Bone className="ott-skeleton-line-xl"/><Bone className="ott-skeleton-line-l"/><Bone className="ott-skeleton-line-s"/><Bone kind="button"/></div>
    </main> : <main className="ott-skeleton-generic" aria-hidden="true">
      <Bone className="ott-skeleton-line-l" />
      <Bone kind="badge" />
      {[0,1,2,3].map(n=><div className="ott-skeleton-generic-row" key={n}><Bone kind="art"/><span><Bone className="ott-skeleton-line-l"/><Bone className="ott-skeleton-line-m"/></span></div>)}
    </main>}
  </div>;
}

/** Placeholders para fetches localizados, sem esconder o restante da página. */
export function OttSkeletonContent({ variant = "generic" }: { variant?: OttSkeletonContentVariant }) {
  if (variant === "history") return <div className="ott-skeleton-inline ott-skeleton-inline--history" role="status" aria-label="Carregando músicas tocadas">
    <Bone kind="art" className="ott-skeleton-history-art"/>
    <div><Bone kind="badge"/><Bone className="ott-skeleton-line-m"/><Bone className="ott-skeleton-line-s"/></div>
  </div>;
  return <div className={`ott-skeleton-inline ott-skeleton-inline--${variant}`} role="status" aria-label="Carregando conteúdo">
    <Bone className="ott-skeleton-line-l"/>
    <Bone className="ott-skeleton-line-m"/>
    {variant === "poll" ? [0,1,2,3].map(i=><Bone kind="card" className="ott-skeleton-answer" key={i}/>)
      : variant === "lyrics" ? [0,1,2,3,4,5,6].map(i=><Bone className={i%3===2?"ott-skeleton-line-s":"ott-skeleton-line-l"} key={i}/>)
      : [0,1,2,3].map(i=><Bone kind="card" className="ott-skeleton-answer" key={i}/>)}
  </div>;
}
