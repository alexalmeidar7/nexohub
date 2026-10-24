export interface ClientAccountInfo {
  id: string;
  email: string;
  aliases?: string[];
  nome: string;
  razaoSocial: string;
  slug: string;
  cidade: string;
  timezone: string;
  plano: string;
  isAdmin?: boolean;
  isSubUser?: boolean;
  parentUserId?: string;
  parentEmail?: string;
  allowedModules?: string[];
  avatarUrl?: string;
  layoutColors?: {
    cardBgColor?: string;
    cardTextColor?: string;
    accentColor?: string;
    homeBgColor?: string;
  };
  audience?: {
    total: number;
    audio: number;
    video: number;
    redes: number;
    instagram: number;
  };
}

export const CLIENT_ACCOUNTS: ClientAccountInfo[] = [
  {
    id: "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5",
    email: "alex@nexobrasil.net",
    aliases: ["alex@nexo.com.br", "admin@nexobrasil.net", "alex", "admin", "admin_alex_nexo", "superadmin"],
    nome: "Alex Almeida",
    razaoSocial: "Nexo Brasil",
    slug: "alex",
    cidade: "Goiânia - GO",
    timezone: "America/Sao_Paulo",
    plano: "Super Admin",
    avatarUrl: "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/empresa-assets/29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5/logo-1788656177446.webp",
    isAdmin: true,
  },
  {
    id: "d17e65af-e407-466f-9b60-b55c43399513",
    email: "positivafm@positivafm.com.br",
    aliases: ["positiva@positivafm.com.br", "positivafm@gmail.com", "positiva@gmail.com", "positivafm", "positiva", "cli_radio_positiva_fm"],
    nome: "Positiva FM 99.1",
    razaoSocial: "RADIO POSITIVA FM LTDA",
    slug: "positivafm",
    cidade: "Goiânia - GO",
    timezone: "America/Sao_Paulo",
    plano: "House Mix Nexo Max",
    layoutColors: {
      cardBgColor: "#d8ff3e",
      cardTextColor: "#002132",
      accentColor: "#00dbff",
      homeBgColor: "#e6f8fc",
    },
    audience: {
      total: 131,
      audio: 115,
      video: 16,
      redes: 198365,
      instagram: 119656,
    }
  },
  {
    id: "sub_positiva_opec",
    email: "opec@positivafm.com.br",
    aliases: ["opecpositiva@gmail.com", "opecpositiva"],
    nome: "OPEC Positiva FM",
    razaoSocial: "RADIO POSITIVA FM LTDA",
    slug: "positivafm",
    cidade: "Goiânia - GO",
    timezone: "America/Sao_Paulo",
    plano: "House Mix Nexo Max",
    isSubUser: true,
    parentUserId: "d17e65af-e407-466f-9b60-b55c43399513",
    parentEmail: "positivafm@positivafm.com.br",
    allowedModules: [
      "dashboard", "programas", "apresentadores", "musica", "agenda",
      "sorteios", "promocoes", "testemunhais", "logos", "site", "comercial",
      "broadcast", "vmix", "cenario"
    ],
    layoutColors: {
      cardBgColor: "#d8ff3e",
      cardTextColor: "#002132",
      accentColor: "#00dbff",
      homeBgColor: "#e6f8fc",
    }
  },
  {
    id: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
    email: "interativafmgynaovivo@gmail.com",
    aliases: ["interativafm@gmail.com", "interativa@interativafm.net", "interativa@interativa.fm", "interativafm", "interativa", "cli_interativa_fm"],
    nome: "Interativa FM 94.9",
    razaoSocial: "RADIO INTERATIVA FM LTDA",
    slug: "interativafm",
    cidade: "Goiânia - GO",
    timezone: "America/Sao_Paulo",
    plano: "House Mix Nexo Max",
    layoutColors: {
      cardBgColor: "#ffffff",
      cardTextColor: "#002132",
      accentColor: "#00dbff",
      homeBgColor: "#f0f9ff",
    },
    audience: {
      total: 245,
      audio: 210,
      video: 35,
      redes: 342000,
      instagram: 215000,
    }
  },
  {
    id: "sub_interativa_opec",
    email: "opec@interativafm.net",
    aliases: ["opec@interativafm.com.br", "opecinterativa@gmail.com", "opecinterativa"],
    nome: "OPEC Interativa FM",
    razaoSocial: "RADIO INTERATIVA FM LTDA",
    slug: "interativafm",
    cidade: "Goiânia - GO",
    timezone: "America/Sao_Paulo",
    plano: "House Mix Nexo Max",
    isSubUser: true,
    parentUserId: "b2f70324-d086-4a5d-a407-cbc4acf98dce",
    parentEmail: "interativafmgynaovivo@gmail.com",
    allowedModules: [
      "dashboard", "programas", "apresentadores", "musica", "agenda",
      "sorteios", "promocoes", "testemunhais", "logos", "site", "comercial",
      "broadcast", "vmix", "cenario"
    ],
    layoutColors: {
      cardBgColor: "#ffffff",
      cardTextColor: "#002132",
      accentColor: "#00dbff",
      homeBgColor: "#f0f9ff",
    }
  },
  {
    id: "48423cc6-f3b1-4bea-8729-dd0ae76a89c3",
    email: "transmissao@jornalfm.com.br",
    aliases: ["jornalfm@jornalfm.com.br", "jornalfm@gmail.com", "transmissao@gmail.com", "jornalfm", "jornal", "cli_jornal_fm"],
    nome: "Jornal FM 96.5",
    razaoSocial: "RADIO JORNAL DE INHUMAS LTDA",
    slug: "transmissao",
    cidade: "Inhumas - GO",
    timezone: "America/Sao_Paulo",
    plano: "House Mix Nexo Max",
    layoutColors: {
      cardBgColor: "#ffffff",
      cardTextColor: "#002132",
      accentColor: "#00dbff",
      homeBgColor: "#f8fafc",
    },
    audience: {
      total: 98,
      audio: 85,
      video: 13,
      redes: 65400,
      instagram: 42000,
    }
  },
  {
    id: "66337743-4e4f-4950-b58f-750b0c76861e",
    email: "culturafm973@gmail.com",
    aliases: ["culturafm@gmail.com", "cultura973@gmail.com", "culturafm973", "culturafm", "cultura", "cli_cultura_fm"],
    nome: "Cultura FM 97.3",
    razaoSocial: "A3 PRODUCOES E MARKETING LTDA",
    slug: "culturafm973",
    cidade: "Santos - SP",
    timezone: "America/Sao_Paulo",
    plano: "House Mix Nexo Max",
    layoutColors: {
      cardBgColor: "#ffffff",
      cardTextColor: "#002132",
      accentColor: "#00dbff",
      homeBgColor: "#f8fafc",
    },
    audience: {
      total: 112,
      audio: 95,
      video: 17,
      redes: 89000,
      instagram: 54000,
    }
  },
];

