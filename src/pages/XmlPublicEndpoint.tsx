import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, Copy, Download, ExternalLink, RefreshCw, FileCode } from "lucide-react";
import { CLIENT_ACCOUNTS } from "@/lib/clientAuthAccounts";
const envSupabase = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_BASE = envSupabase || (typeof window !== "undefined" ? window.location.origin : "");

export default function XmlPublicEndpoint() {
  const { slug: pathSlug, file: pathFile, functionName, fileName } = useParams<{
    slug?: string;
    file?: string;
    functionName?: string;
    fileName?: string;
  }>();
  const [searchParams] = useSearchParams();
  const [xmlContent, setXmlContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [localXmlPath, setLocalXmlPath] = useState("");

  // Normalize slug & filename
  let resolvedFile = pathFile || "";
  if (functionName) {
    const cleanFn = functionName.toLowerCase();
    if (cleanFn.includes("batalha")) resolvedFile = "batalha.xml";
    else if (cleanFn.includes("enquete")) resolvedFile = "enquete.xml";
    else if (cleanFn.includes("quiz")) resolvedFile = "quiz.xml";
    else if (cleanFn.includes("geral")) resolvedFile = "geral.xml";
    else if (cleanFn.includes("tempo")) resolvedFile = "tempo.xml";
    else if (cleanFn.includes("roteiro")) resolvedFile = "roteiro.xml";
    else if (cleanFn.includes("logos")) resolvedFile = "logos.xml";
    else if (cleanFn.includes("broadcast")) resolvedFile = "broadcast.xml";
    else resolvedFile = `${cleanFn.replace(/^serve-xml-/, "")}.xml`;
  } else if (fileName) {
    if (fileName.includes("tempo")) resolvedFile = "tempo.xml";
    else resolvedFile = fileName;
  }

  const querySlugOrUid =
    searchParams.get("slug") ||
    searchParams.get("user_id") ||
    searchParams.get("userId") ||
    searchParams.get("uid") ||
    "";

  // Find account info if available by query UID, query slug, or path slug
  const cleanQuery = querySlugOrUid.toLowerCase().trim();
  const cleanPathSlug = (pathSlug || "").toLowerCase().trim();

  const account = CLIENT_ACCOUNTS.find(
    (c) =>
      (cleanQuery && (c.id.toLowerCase() === cleanQuery ||
       c.parentUserId?.toLowerCase() === cleanQuery ||
       c.slug.toLowerCase() === cleanQuery ||
       (c.aliases && c.aliases.map((a) => a.toLowerCase()).includes(cleanQuery)))) ||
      (cleanPathSlug && (c.slug.toLowerCase() === cleanPathSlug ||
       (c.aliases && c.aliases.map((a) => a.toLowerCase()).includes(cleanPathSlug))))
  );

  const cleanSlug = account?.slug || (cleanPathSlug && cleanPathSlug !== "xml" ? cleanPathSlug : cleanQuery);
  const LEGACY_STATION_UIDS: Record<string, string> = {
    "d17e65af-e407-466f-9b60-b55c43399513": "452ebd1e-61a0-42dd-bf80-231a3f426c83",
    "b2f70324-d086-4a5d-a407-cbc4acf98dce": "9cab6c46-c32a-4c19-94db-773dcfaf7632",
    "48423cc6-f3b1-4bea-8729-dd0ae76a89c3": "98365ea6-0ebf-496d-83e9-69b38089586d",
    "66337743-4e4f-4950-b58f-750b0c76861e": "b67436c6-ede1-4438-881d-18b9e923adda",
    "29b1107b-3eb0-4eb3-a7f8-d9ca93be24b5": "a05c5b71-a100-40f9-8be3-6eb7035a057b",
  };
  const stationUid = cleanQuery && /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(cleanQuery)
    ? (LEGACY_STATION_UIDS[cleanQuery] || cleanQuery)
    : (account?.parentUserId || account?.id || "");
  const stationName = account?.nome || (cleanSlug === "positivafm" ? "Positiva FM 99.1" : "House Mix Emissora");
  const rawFile = (resolvedFile || "broadcast.xml").toLowerCase();
  const filename = rawFile.endsWith(".xml") ? rawFile : `${rawFile}.xml`;

  useEffect(() => {
    if (!window.houseMixDesktop || !cleanSlug || !filename) return;
    void window.houseMixDesktop.getXmlPath(cleanSlug, filename).then(setLocalXmlPath).catch(() => setLocalXmlPath(""));
  }, [cleanSlug, filename]);

  // Build the official live endpoint (never another tenant's default XML)
  let supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-broadcast?user_id=${stationUid}`;
  if (filename.includes("geral")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-geral?user_id=${stationUid}&slug=${cleanSlug}`;
  } else if (filename.includes("tempo")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-tempo?user_id=${encodeURIComponent(stationUid)}`;
  } else if (filename.includes("roteiro")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-roteiro-estudio?user_id=${stationUid}&estudio=Estudio%20FM`;
  } else if (filename.includes("logos")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-logos?user_id=${stationUid}`;
  } else if (filename.includes("batalha")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-batalha?user_id=${stationUid}`;
  } else if (filename.includes("enquete")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-enquete?user_id=${stationUid}&slug=${cleanSlug}`;
  } else if (filename.includes("quiz")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-quiz?user_id=${stationUid}&slug=${cleanSlug}`;
  }

  const loadXml = useCallback(async (isMounted = true) => {
    try {
      // Feed oficial é sempre consultado diretamente. Dados locais e arquivos
      // gerados no build não podem substituir alterações recentes do banco.
      if (!stationUid) throw new Error("Estação não identificada para este XML");
      const response = await fetch(`${supabaseFallbackUrl}${supabaseFallbackUrl.includes("?") ? "&" : "?"}t=${Date.now()}`, { cache: "no-store" });
      if (!response.ok) throw new Error(`Feed XML indisponível (${response.status})`);
      const liveXml = await response.text();
      if (!liveXml.includes("<") || liveXml.includes("<error>") || liveXml.includes("<!DOCTYPE html>")) {
        throw new Error("Feed XML retornou conteúdo inválido");
      }
      if (window.houseMixDesktop && cleanSlug) {
        const savedPath = await window.houseMixDesktop.saveXml(cleanSlug, filename, liveXml.trim());
        setLocalXmlPath(savedPath);
      }
      if (isMounted) {
        setXmlContent(liveXml.trim());
        setLoading(false);
        setError(null);
      }
    } catch (err: any) {
      if (isMounted) {
        setXmlContent("");
        setError(err?.message || "Erro ao carregar feed XML");
        setLoading(false);
      }
    }
  }, [supabaseFallbackUrl, stationUid, cleanSlug, filename]);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);

    loadXml(isMounted);

    // Auto-refresh dynamic XML every 10 seconds to transition on schedule
    const interval = setInterval(() => {
      if (
        isMounted &&
        (filename.includes("enquete") ||
          filename.includes("quiz") ||
          filename.includes("geral") ||
          filename.includes("roteiro") ||
          filename.includes("broadcast") || filename.includes("batalha") || filename.includes("logos") || filename.includes("tempo"))
      ) {
        loadXml(isMounted);
      }
    }, 10000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [loadXml, filename]);

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
              {localXmlPath || `/xml/${cleanSlug}/${filename}`}
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
