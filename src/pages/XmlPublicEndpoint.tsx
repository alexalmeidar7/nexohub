import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { Check, Copy, Download, ExternalLink, RefreshCw, FileCode } from "lucide-react";
import { findClientAccountById, findClientAccountByEmail, CLIENT_ACCOUNTS } from "@/lib/clientAuthAccounts";
import {
  getBrasiliaDateTime,
  isScheduleActive,
  getActiveEnquete,
  getActiveQuiz,
  getActiveBatalha,
  buildEnqueteXml,
  buildQuizXml,
  buildBatalhaXml,
  escapeXml,
} from "@/lib/scheduledItemUtils";

const envSupabase = import.meta.env.VITE_SUPABASE_URL || "";
const isDeadDomain = !envSupabase || envSupabase.includes("zzjfzxxvxbspbdkodoix.supabase.co");
const SUPABASE_BASE = isDeadDomain ? (typeof window !== "undefined" ? window.location.origin : "") : envSupabase;

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
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-enquete?user_id=${stationUid}&slug=${cleanSlug}`;
  } else if (filename.includes("quiz")) {
    supabaseFallbackUrl = `${SUPABASE_BASE}/functions/v1/serve-xml-quiz?user_id=${stationUid}&slug=${cleanSlug}`;
  }

  const loadXml = useCallback(async (isMounted = true) => {
    try {
      const { today, currentTime } = getBrasiliaDateTime();

      // Special dynamic handler for enquete.xml
      if (filename.includes("enquete")) {
        // 1. Check local storage for station scheduled enquetes
        const localKeys = [
          `nexohub_enquetes_${stationUid}`,
          `nexohub_enquetes_${cleanSlug}`,
          `nexohub_enquetes_${account?.slug || ""}`,
        ];
        let localEnquetes: any[] = [];
        for (const k of localKeys) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const p = JSON.parse(raw);
              if (Array.isArray(p) && p.length > 0) {
                localEnquetes = p;
                break;
              }
            }
          } catch {}
        }

        const activeEnquete = getActiveEnquete(localEnquetes, today, currentTime);

        if (activeEnquete) {
          const generated = buildEnqueteXml(activeEnquete, stationName);
          if (isMounted) {
            setXmlContent(generated.trim());
            setLoading(false);
          }
          return;
        }

        // 2. Try fetching from dynamic endpoints
        const candidateUrls = [
          `/xml/${cleanSlug}/${filename}`,
          `/enquete.xml`,
          `/xml/enquete.xml`,
          `/functions/v1/serve-xml-enquete?slug=${cleanSlug}&user_id=${stationUid}`,
        ];
        for (const url of candidateUrls) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const text = await res.text();
              if (text.includes("<enquete>") || (text.includes("<?xml") && !text.includes("<!DOCTYPE html>"))) {
                if (isMounted) {
                  setXmlContent(text.trim());
                  setLoading(false);
                }
                return;
              }
            }
          } catch {}
        }

        // 3. Fallback: clean empty XML
        if (isMounted) {
          setXmlContent(buildEnqueteXml(null).trim());
          setLoading(false);
        }
        return;
      }

      // Special dynamic handler for quiz.xml
      if (filename.includes("quiz")) {
        // 1. Check local storage for station scheduled quizzes
        const localKeys = [
          `nexohub_quizzes_${stationUid}`,
          `nexohub_quizzes_${cleanSlug}`,
          `nexohub_quizzes_${account?.slug || ""}`,
        ];
        let localQuizzes: any[] = [];
        for (const k of localKeys) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const p = JSON.parse(raw);
              if (Array.isArray(p) && p.length > 0) {
                localQuizzes = p;
                break;
              }
            }
          } catch {}
        }

        const activeQuiz = getActiveQuiz(localQuizzes);

        if (activeQuiz) {
          const generated = buildQuizXml(activeQuiz);
          if (isMounted) {
            setXmlContent(generated.trim());
            setLoading(false);
          }
          return;
        }

        // 2. Try fetching from dynamic endpoints
        const candidateUrls = [
          `/xml/${cleanSlug}/${filename}`,
          `/quiz.xml`,
          `/xml/quiz.xml`,
          `/functions/v1/serve-xml-quiz?slug=${cleanSlug}&user_id=${stationUid}`,
        ];
        for (const url of candidateUrls) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const text = await res.text();
              if (text.includes("<quiz>") || (text.includes("<?xml") && !text.includes("<!DOCTYPE html>"))) {
                if (isMounted) {
                  setXmlContent(text.trim());
                  setLoading(false);
                }
                return;
              }
            }
          } catch {}
        }

        // 3. Fallback: clean empty XML
        if (isMounted) {
          setXmlContent(buildQuizXml(null).trim());
          setLoading(false);
        }
        return;
      }

      // Special dynamic handler for batalha.xml
      if (filename.includes("batalha")) {
        // 1. Check local storage for station scheduled battles
        const localKeys = [
          `nexohub_batalhas_${stationUid}`,
          `nexohub_batalhas_${cleanSlug}`,
          `nexohub_batalhas_${account?.slug || ""}`,
        ];
        let localBatalhas: any[] = [];
        for (const k of localKeys) {
          try {
            const raw = localStorage.getItem(k);
            if (raw) {
              const p = JSON.parse(raw);
              if (Array.isArray(p) && p.length > 0) {
                localBatalhas = p;
                break;
              }
            }
          } catch {}
        }

        const activeBat = getActiveBatalha(localBatalhas);

        if (activeBat) {
          const generated = buildBatalhaXml(activeBat, stationName);
          if (isMounted) {
            setXmlContent(generated.trim());
            setLoading(false);
          }
          return;
        }

        // 2. Try fetching from dynamic endpoints
        const candidateUrls = [
          `/xml/${cleanSlug}/${filename}`,
          `/batalha.xml`,
          `/xml/batalha.xml`,
          `/functions/v1/serve-xml-batalha?slug=${cleanSlug}&user_id=${stationUid}`,
        ];
        for (const url of candidateUrls) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const text = await res.text();
              if (text.includes("<batalha>") || (text.includes("<?xml") && !text.includes("<!DOCTYPE html>"))) {
                if (isMounted) {
                  setXmlContent(text.trim());
                  setLoading(false);
                }
                return;
              }
            }
          } catch {}
        }

        // 3. Fallback: clean empty XML
        if (isMounted) {
          setXmlContent(buildBatalhaXml(null, stationName).trim());
          setLoading(false);
        }
        return;
      }

      // Special dynamic handler for roteiro.xml
      if (filename.includes("roteiro")) {
        try {
          const staticUrl = `/xml/${cleanSlug}/${filename}?t=${Date.now()}`;
          const res = await fetch(staticUrl);
          if (res.ok) {
            const text = await res.text();
            if (text.includes("<programaExpress>") && !text.includes("<error>")) {
              if (isMounted) {
                setXmlContent(text.trim());
                setLoading(false);
                return;
              }
            }
          }
        } catch {}

        if (supabaseFallbackUrl) {
          try {
            const fbRes = await fetch(`${supabaseFallbackUrl}&t=${Date.now()}`);
            if (fbRes.ok) {
              const fbText = await fbRes.text();
              if (fbText.includes("<programaExpress>") && !fbText.includes("<error>")) {
                if (isMounted) {
                  setXmlContent(fbText.trim());
                  setLoading(false);
                  return;
                }
              }
            }
          } catch {}
        }
      }

      // 1. Try static / dynamic endpoints
      const candidateUrls = [
        `/xml/${cleanSlug}/${filename}?t=${Date.now()}`,
        `/${cleanSlug}/${filename}?t=${Date.now()}`,
        ...(filename.includes("broadcast")
          ? [`/functions/v1/serve-xml-broadcast?user_id=${stationUid}&t=${Date.now()}`]
          : []),
      ];

      for (const staticUrl of candidateUrls) {
        try {
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
        } catch {}
      }

      // 2. If static file not found on host, try fetching from the XML endpoint
      if (supabaseFallbackUrl) {
        try {
          const fbRes = await fetch(supabaseFallbackUrl);
          if (fbRes.ok) {
            const fbText = await fbRes.text();
            if (fbText.includes("<") && !fbText.includes("<!DOCTYPE html>")) {
              if (isMounted) {
                setXmlContent(fbText.trim());
                setLoading(false);
                return;
              }
            }
          }
        } catch {}
      }
    } catch (err: any) {
      if (isMounted) {
        setError(err?.message || "Erro ao carregar feed XML");
        setLoading(false);
      }
    }
  }, [cleanSlug, filename, supabaseFallbackUrl, stationUid, account?.slug]);

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
          filename.includes("broadcast"))
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