export function findClientAccountByEmail(email?: string | null): ClientAccountInfo | null {
  if (!email) return null;
  const clean = email.trim().toLowerCase();
  return (
    CLIENT_ACCOUNTS.find(
      (c) =>
        c.email.toLowerCase() === clean ||
        (c.aliases && c.aliases.some((a) => a.toLowerCase() === clean))
    ) || null
  );
}

export function findClientAccountById(id?: string | null): ClientAccountInfo | null {
  if (!id) return null;
  const clean = id.trim().toLowerCase();
  return (
    CLIENT_ACCOUNTS.find(
      (c) =>
        c.id.toLowerCase() === clean ||
        c.slug.toLowerCase() === clean ||
        (c.parentUserId && c.parentUserId.toLowerCase() === clean) ||
        (c.aliases && c.aliases.some((a) => a.toLowerCase() === clean))
    ) || null
  );
}

export const POSITIVA_USER_ID = "d17e65af-e407-466f-9b60-b55c43399513";

export const POSITIVA_TESTEMUNHAIS_IDS = new Set([
  "5bae884c-e5a1-4c7a-93bc-a52b45ecec7b",
  "ae045a74-377e-4a8b-9d9d-67302c986210",
  "b4eab64f-a075-4400-af7a-90b0767eef4a",
  "dc1b243d-18dd-4b7c-859c-8026a238e2e3",
  "b59da300-d764-4ac8-9862-e25778359532",
  "a148aa9c-5888-4197-948d-bcab87654e76",
  "51251964-bc69-4785-acbd-0ba4df17eaf3",
]);

export function isPositivaStationAccount(userIdOrSlug?: string | null): boolean {
  if (!userIdOrSlug) return false;
  const clean = userIdOrSlug.trim().toLowerCase();
  return clean === POSITIVA_USER_ID || clean === "positivafm" || clean === "positiva";
}

