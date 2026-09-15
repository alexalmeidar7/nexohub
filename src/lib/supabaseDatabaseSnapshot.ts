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

export function getSnapshotEmpresa(userIdOrSlug?: string): any | null {
  const empresas = getSnapshotTable('empresa_config');
  if (!userIdOrSlug) {
    return empresas[0] || null;
  }
  const norm = normalizeMatch(userIdOrSlug);
  return (
    empresas.find((e: any) => {
      const eUser = normalizeMatch(e.user_id);
      const eNome = normalizeMatch(e.nome_fantasia);
      const eSlug = normalizeMatch(e.subdomain);
      const eRazao = normalizeMatch(e.razao_social);
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
  const allProgramas = getSnapshotTable('programas');
  if (!userIdOrSlug) return allProgramas;

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

  const empresa = getSnapshotEmpresa(userIdOrSlug);
  const targetUserId = empresa?.user_id;

  if (targetUserId) {
    const matched = allApresentadores.filter((a: any) => a.user_id === targetUserId);
    if (matched.length > 0) return matched;
  }

  return allApresentadores;
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
