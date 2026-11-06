import { normalizeClientKey } from "./houseMixProgramasService";
import { findClientAccountByEmail, findClientAccountById } from "./clientAuthAccounts";

/**
 * Canonical on-air presenter resolver.
 * Ensures the locutor name and photo strictly correspond to the program currently on air,
 * with ZERO cross-tenant leakage between radio stations (e.g. Interativa FM never sees Cultura FM).
 */

export interface ResolvedPresenter {
  id: string;
  nome: string;
  foto: string;
  instagram?: string;
  stationKey?: "POSITIVA FM" | "INTERATIVA FM" | "CULTURA FM" | "JORNAL FM" | "NEXO BRASIL";
}

// Canonical database of verified radio presenters with authentic official photos, strictly segmented by station
export const CANONICAL_PRESENTERS: Record<string, ResolvedPresenter> = {
  // Positiva FM
  "90ca4858-935e-4b87-a83a-224263fd269d": {
    id: "90ca4858-935e-4b87-a83a-224263fd269d",
    nome: "Reginaldo Lucena",
    foto: "/locutores/reginaldo.png",
    instagram: "@_reginaldolucena",
    stationKey: "POSITIVA FM",
  },
  "04205a8e-cdca-409d-a879-ad21a61dcefa": {
    id: "04205a8e-cdca-409d-a879-ad21a61dcefa",
    nome: "Alysson Lima",
    foto: "/locutores/alysson.png",
    instagram: "@alyssonlima",
    stationKey: "POSITIVA FM",
  },
  "96b85e8c-6ba2-4352-9932-3b0db533aa20": {
    id: "96b85e8c-6ba2-4352-9932-3b0db533aa20",
    nome: "Jane Borges",
    foto: "/locutores/alysson-e-jane.png",
    instagram: "@janeborges",
    stationKey: "POSITIVA FM",
  },
  "f3601b21-fd66-4795-9021-4d91992e3b6e": {
    id: "f3601b21-fd66-4795-9021-4d91992e3b6e",
    nome: "Márcio Rodrigues",
    foto: "/locutores/marcio.png",
    instagram: "@marciorodrigues.radio",
    stationKey: "POSITIVA FM",
  },
  "5889d956-ed6a-4089-846e-159eb54bc474": {
    id: "5889d956-ed6a-4089-846e-159eb54bc474",
    nome: "Jonathas Mattos",
    foto: "/locutores/jonathas.png",
    instagram: "@jonathasmattoslocutor",
    stationKey: "POSITIVA FM",
  },
  "9d64c3c7-d45c-4cf5-b941-333e7eed8c85": {
    id: "9d64c3c7-d45c-4cf5-b941-333e7eed8c85",
    nome: "Vanessa Reis",
    foto: "/locutores/vanessa-reis.png",
    instagram: "@vanessareis.oficial",
    stationKey: "POSITIVA FM",
  },
  "21a0ba74-8724-4b58-b8be-09b055bdbfa6": {
    id: "21a0ba74-8724-4b58-b8be-09b055bdbfa6",
    nome: "Fernando",
    foto: "/locutores/fernando.png",
    stationKey: "POSITIVA FM",
  },
  "7a8dbf72-88de-4bf9-a0ba-1a024a2297f7": {
    id: "7a8dbf72-88de-4bf9-a0ba-1a024a2297f7",
    nome: "Douglas Reis",
    foto: "/locutores/douglas.png",
    instagram: "@douglas.dos.reis",
    stationKey: "POSITIVA FM",
  },
  "5945a2c7-5f5d-4765-99f2-b232d0a8cc1f": {
    id: "5945a2c7-5f5d-4765-99f2-b232d0a8cc1f",
    nome: "Gizelle Reis",
    foto: "/locutores/gizele.png",
    instagram: "@gizellesouza2",
    stationKey: "POSITIVA FM",
  },
  "99824dc1-78da-44b8-9033-920922ead18b": {
    id: "99824dc1-78da-44b8-9033-920922ead18b",
    nome: "Automático",
    foto: "",
    stationKey: "POSITIVA FM",
  },
  "interativa-automatico": {
    id: "interativa-automatico",
    nome: "Automático",
    foto: "",
    stationKey: "INTERATIVA FM",
  },
  "cultura-automatico": {
    id: "cultura-automatico",
    nome: "Automático",
    foto: "",
    stationKey: "CULTURA FM",
  },

  // Interativa FM
  "d79ea9a6-92a8-47af-b41a-2d2721b6ac03": {
    id: "d79ea9a6-92a8-47af-b41a-2d2721b6ac03",
    nome: "José Luiz",
    foto: "/locutores/ze.png",
    stationKey: "INTERATIVA FM",
  },
  "507bdf72-fcf2-4b17-bb78-22ce22256150": {
    id: "507bdf72-fcf2-4b17-bb78-22ce22256150",
    nome: "Ani Cristine",
    foto: "/locutores/ani.png",
    instagram: "@anicristine",
    stationKey: "INTERATIVA FM",
  },
  "4d7dff62-9163-45db-8705-fc3389ba9997": {
    id: "4d7dff62-9163-45db-8705-fc3389ba9997",
    nome: "Johnny Botelho",
    foto: "/locutores/botelho.png",
    stationKey: "INTERATIVA FM",
  },
  "56eba9af-df33-4bec-bd35-b3681e0cc948": {
    id: "56eba9af-df33-4bec-bd35-b3681e0cc948",
    nome: "Dj Henrique Amaral",
    foto: "/locutores/dj.png",
    instagram: "@djhenriqueamaral",
    stationKey: "INTERATIVA FM",
  },
  "98cf1ac0-fb75-46fd-a040-0b45fb652496": {
    id: "98cf1ac0-fb75-46fd-a040-0b45fb652496",
    nome: "Henrique Augusto",
    foto: "/locutores/henrique.png",
    instagram: "@henriquelocuteiro",
    stationKey: "INTERATIVA FM",
  },
  "ef4d3dc6-2505-4468-8cce-4bdd3722a9a1": {
    id: "ef4d3dc6-2505-4468-8cce-4bdd3722a9a1",
    nome: "Gabs",
    foto: "/locutores/gabs.png",
    instagram: "@frozengabs",
    stationKey: "INTERATIVA FM",
  },
  "2806b341-b17e-4496-87b7-17a98d0b8fc4": {
    id: "2806b341-b17e-4496-87b7-17a98d0b8fc4",
    nome: "Éverson Cândido",
    foto: "/locutores/morga.png",
    stationKey: "INTERATIVA FM",
  },
  "0a65fa6b-8326-4b3a-a4d8-5fb73655f6fc": {
    id: "0a65fa6b-8326-4b3a-a4d8-5fb73655f6fc",
    nome: "Thiago Santhê",
    foto: "/locutores/pablo.png",
    instagram: "@thiagosante",
    stationKey: "INTERATIVA FM",
  },
  "3b991a26-9eaf-4cad-88e0-45382d2253a3": {
    id: "3b991a26-9eaf-4cad-88e0-45382d2253a3",
    nome: "Pablo Kossa",
    foto: "/locutores/pablo.png",
    instagram: "@pablokossa",
    stationKey: "INTERATIVA FM",
  },
  "43af147d-f4fc-4e9c-ad28-c8366b9d2970": {
    id: "43af147d-f4fc-4e9c-ad28-c8366b9d2970",
    nome: "Andre Rodrigues",
    foto: "/locutores/andre.png",
    instagram: "@andrerodrigues777",
    stationKey: "INTERATIVA FM",
  },
  "0c16f71a-ac60-4405-bb24-19f75494cb55": {
    id: "0c16f71a-ac60-4405-bb24-19f75494cb55",
    nome: "Henrique Morgantini",
    foto: "/locutores/morga.png",
    instagram: "@hmorgantini",
    stationKey: "INTERATIVA FM",
  },

  // Cultura FM
  "cultura-azevedo": {
    id: "cultura-azevedo",
    nome: "Azevedo Júnior",
    foto: "/locutores/azevedo.png",
    instagram: "@azevedojuniorlocutoroficial",
    stationKey: "CULTURA FM",
  },
  "9941a00a-de99-43f8-994c-6d69e4198485": {
    id: "9941a00a-de99-43f8-994c-6d69e4198485",
    nome: "Azevedo Júnior",
    foto: "/locutores/azevedo.png",
    instagram: "@azevedojuniorlocutoroficial",
    stationKey: "CULTURA FM",
  },
  "cultura-mauricio": {
    id: "cultura-mauricio",
    nome: "Maurício",
    foto: "/locutores/mauricio.png",
    stationKey: "CULTURA FM",
  },
  "84957394-23ea-4648-ae80-bd161ab0fc68": {
    id: "84957394-23ea-4648-ae80-bd161ab0fc68",
    nome: "Mauricio Serafim",
    foto: "/locutores/mauricio.png",
    stationKey: "CULTURA FM",
  },
  "cultura-nathy": {
    id: "cultura-nathy",
    nome: "Nathy",
    foto: "/locutores/nathy.png",
    stationKey: "CULTURA FM",
  },
  "fd16e85f-4e9b-4bfb-a3fe-23e6bbaed0ef": {
    id: "fd16e85f-4e9b-4bfb-a3fe-23e6bbaed0ef",
    nome: "Nathy Alice",
    foto: "/locutores/nathy.png",
    stationKey: "CULTURA FM",
  },
  "cultura-paulinho": {
    id: "cultura-paulinho",
    nome: "Paulinho",
    foto: "/locutores/paulinho.png",
    stationKey: "CULTURA FM",
  },
  "7ffbffa6-2e75-4831-ac44-e7305cb24d56": {
    id: "7ffbffa6-2e75-4831-ac44-e7305cb24d56",
    nome: "Paulinho Paré",
    foto: "/locutores/paulinho.png",
    stationKey: "CULTURA FM",
  },
  "cultura-rafaela": {
    id: "cultura-rafaela",
    nome: "Rafaela",
    foto: "/locutores/rafaela.png",
    stationKey: "CULTURA FM",
  },
  "b9a423da-2915-4d10-88c2-36fa9c05b03a": {
    id: "b9a423da-2915-4d10-88c2-36fa9c05b03a",
    nome: "Rafaela Rockenbach",
    foto: "/locutores/rafaela.png",
    stationKey: "CULTURA FM",
  },
  "cultura-rayssa": {
    id: "cultura-rayssa",
    nome: "Rayssa",
    foto: "/locutores/rayssa.png",
    stationKey: "CULTURA FM",
  },
  "59f724a2-359a-48d8-9927-c6c60144fcaa": {
    id: "59f724a2-359a-48d8-9927-c6c60144fcaa",
    nome: "Raíssa Alves",
    foto: "/locutores/rayssa.png",
    stationKey: "CULTURA FM",
  },
  "cultura-junior": {
    id: "cultura-junior",
    nome: "Junior",
    foto: "/locutores/junior.png",
    stationKey: "CULTURA FM",
  },
  "dce91ea9-2f67-4883-9b7f-b6c6e4d3612f": {
    id: "dce91ea9-2f67-4883-9b7f-b6c6e4d3612f",
    nome: "Elço França",
    foto: "/locutores/junior.png",
    stationKey: "CULTURA FM",
  },
};

