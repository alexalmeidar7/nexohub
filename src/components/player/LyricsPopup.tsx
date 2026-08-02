import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Music2, ArrowLeft } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  artist?: string | null;
  title?: string | null;
  duration?: number;
  onClose?: () => void;
}

function stripLrcTags(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\[\d{2}:\d{2}[.:]\d{2,3}\]\s*/, "").trim())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
}

export default function LyricsPopup({ open, artist, title, duration, onClose }: Props) {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const lastKeyRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Fetch lyrics whenever the popup opens or the song changes
  useEffect(() => {
    if (!open) return;
    if (!artist || !title || title === "Sem título") {
      setLines([]); setNotFound(true); setLoading(false); return;
    }
    const key = `${artist}||${title}`;
    if (key === lastKeyRef.current && lines.length > 0) return;
    lastKeyRef.current = key;

    setLines([]); setNotFound(false); setLoading(true);
    let cancelled = false;

    supabase.functions
      .invoke("fetch-lyrics", {
        body: { artist, title, duration: duration ? Math.round(duration) : undefined },
      })
      .then(({ data, error }) => {
        if (cancelled || lastKeyRef.current !== key) return;
        setLoading(false);
        const raw: string | null = data?.plainLyrics || data?.syncedLyrics || null;
        if (error || !data?.success || !raw) { setNotFound(true); return; }
        const parsed = stripLrcTags(raw);
        if (parsed.length === 0) { setNotFound(true); return; }
        setLines(parsed);
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
      })
      .catch(() => {
        if (cancelled || lastKeyRef.current !== key) return;
        setLoading(false); setNotFound(true);
      });

    return () => { cancelled = true; };
  }, [open, artist, title, duration]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Encerra apenas o contexto do popup de letra
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-end p-8 pointer-events-none animate-in fade-in duration-300"
      style={{
        background: "transparent",
      }}
      onClick={onClose}
    >
      <div 
        className="fixed inset-y-0 right-0 w-[500px] pointer-events-none transition-opacity duration-700 ease-in-out"
        style={{
          background: "linear-gradient(to left, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)",
          zIndex: -1,
          opacity: 1
        }}
      />

      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[360px] pointer-events-auto animate-in fade-in slide-in-from-bottom-8 duration-300"
        style={{
          padding: "22px 24px 18px",
          borderRadius: 32,
          background: "rgba(35,35,38,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 40px 100px -20px rgba(0,0,0,0.95)",
          marginBottom: "140px",
          marginRight: "20px",
        }}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/55">
              <Music2 size={11} /> letra da música
            </div>
            <div className="mt-1 text-[15px] font-bold text-white truncate">{title || "—"}</div>
            <div className="text-[12px] text-white/60 truncate">{artist || ""}</div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center border border-white/15 text-white/80 hover:bg-white/10 hover:border-white/30 transition relative group"
            aria-label="Voltar"
            data-focusable
          >
            <div className="absolute inset-0 rounded-full border border-white/0 group-hover:border-white/20 transition-all duration-300" />
            <ArrowLeft size={14} />
          </button>
        </div>

        <div
          ref={scrollRef}
          className="overflow-y-auto pr-2"
          style={{
            maxHeight: "min(40vh, 320px)",
            overscrollBehavior: "contain",
            scrollbarWidth: "thin",
          }}
          tabIndex={0}
        >
          {loading && (
            <div className="py-10 text-center text-[12px] text-white/60 italic">buscando letra…</div>
          )}
          {!loading && notFound && (
            <div className="py-10 text-center text-[13px] text-white/75 italic leading-snug">
              Ihh essa letra eu não aprendi ainda …
            </div>
          )}
          {!loading && !notFound && lines.map((l, i) => (
            <p
              key={i}
              className="text-white/85"
              style={{ fontSize: 14, lineHeight: 1.75, minHeight: l ? undefined : 12, textAlign: "left" }}
            >
              {l}
            </p>
          ))}
        </div>

        {!loading && !notFound && lines.length > 0 && (
          <div className="mt-3 text-center text-[10px] text-white/40">
            use o scroll do mouse para navegar na letra
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
