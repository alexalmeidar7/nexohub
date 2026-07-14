import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import SiteMockup from "@/components/site/SiteMockup";
import LoadingSpinner from "@/components/LoadingSpinner";
import { supabase } from "@/integrations/supabase/client";
import { applyPublicHead } from "@/hooks/usePageTitle";

export default function SitePreview() {
  const { user, loading: authLoading } = useAuth();
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlUser = params.get("user");
    setEffectiveUserId(urlUser || user?.id || null);
  }, [user?.id]);

  const { config, loading } = useSiteConfig(effectiveUserId);

  // Public tab head: always reflects the routed user (from ?user=), never the
  // authenticated user's cached favicon/title.
  useEffect(() => {
    if (!effectiveUserId) return;
    let cancelled = false;
    const siteName = config?.site_nome || null;
    // Optimistic pass with site data we already have.
    applyPublicHead(siteName, null, "Notícias");
    supabase
      .from("empresa_config")
      .select("nome, logo")
      .eq("user_id", effectiveUserId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        const nome = siteName || data?.nome || null;
        applyPublicHead(nome, data?.logo || null, "Notícias");
      });
    return () => { cancelled = true; };
  }, [effectiveUserId, config?.site_nome]);

  if (authLoading || loading || !effectiveUserId || !config) {
    return <LoadingSpinner fullscreen />;
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto min-h-screen shadow-2xl">
        <SiteMockup config={config} effectiveUserId={effectiveUserId} />
      </div>
    </div>
  );
}
