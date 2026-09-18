import { supabase } from "@/integrations/supabase/client";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";

export interface HouseMixProgram {
  id: string;
  user_id?: string;
  nome: string;
  estudio: string;
  horario_inicio: string;
  horario_fim: string;
  dias_semana: string[];
  ativo: boolean;
  apresentador_id?: string | null;
  apresentadores_ids?: string[];
  tipo_programa?: string | null;
  descricao?: string | null;
  selo?: string | null;
  capa?: string | null;
  thumb?: string | null;
  cliente_id?: string | null;
  cliente_nome?: string | null;
}

const STORAGE_CUSTOM_PROGRAMS_KEY = "nexohub_housemix_programs_v2";
const STORAGE_CUSTOM_ESTUDIOS_KEY = "nexohub_housemix_estudios_v2";

// Normaliza nomes de emissoras/clientes para chaves canônicas (lidando com variações e typos como INETRATIVA)
export function normalizeClientKey(rawName?: string | null): string {
  if (!rawName) return "";
  let clean = rawName
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  // Tratamento de typos conhecidos
  if (clean.includes("INETRATIVA") || clean.includes("INTERATIVA")) {
    return "INTERATIVA FM";
  }
  if (clean.includes("CULTURA")) {
    return "CULTURA FM";
  }
  if (clean.includes("JORNAL")) {
    return "JORNAL FM";
  }
  if (clean.includes("POSITIVA")) {
    return "POSITIVA FM";
  }
  if (clean.includes("NEXO")) {
    return "NEXO BRASIL";
  }

  return clean;
}

// Grades e Estúdios Oficiais Padrão por Emissora/Cliente
export const DEFAULT_STATION_DATA: Record<
  string,
  {
    estudios: string[];
    programas: Omit<HouseMixProgram, "id" | "ativo">[];
  }
