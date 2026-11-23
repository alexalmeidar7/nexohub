import { useEffect, useState } from "react";
import { Download, HardDrive, Package } from "lucide-react";
import { HMD_LATEST_RELEASE_API, parseLatestDesktopRelease } from "@/lib/desktopRelease";
import type { DesktopRelease } from "@/lib/desktopRelease";

const formatSize = (bytes: number) =>
  bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : "Não informado";

const formatDate = (value: string) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(date)
    : "Não informada";
};

export default function NexoPluginsPage() {
  const isDesktop = typeof window !== "undefined" && Boolean(window.houseMixDesktop);
  const [desktopRelease, setDesktopRelease] = useState<DesktopRelease | null>(null);
  const [checkingDesktop, setCheckingDesktop] = useState(true);
  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12_000);
    const loadDesktopRelease = async () => {
      try {
        const response = await fetch(HMD_LATEST_RELEASE_API, {
          headers: { Accept: "application/vnd.github+json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("A versão não pôde ser consultada");
        const release = parseLatestDesktopRelease(await response.json());
        if (!release) throw new Error("Instalador não encontrado na release");
        if (mounted) setDesktopRelease(release);
      } catch {
        if (mounted) setDesktopRelease(null);
      } finally {
        clearTimeout(timeout);
        if (mounted) setCheckingDesktop(false);
      }
    };
    void loadDesktopRelease();
    return () => { mounted = false; clearTimeout(timeout); controller.abort(); };
  }, []);


  return () => {
      active = false;
    };
  }, []);

  return (
    <section className="min-h-full p-5 text-slate-900 sm:p-8">
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">
          <Package size={15} /> House Mix · Ferramentas
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Downloads</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Versões e instaladores oficiais do House Mix Desktop.
        </p>
      </header>

      <article className="mb-4 rounded-xl bg-slate-50 p-5 sm:p-7">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#0055ff] text-white">
            <HardDrive size={27} strokeWidth={1.8} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold leading-tight tracking-tight">House Mix Desktop</h2>
            <p className="mt-1 text-sm text-slate-600">Aplicativo HMD para Windows com operação local e integração com a rádio.</p>
            <dl className="mt-4 grid gap-1.5 text-sm sm:grid-cols-[170px_1fr]">
              <dt className="font-semibold text-slate-800">Versão disponível</dt>
              <dd className="text-slate-700">{checkingDesktop ? "Consultando..." : desktopRelease ? `v${desktopRelease.version}` : "Indisponível"}</dd>
              <dt className="font-semibold text-slate-800">Última atualização</dt>
              <dd className="text-slate-700">{desktopRelease ? formatDate(desktopRelease.publishedAt) : "Não informada"} <span className="text-xs text-slate-500">(Brasília)</span></dd>
              <dt className="font-semibold text-slate-800">Tamanho</dt>
              <dd className="text-slate-700">{desktopRelease ? formatSize(desktopRelease.sizeBytes) : "Não informado"}</dd>
            </dl>
            <div className="mt-5">
              <h3 className="text-sm font-bold text-slate-900">O que mudou na última atualização</h3>
              {desktopRelease?.changes.length ? (
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
                  {desktopRelease.changes.map((change, index) => <li key={`${desktopRelease.version}-${index}`}>{change}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  {checkingDesktop ? "Consultando as notas da versão..." : "Notas detalhadas não disponíveis."}
                </p>
              )}
            </div>
            {!isDesktop && (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              {desktopRelease ? (
                <a
                  href={desktopRelease.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-[#0055ff] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0046d5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0055ff] focus-visible:ring-offset-2"
                >
                  <Download size={17} /> Baixar
                </a>
              ) : (
                <button type="button" disabled className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-lg bg-slate-300 px-6 py-2.5 text-sm font-bold text-slate-600">
                  <Download size={17} /> {checkingDesktop ? "Verificando..." : "Indisponível"}
                </button>
              )}
            </div>
            )}
          </div>
        </div>
      </article>

    </section>
  );
}
