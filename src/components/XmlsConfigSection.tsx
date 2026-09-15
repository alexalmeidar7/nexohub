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
  const resolvedSlug = clientAcc?.slug || hookSlug || "p";
  const resolvedUid = clientAcc?.parentUserId || clientAcc?.id || uid;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "https://zzjfzxxvxbspbdkodoix.supabase.co";

  const feeds = useMemo(() => {
    const baseUrl = "https://housemix.nexobrasil.net/xml";
    return [
      {
        label: "XML GERAL",
        kicker: "FEED UNIFICADO",
        url: `${baseUrl}/${resolvedSlug}/geral.xml`,
        supabaseUrl: `${supabaseUrl}/functions/v1/serve-xml-geral?user_id=${resolvedUid}&slug=${resolvedSlug}`,
        description: "Feed mestre em tempo real unificando todos os XMLs: No Ar, Música, Tempo, Roteiro, Interatividade e Patrocinadores",
      },
      {
        label: "XML TEMPO",
        kicker: "XML",
        url: `${baseUrl}/${resolvedSlug}/tempo.xml`,
        supabaseUrl: `${supabaseUrl}/storage/v1/object/public/xml-files/xml-tempo-${resolvedUid}.xml`,
        description: "Previsão do tempo atual e próximos dias",
      },
      {
        label: "XML ROTEIRO",
        kicker: "XML",
        url: `${baseUrl}/${resolvedSlug}/roteiro.xml`,
        supabaseUrl: `${supabaseUrl}/functions/v1/serve-xml-roteiro-estudio?user_id=${resolvedUid}&estudio=Estudio%20FM`,
        description: "Roteiro e alinhamento do estúdio no ar",
      },
      {
        label: "XML MUSICA",
        kicker: "XML",
        url: `${baseUrl}/${resolvedSlug}/musica.xml`,
        supabaseUrl: `${supabaseUrl}/functions/v1/serve-xml-broadcast?user_id=${resolvedUid}`,
        description: "Música no ar, intérprete, capa e curiosidade",
      },
      {
        label: "XML LOGOS",
        kicker: "XML",
        url: `${baseUrl}/${resolvedSlug}/logos.xml`,
        supabaseUrl: `${supabaseUrl}/functions/v1/serve-xml-logos?user_id=${resolvedUid}`,
        description: "Logomarcas dos patrocinadores ativos",
      },
      {
        label: "XML BROADCAST",
        kicker: "XML",
        url: `${baseUrl}/${resolvedSlug}/broadcast.xml`,
        supabaseUrl: `${supabaseUrl}/functions/v1/serve-xml-broadcast?user_id=${resolvedUid}`,
        description: "Feed mestre com todos os dados do ar (Broadcast)",
      },
      {
        label: "XML BATALHA MUSICAL",
        kicker: "XML",
        url: `${baseUrl}/${resolvedSlug}/batalha.xml`,
        supabaseUrl: `${supabaseUrl}/functions/v1/serve-xml-batalha?user_id=${resolvedUid}`,
        description: "Disputa musical, porcentagens e fotos dos artistas",
      },
      {
        label: "XML ENQUETE",
        kicker: "XML",
        url: `${baseUrl}/${resolvedSlug}/enquete.xml`,
        supabaseUrl: `${supabaseUrl}/functions/v1/serve-xml-enquete?user_id=${resolvedUid}`,
        description: "Enquete interativa com respostas e percentuais",
      },
      {
        label: "XML QUIZ",
        kicker: "XML",
        url: `${baseUrl}/${resolvedSlug}/quiz.xml`,
        supabaseUrl: `${supabaseUrl}/functions/v1/serve-xml-quiz?user_id=${resolvedUid}`,
        description: "Quiz interativo com alternativas e gabarito",
      },
    ];
  }, [resolvedSlug, resolvedUid, supabaseUrl]);

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
