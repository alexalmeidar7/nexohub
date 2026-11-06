import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Bell, ArrowUpFromLine, ArrowDownToLine, Database } from "lucide-react";
import { dismissStatusNotice, useActivityStatus, type StatusTone } from "@/lib/activityStatus";

const TONES: Record<StatusTone, { bg: string; border: string; color: string }> = {
  success: { bg: "#16a34a", border: "rgba(255,255,255,0.28)", color: "#ffffff" },
  error: { bg: "#dc2626", border: "rgba(255,255,255,0.28)", color: "#ffffff" },
  info: { bg: "#0055ff", border: "rgba(255,255,255,0.28)", color: "#ffffff" },
};

export default function SystemStatusChip() {
  const { notice, saving, loading } = useActivityStatus();

  useEffect(() => {
    document.body.classList.add("nexo-status-chip-on");
    return () => document.body.classList.remove("nexo-status-chip-on");
  }, []);

  let Icon = Database;
  let text = "Sincronizado";
  let tone: StatusTone | "idle" = "idle";
  let pulse = false;

  if (notice) {
    tone = notice.tone;
    text = notice.text;
    Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "error" ? AlertCircle : Bell;
  } else if (saving) {
    tone = "info";
    text = "Gravando dados…";
    Icon = ArrowUpFromLine;
    pulse = true;
  } else if (loading) {
    tone = "info";
    text = "Recebendo dados…";
    Icon = ArrowDownToLine;
    pulse = true;
  }

  const palette = tone === "idle" ? null : TONES[tone];

  const contentRef = useRef<HTMLSpanElement>(null);
  const [contentWidth, setContentWidth] = useState<number | null>(null);

  // A largura "auto" não anima em CSS; medimos o conteúdo e animamos a largura numérica.
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const measure = () => setContentWidth(Math.ceil(el.getBoundingClientRect().width));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

  return (
    <div
      data-nexo-status-chip
      role="status"
      aria-live="polite"
      onClick={notice ? dismissStatusNotice : undefined}
      title={text}
      className="hidden sm:flex min-w-0 max-w-[420px] shrink-0 items-center overflow-hidden rounded-full py-2 text-xs font-semibold"
      style={{
        width: contentWidth === null ? undefined : contentWidth + 26,
        paddingLeft: 12,
        paddingRight: 14,
        boxSizing: "border-box",
        background: palette ? palette.bg : "rgba(255,255,255,0.14)",
        border: `1px solid ${palette ? palette.border : "rgba(255,255,255,0.16)"}`,
        color: palette ? palette.color : "var(--layout-nav-text, #ffffff)",
        backdropFilter: "blur(14px)",
        cursor: notice ? "pointer" : "default",
        boxShadow: palette ? "0 4px 14px rgba(0,0,0,0.25)" : "none",
        transition:
          "width 520ms cubic-bezier(0.22, 1, 0.36, 1), background-color 300ms ease, border-color 300ms ease, box-shadow 300ms ease",
      }}
    >
      <span ref={contentRef} className="inline-flex items-center gap-2 whitespace-nowrap">
        <Icon className={`w-3.5 h-3.5 shrink-0 ${pulse ? "animate-pulse" : "opacity-80"}`} />
        <span style={{ opacity: tone === "idle" ? 0.75 : 1 }}>{text}</span>
      </span>
    </div>
  );
}
