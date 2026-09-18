import { supabase } from "@/integrations/supabase/client";
import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { getStoredMetadata, DEFAULT_AGENCY_CLIENTS } from "@/components/ClientesPage";
import logoNexoSolucoes from "@/assets/logo-nexo-solucoes-visuais.png";
import logoNexo from "@/assets/logo-nexo.png";

export interface EmpresaConfig {
  nome: string;
  nomeEmpresarial?: string;
  cnpj?: string;
  cep?: string;
  endereco: string;
  cidade?: string;
  estado?: string;
  telefoneComercial: string;
  telefoneParticipacao: string;
  nomeContato?: string;
  emailCobranca?: string;
  clienteDesde?: string;
  chavePix?: string;
  tipoChavePix?: string;
  logo: string;
  backgroundUrl: string;
  site: string;
  instagram: string;
  facebook: string;
  youtube: string;
  instagramSubs?: string;
  facebookSubs?: string;
  youtubeSubs?: string;
  videoStreamApiUrl?: string;
  plano: string;
  timezone?: string;
}

export interface EmpresaArquivo {
  id: string;
  nome: string;
  tipo: string;
  url: string;
  tamanho?: string;
  extensao?: string;
  dataCadastro: string;
}

export const EMPRESA_ARQUIVOS_KEY = "nexohub_empresa_arquivos_v1";
export const EMPRESA_EXTRA_KEY = "nexohub_empresa_extra_v1";

export const DEFAULT_EMPRESA_ARQUIVOS: EmpresaArquivo[] = [];

export const formatCnpj = (val: string) => {
  const clean = val.replace(/\D/g, "").slice(0, 14);
  if (clean.length <= 2) return clean;
  if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`;
  if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`;
  if (clean.length <= 12) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8)}`;
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}/${clean.slice(8, 12)}-${clean.slice(12, 14)}`;
};

export const formatCep = (val: string) => {
  const clean = val.replace(/\D/g, "").slice(0, 8);
  if (clean.length <= 5) return clean;
  return `${clean.slice(0, 5)}-${clean.slice(5, 8)}`;
};

export const formatPhone = (val: string) => {
  const clean = val.replace(/\D/g, "").slice(0, 11);
  if (clean.length <= 2) return clean ? `(${clean}` : "";
  if (clean.length <= 6) return `(${clean.slice(0, 2)}) ${clean.slice(2)}`;
  if (clean.length <= 10) return `(${clean.slice(0, 2)}) ${clean.slice(2, 6)}-${clean.slice(6)}`;
  return `(${clean.slice(0, 2)}) ${clean.slice(2, 7)}-${clean.slice(7, 11)}`;
};

export const BRAZIL_TIMEZONES: { value: string; label: string }[] = [
  { value: "America/Noronha", label: "Fernando de Noronha (Brasília +1h / UTC-2)" },
  { value: "America/Sao_Paulo", label: "Brasília — horário oficial (UTC-3)" },
  { value: "America/Belem", label: "Belém / PA (UTC-3)" },
  { value: "America/Fortaleza", label: "Fortaleza / CE (UTC-3)" },
  { value: "America/Recife", label: "Recife / PE (UTC-3)" },
  { value: "America/Araguaina", label: "Araguaína / TO (UTC-3)" },
  { value: "America/Maceio", label: "Maceió / AL (UTC-3)" },
  { value: "America/Bahia", label: "Salvador / BA (UTC-3)" },
  { value: "America/Santarem", label: "Santarém / PA (UTC-3)" },
  { value: "America/Campo_Grande", label: "Campo Grande / MS (Brasília -1h / UTC-4)" },
  { value: "America/Cuiaba", label: "Cuiabá / MT (Brasília -1h / UTC-4)" },
  { value: "America/Manaus", label: "Manaus / AM (Brasília -1h / UTC-4)" },
  { value: "America/Porto_Velho", label: "Porto Velho / RO (Brasília -1h / UTC-4)" },
  { value: "America/Boa_Vista", label: "Boa Vista / RR (Brasília -1h / UTC-4)" },
  { value: "America/Rio_Branco", label: "Rio Branco / AC (Brasília -2h / UTC-5)" },
  { value: "America/Eirunepe", label: "Eirunepé / AM (Brasília -2h / UTC-5)" },
];

