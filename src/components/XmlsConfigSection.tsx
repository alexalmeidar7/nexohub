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
    const houseMixOrigin = typeof window !== "undefined" ? window.location.origin : "https://housemix.nexobrasil.net";
    const permanentUrl = (file: string) => `${houseMixOrigin}/xml/${encodeURIComponent(resolvedSlug)}/${file}`;
    const supabaseFeed = (feed: string, params = "") =>
      `${effectiveSupabaseUrl}/functions/v1/${feed}?user_id=${encodeURIComponent(resolvedUid)}${params}`;

    return [
      {
        label: "XML GERAL",
        kicker: "FEED UNIFICADO",
        url: permanentUrl("geral.xml"),
        supabaseUrl: supabaseFeed("serve-xml-geral", `&slug=${encodeURIComponent(resolvedSlug)}`),
        description: "Feed mestre com patrocinador do programa no ar em rodízio a cada 5 segundos",
      },
      {
        label: "XML TEMPO",
        kicker: "XML",
        url: permanentUrl("tempo.xml"),
        supabaseUrl: supabaseFeed("serve-xml-tempo"),
        description: "Previsão do tempo atual e próximos dias",
      },
      {
        label: "XML ROTEIRO",
        kicker: "XML",
        url: permanentUrl("roteiro.xml"),
        supabaseUrl: supabaseFeed("serve-xml-roteiro-estudio", "&estudio=Estudio%20FM"),
        description: "Roteiro e alinhamento do estúdio no ar",
      },
      {
        label: "XML MUSICA",
        kicker: "XML",
        url: permanentUrl("musica.xml"),
        supabaseUrl: supabaseFeed("serve-xml-broadcast", "&tipo=musica"),
        description: "Música no ar, intérprete, capa e curiosidade",
      },
      {
        label: "XML LOGOS",
        kicker: "XML",
        url: permanentUrl("logos.xml"),
        supabaseUrl: supabaseFeed("serve-xml-logos"),
        description: "Um patrocinador do programa no ar por vez, em rodízio a cada 5 segundos",
      },
      {
        label: "XML BROADCAST",
        kicker: "XML",
        url: permanentUrl("broadcast.xml"),
        supabaseUrl: supabaseFeed("serve-xml-broadcast"),
        description: "Feed mestre com todos os dados do ar (Broadcast)",
      },
      {
        label: "XML BATALHA MUSICAL",
        kicker: "XML",
        url: permanentUrl("batalha.xml"),
        supabaseUrl: supabaseFeed("serve-xml-batalha"),
        description: "Disputa musical, porcentagens e fotos dos artistas",
      },
      {
        label: "XML ENQUETE",
        kicker: "XML",
        url: permanentUrl("enquete.xml"),
        supabaseUrl: supabaseFeed("serve-xml-enquete", `&slug=${encodeURIComponent(resolvedSlug)}`),
        description: "Enquete interativa com respostas e percentuais",
      },
      {
        label: "XML CENÁRIOS ESTÚDIO",
        kicker: "XML",
        url: permanentUrl("cenarios-estudio.xml"),
        supabaseUrl: `${effectiveSupabaseUrl}/functions/v1/serve-xml-cenarios-estudio?uid=${encodeURIComponent(resolvedUid)}`,
        description: "Cenários de estúdio, programa no ar e artes das TVs para integração com vMix",
      },
      {
        label: "XML QUIZ",
        kicker: "XML",
        url: permanentUrl("quiz.xml"),
        supabaseUrl: supabaseFeed("serve-xml-quiz", `&slug=${encodeURIComponent(resolvedSlug)}`),
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
