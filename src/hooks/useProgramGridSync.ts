import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useProgramGridSync(ownerId: string | null, loadProgramas: () => Promise<void>) {
  useEffect(() => {
    if (!ownerId) return;
    let disposed = false;
    let running = false;
    let pending = false;
    let initial = true;

    const refresh = () => {
      if (disposed || (!initial && document.visibilityState === "hidden")) return;
      initial = false;
      if (running) {
        pending = true;
        return;
      }
      running = true;
      void loadProgramas().catch((error) => {
        console.error("Erro ao atualizar a grade de programas:", error);
      }).finally(() => {
        running = false;
        if (pending && !disposed) {
          pending = false;
          refresh();
        }
      });
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === "nexohub_housemix_programs_v2") refresh();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    refresh();
    const channel = supabase
      .channel(`vmix-program-grid-${ownerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "programas", filter: `user_id=eq.${ownerId}` }, refresh)
      .subscribe();
    const pollId = window.setInterval(refresh, 15000);
    window.addEventListener("nexohub:programas-updated", refresh);
    window.addEventListener("housemix:programas-updated", refresh);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(pollId);
      window.removeEventListener("nexohub:programas-updated", refresh);
      window.removeEventListener("housemix:programas-updated", refresh);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      void supabase.removeChannel(channel);
    };
  }, [ownerId, loadProgramas]);
}
