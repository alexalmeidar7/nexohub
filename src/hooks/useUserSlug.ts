import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUserSlug(userId?: string) {
  const [slug, setSlug] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      // O slug no nexohub é derivado do nome da rádio na empresa_config quando não há um campo explícito,
      // mas o App.tsx usa :userSlug vindo da URL. Para fins de linkagem de endpoints,
      // vamos buscar o nome da empresa e gerar um slug compatível.
      const { data } = await supabase
        .from("empresa_config")
        .select("nome")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (data?.nome) {
        const cleanSlug = data.nome
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .replace(/[^a-z0-9]+/g, "")
          .slice(0, 32);
        setSlug(cleanSlug);
      } else {
        setSlug(userId.slice(0, 8));
      }
    })();
  }, [userId]);

  return slug;
}

