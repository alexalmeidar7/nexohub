import { useState, useEffect, useRef } from "react";
import { Code2, Copy, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface XmlLinkRowProps {
  label: string;
  xmlContent: string;
  dark?: boolean;
  compact?: boolean;
}

function sanitizeFileName(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-]/g, "") + ".xml";
}

export default function XmlLinkRow({ label, xmlContent, dark }: XmlLinkRowProps) {
  const [copied, setCopied] = useState(false);
  const [permanentUrl, setPermanentUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);
  const lastContentRef = useRef<string>("");

  useEffect(() => {
    if (!xmlContent || xmlContent === lastContentRef.current) return;
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
          // Add cache-buster to force fresh content
          setPermanentUrl(urlData.publicUrl + "?t=" + Date.now());
        }
      } catch (err) {
        console.error("Upload XML error:", err);
      }
      setUploading(false);
    };

    upload();
  }, [xmlContent, label]);

  if (!xmlContent) return null;

  const copy = () => {
    if (!permanentUrl) return;
    navigator.clipboard.writeText(permanentUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      onClick={copy}
      className={`flex items-center gap-3 rounded-xl p-4 border cursor-pointer transition-colors ${
        dark
          ? "bg-zinc-800 border-zinc-700 hover:border-zinc-500"
          : "bg-muted border-border hover:border-primary"
      }`}
    >
      <Code2 size={18} className={dark ? "text-violet-400 shrink-0" : "text-primary shrink-0"} />
      <span className={`text-xs font-bold whitespace-nowrap ${dark ? "text-zinc-300" : "text-foreground"}`}>{label}</span>
      <span className={`text-[10px] truncate flex-1 font-mono ${dark ? "text-zinc-500" : "text-muted-foreground"}`}>
        {uploading ? "Enviando..." : permanentUrl || "Gerando link..."}
      </span>
      {uploading ? (
        <Loader2 size={16} className={`shrink-0 animate-spin ${dark ? "text-zinc-500" : "text-muted-foreground"}`} />
      ) : copied ? (
        <Check size={16} className={dark ? "text-green-400 shrink-0" : "text-primary shrink-0"} />
      ) : (
        <Copy size={16} className={`shrink-0 ${dark ? "text-zinc-500" : "text-muted-foreground"}`} />
      )}
    </div>
  );
}
