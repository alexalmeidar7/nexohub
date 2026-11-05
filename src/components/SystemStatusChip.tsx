import { useEffect } from "react";
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

  return (
    <div
      data-nexo-status-chip
      role="status"
      aria-live="polite"
      onClick={notice ? dismissStatusNotice : undefined}
      title={text}
      className="hidden sm:flex min-w-0 w-[260px] shrink-0 items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold transition-all duration-300"
      style={{
        background: palette ? palette.bg : "rgba(255,255,255,0.14)",
        border: `1px solid ${palette ? palette.border : "rgba(255,255,255,0.16)"}`,
        color: palette ? palette.color : "var(--layout-nav-text, #ffffff)",
        backdropFilter: "blur(14px)",
        cursor: notice ? "pointer" : "default",
        boxShadow: palette ? "0 4px 14px rgba(0,0,0,0.25)" : "none",
      }}
    >
      <Icon className={`w-3.5 h-3.5 shrink-0 ${pulse ? "animate-pulse" : "opacity-80"}`} />
      <span className="truncate" style={{ opacity: tone === "idle" ? 0.75 : 1 }}>{text}</span>
    </div>
  );
}
