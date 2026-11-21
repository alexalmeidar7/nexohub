import { useEffect, useState } from "react";
export function useOttControlsMotion(visible: boolean, channelKey?: string) {
  const [phase, setPhase] = useState(visible ? "enter" : "hidden");
  useEffect(() => {
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) { setPhase(visible ? "shown" : "hidden"); return; }
    setPhase(visible ? "enter" : "exit");
    const timer = setTimeout(() => setPhase(visible ? "shown" : "hidden"), visible ? 2300 : 480);
    return () => clearTimeout(timer);
  }, [visible, channelKey]);
  return phase;
}
