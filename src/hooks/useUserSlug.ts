import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";

export function useUserSlug(userId?: string) {
  const [slug, setSlug] = useState<string | null>(() => {
    if (!userId) return null;
    const acc = findClientAccountById(userId) || findClientAccountByEmail(userId);
    return acc?.slug || null;
  });

  useEffect(() => {
    if (!userId) return;
    const acc = findClientAccountById(userId) || findClientAccountByEmail(userId);
    if (acc?.slug) {
      setSlug(acc.slug);
      return;
    }
    const resolvedId = acc?.parentUserId || acc?.id || userId;
    (async () => {
      // O slug no nexohub é derivado do nome da rádio na empresa_config quando não há um campo explícito,
      // mas o App.tsx usa :userSlug vindo da URL. Para fins de linkagem de endpoints,
      // vamos buscar o nome da empresa e gerar um slug compatível.
      const { data } = await supabase
        .from("empresa_config")
        .select("nome")
        .eq("user_id", resolvedId)
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
        setSlug(resolvedId.slice(0, 8));
      }
    })();
  }, [userId]);

  return slug;
}


