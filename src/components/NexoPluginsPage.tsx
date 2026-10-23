import { useEffect, useState } from "react";
import { Download, Package } from "lucide-react";

const DOWNLOAD_URL = "https://housemix.nexobrasil.net/downloads/nexohub-bridge/NexoHubBridge.exe";
const MANIFEST_URL = "https://housemix.nexobrasil.net/downloads/nexohub-bridge/latest.json";
type Details = { version: string; updatedAt: string; sizeBytes: number };
const formatSize = (bytes: number) => bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : "Não informado";
const formatDate = (value: string) => { const d = new Date(value); return value && !Number.isNaN(d.getTime()) ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(d) : "Não informada"; };

export default function NexoPluginsPage() {
  const [details, setDetails] = useState<Details>({ version: "1.1.0", updatedAt: "", sizeBytes: 0 });
  useEffect(() => {
    let active = true;
    Promise.all([
      fetch(`${MANIFEST_URL}?t=${Date.now()}`, { cache: "no-store" }).then(r => { if (!r.ok) throw new Error("manifest"); return r.json(); }).catch(() => ({} as any)),
      fetch(DOWNLOAD_URL, { method: "HEAD", cache: "no-store" }).then(r => ({ sizeBytes: Number(r.headers.get("content-length")) || 0, updatedAt: r.headers.get("last-modified") || "" })).catch(() => ({ sizeBytes: 0, updatedAt: "" }))
    ]).then(([manifest, file]) => { if (active) setDetails({ version: manifest.version || "1.1.0", updatedAt: manifest.updatedAt || file.updatedAt, sizeBytes: Number(manifest.sizeBytes) || file.sizeBytes }); });
    return () => { active = false; };
  }, []);
  return (
    <section className="min-h-full rounded-2xl bg-white p-5 text-slate-900 sm:p-8">
      <header className="mb-8">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600"><Package size={15} /> House Mix · Ferramentas</div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Nexo Plugins</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">Aplicativos e ferramentas para ampliar os recursos do House Mix.</p>
      </header>
      <article className="flex flex-col gap-5 rounded-2xl border border-slate-200 bg-slate-50/70 p-5 sm:flex-row sm:items-center sm:p-6">
        <a href={DOWNLOAD_URL} download="NexoHubBridge.exe" aria-label="Baixar Nexo Bridge para Windows" className="flex h-32 w-32 shrink-0 flex-col items-center justify-center gap-3 self-center rounded-[24px] bg-[#0055ff] text-white transition hover:bg-[#0046d5] active:scale-[0.98] sm:self-auto">
          <Download size={32} strokeWidth={2.2} /><span className="text-sm font-bold">Nexo Bridge</span>
        </a>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">Nexo Bridge</h2>
          <p className="mt-1 text-sm text-slate-600">Ponte de conexão entre o House Mix e o vMix.</p>
          <div className="mt-4 space-y-1.5 text-sm text-slate-600">
            <p><strong className="text-slate-800">Versão:</strong> {details.version}</p>
            <p><strong className="text-slate-800">Última atualização:</strong> {formatDate(details.updatedAt)}</p>
            <p><strong className="text-slate-800">Tamanho:</strong> {formatSize(details.sizeBytes)}</p>
          </div>
        </div>
      </article>
    </section>
  );
}
