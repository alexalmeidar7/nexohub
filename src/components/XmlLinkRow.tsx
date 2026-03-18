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
      className="flex items-center gap-3 rounded-xl p-4 cursor-pointer transition-colors"
      style={dark
        ? { backgroundColor: "#0d0446", border: "2px solid #0d0446" }
        : undefined
      }
      onMouseEnter={e => { if (dark) e.currentTarget.style.borderColor = "#2dbef3"; }}
      onMouseLeave={e => { if (dark) e.currentTarget.style.borderColor = "#0d0446"; }}
    >
      <Code2 size={18} style={dark ? { color: "#2ec1f7" } : undefined} className={dark ? "shrink-0" : "text-primary shrink-0"} />
      <span style={dark ? { color: "#ffffff" } : undefined} className={`text-xs font-bold whitespace-nowrap ${!dark ? "text-foreground" : ""}`}>{label}</span>
      <span style={dark ? { color: "#ffffff" } : undefined} className={`text-[10px] truncate flex-1 font-mono ${!dark ? "text-muted-foreground" : ""}`}>
        {!ready ? "Gerando link..." : url}
      </span>
      {!ready ? (
        <Loader2 size={16} style={dark ? { color: "#2ec1f7" } : undefined} className={`shrink-0 animate-spin ${dark ? "" : "text-muted-foreground"}`} />
      ) : copied ? (
        <Check size={16} className={dark ? "text-green-400 shrink-0" : "text-primary shrink-0"} />
      ) : (
        <Copy size={16} style={dark ? { color: "#2ec1f7" } : undefined} className={`shrink-0 ${dark ? "" : "text-muted-foreground"}`} />
      )}
    </div>
  );
}