> = {
  "INTERATIVA FM": {
    estudios: [
      "ESTÚDIO FM",
      "ESTÚDIO GRAVAÇÃO & PODCAST",
    ],
    programas: [
      {
        nome: "INTERATIVA AO VIVO & TALKS",
        estudio: "ESTÚDIO GRAVAÇÃO & PODCAST",
        horario_inicio: "20:00:00",
        horario_fim: "22:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Entrevista",
        descricao: "Mesa redonda, podcasts ao vivo com convidados e interatividade.",
      },
    ],
  },

  "CULTURA FM": {
    estudios: [
      "ESTÚDIO PRINCIPAL (AO VIVO)",
      "ESTÚDIO JORNALISMO",
      "ESTÚDIO GRAVAÇÃO",
    ],
    programas: [
      {
        nome: "MADRUGADA CULTURA",
        estudio: "ESTÚDIO PRINCIPAL (AO VIVO)",
        horario_inicio: "00:00:00",
        horario_fim: "06:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
        tipo_programa: "Musical",
        descricao: "Música selecionada e clássicos inesquecíveis da Cultura FM.",
      },
      {
        nome: "BOM DIA CULTURA",
        estudio: "ESTÚDIO JORNALISMO",
        horario_inicio: "06:00:00",
        horario_fim: "08:30:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Jornalístico",
        descricao: "O primeiro jornal do dia com cobertura das cidades e trânsito.",
      },
      {
        nome: "SHOW DA MANHÃ CULTURA",
        estudio: "ESTÚDIO PRINCIPAL (AO VIVO)",
        horario_inicio: "08:30:00",
        horario_fim: "12:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
        tipo_programa: "Musical",
        descricao: "Apresentação ao vivo, prêmios e recados da audiência.",
      },
      {
        nome: "CULTURA SERTANEJA",
        estudio: "ESTÚDIO PRINCIPAL (AO VIVO)",
        horario_inicio: "12:00:00",
        horario_fim: "14:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
        tipo_programa: "Musical",
        descricao: "O melhor da música sertaneja raiz e modas de viola.",
      },
      {
        nome: "TARDE CULTURA 97",
        estudio: "ESTÚDIO PRINCIPAL (AO VIVO)",
        horario_inicio: "14:00:00",
        horario_fim: "18:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Musical",
        descricao: "Grandes sucessos nacionais e internacionais.",
      },
      {
        nome: "CULTURA MIX",
        estudio: "ESTÚDIO PRINCIPAL (AO VIVO)",
        horario_inicio: "18:00:00",
        horario_fim: "19:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Musical",
        descricao: "Sucessos do momento e informações da tarde.",
      },
      {
        nome: "VOZ DO BRASIL",
        estudio: "ESTÚDIO PRINCIPAL (AO VIVO)",
        horario_inicio: "19:00:00",
        horario_fim: "20:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Jornalístico",
        descricao: "Transmissão oficial governamental.",
      },
      {
        nome: "NOITE CULTURA ESPECIAL",
        estudio: "ESTÚDIO GRAVAÇÃO",
        horario_inicio: "20:00:00",
        horario_fim: "23:59:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
        tipo_programa: "Musical",
        descricao: "Programação especial noturna com clássicos e romantismo.",
      },
      {
        nome: "FIM DE SEMANA CULTURA",
        estudio: "ESTÚDIO PRINCIPAL (AO VIVO)",
        horario_inicio: "06:00:00",
        horario_fim: "12:00:00",
        dias_semana: ["Sábado", "Domingo"],
        tipo_programa: "Musical",
        descricao: "As melhores músicas para relaxar no fim de semana.",
      },
      {
        nome: "ESPECIAL DE DOMINGO",
        estudio: "ESTÚDIO PRINCIPAL (AO VIVO)",
        horario_inicio: "14:00:00",
        horario_fim: "20:00:00",
        dias_semana: ["Sábado", "Domingo"],
        tipo_programa: "Musical",
        descricao: "Seleção musical premium para fechar o final de semana.",
      },
    ],
  },

  "JORNAL FM": {
    estudios: [
      "ESTÚDIO PRINCIPAL / AO VIVO",
      "ESTÚDIO DE REDAÇÃO",
      "ESTÚDIO PODCAST",
    ],
    programas: [
      {
        nome: "MADRUGADA JORNAL FM",
        estudio: "ESTÚDIO PRINCIPAL / AO VIVO",
        horario_inicio: "00:00:00",
        horario_fim: "06:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
        tipo_programa: "Musical",
        descricao: "Música e notícias da madrugada na 96.5.",
      },
      {
        nome: "JORNAL DA MANHÃ",
        estudio: "ESTÚDIO DE REDAÇÃO",
        horario_inicio: "06:00:00",
        horario_fim: "09:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Jornalístico",
        descricao: "Análise dos principais fatos da política, economia e cidades.",
      },
      {
        nome: "JORNAL FM EM DEBATE",
        estudio: "ESTÚDIO PRINCIPAL / AO VIVO",
        horario_inicio: "09:00:00",
        horario_fim: "11:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Entrevista",
        descricao: "Debates acalorados com líderes comunitários e especialistas.",
      },
      {
        nome: "GIRO REGIONAL",
        estudio: "ESTÚDIO DE REDAÇÃO",
        horario_inicio: "11:00:00",
        horario_fim: "13:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Jornalístico",
        descricao: "Correspondentes de todas as regiões com notícias em tempo real.",
      },
      {
        nome: "JORNAL DA TARDE",
        estudio: "ESTÚDIO PRINCIPAL / AO VIVO",
        horario_inicio: "13:00:00",
        horario_fim: "16:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Jornalístico",
        descricao: "Informação e prestação de serviço nas tardes da Jornal FM.",
      },
      {
        nome: "RADAR JORNAL",
        estudio: "ESTÚDIO PRINCIPAL / AO VIVO",
        horario_inicio: "16:00:00",
        horario_fim: "19:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Jornalístico",
        descricao: "Resumo do dia, trânsito e manchetes da noite.",
      },
      {
        nome: "VOZ DO BRASIL",
        estudio: "ESTÚDIO PRINCIPAL / AO VIVO",
        horario_inicio: "19:00:00",
        horario_fim: "20:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Jornalístico",
        descricao: "Transmissão obrigatória oficial.",
      },
      {
        nome: "NOITE DE NOTÍCIAS & SUCESSOS",
        estudio: "ESTÚDIO PODCAST",
        horario_inicio: "20:00:00",
        horario_fim: "23:59:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
        tipo_programa: "Show",
        descricao: "Música e o resumo dos principais acontecimentos do Brasil e do mundo.",
      },
      {
        nome: "JORNAL DE SÁBADO & DOMINGO",
        estudio: "ESTÚDIO DE REDAÇÃO",
        horario_inicio: "06:00:00",
        horario_fim: "12:00:00",
        dias_semana: ["Sábado", "Domingo"],
        tipo_programa: "Jornalístico",
        descricao: "Edições especiais de fim de semana e esportes.",
      },
      {
        nome: "PANORAMA DO FIM DE SEMANA",
        estudio: "ESTÚDIO PRINCIPAL / AO VIVO",
        horario_inicio: "12:00:00",
        horario_fim: "20:00:00",
        dias_semana: ["Sábado", "Domingo"],
        tipo_programa: "Show",
        descricao: "Transmissão esportiva, notícias e música.",
      },
    ],
  },

  "POSITIVA FM": {
    estudios: [
      "ESTÚDIO FM",
      "ESTÚDIO PODCAST",
    ],
    programas: [
      {
        nome: "SERTANEJO BOM DEMAIS - 1ª EDIÇÃO",
        estudio: "ESTÚDIO FM",
        horario_inicio: "04:00:00",
        horario_fim: "07:24:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Musical",
        descricao: "Domine o pico da manhã com a credibilidade de Reginaldo Lucena: Sua marca será a primeira voz a impulsionar o dia da com alta frequência, informação e muito alto astral.",
        apresentador_id: "90ca4858-935e-4b87-a83a-224263fd269d",
        apresentadores_ids: ["90ca4858-935e-4b87-a83a-224263fd269d"],
      },
      {
        nome: "SERTANEJO BOM DEMAIS - 1ª EDIÇÃO - SÁBADO",
        estudio: "ESTÚDIO FM",
        horario_inicio: "05:00:00",
        horario_fim: "07:24:00",
        dias_semana: ["Sábado"],
        tipo_programa: "Musical",
        descricao: "Edição de sábado do Sertanejo Bom Demais com Reginaldo Lucena.",
        apresentador_id: "90ca4858-935e-4b87-a83a-224263fd269d",
        apresentadores_ids: ["90ca4858-935e-4b87-a83a-224263fd269d"],
      },
      {
        nome: "PRIMEIRA HORA POSITIVA",
        estudio: "ESTÚDIO FM",
        horario_inicio: "07:24:00",
        horario_fim: "08:30:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Jornalístico",
        descricao: "O primeiro jornal do dia com as principais notícias com Alysson Lima.",
        apresentador_id: "04205a8e-cdca-409d-a879-ad21a61dcefa",
        apresentadores_ids: ["04205a8e-cdca-409d-a879-ad21a61dcefa"],
      },
      {
        nome: "BOM DIA POSITIVA",
        estudio: "ESTÚDIO FM",
        horario_inicio: "08:30:00",
        horario_fim: "12:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"],
        tipo_programa: "Musical",
        descricao: "A voz que domina um dos melhores horários comerciais do rádio com Márcio Rodrigues.",
        apresentador_id: "f3601b21-fd66-4795-9021-4d91992e3b6e",
        apresentadores_ids: ["f3601b21-fd66-4795-9021-4d91992e3b6e"],
      },
      {
        nome: "FLASHBACK POSITIVA",
        estudio: "ESTÚDIO FM",
        horario_inicio: "12:00:00",
        horario_fim: "13:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Musical",
        descricao: "Os grandes clássicos que marcaram época com Jonathas Mattos.",
        apresentador_id: "5889d956-ed6a-4089-846e-159eb54bc474",
        apresentadores_ids: ["5889d956-ed6a-4089-846e-159eb54bc474"],
      },
      {
        nome: "FLASHBACK POSITIVA - SÁBADO",
        estudio: "ESTÚDIO FM",
        horario_inicio: "12:00:00",
        horario_fim: "13:00:00",
        dias_semana: ["Sábado"],
        tipo_programa: "Musical",
        descricao: "Edição de sábado do Flashback Positiva com Jonathas Mattos.",
        apresentador_id: "5889d956-ed6a-4089-846e-159eb54bc474",
        apresentadores_ids: ["5889d956-ed6a-4089-846e-159eb54bc474"],
      },
      {
        nome: "WHATSAPP POSITIVA",
        estudio: "ESTÚDIO FM",
        horario_inicio: "13:00:00",
        horario_fim: "16:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Musical",
        descricao: "Participação dos ouvintes pelo WhatsApp com Jonathas Mattos.",
        apresentador_id: "5889d956-ed6a-4089-846e-159eb54bc474",
        apresentadores_ids: ["5889d956-ed6a-4089-846e-159eb54bc474"],
      },
      {
        nome: "WHATSAPP POSITIVA - SÁBADO",
        estudio: "ESTÚDIO FM",
        horario_inicio: "14:00:00",
        horario_fim: "16:00:00",
        dias_semana: ["Sábado"],
        tipo_programa: "Musical",
        descricao: "Edição de sábado do WhatsApp Positiva com Vanessa Reis.",
        apresentador_id: "9d64c3c7-d45c-4cf5-b941-333e7eed8c85",
        apresentadores_ids: ["9d64c3c7-d45c-4cf5-b941-333e7eed8c85"],
      },
      {
        nome: "SERTANEJO BOM DEMAIS - 2ª EDIÇÃO",
        estudio: "ESTÚDIO FM",
        horario_inicio: "16:00:00",
        horario_fim: "19:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Musical",
        descricao: "Segunda edição do Sertanejo Bom Demais com Vanessa Reis.",
        apresentador_id: "9d64c3c7-d45c-4cf5-b941-333e7eed8c85",
        apresentadores_ids: ["9d64c3c7-d45c-4cf5-b941-333e7eed8c85"],
      },
      {
        nome: "SERTANEJO BOM DEMAIS - 2ª EDIÇÃO - SÁBADO",
        estudio: "ESTÚDIO FM",
        horario_inicio: "16:00:00",
        horario_fim: "19:00:00",
        dias_semana: ["Sábado"],
        tipo_programa: "Musical",
        descricao: "Segunda edição de sábado do Sertanejo Bom Demais com Vanessa Reis.",
        apresentador_id: "9d64c3c7-d45c-4cf5-b941-333e7eed8c85",
        apresentadores_ids: ["9d64c3c7-d45c-4cf5-b941-333e7eed8c85"],
      },
      {
        nome: "VALE NIGHT",
        estudio: "ESTÚDIO FM",
        horario_inicio: "19:00:00",
        horario_fim: "22:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Musical",
        descricao: "A melhor seleção musical para a sua noite com Jonathas Mattos.",
        apresentador_id: "5889d956-ed6a-4089-846e-159eb54bc474",
        apresentadores_ids: ["5889d956-ed6a-4089-846e-159eb54bc474"],
      },
      {
        nome: "PALCO POSITIVA",
        estudio: "ESTÚDIO FM",
        horario_inicio: "19:00:00",
        horario_fim: "23:59:00",
        dias_semana: ["Sábado", "Domingo"],
        tipo_programa: "Musical",
        descricao: "Shows ao vivo e as melhores apresentações com Jonathas Mattos.",
        apresentador_id: "5889d956-ed6a-4089-846e-159eb54bc474",
        apresentadores_ids: ["5889d956-ed6a-4089-846e-159eb54bc474"],
      },
      {
        nome: "CONVERSAS EMPREENDEDORAS",
        estudio: "ESTÚDIO PODCAST",
        horario_inicio: "20:00:00",
        horario_fim: "20:59:59",
        dias_semana: ["Quarta"],
        tipo_programa: "Entrevista",
        descricao: "Entrevistas sobre negócios e empreendedorismo.",
      },
      {
        nome: "BATE PAPO 2.0",
        estudio: "ESTÚDIO PODCAST",
        horario_inicio: "14:00:00",
        horario_fim: "15:00:00",
        dias_semana: ["Quarta"],
        tipo_programa: "Entrevista",
        descricao: "Debates e entrevistas especiais.",
      },
    ],
  },

  "NEXO BRASIL": {
    estudios: [
      "ESTÚDIO MASTER 01",
      "ESTÚDIO BROADCAST",
      "ESTÚDIO PODCAST / VÍDEO",
    ],
    programas: [
      {
        nome: "NEXO NOTÍCIAS & MERCADO",
        estudio: "ESTÚDIO BROADCAST",
        horario_inicio: "07:00:00",
        horario_fim: "09:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Jornalístico",
        descricao: "Panorama do mercado publicitário, mídia e inovações digitais.",
      },
      {
        nome: "NEXO BRASIL AO VIVO",
        estudio: "ESTÚDIO MASTER 01",
        horario_inicio: "09:00:00",
        horario_fim: "12:00:00",
        dias_semana: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        tipo_programa: "Show",
        descricao: "Transmissão multiplataforma oficial da agência Nexo Brasil.",
      },
      {
        nome: "PODCAST NEXO TALKS",
        estudio: "ESTÚDIO PODCAST / VÍDEO",
        horario_inicio: "14:00:00",
        horario_fim: "16:00:00",
        dias_semana: ["Segunda", "Quarta", "Sexta"],
        tipo_programa: "Entrevista",
        descricao: "Conversas com grandes nomes da comunicação e tecnologia.",
      },
    ],
  },
};

