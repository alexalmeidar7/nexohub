import { supabase } from "@/integrations/supabase/client";
import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { getStoredMetadata, DEFAULT_AGENCY_CLIENTS } from "@/components/ClientesPage";
import { getSnapshotEmpresa } from "@/lib/supabaseDatabaseSnapshot";
import { normalizeClientKey } from "@/lib/houseMixProgramasService";
import empresaSyncJson from "@/data/empresa_config_sync.json";
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
      const res = await Promise.race([
        supabase.from("empresa_config").select("*").eq("user_id", effectiveId).maybeSingle(),
        new Promise((_, reject) => setTimeout(() => reject("timeout"), 1200))
      ]) as any;
      if (res?.data) data = res.data;
    } catch {}
  }

  if (!data && userId && userId !== effectiveId) {
    try {
      const res = await Promise.race([
        supabase.from("empresa_config").select("*").eq("user_id", userId).maybeSingle(),
        new Promise((_, reject) => setTimeout(() => reject("timeout"), 1200))
      ]) as any;
      if (res?.data) data = res.data;
    } catch {}
  }

  // 1. Check sync database JSON file
  if (!data && (effectiveId || targetSlug)) {
    const syncRow = (effectiveId && (empresaSyncJson as any)[effectiveId]) ||
      (targetSlug && (empresaSyncJson as any)[targetSlug]);
    if (syncRow) {
      data = syncRow;
    }
  }

  // 2. If still not found, check snapshot database
  if (!data && (effectiveId || targetSlug || userEmail)) {
    const snap = getSnapshotEmpresa(effectiveId || targetSlug || userEmail);
    if (snap) {
      data = snap;
    }
  }

  // 3. If still not found, check station database service
  if (!data && (effectiveId || targetSlug || userEmail)) {
    const stationData = await fetchStationDatabaseData(effectiveId || targetSlug || userEmail);
    if (stationData?.empresa) {
      data = stationData.empresa;
    }
  }

  // 4. If still not found, check sync database cache
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
    // Isolamento estrito por tenant para evitar contaminação entre rádios
    const localUserExtra = effectiveId ? JSON.parse(localStorage.getItem(`${EMPRESA_EXTRA_KEY}_${effectiveId}`) || "{}") : {};
    extra = { ...extra, ...localUserExtra };
  } catch {}

  // Buscar metadados do cadastro de clientes
  const storedMeta = getStoredMetadata();
  const searchKey = (effectiveId || acc?.nome || userEmail || "").toUpperCase();
  const isSuperAdmin = acc?.isAdmin || searchKey.includes("ALEX") || searchKey.includes("NEXO") || (userEmail || "").toLowerCase().includes("alex");

  const clientKey = normalizeClientKey(effectiveId || acc?.nome || targetSlug || userEmail || "");
  let metaCandidate: any = (effectiveId && storedMeta[effectiveId]) ||
    (clientKey && DEFAULT_AGENCY_CLIENTS[clientKey]) ||
    (clientKey && storedMeta[clientKey]) ||
    storedMeta[acc?.nome || ""] ||
    {};

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

  // Interativa FM protection: garantir que a razão social NUNCA seja Cultura FM
  let rawRazao = extra.razaoSocial || data?.razao_social || data?.razaoSocial || metaCandidate.razao_social || acc?.razaoSocial || "";
  if (clientKey === "INTERATIVA FM" || searchKey.includes("INTERATIVA")) {
    if (rawRazao.toUpperCase().includes("CULTURA")) {
      rawRazao = "RADIO INTERATIVA FM LTDA";
    }
  }

  // Nome oficial da emissora
  let defaultStationName = isSuperAdmin ? "NEXO SOLUÇÕES VISUAIS" : (acc?.nome || metaCandidate.nome_empresarial || "");
  if (clientKey === "INTERATIVA FM") defaultStationName = "Interativa FM 94.9";
  if (clientKey === "POSITIVA FM") defaultStationName = "Positiva FM 99.1";
  if (clientKey === "CULTURA FM") defaultStationName = "Cultura FM 97.3 FM";
  if (clientKey === "JORNAL FM") defaultStationName = "Jornal FM 96.5";

  const finalNome = (extra.nome || data?.nome || defaultStationName).trim();
  const finalFantasia = (extra.nomeEmpresarial || data?.nome_empresarial || metaCandidate.nome_empresarial || defaultStationName).trim();
  const finalRazao = (rawRazao || finalNome).toUpperCase();

  const finalCnpj = data?.cnpj || extra.cnpj || metaCandidate.cnpj || "";
  const finalCep = data?.cep || extra.cep || metaCandidate.cep || "";
  const finalEndereco = (extra.endereco || data?.endereco || metaCandidate.endereco || "").toUpperCase();
  const finalCidade = (extra.cidade || data?.cidade || metaCandidate.cidade || acc?.cidade || (isSuperAdmin ? "GOIÂNIA" : "")).toUpperCase();
  const finalEstado = (extra.estado || data?.estado || metaCandidate.estado || (isSuperAdmin ? "GO" : "")).toUpperCase();
  const finalTelCom = extra.telefoneComercial || data?.telefone_comercial || data?.telefoneComercial || metaCandidate.telefone || "";
  const finalTelPart = extra.telefoneParticipacao || data?.telefone_participacao || data?.telefoneParticipacao || metaCandidate.whatsapp_responsavel || "";
  const finalContato = (extra.nomeContato || data?.executiva_venda || metaCandidate.nome_contato || (isSuperAdmin ? "ALEX ALMEIDA" : "")).toUpperCase();
  const finalEmail = (extra.emailCobranca || data?.email_cobranca || metaCandidate.email_cobranca || acc?.email || (isSuperAdmin ? "ALEX@NEXOBRASIL.NET" : "")).toUpperCase();
  const finalDesde = extra.clienteDesde || data?.cliente_desde || metaCandidate.cliente_desde || "";

  return {
    nome: finalNome,
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
    logo: extra.logo || data?.logo || defaultLogo,
    backgroundUrl: extra.backgroundUrl || data?.background_url || data?.backgroundUrl || "",
    site: extra.site || data?.site || (isSuperAdmin ? "https://nexobrasil.net" : ""),
    instagram: extra.instagram || data?.instagram || (isSuperAdmin ? "@nexosolucoes" : ""),
    facebook: extra.facebook || data?.facebook || "",
    youtube: extra.youtube || data?.youtube || "",
    instagramSubs: extra.instagramSubs || (data?.instagram_subs != null ? String(data.instagram_subs) : ""),
    facebookSubs: extra.facebookSubs || (data?.facebook_subs != null ? String(data.facebook_subs) : ""),
    youtubeSubs: extra.youtubeSubs || (data?.youtube_subs != null ? String(data.youtube_subs) : ""),
    videoStreamApiUrl: extra.videoStreamApiUrl || data?.video_stream_api_url || data?.videoStreamApiUrl || "",
    plano: extra.plano || data?.plano || acc?.plano || (isSuperAdmin ? "Super Admin" : ""),
    timezone: extra.timezone || data?.timezone || defaultTimezone,
  };
}
