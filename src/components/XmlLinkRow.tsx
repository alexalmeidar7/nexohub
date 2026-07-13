import { useState, useEffect, useRef } from "react";
import { Code2, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface XmlLinkRowProps {
  label: string;
  xmlContent?: string;
  permanentUrl?: string;
  dark?: boolean;
  compact?: boolean;
  /**
   * Optional per-user scope key. When provided, the uploaded XML filename is
   * suffixed with this value so that one tenant cannot overwrite another
   * tenant's public XML in shared storage. Always pass the authenticated
   * user's id for any XML that contains tenant-specific data.
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


export default function XmlLinkRow({ label, xmlContent, permanentUrl: externalUrl, dark, compact, scopeKey }: XmlLinkRowProps) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState<string>(externalUrl || "");
  const [uploading, setUploading] = useState(false);
  const lastUploadSignatureRef = useRef<string>("");

  // If permanentUrl is provided, use it directly (no upload needed)
  useEffect(() => {
    if (externalUrl) {
      setUrl(externalUrl);
    }
  }, [externalUrl]);

  // Legacy: upload xmlContent to storage if no permanentUrl
  useEffect(() => {
    if (externalUrl || !xmlContent) return;
    const uploadSignature = `${scopeKey || "__global__"}::${xmlContent}`;
    if (uploadSignature === lastUploadSignatureRef.current) return;
    lastUploadSignatureRef.current = uploadSignature;

    const upload = async () => {
      setUploading(true);
      try {
        const fileName = sanitizeFileName(label, scopeKey);
        const file = new Blob([xmlContent], { type: "application/xml" });

        const { error } = await supabase.storage
          .from("xml-files")
          .upload(fileName, file, { upsert: true, contentType: "application/xml" });

        if (error) {
          console.error("Upload XML error:", error);
          setUploading(false);
          return;
        }

        const { data: urlData } = supabase.storage
          .from("xml-files")
          .getPublicUrl(fileName);

        if (urlData?.publicUrl) {
          setUrl(urlData.publicUrl);
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

  if (compact) {
    return (
      <div
        onClick={copy}
        className="cursor-pointer py-1 transition-opacity hover:opacity-80"
      >
        <div className="flex items-center gap-2">
          <Code2 size={14} className="shrink-0" style={{ color: "var(--layout-accent-color, #2563eb)" }} />
          <span className="text-[10px] text-white/70 font-bold whitespace-nowrap">{label}</span>
          {!ready ? (
            <Loader2 size={12} className="shrink-0 animate-spin text-white/40 ml-auto" />
          ) : copied ? (
            <Check size={12} className="shrink-0 text-green-400 ml-auto" />
          ) : (
            <Copy size={12} className="shrink-0 text-white/40 ml-auto" />
          )}
        </div>
        <p className="text-[8px] font-mono text-white/40 truncate mt-0.5 pl-5">
          {!ready ? "Gerando link..." : url}
        </p>
      </div>
    );
  }

  return (
    <div
      onClick={copy}
      className="group flex items-center gap-3 rounded-lg px-3.5 py-2.5 cursor-pointer transition-all"
      style={{
        backgroundColor: "color-mix(in srgb, var(--layout-page-bg, #ffffff) 94%, var(--layout-border-color, #333))",
        border: "1px solid color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--layout-accent-color, #268ffa)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)"; }}
    >
      <div className="w-7 h-7 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: "color-mix(in srgb, var(--layout-accent-color, #268ffa) 12%, transparent)" }}>
        <Code2 size={14} style={{ color: "var(--layout-accent-color, #268ffa)" }} />
      </div>
      <span className="text-[10px] font-bold uppercase whitespace-nowrap tracking-wide" style={{ color: "var(--layout-page-text, #1a1a1a)" }}>{label}</span>
      <span className="text-[9px] truncate flex-1 font-mono" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 45%, transparent)" }}>
        {!ready ? "Gerando link..." : url}
      </span>
      {!ready ? (
        <Loader2 size={14} className="shrink-0 animate-spin" style={{ color: "var(--layout-accent-color, #268ffa)" }} />
      ) : copied ? (
        <Check size={14} className="shrink-0" style={{ color: "#22c55e" }} />
      ) : (
        <Copy size={14} className="shrink-0 opacity-40 group-hover:opacity-80 transition-opacity" style={{ color: "var(--layout-page-text, #1a1a1a)" }} />
      )}
    </div>
  );
}
