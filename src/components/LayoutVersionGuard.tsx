import { useEffect } from "react";
import { toast } from "sonner";
import {
  LAYOUT_VERSION,
  LAYOUT_VERSION_KEY,
  findStaleLayoutKeys,
  getStoredLayoutVersion,
  purgeStaleLayoutKeys,
} from "@/lib/layoutVersion";

const SESSION_CHECK_FLAG = "__layout_version_checked__";
const WARNING_SHOWN_FLAG = "__layout_version_warned__";

/**
 * Runs once per session: confirms the active layout version matches the
 * expected one and warns the user if stale cache entries are still around.
 */
export default function LayoutVersionGuard() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(SESSION_CHECK_FLAG) === "1") return;
      sessionStorage.setItem(SESSION_CHECK_FLAG, "1");
    } catch {
      /* ignore */
    }

    const stored = getStoredLayoutVersion();
    const versionMismatch = stored !== LAYOUT_VERSION;
    const stale = findStaleLayoutKeys();

    if (!versionMismatch && stale.length === 0) return;

    // Try to auto-heal first
    const purged = purgeStaleLayoutKeys();
    try {
      localStorage.setItem(LAYOUT_VERSION_KEY, LAYOUT_VERSION);
    } catch {}

    const remaining = findStaleLayoutKeys();

    if (remaining.length > 0) {
      // Couldn't clean everything — warn the user
      try {
        if (sessionStorage.getItem(WARNING_SHOWN_FLAG) === "1") return;
        sessionStorage.setItem(WARNING_SHOWN_FLAG, "1");
      } catch {}

      toast.warning("Layout antigo detectado no cache", {
        description:
          "Ainda há dados antigos armazenados no navegador. Recarregue a página para aplicar o novo layout.",
        duration: 12000,
        action: {
          label: "Recarregar",
          onClick: () => window.location.reload(),
        },
      });
      console.warn(
        "[LayoutVersionGuard] Stale layout keys still present after purge:",
        remaining
      );
    } else if (versionMismatch || purged > 0) {
      console.info(
        `[LayoutVersionGuard] Layout cache atualizado para ${LAYOUT_VERSION} (${purged} chaves removidas).`
      );
    }
  }, []);

  return null;
}
