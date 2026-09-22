import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import DOMPurify from "dompurify";
import { useParams, Navigate } from "react-router-dom";
import { usePageTitle, applyPublicHead, usePublicHead } from "@/hooks/usePageTitle";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { getEmpresaConfig, type EmpresaConfig } from "@/lib/empresaConfigService";
import { findCurrentProgram } from "@/components/OnAirWidget";
import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { getSnapshotTable } from "@/lib/supabaseDatabaseSnapshot";
import { resolvePresenterForProgram, resolveSafePresenterPhoto } from "@/lib/onAirPresenterResolver";
import { ChevronLeft, ChevronRight, Clock, Radio, Globe, Instagram, Youtube, Phone, MessageCircle, Play, Pause, Facebook, X, Maximize, Minimize, Calendar, ImageIcon, Gift, Pizza, Truck, Star, Trophy, Music, Heart, Sparkles, Beer, ShoppingBag, Ticket, Megaphone, PartyPopper, Plus, Minus, Headphones, MonitorPlay, Users, MessageSquareQuote } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import PromoSkeleton from "@/components/skeletons/PromoSkeleton";
import { getApresentadores } from "@/components/ApresentadorForm";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, Legend } from "recharts";
import { useLayoutColors } from "@/hooks/useLayoutColors";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import { type TelaPromoConfig, defaultTelaPromoConfig, buildTelaPromoBgStyle } from "@/components/ConfigTelaPromoPage";
import PromoInfoBoxes from "@/components/promo/PromoInfoBoxes";
import { findClientAccountByEmail, findClientAccountById, POSITIVA_TESTEMUNHAIS_IDS, isPositivaStationAccount } from "@/lib/clientAuthAccounts";
import { DEFAULT_STATION_PARTICIPANTES } from "@/lib/stationParticipantesData";

export const POSITIVA_USER_ID = "d17e65af-e407-466f-9b60-b55c43399513";


interface Promocao {
  id: string;
  imagem_url: string;
  botao_url: string;
  texto: string;
  oferecimento: string;
  data_inicio: string;
  data_fim: string;
  nome?: string;
  botao_icone_url?: string;
}

interface ProgramaGrade {
  id: string;
  mergedIds: string[];
  nome: string;
  apresentadorId: string;
  apresentadoresIds: string[];
  selo: string;
  capa: string;
  thumb?: string;
  diasSemana: string[];
  horarioInicio: string;
  horarioFim: string;
  descricao: string;
  schedules: { dias: string[]; horarioInicio: string; horarioFim: string }[];
}

