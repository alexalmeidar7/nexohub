import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useSiteConfig } from "@/hooks/useSiteConfig";
import SiteMockup from "@/components/site/SiteMockup";
import LoadingSpinner from "@/components/LoadingSpinner";

export default function SitePreview() {
  const { user, loading: authLoading } = useAuth();
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlUser = params.get("user");
    setEffectiveUserId(urlUser || user?.id || null);
  }, [user?.id]);

  const { config, loading } = useSiteConfig(effectiveUserId);

  useEffect(() => {
    if (config?.site_nome) document.title = config.site_nome;
  }, [config?.site_nome]);

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
