import { useEffect, useState } from "react";
import { Headphones } from "lucide-react";

export default function OttArtwork({ sources, programSeal, className = "" }: { sources: (string | null | undefined)[]; programSeal?: string | null; className?: string }) {
  const signature = JSON.stringify([...new Set([...sources, programSeal].filter((s): s is string => !!s?.trim()))]);
  const [visible, setVisible] = useState<string | null>(null);
  const [pendingInitial,setPendingInitial]=useState(false);
  useEffect(() => {
    const candidates: string[] = JSON.parse(signature);
    if (!candidates.length) { setVisible(null); setPendingInitial(false); return; }
    setPendingInitial(true);
    let cancelled = false;
    let pending: HTMLImageElement | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let index = 0;
    const next = () => {
      if (cancelled) return;
      if (pending) { pending.onload = null; pending.onerror = null; }
      if (timer !== undefined) clearTimeout(timer);
      const url = candidates[index++];
      if (!url) { setPendingInitial(false); return; } // nexo-lote11-artwork: preserve last valid cover on failed replacements
      const image = new Image(); pending = image;
      let settled = false;
      const finish = (ok: boolean) => {
        if (cancelled || settled) return;
        settled = true; clearTimeout(timer); image.onload = null; image.onerror = null;
        if (ok) {
          // onload confirms usable pixels; decode is an optimization, not an unbounded gate.
          let decodeTimer: ReturnType<typeof setTimeout> | undefined;
          const decoded = typeof image.decode === "function" ? image.decode().catch(()=>{}) : Promise.resolve();
          void Promise.race([decoded, new Promise<void>(resolve => { decodeTimer = setTimeout(resolve, 700); })]).then(()=>{
            if(decodeTimer !== undefined) clearTimeout(decodeTimer);
            if(!cancelled && image.naturalWidth > 0) {setVisible(url);setPendingInitial(false);} else if(!cancelled) next();
          });
        } else next();
      };
      image.onload = () => finish(image.naturalWidth > 0);
      image.onerror = () => finish(false);
      timer = setTimeout(() => finish(false), 4000);
      image.src = url;
      if (image.complete && image.naturalWidth > 0) finish(true);
    };
    next();
    return () => { cancelled = true; clearTimeout(timer); if (pending) { pending.onload = null; pending.onerror = null; } };
  }, [signature]);
  return <span className={`ott-artwork ${visible === programSeal && programSeal ? "ott-program-artwork" : ""} ${className}${!visible&&pendingInitial ? " nexo-lote14-art-pending" : ""}`}>
    {visible ? <img src={visible} alt="" onError={() => setVisible(current => current === visible ? null : current)} /> : pendingInitial ? <span className="nexo-lote14-bone" role="status" aria-label="Carregando capa"/> : <Headphones aria-hidden="true" />}
  </span>;
}
