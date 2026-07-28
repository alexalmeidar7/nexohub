import { useState, useEffect, useRef } from "react";
import { Code2, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

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
  const cleaned = label.replace(/^xml\s+/i, "").trim();
  if (!cleaned) return label;
  return cleaned
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

export default function XmlLinkRow({
  label,
  xmlContent,
  permanentUrl: externalUrl,
  scopeKey,
  kicker,
}: XmlLinkRowProps) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState<string>(externalUrl || "");
  const [uploading, setUploading] = useState(false);
  const lastUploadSignatureRef = useRef<string>("");

  useEffect(() => {
    if (externalUrl) setUrl(externalUrl);
  }, [externalUrl]);

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
      className="group flex items-center gap-3 cursor-pointer transition-all"
      style={{
        background: "#ffffff",
        border: "1.5px solid #00BFF0",
        borderRadius: 999,
        padding: "10px 10px 10px 14px",
        fontFamily: "'Montserrat', 'Inter', system-ui, sans-serif",
      }}
    >
      {/* Ícone à esquerda */}
      <div
        className="shrink-0 flex items-center justify-center"
        style={{
          width: 32,
          height: 32,
          borderRadius: 999,
          background: "rgba(0,191,240,0.15)",
        }}
      >
        <Code2 size={15} style={{ color: "#00BFF0" }} strokeWidth={2.5} />
      </div>

      {/* Textos */}
      <div className="flex-1 min-w-0 leading-tight">
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#6b7280",
          }}
        >
          {displayKicker}
        </div>
        <div
          className="truncate"
          style={{
            fontSize: 14,
            fontWeight: 700,
            color: "#0f172a",
          }}
        >
          {displayName}
        </div>
      </div>

      {/* Botão copiar (pílula lime) */}
      <div
        className="shrink-0 flex items-center justify-center transition-transform group-hover:scale-105"
        style={{
          width: 36,
          height: 36,
          borderRadius: 999,
          background: copied ? "#22c55e" : "#C6F03C",
          boxShadow: "0 2px 6px rgba(198,240,60,0.4)",
        }}
      >
        {!ready ? (
          <Loader2 size={16} className="animate-spin" style={{ color: "#0f172a" }} />
        ) : copied ? (
          <Check size={16} style={{ color: "#ffffff" }} strokeWidth={3} />
        ) : (
          <Copy size={16} style={{ color: "#0f172a" }} strokeWidth={2.5} />
        )}
      </div>
    </div>
  );
}
