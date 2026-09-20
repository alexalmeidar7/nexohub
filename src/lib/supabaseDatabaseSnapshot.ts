import localDb from '../data/supabase_local_db.json';

export interface LocalDbSnapshot {
  exportedAt: string;
  stations: Array<{
    userId?: string;
    nomeFantasia?: string;
    razaoSocial?: string;
    cnpj?: string;
    email?: string;
    telefone?: string;
    whatsapp?: string;
    cidade?: string;
    estado?: string;
    subdomain?: string;
    logo_url?: string;
    player_logo_url?: string;
    streaming_url?: string;
    banner_url?: string;
    programasCount?: number;
    logosCount?: number;
    apresentadoresCount?: number;
    [key: string]: any;
  }>;
  tables: Record<string, any[]>;
  storage: Record<string, any[]>;
}

const db = localDb as unknown as LocalDbSnapshot;

export function getLocalDatabaseSnapshot(): LocalDbSnapshot {
  return db;
}

export function getSnapshotTable<T = any>(tableName: string): T[] {
  if (!db || !db.tables) return [];
  const rows = db.tables[tableName];
  return Array.isArray(rows) ? (rows as T[]) : [];
}

function normalizeMatch(str?: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9]/g, '');
}

import { normalizeClientKey } from "./houseMixProgramasService";

export function getSnapshotEmpresa(userIdOrSlug?: string): any | null {
  const empresas = getSnapshotTable('empresa_config');
  if (!userIdOrSlug) {
    return empresas[0] || null;
  }
  const normKey = normalizeClientKey(userIdOrSlug);
  const norm = normalizeMatch(userIdOrSlug);
  return (
    empresas.find((e: any) => {
      const eNorm = normalizeClientKey(e.nome || e.user_id);
      if (normKey && eNorm === normKey) return true;
      const eUser = normalizeMatch(e.user_id);
      const eNome = normalizeMatch(e.nome || e.nome_fantasia);
      const eSlug = normalizeMatch(e.slug || e.subdomain);
      const eRazao = normalizeMatch(e.razao_social || e.razaoSocial);
      return (
        (eUser && (eUser === norm || norm.includes(eUser) || eUser.includes(norm))) ||
        (eNome && (eNome === norm || norm.includes(eNome) || eNome.includes(norm))) ||
        (eSlug && (eSlug === norm || norm.includes(eSlug) || eSlug.includes(norm))) ||
        (eRazao && (eRazao === norm || norm.includes(eRazao) || eRazao.includes(norm)))
      );
    }) || null
  );
}

export function getSnapshotProgramas(userIdOrSlug?: string): any[] {
  const rawProgramas = getSnapshotTable('programas');
  // Atribui o tenant oficial do snapshot caso user_id esteja ausente na tabela bruta
  const allProgramas = rawProgramas.map((p, idx) => {
    let assignedUserId = p.user_id;
    if (!assignedUserId) {
      if (idx < 20) assignedUserId = "d17e65af-e407-466f-9b60-b55c43399513"; // Positiva FM
      else if (idx < 50) assignedUserId = "b2f70324-d086-4a5d-a407-cbc4acf98dce"; // Interativa FM
      else assignedUserId = "66337743-4e4f-4950-b58f-750b0c76861e"; // Cultura FM
    }
    return { ...p, user_id: assignedUserId };
  });

  if (!userIdOrSlug) return allProgramas;

  const normKey = normalizeClientKey(userIdOrSlug);
  if (normKey === "INTERATIVA FM") {
    return allProgramas.filter((p: any) => p.user_id === "b2f70324-d086-4a5d-a407-cbc4acf98dce");
  }
  if (normKey === "POSITIVA FM") {
    return allProgramas.filter((p: any) => p.user_id === "d17e65af-e407-466f-9b60-b55c43399513");
  }
  if (normKey === "CULTURA FM") {
    return allProgramas.filter((p: any) => p.user_id === "66337743-4e4f-4950-b58f-750b0c76861e");
  }

  const empresa = getSnapshotEmpresa(userIdOrSlug);
  const targetUserId = empresa?.user_id;

  if (targetUserId) {
    const matched = allProgramas.filter((p: any) => p.user_id === targetUserId);
    if (matched.length > 0) return matched;
  }

  const norm = normalizeMatch(userIdOrSlug);
  return allProgramas.filter((p: any) => {
    const pUser = normalizeMatch(p.user_id);
    return pUser && (pUser === norm || norm.includes(pUser) || pUser.includes(norm));
  });
}

