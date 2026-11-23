/**
 * Intelligent route prefetcher for instant, fluid menu navigation.
 * Preloads module chunks into browser cache on hover or idle time,
 * eliminating network wait time and Suspense skeleton flashes.
 */

const PREFETCH_MAP: Record<string, () => Promise<unknown>> = {
  dashboard: () => import("@/components/CustomizableDashboard"),
  apresentadores: () => import("@/components/ApresentadorForm"),
  ouvintes: () => import("@/components/OuvintesPage"),
  sorteios: () => import("@/components/SorteiosPage"),
  relatorios: () => import("@/components/RelatoriosPage"),
  blitz: () => import("@/components/BlitzPage"),
  programas: () => import("@/components/ProgramaForm"),
  previsao: () => import("@/components/PrevisaoTempo"),
  noticias: () => import("@/components/RoteiroPrograma"),
  musica: () => import("@/components/MusicaNoAr"),
  agenda: () => import("@/components/AgendaPage"),
  configuracoes: () => import("@/components/ConfiguracoesPage"),
  testemunhais: () => import("@/components/TestemunhaisPage"),
  promocoes: () => import("@/components/PromocoesPage"),
  logos: () => import("@/components/LogosPatrocinadoresPage"),
  shopping: () => import("@/components/ShoppingPage"),
  preroll: () => import("@/components/AdsPage"),
  cortevideo: () => import("@/components/CortesVideoPage"),
  vmix: () => import("@/components/VmixPage"),
  tp: () => import("@/components/TeleprompterPage"),
  broadcast: () => import("@/components/BroadcastPage"),
  cenario: () => import("@/components/CenariosPage"),
  batalha: () => import("@/components/BatalhaMusicalPage"),
  enquete: () => import("@/components/EnquetePage"),
  quiz: () => import("@/components/QuizPage"),
  site: () => import("@/components/site/SitePage"),
  linkbio: () => import("@/components/LinkBioPage"),
  clientes: () => import("@/components/ClientesPage"),
  chatbot: () => import("@/components/ChatbotHome"),
  configtelapromo: () => import("@/components/ConfigTelaPromoPage"),
};

const prefetched = new Set<string>();

export function prefetchPage(pageKey: string) {
  if (!pageKey || prefetched.has(pageKey)) return;
  const loader = PREFETCH_MAP[pageKey];
  if (loader) {
    prefetched.add(pageKey);
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
      (window as any).requestIdleCallback(() => {
        loader().catch(() => {
          prefetched.delete(pageKey);
        });
      }, { timeout: 1500 });
    } else {
      setTimeout(() => {
        loader().catch(() => {
          prefetched.delete(pageKey);
        });
      }, 40);
    }
  }
}

export function prefetchGroup(group: "cadastros" | "site" | "comercial" | "vmix" | "ferramentas") {
  const groups: Record<string, string[]> = {
    cadastros: ["apresentadores", "ouvintes", "programas", "clientes", "previsao"],
    site: ["site", "playerconfig"],
    comercial: ["logos", "configtelapromo", "shopping", "promocoes", "testemunhais", "preroll"],
    vmix: ["broadcast", "cenario", "batalha", "enquete", "quiz"],
    ferramentas: ["cortevideo", "tp", "linkbio"],
  };
  const list = groups[group] || [];
  list.forEach((key, idx) => {
    setTimeout(() => prefetchPage(key), idx * 60);
  });
}

let idleScheduled = false;

export function startIdlePrefetch() {
  // Disabled aggressive startup prefetch to prevent main-thread/network saturation
}
