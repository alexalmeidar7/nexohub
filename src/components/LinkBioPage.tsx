import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Apple, Check, Copy, ExternalLink, Globe2, Image as ImageIcon, Instagram, Link2, Loader2, MapPin, MessageCircle, Palette, Radio, Save, Smartphone, Youtube, Facebook } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useUserSlug } from "@/hooks/useUserSlug";
import { findClientAccountById } from "@/lib/clientAuthAccounts";
import { supabase } from "@/integrations/supabase/client";
import LinkBioVisual from "@/components/linkbio/LinkBioVisual";
import { isLinkBioSlug, makeLinkBioDefaults, normalizeLinkBioUrl, resolveLinkBioOnAir, shortLinkBioUrl, type LinkBioConfig, type LinkBioOnAir } from "@/lib/linkBio";

interface Props { effectiveUserId?: string | null }
type EditableKey = "station_name" | "logo_url" | "whatsapp_url" | "site_url" | "map_url" |
  "ios_store_url" | "android_store_url" | "instagram_url" | "facebook_url" | "youtube_url";
const allLinks: EditableKey[] = [
  "logo_url", "whatsapp_url", "site_url", "map_url", "ios_store_url", "android_store_url",
  "instagram_url", "facebook_url", "youtube_url",
];
const isPhone = (raw: string) => /^\+?\d[\d\s()+-]{8,19}$/.test(raw.trim()) && raw.replace(/\D/g, "").length >= 10;
const blue = "bg-[#0055ff] hover:bg-[#0047d6] text-white";
function FormField({ label, value, placeholder, onChange, icon: Icon, hint }: {
  label: string; value: string; placeholder?: string; onChange: (v: string) => void;
  icon?: typeof Globe2; hint?: string;
}) {
  return <label className="block min-w-0 space-y-1.5">
    <span className="flex items-center gap-1.5 text-xs font-bold text-[#18354a]">
      {Icon && <Icon size={14} className="text-[#0055ff]"/>} {label}
    </span>
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      maxLength={2048} autoComplete="off"
      className="h-11 w-full rounded-xl bg-slate-100 px-3.5 text-sm text-slate-900 outline-none transition-colors placeholder:text-slate-400 focus:bg-slate-50 focus:ring-2 focus:ring-[#0055ff]/40"/>
    {hint && <span className="block text-[11px] leading-relaxed text-slate-500">{hint}</span>}
  </label>;
}
function Section({ title, subtitle, children }: {title: string; subtitle?: string; children: React.ReactNode}) {
  return <section className="space-y-4 rounded-2xl bg-white p-5 sm:p-6">
    <div><h3 className="text-sm font-extrabold tracking-tight text-[#18354a]">{title}</h3>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-slate-500">{subtitle}</p>}</div>
    {children}
  </section>;
}
function ColorField({ label, value, onChange }: {label: string; value: string; onChange: (value: string) => void}) {
  return <label className="flex items-center gap-2.5 rounded-xl bg-slate-100 p-2.5">
    <input type="color" aria-label={label} value={value} onChange={event => onChange(event.target.value)}
      className="h-9 w-12 cursor-pointer rounded-lg border-0 bg-transparent p-0"/>
    <span className="flex-1 text-xs font-semibold text-slate-700">{label}</span>
    <span className="font-mono text-[11px] uppercase text-slate-500">{value}</span>
  </label>;
}
export default function LinkBioPage({ effectiveUserId }: Props) {
  const { user } = useAuth();
  const ownerId = effectiveUserId || user?.id || "";
  const suggestedSlug = useUserSlug(ownerId);
  const ownerName = findClientAccountById(ownerId)?.nome || "";
  const canEdit = !!user?.id && user.id === ownerId;
  const [config, setConfig] = useState<LinkBioConfig>(() => makeLinkBioDefaults(ownerId));
  const [onAir, setOnAir] = useState<LinkBioOnAir | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const publicUrl = useMemo(() => shortLinkBioUrl(config.slug || ""), [config.slug]);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    setLoading(true);
    void (async () => {
      const [existing, radio] = await Promise.all([
        (supabase as any).from("link_bio_pages").select("*").eq("user_id", ownerId).maybeSingle(),
        supabase.from("empresa_config")
          .select("nome,logo,site,instagram,facebook,youtube").eq("user_id", ownerId).maybeSingle(),
      ]);
      if (!active) return;
      if (existing.error) {
        console.warn("[LinkBio] load failed", existing.error);
        toast.error("Não foi possível carregar o Link Bio. Verifique se o serviço foi atualizado.");
        setLoading(false);
        return;
      }
      const base = makeLinkBioDefaults(ownerId, suggestedSlug || ownerId.replace(/-/g, "").slice(0, 12));
      const company = radio.data || null;
      const initial = {
        ...base,
        station_name: company?.nome || ownerName || "Minha rádio",
        logo_url: company?.logo || "",
        site_url: company?.site?.startsWith("http") ? company.site : "",
        instagram_url: company?.instagram?.startsWith("http") ? company.instagram : "",
        facebook_url: company?.facebook?.startsWith("http") ? company.facebook : "",
        youtube_url: company?.youtube?.startsWith("http") ? company.youtube : "",
        ...(existing.data || {}),
      } as LinkBioConfig;
      setConfig(initial);
      setHasSaved(Boolean(existing.data));
      setLoading(false);
    })();
    return () => { active = false; };
  }, [ownerId]);

  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    const loadOnAir = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { data, error } = await supabase.functions.invoke("public-player-data", {
          body: { slug: ownerId },
        });
        if (active && !error && data) setOnAir(resolveLinkBioOnAir(data));
      } catch (error) { console.warn("[LinkBio] current on-air unavailable", error); }
    };
    void loadOnAir();
    const id = window.setInterval(() => void loadOnAir(), 60_000);
    return () => { active = false; window.clearInterval(id); };
  }, [ownerId]);

  useEffect(() => {
    if (!hasSaved && suggestedSlug && isLinkBioSlug(suggestedSlug)) {
      setConfig(prev => prev.slug && prev.slug !== ownerId.replace(/-/g, "").slice(0, 12)
        ? prev : { ...prev, slug: suggestedSlug });
    }
  }, [suggestedSlug, hasSaved, ownerId]);

  function change(key: EditableKey, value: string) {
    setConfig(prev => ({ ...prev, [key]: value }));
  }
  async function copyLink() {
    if (!hasSaved || !config.published) {
      toast.info("Salve e publique a página antes de copiar o link.");
      return;
    }
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      toast.success("Link Bio copiado!");
      window.setTimeout(() => setCopied(false), 1800);
    } catch { toast.error("Não foi possível copiar automaticamente."); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving || !canEdit) return;
    const slug = config.slug.trim().toLowerCase();
    if (!isLinkBioSlug(slug)) {
      toast.error("O endereço curto deve ter de 3 a 40 letras, números ou hifens.");
      return;
    }
    for (const key of allLinks) {
      const raw = config[key].trim();
      if (!raw) continue;
      if (key === "whatsapp_url" && isPhone(raw)) continue;
      if (!normalizeLinkBioUrl(raw)) {
        toast.error("Verifique a URL de " + key.replace(/_/g, " ") + ". Use https://");
        return;
      }
    }
    setSaving(true);
    try {
      const { error } = await (supabase as any).from("link_bio_pages").upsert({
        ...config,
        slug,
        station_name: config.station_name.trim().slice(0, 120),
        user_id: ownerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
      if (error) throw error;
      setConfig(prev => ({ ...prev, slug }));
      setHasSaved(true);
      toast.success(config.published ? "Link Bio salvo e publicado!" : "Link Bio salvo como rascunho.");
    } catch (error: any) {
      console.error("[LinkBio] save error", error);
      toast.error(error?.code === "23505"
        ? "Esse endereço curto já está sendo usado por outra rádio."
        : "Não foi possível salvar. Verifique as permissões e tente novamente.");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="flex min-h-[320px] items-center justify-center gap-2 text-sm text-slate-600">
    <Loader2 size={21} className="animate-spin"/> Carregando Link Bio...
  </div>;
  const preview = <LinkBioVisual config={config} onAir={onAir} preview/>;
  return <div className="mx-auto w-full max-w-[1500px] pb-8">
    <header className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 sm:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#0055ff]/10 text-[#0055ff]">
          <Link2 size={23}/>
        </div>
        <div><h2 className="text-lg font-extrabold text-[#18354a]">Link Bio</h2>
          <p className="mt-0.5 text-xs text-slate-500">A página de links da rádio para a bio do Instagram.</p></div>
      </div>
      <span className={"rounded-full px-3 py-1.5 text-xs font-semibold " +
        (config.published && hasSaved ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600")}>
        {config.published && hasSaved ? "Publicada" : "Não publicada"}
      </span>
    </header>

    <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(330px,435px)]">
      <form className="space-y-4" onSubmit={event => void save(event)}>
        <Section title="Seu endereço curto" subtitle="Um único link reúne o programa no ar, site, aplicativo e redes sociais.">
          <label className="block space-y-1.5">
            <span className="text-xs font-bold text-[#18354a]">Identificador do link</span>
            <div className="flex flex-wrap gap-2">
              <span className="flex min-h-11 items-center rounded-xl bg-slate-100 px-3 text-xs font-semibold text-slate-500">/b/</span>
              <input value={config.slug}
                onChange={event => setConfig(prev => ({ ...prev, slug: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) }))}
                placeholder="nomedaradio" maxLength={40}
                className="h-11 min-w-[150px] flex-1 rounded-xl bg-slate-100 px-3 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-[#0055ff]/40"/>
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            <input readOnly aria-label="Link curto da rádio" value={publicUrl}
              className="h-11 min-w-[200px] flex-1 truncate rounded-xl bg-slate-100 px-3 text-xs font-semibold text-[#0055ff]"/>
            <button type="button" onClick={() => void copyLink()} disabled={!config.published || !hasSaved}
              className={"flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-bold disabled:opacity-40 " + blue}>
              {copied ? <Check size={16}/> : <Copy size={16}/>} {copied ? "Copiado!" : "Copiar link"}
            </button>
            {config.published && hasSaved && <a href={publicUrl} target="_blank" rel="noopener noreferrer"
              className="flex h-11 items-center gap-2 rounded-xl bg-slate-100 px-4 text-xs font-bold text-slate-700 hover:bg-slate-200">
              <ExternalLink size={15}/> Abrir
            </a>}
          </div>
          <p className="text-[11px] text-slate-500">Exemplo: housemix.nexobrasil.net/b/positivafm</p>
        </Section>

        <Section title="Identidade da rádio" subtitle="O programa, horário, foto e nome do apresentador são preenchidos automaticamente pela grade ao vivo.">
          <FormField label="Nome da emissora" value={config.station_name}
            onChange={v => change("station_name", v)} placeholder="Nome da sua rádio" icon={Radio}/>
          <FormField label="Logo da rádio" value={config.logo_url}
            onChange={v => change("logo_url", v)} placeholder="https://.../logo.png"
            hint="A logo atual da rádio é sugerida automaticamente. Use um PNG transparente para seguir o modelo."
            icon={ImageIcon}/>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <ColorField label="Fundo superior" value={config.background_top}
              onChange={v => setConfig(prev => ({ ...prev, background_top: v }))}/>
            <ColorField label="Fundo inferior" value={config.background_bottom}
              onChange={v => setConfig(prev => ({ ...prev, background_bottom: v }))}/>
            <ColorField label="Botões" value={config.button_color}
              onChange={v => setConfig(prev => ({ ...prev, button_color: v }))}/>
          </div>
        </Section>

        <Section title="Links principais" subtitle="A ordem dos quatro botões segue exatamente o layout de referência.">
          <FormField label="Whats estúdio" value={config.whatsapp_url} onChange={v => change("whatsapp_url", v)}
            placeholder="https://wa.me/5562999999999 ou número com DDI" icon={MessageCircle}/>
          <FormField label="Site" value={config.site_url} onChange={v => change("site_url", v)}
            placeholder="https://www.minharadio.com.br" icon={Globe2}/>
          <FormField label="Localização" value={config.map_url} onChange={v => change("map_url", v)}
            placeholder="https://maps.google.com/..." icon={MapPin}/>
        </Section>

        <Section title="Botão App" subtitle="Ao tocar em App, o visitante escolhe a loja correspondente ao seu celular.">
          <FormField label="Apple App Store" value={config.ios_store_url}
            onChange={v => change("ios_store_url", v)} placeholder="https://apps.apple.com/..."
            icon={Apple}/>
          <FormField label="Google Play (Android)" value={config.android_store_url}
            onChange={v => change("android_store_url", v)} placeholder="https://play.google.com/store/apps/details?id=..."
            icon={Smartphone}/>
        </Section>

        <Section title="Redes sociais" subtitle="Aparecem em uma faixa de ícones abaixo dos botões principais.">
          <FormField label="Instagram" value={config.instagram_url}
            onChange={v => change("instagram_url", v)} placeholder="https://instagram.com/suaradio" icon={Instagram}/>
          <FormField label="Facebook" value={config.facebook_url}
            onChange={v => change("facebook_url", v)} placeholder="https://facebook.com/suaradio" icon={Facebook}/>
          <FormField label="YouTube" value={config.youtube_url}
            onChange={v => change("youtube_url", v)} placeholder="https://youtube.com/@suaradio" icon={Youtube}/>
        </Section>

        <div className="rounded-2xl bg-white p-5 sm:p-6">
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={config.published}
              onChange={e => setConfig(prev => ({ ...prev, published: e.target.checked }))}
              className="mt-1 h-5 w-5 accent-[#0055ff]"/>
            <span><strong className="block text-sm text-[#18354a]">Página publicada</strong>
              <span className="mt-1 block text-xs text-slate-500">
                Desative para guardar como rascunho sem exibir a página ao público.
              </span></span>
          </label>
          {!canEdit && <p className="mt-3 text-xs font-semibold text-amber-800">
            Somente o titular da emissora pode publicar ou alterar esse link.
          </p>}
          <button type="submit" disabled={saving || !canEdit} className={"mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-extrabold disabled:opacity-40 " + blue}>
            {saving ? <Loader2 size={17} className="animate-spin"/> : <Save size={17}/>}
            {saving ? "Salvando..." : config.published ? "Salvar e publicar" : "Salvar rascunho"}
          </button>
        </div>
      </form>
      <aside className="xl:sticky xl:top-2">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div className="flex items-center gap-2">
            <Smartphone size={18} className="text-[#0055ff]"/>
            <span className="text-sm font-extrabold text-[#18354a]">Prévia da página</span>
          </div>
          <span className="text-[11px] font-semibold text-slate-500">Atualizada em tempo real</span>
        </div>
        <div className="mx-auto max-h-[860px] max-w-[435px] overflow-y-auto rounded-[29px] bg-[#260000] ring-4 ring-slate-800/90"
          aria-label="Prévia da página Link Bio">
          {preview}
        </div>
      </aside>
    </div>
  </div>;
}
