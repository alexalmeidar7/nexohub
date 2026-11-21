import { useEffect, useRef, useState } from "react";
/** Keep old metadata through exit, then show only the newest received snapshot. */
export function useOttSoftSwap<T>(value: T, key: string) {
  const latest = useRef(value); latest.current = value;
  const previous = useRef(key);
  const [displayed, setDisplayed] = useState(value), [phase, setPhase] = useState("idle");
  useEffect(() => {
    if (previous.current === key) return;
    let entry: ReturnType<typeof setTimeout>;
    setPhase("exit");
    const exit = setTimeout(() => {
      previous.current = key; setDisplayed(latest.current); setPhase("enter");
      entry = setTimeout(() => setPhase("idle"), 700);
    }, 450);
    return () => { clearTimeout(exit); clearTimeout(entry); };
  }, [key]);
  return { displayed, phase };
}
