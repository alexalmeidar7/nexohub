import { useState, useEffect, useRef } from "react";
import { Code2, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface XmlLinkRowProps {
  label: string;
  xmlContent?: string;
  permanentUrl?: string;
  dark?: boolean;
  compact?: boolean;
}

function sanitizeFileName(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "") + ".xml";
}

export default function XmlLinkRow({ label, xmlContent, permanentUrl: externalUrl, dark, compact }: XmlLinkRowProps) {
  const [copied, setCopied] = useState(false);
  const [url, setUrl] = useState<string>(externalUrl || "");
  const [uploading, setUploading] = useState(false);
  const lastContentRef = useRef<string>("");

  // If permanentUrl is provided, use it directly (no upload needed)
  useEffect(() => {
    if (externalUrl) {
      setUrl(externalUrl);
    }
  }, [externalUrl]);

  // Legacy: upload xmlContent to storage if no permanentUrl
  useEffect(() => {
    if (externalUrl || !xmlContent || xmlContent === lastContentRef.current) return;
    lastContentRef.current = xmlContent;

    const upload = async () => {
      setUploading(true);
      try {
        const fileName = sanitizeFileName(label);
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
  }, [xmlContent, label, externalUrl]);

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
          <Code2 size={14} className="shrink-0" style={{ color: "#268ffa" }} />
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
      className="flex items-center gap-3 rounded-xl p-4 cursor-pointer transition-all"
      style={{
        backgroundColor: "var(--layout-header-bg, #0d0446)",
        border: "2px solid var(--layout-header-bg, #0d0446)",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--layout-icon-color, #268ffa)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--layout-header-bg, #0d0446)"; }}
    >
      <Code2 size={18} className="shrink-0" style={{ color: "var(--layout-icon-color, #268ffa)" }} />
      <span className="text-xs font-bold whitespace-nowrap" style={{ color: "var(--layout-header-text, #ffffff)" }}>{label}</span>
      <span className="text-[10px] truncate flex-1 font-mono" style={{ color: "color-mix(in srgb, var(--layout-header-text, #ffffff) 70%, transparent)" }}>
        {!ready ? "Gerando link..." : url}
      </span>
      {!ready ? (
        <Loader2 size={16} className="shrink-0 animate-spin" style={{ color: "var(--layout-icon-color, #268ffa)" }} />
      ) : copied ? (
        <Check size={16} className="shrink-0" style={{ color: "#22c55e" }} />
      ) : (
        <Copy size={16} className="shrink-0" style={{ color: "var(--layout-icon-color, #268ffa)" }} />
      )}
    </div>
  );
}
