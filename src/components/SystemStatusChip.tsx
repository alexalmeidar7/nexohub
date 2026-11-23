import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Bell, ArrowUpFromLine, ArrowDownToLine, Database } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { dismissStatusNotice, useActivityStatus, type StatusTone } from "@/lib/activityStatus";

const TONES: Record<StatusTone, { bg: string; border: string; color: string }> = {
  success: { bg: "#16a34a", border: "rgba(255,255,255,0.28)", color: "#ffffff" },
  error: { bg: "#dc2626", border: "rgba(255,255,255,0.28)", color: "#ffffff" },
  info: { bg: "#0055ff", border: "rgba(255,255,255,0.28)", color: "#ffffff" },
};

export default function SystemStatusChip() {
  const { notice, active, lastByOrigin } = useActivityStatus();

  useEffect(() => {
    document.body.classList.add("nexo-status-chip-on");
    return () => document.body.classList.remove("nexo-status-chip-on");
  }, []);

  let Icon = Database;
  let text = "Sem operações";
  let tone: StatusTone | "idle" = "idle";
  let pulse = false;
  const operations: string[] = [];
  if (active.online.write) operations.push("Online · Gravando");
  if (active.online.read) operations.push("Online · Lendo");
  if (active.local.write) operations.push("Local (HMD) · Gravando");
  if (active.local.read) operations.push("Local (HMD) · Lendo");

  if (notice) {
    tone = notice.tone;
    text = notice.text;
    Icon = notice.tone === "success" ? CheckCircle2 : notice.tone === "error" ? AlertCircle : Bell;
  } else if (operations.length) {
    tone = "info";
    text = operations.join("  |  ");
    Icon = active.online.write || active.local.write ? ArrowUpFromLine : ArrowDownToLine;
    pulse = true;
  }

  const palette = tone === "idle" ? null : TONES[tone];

  const showSyncTooltip = tone === "idle";
  const formatActivity = (name: string, activity: typeof lastByOrigin.online) => {
    if (!activity) return `${name}: nenhuma operação registrada`;
    return `${name}: última ${activity.operation === "read" ? "leitura" : "gravação"} às ${new Date(activity.at).toLocaleString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    })}`;
  };
  const syncLabel = [formatActivity("Online (Supabase)", lastByOrigin.online),
    formatActivity("Local no computador (não implica banco LAN compartilhado)", lastByOrigin.local)];

  const chip = (
    <div
      data-nexo-status-chip
      role="status"
      aria-live="polite"
      onClick={notice ? dismissStatusNotice : undefined}
      title={showSyncTooltip ? undefined : text}
      className="hidden sm:flex w-[220px] shrink-0 items-center overflow-hidden rounded-full py-2 text-xs font-semibold"
      style={{
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
          "background-color 300ms ease, border-color 300ms ease, box-shadow 300ms ease",
      }}
    >
      <span className="relative flex min-w-0 flex-1 items-center overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={`${tone}:${text}`}
            className="inline-flex min-w-0 w-full items-center gap-2"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.18, ease: "easeInOut" }}
          >
            <Icon className={`w-3.5 h-3.5 shrink-0 ${pulse ? "animate-pulse" : "opacity-80"}`} />
            <span className="min-w-0 truncate" style={{ opacity: tone === "idle" ? 0.75 : 1 }}>{text}</span>
          </motion.span>
        </AnimatePresence>
      </span>
    </div>
  );

  if (!showSyncTooltip) return chip;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent side="bottom">
        {syncLabel.map(label => <p key={label} className="text-xs">{label}</p>)}
      </TooltipContent>
    </Tooltip>
  );
}
