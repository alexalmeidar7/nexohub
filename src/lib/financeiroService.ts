import { supabase } from "@/integrations/supabase/client";
import { getStoredMetadata } from "@/components/ClientesPage";
import { CLIENT_ACCOUNTS } from "@/lib/clientAuthAccounts";

export const STORAGE_SUBS_KEY = "nexo_superadmin_client_subs";
export const STORAGE_PACKS_KEY = "nexo_superadmin_packs";
export const STORAGE_CONFIG_KEY = "nexo_superadmin_finance_config";

export interface ClientSubscription {
  user_id: string;
  nome: string;
  razao_social?: string;
  nome_empresarial?: string;
  cnpj?: string;
  logo: string | null;
  email?: string;
  telefone?: string;
  plano: string;
  produtos: string[];
  valorMensal: number;
  diaVencimento: number;
  status: "em_dia" | "pendente" | "atrasado";
  ultimaCobranca?: string;
  tipoCobranca?: "mensal" | "avulsa";
  dataVencimentoAvulsa?: string;
}

export function findMetaForClient(storedMeta: Record<string, any>, id: string, name: string): any {
  if (!storedMeta) return {};
  if (id && storedMeta[id]) return storedMeta[id];
  const upper = (name || "").trim().toUpperCase();
  if (!upper) return {};
  if (storedMeta[upper]) return storedMeta[upper];

  for (const [key, meta] of Object.entries(storedMeta)) {
    if (!meta) continue;
    const rz = (meta.razao_social || "").trim().toUpperCase();
    const nm = (meta.nome_empresarial || "").trim().toUpperCase();
    const k = key.trim().toUpperCase();

    if (rz === upper || nm === upper || k === upper) {
      return meta;
    }
    if (
      (rz && (upper.includes(rz) || rz.includes(upper))) ||
      (nm && (upper.includes(nm) || nm.includes(upper))) ||
      (k && (upper.includes(k) || k.includes(upper)))
    ) {
      return meta;
    }
  }

  // Common known radio mapping fallbacks
  if (upper.includes("A3 PRODUCOES") || upper.includes("A3 PRODUÇÕES")) {
    return { razao_social: "A3 PRODUCOES E MARKETING LTDA", nome_empresarial: "A3 PRODUÇÕES & MARKETING" };
  }
  if (upper.includes("CULTURA FM")) {
    return { razao_social: "CULTURA FM STEREO SOM LTDA", nome_empresarial: "CULTURA FM 97.3 FM" };
  }
  if (upper.includes("POSITIVA FM")) {
    return { razao_social: "RADIO POSITIVA FM LTDA", nome_empresarial: "POSITIVA FM 99.1" };
  }
  if (upper.includes("JORNAL DE INHUMAS") || upper.includes("JORNAL FM")) {
    return { razao_social: "RADIO JORNAL DE INHUMAS LTDA", nome_empresarial: "JORNAL FM" };
  }
  if (upper.includes("NINE FM")) {
    return { razao_social: "NINE FM LTDA", nome_empresarial: "NINE FM" };
  }
  if (upper.includes("VERISSIMO") || upper.includes("INTERATIVA FM")) {
    return { razao_social: "W VERISSIMO NEGOCIOS DA COMUNICACAO LTDA", nome_empresarial: "INTERATIVA FM" };
  }

  return {};
}

export function findLogoForClient(name: string, currentLogo?: string | null): string | null {
  if (currentLogo && currentLogo.trim()) return currentLogo;
  const upper = (name || "").toUpperCase();
  if (upper.includes("POSITIVA")) {
    return "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/empresa-assets/d17e65af-e407-466f-9b60-b55c43399513/logo-1772036733979.webp";
  }
  if (upper.includes("INTERATIVA")) {
    return "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/empresa-assets/b2f70324-d086-4a5d-a407-cbc4acf98dce/logo-1787846659202.webp";
  }
  if (upper.includes("JORNAL")) {
    return "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/empresa-assets/48423cc6-f3b1-4bea-8729-dd0ae76a89c3/logo-1784061437755.webp";
  }
  if (upper.includes("CULTURA")) {
    return "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/empresa-assets/66337743-4e4f-4950-b58f-750b0c76861e/logo-1783118409944.webp";
  }
  if (upper.includes("NEXO")) {
    return "/src/assets/logo-nexo.png";
  }
  return null;
}

