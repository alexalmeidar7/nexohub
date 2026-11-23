export type StationDevice = { device_id: string; registered_at: string };
export function resolveHmdBadge(
  devices: StationDevice[], primaryId: string | null | undefined, thisDeviceId: string,
): { badge: string | null; isPrimary: boolean } {
  if (!primaryId || !devices.some(device => device.device_id === thisDeviceId)) {
    return { badge: null, isPrimary: false };
  }
  if (primaryId === thisDeviceId) return { badge: "P", isPrimary: true };
  const others = devices
    .filter(device => device.device_id !== primaryId)
    .sort((a, b) => a.registered_at.localeCompare(b.registered_at) || a.device_id.localeCompare(b.device_id));
  const rank = others.findIndex(device => device.device_id === thisDeviceId);
  return { badge: rank < 0 ? null : "S" + (rank + 1), isPrimary: false };
}
