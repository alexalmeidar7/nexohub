import { useState, useEffect, useRef } from "react";
import { Code2, Copy, Check, Loader2, ExternalLink, Route } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import XmlXPathDialog from "./XmlXPathDialog";
import type { InteractiveXmlFeed } from "@/lib/interactiveXmlSchema";
import { localizeXmlImageUrls } from "@/lib/desktopLocalXml";
import { saveDesktopXml } from "@/lib/desktopPromotionBanners";

interface XmlLinkRowProps {
  label: string;
  xmlContent?: string;
  permanentUrl?: string;
  /** @deprecated Mantido por compatibilidade; visual agora é padronizado. */
  dark?: boolean;
  /** @deprecated Mantido por compatibilidade; visual agora é padronizado. */
  compact?: boolean;
  /** Rótulo pequeno acima do nome (default: "XML"). */
  kicker?: string;
  /**
   * Optional per-user scope key. When provided, the uploaded XML filename is
   * suffixed with this value so that one tenant cannot overwrite another
   * tenant's public XML in shared storage.
   */
  scopeKey?: string;
  /** Exibe a URL formatada abaixo do título */
  showUrl?: boolean;
  /** Descrição opcional do feed */
  description?: string;
  /** URL do feed direto no Supabase (mantido para redundância) */
  supabaseUrl?: string;
  interactiveFeed?: InteractiveXmlFeed;
}

function sanitizeFileName(label: string, scopeKey?: string): string {
  const base = label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "");
  const scope = scopeKey
    ? "--" + scopeKey.toLowerCase().replace(/[^a-z0-9\-]/g, "")
    : "";
  return `${base}${scope}.xml`;
}

function sanitizeFolder(id: string): string {
  return id.toLowerCase().replace(/[^a-z0-9\-]/g, "");
}

function prettifyLabel(label: string): string {
  if (
    label === "APENAS XML" ||
    label.toLowerCase() === "apenas xml" ||
    label.toLowerCase() === "broadcast" ||
    label.toLowerCase() === "xml broadcast"
  ) {
    return "Broadcast";
  }
  if (
    label === "XML GERAL" ||
    label.toLowerCase() === "geral" ||
    label.toLowerCase() === "xml geral"
  ) {
    return "Geral (Todos os Feeds)";
  }
  const cleaned = label.replace(/^xml\s+/i, "").trim();
  if (!cleaned) return label;
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.toLowerCase() === "xml" ? "XML" : (w.length ? w[0].toUpperCase() + w.slice(1) : w)))
    .join(" ");
}

