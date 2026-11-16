import { useCallback, useEffect, useRef, useState } from "react";
import { acquireVmixRoom } from "@/lib/vmixRemoteRooms";
import type { VmixRemoteRoom, VmixRemoteState } from "@/lib/vmixRemoteRoom";

const empty: VmixRemoteState = { joined: false, available: false, hostId: null, studioName: "", xml: "", error: "", lastAction: "" };
export function useVmixRemoteControl(connectionId: string | null, userId?: string) {
  const ref = useRef<VmixRemoteRoom | null>(null);
  const [state, setState] = useState(empty);
  useEffect(() => {
    ref.current = null;
    setState(empty);
    if (!connectionId || !userId) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    void acquireVmixRoom(connectionId).then(({ room, release }) => {
      if (cancelled) { release(); return; }
      ref.current = room;
      const unlisten = room.listen(() => setState({ ...room.state }));
      dispose = () => { unlisten(); release(); };
    }).catch(error => {
      if (!cancelled) setState({ ...empty, error: error instanceof Error ? error.message : "Falha ao preparar o canal remoto." });
    });
    return () => { cancelled = true; ref.current = null; dispose?.(); };
  }, [connectionId, userId]);
  const request = useCallback(async (paths: string[], label?: string) => {
    if (!ref.current) throw new Error("Preparando o canal remoto do estúdio. Tente novamente em instantes.");
    return ref.current.request(paths, label);
  }, []);
  return { ...state, request };
}
