import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, RadioTower } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import LinkBioVisual from "@/components/linkbio/LinkBioVisual";
import { isLinkBioSlug, normalizeLinkBioWhatsApp, makeLinkBioDefaults, resolveLinkBioOnAir, type LinkBioConfig, type LinkBioOnAir } from "@/lib/linkBio";

type PublicState = {
  companyWhatsApp?: string;
  config: LinkBioConfig;
  onAir: LinkBioOnAir | null;
};
export default function LinkBioPublic() {
  const { slug = "" } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PublicState | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!isLinkBioSlug(slug)) { setLoading(false); setMissing(true); return; }
    let active = true;
    setMissing(false);
    setLoading(true);
    void (async () => {
      const { data, error } = await (supabase as any)
        .from("link_bio_pages").select("*")
        .eq("slug", slug).eq("published", true).maybeSingle();
      if (!active) return;
      if (error || !data) {
        setMissing(true);
        setLoading(false);
        return;
      }
      const config = { ...makeLinkBioDefaults(data.user_id, slug), ...data } as LinkBioConfig;
      setPage({ config, onAir: null });
      document.title = (config.station_name || "Rádio") + " — Links oficiais";
      setLoading(false);
    })();
    return () => { active = false; };
  }, [slug]);

  // Use the public player backend as the source of truth. It resolves the
  // on-air program and its presenter in the station's configured timezone.
  useEffect(() => {
    if (!page?.config.user_id) return;
    let active = true;
    let inFlight = false;
    const userId = page.config.user_id;
    const refreshOnAir = async () => {
      if (inFlight || !active || document.visibilityState !== "visible") return;
      inFlight = true;
      try {
        const { data, error } = await supabase.functions.invoke("public-player-data", {
          body: { slug: userId },
        });
        if (active && !error && data && !data.error) {
          setPage(current => current && current.config.user_id === userId
            ? { ...current, onAir: resolveLinkBioOnAir(data), companyWhatsApp: normalizeLinkBioWhatsApp(data.empresa?.telefone_participacao) }
            : current);
        }
      } catch (error) {
        // Preserve the last known program rather than flashing stale placeholders.
        console.warn("[LinkBio] Falha ao atualizar programa no ar", error);
      } finally { inFlight = false; }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refreshOnAir();
    };
    void refreshOnAir();
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => void refreshOnAir(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [page?.config.user_id]);

  if (loading) {
    return <div className="flex min-h-svh items-center justify-center bg-[#290000] text-white">
      <Loader2 size={38} className="animate-spin" aria-label="Carregando página"/>
    </div>;
  }
  if (missing || !page) {
    return <main className="flex min-h-svh flex-col items-center justify-center gap-4 bg-[#290000] px-6 text-center text-white">
      <RadioTower size={46} className="text-[#ff171d]"/>
      <h1 className="text-2xl font-extrabold">Página não disponível</h1>
      <p className="max-w-sm text-sm text-white/65">O endereço pode estar incorreto ou a rádio ainda não publicou seus links.</p>
    </main>;
  }
  return <LinkBioVisual config={{ ...page.config, whatsapp_url: normalizeLinkBioWhatsApp(page.config.whatsapp_url) || page.companyWhatsApp || "" }} onAir={page.onAir}/>;
}
