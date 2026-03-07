import { useEffect } from "react";
import PlayerPage from "./Player";

/**
 * TV-optimized player wrapper.
 * Forces ?tv=1 in the URL so PlayerPage activates TV mode automatically.
 */
export default function PlayerApp() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tv") !== "1") {
      params.set("tv", "1");
      window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
    }
  }, []);

  return <PlayerPage />;
}
