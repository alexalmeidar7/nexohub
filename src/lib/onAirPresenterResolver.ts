/**
 * Canonical on-air presenter resolver.
 * Ensures the locutor name and photo strictly correspond to the program currently on air.
 */

export interface ResolvedPresenter {
  id: string;
  nome: string;
  foto: string;
  instagram?: string;
}

// Canonical database of verified radio presenters with authentic official photos
export const CANONICAL_PRESENTERS: Record<string, ResolvedPresenter> = {
  // Positiva FM
  "90ca4858-935e-4b87-a83a-224263fd269d": {
    id: "90ca4858-935e-4b87-a83a-224263fd269d",
    nome: "Reginaldo Lucena",
    foto: "/locutores/reginaldo.png",
    instagram: "@_reginaldolucena",
  },
  "04205a8e-cdca-409d-a879-ad21a61dcefa": {
    id: "04205a8e-cdca-409d-a879-ad21a61dcefa",
    nome: "Alysson Lima",
    foto: "/locutores/alysson.png",
    instagram: "@alyssonlima",
  },
  "96b85e8c-6ba2-4352-9932-3b0db533aa20": {
    id: "96b85e8c-6ba2-4352-9932-3b0db533aa20",
    nome: "Jane Borges",
    foto: "/locutores/alysson-e-jane.png",
    instagram: "@janeborges",
  },
  "f3601b21-fd66-4795-9021-4d91992e3b6e": {
    id: "f3601b21-fd66-4795-9021-4d91992e3b6e",
    nome: "Márcio Rodrigues",
    foto: "/locutores/marcio.png",
    instagram: "@marciorodrigues.radio",
  },
  "5889d956-ed6a-4089-846e-159eb54bc474": {
    id: "5889d956-ed6a-4089-846e-159eb54bc474",
    nome: "Jonathas Mattos",
    foto: "/locutores/jonathas.png",
    instagram: "@jonathasmattoslocutor",
  },
  "9d64c3c7-d45c-4cf5-b941-333e7eed8c85": {
    id: "9d64c3c7-d45c-4cf5-b941-333e7eed8c85",
    nome: "Vanessa Reis",
    foto: "/locutores/vanessa-reis.png",
    instagram: "@vanessareis.oficial",
  },
  "21a0ba74-8724-4b58-b8be-09b055bdbfa6": {
    id: "21a0ba74-8724-4b58-b8be-09b055bdbfa6",
    nome: "Fernando",
    foto: "/locutores/fernando.png",
  },
  "7a8dbf72-88de-4bf9-a0ba-1a024a2297f7": {
    id: "7a8dbf72-88de-4bf9-a0ba-1a024a2297f7",
    nome: "Douglas Reis",
    foto: "/locutores/douglas.png",
    instagram: "@douglas.dos.reis",
  },
  "5945a2c7-5f5d-4765-99f2-b232d0a8cc1f": {
    id: "5945a2c7-5f5d-4765-99f2-b232d0a8cc1f",
    nome: "Gizelle Reis",
    foto: "/locutores/gizele.png",
    instagram: "@gizellesouza2",
  },
  "99824dc1-78da-44b8-9033-920922ead18b": {
    id: "99824dc1-78da-44b8-9033-920922ead18b",
    nome: "Automático",
    foto: "/locutores/sem-loc.png",
  },

  // Interativa FM
  "d79ea9a6-92a8-47af-b41a-2d2721b6ac03": {
    id: "d79ea9a6-92a8-47af-b41a-2d2721b6ac03",
    nome: "José Luiz",
    foto: "/locutores/ze.png",
  },
  "507bdf72-fcf2-4b17-bb78-22ce22256150": {
    id: "507bdf72-fcf2-4b17-bb78-22ce22256150",
    nome: "Ani Cristine",
    foto: "/locutores/ani.png",
    instagram: "@anicristine",
  },
  "4d7dff62-9163-45db-8705-fc3389ba9997": {
    id: "4d7dff62-9163-45db-8705-fc3389ba9997",
    nome: "Johnny Botelho",
    foto: "/locutores/botelho.png",
  },
  "56eba9af-df33-4bec-bd35-b3681e0cc948": {
    id: "56eba9af-df33-4bec-bd35-b3681e0cc948",
    nome: "Dj Henrique Amaral",
    foto: "/locutores/dj.png",
    instagram: "@djhenriqueamaral",
  },
  "98cf1ac0-fb75-46fd-a040-0b45fb652496": {
    id: "98cf1ac0-fb75-46fd-a040-0b45fb652496",
    nome: "Henrique Augusto",
    foto: "/locutores/henrique.png",
    instagram: "@henriquelocuteiro",
  },
  "ef4d3dc6-2505-4468-8cce-4bdd3722a9a1": {
    id: "ef4d3dc6-2505-4468-8cce-4bdd3722a9a1",
    nome: "Gabs",
    foto: "/locutores/gabs.png",
    instagram: "@frozengabs",
  },
  "2806b341-b17e-4496-87b7-17a98d0b8fc4": {
    id: "2806b341-b17e-4496-87b7-17a98d0b8fc4",
    nome: "Éverson Cândido",
    foto: "/locutores/morga.png",
  },
  "0a65fa6b-8326-4b3a-a4d8-5fb73655f6fc": {
    id: "0a65fa6b-8326-4b3a-a4d8-5fb73655f6fc",
    nome: "Thiago Santhê",
    foto: "/locutores/pablo.png",
    instagram: "@thiagosante",
  },
  "3b991a26-9eaf-4cad-88e0-45382d2253a3": {
    id: "3b991a26-9eaf-4cad-88e0-45382d2253a3",
    nome: "Pablo Kossa",
    foto: "/locutores/pablo.png",
    instagram: "@pablokossa",
  },
  "43af147d-f4fc-4e9c-ad28-c8366b9d2970": {
    id: "43af147d-f4fc-4e9c-ad28-c8366b9d2970",
    nome: "Andre Rodrigues",
    foto: "/locutores/andre.png",
    instagram: "@andrerodrigues777",
  },
  "0c16f71a-ac60-4405-bb24-19f75494cb55": {
    id: "0c16f71a-ac60-4405-bb24-19f75494cb55",
    nome: "Henrique Morgantini",
    foto: "/locutores/morga.png",
    instagram: "@hmorgantini",
  },

  // Cultura FM
  "cultura-azevedo": {
    id: "cultura-azevedo",
    nome: "Azevedo Júnior",
    foto: "/locutores/azevedo.png",
    instagram: "@azevedojuniorlocutoroficial",
  },
  "cultura-mauricio": {
    id: "cultura-mauricio",
    nome: "Maurício",
    foto: "/locutores/mauricio.png",
  },
  "cultura-nathy": {
    id: "cultura-nathy",
    nome: "Nathy",
    foto: "/locutores/nathy.png",
  },
  "cultura-paulinho": {
    id: "cultura-paulinho",
    nome: "Paulinho",
    foto: "/locutores/paulinho.png",
  },
  "cultura-rafaela": {
    id: "cultura-rafaela",
    nome: "Rafaela",
    foto: "/locutores/rafaela.png",
  },
  "cultura-rayssa": {
    id: "cultura-rayssa",
    nome: "Rayssa",
    foto: "/locutores/rayssa.png",
  },
  "cultura-junior": {
    id: "cultura-junior",
    nome: "Junior",
    foto: "/locutores/junior.png",
  },
};

