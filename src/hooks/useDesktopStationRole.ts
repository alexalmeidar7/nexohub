import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { resolveHmdBadge, type StationDevice } from "@/lib/desktopStationRole";

export type DesktopStationRoleState = {
  ready: boolean; badge: string | null; isPrimary: boolean;
};
const initial: DesktopStationRoleState = { ready: false, badge: null, isPrimary: false };
const isUuid = (value?: string | null) =>
  !!value && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

/** Shared, server-elected roles. Never infer "principal" from a local preference. */
export function useDesktopStationRole(stationId?: string | null): DesktopStationRoleState {
  const [status, setStatus] = useState<DesktopStationRoleState>(initial);
  useEffect(() => {
    setStatus(initial);
    const desktop = window.houseMixDesktop;
    if (!desktop?.getDeviceIdentity || !isUuid(stationId)) {
      setStatus({ ...initial, ready: true });
      return;
    }
    let active = true;
    let deviceId = "";
    let running = false;
    let queued = false;
    const refresh = async () => {
      if (!deviceId || !active) return;
      if (running) { queued = true; return; }
      running = true;
      try {
        const [devices, primary] = await Promise.all([
          supabase.from("housemix_station_devices" as any)
            .select("device_id,registered_at").eq("station_id", stationId)
            .order("registered_at", { ascending: true }),
          supabase.from("housemix_station_primary" as any)
            .select("device_id").eq("station_id", stationId).maybeSingle(),
        ]);
        if (devices.error) throw devices.error;
        if (primary.error) throw primary.error;
        const resolved = resolveHmdBadge(
          (devices.data || []) as StationDevice[], (primary.data as any)?.device_id || null, deviceId,
        );
        if (active) setStatus({ ready: true, ...resolved });
      } catch (error) {
        if (active) setStatus({ ready: true, badge: null, isPrimary: false });
        console.warn("[HMD] Papel do computador indisponível", error);
      } finally {
        running = false;
        if (queued && active) { queued = false; void refresh(); }
      }
    };
    void desktop.getDeviceIdentity().then(identity => {
      if (!active) return;
      deviceId = identity.deviceId;
      void refresh();
    }).catch(error => {
      if (active) setStatus({ ready: true, badge: null, isPrimary: false });
      console.warn("[HMD] Identidade indisponível", error);
    });
    // Only changes to the two small registry tables trigger a new read.
    const channel = supabase.channel("hmd-role-" + stationId + "-" + Math.random().toString(36).slice(2))
      .on("postgres_changes", { event: "*", schema: "public",
        table: "housemix_station_devices", filter: "station_id=eq." + stationId }, () => { void refresh(); })
      .on("postgres_changes", { event: "*", schema: "public",
        table: "housemix_station_primary", filter: "station_id=eq." + stationId }, () => { void refresh(); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
  }, [stationId]);
  return status;
}
