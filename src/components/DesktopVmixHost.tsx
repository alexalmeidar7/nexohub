import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { acquireVmixRoom } from "@/lib/vmixRemoteRooms";
import type { VmixHostExecutor } from "@/lib/vmixRemoteRoom";

/** Keeps the studio relay alive while HMD is open, including on the home page. */
export default function DesktopVmixHost() {
  const { user } = useAuth();
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const changed = () => setRevision(n => n + 1);
    window.addEventListener("online", changed);
    window.addEventListener("vmix-connections-updated", changed);
    return () => { window.removeEventListener("online", changed); window.removeEventListener("vmix-connections-updated", changed); };
  }, []);
  useEffect(() => {
    const desktop = window.houseMixDesktop;
    if (!user?.id || !desktop?.fetchVmixApi) return;
    let stopped = false;
    const cleanups: Array<() => void> = [];
    const start = async () => {
      const { data: parent } = await (supabase.rpc as any)("current_parent_user_id");
      const owners = [user.id, ...(typeof parent === "string" ? [parent] : [])];
      const { data, error } = await (supabase.from("vmix_connections") as any)
        .select("id,name,url,username,password").in("user_id", owners);
      if (stopped || error) return;
      for (const connection of data || []) {
        if (stopped) break;
        const { room, release } = await acquireVmixRoom(connection.id);
        if (stopped) { release(); break; }
        let active = true;
        let timer: ReturnType<typeof setTimeout>;
        let working = false;
        let delay = 2000;
        let latestXml = "";
        const fetchLocal = (path: string) => desktop.fetchVmixApi!(connection.url, path, connection.username || "", connection.password || "");
        const execute: VmixHostExecutor = async (paths, label, expiresAt) => {
          working = true;
          let result = "";
          try {
            for (let index = 0; index < paths.length; index++) {
              if (!active || stopped || Date.now() >= expiresAt) throw new Error("Execução interrompida ou expirada. As ações restantes não foram enviadas.");
              // Exactly one attempt per action: a lost reply must never repeat a cut/toggle.
              result = await fetchLocal(paths[index]);
              if (index < paths.length - 1) await new Promise(r => setTimeout(r, 400));
            }
            window.dispatchEvent(new CustomEvent("vmix-remote-executed", { detail: { connectionId: connection.id, label } }));
            const xml = await fetchLocal("/api/").catch(() => "");
            if (xml.includes("<vmix>")) { latestXml = xml; await room.announce(xml, connection.name, true); }
            return result;
          } finally { working = false; }
        };
        const probe = async () => {
          if (!active || stopped) return;
          try {
            if (!working) {
              const xml = await fetchLocal("/api/");
              if (!xml.includes("<vmix>")) throw new Error("O endereço não respondeu com a API do vMix.");
              latestXml = xml;
              if (active && !stopped) await room.setHost(execute, connection.name, xml);
              delay = 2000;
            } else await room.announce(latestXml, connection.name);
          } catch {
            await room.setHost(null);
            delay = Math.min(delay * 2, 15_000);
          } finally {
            if (active && !stopped) timer = setTimeout(() => void probe(), delay);
          }
        };
        void probe();
        cleanups.push(() => { active = false; clearTimeout(timer); void room.setHost(null); release(); });
      }
    };
    void start().catch(error => console.warn("Conexão do HMD com o estúdio indisponível", error));
    return () => { stopped = true; cleanups.forEach(fn => fn()); };
  }, [user?.id, revision]);
  return null;
}