function normalizeName(str: string): string {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
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
    return CANONICAL_PRESENTERS["d79ea9a6-92a8-47af-b41a-2d2721b6ac03"];
  }
  if (norm.includes("maratona (2)") || norm.includes("inbox") || norm.includes("bonus 2")) {
    return CANONICAL_PRESENTERS["4d7dff62-9163-45db-8705-fc3389ba9997"];
  }
  if (norm.includes("maratona")) {
    return CANONICAL_PRESENTERS["507bdf72-fcf2-4b17-bb78-22ce22256150"];
  }
  if (norm.includes("bonus 1") || norm.includes("classic hits - 1") || norm.includes("pra cima (sabado")) {
    return CANONICAL_PRESENTERS["56eba9af-df33-4bec-bd35-b3681e0cc948"];
  }
  if (norm.includes("papo cabeca") || norm.includes("top 10 - 1")) {
    return CANONICAL_PRESENTERS["98cf1ac0-fb75-46fd-a040-0b45fb652496"];
  }
  if (norm.includes("super play") || norm.includes("interativa indie")) {
    return CANONICAL_PRESENTERS["ef4d3dc6-2505-4468-8cce-4bdd3722a9a1"];
  }
  if (norm.includes("sunset retro")) {
    return CANONICAL_PRESENTERS["2806b341-b17e-4496-87b7-17a98d0b8fc4"];
  }
  if (norm.includes("mega bonus 2") || norm.includes("classic hits - 2") || norm.includes("top 10 - 2") || norm.includes("pra cima!") || norm.includes("bonus 3")) {
    return CANONICAL_PRESENTERS["0a65fa6b-8326-4b3a-a4d8-5fb73655f6fc"];
  }

  return null;
}