// Obter programas personalizados salvos no localStorage
export function getStoredCustomPrograms(): Record<string, HouseMixProgram[]> {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_PROGRAMS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Salvar programa personalizado para um cliente
export function saveCustomProgram(prog: HouseMixProgram, clientKeyOrId: string) {
  try {
    const all = getStoredCustomPrograms();
    const norm = normalizeClientKey(clientKeyOrId) || clientKeyOrId;
    const current = all[norm] || [];
    const progNormName = (prog.nome || "").trim().toUpperCase();
    const idx = current.findIndex((p) => 
      p.id === prog.id || 
      (progNormName && (p.nome || "").trim().toUpperCase() === progNormName)
    );
    if (idx >= 0) {
      current[idx] = { ...current[idx], ...prog };
    } else {
      current.push(prog);
    }
    all[norm] = current;
    localStorage.setItem(STORAGE_CUSTOM_PROGRAMS_KEY, JSON.stringify(all));

    if (prog.estudio) {
      saveCustomStudio(prog.estudio, norm);
    }

    try {
      window.dispatchEvent(new CustomEvent("housemix:programas-updated", { detail: { clientKey: norm, program: prog } }));
    } catch {}
  } catch (err) {
    console.warn("Erro ao salvar programa personalizado House Mix:", err);
  }
}

// Remover programa personalizado
export function removeCustomProgram(programId: string, clientKeyOrId?: string) {
  try {
    const all = getStoredCustomPrograms();
    if (clientKeyOrId) {
      const norm = normalizeClientKey(clientKeyOrId) || clientKeyOrId;
      if (all[norm]) {
        all[norm] = all[norm].filter(p => p.id !== programId);
      }
    } else {
      Object.keys(all).forEach(key => {
        all[key] = (all[key] || []).filter(p => p.id !== programId);
      });
    }
    localStorage.setItem(STORAGE_CUSTOM_PROGRAMS_KEY, JSON.stringify(all));
    try {
      window.dispatchEvent(new CustomEvent("housemix:programas-updated", { detail: { programId } }));
    } catch {}
  } catch (err) {
    console.warn("Erro ao remover programa personalizado House Mix:", err);
  }
}

// Obter estúdios personalizados salvos no localStorage
export function getStoredCustomEstudios(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_ESTUDIOS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Salvar estúdio personalizado para um cliente
export function saveCustomStudio(estudioName: string, clientKeyOrId: string) {
  try {
    const trimName = estudioName.trim().toUpperCase();
    if (!trimName) return;
    const all = getStoredCustomEstudios();
    const norm = normalizeClientKey(clientKeyOrId) || clientKeyOrId;
    const current = all[norm] || [];
    if (!current.includes(trimName)) {
      current.push(trimName);
      all[norm] = current;
      localStorage.setItem(STORAGE_CUSTOM_ESTUDIOS_KEY, JSON.stringify(all));
    }
  } catch (err) {
    console.warn("Erro ao salvar estúdio personalizado House Mix:", err);
  }
}

// Remover estúdio personalizado
export function removeCustomStudio(estudioName: string, clientKeyOrId?: string) {
  try {
    const trimName = estudioName.trim().toUpperCase();
    if (!trimName) return;
    const all = getStoredCustomEstudios();
    if (clientKeyOrId) {
      const norm = normalizeClientKey(clientKeyOrId) || clientKeyOrId;
      if (all[norm]) {
        all[norm] = all[norm].filter(e => e.toUpperCase() !== trimName);
      }
    } else {
      Object.keys(all).forEach(key => {
        all[key] = (all[key] || []).filter(e => e.toUpperCase() !== trimName);
      });
    }
    localStorage.setItem(STORAGE_CUSTOM_ESTUDIOS_KEY, JSON.stringify(all));
  } catch (err) {
    console.warn("Erro ao remover estúdio personalizado House Mix:", err);
  }
}

/**
 * Resolve e retorna a grade completa de programas e estúdios de um cliente de forma síncrona.
 * Compatível tanto como Array (com .map(), etc.) quanto como Objeto ({ programas, estudios }).
 */
export function getClientHouseMixProgramsSync(
  cliente: { id?: string; user_id?: string; nome?: string; nome_empresarial?: string; categoria?: string } | string | null | undefined,
  supabaseProgramas: any = []
): any {
  if (!cliente) {
    const empty: any = [];
    empty.programas = [];
    empty.estudios = [];
    return empty;
  }

  let clientObj: { id?: string; user_id?: string; nome?: string; nome_empresarial?: string } = {};
  if (typeof cliente === "string") {
    const acc = findClientAccountById(cliente) || findClientAccountByEmail(cliente);
    clientObj = {
      id: acc?.id || cliente,
      user_id: acc?.id || cliente,
      nome: acc?.nome || cliente,
      nome_empresarial: acc?.razaoSocial || acc?.nome || cliente,
    };
  } else {
    clientObj = cliente;
  }

  const rawKey = clientObj.nome_empresarial || clientObj.nome || clientObj.id || "";
  const normKey = normalizeClientKey(rawKey);

  const safeProgs: any[] = Array.isArray(supabaseProgramas) ? supabaseProgramas : [];

  // 1. Programas de base / cadastrados no Supabase
  const matchedSupabase: HouseMixProgram[] = [];
  safeProgs.forEach((p) => {
    if (!p) return;
    const matchUser = p.user_id && (p.user_id === clientObj.user_id || p.user_id === clientObj.id || p.user_id === (clientObj as any).parentUserId);
    const matchClientName = p.cliente_nome && normalizeClientKey(p.cliente_nome) === normKey;

    if (matchUser || matchClientName) {
      matchedSupabase.push({
        id: p.id,
        user_id: p.user_id,
        nome: p.nome,
        estudio: (p.estudio || "ESTÚDIO FM").toUpperCase(),
        horario_inicio: p.horario_inicio || "08:00:00",
        horario_fim: p.horario_fim || "10:00:00",
        dias_semana: p.dias_semana || ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"],
        ativo: p.ativo ?? true,
        apresentador_id: p.apresentador_id,
        apresentadores_ids: p.apresentadores_ids || [],
        tipo_programa: p.tipo_programa,
        descricao: p.descricao,
        selo: p.selo,
        capa: p.capa,
        thumb: p.thumb,
        cliente_id: clientObj.id,
        cliente_nome: clientObj.nome_empresarial || clientObj.nome,
      });
    }
  });

  // 2. Programas customizados no localStorage para este cliente
  const storedCustom = getStoredCustomPrograms();
  const customList = storedCustom[normKey] || (clientObj.id ? storedCustom[clientObj.id] : []) || [];

  // 3. Grade padrão da emissora (apenas se existir perfil específico para este cliente)
  const defaultProfile = DEFAULT_STATION_DATA[normKey];
  const defaultList: HouseMixProgram[] = (defaultProfile?.programas || []).map((def, idx) => ({
    id: `housemix_${normKey.replace(/\s+/g, "_").toLowerCase()}_${idx + 1}`,
    nome: def.nome,
    estudio: def.estudio.toUpperCase(),
    horario_inicio: def.horario_inicio,
    horario_fim: def.horario_fim,
    dias_semana: def.dias_semana,
    ativo: true,
    apresentador_id: (def as any).apresentador_id || null,
    apresentadores_ids: (def as any).apresentadores_ids || ((def as any).apresentador_id ? [(def as any).apresentador_id] : []),
    tipo_programa: def.tipo_programa,
    descricao: def.descricao,
    cliente_id: clientObj.id,
    cliente_nome: clientObj.nome_empresarial || clientObj.nome,
  }));

  // Mescla: padrão -> supabase -> customizados
  const mergedMap = new Map<string, HouseMixProgram>();
  defaultList.forEach((p) => mergedMap.set(p.nome.toUpperCase(), p));
  matchedSupabase.forEach((p) => mergedMap.set(p.nome.toUpperCase(), p));
  customList.forEach((p) => mergedMap.set(p.nome.toUpperCase(), p));

  const finalProgramas = Array.from(mergedMap.values());
  finalProgramas.sort((a, b) => (a.horario_inicio || "").localeCompare(b.horario_inicio || ""));

  // 4. Resolve estúdios disponíveis
  const defaultEstudios = defaultProfile?.estudios || [
    "ESTÚDIO FM",
    "PODCAST",
  ];
  const customEstudios = (getStoredCustomEstudios()[normKey] || (clientObj.id ? getStoredCustomEstudios()[clientObj.id] : [])) || [];
  const programEstudios = finalProgramas.map((p) => p.estudio).filter(Boolean);

  const mergedEstudios = Array.from(
    new Set([...defaultEstudios, ...customEstudios, ...programEstudios])
  ).map((e) => e.toUpperCase().trim()).filter(Boolean);

  // Return an array with .programas and .estudios attached
  const res: any = finalProgramas;
  res.programas = finalProgramas;
  res.estudios = mergedEstudios;

  return res;
}

/**
 * Resolve e retorna a grade completa de programas e estúdios de um cliente (compatibilidade assíncrona).
 */
export async function getClientHouseMixPrograms(
  cliente: { id: string; user_id?: string; nome?: string; nome_empresarial?: string; categoria?: string },
  supabaseProgramas: any[] = []
): Promise<{ programas: HouseMixProgram[]; estudios: string[] }> {
  return getClientHouseMixProgramsSync(cliente, supabaseProgramas);
}