/**
 * Retorna os locutores canônicos estritamente pertencentes à emissora solicitada.
 */
export function getPresentersForStation(stationKeyOrUserId?: string | null): ResolvedPresenter[] {
  const normStation = normalizeClientKey(stationKeyOrUserId);
  if (!normStation) {
    return [];
  }
  return Object.values(CANONICAL_PRESENTERS).filter(
    (p) => p.stationKey === normStation
  );
}

function normalizeName(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function normalizePresenterStation(stationKeyOrUserId?: string | null): string {
  const account = findClientAccountById(stationKeyOrUserId) || findClientAccountByEmail(stationKeyOrUserId);
  return normalizeClientKey(account?.nome || account?.slug || stationKeyOrUserId);
}

/**
 * Returns canonical presenter for a known program name keyword pattern.
 */
function getCanonicalPresenterByProgramName(progName: string, diasSemana?: string[] | null): ResolvedPresenter | null {
  const norm = normalizeName(progName);
  if (!norm) return null;

  // 1. Positiva FM mappings
  // Sertanejo Bom Demais - 1ª Edição -> Reginaldo Lucena
  if (norm.includes("sertanejo") && (norm.includes("1") || norm.includes("primeira"))) {
    return CANONICAL_PRESENTERS["90ca4858-935e-4b87-a83a-224263fd269d"];
  }
  // Sertanejo Bom Demais - 2ª Edição -> Vanessa Reis
  if (norm.includes("sertanejo") && (norm.includes("2") || norm.includes("segunda"))) {
    return CANONICAL_PRESENTERS["9d64c3c7-d45c-4cf5-b941-333e7eed8c85"];
  }
  // Primeira Hora Positiva -> Alysson Lima
  if (norm.includes("primeira hora")) {
    return CANONICAL_PRESENTERS["04205a8e-cdca-409d-a879-ad21a61dcefa"];
  }
  // Bom dia Positiva -> Márcio Rodrigues
  if (norm.includes("bom dia positiva")) {
    return CANONICAL_PRESENTERS["f3601b21-fd66-4795-9021-4d91992e3b6e"];
  }
  // Flashback Positiva -> Jonathas Mattos
  if (norm.includes("flashback")) {
    return CANONICAL_PRESENTERS["5889d956-ed6a-4089-846e-159eb54bc474"];
  }
  // Whatsapp Positiva - Sábado -> Vanessa Reis
  if (norm.includes("whatsapp") && (norm.includes("sabado") || diasSemana?.some(d => normalizeName(d).startsWith("sab")))) {
    return CANONICAL_PRESENTERS["9d64c3c7-d45c-4cf5-b941-333e7eed8c85"];
  }
  // Whatsapp Positiva (Seg a Sex) -> Jonathas Mattos
  if (norm.includes("whatsapp")) {
    return CANONICAL_PRESENTERS["5889d956-ed6a-4089-846e-159eb54bc474"];
  }
  // Modão Sertanejo / Energia Positiva -> Fernando
  if (norm.includes("modao") || norm.includes("energia positiva")) {
    return CANONICAL_PRESENTERS["21a0ba74-8724-4b58-b8be-09b055bdbfa6"];
  }
  // Vale Night / Palco Positiva / Domingão -> Jonathas Mattos
  if (norm.includes("vale night") || norm.includes("palco") || norm.includes("domingao")) {
    return CANONICAL_PRESENTERS["5889d956-ed6a-4089-846e-159eb54bc474"];
  }
  // Madrugada Positiva -> Automático
  if (norm.includes("madrug")) {
    return CANONICAL_PRESENTERS["99824dc1-78da-44b8-9033-920922ead18b"];
  }

  // 2. Interativa FM mappings
  if (norm.includes("falando serio")) {
    return CANONICAL_PRESENTERS["d79ea9a6-92a8-47af-b41a-2d2721b6ac03"]; // José Luiz
  }
  if (norm.includes("maratona (2)") || norm.includes("inbox") || norm.includes("bonus 2")) {
    return CANONICAL_PRESENTERS["4d7dff62-9163-45db-8705-fc3389ba9997"]; // Johnny Botelho
  }
  if (norm.includes("maratona")) {
    return CANONICAL_PRESENTERS["507bdf72-fcf2-4b17-bb78-22ce22256150"]; // Ani Cristine
  }
  if (norm.includes("hora do cafezin") || norm.includes("cafezin")) {
    return CANONICAL_PRESENTERS["43af147d-f4fc-4e9c-ad28-c8366b9d2970"]; // Andre Rodrigues
  }
  if (norm.includes("bonus 1") || norm.includes("classic hits - 1") || norm.includes("pra cima (sabado")) {
    return CANONICAL_PRESENTERS["56eba9af-df33-4bec-bd35-b3681e0cc948"]; // Dj Henrique Amaral
  }
  if (norm.includes("papo cabeca") || norm.includes("top 10 - 1")) {
    return CANONICAL_PRESENTERS["98cf1ac0-fb75-46fd-a040-0b45fb652496"]; // Henrique Augusto
  }
  if (norm.includes("super play") || norm.includes("interativa indie")) {
    return CANONICAL_PRESENTERS["ef4d3dc6-2505-4468-8cce-4bdd3722a9a1"]; // Gabs
  }
  if (norm.includes("mega bonus 2")) {
    return CANONICAL_PRESENTERS["0a65fa6b-8326-4b3a-a4d8-5fb73655f6fc"]; // Thiago Santhê
  }
  if (norm.includes("mega bonus") || norm.includes("top 20") || norm.includes("independencia")) {
    return CANONICAL_PRESENTERS["507bdf72-fcf2-4b17-bb78-22ce22256150"]; // Ani Cristine
  }
  if (norm.includes("sunset retro")) {
    return CANONICAL_PRESENTERS["2806b341-b17e-4496-87b7-17a98d0b8fc4"]; // Éverson Cândido
  }
  if (
    norm.includes("classic hits - 2") ||
    norm.includes("top 10 - 2") ||
    norm.includes("pra cima!") ||
    norm.includes("bonus 3") ||
    norm.includes("bonus (internet)")
  ) {
    return CANONICAL_PRESENTERS["0a65fa6b-8326-4b3a-a4d8-5fb73655f6fc"]; // Thiago Santhê
  }

  // 3. Cultura FM mappings
  if (norm.includes("especial de domingo") || norm.includes("fim de semana cultura")) {
    return CANONICAL_PRESENTERS["cultura-mauricio"];
  }
  if (norm.includes("bom dia cultura")) {
    return CANONICAL_PRESENTERS["cultura-paulinho"];
  }
  if (norm.includes("show da manha")) {
    return CANONICAL_PRESENTERS["cultura-azevedo"];
  }
  if (norm.includes("cultura sertaneja")) {
    return CANONICAL_PRESENTERS["cultura-junior"];
  }
  if (norm.includes("tarde cultura")) {
    return CANONICAL_PRESENTERS["cultura-nathy"];
  }
  if (norm.includes("cultura mix")) {
    return CANONICAL_PRESENTERS["cultura-rafaela"];
  }
  if (norm.includes("noite cultura")) {
    return CANONICAL_PRESENTERS["cultura-rayssa"];
  }

  return null;
}

/**
 * Resolves the accurate presenter for a given program.
 * Strict rules:
 * 1. Identifies the active tenant station (e.g. "INTERATIVA FM").
 * 2. Filters out any presenters that belong to a different station (ZERO cross-tenant leakage).
 * 3. Checks program's apresentador_id or apresentadores_ids in presenter list.
 * 4. Checks canonical program name dictionary.
 * 5. Matches presenter name only within station-allowed hosts.
 * 6. NEVER returns a presenter from another radio station under any circumstance!
 */
export function resolvePresenterForProgram(
  programOrName: any,
  apresentadoresListOrId?: any,
  stationKeyOrApresentadores?: any,
  maybeDiasSemana?: any
): ResolvedPresenter | null {
  if (!programOrName) return null;

  let program: any;
  let apresentadoresList: any[];
  let stationKeyOrUserId: string | null = null;

  if (typeof programOrName === "string") {
    program = {
      nome: programOrName,
      apresentador_id: typeof apresentadoresListOrId === "string" ? apresentadoresListOrId : null,
      dias_semana: Array.isArray(maybeDiasSemana) ? maybeDiasSemana : null,
    };
    apresentadoresList = Array.isArray(stationKeyOrApresentadores)
      ? stationKeyOrApresentadores
      : (Array.isArray(apresentadoresListOrId) ? apresentadoresListOrId : []);
    stationKeyOrUserId = typeof stationKeyOrApresentadores === "string" ? stationKeyOrApresentadores : null;
  } else {
    program = programOrName;
    if (Array.isArray(stationKeyOrApresentadores) && !Array.isArray(apresentadoresListOrId)) {
      apresentadoresList = stationKeyOrApresentadores;
      stationKeyOrUserId = typeof apresentadoresListOrId === "string" ? apresentadoresListOrId : null;
    } else {
      apresentadoresList = Array.isArray(apresentadoresListOrId) ? apresentadoresListOrId : [];
      stationKeyOrUserId = typeof stationKeyOrApresentadores === "string" ? stationKeyOrApresentadores : null;
    }
  }

  const targetStation = normalizePresenterStation(
    stationKeyOrUserId ||
    program.cliente_nome ||
    program.clienteNome ||
    program.cliente_id ||
    program.user_id
  );

  const isCandidateAllowed = (cand: ResolvedPresenter | null | undefined): boolean => {
    if (!cand) return false;
    if (targetStation && cand.stationKey && cand.stationKey !== targetStation) {
      return false; // Rejeita qualquer locutor de outra emissora
    }
    return true;
  };

  const safeList = (apresentadoresList || []).filter((a) => {
    if (!a) return false;
    const aStation = (a as any).stationKey ? normalizeClientKey((a as any).stationKey) : null;
    if (targetStation && aStation && aStation !== targetStation) {
      return false;
    }
    return true;
  });

  const registeredForCanonical = (canonical: ResolvedPresenter) => {
    const byId = safeList.find((a) => a.id === canonical.id);
    if (byId) return byId;
    const name = normalizeName(canonical.nome);
    const matches = safeList.filter((a) => normalizeName(a.nome) === name);
    return matches.length === 1 ? matches[0] : null;
  };

  const withRegisteredData = (canonical: ResolvedPresenter): ResolvedPresenter => {
    const registered = registeredForCanonical(canonical);
    if (!registered) return canonical;
    return {
      id: registered.id,
      nome: registered.nome,
      foto: registered.foto && !registered.foto.includes("/avatars/usr-") ? registered.foto : canonical.foto,
      instagram: registered.instagram || canonical.instagram,
      stationKey: canonical.stationKey,
    };
  };

  const progName = program.nome || program.programa?.nome || "";
  const diasSemana = program.dias_semana || program.diasSemana || null;

  // 1. Look up by explicit presenter ID
  const apId =
    program.apresentador_id ||
    program.apresentadorId ||
    program.apresentadores_ids?.[0] ||
    program.apresentadoresIds?.[0];

  if (apId) {
    // Look up in filtered station list — registered (database) data is ALWAYS authoritative
    const found = safeList.find((a) => a.id === apId);
    if (found) {
      const canonical = CANONICAL_PRESENTERS[apId];
      const isDead = !found.foto || found.foto.includes("/avatars/usr-");
      return {
        id: found.id,
        nome: found.nome,
        foto: isDead ? (canonical?.foto || "") : found.foto,
        instagram: found.instagram || canonical?.instagram,
        stationKey: canonical?.stationKey,
      };
    }

    // Look up in canonical directory
    if (CANONICAL_PRESENTERS[apId] && isCandidateAllowed(CANONICAL_PRESENTERS[apId])) {
      return withRegisteredData(CANONICAL_PRESENTERS[apId]);
    }

    // Program has an explicitly registered presenter that we could not load:
    // never guess another host by program name.
    return null;
  }

  // 2. Check canonical program name dictionary (only for programs with NO registered presenter)
  const canonicalByProg = getCanonicalPresenterByProgramName(progName, diasSemana);
  if (canonicalByProg && isCandidateAllowed(canonicalByProg)) {
    // If user's list has custom presenter info with this ID, prefer it
    return withRegisteredData(canonicalByProg);
  }

  // 3. Check if program title mentions any presenter name in the station's list
  const normProg = normalizeName(progName);
  if (normProg) {
    for (const a of safeList) {
      if (a?.nome) {
        const normA = normalizeName(a.nome);
        if (normA.length >= 3 && (normProg.includes(normA) || normA.includes(normProg))) {
          const canon = a.id ? CANONICAL_PRESENTERS[a.id] : null;
          if (canon && !isCandidateAllowed(canon)) continue;
          const isDead = !a.foto || a.foto.includes("/avatars/usr-");
          return {
            id: a.id || canon?.id || "",
            nome: a.nome,
            foto: isDead ? (canon?.foto || "") : a.foto,
            instagram: a.instagram || canon?.instagram,
            stationKey: canon?.stationKey,
          };
        }
      }
    }

    for (const canon of Object.values(CANONICAL_PRESENTERS)) {
      if (!isCandidateAllowed(canon)) continue;
      const normC = normalizeName(canon.nome);
      if (normC.length >= 3 && (normProg.includes(normC) || normC.includes(normProg))) {
        return canon;
      }
    }
  }

  // 4. No presenter for this program (e.g. musical block or unknown)
  // Strict guarantee: DO NOT return another host's photo/name!
  return null;
}

// Authentic official photos per station to enforce strict zero-leakage cross-tenant isolation
export const POSITIVA_LOCUTOR_PHOTOS = new Set([
  "/locutores/jonathas.png",
  "/locutores/marcio.png",
  "/locutores/vanessa-reis.png",
  "/locutores/vanessareis.png",
  "/locutores/reginaldo.png",
  "/locutores/alysson.png",
  "/locutores/alysson-e-jane.png",
  "/locutores/alyssonejane.png",
  "/locutores/fernando.png",
  "/locutores/douglas.png",
  "/locutores/gizele.png",
  "/locutores/cris.png",
]);

export const INTERATIVA_LOCUTOR_PHOTOS = new Set([
  "/locutores/ani.png",
  "/locutores/ze.png",
  "/locutores/botelho.png",
  "/locutores/dj.png",
  "/locutores/henrique.png",
  "/locutores/augusto.png",
  "/locutores/gabs.png",
  "/locutores/morga.png",
  "/locutores/pablo.png",
  "/locutores/andre.png",
]);

export const CULTURA_LOCUTOR_PHOTOS = new Set([
  "/locutores/azevedo.png",
  "/locutores/mauricio.png",
  "/locutores/nathy.png",
  "/locutores/paulinho.png",
  "/locutores/rafaela.png",
  "/locutores/rayssa.png",
  "/locutores/junior.png",
  "/locutores/elco.png",
]);

/**
 * Resolves safe, authentic presenter photo with strict multi-tenant station isolation.
 * Guarantees that:
 * 1. Ani Cristine ALWAYS gets "/locutores/ani.png" and NEVER Positiva's Cristiano "/locutores/cris.png".
 * 2. Positiva FM photos NEVER leak into Interativa FM or Cultura FM and vice-versa.
 * 3. Flexible argument order supported: (foto, nome, station) OR (nome, foto, station).
 */
export function resolveSafePresenterPhoto(
  fotoOrNome?: string | null,
  nomeOrFoto?: string | null,
  stationKeyOrUserId?: string | null
): string {
  let foto: string | null = null;
  let nome: string | null = null;

  const arg1 = (fotoOrNome || "").trim();
  const arg2 = (nomeOrFoto || "").trim();

  const isImgPath = (s: string) =>
    s.startsWith("/") ||
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:image/") ||
    s.startsWith("blob:") ||
    /\.(png|jpg|jpeg|webp|svg|gif)(\?.*)?$/i.test(s);

  if (isImgPath(arg1)) {
    foto = arg1;
    nome = arg2;
  } else if (isImgPath(arg2)) {
    foto = arg2;
    nome = arg1;
  } else {
    nome = arg1 || arg2;
  }

  if (!foto && !nome) return "";

  const norm = (nome || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (!norm || norm === "—" || norm === "-" || norm === "none" || norm === "null" || norm === "undefined") {
    return "";
  }
  if (norm.includes("sem loc") || norm.includes("automatico")) {
    return "";
  }

  const station = normalizePresenterStation(stationKeyOrUserId);

  const isForeignPhoto = (url: string, targetStation: string): boolean => {
    if (targetStation === "INTERATIVA FM") {
      return POSITIVA_LOCUTOR_PHOTOS.has(url) || CULTURA_LOCUTOR_PHOTOS.has(url);
    }
    if (targetStation === "POSITIVA FM") {
      return INTERATIVA_LOCUTOR_PHOTOS.has(url) || CULTURA_LOCUTOR_PHOTOS.has(url);
    }
    if (targetStation === "CULTURA FM") {
      return POSITIVA_LOCUTOR_PHOTOS.has(url) || INTERATIVA_LOCUTOR_PHOTOS.has(url);
    }
    return false;
  };

  const isValidPhoto =
    Boolean(foto) &&
    !foto!.includes("/avatars/usr-") &&
    !isForeignPhoto(foto!, station);

  // A foto cadastrada pelo próprio cliente SEMPRE tem prioridade sobre
  // qualquer imagem padrão mantida no código.
  if (isValidPhoto) return foto!;

  // 1. Interativa FM - Strict isolation
  if (station === "INTERATIVA FM") {
    if (norm.includes("ani") || norm.includes("cristine")) return "/locutores/ani.png";
    if (norm.includes("ze") || norm.includes("jose luiz") || norm.includes("luiz")) return "/locutores/ze.png";
    if (norm.includes("botelho") || norm.includes("johnny")) return "/locutores/botelho.png";
    if (norm.includes("dj") || norm.includes("amaral")) return "/locutores/dj.png";
    if (norm.includes("henrique") || norm.includes("augusto")) return "/locutores/henrique.png";
    if (norm.includes("gabs")) return "/locutores/gabs.png";
    if (norm.includes("morga") || norm.includes("everson") || norm.includes("morgantini")) return "/locutores/morga.png";
    if (norm.includes("pablo") || norm.includes("kossa") || norm.includes("santhe")) return "/locutores/pablo.png";
    if (norm.includes("andre")) return "/locutores/andre.png";
    if (isValidPhoto) return foto!;
    return "";
  }

  // 2. Positiva FM - Strict isolation
  if (station === "POSITIVA FM") {
    if (norm.includes("jonathas")) return "/locutores/jonathas.png";
    if (norm.includes("marcio")) return "/locutores/marcio.png";
    if (norm.includes("vanessa")) return "/locutores/vanessa-reis.png";
    if (norm.includes("reginaldo")) return "/locutores/reginaldo.png";
    if (norm.includes("alysson") && norm.includes("jane")) return "/locutores/alysson-e-jane.png";
    if (norm.includes("alysson")) return "/locutores/alysson.png";
    if (norm.includes("jane")) return "/locutores/alysson-e-jane.png";
    if (norm.includes("fernando")) return "/locutores/fernando.png";
    if (norm.includes("douglas")) return "/locutores/douglas.png";
    if (norm.includes("gizele") || norm.includes("gizelle")) return "/locutores/gizele.png";
    // Cristiano: exact match on 'cris' or 'cristiano', never 'cristine' or 'ani'
    if ((norm.includes("cristiano") || norm === "cris" || norm.startsWith("cris ")) && !norm.includes("cristine") && !norm.includes("ani")) {
      return "/locutores/cris.png";
    }
    if (isValidPhoto) return foto!;
    return "";
  }

  // 3. Cultura FM - Strict isolation
  if (station === "CULTURA FM") {
    if (norm.includes("azevedo")) return "/locutores/azevedo.png";
    if (norm.includes("mauricio")) return "/locutores/mauricio.png";
    if (norm.includes("nathy")) return "/locutores/nathy.png";
    if (norm.includes("paulinho")) return "/locutores/paulinho.png";
    if (norm.includes("rafaela")) return "/locutores/rafaela.png";
    if (norm.includes("rayssa") || norm.includes("raissa")) return "/locutores/rayssa.png";
    if (norm.includes("junior")) return "/locutores/junior.png";
    if (norm.includes("elco")) return "/locutores/elco.png";
    if (isValidPhoto) return foto!;
    return "";
  }

  // 4. Station unknown / fallback: MUST still protect against false 'cris' match on Ani Cristine!
  if (norm.includes("ani") || norm.includes("cristine")) return "/locutores/ani.png";
  if ((norm.includes("cristiano") || norm === "cris" || norm.startsWith("cris ")) && !norm.includes("cristine")) {
    return "/locutores/cris.png";
  }
  if (norm.includes("jonathas")) return "/locutores/jonathas.png";
  if (norm.includes("marcio")) return "/locutores/marcio.png";
  if (norm.includes("vanessa")) return "/locutores/vanessa-reis.png";
  if (norm.includes("reginaldo")) return "/locutores/reginaldo.png";
  if (norm.includes("alysson") && norm.includes("jane")) return "/locutores/alysson-e-jane.png";
  if (norm.includes("alysson")) return "/locutores/alysson.png";
  if (norm.includes("jane")) return "/locutores/alysson-e-jane.png";
  if (norm.includes("fernando")) return "/locutores/fernando.png";
  if (norm.includes("douglas")) return "/locutores/douglas.png";
  if (norm.includes("gizele") || norm.includes("gizelle")) return "/locutores/gizele.png";

  if (norm.includes("ze") || norm.includes("jose luiz") || norm.includes("luiz")) return "/locutores/ze.png";
  if (norm.includes("botelho") || norm.includes("johnny")) return "/locutores/botelho.png";
  if (norm.includes("dj") || norm.includes("amaral")) return "/locutores/dj.png";
  if (norm.includes("henrique") || norm.includes("augusto")) return "/locutores/henrique.png";
  if (norm.includes("gabs")) return "/locutores/gabs.png";
  if (norm.includes("morga") || norm.includes("everson") || norm.includes("morgantini")) return "/locutores/morga.png";
  if (norm.includes("pablo") || norm.includes("kossa") || norm.includes("santhe")) return "/locutores/pablo.png";
  if (norm.includes("andre")) return "/locutores/andre.png";

  if (norm.includes("azevedo")) return "/locutores/azevedo.png";
  if (norm.includes("mauricio")) return "/locutores/mauricio.png";
  if (norm.includes("nathy")) return "/locutores/nathy.png";
  if (norm.includes("paulinho")) return "/locutores/paulinho.png";
  if (norm.includes("rafaela")) return "/locutores/rafaela.png";
  if (norm.includes("rayssa") || norm.includes("raissa")) return "/locutores/rayssa.png";
  if (norm.includes("junior")) return "/locutores/junior.png";
  if (norm.includes("elco")) return "/locutores/elco.png";

  if (isValidPhoto) return foto!;
  return "";
}
