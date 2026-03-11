import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

let cachedEmpresaNome: string | null = null;
let cachedEmpresaLogo: string | null = null;

export function usePageTitle(pageName: string) {
  const { user } = useAuth();
  const [empresaNome, setEmpresaNome] = useState(cachedEmpresaNome);

  useEffect(() => {
    if (cachedEmpresaNome) {
      setEmpresaNome(cachedEmpresaNome);
      if (cachedEmpresaLogo) setFavicon(cachedEmpresaLogo);
      return;
    }
    if (!user) return;
    supabase
      .from("empresa_config")
      .select("nome, logo")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const nome = data?.nome || "NexoHub";
        cachedEmpresaNome = nome;
        setEmpresaNome(nome);

        const logo = data?.logo || "";
        if (logo) {
          cachedEmpresaLogo = logo;
          setFavicon(logo);
        }
      });
  }, [user]);

  useEffect(() => {
    const prefix = empresaNome || "NexoHub";
    document.title = `${prefix} - ${pageName}`;
  }, [empresaNome, pageName]);
}

function setFavicon(url: string) {
  let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = url;
}
