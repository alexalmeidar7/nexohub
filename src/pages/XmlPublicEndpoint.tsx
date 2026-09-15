import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, Copy, Download, ExternalLink, RefreshCw, FileCode } from "lucide-react";
import { findClientAccountById, findClientAccountByEmail, CLIENT_ACCOUNTS } from "@/lib/clientAuthAccounts";

const SUPABASE_BASE = "https://zzjfzxxvxbspbdkodoix.supabase.co";

export default function XmlPublicEndpoint() {
  const { slug, file } = useParams<{ slug?: string; file?: string }>();
  const [searchParams] = useSearchParams();
  const [xmlContent, setXmlContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Normalize slug & filename
  const cleanSlug = (slug || "default").toLowerCase();
  const rawFile = (file || "broadcast.xml").toLowerCase();
  const filename = rawFile.endsWith(".xml") ? rawFile : `${rawFile}.xml`;

  // Find account info if available
  const account = CLIENT_ACCOUNTS.find(
    (c) => c.slug.toLowerCase() === cleanSlug || (c.aliases && c.aliases.includes(cleanSlug))
  );
  const stationUid = account?.id || "b2f70324-d086-4a5d-a407-cbc4acf98dce";
  const stationName = account?.nome || "House Mix Emissora";

  // Build corresponding Supabase fallback URL
  let supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-broadcast?user_id=${stationUid}`;
  if (filename.includes("geral")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-geral?user_id=${stationUid}&slug=${cleanSlug}`;
  } else if (filename.includes("tempo")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/storage/v1/object/public/xml-files/xml-tempo-${stationUid}.xml`;
  } else if (filename.includes("roteiro")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-roteiro-estudio?user_id=${stationUid}&estudio=Estudio%20FM`;
  } else if (filename.includes("logos")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-logos?user_id=${stationUid}`;
  } else if (filename.includes("batalha")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-batalha?user_id=${stationUid}`;
  } else if (filename.includes("enquete")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-enquete?user_id=${stationUid}`;
  } else if (filename.includes("quiz")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-quiz?user_id=${stationUid}`;
  }

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    const loadXml = async () => {
      try {
        // 1. Try static file first
        const staticUrl = `/xml/${cleanSlug}/${filename}`;
        const res = await fetch(staticUrl);
        if (res.ok) {
          const text = await res.text();
          if (text.includes("<?xml") || (text.includes("<") && !text.includes("<!DOCTYPE html>"))) {
            if (isMounted) {
              setXmlContent(text.trim());
              setLoading(false);
              return;
            }
          }
        }

        // 2. If static file not found on host, immediately redirect to working Supabase XML
        if (supabaseFallbackUrl) {
          window.location.replace(supabaseFallbackUrl);
          return;
        }
      } catch (err: any) {
        if (isMounted) {
          setError(err?.message || "Erro ao carregar feed XML");
          setLoading(false);
        }
      }
    };

    loadXml();

    return () => {
      isMounted = false;
    };
  }, [cleanSlug, filename, supabaseFallbackUrl, stationName]);

  const handleCopy = () => {
    if (!xmlContent) return;
    navigator.clipboard.writeText(xmlContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    if (!xmlContent) return;
    const blob = new Blob([xmlContent], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isRaw = searchParams.get("raw") === "1";

  if (isRaw) {
    return (
      <pre style={{ margin: 0, padding: 16, fontFamily: "monospace", fontSize: 13, whiteSpace: "pre-wrap" }}>
        {xmlContent}
      </pre>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top bar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-[#0055ff] border border-blue-500/30 flex items-center justify-center font-mono font-bold">
            <FileCode size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-400">Feed XML</span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs text-slate-300 font-semibold">{stationName}</span>
            </div>
            <h1 className="text-sm font-mono font-bold text-white tracking-tight">
              /xml/{cleanSlug}/{filename}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Supabase link button */}
          <a
            href={supabaseFallbackUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir endpoint XML direto no Supabase"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <ExternalLink size={13} />
            <span>Link Supabase</span>
          </a>

          {/* Copy XML button */}
          <button
            onClick={handleCopy}
            disabled={!xmlContent}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition shadow-sm ${
              copied ? "bg-green-600 hover:bg-green-500" : "bg-[#0055ff] hover:bg-blue-600"
            }`}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            <span>{copied ? "Copiado!" : "Copiar XML"}</span>
          </button>

          {/* Download button */}
          <button
            onClick={handleDownload}
            disabled={!xmlContent}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
          >
            <Download size={13} />
            <span>Baixar .xml</span>
          </button>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 p-4 max-w-7xl w-full mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center min-h-[300px] text-slate-400 gap-3">
            <RefreshCw className="animate-spin text-[#0055ff]" size={28} />
            <span className="text-sm">Carregando dados do feed XML...</span>
          </div>
        ) : error ? (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 text-sm">
            {error}
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-900 overflow-hidden shadow-2xl">
            <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>application/xml; charset=utf-8</span>
              <span>{xmlContent.length} bytes</span>
            </div>
            <pre className="p-4 text-xs sm:text-sm font-mono text-emerald-300 overflow-x-auto whitespace-pre leading-relaxed select-all">
              {xmlContent}
            </pre>
          </div>
        )}
      </main>
    </div>
  );
}
