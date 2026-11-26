import { useEffect, useState } from "react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { getActiveEnquete, getBrasiliaDateTime } from "@/lib/scheduledItemUtils";

type ScheduledPoll = {
  id: string;
  pergunta: string;
  data_enquete: string;
  horario_inicio: string;
  horario_fim: string;
  resposta1?: string | null;
  resposta2?: string | null;
  resposta3?: string | null;
  resposta4?: string | null;
};

/** Consulta a MESMA fonte publica usada no painel Enquete. Nao altera votos. */
export function useOttActivePoll(radioUserId?: string | null): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    setActive(false);
    if (!radioUserId) return;

    const refresh = async () => {
      if (inFlight || document.hidden) return;
      inFlight = true;
      try {
        const { today, currentTime } = getBrasiliaDateTime();
        const params = new URLSearchParams({ uid: radioUserId, date: today, time: currentTime });
        const { data, error } = await playerSupabase.functions.invoke<{ enquetes: ScheduledPoll[] }>(
          `public-cenario-data?${params.toString()}`,
          { method: "GET" },
        );
        if (!cancelled && !error && Array.isArray(data?.enquetes)) {
          setActive(Boolean(getActiveEnquete(data.enquetes, today, currentTime)));
        }
      } catch {
        // Keep the last confirmed status during a transport failure.
      } finally {
        inFlight = false;
      }
    };

    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    const wake = () => { if (!document.hidden) void refresh(); };
    document.addEventListener("visibilitychange", wake);
    return () => { cancelled = true; window.clearInterval(interval); document.removeEventListener("visibilitychange", wake); };
  }, [radioUserId]);

  return active;
}
