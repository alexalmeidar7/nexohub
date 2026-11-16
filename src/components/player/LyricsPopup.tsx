import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Music2, ArrowLeft, Loader2 } from "lucide-react";
import { PlayerBackButton } from "./PlayerBackButton";

import { playerSupabase } from "@/integrations/supabase/playerClient";

interface Props {
  open: boolean;
  artist?: string | null;
  title?: string | null;
  duration?: number;
  chatOpen?: boolean;
  onClose?: () => void;
}

function stripLrcTags(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.replace(/^\[\d{2}:\d{2}[.:]\d{2,3}\]\s*/, "").trim())
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""));
}

export default function LyricsPopup({ open, artist, title, duration, chatOpen = false, onClose }: Props) {
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

    playerSupabase.functions
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
        onClose?.();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
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
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 pointer-events-auto animate-in fade-in slide-in-from-bottom-8 duration-300"
        style={{
          width: chatOpen ? "min(360px, calc((100vw - 104px) / 2))" : "min(360px, calc(100vw - 48px))",
          marginRight: chatOpen ? "calc(40px + min(360px, calc((100vw - 104px) / 2)))" : "20px",
          padding: "22px 24px 18px",
          borderRadius: 32,
          background: "rgba(35,35,38,0.85)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          border: "1px solid rgba(255,255,255,0.06)",
          boxShadow: "0 40px 100px -20px rgba(0,0,0,0.95)",
          marginBottom: "140px",
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
          <PlayerBackButton
            onClick={onClose}
            className="w-8 h-8 focus-visible:ring-offset-2"
            iconSize={14}
            aria-label="Voltar"
          />
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
            <div className="py-10 flex flex-col items-center justify-center gap-2 text-[12px] text-white/60 italic">
              <Loader2 size={22} className="animate-spin" style={{ color: "#737982" }} aria-label="Carregando letra" />
              <span>buscando letra…</span>
            </div>
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