export async function getEmpresaConfig(userId?: string, userEmail?: string | null): Promise<EmpresaConfig> {
  const acc = findClientAccountById(userId) || findClientAccountByEmail(userEmail || userId);
  const effectiveId = acc?.parentUserId || acc?.id || userId;
  const targetSlug = acc?.slug || userId;

  let data: any = null;
  if (effectiveId) {
    try {
      const res = await supabase.from("empresa_config").select("*").eq("user_id", effectiveId).maybeSingle();
      if (res.data) data = res.data;
    } catch {}
  }

  if (!data && userId && userId !== effectiveId) {
    try {
      const res = await supabase.from("empresa_config").select("*").eq("user_id", userId).maybeSingle();
      if (res.data) data = res.data;
    } catch {}
  }

  // If still not found, check station database service
  if (!data && (effectiveId || targetSlug || userEmail)) {
    const stationData = await fetchStationDatabaseData(effectiveId || targetSlug || userEmail);
    if (stationData?.empresa) {
      data = stationData.empresa;
    }
  }

  // If still not found, check sync database cache
  if (!data && (effectiveId || targetSlug || userEmail)) {
    const syncDb = getStationDatabaseSync(effectiveId || targetSlug || userEmail);
    if (syncDb?.empresa) {
      data = syncDb.empresa;
    }
  }

  let extra: any = {};
  if (data?.audio_sources && typeof data.audio_sources === "object") {
    extra = data.audio_sources;
  }
  try {
    const localExtra = JSON.parse(localStorage.getItem(EMPRESA_EXTRA_KEY) || "{}");
    const localUserExtra = effectiveId ? JSON.parse(localStorage.getItem(`${EMPRESA_EXTRA_KEY}_${effectiveId}`) || "{}") : {};
    extra = { ...extra, ...localExtra, ...localUserExtra };
  } catch {}

  // Buscar metadados do cadastro de clientes
  const storedMeta = getStoredMetadata();
  const searchKey = (effectiveId || acc?.nome || userEmail || "").toUpperCase();
  const isSuperAdmin = acc?.isAdmin || searchKey.includes("ALEX") || searchKey.includes("NEXO") || (userEmail || "").toLowerCase().includes("alex");
  
  let metaCandidate = storedMeta[effectiveId || ""] || storedMeta[acc?.nome || ""] || storedMeta[searchKey] || {};
  if (isSuperAdmin && (!metaCandidate || Object.keys(metaCandidate).length === 0)) {
    metaCandidate = storedMeta["NEXO BRASIL"] || DEFAULT_AGENCY_CLIENTS["NEXO BRASIL"] || {};
  } else if (!metaCandidate || Object.keys(metaCandidate).length === 0) {
    for (const [k, v] of Object.entries(storedMeta)) {
      if (k.toUpperCase().includes(searchKey) || searchKey.includes(k.toUpperCase())) {
        metaCandidate = v;
        break;
      }
    }
  }

  const defaultTimezone = data?.timezone || acc?.timezone || "America/Sao_Paulo";
  const defaultLogo = isSuperAdmin ? (logoNexoSolucoes || logoNexo) : (data?.logo || "");

  const finalCnpj = data?.cnpj || extra.cnpj || metaCandidate.cnpj || "";
  const finalRazao = (data?.nome || extra.nome || metaCandidate.razao_social || acc?.razaoSocial || acc?.nome || (isSuperAdmin ? "NEXO SOLUÇÕES VISUAIS" : "")).toUpperCase();
  const finalFantasia = (extra.nomeEmpresarial || metaCandidate.nome_empresarial || acc?.nome || finalRazao).toUpperCase();
  const finalCep = data?.cep || extra.cep || metaCandidate.cep || "";
  const finalEndereco = (data?.endereco || extra.endereco || metaCandidate.endereco || "").toUpperCase();
  const finalCidade = (extra.cidade || metaCandidate.cidade || acc?.cidade || (isSuperAdmin ? "GOIÂNIA" : "")).toUpperCase();
  const finalEstado = (extra.estado || metaCandidate.estado || (isSuperAdmin ? "GO" : "")).toUpperCase();
  const finalTelCom = data?.telefone_comercial || extra.telefoneComercial || metaCandidate.telefone || "";
  const finalTelPart = data?.telefone_participacao || extra.telefoneParticipacao || metaCandidate.whatsapp_responsavel || "";
  const finalContato = (extra.nomeContato || metaCandidate.nome_contato || (isSuperAdmin ? "ALEX ALMEIDA" : data?.executiva_venda || "")).toUpperCase();
  const finalEmail = (extra.emailCobranca || metaCandidate.email_cobranca || acc?.email || (isSuperAdmin ? "ALEX@NEXOBRASIL.NET" : "")).toUpperCase();
  const finalDesde = data?.cliente_desde || extra.clienteDesde || metaCandidate.cliente_desde || "";

  return {
    nome: finalRazao,
    nomeEmpresarial: finalFantasia,
    cnpj: finalCnpj,
    cep: finalCep,
    endereco: finalEndereco,
    cidade: finalCidade,
    estado: finalEstado,
    telefoneComercial: finalTelCom,
    telefoneParticipacao: finalTelPart,
    nomeContato: finalContato,
    emailCobranca: finalEmail,
    clienteDesde: finalDesde,
    chavePix: (extra.chavePix || finalCnpj || "").toUpperCase(),
    tipoChavePix: extra.tipoChavePix || "CNPJ",
    logo: data?.logo || extra.logo || defaultLogo,
    backgroundUrl: data?.background_url || extra.backgroundUrl || "",
    site: data?.site || extra.site || (isSuperAdmin ? "https://nexobrasil.net" : ""),
    instagram: data?.instagram || extra.instagram || (isSuperAdmin ? "@nexosolucoes" : ""),
    facebook: data?.facebook || extra.facebook || "",
    youtube: data?.youtube || extra.youtube || "",
    instagramSubs: data?.instagram_subs != null ? String(data.instagram_subs) : (extra.instagramSubs || ""),
    facebookSubs: data?.facebook_subs != null ? String(data.facebook_subs) : (extra.facebookSubs || ""),
    youtubeSubs: data?.youtube_subs != null ? String(data.youtube_subs) : (extra.youtubeSubs || ""),
    videoStreamApiUrl: data?.video_stream_api_url || extra.videoStreamApiUrl || "",
    plano: data?.plano || acc?.plano || (isSuperAdmin ? "Super Admin" : ""),
    timezone: defaultTimezone,
  };
}
