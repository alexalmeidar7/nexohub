import { useEffect, useState } from "react";
import { playerSupabase } from "@/integrations/supabase/playerClient";

/** Finaliza a sessão OAuth no popup e devolve o controle à janela do player. */
export default function OAuthPopupCallback() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let completed = false;
    const flowId = new URLSearchParams(window.location.search).get("flow") || "";
    const notifyOpener = (success: boolean) => {
      if (completed) return;
      completed = true;
      const result = { type: "nexohub:player:oauth-result", success, flowId, at: Date.now() };
      // O navegador pode remover window.opener ao atravessar Google/Supabase.
      // BroadcastChannel e storage cobrem esse caso mantendo a janela principal
      // informada mesmo quando postMessage não está mais disponível.
      try { window.localStorage.setItem("nexohub:player:oauth-popup-result", JSON.stringify(result)); } catch {}
      try {
        const channel = new BroadcastChannel("nexohub-player-oauth");
        channel.postMessage(result);
        channel.close();
      } catch {}
      if (window.opener && !window.opener.closed) {
        try { window.opener.postMessage(result, window.location.origin); } catch {}
      }
      // Fechar sempre: postMessage não é o único mecanismo de retorno.
      if (window.opener || window.closed === false) {
        window.setTimeout(() => window.close(), 50);
      }
      if (!success && active) {
        setFailed(true);
      }
    };

    const { data: { subscription } } = playerSupabase.auth.onAuthStateChange((event, session) => {
      if (session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) notifyOpener(true);
    });

    // getSession aguarda o cliente processar o code/hash OAuth desta URL.
    void playerSupabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (data.session) notifyOpener(true);
      else if (error) notifyOpener(false);
    }).catch(() => { if (active) notifyOpener(false); });

    const timeout = window.setTimeout(() => {
      if (active && !completed) notifyOpener(false);
    }, 20000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <main className="fixed inset-0 flex items-center justify-center bg-black px-6 text-center text-white">
      <div className="space-y-3">
        <span className="mx-auto block h-9 w-9 animate-spin rounded-full border-2 border-white/25 border-t-white" />
        <p className="text-sm text-white/75">{failed ? "Não foi possível concluir o login. Feche esta janela e tente novamente." : "Concluindo login…"}</p>
      </div>
    </main>
  );
}