/**
 * Resolves the accurate presenter for a given program.
 * Strict rules:
 * 1. Checks program's apresentador_id or apresentadores_ids in apresentadoresList.
 * 2. If found, enriches with photo if missing.
 * 3. If ID not found or missing, checks canonical program-to-presenter dictionary.
 * 4. If still not matched, checks if program name matches any presenter's name.
 * 5. NEVER returns an unrelated presenter who presents a different program!
 */
export function resolvePresenterForProgram(
  program: any,
  apresentadoresList: any[] = [],
  _stationKey?: string | null
): ResolvedPresenter | null {
  if (!program) return null;

  const progName = program.nome || program.programa?.nome || "";
  const diasSemana = program.dias_semana || program.diasSemana || null;

  // 1. Look up by explicit presenter ID
  const apId =
    program.apresentador_id ||
    program.apresentadorId ||
    program.apresentadores_ids?.[0] ||
    program.apresentadoresIds?.[0];

  if (apId) {
    // Look up in passed list
    const found = (apresentadoresList || []).find((a) => a.id === apId);
    if (found) {
      const canonical = CANONICAL_PRESENTERS[apId];
      const isDead = !found.foto || found.foto.includes("zzjfzxxvxbspbdkodoix.supabase.co") || found.foto.includes("/avatars/usr-");
      return {
        id: found.id,
        nome: found.nome,
        foto: isDead ? (canonical?.foto || "") : found.foto,
        instagram: found.instagram || canonical?.instagram,
      };
    }

    // Look up in canonical directory
    if (CANONICAL_PRESENTERS[apId]) {
      return CANONICAL_PRESENTERS[apId];
    }
  }

  // 2. Check canonical program name dictionary (e.g. Sertanejo Bom Demais -> Reginaldo Lucena)
  const canonicalByProg = getCanonicalPresenterByProgramName(progName, diasSemana);
  if (canonicalByProg) {
    // If user's list has custom presenter info with this ID, prefer it
    const userCustom = (apresentadoresList || []).find((a) => a.id === canonicalByProg.id);
    const isDead = !userCustom?.foto || userCustom.foto.includes("zzjfzxxvxbspbdkodoix.supabase.co") || userCustom.foto.includes("/avatars/usr-");
    return {
      id: canonicalByProg.id,
      nome: userCustom?.nome || canonicalByProg.nome,
      foto: isDead ? canonicalByProg.foto : userCustom.foto,
      instagram: userCustom?.instagram || canonicalByProg.instagram,
    };
  }

  // 3. Check if program title mentions any presenter name in the station's list
  const normProg = normalizeName(progName);
  if (normProg) {
    for (const a of apresentadoresList || []) {
      if (a?.nome) {
        const normA = normalizeName(a.nome);
        if (normA.length >= 3 && (normProg.includes(normA) || normA.includes(normProg))) {
          const canon = a.id ? CANONICAL_PRESENTERS[a.id] : null;
          const isDead = !a.foto || a.foto.includes("zzjfzxxvxbspbdkodoix.supabase.co") || a.foto.includes("/avatars/usr-");
          return {
            id: a.id || canon?.id || "",
            nome: a.nome,
            foto: isDead ? (canon?.foto || "") : a.foto,
            instagram: a.instagram || canon?.instagram,
          };
        }
      }
    }

    for (const canon of Object.values(CANONICAL_PRESENTERS)) {
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
