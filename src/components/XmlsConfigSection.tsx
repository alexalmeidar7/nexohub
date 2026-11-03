import { useMemo } from "react";
import { Radio } from "lucide-react";
import XmlLinkRow from "./XmlLinkRow";
import { useUserSlug } from "@/hooks/useUserSlug";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";

interface XmlsConfigSectionProps {
  targetUid?: string | null;
  user?: any;
}

export default function XmlsConfigSection({ targetUid, user }: XmlsConfigSectionProps) {
  const uid = targetUid || user?.id || "";

  const clientAcc = useMemo(() => {
    return findClientAccountById(uid) || findClientAccountByEmail(user?.email || uid);
  }, [uid, user?.email]);

  const hookSlug = useUserSlug(uid || undefined);
  const resolvedSlug = clientAcc?.slug || hookSlug || uid;
  const resolvedUid = clientAcc?.parentUserId || clientAcc?.id || uid;

  const envSupabase = import.meta.env.VITE_SUPABASE_URL || "";
  
  const effectiveSupabaseUrl = envSupabase || "https://qazvgmgdidjhbvcuinpy.supabase.co";

  const feeds = useMemo(() => {
    const liveUrl = (feed: string, extra = "") => `${effectiveSupabaseUrl}/functions/v1/${feed}?user_id=${encodeURIComponent(resolvedUid)}${extra}`;
    return [
      {
        label: "XML GERAL",
        kicker: "FEED UNIFICADO",
        url: liveUrl("serve-xml-geral", `&slug=${encodeURIComponent(resolvedSlug)}`),
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-geral?user_id=${resolvedUid}&slug=${resolvedSlug}`,
        description: "Feed mestre em tempo real unificando todos os XMLs: No Ar, Música, Tempo, Roteiro, Interatividade e Patrocinadores",
      },
      {
        label: "XML TEMPO",
        kicker: "XML",
        url: `${effectiveSupabaseUrl}/functions/v1/serve-xml-tempo?user_id=${encodeURIComponent(resolvedUid)}`,
        description: "Previsão do tempo atual e próximos dias",
      },
      {
        label: "XML ROTEIRO",
        kicker: "XML",
        // Link direto para o feed dinâmico: evita cópias estáticas antigas no host.
        url: `${effectiveSupabaseUrl}/functions/v1/serve-xml-roteiro-estudio?user_id=${resolvedUid}&estudio=Estudio%20FM`,
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-roteiro-estudio?user_id=${resolvedUid}&estudio=Estudio%20FM`,
        description: "Roteiro e alinhamento do estúdio no ar",
      },
      {
        label: "XML MUSICA",
        kicker: "XML",
        url: liveUrl("serve-xml-broadcast", "&tipo=musica"),
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-broadcast?user_id=${resolvedUid}&tipo=musica`,
        description: "Música no ar, intérprete, capa e curiosidade",
      },
      {
        label: "XML LOGOS",
        kicker: "XML",
        url: liveUrl("serve-xml-logos"),
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-logos?user_id=${resolvedUid}`,
        description: "Logomarcas dos patrocinadores ativos",
      },
      {
        label: "XML BROADCAST",
        kicker: "XML",
        url: liveUrl("serve-xml-broadcast"),
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-broadcast?user_id=${resolvedUid}`,
        description: "Feed mestre com todos os dados do ar (Broadcast)",
      },
      {
        label: "XML BATALHA MUSICAL",
        kicker: "XML",
        url: liveUrl("serve-xml-batalha"),
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-batalha?user_id=${resolvedUid}`,
        description: "Disputa musical, porcentagens e fotos dos artistas",
      },
      {
        label: "XML ENQUETE",
        kicker: "XML",
        url: liveUrl("serve-xml-enquete", `&slug=${encodeURIComponent(resolvedSlug)}`),
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-enquete?user_id=${resolvedUid}&slug=${resolvedSlug}`,
        description: "Enquete interativa com respostas e percentuais",
      },
      {
        label: "XML CENÁRIOS ESTÚDIO",
        kicker: "XML",
        url: `${effectiveSupabaseUrl}/functions/v1/serve-xml-cenarios-estudio?uid=${encodeURIComponent(resolvedUid)}`,
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-cenarios-estudio?uid=${encodeURIComponent(resolvedUid)}`,
        description: "Cenários de estúdio, programa no ar e artes das TVs para integração com vMix",
      },
      {
        label: "XML QUIZ",
        kicker: "XML",
        url: liveUrl("serve-xml-quiz", `&slug=${encodeURIComponent(resolvedSlug)}`),
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-quiz?user_id=${resolvedUid}&slug=${resolvedSlug}`,
        description: "Quiz interativo com alternativas e gabarito",
      },
    ];
  }, [resolvedSlug, resolvedUid, effectiveSupabaseUrl]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3.5 px-4 rounded-2xl bg-blue-50/60 border border-blue-100 text-slate-600">
        <div className="flex items-center gap-2.5 text-xs font-semibold">
          <Radio size={16} className="text-[#0055ff] shrink-0" />
          <span>
            URLs públicas para integração em tempo real com vMix, OBS Studio, geradores de caracteres e sistemas de exibição. Feeds ativos nos dois locais (HouseMix e Supabase).
          </span>
        </div>
        <span className="text-[10px] font-black uppercase tracking-wider text-[#0055ff] bg-white px-2.5 py-1 rounded-full border border-blue-200 shrink-0 self-start sm:self-center">
          {feeds.length} Feeds Disponíveis
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {feeds.map((feed) => (
          <XmlLinkRow
            key={feed.label}
            label={feed.label}
            kicker={feed.kicker}
            permanentUrl={feed.url}
            supabaseUrl={feed.supabaseUrl}
            showUrl={true}
            description={feed.description}
          />
        ))}
      </div>
    </div>
  );
}