export default function XmlLinkRow({
  label,
  xmlContent,
  permanentUrl: externalUrl,
  scopeKey,
  kicker,
  showUrl = false,
  description,
  supabaseUrl,
  interactiveFeed,
}: XmlLinkRowProps) {
  const [copied, setCopied] = useState(false);
  const [xpathOpen, setXpathOpen] = useState(false);
  const [url,  setUrl] = useState<string>(externalUrl || "");
  const [uploading, setUploading] = useState(false);
  const lastUploadSignatureRef = useRef<string>("");

  useEffect(() => {
    if (externalUrl) setUrl(externalUrl);
  }, [externalUrl]);

  useEffect(() => {
    if (!externalUrl || !window.houseMixDesktop) return;
    try {
      const parts = new URL(externalUrl).pathname.split("/").filter(Boolean);
      const slug = decodeURIComponent(parts.at(-2) || "");
      const filename = decodeURIComponent(parts.at(-1) || "");
      void window.houseMixDesktop.getXmlPath(slug, filename).then(setUrl).catch(() => {});
    } catch { /* retain the web endpoint if URL parsing is unavailable */ }
  }, [externalUrl]);

  useEffect(() => {
    if (!externalUrl || !supabaseUrl || !window.houseMixDesktop) return;
    let active = true;
    const parts = new URL(externalUrl).pathname.split("/").filter(Boolean);
    const slug = decodeURIComponent(parts.at(-2) || "");
    const filename = decodeURIComponent(parts.at(-1) || "");
    let timer: ReturnType<typeof setTimeout>;
    const sync = async () => {
      try {
        const response = await fetch(supabaseUrl, { cache: "no-store", signal: AbortSignal.timeout(12000) });
        if (!response.ok) return;
        const xml = (await response.text()).trim();
        if (active && xml.startsWith("<") && !xml.includes("<!DOCTYPE html>") && !xml.includes("<error>")) {
          const desktop = window.houseMixDesktop!;
          const localXml = await localizeXmlImageUrls(xml, slug, desktop);
          if (!active) return;
          const saved = await saveDesktopXml(desktop, slug, filename, localXml);
          if (active && saved) setUrl(saved);
        }
      } catch { /* keep the last good local XML when offline */ }
      finally { if (active) timer = setTimeout(() => void sync(), 30000); }
    };
    void sync();
    return () => { active = false; clearTimeout(timer); };
  }, [externalUrl, supabaseUrl]);

  useEffect(() => {
    if (externalUrl || !xmlContent) return;
    const uploadSignature = `${scopeKey || "__global__"}::${xmlContent}`;
    if (uploadSignature === lastUploadSignatureRef.current) return;
    lastUploadSignatureRef.current = uploadSignature;

    const upload = async () => {
      setUploading(true);
      try {
        const { data: authData } = await supabase.auth.getUser();
        const uid = authData?.user?.id;
        if (!uid) {
          setUploading(false);
          return;
        }
        const fileName = sanitizeFileName(label, scopeKey);
        const path = `${sanitizeFolder(uid)}/${fileName}`;
        const file = new Blob([xmlContent], { type: "application/xml" });

        const { error } = await supabase.storage
          .from("xml-files")
          .upload(path, file, { upsert: true, contentType: "application/xml" });

        if (error) {
          console.error("Upload XML error:", error);
          setUploading(false);
          return;
        }

        const { data: urlData } = supabase.storage
          .from("xml-files")
          .getPublicUrl(path);

        if (urlData?.publicUrl) {
          setUrl(`${urlData.publicUrl}?t=${Date.now()}`);
        }
      } catch (err) {
        console.error("Upload XML error:", err);
      }
      setUploading(false);
    };

    upload();
  }, [xmlContent, label, externalUrl, scopeKey]);

  const ready = !!externalUrl || (!uploading && !!url);

  if (!xmlContent && !externalUrl) return null;

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    setCopied(true);
    toast.success(`URL copiada: ${displayName}`);
    setTimeout(() => setCopied(false), 2000);
  };

  const displayName = prettifyLabel(label) || "XML";
  const displayKicker = (kicker || "XML").toUpperCase();

  return (
    <div
      onClick={copy}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copy();
        }
      }}
      title={url || "Gerando link..."}
      className="group flex items-center gap-3 cursor-pointer transition-all hover:border-[#0055ff] hover:shadow-xs"
      style={{
        background: "#ffffff",
        border: "1px solid rgba(226, 232, 240, 0.9)",
        borderRadius: showUrl ? 18 : 999,
        padding: showUrl ? "10px 14px" : "10px 10px 10px 16px",
        fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
      }}
    >
      {/* Ícone à esquerda */}
      <div
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 34,
          height: 34,
          borderRadius: 999,
          background: "rgba(0, 85, 255, 0.08)",
        }}
      >
        <Code2 size={16} style={{ color: "#0055ff" }} strokeWidth={2.5} />
      </div>

      {/* Textos */}
      <div className="flex-1 min-w-0 leading-tight">
        <div className="flex items-center gap-2">
          <span
            style={{
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              color: "#64748b",
            }}
          >
            {displayKicker}
          </span>
          {description && (
            <span
              className="text-[10px] text-slate-400 font-medium truncate hidden sm:inline"
            >
              • {description}
            </span>
          )}
        </div>
        <div
          className="truncate"
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          {displayName}
        </div>
        {showUrl && url && (
          <div
            className="truncate select-all"
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: "#64748b",
              marginTop: 2,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {url}
          </div>
        )}
        {/* Exibimos apenas a URL permanente do feed. A URL alternativa do
            Supabase continua aceita por compatibilidade, mas não é mostrada
            como um segundo link para não confundir os clientes. */}
      </div>

      {/* Ações à direita */}
      <div className="shrink-0 flex items-center gap-1.5">
        {ready && url && !window.houseMixDesktop && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setXpathOpen(true); }}
            title="Ver XPath de cada nó para o vMix"
            className="h-8 px-2.5 rounded-full flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-[#0055ff] bg-blue-50 hover:bg-blue-100 transition-colors cursor-pointer"
          >
            <Route size={12} /> XPath
          </button>
        )}
        {ready && url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            title="Abrir feed XML em nova aba"
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-[#0055ff] hover:bg-blue-50 transition-colors cursor-pointer"
          >
            <ExternalLink size={14} />
          </a>
        )}

        {/* Botão copiar (azul #0055ff) */}
        <div
          className="shrink-0 flex items-center justify-center transition-transform group-hover:scale-105"
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            background: copied ? "#16a34a" : "#0055ff",
            boxShadow: copied ? "0 2px 8px rgba(22, 163, 74, 0.3)" : "0 2px 8px rgba(0, 85, 255, 0.25)",
          }}
        >
          {!ready ? (
            <Loader2 size={16} className="animate-spin text-white" />
          ) : copied ? (
            <Check size={16} className="text-white" strokeWidth={3} />
          ) : (
            <Copy size={16} className="text-white" strokeWidth={2.5} />
          )}
        </div>
      </div>
      <div onClick={(e) => e.stopPropagation()}>
        <XmlXPathDialog
          open={xpathOpen}
          onOpenChange={setXpathOpen}
          title={displayName}
          url={url}
          xmlContent={externalUrl ? undefined : xmlContent}
          interactiveFeed={interactiveFeed}
        />
      </div>
    </div>
  );
}
