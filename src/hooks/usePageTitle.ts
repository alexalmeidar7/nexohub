import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

let cachedEmpresaNome: string | null = null;

export function usePageTitle(pageName: string) {
  const { user } = useAuth();
  const [empresaNome, setEmpresaNome] = useState(cachedEmpresaNome);

  useEffect(() => {
    if (cachedEmpresaNome) {
      setEmpresaNome(cachedEmpresaNome);
      return;
    }
    if (!user) return;
    supabase
      .from("empresa_config")
      .select("nome")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const nome = data?.nome || "NexoHub";
        cachedEmpresaNome = nome;
        setEmpresaNome(nome);
      });
  }, [user]);

  useEffect(() => {
    const prefix = empresaNome || "NexoHub";
    document.title = `${prefix} - ${pageName}`;
  }, [empresaNome, pageName]);
}