export function dispatchFinanceiroUpdate() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("nexo_financeiro_updated"));
  }
}

/**
 * Loads all client subscriptions mirroring the FinanceiroSuperAdminPage logic.
 */
export async function loadFinanceiroClients(): Promise<ClientSubscription[]> {
  const [empRes, profRes, logosRes] = await Promise.all([
    supabase
      .from("empresa_config")
      .select("user_id, nome, logo, plano, telefone_comercial, telefone_participacao, ativo")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("profiles").select("user_id, email"),
    supabase.from("logos_patrocinadores").select("id, nome, logo_url").eq("excluido", false),
  ]);

  const emails = new Map<string, string>();
  (profRes.data || []).forEach((p: any) => emails.set(p.user_id, p.email || ""));

  let localOverrides: Record<string, Partial<ClientSubscription>> = {};
  if (typeof window !== "undefined") {
    const savedSubs = localStorage.getItem(STORAGE_SUBS_KEY);
    if (savedSubs) {
      try {
        localOverrides = JSON.parse(savedSubs);
      } catch {
        /* noop */
      }
    }
  }

  const storedMeta = getStoredMetadata();
  const empresas = empRes.data || [];
  const seenNames = new Set<string>();

  const mappedClients: ClientSubscription[] = empresas.map((emp) => {
    const override = localOverrides[emp.user_id] || {};
    const planName = emp.plano || "";
    const clientName = emp.nome || emails.get(emp.user_id) || "Cliente Sem Nome";
    seenNames.add(clientName.toUpperCase());

    const meta = findMetaForClient(storedMeta, emp.user_id, clientName);
    const razaoSocial = (meta.razao_social || emp.nome || clientName).toUpperCase();
    const nomeEmpresarial = (meta.nome_empresarial || (meta.razao_social && meta.razao_social !== clientName ? meta.razao_social : clientName)).toUpperCase();
    const cnpj = meta.cnpj || "";

    const isBasic = planName.toLowerCase() === "basic" || clientName.toUpperCase().includes("NEXO BRASIL");
    let defaultPrice = isBasic ? 590 : 890;
    let defaultProducts = isBasic ? ["house_mix"] : ["house_mix", "chatbot"];

    if (planName.toLowerCase().includes("omni")) {
      defaultPrice = 1450;
      defaultProducts = ["house_mix", "chatbot", "tv_app", "business"];
    }

    let displayPlan = override.plano;
    if (!displayPlan) {
      if (emp.plano && !emp.plano.toLowerCase().includes("house mix") && emp.plano.toLowerCase() !== "basic") {
        displayPlan = emp.plano;
      } else if (isBasic) {
        displayPlan = "Standard";
      } else {
        displayPlan = "Nexo Max";
      }
    }
    displayPlan = (displayPlan || "").replace(/^cliente\s*ag[êe]ncia\s*[-–—:]*\s*/i, "").trim() || displayPlan;

    return {
      user_id: emp.user_id,
      nome: clientName,
      razao_social: razaoSocial,
      nome_empresarial: nomeEmpresarial,
      cnpj: cnpj,
      logo: findLogoForClient(clientName, emp.logo),
      email: meta.email_cobranca || emails.get(emp.user_id) || "",
      telefone: meta.whatsapp_responsavel || meta.telefone || emp.telefone_comercial || emp.telefone_participacao || "",
      plano: displayPlan,
      produtos: override.produtos || defaultProducts,
      valorMensal: override.valorMensal !== undefined ? override.valorMensal : defaultPrice,
      diaVencimento: override.diaVencimento || 10,
      status: override.status || "em_dia",
      ultimaCobranca: override.ultimaCobranca || undefined,
      tipoCobranca: override.tipoCobranca || "mensal",
      dataVencimentoAvulsa: override.dataVencimentoAvulsa || undefined,
    };
  });

  // Also add logos_patrocinadores that might not have empresa_config
  (logosRes.data || []).forEach((lg: any) => {
    if (lg.nome && !seenNames.has(lg.nome.toUpperCase())) {
      seenNames.add(lg.nome.toUpperCase());
      const override = localOverrides[lg.id] || {};
      const meta = findMetaForClient(storedMeta, lg.id, lg.nome);
      const razaoSocial = (meta.razao_social || lg.nome).toUpperCase();
      const nomeEmpresarial = (meta.nome_empresarial || (meta.razao_social && meta.razao_social !== lg.nome ? meta.razao_social : lg.nome)).toUpperCase();
      const cnpj = meta.cnpj || "";
      const displayPlan = (override.plano || "Spot Comercial / Avulso").replace(/^cliente\s*ag[êe]ncia\s*[-–—:]*\s*/i, "").trim();

      mappedClients.push({
        user_id: lg.id,
        nome: lg.nome,
        razao_social: razaoSocial,
        nome_empresarial: nomeEmpresarial,
        cnpj: cnpj,
        logo: lg.logo_url || null,
        email: meta.email_cobranca || "",
        telefone: meta.whatsapp_responsavel || meta.telefone || "",
        plano: displayPlan,
        produtos: override.produtos || ["prod-1"],
        valorMensal: override.valorMensal !== undefined ? override.valorMensal : 350,
        diaVencimento: override.diaVencimento || 15,
        status: override.status || "em_dia",
        ultimaCobranca: override.ultimaCobranca || undefined,
        tipoCobranca: override.tipoCobranca || "avulsa",
        dataVencimentoAvulsa: override.dataVencimentoAvulsa || undefined,
      });
    }
  });

  // Incorpora clientes registrados da Agência em ClientesPage
  Object.entries(storedMeta).forEach(([key, meta]) => {
    const clientName = (meta.razao_social || meta.nome_empresarial || (key.startsWith("local_") ? "" : key) || "").trim();
    if (!clientName || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientName)) return;

    const upper = clientName.toUpperCase();
    const metaCandidate = findMetaForClient(storedMeta, key, clientName);
    const mergedMeta = { ...metaCandidate, ...meta };
    const razaoSocial = (mergedMeta.razao_social || clientName).toUpperCase();
    const nomeEmpresarial = (mergedMeta.nome_empresarial || (mergedMeta.razao_social && mergedMeta.razao_social !== clientName ? mergedMeta.razao_social : clientName)).toUpperCase();
    const cnpj = mergedMeta.cnpj || "";

    if (seenNames.has(upper)) {
      const existing = mappedClients.find((c) => c.nome.toUpperCase() === upper);
      if (existing) {
        if (!existing.razao_social && razaoSocial) existing.razao_social = razaoSocial;
        if (!existing.nome_empresarial && nomeEmpresarial) existing.nome_empresarial = nomeEmpresarial;
        if (!existing.cnpj && cnpj) existing.cnpj = cnpj;
        if (!existing.telefone && (mergedMeta.whatsapp_responsavel || mergedMeta.telefone)) {
          existing.telefone = mergedMeta.whatsapp_responsavel || mergedMeta.telefone || "";
        }
        if (!existing.email && mergedMeta.email_cobranca) {
          existing.email = mergedMeta.email_cobranca || "";
        }
      }
      return;
    }

    seenNames.add(upper);
    const override = localOverrides[key] || localOverrides[clientName] || {};
    const isBasic = upper.includes("NEXO BRASIL");
    const defaultPrice = isBasic ? 590 : 890;
    const defaultPlan = isBasic ? "Standard" : "Nexo Max";
    const defaultProds = isBasic ? ["house_mix"] : ["house_mix", "chatbot"];
    const displayPlan = (override.plano || defaultPlan).replace(/^cliente\s*ag[êe]ncia\s*[-–—:]*\s*/i, "").trim();

    mappedClients.push({
      user_id: key,
      nome: clientName,
      razao_social: razaoSocial,
      nome_empresarial: nomeEmpresarial,
      cnpj: cnpj,
      logo: findLogoForClient(clientName, null),
      email: mergedMeta.email_cobranca || override.email || "",
      telefone: mergedMeta.whatsapp_responsavel || mergedMeta.telefone || override.telefone || "",
      plano: displayPlan,
      produtos: override.produtos || defaultProds,
      valorMensal: override.valorMensal !== undefined ? override.valorMensal : defaultPrice,
      diaVencimento: override.diaVencimento || 10,
      status: override.status || "em_dia",
      ultimaCobranca: override.ultimaCobranca || undefined,
      tipoCobranca: override.tipoCobranca || "mensal",
      dataVencimentoAvulsa: override.dataVencimentoAvulsa || undefined,
    });
  });

  // Incorpora emissoras e contas registradas no sistema (CLIENT_ACCOUNTS)
  CLIENT_ACCOUNTS.forEach((acc) => {
    if (acc.isAdmin || acc.isSubUser) return;
    const clientName = (acc.nome || "").trim();
    if (!clientName) return;
    const upper = clientName.toUpperCase();
    const meta = findMetaForClient(storedMeta, acc.id, clientName);
    const razaoSocial = (acc.razaoSocial || meta.razao_social || clientName).toUpperCase();
    const nomeEmpresarial = (meta.nome_empresarial || (razaoSocial !== clientName ? razaoSocial : clientName)).toUpperCase();
    const cnpj = meta.cnpj || "";

    if (seenNames.has(upper)) {
      const existing = mappedClients.find((c) => c.nome.toUpperCase() === upper);
      if (existing) {
        if (!existing.razao_social && razaoSocial) existing.razao_social = razaoSocial;
        if (!existing.nome_empresarial && nomeEmpresarial) existing.nome_empresarial = nomeEmpresarial;
        if (!existing.cnpj && cnpj) existing.cnpj = cnpj;
        if (!existing.logo) existing.logo = findLogoForClient(clientName, null);
        if (!existing.email && acc.email) existing.email = acc.email;
        if (!existing.telefone && (meta.whatsapp_responsavel || meta.telefone)) {
          existing.telefone = meta.whatsapp_responsavel || meta.telefone || "";
        }
      }
      return;
    }

    seenNames.add(upper);
    const override = localOverrides[acc.id] || localOverrides[clientName] || {};
    const isBasic = upper.includes("NEXO BRASIL");
    const isOmni = (acc.plano || "").toLowerCase().includes("omni");
    let defaultPrice = isOmni ? 1450 : (isBasic ? 590 : 890);
    let defaultProds = isOmni ? ["house_mix", "chatbot", "tv_app", "business"] : (isBasic ? ["house_mix"] : ["house_mix", "chatbot"]);
    const displayPlan = (override.plano || acc.plano || "House Mix Nexo Max").replace(/^cliente\s*ag[êe]ncia\s*[-–—:]*\s*/i, "").trim();

    mappedClients.push({
      user_id: acc.id,
      nome: clientName,
      razao_social: razaoSocial,
      nome_empresarial: nomeEmpresarial,
      cnpj: cnpj,
      logo: findLogoForClient(clientName, null),
      email: meta.email_cobranca || acc.email || override.email || "",
      telefone: meta.whatsapp_responsavel || meta.telefone || override.telefone || "",
      plano: displayPlan,
      produtos: override.produtos || defaultProds,
      valorMensal: override.valorMensal !== undefined ? override.valorMensal : defaultPrice,
      diaVencimento: override.diaVencimento || 10,
      status: override.status || "em_dia",
      ultimaCobranca: override.ultimaCobranca || undefined,
      tipoCobranca: override.tipoCobranca || "mensal",
      dataVencimentoAvulsa: override.dataVencimentoAvulsa || undefined,
    });
  });

  // Include any custom overrides that are independent
  Object.keys(localOverrides).forEach((k) => {
    if (k.startsWith("custom_") && !mappedClients.some((c) => c.user_id === k)) {
      const ov = localOverrides[k] as any;
      mappedClients.push({
        user_id: k,
        nome: ov.nome || "Cliente Avulso",
        logo: null,
        email: ov.email || "",
        telefone: ov.telefone || "",
        plano: ov.plano || "Serviço Avulso",
        produtos: ov.produtos || [],
        valorMensal: ov.valorMensal || 0,
        diaVencimento: ov.diaVencimento || 10,
        status: ov.status || "em_dia",
        ultimaCobranca: ov.ultimaCobranca || undefined,
        tipoCobranca: ov.tipoCobranca || "avulsa",
        dataVencimentoAvulsa: ov.dataVencimentoAvulsa || undefined,
      });
    }
  });

  return mappedClients;
}

/**
 * Calculates total monthly recurring revenue (MRR) from subscriptions (ignoring avulsas).
 */
export function calculateFinanceiroMRR(clients: ClientSubscription[]): number {
  return clients
    .filter((c) => c.tipoCobranca !== "avulsa")
    .reduce((acc, c) => acc + (c.valorMensal || 0), 0);
}

/**
 * Fetches clients and returns the current monthly revenue (Receita Mensal / MRR) directly.
 */
export async function fetchFinanceiroMRR(): Promise<number> {
  const clients = await loadFinanceiroClients();
  return calculateFinanceiroMRR(clients);
}