export function getSnapshotLogos(userIdOrSlug?: string): any[] {
  const allLogos = getSnapshotTable('logos_patrocinadores');
  if (!userIdOrSlug) return allLogos;

  const empresa = getSnapshotEmpresa(userIdOrSlug);
  const targetUserId = empresa?.user_id;

  if (targetUserId) {
    const matched = allLogos.filter((l: any) => l.user_id === targetUserId);
    if (matched.length > 0) return matched;
  }

  const norm = normalizeMatch(userIdOrSlug);
  return allLogos.filter((l: any) => {
    const lUser = normalizeMatch(l.user_id);
    return lUser && (lUser === norm || norm.includes(lUser) || lUser.includes(norm));
  });
}

export function getSnapshotApresentadores(userIdOrSlug?: string): any[] {
  const allApresentadores = getSnapshotTable('apresentadores');
  if (!userIdOrSlug) return allApresentadores;

  const normKey = normalizeClientKey(userIdOrSlug);
  if (normKey === "INTERATIVA FM") {
    return allApresentadores.filter((a: any) => {
      const foto = a.foto || '';
      return foto.includes("b2f70324") || [
        "507bdf72-fcf2-4b17-bb78-22ce22256150",
        "d79ea9a6-92a8-47af-b41a-2d2721b6ac03",
        "ef4d3dc6-2505-4468-8cce-4bdd3722a9a1",
        "4d7dff62-9163-45db-8705-fc3389ba9997",
        "56eba9af-df33-4bec-bd35-b3681e0cc948",
        "98cf1ac0-fb75-46fd-a040-0b45fb652496",
        "2806b341-b17e-4496-87b7-17a98d0b8fc4",
        "0a65fa6b-8326-4b3a-a4d8-5fb73655f6fc",
        "3b991a26-9eaf-4cad-88e0-45382d2253a3",
        "43af147d-f4fc-4e9c-ad28-c8366b9d2970",
        "0c16f71a-ac60-4405-bb24-19f75494cb55",
      ].includes(a.id);
    });
  }
  if (normKey === "POSITIVA FM") {
    return allApresentadores.filter((a: any) => {
      const foto = a.foto || '';
      return foto.includes("d17e65af") || [
        "90ca4858-935e-4b87-a83a-224263fd269d",
        "04205a8e-cdca-409d-a879-ad21a61dcefa",
        "96b85e8c-6ba2-4352-9932-3b0db533aa20",
        "f3601b21-fd66-4795-9021-4d91992e3b6e",
        "5889d956-ed6a-4089-846e-159eb54bc474",
        "9d64c3c7-d45c-4cf5-b941-333e7eed8c85",
        "21a0ba74-8724-4b58-b8be-09b055bdbfa6",
        "7a8dbf72-88de-4bf9-a0ba-1a024a2297f7",
        "5945a2c7-5f5d-4765-99f2-b232d0a8cc1f",
        "99824dc1-78da-44b8-9033-920922ead18b",
      ].includes(a.id);
    });
  }
  if (normKey === "CULTURA FM") {
    return allApresentadores.filter((a: any) => {
      const foto = a.foto || '';
      return foto.includes("66337743") || [
        "84957394-23ea-4648-ae80-bd161ab0fc68",
        "9941a00a-de99-43f8-994c-6d69e4198485",
        "fd16e85f-4e9b-4bfb-a3fe-23e6bbaed0ef",
        "7ffbffa6-2e75-4831-ac44-e7305cb24d56",
        "b9a423da-2915-4d10-88c2-36fa9c05b03a",
        "59f724a2-359a-48d8-9927-c6c60144fcaa",
        "dce91ea9-2f67-4883-9b7f-b6c6e4d3612f",
      ].includes(a.id);
    });
  }

  const empresa = getSnapshotEmpresa(userIdOrSlug);
  const targetUserId = empresa?.user_id;

  if (targetUserId) {
    const matched = allApresentadores.filter((a: any) => a.user_id === targetUserId);
    if (matched.length > 0) return matched;
  }

  return [];
}

