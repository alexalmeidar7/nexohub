import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

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
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const res = await fetch(
          `${supabaseUrl}/functions/v1/public-player-data?slug=${encodeURIComponent(userSlug)}`,
          { headers: { apikey: anonKey } }
        );
        const data = await res.json();

        if (!res.ok || data?.error) {
          setError("Usuário não encontrado");
          setLoading(false);
          return;
        }

        if (data?.userId) {
          setUserId(data.userId);
        } else {
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
