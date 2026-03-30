import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { usePageTitle } from "@/hooks/usePageTitle";
import CenarioTela from "./CenarioTela";

export default function TelaInterativa() {
  usePageTitle("NexoHub - Tela Interativa");
  const { userSlug } = useParams<{ userSlug: string }>();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userSlug) {
      setError("Slug não informado");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const { data, error: fnError } = await supabase.functions.invoke("public-player-data", {
          body: { slug: userSlug },
        });

        if (fnError || data?.error) {
          setError("Usuário não encontrado");
          setLoading(false);
          return;
        }

        // The function returns userId in the response
        // We need to extract it — let's use the empresa_config or channels to find it
        // Actually public-player-data doesn't return userId directly, let's create a simpler approach
        // We'll call the function and extract userId from the returned data
        if (data?.channels?.length > 0) {
          setUserId(data.channels[0].user_id);
        } else if (data?.empresa?.user_id) {
          setUserId(data.empresa.user_id);
        } else {
          // Fallback: use a dedicated edge function call
          setError("Usuário não encontrado");
        }
      } catch {
        setError("Erro ao buscar dados");
      }
      setLoading(false);
    })();
  }, [userSlug]);

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#e1f532] border-t-transparent rounded-full animate-spin" />
          <span className="text-white/60 text-sm">Buscando conexão...</span>
        </div>
      </div>
    );
  }

  if (error || !userId) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="text-white/40 text-lg mb-2">⚠️</div>
          <div className="text-white/60 text-sm">{error || "Não foi possível conectar"}</div>
        </div>
      </div>
    );
  }

  // Pass userId to CenarioTela via URL search params
  // CenarioTela already reads ?uid= from URL
  return <CenarioTelaWithUid userId={userId} />;
}

function CenarioTelaWithUid({ userId }: { userId: string }) {
  // Set the uid param so CenarioTela can pick it up
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("uid") !== userId) {
      url.searchParams.set("uid", userId);
      window.history.replaceState({}, "", url.toString());
    }
  }, [userId]);

  return <CenarioTela />;
}
