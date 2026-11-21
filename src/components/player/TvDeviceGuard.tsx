import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { clearLinkedTv, readLinkedTv } from "@/lib/nexoTvDevice";
import { clearPlayerSession } from "@/lib/playerSession";

export default function TvDeviceGuard() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const deviceId = readLinkedTv()?.deviceId;
  useEffect(() => {
    const device = readLinkedTv();
    if (!device || !/(^|\/)player(\/|$)/.test(pathname)) return;
    // Redemption sets storage just before Auth installs the session.
    if (pathname.endsWith("/player/tv")) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const { data: { session } } = await playerSupabase.auth.getSession();
        const result = session?.user.id === device.userId
          ? await playerSupabase.functions.invoke("nexo-tv-device", { body: { action: "status", deviceId: device.deviceId } })
          : null;
        if (stopped || readLinkedTv()?.deviceId !== device.deviceId) return;
        const invalid = !session || session.user.id !== device.userId || result?.data?.active === false ||
          ["device_not_found", "not_authenticated"].includes(result?.data?.reason);
        if (invalid) {
          if (session?.user.id === device.userId) await playerSupabase.auth.signOut({ scope: "local" }).catch(() => {});
          if (stopped || readLinkedTv()?.deviceId !== device.deviceId) return;
          clearLinkedTv();
          clearPlayerSession();
          try { localStorage.removeItem(`player-step-home:${device.slug}`); } catch { /* Storage may be unavailable. */ }
          navigate(`/${device.slug}/player/tv?tv=1`, { replace: true });
          return;
        }
      } catch {
        // Temporary connectivity failures do not revoke the local session.
      } finally {
        if (!stopped && readLinkedTv()?.deviceId === device.deviceId) timer = setTimeout(() => void poll(), 15000);
      }
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [deviceId, pathname, navigate]);
  return null;
}