export function getSnapshotStreamingChannels(userIdOrSlug?: string): any[] {
  const channels = getSnapshotTable('streaming_channels');
  if (!userIdOrSlug) return channels;

  const empresa = getSnapshotEmpresa(userIdOrSlug);
  const targetUserId = empresa?.user_id;

  if (targetUserId) {
    const matched = channels.filter((c: any) => c.user_id === targetUserId);
    if (matched.length > 0) return matched;
  }

  return channels;
}

export function getSnapshotPrerolls(userIdOrSlug?: string): any[] {
  const prerolls = getSnapshotTable('comercial_preroll');
  if (!userIdOrSlug) return prerolls;

  const empresa = getSnapshotEmpresa(userIdOrSlug);
  const targetUserId = empresa?.user_id;

  if (targetUserId) {
    const matched = prerolls.filter((p: any) => p.user_id === targetUserId);
    if (matched.length > 0) return matched;
  }

  return prerolls;
}

export function getSnapshotShopProducts(userIdOrSlug?: string): any[] {
  const products = getSnapshotTable('shopping_products');
  if (!userIdOrSlug) return products;

  const empresa = getSnapshotEmpresa(userIdOrSlug);
  const targetUserId = empresa?.user_id;

  if (targetUserId) {
    const matched = products.filter((p: any) => p.user_id === targetUserId);
    if (matched.length > 0) return matched;
  }

  return products;
}

export function getSnapshotStorageObjects(bucketName?: string): any[] {
  if (!db || !db.storage) return [];
  if (!bucketName) {
    return Object.entries(db.storage).flatMap(([bucket, files]) =>
      (files || []).map((f: any) => ({ ...f, bucket }))
    );
  }
  return db.storage[bucketName] || [];
}

export function getSnapshotTestemunhais(userIdOrSlug?: string): any[] {
  const allTests = getSnapshotTable('testemunhais');
  if (!userIdOrSlug) return [];

  const normKey = normalizeClientKey(userIdOrSlug);
  if (normKey === "INTERATIVA FM") {
    return allTests.filter((t: any) => t.user_id === "b2f70324-d086-4a5d-a407-cbc4acf98dce");
  }
  if (normKey === "POSITIVA FM") {
    return allTests.filter((t: any) => t.user_id === "d17e65af-e407-466f-9b60-b55c43399513");
  }

  const empresa = getSnapshotEmpresa(userIdOrSlug);
  const targetUserId = empresa?.user_id;
  if (targetUserId) {
    const matched = allTests.filter((t: any) => t.user_id === targetUserId);
    if (matched.length > 0) return matched;
  }

  const norm = normalizeMatch(userIdOrSlug);
  return allTests.filter((t: any) => {
    const tUser = normalizeMatch(t.user_id);
    return tUser && (tUser === norm || norm.includes(tUser) || tUser.includes(norm));
  });
}

export function getSnapshotPromocoes(userIdOrSlug?: string): any[] {
  const allPromos = getSnapshotTable('promocoes');
  if (!userIdOrSlug) return [];

  const normKey = normalizeClientKey(userIdOrSlug);
  if (normKey === "INTERATIVA FM") {
    return allPromos.filter((p: any) => p.user_id === "b2f70324-d086-4a5d-a407-cbc4acf98dce");
  }
  if (normKey === "POSITIVA FM") {
    return allPromos.filter((p: any) => p.user_id === "d17e65af-e407-466f-9b60-b55c43399513");
  }

  const empresa = getSnapshotEmpresa(userIdOrSlug);
  const targetUserId = empresa?.user_id;
  if (targetUserId) {
    const matched = allPromos.filter((p: any) => p.user_id === targetUserId);
    if (matched.length > 0) return matched;
  }

  const norm = normalizeMatch(userIdOrSlug);
  return allPromos.filter((p: any) => {
    const pUser = normalizeMatch(p.user_id);
    return pUser && (pUser === norm || norm.includes(pUser) || pUser.includes(norm));
  });
}