interface Testemunhal {
  id: string;
  programa_id: string | null;
  programa_ids?: string[] | null;
  texto: string;
  data_inicio: string;
  data_fim: string;
  imagem_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const PROGRAMAS_VISIVEIS = [
  "SERTANEJO BOM DEMAIS - 2",
  "PRIMEIRA HORA",
  "BOM DIA POSITIVA",
  "FLASHBACK POSITIVA",
  "WHATSAPP POSITIVA",
  "VALE NIGHT",
  "PALCO POSITIVA",
];

const REMOVED_PROGRAM_COVER_PATH = "/programas/d17e65af-e407-466f-9b60-b55c43399513/d40fca1b-5f5a-4588-8d4a-35323fe88b9f_capa.webp";

export function resolveSafePromoBanner(p: any): string {
  const norm = `${p?.nome || ""} ${p?.botao_url || ""} ${p?.imagem_url || ""}`.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (norm.includes("premio") || norm.includes("que premio")) return "/promocoes/que-premio-e-esse.png";
  if (norm.includes("role")) return "/promocoes/role-positiva.png";
  if (norm.includes("parada") || norm.includes("estrada")) return "/promocoes/parada-positiva.png";
  if (norm.includes("burger") || norm.includes("burguer")) return "/promocoes/super-burguer.png";
  if (norm.includes("resenha")) return "/promocoes/resenha.png";
  if (norm.includes("caldas")) return "/promocoes/partiu-caldas.png";
  if (norm.includes("peguei")) return "/promocoes/te-peguei-positiva.png";
  if (norm.includes("pix")) return "/promocoes/meu-pix-positiva.png";
  if (norm.includes("encontro")) return "/promocoes/encontro-marcado.png";
  if (norm.includes("luan") || norm.includes("historico")) return "/promocoes/luan-santana.png";
  if (norm.includes("cabare")) return "/promocoes/cabare.png";
  if (norm.includes("movimento")) return "/promocoes/movimento.png";

  if (p?.imagem_url) {
    return p.imagem_url;
  }
  return "/promocoes/que-premio-e-esse.png";
}

export function resolveSafePromoButton(p: any): string {
  const norm = `${p?.nome || ""} ${p?.botao_url || ""}`.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  if (norm.includes("premio") || norm.includes("que premio")) return "/promocoes/bts/que-premio-e-esse.png";
  if (norm.includes("role")) return "/promocoes/bts/role-positiva.png";
  if (norm.includes("parada") || norm.includes("estrada")) return "/promocoes/bts/parada-positiva.png";
  if (norm.includes("burger") || norm.includes("burguer")) return "/promocoes/bts/super-burguer.png";
  if (norm.includes("resenha")) return "/promocoes/bts/resenha.png";
  if (norm.includes("caldas")) return "/promocoes/partiu-caldas.png";
  if (norm.includes("peguei")) return "/promocoes/te-peguei-positiva.png";
  if (norm.includes("pix")) return "/promocoes/bts/meu-pix-positiva.png";
  if (norm.includes("encontro")) return "/promocoes/bts/encontro-marcado.png";
  if (norm.includes("luan") || norm.includes("historico")) return "/promocoes/bts/luan-santana.png";
  return "";
}

// Retorna apenas imagens realmente cadastradas (URL ou caminho).
// Nunca inventa arte por nome de programa: isso causava vazamento visual
// entre contas (ex.: capa "flashback" da Positiva aparecendo na Interativa).
const isRealImageRef = (value?: string): boolean => {
  const v = (value || "").trim();
  if (!v) return false;
  return v.startsWith("http") || v.startsWith("data:") || v.startsWith("/");
};

export function resolveSafeProgramCover(nameOrCover?: string): string {
  return isRealImageRef(nameOrCover) ? (nameOrCover as string).trim() : "";
}

export function resolveSafeProgramSelo(nameOrSelo?: string): string {
  return isRealImageRef(nameOrSelo) ? (nameOrSelo as string).trim() : "";
}

export { resolveSafePresenterPhoto };

const DEFAULT_POSITIVA_CONFIG: EmpresaConfig = {
  nome: "Positiva FM 99.1",
  logo: "/logos/positiva.png",
  backgroundUrl: "",
  endereco: "Goiânia - GO",
  telefoneComercial: "62 3942-9900",
  telefoneParticipacao: "62 3942-9910",
  site: "positivafm.com.br",
  instagram: "@positivafmoficial",
  facebook: "positivafm",
  youtube: "positivafm",
  plano: "House Mix Nexo Max",
};

const DEFAULT_POSITIVA_APRESENTADORES = [
  { id: "5889d956-ed6a-4089-846e-159eb54bc474", nome: "Jonathas Mattos", cargo: "Locutor", instagram: "@jonathasmattoslocutor", foto: "/locutores/jonathas.png", background_url: "", ativo: true },
  { id: "9d64c3c7-d45c-4cf5-b941-333e7eed8c85", nome: "Vanessa Reis", cargo: "Locutora", instagram: "@vanessareis.oficial", foto: "/locutores/vanessa-reis.png", background_url: "", ativo: true },
  { id: "90ca4858-935e-4b87-a83a-224263fd269d", nome: "Reginaldo Lucena", cargo: "Locutor", instagram: "@_reginaldolucena", foto: "/locutores/reginaldo.png", background_url: "", ativo: true },
  { id: "f3601b21-fd66-4795-9021-4d91992e3b6e", nome: "Márcio Rodrigues", cargo: "Locutor", instagram: "@marciorodrigues", foto: "/locutores/marcio.png", background_url: "", ativo: true },
  { id: "04205a8e-cdca-409d-a879-ad21a61dcefa", nome: "Alysson Lima", cargo: "Jornalista / Locutor", instagram: "@alyssonlima", foto: "/locutores/alysson.png", background_url: "", ativo: true },
  { id: "7a8dbf72-88de-4bf9-a0ba-1a024a2297f7", nome: "Douglas Reis", cargo: "Locutor", instagram: "@douglas.dos.reis", foto: "/locutores/douglas.png", background_url: "", ativo: true },
  { id: "21a0ba74-8724-4b58-b8be-09b055bdbfa6", nome: "Fernando", cargo: "Locutor", instagram: "", foto: "/locutores/fernando.png", background_url: "", ativo: true },
];

const DEFAULT_POSITIVA_PROGRAMAS: ProgramaGrade[] = [
  {
    id: "b75801f1-b88a-4a6f-abb6-c5ccfaf42d08",
    mergedIds: ["b75801f1-b88a-4a6f-abb6-c5ccfaf42d08"],
    nome: "Sertanejo bom demais - 1ª Edição",
    apresentadorId: "90ca4858-935e-4b87-a83a-224263fd269d",
    apresentadoresIds: ["90ca4858-935e-4b87-a83a-224263fd269d"],
    horarioInicio: "04:00:00",
    horarioFim: "07:24:00",
    diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
    descricao: "Domine o pico da manhã com a credibilidade de Reginaldo Lucena.",
    capa: "/programas/sbd1.png",
    selo: "/selos/sbd1.png",
    thumb: "/programas/sbd1.png",
    schedules: [{ dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"], horarioInicio: "04:00:00", horarioFim: "07:24:00" }],
  },
  {
    id: "b75801f1-b88a-4a6f-abb6-c5ccfaf42d08-sab",
    mergedIds: ["b75801f1-b88a-4a6f-abb6-c5ccfaf42d08"],
    nome: "Sertanejo bom demais - 1ª Edição - Sábado",
    apresentadorId: "90ca4858-935e-4b87-a83a-224263fd269d",
    apresentadoresIds: ["90ca4858-935e-4b87-a83a-224263fd269d"],
    horarioInicio: "05:00:00",
    horarioFim: "07:24:00",
    diasSemana: ["Sábado"],
    descricao: "Edição de sábado do Sertanejo Bom Demais com Reginaldo Lucena.",
    capa: "/programas/sbd1.png",
    selo: "/selos/sbd1.png",
    thumb: "/programas/sbd1.png",
    schedules: [{ dias: ["Sábado"], horarioInicio: "05:00:00", horarioFim: "07:24:00" }],
  },
  {
    id: "fbd7e740-99f5-4d2d-bd86-4f7534de44a0",
    mergedIds: ["fbd7e740-99f5-4d2d-bd86-4f7534de44a0"],
    nome: "Primeira Hora Positiva",
    apresentadorId: "04205a8e-cdca-409d-a879-ad21a61dcefa",
    apresentadoresIds: ["04205a8e-cdca-409d-a879-ad21a61dcefa"],
    horarioInicio: "07:24:00",
    horarioFim: "08:30:00",
    diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
    descricao: "O primeiro jornal do dia com as principais notícias com Alysson Lima.",
    capa: "/programas/primeira-hora.png",
    selo: "/selos/primeira-hora.png",
    thumb: "/programas/primeira-hora.png",
    schedules: [{ dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"], horarioInicio: "07:24:00", horarioFim: "08:30:00" }],
  },
  {
    id: "5f58a3d1-5b00-4ab5-8252-69c347ac9a74",
    mergedIds: ["5f58a3d1-5b00-4ab5-8252-69c347ac9a74"],
    nome: "Bom dia Positiva",
    apresentadorId: "f3601b21-fd66-4795-9021-4d91992e3b6e",
    apresentadoresIds: ["f3601b21-fd66-4795-9021-4d91992e3b6e"],
    horarioInicio: "08:30:00",
    horarioFim: "12:00:00",
    diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
    descricao: "A voz que domina um dos melhores horários comerciais do rádio com Márcio Rodrigues.",
    capa: "/programas/bom-dia.png",
    selo: "/selos/bom-dia.png",
    thumb: "/programas/bom-dia.png",
    schedules: [{ dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"], horarioInicio: "08:30:00", horarioFim: "12:00:00" }],
  },
  {
    id: "6ce84778-447b-4554-8384-bbdbd7a9ec3c",
    mergedIds: ["6ce84778-447b-4554-8384-bbdbd7a9ec3c"],
    nome: "Flashback Positiva",
    apresentadorId: "5889d956-ed6a-4089-846e-159eb54bc474",
    apresentadoresIds: ["5889d956-ed6a-4089-846e-159eb54bc474"],
    horarioInicio: "12:00:00",
    horarioFim: "13:00:00",
    diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
    descricao: "Os grandes clássicos que marcaram época com Jonathas Mattos.",
    capa: "/programas/flashback.png",
    selo: "/selos/flashback.png",
    thumb: "/programas/flashback.png",
    schedules: [{ dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"], horarioInicio: "12:00:00", horarioFim: "13:00:00" }],
  },
  {
    id: "1ea3c48c-02f2-4957-9efd-fa960c64504d",
    mergedIds: ["1ea3c48c-02f2-4957-9efd-fa960c64504d"],
    nome: "Whatsapp Positiva",
    apresentadorId: "5889d956-ed6a-4089-846e-159eb54bc474",
    apresentadoresIds: ["5889d956-ed6a-4089-846e-159eb54bc474"],
    horarioInicio: "13:00:00",
    horarioFim: "16:00:00",
    diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
    descricao: "Participação dos ouvintes pelo WhatsApp com Jonathas Mattos.",
    capa: "/programas/whatsapp.png",
    selo: "/selos/whatsapp.png",
    thumb: "/programas/whatsapp.png",
    schedules: [{ dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"], horarioInicio: "13:00:00", horarioFim: "16:00:00" }],
  },
  {
    id: "1ea3c48c-02f2-4957-9efd-fa960c64504d-sab",
    mergedIds: ["1ea3c48c-02f2-4957-9efd-fa960c64504d"],
    nome: "Whatsapp Positiva - Sábado",
    apresentadorId: "9d64c3c7-d45c-4cf5-b941-333e7eed8c85",
    apresentadoresIds: ["9d64c3c7-d45c-4cf5-b941-333e7eed8c85"],
    horarioInicio: "14:00:00",
    horarioFim: "16:00:00",
    diasSemana: ["Sábado"],
    descricao: "Edição de sábado do WhatsApp Positiva com Vanessa Reis.",
    capa: "/programas/whatsapp.png",
    selo: "/selos/whatsapp.png",
    thumb: "/programas/whatsapp.png",
    schedules: [{ dias: ["Sábado"], horarioInicio: "14:00:00", horarioFim: "16:00:00" }],
  },
  {
    id: "c7e6d5fe-76c7-415f-9d42-6ad8b70af0c2",
    mergedIds: ["c7e6d5fe-76c7-415f-9d42-6ad8b70af0c2"],
    nome: "Sertanejo bom demais - 2ª Edição",
    apresentadorId: "9d64c3c7-d45c-4cf5-b941-333e7eed8c85",
    apresentadoresIds: ["9d64c3c7-d45c-4cf5-b941-333e7eed8c85"],
    horarioInicio: "16:00:00",
    horarioFim: "19:00:00",
    diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
    descricao: "Segunda edição do Sertanejo Bom Demais com Vanessa Reis.",
    capa: "/programas/sbd2.png",
    selo: "/selos/sbd2.png",
    thumb: "/programas/sbd2.png",
    schedules: [{ dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"], horarioInicio: "16:00:00", horarioFim: "19:00:00" }],
  },
  {
    id: "e6cea94b-4bc5-4f95-a8f2-d9f6e9fae44a",
    mergedIds: ["e6cea94b-4bc5-4f95-a8f2-d9f6e9fae44a"],
    nome: "Vale Night",
    apresentadorId: "5889d956-ed6a-4089-846e-159eb54bc474",
    apresentadoresIds: ["5889d956-ed6a-4089-846e-159eb54bc474"],
    horarioInicio: "19:00:00",
    horarioFim: "22:00:00",
    diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
    descricao: "A melhor seleção musical para a sua noite com Jonathas Mattos.",
    capa: "/programas/vale-night.png",
    selo: "/selos/vale-night.png",
    thumb: "/programas/vale-night.png",
    schedules: [{ dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"], horarioInicio: "19:00:00", horarioFim: "22:00:00" }],
  },
  {
    id: "b75801f1-b88a-4a6f-abb6-c5ccfaf42d08-palco",
    mergedIds: ["b75801f1-b88a-4a6f-abb6-c5ccfaf42d08"],
    nome: "Palco Positiva",
    apresentadorId: "5889d956-ed6a-4089-846e-159eb54bc474",
    apresentadoresIds: ["5889d956-ed6a-4089-846e-159eb54bc474"],
    horarioInicio: "19:00:00",
    horarioFim: "23:59:00",
    diasSemana: ["Sábado", "Domingo"],
    descricao: "Shows ao vivo e as melhores apresentações com Jonathas Mattos.",
    capa: "/programas/palco-positiva.png",
    selo: "/selos/palco-positiva.png",
    thumb: "/programas/palco-positiva.png",
    schedules: [{ dias: ["Sábado", "Domingo"], horarioInicio: "19:00:00", horarioFim: "23:59:00" }],
  },
  {
    id: "energia-positiva-id",
    mergedIds: ["energia-positiva-id"],
    nome: "Energia Positiva",
    apresentadorId: "04205a8e-cdca-409d-a879-ad21a61dcefa",
    apresentadoresIds: ["04205a8e-cdca-409d-a879-ad21a61dcefa"],
    horarioInicio: "22:00:00",
    horarioFim: "23:59:59",
    diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
    descricao: "Muita música e energia para encerrar o seu dia.",
    capa: "/programas/energia-positiva.png",
    selo: "/selos/energia-positiva.png",
    thumb: "/programas/energia-positiva.png",
    schedules: [{ dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"], horarioInicio: "22:00:00", horarioFim: "23:59:59" }],
  },
  {
    id: "modao-positiva-id",
    mergedIds: ["modao-positiva-id"],
    nome: "Modão Positiva",
    apresentadorId: "90ca4858-935e-4b87-a83a-224263fd269d",
    apresentadoresIds: ["90ca4858-935e-4b87-a83a-224263fd269d"],
    horarioInicio: "06:00:00",
    horarioFim: "09:00:00",
    diasSemana: ["Domingo"],
    descricao: "O melhor da música sertaneja raiz com Reginaldo Lucena.",
    capa: "/programas/modao.png",
    selo: "/selos/modao.png",
    thumb: "/programas/modao.png",
    schedules: [{ dias: ["Domingo"], horarioInicio: "06:00:00", horarioFim: "09:00:00" }],
  },
  {
    id: "domingao-positiva-id",
    mergedIds: ["domingao-positiva-id"],
    nome: "Domingão Positiva",
    apresentadorId: "5889d956-ed6a-4089-846e-159eb54bc474",
    apresentadoresIds: ["5889d956-ed6a-4089-846e-159eb54bc474"],
    horarioInicio: "09:00:00",
    horarioFim: "14:00:00",
    diasSemana: ["Domingo"],
    descricao: "A melhor trilha sonora para o seu almoço de domingo.",
    capa: "/programas/domingao.png",
    selo: "/selos/domingao.png",
    thumb: "/programas/domingao.png",
    schedules: [{ dias: ["Domingo"], horarioInicio: "09:00:00", horarioFim: "14:00:00" }],
  },
  {
    id: "madrugada-positiva-id",
    mergedIds: ["madrugada-positiva-id"],
    nome: "Madrugada Positiva",
    apresentadorId: "",
    apresentadoresIds: [],
    horarioInicio: "00:00:00",
    horarioFim: "04:00:00",
    diasSemana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
    descricao: "Música e companhia na madrugada da Positiva FM.",
    capa: "/programas/madrugada.png",
    selo: "/selos/madrugada.png",
    thumb: "/programas/madrugada.png",
    schedules: [{ dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"], horarioInicio: "00:00:00", horarioFim: "04:00:00" }],
  },
];

function renderBoldMarkdown(text: string) {
  const parts = text.split(/\*([^*]+)\*/g);
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

function colorMix(color: string, amount: number, fallback: string) {
  return `color-mix(in srgb, ${color || fallback} ${amount}%, transparent)`;
}

function getBannerImageKey(imageUrl: string) {
  const value = imageUrl.trim();
  if (!value) return "";
  if (value.startsWith("data:")) return value;

  try {
    const url = new URL(value, window.location.origin);
    url.hash = "";
    url.search = "";
    return url.href.toLowerCase();
  } catch {
    return value.split("#")[0].split("?")[0].toLowerCase();
  }
}

function getUniqueBanners(promocoes: Promocao[]) {
  const uniqueBanners = new Map<string, Promocao>();

  for (const promocao of promocoes) {
    if (!promocao.imagem_url) continue;
    const imageKey = getBannerImageKey(promocao.imagem_url);
    if (imageKey && !uniqueBanners.has(imageKey)) {
      uniqueBanners.set(imageKey, promocao);
    }
  }

  return Array.from(uniqueBanners.values());
}

export default function PromocoesKiosk() {
  const { user } = useAuth();
  const { userSlug } = useParams<{ userSlug?: string }>();
  const validSlug = userSlug && userSlug !== ":userSlug" ? userSlug : undefined;
  const isPublicMode = !!validSlug;
  // In public mode we don't want the auth user's empresa name leaking into
  // the title, so pass empty and override via effect below using config.nome.
  usePageTitle(isPublicMode ? "" : "Promoções");
  usePublicHead(isPublicMode ? validSlug : null, "Promoções");
  useLayoutColors();

  const [loading, setLoading] = useState(true);
  const [promocoes, setPromocoes] = useState<Promocao[]>([]);
  const [config, setConfig] = useState<EmpresaConfig>({} as EmpresaConfig);
  const [programas, setProgramas] = useState<ProgramaGrade[]>([]);
  const [testemunhais, setTestemunhais] = useState<Testemunhal[]>([]);
  const [onAirProgram, setOnAirProgram] = useState<{ nome: string; horarioInicio: string; horarioFim: string; progress: number; apresentadorId: string; diasSemana?: string[] } | null>(null);
  const [apresentadores, setApresentadores] = useState<any[]>([]);
  const [currentBannerIndex, setCurrentBannerIndex] = useState(0);
  const [selectedPromo, setSelectedPromo] = useState<Promocao | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<ProgramaGrade | null>(null);
  const [programasSectionOpen, setProgramasSectionOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [telaPromoConfig, setTelaPromoConfig] = useState<TelaPromoConfig>(defaultTelaPromoConfig);
  const [coverIndex, setCoverIndex] = useState<number | null>(null);
  const [coverSlideDir, setCoverSlideDir] = useState<"left" | "right">("right");
  const [audienceUserId, setAudienceUserId] = useState<string | null>(null);
  const [weatherInfo, setWeatherInfo] = useState<{ city: string | null; lat: number | null; lon: number | null }>({ city: null, lat: null, lon: null });
  const [streamCfg, setStreamCfg] = useState<{ audioUrl: string; audioXpath: string; videoUrl: string; videoXpath: string }>({ audioUrl: "", audioXpath: "", videoUrl: "", videoXpath: "" });
  const [audioCount, setAudioCount] = useState<number | null>(null);
  const [videoCount, setVideoCount] = useState<number | null>(null);
  const peakStorageKey = `promo-peak-audience:${userSlug || "self"}`;
  const [peakAudience, setPeakAudience] = useState<{ total: number; programa: string; locutor: string; timestamp: string; date: string } | null>(() => {
    try {
      const raw = localStorage.getItem(peakStorageKey);
      if (!raw) return null;
      const p = JSON.parse(raw);
      const today = new Date().toISOString().split("T")[0];
      return p?.date === today ? p : null;
    } catch { return null; }
  });
  const [audienceDetailsOpen, setAudienceDetailsOpen] = useState(false);
  const [audienceChart, setAudienceChart] = useState<Array<{ hora: string; audio: number; video: number; total: number; programa: string }>>([]);
  const [audienceChartLoading, setAudienceChartLoading] = useState(false);

  const isPositivaUser = useMemo(() => {
    // 1. URL slug (ex.: /positivafm/locutor ou /positiva/locutor)
    const slug = (userSlug || "").toLowerCase();
    if (slug.includes("positiva")) return true;

    // 2. Nome da emissora no config (ex.: "Positiva FM 99.1")
    const empNome = (config?.nome || "").toLowerCase();
    if (empNome.includes("positiva")) return true;

    // 3. ID da emissora/usuário Positiva FM
    if (audienceUserId === "d17e65af-e407-466f-9b60-b55c43399513") return true;

    // 4. Usuário autenticado
    const authEmail = (user?.email || "").toLowerCase();
    if (authEmail.includes("positiva")) return true;
    if (user?.id === "d17e65af-e407-466f-9b60-b55c43399513") return true;

    // 5. Fallback storage de sessão
    try {
      const backup = JSON.parse(localStorage.getItem("nexohub_backup_session") || "{}");
      const email = (backup?.user?.email || "").toLowerCase();
      if (email.includes("positiva")) return true;
      if (backup?.user?.id === "d17e65af-e407-466f-9b60-b55c43399513") return true;
    } catch {}

    return false;
  }, [userSlug, config?.nome, audienceUserId, user?.email, user?.id]);

  useEffect(() => {
    if (!audienceDetailsOpen || !audienceUserId) return;
    let cancelled = false;
    (async () => {
      setAudienceChartLoading(true);
      const since = new Date();
      since.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("audiencia_historico")
        .select("programa, audio, video, created_at")
        .eq("user_id", audienceUserId as any)
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: true });
      if (cancelled) return;
      const rows = (data || []).map((r: any) => {
        const d = new Date(r.created_at);
        return {
          hora: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
          audio: Number(r.audio) || 0,
          video: Number(r.video) || 0,
          total: (Number(r.audio) || 0) + (Number(r.video) || 0),
          programa: r.programa || "",
        };
      });
      setAudienceChart(rows);
      setAudienceChartLoading(false);
    })();
    return () => { cancelled = true; };
  }, [audienceDetailsOpen, audienceUserId]);

  // Shared persistent settings
  const getStoredNumber = (key: string, fallback: number, min: number, max: number) => {
    const raw = localStorage.getItem(key);
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
  };

  const [fontSize, setFontSize] = useState(() => getStoredNumber("kiosk-font-size", 24, 12, 56));
  const [scrollSpeed, setScrollSpeed] = useState(() => getStoredNumber("promo-scroll-speed", 35, 1, 100));
  const [autoPlay, setAutoPlay] = useState(() => localStorage.getItem("kiosk-auto-play") === "true");

  const scrollRef = useRef<HTMLDivElement>(null);
  const promoScrollRef = useRef<HTMLDivElement>(null);
  const modalScrollRef = useRef<HTMLDivElement>(null);
  const programModalScrollRef = useRef<HTMLDivElement>(null);
  const autoScrollFrameRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const [autoScrolling, setAutoScrolling] = useState(false);
  const [activeScrollTarget, setActiveScrollTarget] = useState<"promo" | "program">("promo");
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollSpeedRef = useRef(scrollSpeed);
  scrollSpeedRef.current = scrollSpeed;
  const bannerTimerRef = useRef(0);
  const [bannerProgress, setBannerProgress] = useState(0);
  const promoAccentGradient = `linear-gradient(135deg, ${telaPromoConfig.btn_color_a} 0%, ${telaPromoConfig.btn_color_b} 100%)`;
  const promoAccentGradientReverse = `linear-gradient(270deg, ${telaPromoConfig.btn_color_b} 0%, ${telaPromoConfig.btn_color_a} 100%)`;
  const promoDarkGradient = `linear-gradient(135deg, ${telaPromoConfig.btn_color_a} 0%, color-mix(in srgb, ${telaPromoConfig.btn_color_b} 35%, black) 100%)`;
  const promoThemeVars = {
    "--promo-btn-a": telaPromoConfig.btn_color_a,
    "--promo-btn-b": telaPromoConfig.btn_color_b,
    "--promo-text": telaPromoConfig.btn_text_color,
    "--promo-border": telaPromoConfig.card_border_color,
    "--promo-header": telaPromoConfig.header_text_color,
  } as React.CSSProperties;

  // Persist font size
  useEffect(() => {
    localStorage.setItem("kiosk-font-size", String(fontSize));
  }, [fontSize]);

  // Persist scroll speed
  useEffect(() => {
    localStorage.setItem("promo-scroll-speed", String(scrollSpeed));
  }, [scrollSpeed]);

  // Persist auto-play
  useEffect(() => {
    localStorage.setItem("kiosk-auto-play", String(autoPlay));
  }, [autoPlay]);

  // Fullscreen toggle
  const toggleFullscreen = async () => {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  // Public-mode title + favicon: refine using the empresa data fully loaded
  // for this page (usePublicHead already ran a slug-based pass on mount).
  useEffect(() => {
    if (!isPublicMode) return;
    const nome = (config?.nome || "")
      .replace(/\s*[-–—]\s*promoç(ões|ao|ão)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
    applyPublicHead(nome || null, config?.logo || null, "Promoções");
  }, [isPublicMode, config?.nome, config?.logo]);



  useEffect(() => {
    const isPositivaStation = !validSlug || validSlug === "positivafm" || validSlug === "positiva";

    const loadPublic = async () => {
      let data: any = null;
      if (validSlug) {
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000));
          const supaPromise = supabase.functions.invoke("public-promo-data", { body: { slug: validSlug } });
          const res: any = await Promise.race([supaPromise, timeoutPromise]).catch(() => null);
          if (res?.data && !res.error) data = res.data;
        } catch {}
      }

      const syncDb = validSlug ? getStationDatabaseSync(validSlug) : null;

      const empresa = data?.empresa || (isPositivaStation ? DEFAULT_POSITIVA_CONFIG : (syncDb?.empresa ? {
        nome: syncDb.empresa.nome_fantasia || syncDb.empresa.razao_social || "",
        logo: syncDb.empresa.logo || "",
        backgroundUrl: "",
        endereco: syncDb.empresa.cidade || "",
        telefoneComercial: syncDb.empresa.telefone_comercial || "",
        telefoneParticipacao: syncDb.empresa.telefone_participacao || "",
        site: syncDb.empresa.site || "",
        instagram: syncDb.empresa.instagram || "",
        facebook: syncDb.empresa.facebook || "",
        youtube: syncDb.empresa.youtube || "",
        plano: syncDb.empresa.plano || "",
      } : null));

      if (empresa) {
        setConfig({
          nome: empresa.nome || "", logo: empresa.logo || "", backgroundUrl: (empresa as any).background_url || empresa.backgroundUrl || "",
          endereco: empresa.endereco || "", telefoneComercial: (empresa as any).telefone_comercial || empresa.telefoneComercial || "",
          telefoneParticipacao: (empresa as any).telefone_participacao || empresa.telefoneParticipacao || "", site: empresa.site || "",
          instagram: empresa.instagram || "", facebook: empresa.facebook || "", youtube: empresa.youtube || "",
          plano: empresa.plano || "",
        });
        setStreamCfg({
          audioUrl: (empresa as any).audio_stream_api_url || empresa.audioUrl || "",
          audioXpath: (empresa as any).audio_stream_xpath || empresa.audioXpath || "",
          videoUrl: (empresa as any).video_stream_api_url || empresa.videoUrl || "",
          videoXpath: (empresa as any).video_stream_xpath || empresa.videoXpath || "",
        });
      }
      if (data?.userId || isPositivaStation || syncDb?.userId) {
        setAudienceUserId(data?.userId || (isPositivaStation ? POSITIVA_USER_ID : syncDb?.userId || null));
      }
      setWeatherInfo({
        city: data?.weather_city || (isPositivaStation ? "Goiânia" : (syncDb?.empresa?.cidade || null)),
        lat: data?.weather_lat != null ? Number(data.weather_lat) : (isPositivaStation ? -16.6869 : null),
        lon: data?.weather_lon != null ? Number(data.weather_lon) : (isPositivaStation ? -49.2648 : null),
      });

      let allPromos = data?.promocoes || [];
      if (allPromos.length === 0) {
        const snapPromos = getSnapshotTable("promocoes");
        if (isPositivaStation) {
          const filtered = snapPromos.filter((p: any) => p.user_id === POSITIVA_USER_ID || !p.user_id);
          allPromos = filtered.length > 0 ? filtered : snapPromos;
        } else if (syncDb?.userId) {
          allPromos = snapPromos.filter((p: any) => p.user_id === syncDb.userId);
        }
      }
      allPromos = allPromos.map((p: any) => ({
        ...p,
        imagem_url: resolveSafePromoBanner(p),
        banner_l_url: resolveSafePromoBanner(p),
        botao_icone_url: resolveSafePromoButton(p),
        nome: p.nome || p.botao_url || "Promoção",
      }));
      setPromocoes(allPromos);

      let activeTestemunhais = data?.testemunhais || [];
      if (activeTestemunhais.length === 0) {
        const snapTests = getSnapshotTable("testemunhais");
        if (isPositivaStation) {
          const filtered = snapTests.filter((t: any) => t.user_id === POSITIVA_USER_ID || !t.user_id);
          activeTestemunhais = filtered.length > 0 ? filtered : snapTests;
        } else if (syncDb?.userId) {
          activeTestemunhais = snapTests.filter((t: any) => t.user_id === syncDb.userId);
        }
      }
      setTestemunhais(activeTestemunhais);

      if (data?.tela_promo_config) {
        setTelaPromoConfig({ ...defaultTelaPromoConfig, ...data.tela_promo_config });
      }

      let rawProgs = data?.programas || [];
      if (rawProgs.length === 0) {
        if (isPositivaStation) {
          rawProgs = syncDb?.programas && syncDb.programas.length > 0 ? syncDb.programas : DEFAULT_POSITIVA_PROGRAMAS;
        } else if (syncDb?.programas && syncDb.programas.length > 0) {
          rawProgs = syncDb.programas;
        }
      }
      const mapped = rawProgs.map((p: any) => ({
        id: p.id,
        mergedIds: p.mergedIds || [p.id],
        nome: p.nome,
        apresentadorId: p.apresentador_id || p.apresentadorId || "",
        apresentadoresIds: p.apresentadores_ids || p.apresentadoresIds || [],
        selo: resolveSafeProgramSelo(p.selo || p.nome),
        capa: resolveSafeProgramCover(p.capa || p.thumb || p.selo || p.nome),
        thumb: resolveSafeProgramCover(p.thumb || p.capa || p.nome),
        diasSemana: p.dias_semana || p.diasSemana || [],
        horarioInicio: p.horario_inicio || p.horarioInicio || "00:00:00",
        horarioFim: p.horario_fim || p.horarioFim || "23:59:59",
        descricao: p.descricao || "",
        schedules: p.schedules || [{ dias: p.dias_semana || p.diasSemana || [], horarioInicio: p.horario_inicio || p.horarioInicio, horarioFim: p.horario_fim || p.horarioFim }],
      }));
      setProgramas(mapped);

      let aprs = data?.apresentadores || [];
      if (aprs.length === 0) {
        if (isPositivaStation) {
          aprs = (DEFAULT_STATION_PARTICIPANTES["POSITIVA FM"] as any) || DEFAULT_POSITIVA_APRESENTADORES;
        } else if (syncDb?.apresentadores && syncDb.apresentadores.length > 0) {
          aprs = syncDb.apresentadores;
        }
      }
      setApresentadores(aprs.map((a: any) => ({
        id: a.id,
        nome: a.nome,
        cargo: a.cargo || "",
        instagram: a.instagram || "",
        foto: resolveSafePresenterPhoto(a.nome, a.foto, isPositivaStation ? "POSITIVA FM" : (validSlug || userSlug || syncDb?.userId)),
        background_url: a.background_url || "",
        ativo: a.ativo ?? true,
      })));
    };

    const loadAuth = async () => {
      let localUid: string | null = null;
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000));
        const authPromise = supabase.auth.getUser();
        const { data: authData }: any = await Promise.race([authPromise, timeoutPromise]).catch(() => ({ data: null }));
        localUid = authData?.user?.id || null;
      } catch { /* ignore */ }
      if (!localUid && typeof window !== "undefined") {
        try {
          localUid = JSON.parse(localStorage.getItem("nexohub_backup_session") || "{}")?.user?.id || null;
        } catch { /* ignore */ }
      }

      const isPositiva = !localUid || localUid === POSITIVA_USER_ID;
      const targetUid = localUid || POSITIVA_USER_ID;

      // Isolamento de contas: subusuário herda os dados do usuário master.
      let ownerIds: string[] = localUid ? [localUid] : [];
      if (localUid) {
        try {
          const { data: prof } = await supabase
            .from("profiles")
            .select("parent_user_id")
            .eq("id", localUid as any)
            .maybeSingle();
          const parentId = (prof as any)?.parent_user_id;
          if (parentId && parentId !== localUid) ownerIds = [localUid, parentId];
        } catch { /* ignore */ }
      }

      let empresaData: any = null;
      let promoData: any = null;
      let progsData: any = null;
      let testData: any = null;
      let settingsData: any = null;

      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000));
        const scopePromos = supabase.from("promocoes").select("*").order("data_inicio");
        const scopeProgs = supabase.from("programas").select("*").eq("ativo", true).ilike("estudio", "%fm%");
        const scopeTests = supabase.from("testemunhais").select("*");
        const scopeSettings = supabase
          .from("user_settings")
          .select("user_id, cenario_config, weather_city, weather_lat, weather_lon");
        const fetches = Promise.all([
          getEmpresaConfig().catch(() => null),
          (ownerIds.length ? scopePromos.in("user_id", ownerIds as any) : scopePromos).catch(() => ({ data: null })),
          (ownerIds.length ? scopeProgs.in("user_id", ownerIds as any) : scopeProgs).catch(() => ({ data: null })),
          (ownerIds.length ? scopeTests.in("user_id", ownerIds as any) : scopeTests).catch(() => ({ data: null })),
          (ownerIds.length
            ? scopeSettings.in("user_id", ownerIds as any).limit(2)
            : scopeSettings.limit(1)
          ).catch(() => ({ data: null })),
        ]);
        const results: any = await Promise.race([fetches, timeoutPromise]).catch(() => null);
        if (results) {
          let settingsRows: any = null;
          [empresaData, { data: promoData } = {}, { data: progsData } = {}, { data: testData } = {}, { data: settingsRows } = {}] = results;
          const rows = Array.isArray(settingsRows) ? settingsRows : (settingsRows ? [settingsRows] : []);
          settingsData =
            rows.find((r: any) => r.user_id === localUid && (r.cenario_config as any)?.tela_promo_bg) ||
            rows.find((r: any) => (r.cenario_config as any)?.tela_promo_bg) ||
            rows.find((r: any) => r.user_id === localUid) ||
            rows[0] ||
            null;
        }
      } catch {}

      if (!empresaData && isPositiva) {
        empresaData = DEFAULT_POSITIVA_CONFIG;
      }
      setConfig(empresaData || DEFAULT_POSITIVA_CONFIG);

      if (settingsData) {
        setWeatherInfo({
          city: (settingsData as any).weather_city || (isPositiva ? "Goiânia" : null),
          lat: (settingsData as any).weather_lat != null ? Number((settingsData as any).weather_lat) : (isPositiva ? -16.6869 : null),
          lon: (settingsData as any).weather_lon != null ? Number((settingsData as any).weather_lon) : (isPositiva ? -49.2648 : null),
        });
      } else if (isPositiva) {
        setWeatherInfo({ city: "Goiânia", lat: -16.6869, lon: -49.2648 });
      }

      if (localUid) {
        setAudienceUserId(localUid);
        try {
          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000));
          const streamPromise = supabase
            .from("empresa_config")
            .select("audio_stream_api_url, audio_stream_xpath, video_stream_api_url, video_stream_xpath")
            .eq("user_id", localUid as any)
            .maybeSingle();
          const { data: ec }: any = await Promise.race([streamPromise, timeoutPromise]).catch(() => ({ data: null }));
          if (ec) {
            setStreamCfg({
              audioUrl: (ec as any).audio_stream_api_url || "",
              audioXpath: (ec as any).audio_stream_xpath || "",
              videoUrl: (ec as any).video_stream_api_url || "",
              videoXpath: (ec as any).video_stream_xpath || "",
            });
          }
        } catch { /* ignore */ }
      } else {
        setAudienceUserId(POSITIVA_USER_ID);
      }

      if (settingsData?.cenario_config) {
        const raw = settingsData.cenario_config as any;
        if (raw.tela_promo_bg) {
          setTelaPromoConfig({ ...defaultTelaPromoConfig, ...raw.tela_promo_bg });
        }
      }

      let allPromos = promoData || [];
      let activeTestemunhais = testData || [];
      let edgeProgs: any[] = [];
      let edgeAprs: any[] = [];

      // Fallback para snapshot estático local se ainda estiver vazio
      if (allPromos.length === 0) {
        const snapPromos = getSnapshotTable("promocoes");
        const filtered = snapPromos.filter((p: any) => {
          if (localUid && p.user_id === localUid) return true;
          if (isPositivaStation && (p.user_id === POSITIVA_USER_ID || !p.user_id)) return true;
          return false;
        });
        allPromos = isPositivaStation ? (filtered.length > 0 ? filtered : snapPromos) : filtered;
      }
      if (activeTestemunhais.length === 0) {
        const snapTests = getSnapshotTable("testemunhais");
        const filtered = snapTests.filter((t: any) => {
          if (localUid && t.user_id === localUid) return true;
          if (isPositivaStation && (t.user_id === POSITIVA_USER_ID || !t.user_id)) return true;
          return false;
        });
        activeTestemunhais = isPositivaStation ? (filtered.length > 0 ? filtered : snapTests) : filtered;
      }

      if (localUid) {
        try {
          const rawLocal = localStorage.getItem(`nexohub_testemunhais_${localUid}`);
          if (rawLocal) {
            const parsed = JSON.parse(rawLocal);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const map = new Map<string, any>();
              activeTestemunhais.forEach((t: any) => map.set(t.id, t));
              parsed.forEach((t: any) => map.set(t.id, t));
              activeTestemunhais = Array.from(map.values());
            }
          }
        } catch {}
        if (!isPositivaStation) {
          activeTestemunhais = activeTestemunhais.filter((t: any) => t.user_id !== POSITIVA_USER_ID && !POSITIVA_TESTEMUNHAIS_IDS.has(t.id));
          allPromos = allPromos.filter((p: any) => p.user_id !== POSITIVA_USER_ID);
        }
        try {
          localStorage.setItem(`nexohub_testemunhais_${localUid}`, JSON.stringify(activeTestemunhais));
          localStorage.setItem(`nexohub_promocoes_${localUid}`, JSON.stringify(allPromos));
        } catch {}
      }

      allPromos = allPromos.map((p: any) => ({
        ...p,
        imagem_url: resolveSafePromoBanner(p),
        banner_l_url: resolveSafePromoBanner(p),
        botao_icone_url: resolveSafePromoButton(p),
        nome: p.nome || p.botao_url || "Promoção",
      }));

      setPromocoes(allPromos);
      setTestemunhais(activeTestemunhais);

      let rawProgs = progsData && progsData.length > 0 ? progsData : (edgeProgs.length > 0 ? edgeProgs : []);
      if (rawProgs.length === 0 && isPositiva) {
        rawProgs = DEFAULT_POSITIVA_PROGRAMAS;
      }
      if (rawProgs.length === 0) {
        const snapProgs = getSnapshotTable("programas");
        const filtered = snapProgs.filter((p: any) =>
          !localUid || p.user_id === localUid || p.user_id === POSITIVA_USER_ID
        );
        if (filtered.length > 0) rawProgs = filtered;
      }
      if (rawProgs.length === 0) {
        const stationData = getStationDatabaseSync(localUid || undefined);
        if (stationData?.programas && stationData.programas.length > 0) {
          rawProgs = stationData.programas;
        } else if (localUid) {
          try {
            const fetched = await fetchStationDatabaseData(localUid);
            if (fetched?.programas && fetched.programas.length > 0) {
              rawProgs = fetched.programas;
            }
          } catch { /* ignore */ }
        }
      }
      if (rawProgs.length === 0 && isPositiva) {
        rawProgs = DEFAULT_POSITIVA_PROGRAMAS;
      }

      const mapped = rawProgs.map((p: any) => ({
        id: p.id,
        mergedIds: p.mergedIds || [p.id],
        nome: p.nome,
        apresentadorId: p.apresentador_id || p.apresentadorId || "",
        apresentadoresIds: p.apresentadores_ids || p.apresentadoresIds || [],
        selo: resolveSafeProgramSelo(p.selo || p.nome),
        capa: resolveSafeProgramCover(p.capa || p.thumb || p.selo || p.nome),
        thumb: resolveSafeProgramCover(p.thumb || p.capa || p.nome),
        diasSemana: p.dias_semana || p.diasSemana || [],
        horarioInicio: p.horario_inicio || p.horarioInicio || "00:00:00",
        horarioFim: p.horario_fim || p.horarioFim || "23:59:59",
        descricao: p.descricao || "",
        schedules: p.schedules || [{ dias: p.dias_semana || p.diasSemana || [], horarioInicio: p.horario_inicio || p.horarioInicio, horarioFim: p.horario_fim || p.horarioFim }],
      }));
      setProgramas(mapped);

      let aprs: any[] = [];
      try {
        aprs = edgeAprs.length > 0 ? edgeAprs : await getApresentadores();
      } catch {}
      if (!aprs || aprs.length === 0 || isPositiva) {
        aprs = DEFAULT_POSITIVA_APRESENTADORES;
      }
      setApresentadores(aprs.map((a: any) => ({
        id: a.id,
        nome: a.nome,
        cargo: a.cargo || "",
        instagram: a.instagram || "",
        foto: resolveSafePresenterPhoto(a.nome, a.foto, isPositiva ? "POSITIVA FM" : (userSlug || localUid)),
        background_url: a.background_url || "",
        ativo: a.ativo ?? true,
      })));
    };

    const load = isPublicMode ? loadPublic : loadAuth;
    load().finally(() => setLoading(false));
    const interval = setInterval(load, 10000); // Changed from 30s to 10s for better synchronization
    return () => clearInterval(interval);
  }, [isPublicMode, userSlug]);

  // Banner auto-rotate with progress tracking
  const BANNER_DURATION = 5000;
  const PROGRESS_INTERVAL = 50;

  useEffect(() => {
    const banners = getUniqueBanners(promocoes);
    setCurrentBannerIndex((previousIndex) => banners.length > 0 ? previousIndex % banners.length : 0);
    if (banners.length <= 1) return;
    bannerTimerRef.current = 0;
    setBannerProgress(0);
    const timer = setInterval(() => {
      bannerTimerRef.current += PROGRESS_INTERVAL;
      const pct = (bannerTimerRef.current / BANNER_DURATION) * 100;
      if (pct >= 100) {
        setCurrentBannerIndex(prev => (prev + 1) % banners.length);
        bannerTimerRef.current = 0;
        setBannerProgress(0);
      } else {
        setBannerProgress(pct);
      }
    }, PROGRESS_INTERVAL);
    return () => clearInterval(timer);
  }, [promocoes]);

  const changeBanner = (index: number) => {
    setCurrentBannerIndex(index);
    bannerTimerRef.current = 0;
    setBannerProgress(0);
  };

  // ---- Audiência ao vivo (áudio x vídeo) ----
  useEffect(() => {
    if (!audienceUserId || !streamCfg.audioUrl) { setAudioCount(null); return; }
    let cancelled = false;
    const tick = async () => {
      try {
        const body: Record<string, unknown> = { userId: audienceUserId, urls: [streamCfg.audioUrl] };
        if (streamCfg.audioXpath) body.xpath = streamCfg.audioXpath;
        const { data } = await supabase.functions.invoke("count-stream-listeners", { body });
        if (!cancelled && data && (data as any).ok) {
          const n = (data as any).listeners;
          setAudioCount(typeof n === "number" ? n : null);
        }
      } catch { /* ignore */ }
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [audienceUserId, streamCfg.audioUrl, streamCfg.audioXpath]);

  useEffect(() => {
    if (!streamCfg.videoUrl || !streamCfg.videoXpath) { setVideoCount(null); return; }
    let cancelled = false;
    const extract = (text: string, rawPath: string): number | null => {
      const path = rawPath.replace(/^\/+/, "").split("/").map(s => s.trim()).filter(Boolean);
      if (!path.length) return null;
      const trimmed = text.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          let cur: any = JSON.parse(trimmed);
          for (const k of path) { if (cur == null) return null; if (Array.isArray(cur)) cur = cur[0]; cur = cur?.[k]; }
          if (Array.isArray(cur)) cur = cur[0];
          const n = typeof cur === "string" ? parseInt(cur, 10) : Number(cur);
          return Number.isFinite(n) ? n : null;
        } catch { /* fallthrough */ }
      }
      let scope = trimmed;
      for (const tag of path) {
        const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
        const m = scope.match(re);
        if (!m) return null;
        scope = m[1];
      }
      const inner = scope.replace(/<[^>]+>/g, "").trim();
      const n = parseInt(inner, 10);
      return Number.isFinite(n) ? n : null;
    };
    const tick = async () => {
      try {
        const r = await fetch(streamCfg.videoUrl, { cache: "no-store" });
        const text = (await r.text()).trim();
        const n = extract(text, streamCfg.videoXpath);
        if (!cancelled) setVideoCount(typeof n === "number" ? n : null);
      } catch { if (!cancelled) setVideoCount(null); }
    };
    tick();
    const iv = setInterval(tick, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [streamCfg.videoUrl, streamCfg.videoXpath]);

  // Rastreia o pico de audiência do dia
  useEffect(() => {
    if (audioCount === null && videoCount === null) return;
    const total = (audioCount ?? 0) + (videoCount ?? 0);
    if (total <= 0) return;
    const today = new Date().toISOString().split("T")[0];
    const presenter = onAirProgram?.apresentadorId
      ? apresentadores.find(a => a.id === onAirProgram.apresentadorId)
      : null;
    setPeakAudience(prev => {
      if (prev && prev.date === today && prev.total >= total) return prev;
      const next = {
        total,
        programa: onAirProgram?.nome || "Programação Musical",
        locutor: presenter?.nome || "—",
        timestamp: new Date().toISOString(),
        date: today,
      };
      try { localStorage.setItem(peakStorageKey, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [audioCount, videoCount, onAirProgram, apresentadores]);

  useEffect(() => {
    const update = () => {
      let current = findCurrentProgram(programas as any);
      // Se houver pequeno intervalo entre o fim cadastrado de um programa e o início do próximo,
      // mantém o programa anterior no ar até o próximo começar
      if (!current && programas.length > 0) {
        const now = new Date();
        const dias = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        const diaAtual = dias[now.getDay()];
        const horaAtual = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
        const dayProgs = (programas as any[])
          .filter(p => p.diasSemana?.includes(diaAtual))
          .sort((a, b) => (a.horarioInicio || "").localeCompare(b.horarioInicio || ""));
        for (let i = 0; i < dayProgs.length; i++) {
          const p = dayProgs[i];
          const next = dayProgs[i + 1];
          const nextStart = next ? next.horarioInicio : "24:00";
          if (horaAtual >= p.horarioInicio && horaAtual < nextStart) {
            current = { programa: p, progress: 95 };
            break;
          }
        }
      }
      if (current) {
        setOnAirProgram({
          nome: current.programa.nome || "",
          horarioInicio: (current.programa as any).horarioInicio,
          horarioFim: (current.programa as any).horarioFim,
          progress: Math.min(100, Math.max(0, current.progress)),
          apresentadorId: (current.programa as any).apresentadorId || (current.programa as any).apresentador_id || "",
          diasSemana: (current.programa as any).diasSemana || (current.programa as any).dias_semana || [],
        });
      } else {
        setOnAirProgram(null);
      }
    };
    update();
    const interval = setInterval(update, 2000);
    return () => clearInterval(interval);
  }, [programas]);

  // Auto scroll - works for whichever modal is open
  const getActiveScrollRef = useCallback(() => {
    return activeScrollTarget === "promo" ? modalScrollRef : programModalScrollRef;
  }, [activeScrollTarget]);

  const normalizeProgramName = (name: string) => {
    const normalized = name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase()
      .replace(/\s+\d+$/, "")
      .trim();

    // Unifica as diferentes grafias e cadastros do mesmo programa para que
    // o carrossel de Citações exiba somente um card de Flash Back.
    if (normalized.replace(/\s+/g, "").includes("FLASHBACK")) {
      return "FLASHBACK";
    }

    return normalized;
  };

  const getTestemunhalProgramIds = (t: Testemunhal) => {
    const currentIds = Array.isArray(t.programa_ids)
      ? t.programa_ids.filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    // programa_ids é a fonte atual da associação. programa_id permanece apenas
    // como compatibilidade para registros antigos, evitando misturar vínculos obsoletos.
    return currentIds.length > 0
      ? Array.from(new Set(currentIds))
      : t.programa_id
        ? [t.programa_id]
        : [];
  };


  // Cada programa possui uma única citação vigente. Registros antigos duplicados
  // não devem aparecer como novas citações: prevalece o texto atualizado por último.
  const getTestemunhaisForProgram = (prog: ProgramaGrade) => {
    const today = new Date().toISOString().split("T")[0];
    const baseIds = new Set(prog.mergedIds || [prog.id]);
    const targetNameNorm = normalizeProgramName(prog.nome);

    // Inclui todos os IDs de programas com o mesmo nome normalizado (grade duplicada)
    for (const p of programas) {
      if (normalizeProgramName(p.nome) === targetNameNorm) {
        baseIds.add(p.id);
        if (p.mergedIds) p.mergedIds.forEach(id => baseIds.add(id));
      }
    }

    // Mapa ID -> Nome de programas conhecidos (programas carregados + snapshot estático)
    const progNameById = new Map<string, string>();
    for (const p of programas) {
      progNameById.set(p.id, normalizeProgramName(p.nome));
      if (p.mergedIds) {
        p.mergedIds.forEach(id => progNameById.set(id, normalizeProgramName(p.nome)));
      }
    }
    try {
      const snapProgs = getSnapshotTable("programas");
      for (const p of snapProgs) {
        if (p.id && p.nome) {
          const sName = normalizeProgramName(p.nome);
          progNameById.set(p.id, sName);
          if (sName === targetNameNorm) {
            baseIds.add(p.id);
          }
        }
      }
    } catch {}

    const matches = testemunhais.filter(t => {
      const tIds = getTestemunhalProgramIds(t);
      if (tIds.length === 0) return false;
      const isWithinDate = (!t.data_inicio || t.data_inicio <= today) && (!t.data_fim || t.data_fim >= today);
      if (!isWithinDate) return false;

      // 1. Casa por ID direto
      if (tIds.some(id => baseIds.has(id))) return true;

      // 2. Casa por Nome do programa referenciado pelo ID da citação
      for (const tId of tIds) {
        const refName = progNameById.get(tId);
        if (refName && refName === targetNameNorm) return true;
        if (refName && (refName.includes(targetNameNorm) || targetNameNorm.includes(refName))) return true;
      }

      return false;
    });

    const standardTests = matches
      .filter(t => !(t as any).is_promo)
      .sort((a, b) => {
        const aTime = Date.parse(a.updated_at || a.created_at || a.data_inicio || "") || 0;
        const bTime = Date.parse(b.updated_at || b.created_at || b.data_inicio || "") || 0;
        return bTime - aTime;
      })
      .slice(0, 1);

    const promoTests = matches.filter(t => (t as any).is_promo);

    return [...standardTests, ...promoTests];
  };

  // Mapa global nome-normalizado -> capa preferida (primeira não-vazia encontrada em todos os programas)
  const canonicalCoverByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of programas) {
      const cover = p.capa || p.thumb || p.selo || "";
      if (!cover) continue;
      const key = normalizeProgramName(p.nome);
      if (!map.has(key)) map.set(key, cover);
    }
    return map;
  }, [programas]);

  const normalizeCoverKey = (cover: string) => {
    const value = cover.trim();
    if (!value) return "";
    if (value.startsWith("data:")) return value;

    try {
      const url = new URL(value, window.location.origin);
      url.hash = "";
      url.search = "";
      return url.href.toLowerCase();
    } catch {
      return value.split("#")[0].split("?")[0].toLowerCase();
    }
  };

  const isRemovedProgramCover = (cover: string) =>
    normalizeCoverKey(cover).includes(REMOVED_PROGRAM_COVER_PATH);

  const isRemovedCitationProgram = (programName: string) => {
    const normalizedName = normalizeProgramName(programName);

    if (normalizedName === "WHATSAPP POSITIVA" || normalizedName.startsWith("WHATSAPP POSITIVA SABADO")) {
      return true;
    }

    const isSertanejoSabado = normalizedName.includes("SERTANEJO BOM DEMAIS")
      && normalizedName.includes("EDICAO")
      && normalizedName.includes("SABADO");
    const isPrimeiraEdicao = /(?:^|\s)1\s+EDICAO(?:\s|$)/.test(normalizedName)
      || normalizedName.includes("PRIMEIRA EDICAO");
    const isSegundaEdicao = /(?:^|\s)2\s+EDICAO(?:\s|$)/.test(normalizedName)
      || normalizedName.includes("SEGUNDA EDICAO");

    return isSertanejoSabado && (isPrimeiraEdicao || isSegundaEdicao);
  };

  const mergeProgramList = (list: ProgramaGrade[]) => {
    const visibleList = list.filter(programa =>
      !isRemovedProgramCover(programa.capa) && !isRemovedCitationProgram(programa.nome)
    );
    const mergedByName = Array.from(
      visibleList
        .slice()
        .sort((a, b) => a.horarioInicio.localeCompare(b.horarioInicio))
        .reduce((map, programa) => {
          const dedupeKey = normalizeProgramName(programa.nome);
          const mergedIds = Array.from(new Set([...(programa.mergedIds || []), programa.id]));
          const canonicalCover = canonicalCoverByName.get(dedupeKey) || programa.capa || "";
          const existing = map.get(dedupeKey);

          if (!existing) {
            map.set(dedupeKey, {
              ...programa,
              capa: canonicalCover,
              mergedIds,
              apresentadoresIds: Array.from(new Set(programa.apresentadoresIds || [])),
              diasSemana: Array.from(new Set(programa.diasSemana || [])),
              schedules: [...programa.schedules],
            });
          } else {
            existing.mergedIds = Array.from(new Set([...existing.mergedIds, ...mergedIds]));
            existing.apresentadoresIds = Array.from(new Set([
              ...existing.apresentadoresIds,
              ...(programa.apresentadoresIds || []),
            ]));
            existing.diasSemana = Array.from(new Set([...existing.diasSemana, ...programa.diasSemana]));
            existing.schedules = [...existing.schedules, ...programa.schedules];
            if (canonicalCover) existing.capa = canonicalCover;
          }

          return map;
        }, new Map<string, ProgramaGrade>())
        .values(),
    );

    return Array.from(
      mergedByName.reduce((map, programa) => {
        const normalizedName = normalizeProgramName(programa.nome);
        const coverKey = normalizeCoverKey(programa.capa);
        // As variações “Madruga” e “Madrugada Positiva” representam o mesmo
        // programa no carrossel de Citações e devem ocupar apenas um card.
        const visualKey = normalizedName.includes("MADRUGA")
          ? "programa:MADRUGA-POSITIVA"
          : coverKey || `programa:${normalizedName}`;
        const existing = map.get(visualKey);

        if (!existing) {
          map.set(visualKey, programa);
          return map;
        }

        existing.mergedIds = Array.from(new Set([...existing.mergedIds, ...programa.mergedIds]));
        existing.apresentadoresIds = Array.from(new Set([
          ...existing.apresentadoresIds,
          ...programa.apresentadoresIds,
        ]));
        existing.diasSemana = Array.from(new Set([...existing.diasSemana, ...programa.diasSemana]));
        existing.schedules = [...existing.schedules, ...programa.schedules];
        return map;
      }, new Map<string, ProgramaGrade>()).values(),
    );
  };

  const todayDateStr = new Date().toISOString().split("T")[0];
  const programNamesWithTestemunhais = useMemo(() => {
    const set = new Set<string>();
    const progNameById = new Map<string, string>();
    try {
      const snapProgs = getSnapshotTable("programas");
      for (const p of snapProgs) {
        if (p.id && p.nome) progNameById.set(p.id, normalizeProgramName(p.nome));
      }
    } catch {}
    for (const p of programas) {
      progNameById.set(p.id, normalizeProgramName(p.nome));
      if (p.mergedIds) {
        p.mergedIds.forEach(id => progNameById.set(id, normalizeProgramName(p.nome)));
      }
    }

    for (const t of testemunhais) {
      const isWithinDate = (!t.data_inicio || t.data_inicio <= todayDateStr) && (!t.data_fim || t.data_fim >= todayDateStr);
      if (!isWithinDate) continue;
      const tIds = getTestemunhalProgramIds(t);
      for (const id of tIds) {
        const name = progNameById.get(id);
        if (name) set.add(name);
      }
    }
    return set;
  }, [testemunhais, programas, todayDateStr]);

  const filteredPrograms = mergeProgramList(
    programas.filter(p => programNamesWithTestemunhais.has(normalizeProgramName(p.nome)))
  );

  const allPromos = promocoes;
  const banners = getUniqueBanners(allPromos);
  // Se não tiver botão_url, usa o nome da promoção como fallback para exibir o botão
  const botoes = allPromos.filter(p => p.botao_url || p.nome);

  const scrollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startScroll = useCallback((ref: React.RefObject<HTMLDivElement>, direction: "left" | "right") => {
    stopScroll();
    const step = () => {
      ref.current?.scrollBy({ left: direction === "left" ? -8 : 8 });
    };
    step();
    scrollIntervalRef.current = setInterval(step, 16);
  }, []);

  const stopScroll = useCallback(() => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  }, []);

  const stopAutoScroll = useCallback(() => {
    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }
    lastFrameTimeRef.current = null;
    setAutoScrolling(false);
  }, []);

  const startAutoScroll = useCallback((target: "promo" | "program") => {
    setActiveScrollTarget(target);

    if (autoScrollFrameRef.current !== null) {
      cancelAnimationFrame(autoScrollFrameRef.current);
      autoScrollFrameRef.current = null;
    }

    lastFrameTimeRef.current = null;
    setAutoScrolling(true);

    const animate = (time: number) => {
      const ref = target === "promo" ? modalScrollRef : programModalScrollRef;

      if (ref.current) {
        if (lastFrameTimeRef.current === null) {
          lastFrameTimeRef.current = time;
        }

        const elapsed = time - lastFrameTimeRef.current;
        lastFrameTimeRef.current = time;

        const pixelsPerSecond = 30 + scrollSpeedRef.current * 12;
        const pixelsToScroll = (pixelsPerSecond * elapsed) / 1000;
        ref.current.scrollTop += pixelsToScroll;
      }

      autoScrollFrameRef.current = requestAnimationFrame(animate);
    };

    autoScrollFrameRef.current = requestAnimationFrame(animate);
  }, []);

  const toggleAutoScroll = (target: "promo" | "program") => {
    if (autoScrolling && activeScrollTarget === target) {
      stopAutoScroll();
      return;
    }
    startAutoScroll(target);
  };

  const handleAutoPlayChange = (enabled: boolean) => {
    setAutoPlay(enabled);
    
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
  };

  const closePromoModal = () => {
    setSelectedPromo(null);
    stopAutoScroll();
    if (autoPlayTimerRef.current) { clearTimeout(autoPlayTimerRef.current); autoPlayTimerRef.current = null; }
  };

  const closeProgramModal = () => {
    setSelectedProgram(null);
    stopAutoScroll();
    if (autoPlayTimerRef.current) { clearTimeout(autoPlayTimerRef.current); autoPlayTimerRef.current = null; }
  };

  // Auto-play on modal open disabled
  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [selectedPromo, autoPlay, startAutoScroll]);

  useEffect(() => {
    return () => {
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [selectedProgram, autoPlay, startAutoScroll]);


  // Pré-carrega imagens do programa atual/anterior/próximo com debounce + cancelamento
  const preloadedUrlsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const pending: HTMLImageElement[] = [];
    const timer = window.setTimeout(() => {
      const list = mergeProgramList(programas);
      if (!list.length) return;
      const onAirIdx = onAirProgram ? list.findIndex(p => normalizeProgramName(p.nome) === normalizeProgramName(onAirProgram.nome)) : -1;
      const activeIdx = coverIndex ?? (onAirIdx >= 0 ? onAirIdx : 0);
      const targets = [
        list[activeIdx],
        list[(activeIdx + 1) % list.length],
        list[(activeIdx - 1 + list.length) % list.length],
      ].filter(Boolean);
      const urls = new Set<string>();
      for (const prog of targets) {
        if (prog?.capa) urls.add(prog.capa);
        const tests = getTestemunhaisForProgram(prog!);
        for (const t of tests) if (t.imagem_url) urls.add(t.imagem_url);
      }
      const cache = preloadedUrlsRef.current;
      urls.forEach(url => {
        if (cache.has(url)) return;
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        img.onload = img.onerror = () => cache.add(url);
        pending.push(img);
      });
    }, 180);

    return () => {
      window.clearTimeout(timer);
      for (const img of pending) {
        if (!img.complete) {
          img.onload = null;
          img.onerror = null;
          img.src = ""; // aborta o download em navegadores modernos
        }
      }
    };
  }, [coverIndex, onAirProgram, programas, testemunhais]);


  const ProgressCircle = ({ active, progress }: { active: boolean; progress: number }) => {
    if (!active) {
      return (
        <span
          className="block rounded-full transition-all duration-300"
          style={{
            width: 6,
            height: 6,
            backgroundColor: "rgba(255,255,255,0.45)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
          }}
        />
      );
    }
    return (
      <span
        className="relative block rounded-full overflow-hidden transition-all duration-300"
        style={{
          width: 28,
          height: 6,
          backgroundColor: "rgba(255,255,255,0.35)",
          boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
        }}
      >
        <span
          className="absolute inset-y-0 left-0"
          style={{
            width: `${Math.min(100, Math.max(0, progress))}%`,
            backgroundColor: "#ffffff",
            transition: "width 50ms linear",
            boxShadow: "0 0 6px rgba(255,255,255,0.5)",
          }}
        />
      </span>
    );
  };


  // Spacebar to toggle play/pause when a modal is open
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      if (selectedPromo) toggleAutoScroll("promo");
      else if (selectedProgram) toggleAutoScroll("program");
    };
    if (selectedPromo || selectedProgram) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPromo, selectedProgram, autoScrolling, activeScrollTarget]);

   // Inline teleprompter controls renderer (not a component to avoid remount)
  const renderTeleprompterControls = (target: "promo" | "program") => (
    <div className="flex items-center gap-3 p-[10px] rounded-xl" style={{ backgroundColor: "var(--layout-slider-bg, #1b1b1d)" }}>
      <div className="flex items-center gap-1.5 flex-1 pl-2">
        <button 
          type="button" 
          onClick={() => setFontSize(s => Math.max(12, s - 2))} 
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-xs font-bold hover:brightness-125 transition" 
          style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}
          title="Diminuir texto"
        >
          <Minus size={14} />
        </button>
        <button 
          type="button" 
          onClick={() => setFontSize(s => Math.min(56, s + 2))} 
          className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold hover:brightness-125 transition" 
          style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}
          title="Aumentar texto"
        >
          <Plus size={14} />
        </button>
      </div>
      
      <div className="flex items-center gap-2 flex-[4] justify-center px-4">
        <span className="text-[11px] font-bold uppercase tracking-wider opacity-60">Aumentar e diminuir o tamanho do texto</span>
      </div>
      <div className="flex-1" />
    </div>
  );

  if (userSlug === ":userSlug") {
    return <Navigate to="/telapromo" replace />;
  }
  if (loading) {
    return <PromoSkeleton />;
  }

  const presenter = apresentadores.find(a => a.id === onAirProgram?.apresentadorId);
  const bgUrl = presenter?.background_url || config.backgroundUrl || "";
  const customBgStyle = bgUrl ? {
    backgroundImage: `linear-gradient(rgba(0,0,0,${(telaPromoConfig.bg_opacity ?? 50) / 100}), rgba(0,0,0,${(telaPromoConfig.bg_opacity ?? 50) / 100})), url(${bgUrl})`,
    backgroundSize: "cover",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundAttachment: "fixed",
    transition: "background-image 1000ms ease-in-out"
  } : buildTelaPromoBgStyle(telaPromoConfig);

  const resolvePromoOnAirPresenter = () => {
    const normalizedProgramName = (onAirProgram?.nome || "")
      .normalize("NFD")
      .replace(/[\\u0300-\\u036f]/g, "")
      .toLowerCase();

    if (normalizedProgramName.includes("vale night")) {
      const normalizePresenterName = (name: string) =>
        name.normalize("NFD").replace(/[\\u0300-\\u036f]/g, "").toLowerCase().trim();
      const isPositivaTenant = (presenter: any) =>
        !presenter?.user_id || presenter.user_id === POSITIVA_USER_ID;

      // Reginaldo Serra é o cadastro correto do Vale Night. Primeiro usa os
      // apresentadores já carregados e depois consulta o snapshot local para
      // recuperar a foto persistida caso a resposta pública não a contenha.
      let registeredReginaldo = apresentadores.find((a) => {
        const name = normalizePresenterName(a?.nome || "");
        return isPositivaTenant(a) && name.includes("reginaldo") && name.includes("serra");
      });

      if (!registeredReginaldo) {
        registeredReginaldo = getSnapshotTable("apresentadores").find((a: any) => {
          const name = normalizePresenterName(a?.nome || "");
          return isPositivaTenant(a) && name.includes("reginaldo") && name.includes("serra");
        });
      }

      // Compatibilidade com cadastros antigos que ainda usam apenas
      // “Reginaldo” no nome, sem substituir um cadastro exato de Serra.
      if (!registeredReginaldo) {
        registeredReginaldo = apresentadores.find((a) =>
          isPositivaTenant(a) && normalizePresenterName(a?.nome || "").includes("reginaldo")
        );
      }

      if (registeredReginaldo) {
        return {
          ...registeredReginaldo,
          foto: resolveSafePresenterPhoto(
            registeredReginaldo.nome,
            registeredReginaldo.foto,
            validSlug || (isPositivaUser ? "POSITIVA FM" : undefined),
          ),
        };
      }
    }

    return resolvePresenterForProgram(
      onAirProgram,
      apresentadores,
      validSlug || (isPositivaUser ? "POSITIVA FM" : undefined),
    ) || (onAirProgram?.apresentadorId
      ? apresentadores.find((a) => a.id === onAirProgram.apresentadorId)
      : null);
  };

  return (
    <div className="text-white min-h-screen p-8 flex flex-col items-center animate-fade-in" style={{ ...customBgStyle, ...promoThemeVars, color: telaPromoConfig.header_text_color }}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        .promo-scroll::-webkit-scrollbar{width:10px}
        .promo-scroll::-webkit-scrollbar-track{background:var(--promo-btn-a);border-radius:5px}
        .promo-scroll::-webkit-scrollbar-thumb{background:var(--promo-border);border-radius:5px}
        .promo-scroll::-webkit-scrollbar-button{display:block;height:10px;background:var(--promo-border);border-radius:2px}
        .promo-scroll{scrollbar-width:thin;scrollbar-color:var(--promo-border) var(--promo-btn-a)}
        @keyframes pulse-border{0%,100%{box-shadow:0 0 0 3px var(--promo-border)}50%{box-shadow:0 0 0 3px color-mix(in srgb,var(--promo-border) 20%, transparent)}}
        .animate-pulse-border{animation:pulse-border 1.5s ease-in-out infinite}
        @keyframes audience-shimmer{0%{background-position:0 0}100%{background-position:40px 0}}
        @keyframes audience-glow-red{0%,100%{box-shadow:inset 0 0 12px rgba(0,0,0,.35),0 0 12px color-mix(in srgb,var(--promo-btn-b) 55%, transparent)}50%{box-shadow:inset 0 0 18px rgba(0,0,0,.35),0 0 22px color-mix(in srgb,var(--promo-btn-b) 95%, transparent)}}
        @keyframes audience-glow-white{0%,100%{box-shadow:inset 0 0 12px rgba(0,0,0,.15),0 0 12px color-mix(in srgb,var(--promo-border) 55%, transparent)}50%{box-shadow:inset 0 0 18px rgba(0,0,0,.15),0 0 22px color-mix(in srgb,var(--promo-border) 95%, transparent)}}
        @keyframes audience-crown{0%,100%{transform:translateY(-50%) rotate(-8deg) scale(1)}50%{transform:translateY(-70%) rotate(8deg) scale(1.15)}}
        @keyframes audience-confetti{0%{transform:translateY(-6px) rotate(0);opacity:0}20%{opacity:1}100%{transform:translateY(28px) rotate(360deg);opacity:0}}
        .audience-winner-stripes{background-image:linear-gradient(115deg,color-mix(in srgb,var(--promo-text) 28%, transparent) 0 12px,transparent 12px 24px);background-size:40px 100%;animation:audience-shimmer 1.1s linear infinite}
        .audience-winner-red{animation:audience-glow-red 1.4s ease-in-out infinite}
        .audience-winner-white{animation:audience-glow-white 1.4s ease-in-out infinite}
        .audience-crown{animation:audience-crown 1.2s ease-in-out infinite;transform-origin:center}
        .audience-confetti{position:absolute;top:0;width:4px;height:8px;border-radius:1px;animation:audience-confetti 1.6s ease-in infinite}
      `}</style>

      <div className="w-full max-w-[1000px] flex flex-col gap-6">

        {/* Header */}
        <div className="flex justify-between items-center w-full px-2">
          <div className="flex items-center gap-3">
            <Radio size={16} style={{ color: telaPromoConfig.btn_color_b, filter: `drop-shadow(0 0 8px ${colorMix(telaPromoConfig.btn_color_b, 70, "#ffffff")})` }} className="animate-pulse" />

            {/* Presenter photo - ao lado do ícone de ao vivo */}
            {(() => {
              const presenter = resolvePromoOnAirPresenter();

              const photo = presenter?.foto ? resolveSafePresenterPhoto(presenter.nome, presenter.foto, validSlug || (isPositivaUser ? "POSITIVA FM" : "INTERATIVA FM")) : null;

              return photo ? (
                <div className="relative group/presenter flex-shrink-0">
                  <div
                    className="w-14 h-14 rounded-full overflow-hidden flex items-center justify-center border-2 border-white/20 shadow-lg"
                    style={{ background: promoAccentGradient, boxShadow: `0 0 0 2px ${colorMix(telaPromoConfig.card_border_color, 35, "#ffffff")}` }}
                  >
                    <img src={photo} alt={presenter?.nome || "Locutor no Ar"} className="w-full h-full object-cover" />
                  </div>
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded whitespace-nowrap opacity-0 group-hover/presenter:opacity-100 transition-opacity z-10 font-bold" style={{ background: promoDarkGradient, color: telaPromoConfig.btn_text_color }}>
                    {presenter?.nome}
                  </div>
                </div>
              ) : null;
            })()}

            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold uppercase tracking-widest text-xs" style={{ color: telaPromoConfig.header_text_color }}>No Ar</span>
                {(() => {
                  const p = resolvePromoOnAirPresenter();
                  return p?.nome ? (
                    <span className="text-[11px] font-semibold opacity-90" style={{ color: telaPromoConfig.btn_color_b }}>
                      • {p.nome}
                    </span>
                  ) : null;
                })()}
              </div>
              <p className="text-sm font-semibold truncate max-w-[300px]" style={{ color: telaPromoConfig.header_text_color }}>
                {onAirProgram?.nome || "Programação Musical"}
              </p>
              {onAirProgram && (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px]" style={{ color: colorMix(telaPromoConfig.header_text_color, 60, "#ffffff") }}>
                    {onAirProgram.horarioInicio.slice(0, 5)} às {onAirProgram.horarioFim.slice(0, 5)}
                  </span>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ width: 160, backgroundColor: telaPromoConfig.btn_color_a }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${onAirProgram.progress}%`, background: promoAccentGradient }}
                    />
                  </div>
                </div>
              )}
            </div>


            {/* Contact info */}
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-3 ml-3">
                {config.site && (
                  <Tooltip>
                    <TooltipTrigger><Globe size={14} className="cursor-pointer" style={{ color: telaPromoConfig.header_text_color }} /></TooltipTrigger>
                    <TooltipContent><p>{config.site}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.instagram && (
                  <Tooltip>
                    <TooltipTrigger><Instagram size={14} className="cursor-pointer" style={{ color: telaPromoConfig.header_text_color }} /></TooltipTrigger>
                    <TooltipContent><p>{config.instagram}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.youtube && (
                  <Tooltip>
                    <TooltipTrigger><Youtube size={14} className="cursor-pointer" style={{ color: telaPromoConfig.header_text_color }} /></TooltipTrigger>
                    <TooltipContent><p>{config.youtube}</p></TooltipContent>
                  </Tooltip>
                )}
                {config.facebook && (
                  <Tooltip>
                    <TooltipTrigger><Facebook size={14} className="cursor-pointer" style={{ color: telaPromoConfig.header_text_color }} /></TooltipTrigger>
                    <TooltipContent><p>{config.facebook}</p></TooltipContent>
                  </Tooltip>
                )}

                {/* Telefones */}
                {config.telefoneParticipacao && (
                  <div className="flex flex-col items-center ml-2">
                    <div className="flex items-center gap-1">
                      <MessageCircle size={15} style={{ color: telaPromoConfig.header_text_color }} />
                      <span className="font-bold text-[16px]" style={{ color: telaPromoConfig.header_text_color }}>{config.telefoneParticipacao}</span>
                    </div>
                    <span className="text-xs" style={{ color: telaPromoConfig.header_text_color }}>whatsapp ouvinte</span>
                  </div>
                )}
                {config.telefoneComercial && (
                  <div className="flex flex-col items-center ml-2">
                    <div className="flex items-center gap-1">
                      <Phone size={15} style={{ color: telaPromoConfig.header_text_color }} />
                      <span className="font-bold text-[16px]" style={{ color: telaPromoConfig.header_text_color }}>{config.telefoneComercial}</span>
                    </div>
                    <span className="text-xs" style={{ color: telaPromoConfig.header_text_color }}>telefone comercial</span>
                  </div>
                )}
              </div>
            </TooltipProvider>
          </div>

          {/* Logo + Fullscreen */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 rounded-full bg-black/40 hover:bg-black/70 text-white flex items-center justify-center transition-colors"
              title={isFullscreen ? "Sair da tela cheia" : "Tela cheia"}
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
            {config.logo && (
              <img src={config.logo} alt={config.nome} className="h-[90px] w-auto object-contain" />
            )}
          </div>
        </div>

        {/* Boxes informativos acima da barra de audiência */}
        <PromoInfoBoxes
          weatherCity={weatherInfo.city}
          weatherLat={weatherInfo.lat}
          weatherLon={weatherInfo.lon}
          userId={audienceUserId}
        />

        {/* Barra Batalha de Audiência: Áudio (esq) vs Vídeo (dir) - oculta para usuário Positiva */}
        {!isPositivaUser && (() => {
          const a = Math.max(0, audioCount ?? 0);
          const v = Math.max(0, videoCount ?? 0);
          const total = a + v;
          const hasData = (audioCount !== null) || (videoCount !== null);
          const audioPct = total > 0 ? (a / total) * 100 : 50;
          const videoPct = 100 - audioPct;
          const fmt = (n: number | null) => n === null ? "—" : n.toLocaleString("pt-BR");
          const audioWins = hasData && a > v;
          const videoWins = hasData && v > a;
          const confettiColors = [telaPromoConfig.btn_color_a, telaPromoConfig.btn_color_b, telaPromoConfig.card_border_color, telaPromoConfig.btn_text_color];
          return (
            <div className="w-full px-2 -mt-2 flex items-center gap-2">
              <div
                className="relative flex-1 min-w-0 h-10 rounded-full overflow-hidden flex items-stretch shadow-[0_4px_16px_rgba(0,0,0,0.45)]"
                style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_a, 18, "#0a0a0a"), border: `1px solid ${colorMix(telaPromoConfig.card_border_color, 24, "#ffffff")}` }}
                title="Audiência ao vivo: áudio × vídeo"
              >
                {/* Preenchimento áudio */}
                <div
                  className={`absolute inset-y-0 left-0 transition-[width] duration-700 ease-out ${audioWins ? "audience-winner-red" : ""}`}
                  style={{
                    width: `${audioPct}%`,
                    background: promoAccentGradient,
                    boxShadow: "inset 0 0 12px rgba(0,0,0,0.35)",
                  }}
                >
                  {audioWins && <div className="absolute inset-0 audience-winner-stripes pointer-events-none" />}
                </div>
                {/* Preenchimento vídeo */}
                <div
                  className={`absolute inset-y-0 right-0 transition-[width] duration-700 ease-out ${videoWins ? "audience-winner-white" : ""}`}
                  style={{
                    width: `${videoPct}%`,
                    background: promoAccentGradientReverse,
                    boxShadow: "inset 0 0 12px rgba(0,0,0,0.15)",
                  }}
                >
                  {videoWins && <div className="absolute inset-0 audience-winner-stripes pointer-events-none" />}
                </div>
                {/* Divisor central animado */}
                <div
                  className="absolute top-0 bottom-0 w-[2px] bg-black transition-[left] duration-700 ease-out"
                  style={{ left: `calc(${audioPct}% - 1px)`, boxShadow: "0 0 6px rgba(0,0,0,0.6)" }}
                />
                {/* Confetes festivos sobre o lado vencedor */}
                {(audioWins || videoWins) && (
                  <div
                    className="pointer-events-none absolute top-0 bottom-0 overflow-hidden z-[5]"
                    style={audioWins ? { left: 0, width: `${audioPct}%` } : { right: 0, width: `${videoPct}%` }}
                  >
                    {Array.from({ length: 8 }).map((_, i) => (
                      <span
                        key={i}
                        className="audience-confetti"
                        style={{
                          left: `${(i * 13 + 5) % 95}%`,
                          backgroundColor: confettiColors[i % confettiColors.length],
                          animationDelay: `${(i * 0.18).toFixed(2)}s`,
                        }}
                      />
                    ))}
                  </div>
                )}
                {/* Conteúdo à esquerda (áudio) */}
                <div className="relative z-10 flex items-center gap-2 pl-2 pr-4 h-full">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center relative" style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_a, 55, "#000000"), color: telaPromoConfig.btn_text_color }}>
                    <Headphones size={14} />
                    {audioWins && (
                      <Trophy size={12} className="audience-crown absolute -top-3 left-1/2 -translate-x-1/2" style={{ color: telaPromoConfig.card_border_color, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }} />
                    )}
                  </div>
                  <div className="flex items-baseline gap-1.5 px-2 py-1 rounded-md" style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_a, 62, "#000000"), color: telaPromoConfig.btn_text_color, backdropFilter: "blur(4px)" }}>
                    <span className="font-black text-sm leading-none tabular-nums">{fmt(audioCount)}</span>
                    <span className="text-[10px] uppercase tracking-wider font-semibold opacity-90">Áudio</span>
                  </div>
                </div>
                {/* Conteúdo à direita (vídeo) */}
                <div className="relative z-10 flex items-center gap-2 pr-2 pl-4 h-full ml-auto">
                  <div className="flex items-baseline gap-1.5 px-2 py-1 rounded-md" style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_a, 62, "#000000"), color: telaPromoConfig.btn_text_color, backdropFilter: "blur(4px)" }}>
                    <span className="text-[10px] uppercase tracking-wider font-semibold opacity-90">Vídeo</span>
                    <span className="font-black text-sm leading-none tabular-nums">{fmt(videoCount)}</span>
                  </div>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center relative" style={{ backgroundColor: colorMix(telaPromoConfig.btn_color_b, 55, "#000000"), color: telaPromoConfig.btn_text_color }}>
                    <MonitorPlay size={14} />
                    {videoWins && (
                      <Trophy size={12} className="audience-crown absolute -top-3 left-1/2 -translate-x-1/2" style={{ color: telaPromoConfig.card_border_color, filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }} />
                    )}
                  </div>
                </div>
              </div>
              {/* Total de espectadores + Tooltip com pico do dia */}
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      onClick={() => setAudienceDetailsOpen(true)}
                      className="flex-shrink-0 h-10 px-3 rounded-full flex items-center gap-2 shadow-[0_4px_16px_rgba(0,0,0,0.45)] cursor-pointer hover:brightness-110 transition"
                      style={{
                        background: promoDarkGradient,
                        border: `1px solid ${colorMix(telaPromoConfig.card_border_color, 32, "#ffffff")}`,
                        color: telaPromoConfig.btn_text_color,
                      }}
                    >
                      <Users size={14} />
                      <div className="flex items-baseline gap-1">
                        <span className="font-black text-sm leading-none tabular-nums">{hasData ? total.toLocaleString("pt-BR") : "—"}</span>
                        <span className="text-[10px] uppercase tracking-wider font-semibold opacity-90">Total</span>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent
                    side="bottom"
                    className="border border-white/15 p-0 overflow-hidden"
                    style={{ background: promoDarkGradient, color: telaPromoConfig.btn_text_color, borderColor: colorMix(telaPromoConfig.card_border_color, 32, "#ffffff") }}
                  >
                    {peakAudience ? (() => {
                      const d = new Date(peakAudience.timestamp);
                      const dataStr = d.toLocaleDateString("pt-BR");
                      const horaStr = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <div className="min-w-[220px]">
                          <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ background: promoAccentGradient, borderColor: colorMix(telaPromoConfig.card_border_color, 24, "#ffffff") }}>
                            <Trophy size={16} style={{ color: telaPromoConfig.btn_text_color }} />
                            <span className="text-[11px] font-black uppercase tracking-wider" style={{ color: telaPromoConfig.btn_text_color }}>Melhor audiência do dia</span>
                          </div>
                          <div className="px-3 py-2.5 space-y-1.5">
                            <div className="flex items-baseline gap-1.5">
                              <span className="text-2xl font-black tabular-nums leading-none" style={{ color: telaPromoConfig.btn_text_color }}>{peakAudience.total.toLocaleString("pt-BR")}</span>
                              <span className="text-[10px] uppercase tracking-wider opacity-70">espectadores</span>
                            </div>
                            <div className="text-[11px] opacity-90"><span className="opacity-60">Programa:</span> <span className="font-semibold">{peakAudience.programa}</span></div>
                            <div className="text-[11px] opacity-90"><span className="opacity-60">Locutor:</span> <span className="font-semibold">{peakAudience.locutor}</span></div>
                            <div className="text-[11px] opacity-90 flex items-center gap-2 pt-0.5">
                              <span><span className="opacity-60">Data:</span> {dataStr}</span>
                              <span><span className="opacity-60">Hora:</span> {horaStr}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAudienceDetailsOpen(true)}
                              className="mt-2 w-full py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all hover:brightness-110"
                              style={{ background: promoAccentGradient, color: telaPromoConfig.btn_text_color, border: `1px solid ${colorMix(telaPromoConfig.card_border_color, 32, "#ffffff")}` }}
                            >
                              Ver detalhes
                            </button>

