import { useState, useMemo } from "react";
import { Code2, Copy, Check } from "lucide-react";

interface XmlLinkRowProps {
  label: string;
  xmlContent: string;
  dark?: boolean;
}

export default function XmlLinkRow({ label, xmlContent, dark }: XmlLinkRowProps) {
  const [copied, setCopied] = useState(false);

  const url = useMemo(() => {
    if (!xmlContent) return "";
    return URL.createObjectURL(new Blob([xmlContent], { type: "application/xml" }));
  }, [xmlContent]);

  if (!url) return null;

  const copy = () => {
    navigator.clipboard.writeText(url);
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
      <span className={`text-[10px] truncate flex-1 font-mono ${dark ? "text-zinc-500" : "text-muted-foreground"}`}>{url}</span>
      {copied
        ? <Check size={16} className={dark ? "text-green-400 shrink-0" : "text-primary shrink-0"} />
        : <Copy size={16} className={`shrink-0 ${dark ? "text-zinc-500" : "text-muted-foreground"}`} />
      }
    </div>
  );
}
