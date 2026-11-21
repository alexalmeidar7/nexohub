import { useState } from "react";
import { Headphones } from "lucide-react";

export default function OttArtwork({ sources, programSeal, className = "" }: { sources: (string | null | undefined)[]; programSeal?: string | null; className?: string }) {
  const candidates = [...new Set([...sources, programSeal].filter((s): s is string => !!s?.trim()))];
  const [failed, setFailed] = useState<string[]>([]);
  const source = candidates.find(s => !failed.includes(s));
  return <span className={`ott-artwork ${source === programSeal && programSeal ? "ott-program-artwork" : ""} ${className}`}>
    {source ? <img key={source} src={source} alt="" onError={() => setFailed(previous => [...previous, source])} /> : <Headphones aria-hidden="true" />}
  </span>;
}