                          </div>
                        </div>
                      );
                    })() : (
                      <div className="px-3 py-2.5 flex items-center gap-2 min-w-[200px]">
                        <Trophy size={14} style={{ color: telaPromoConfig.btn_color_b }} />
                        <span className="text-[11px] opacity-80">Aguardando primeira medição do dia…</span>
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          );
        })()}


        {/* Banner rotativo + capa do programa no ar */}
        {(() => {
          // Prioriza os programas que possuem citações cadastradas
          const scheduleList = filteredPrograms.length > 0 ? filteredPrograms : mergeProgramList(programas);
          const onAirIdx = onAirProgram
            ? scheduleList.findIndex(p => normalizeProgramName(p.nome) === normalizeProgramName(onAirProgram.nome))
            : -1;
          const activeIdx = coverIndex ?? (onAirIdx >= 0 ? onAirIdx : 0);
          const currentProg = (onAirIdx >= 0 && coverIndex === null ? scheduleList[onAirIdx] : null)
            ?? scheduleList[activeIdx]
            ?? (onAirProgram ? programas.find(p => normalizeProgramName(p.nome) === normalizeProgramName(onAirProgram.nome)) : null)
            ?? scheduleList[0]
            ?? (programas[0] as any)
            ?? null;
          const goPrev = (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (!scheduleList.length) return;
            setCoverSlideDir("left");
            setCoverIndex((activeIdx - 1 + scheduleList.length) % scheduleList.length);
          };
          const goNext = (e: React.MouseEvent) => {
            e.stopPropagation();
            e.preventDefault();
            if (!scheduleList.length) return;
            setCoverSlideDir("right");
            setCoverIndex((activeIdx + 1) % scheduleList.length);
          };
          return (
            <div className="w-full flex gap-4 items-stretch">
              <div className="flex-1 min-w-0 overflow-hidden rounded-xl shadow-2xl relative" style={{ height: 276 }}>
                {banners.length > 0 ? (
                  <div className="relative w-full h-full overflow-hidden">
                    <div
                      className="flex transition-transform duration-700 ease-in-out h-full"
                      style={{ transform: `translateX(-${currentBannerIndex * 100}%)` }}
                    >
                      {banners.map((banner) => (
                        <div key={banner.id} className="w-full h-full flex-shrink-0 flex items-center justify-center bg-black/20">
                          <img src={banner.imagem_url} alt={banner.texto} className="w-full h-full object-cover" />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-white/30">Nenhum banner ativo</div>
                )}

                {banners.length > 1 && (
                  <>
                    <button
                      onClick={() => changeBanner((currentBannerIndex - 1 + banners.length) % banners.length)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center z-10"
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <button
                      onClick={() => changeBanner((currentBannerIndex + 1) % banners.length)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full w-8 h-8 flex items-center justify-center z-10"
                    >
                      <ChevronRight size={20} />
                    </button>
                    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 items-center px-2.5 py-1.5 rounded-full backdrop-blur-md" style={{ backgroundColor: "rgba(0,0,0,0.35)" }}>
                      {banners.map((_, i) => (
                        <button key={i} onClick={() => changeBanner(i)} className="cursor-pointer flex items-center justify-center hover:opacity-80 transition-opacity" aria-label={`Ir para banner ${i + 1}`}>
                          <ProgressCircle active={i === currentBannerIndex} progress={i === currentBannerIndex ? bannerProgress : 0} />
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {currentProg && (
                <div
                  className="group/cover flex-shrink-0 rounded-xl overflow-hidden relative cursor-pointer transition-transform duration-200 hover:scale-[1.03] shadow-2xl border border-white/10"
                  style={{ width: 207, height: 276, contain: "paint", isolation: "isolate" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (currentProg) {
                      // Mantém a versão unificada do programa para que a busca da
                      // citação considere todos os IDs das grades duplicadas.
                      setSelectedProgram({
                        ...currentProg,
                        mergedIds: [...(currentProg.mergedIds || [currentProg.id])],
                        diasSemana: [...(currentProg.diasSemana || [])],
                        schedules: (currentProg.schedules || []).map(schedule => ({
                          ...schedule,
                          dias: [...schedule.dias],
                        })),
                      });
                      stopAutoScroll();
                    }
                  }}
                  title={`Citações - ${currentProg.nome}`}
                >
                  {/* Badge No Ar (se for o programa atual) */}
                  {onAirProgram && normalizeProgramName(onAirProgram.nome) === normalizeProgramName(currentProg.nome) ? (
                    <div className="pointer-events-none absolute top-2.5 left-2.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-md z-20 flex items-center gap-1.5 shadow-lg bg-red-600 text-white">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                      No Ar
                    </div>
                  ) : null}

                  {/* Badge Citações */}
                  <div
                    className="pointer-events-none absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold backdrop-blur-md z-20 whitespace-nowrap shadow-lg transition-opacity duration-200"
                    style={{ background: promoDarkGradient, color: telaPromoConfig.btn_text_color }}
                  >
                    Citações
                  </div>

                  {/* Imagem de Capa ou Fallback */}
                  {(() => {
                    const coverImg = currentProg.capa || (currentProg as any).thumb || (currentProg as any).selo || "";
                    if (coverImg) {
                      return (
                        <div
                          key={`${normalizeProgramName(currentProg.nome)}-${coverImg}`}
                          aria-label={currentProg.nome}
                          className="absolute inset-0 w-full h-full bg-cover bg-center bg-no-repeat"
                          style={{
                            backgroundImage: `url(${coverImg})`,
                            animation: `${coverSlideDir === "right" ? "cover-slide-in-right" : "cover-slide-in-left"} 320ms ease-out`,
                          }}
                        />
                      );
                    }
                    return (
                      <div
                        key={normalizeProgramName(currentProg.nome)}
                        className="absolute inset-0 w-full h-full flex flex-col items-center justify-center p-3 text-center"
                        style={{
                          background: "linear-gradient(180deg, #1e293b 0%, #0f172a 100%)",
                        }}
                      >
                        <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-2 text-red-400">
                          <Radio size={24} className="animate-pulse" />
                        </div>
                        <span className="text-xs font-bold text-white line-clamp-2">{currentProg.nome}</span>
                      </div>
                    );
                  })()}

                  {/* Gradiente inferior com nome do programa e indicação de clique */}
                  <div className="absolute inset-x-0 bottom-0 pt-8 pb-2 px-2.5 bg-gradient-to-t from-black/90 via-black/40 to-transparent z-10 flex flex-col justify-end pointer-events-none">
                    <span className="text-xs font-bold text-white leading-tight drop-shadow line-clamp-1">{currentProg.nome}</span>
                    <span className="text-[10px] text-white/70 drop-shadow">Clique para ver citação</span>
                  </div>

                  {scheduleList.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={goPrev}
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/85 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 pointer-events-none group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto transition-opacity z-20"
                        aria-label="Programa anterior"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={goNext}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/85 text-white rounded-full w-7 h-7 flex items-center justify-center opacity-0 pointer-events-none group-hover/cover:opacity-100 group-hover/cover:pointer-events-auto transition-opacity z-20"
                        aria-label="Próximo programa"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* Programas removidos conforme solicitado */}

        {/* Promoções */}
        {botoes.length > 0 && (
          <div>
            <h2 className="text-lg font-bold mb-4" style={{ color: "white" }}>Promoções</h2>

            <div className="grid grid-cols-4 gap-4">
              {botoes.map(promo => {
                const title = (promo.botao_url || promo.nome || "").toLowerCase();
                const PromoIcon =
                  title.includes("prêmio") || title.includes("premio") ? Gift :
                  title.includes("pizza") ? Pizza :
                  title.includes("burger") || title.includes("hambur") ? ShoppingBag :
                  title.includes("resenha") || title.includes("happy") || title.includes("cervej") || title.includes("chop") ? Beer :
                  title.includes("estrada") || title.includes("moviment") ? Truck :
                  title.includes("positiva") && title.includes("parada") ? Trophy :
                  title.includes("night") || title.includes("noite") || title.includes("cabaré") || title.includes("balada") ? PartyPopper :
                  title.includes("music") || title.includes("karaoke") || title.includes("palco") ? Music :
                  title.includes("amor") || title.includes("heart") || title.includes("namor") ? Heart :
                  title.includes("ingresso") || title.includes("ticket") ? Ticket :
                  title.includes("star") || title.includes("estrela") ? Star :
                  Sparkles;

                const cardRadius = telaPromoConfig.card_style === "sharp" ? "4px" : telaPromoConfig.card_style === "pill" ? "50px" : "16px";
                const buttonIcon = (promo as any).botao_icone_url || resolveSafePromoButton(promo);

                return (
                  <div
                    key={promo.id}
                    className="w-full h-16 cursor-pointer transition-all duration-200 flex items-center gap-3 px-4 font-bold text-sm outline-4 outline-transparent hover:scale-[1.03] shadow-lg overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${telaPromoConfig.btn_color_a} 0%, ${telaPromoConfig.btn_color_b} 100%)`,
                      color: telaPromoConfig.btn_text_color,
                      borderRadius: cardRadius,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.outline = `4px solid ${telaPromoConfig.card_border_color}`; }}
                    onMouseLeave={e => { e.currentTarget.style.outline = "4px solid transparent"; }}
                    onClick={() => setSelectedPromo(promo)}
                  >
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.25)" }}>
                      {buttonIcon ? (
                        <img src={buttonIcon} alt={promo.botao_url || promo.nome} className="w-7 h-7 object-contain" />
                      ) : (
                        <PromoIcon size={18} />
                      )}
                    </div>
                    <span className="truncate">{promo.botao_url || promo.nome}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Modal da Promoção */}
      <style>{`
        .promo-text-force-white,
        .promo-text-force-white * {
          color: white !important;
        }
      `}</style>

      {/* Dialog de detalhes de audiência do dia */}
      <Dialog open={audienceDetailsOpen} onOpenChange={setAudienceDetailsOpen}>
        <DialogContent className="max-w-3xl text-white border border-white/10 p-0 overflow-hidden" style={{ backgroundColor: "#0a0a0a" }}>
          <DialogHeader className="px-5 py-4 border-b border-white/10" style={{ background: "linear-gradient(90deg, rgba(215,13,14,0.6), rgba(0,0,0,0))" }}>
            <DialogTitle className="flex items-center gap-2 text-white">
              <Trophy size={18} style={{ color: "#ffffff" }} />
              Audiência do dia
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 pt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg p-3 border border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Programa</div>
              <div className="text-sm font-bold truncate">{peakAudience?.programa || "—"}</div>
            </div>
            <div className="rounded-lg p-3 border border-white/10" style={{ backgroundColor: "rgba(255,255,255,0.04)" }}>
              <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Locutor</div>
              <div className="text-sm font-bold truncate">{peakAudience?.locutor || "—"}</div>
            </div>
            <div className="rounded-lg p-3 border" style={{ background: "linear-gradient(135deg, #d70d0e 0%, #000 100%)", borderColor: "rgba(255,255,255,0.2)" }}>
              <div className="text-[10px] uppercase tracking-wider opacity-80 mb-1 text-white">Pico do dia</div>
              <div className="text-2xl font-black tabular-nums leading-none text-white">{peakAudience ? peakAudience.total.toLocaleString("pt-BR") : "—"}</div>
              {peakAudience && (
                <div className="text-[10px] opacity-80 mt-1 text-white">
                  {new Date(peakAudience.timestamp).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-4">
            <div className="text-[11px] uppercase tracking-wider opacity-60 mb-2">Evolução ao longo do dia</div>
            <div className="w-full h-[300px] rounded-lg border border-white/10 p-2" style={{ backgroundColor: "rgba(255,255,255,0.02)" }}>
              {audienceChartLoading ? (
                <div className="w-full h-full flex items-center justify-center text-white/60 text-sm">Carregando…</div>
              ) : audienceChart.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-white/50 text-sm">Sem dados registrados hoje.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={audienceChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradAudio" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#d70d0e" stopOpacity={0.85} />
                        <stop offset="100%" stopColor="#d70d0e" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradVideo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#ffffff" stopOpacity={0.03} />
                      </linearGradient>
                      <linearGradient id="gradTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#d70d0e" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                    <XAxis dataKey="hora" stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="rgba(255,255,255,0.6)" tick={{ fontSize: 11 }} />
                    <RTooltip
                      contentStyle={{ backgroundColor: "#000", border: "1px solid #d70d0e", color: "#fff", borderRadius: 8 }}
                      labelStyle={{ color: "#ffffff", fontWeight: 700 }}
                      itemStyle={{ color: "#ffffff" }}
                    />
                    <Legend wrapperStyle={{ color: "#fff", fontSize: 12 }} />
                    <Area type="monotone" dataKey="audio" name="Áudio" stroke="#d70d0e" strokeWidth={2.5} fill="url(#gradAudio)" />
                    <Area type="monotone" dataKey="video" name="Vídeo" stroke="#ffffff" strokeWidth={2} fill="url(#gradVideo)" />
                    <Area type="monotone" dataKey="total" name="Total" stroke="#ffffff" strokeWidth={2} strokeDasharray="4 3" fill="none" />

                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedPromo} onOpenChange={(open) => { 
        if (!open) closePromoModal(); 
        else {
          // Reset scroll to top when opening the modal
          setTimeout(() => {
            if (modalScrollRef.current) {
              modalScrollRef.current.scrollTop = 0;
            }
          }, 0);
        }
      }}>
        <DialogContent className="promo-text-force-white border-zinc-800 text-white max-w-2xl w-[95vw] sm:w-full h-[85vh] sm:h-[80vh] overflow-hidden flex flex-col p-0 [&>button]:bg-white [&>button]:text-zinc-900 [&>button]:rounded-full [&>button]:w-9 [&>button]:h-9 [&>button]:flex [&>button]:items-center [&>button]:justify-center [&>button]:shadow-lg [&>button]:hover:bg-red-500 [&>button]:hover:text-white [&>button]:transition-all [&>button]:top-3 [&>button]:right-3 [&>button_svg]:w-5 [&>button_svg]:h-5" style={{ backgroundColor: "#111111" }}>
          <DialogTitle className="sr-only">{selectedPromo?.nome || "Detalhes da Promoção"}</DialogTitle>
          {/* Banner fixo no topo com padding */}
          {selectedPromo?.imagem_url && (
            <div className="flex-shrink-0 pt-4 px-4">
              <img src={selectedPromo.imagem_url} alt="Banner" className="w-full object-contain max-h-[220px] rounded-lg" />
            </div>
          )}

          {/* Período com ícone de calendário */}
          <div className="px-4 pt-2 text-xs flex items-center gap-1.5 flex-shrink-0" style={{ color: "rgba(255, 255, 255, 0.6)" }}>
            <Calendar size={12} />
            <span>Período: {selectedPromo?.data_inicio} a {selectedPromo?.data_fim}</span>
          </div>

          {/* Controles teleprompter - painel estilizado */}
          <div className="flex-shrink-0 px-4 pt-2">
            {renderTeleprompterControls("promo")}
          </div>

          {/* Corpo: texto + oferecimento dentro do scroll, alinhado ao X */}
          <div ref={modalScrollRef} className="overflow-y-auto flex-1 min-h-0 promo-scroll px-4 sm:px-6 pb-6 mr-[1px]">
            <div
              className="font-bold promo-html-content whitespace-pre-wrap ql-editor !p-0 [&_*]:!bg-transparent [&_p]:!bg-transparent [&_span]:!bg-transparent [&_div]:!bg-transparent [&_ul]:!bg-transparent [&_ol]:!bg-transparent [&_li]:!bg-transparent"
              style={{ fontSize: `${fontSize}px`, lineHeight: 1.4, color: "white", wordBreak: "normal", overflowWrap: "break-word", hyphens: "none", maxWidth: "100%" }}
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize((selectedPromo?.texto || "")
                  .replace(/<p><br><\/p>/g, '<p>&nbsp;</p>')
                  .replace(/<p><\/p>/g, '<p>&nbsp;</p>')
                  .replace(/color:\s*(?:rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)|#[0-9a-f]+)/gi, "color: white")
                  .replace(/background-color:\s*[^;"]+;?/gi, "background-color: transparent"), {
                  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div', 'ul', 'ol', 'li'],
                  ALLOWED_ATTR: ['style', 'class']
                }),
              }}
            />

            {/* Oferecimento dentro do scroll, após o texto */}
            {selectedPromo?.oferecimento && selectedPromo.oferecimento !== "-" && (
              <div className="mt-6 pt-4 border-t border-white/10 text-center">
                <span className="text-sm uppercase tracking-wider" style={{ color: "rgba(255, 255, 255, 0.5)" }}>Oferecimento</span>
                <div
                  className="text-lg sm:text-xl font-bold mt-2 promo-html-content whitespace-pre-wrap [&_*]:!bg-transparent [&_p]:!bg-transparent [&_span]:!bg-transparent [&_div]:!bg-transparent [&_ul]:!bg-transparent [&_ol]:!bg-transparent [&_li]:!bg-transparent"
                  style={{ color: "white", lineHeight: 1.4, wordBreak: "normal", overflowWrap: "break-word", hyphens: "none", maxWidth: "100%" }}
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(selectedPromo.oferecimento
                      .replace(/\/\//g, "<br/>")
                      .replace(/<p><br><\/p>/g, '<p>&nbsp;</p>')
                      .replace(/<p><\/p>/g, '<p>&nbsp;</p>')
                      .replace(/color:\s*(?:rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)|#[0-9a-f]+)/gi, "color: white")
                      .replace(/background-color:\s*[^;"]+;?/gi, "background-color: transparent"), {
                      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div', 'ul', 'ol', 'li'],
                      ALLOWED_ATTR: ['style', 'class']
                    }),
                  }}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Programação */}
      <Dialog open={!!selectedProgram} onOpenChange={(open) => { 
        if (!open) closeProgramModal(); 
        else {
          // Reset scroll to top when opening the modal
          setTimeout(() => {
            if (programModalScrollRef.current) {
              programModalScrollRef.current.scrollTop = 0;
            }
          }, 0);
        }
      }}>
        <DialogContent className="border-zinc-800 text-white max-w-[1500px] w-[96vw] h-[88vh] sm:h-[86vh] overflow-hidden p-0 [&>button]:!w-10 [&>button]:!h-10 [&>button]:!rounded-full [&>button]:!flex [&>button]:!items-center [&>button]:!justify-center [&>button]:!text-white [&>button]:!font-bold [&>button]:!transition [&>button]:!shadow-[0_0_12px_rgba(0,0,0,0.4)] [&>button]:hover:!scale-110 [&>button]:!top-3 [&>button]:!right-3 [&>button_svg]:!w-[18px] [&>button_svg]:!h-[18px] [&>button]:!border-none" style={{ backgroundColor: "#111111", "--layout-accent-color": "var(--layout-accent-color, #a60101)" } as any}>
          <DialogTitle className="sr-only">Citações do Programa {selectedProgram?.nome}</DialogTitle>
          {/* Custom style to override shadcn close button colors to match theme */}
          <style>{`
            [data-state=open] .promo-dialog-close-theme button {
              background-color: var(--layout-accent-color, #a60101) !important;
            }
          `}</style>
          <div className="promo-dialog-close-theme h-full flex flex-col">

          {/* Botões de ajuste de fonte ao lado esquerdo do botão fechar */}
          <div className="absolute top-3 right-16 z-50 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFontSize(s => Math.max(12, s - 2))}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold hover:scale-110 transition shadow-[0_0_12px_rgba(0,0,0,0.4)]"
              style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}
              title="Diminuir texto"
            >
              <Minus size={18} />
            </button>
            <button
              type="button"
              onClick={() => setFontSize(s => Math.min(56, s + 2))}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold hover:scale-110 transition shadow-[0_0_12px_rgba(0,0,0,0.4)]"
              style={{ backgroundColor: "var(--layout-accent-color, #a60101)" }}
              title="Aumentar texto"
            >
              <Plus size={18} />
            </button>
          </div>
          <div className="flex flex-col flex-1 min-h-0 min-w-0 h-full">
              {/* Header com Logo e Horário */}
              <div className="px-4 sm:px-6 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-white/10 flex-shrink-0 gap-3" style={{ backgroundColor: "rgba(255,255,255,0.03)" }}>
                  <div className="flex items-center gap-4">
                    {(() => {
                      const dlgCover = selectedProgram?.capa || (selectedProgram as any)?.thumb || (selectedProgram as any)?.selo || "";
                      if (dlgCover) {
                        return (
                          <div className="w-16 h-16 rounded-xl overflow-hidden shadow-lg border border-white/10 flex-shrink-0">
                            <img src={dlgCover} alt={selectedProgram?.nome} className="w-full h-full object-cover" />
                          </div>
                        );
                      }
                      return (
                        <div className="w-16 h-16 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0 text-red-400 border border-white/10">
                          <Radio size={24} />
                        </div>
                      );
                    })()}
                    <div className="flex flex-col">
                      <h2 className="text-xl font-black tracking-tight" style={{ color: "white" }}>{selectedProgram?.nome}</h2>
                      <div className="flex items-center gap-2 mt-1">
                        <Clock size={14} className="text-white/40" />
                        {selectedProgram?.schedules && selectedProgram.schedules.length > 0 ? (
                          selectedProgram.schedules.map((s, i) => (
                            <div key={i} className="text-sm font-bold" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                              {s.horarioInicio.slice(0, 5)} às {s.horarioFim.slice(0, 5)}
                              {s.dias.length > 0 && <span className="text-[10px] ml-1 opacity-50 font-normal">({s.dias.join(", ")})</span>}
                            </div>
                          ))
                        ) : (
                          <div className="text-sm font-bold" style={{ color: "rgba(255, 255, 255, 0.7)" }}>
                            {selectedProgram?.horarioInicio.slice(0, 5)} às {selectedProgram?.horarioFim.slice(0, 5)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
              </div>


              {/* Container principal sem scroll lateral, permitindo que os boxes individuais tenham scroll interno se necessário */}
              <div className="flex-1 min-h-0 px-4 sm:px-8 pb-32 flex flex-col items-center">
                {(() => {
                  const tests = selectedProgram ? getTestemunhaisForProgram(selectedProgram) : [];
                  if (tests.length === 0) {
                    return (
                      <div className="flex flex-col items-center justify-center gap-3 py-10 text-center w-full">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                          <MessageSquareQuote size={22} style={{ color: "rgba(255,255,255,0.3)" }} />
                        </div>
                        <p className="text-sm" style={{ color: "rgba(255, 255, 255, 0.4)" }}>Nenhuma citação disponível para este programa.</p>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col w-full py-4 h-full">
                      {tests.map((t) => (
                        <div
                          key={t.id}
                          className="relative rounded-2xl overflow-hidden border border-white/10 shadow-xl w-full mb-12 last:mb-0 flex flex-col max-h-full"
                          style={{ backgroundColor: "#1a1a1a" }}
                        >
                          {/* Barra de destaque no topo */}
                          <div className="h-1 w-full flex-shrink-0" style={{ backgroundColor: (t as any).is_promo ? "#00BFF0" : "var(--layout-accent-color, #a60101)" }} />

                          <div className="p-6 sm:p-8 overflow-y-auto promo-scroll min-h-0 flex-1">
                            {/* Imagem do testemunhal removida conforme solicitado */}

                            <div
                              className="font-bold promo-html-content whitespace-pre-wrap ql-editor !p-0 [&_*]:!bg-transparent [&_p]:!bg-transparent [&_span]:!bg-transparent [&_div]:!bg-transparent [&_ul]:!bg-transparent [&_ol]:!bg-transparent [&_li]:!bg-transparent max-w-full"
                              style={{ 
                                fontSize: `${fontSize}px`, 
                                lineHeight: 1.5, 
                                color: "white",
                                 wordBreak: "normal",
                                 overflowWrap: "break-word",
                                 hyphens: "none",
                                display: "block"
                              }}
                              dangerouslySetInnerHTML={{
                                __html: DOMPurify.sanitize(t.texto
                                  .replace(/<p><br><\/p>/g, '<p>&nbsp;</p>')
                                  .replace(/<p><\/p>/g, '<p>&nbsp;</p>')
                                  .replace(/color:\s*(?:rgb\(\s*\d+[\s,]+\d+[\s,]+\d+\s*\)|#[0-9a-f]+)/gi, "color: white")
                                  .replace(/background-color:\s*[^;"]+;?/gi, "background-color: transparent")
                                  .replace(/font-size\s*:\s*[^;\"]+;?/gi, ""), {
                                  ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'span', 'div', 'ul', 'ol', 'li'],
                                  ALLOWED_ATTR: ['style', 'class']
                                }),
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}

              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

